const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const {runtime,config,ReferenceInference} = require("./helpers/runtime.cjs");
function fixture() {
  const a = runtime(), geometry = a.context.MotorcycleBody;
  const body = (id,x,y,heading=0,px=x,py=y,ph=heading) => ({id,
    pos:a.context.createVector(x,y),vel:a.context.createVector(x-px,y-py),heading,
    previousPosition:a.context.createVector(px,py),previousHeading:ph,dead:false,finished:false});
  return {...a,geometry,body};
}
test("capsule : roues avant/arrière, tangence, côté et orientation",()=>{
  const {geometry:g,body:b} = fixture(), origin=b(0,0,0);
  assert.equal(g.gap(origin,b(1,24,0)).clearance,0);
  assert.equal(g.gap(origin,b(1,-24,0)).clearance,0);
  assert.ok(g.gap(origin,b(1,24.01,0)).clearance>0);
  assert.equal(g.gap(origin,b(1,0,8)).clearance,0);
  assert.ok(g.gap(origin,b(1,0,8.01)).clearance>0);
  assert.equal(g.gap(origin,b(1,0,0,Math.PI/2)).clearance,-8);
  assert.equal(g.gap(origin,b(1,0,20,Math.PI/2)).clearance,4);
  assert.ok(g.sweptContact(origin,b(1,24,0)));
  assert.equal(g.sweptContact(origin,b(1,24.01,0)),false);
});
test("perception mesure bord à bord, exclut soi/morts/arrivés, tri stable",()=>{
  const {geometry:g,body:b} = fixture(), origin=b(0,0,0), front=b(2,30,0), side=b(1,0,14);
  const dead={...b(3,0,0),dead:true},finished={...b(4,0,0),finished:true};
  const sensed=g.nearby(origin,[origin,front,side,dead,finished,b(5,100,0)],6);
  assert.deepEqual(Array.from(sensed,r=>r.other.id),[1,2]);
  assert.ok(sensed.every(r=>r.clearance===6));
  assert.equal(g.nearby(origin,[b(1,24,0)],0).length,1);
  for(const radius of [-1,NaN,Infinity]) assert.equal(g.nearby(origin,[side],radius).length,0);
});
test("balayage : croisement rapide malgré extrémités libres, symétrie et non-mutation",()=>{
  const {geometry:g,body:b}=fixture(), stationary=b(0,0,0), moving=b(1,0,100,0,0,-100);
  const before=JSON.stringify([stationary,moving]);
  assert.ok(g.gap(stationary,moving).clearance>0);
  assert.equal(g.sweptContact(stationary,moving),true);
  assert.equal(g.sweptContact(moving,stationary),true);
  assert.equal(JSON.stringify([stationary,moving]),before);
});
test("balayage synchronisé : même lieu à instants différents, pas de faux contact",()=>{
  const {geometry:g,body:b}=fixture();
  // Both sweep [-100,100], with 60 px constant separation at every instant.
  const one=b(0,100,0,0,-100,0),two=b(1,160,0,0,-40,0);
  assert.equal(g.sweptContact(one,two),false);
  assert.equal(g.sweptContact(b(0,100,0,0,-100,0),b(1,100,8.1,0,-100,8.1)),false);
});
test("rotation : contact intermédiaire et franchissement ±pi par chemin court",()=>{
  const {geometry:g,body:b}=fixture();
  const rotating=b(0,0,0,Math.PI/2,0,0,-Math.PI/2),target=b(1,15,0,Math.PI/2);
  assert.ok(g.gap(rotating,target).clearance>0);
  assert.equal(g.sweptContact(rotating,target),true);
  assert.equal(g.sweptContact(b(0,0,0,-Math.PI+.01,0,0,Math.PI-.01),b(1,0,20)),false);
});
test("snapshot possède vecteurs indépendants, historique et cap à l’arrêt",()=>{
  const {geometry:g,body:b}=fixture(), bike=b(0,2,3,1,0,1,.5);
  bike.headingAngle=()=>1;
  const snap=g.snapshot(bike);
  bike.pos.set(99,99);bike.vel.set(8,8);bike.previousPosition.set(4,4);
  assert.equal(snap.pos.x,2);assert.equal(snap.previousPosition.x,0);
  assert.equal(snap.heading,1);assert.equal(snap.previousHeading,.5);
});
test("course perçoit contacts du corps sans modifier trajectoires, forces ou décisions",()=>{
  function run(disabled) {
    const a=fixture();
    for(const f of ["race-events.js","replay.js","race-analytics.js","race-session.js"])
      vm.runInContext(fs.readFileSync(path.join(__dirname,"..",f),"utf8"),a.context);
    const {RaceSession,RaceEvents}=a.context;
    const genome=a.Genome.fromJSON(JSON.parse(fs.readFileSync(path.join(__dirname,"..","equilibre.json"),"utf8")).genome);
    const race=new RaceSession(new a.Circuit(920,720,52),config(),new ReferenceInference(),Array(6).fill(genome),new RaceEvents(),{laps:1});
    if(disabled){a.geometry.nearby=()=>[];a.geometry.sweptContact=()=>false;}
    race.transition("RACE");let contacts=0;
    for(let i=0;i<180;i++){race.step();contacts+=race.bodyContacts.length;}
    const snapshots=race.population[0].raceNeighbors;
    assert.ok(snapshots.every(s=>s.vel&&s.previousPosition&&Number.isFinite(s.heading)));
    return {contacts,state:JSON.stringify(race.population.map(b=>({pos:b.pos,vel:b.vel,stats:b.stats,decision:b.lastDecision}))),race};
  }
  const sensed=run(false),disabled=run(true);
  assert.ok(sensed.contacts>0);assert.equal(disabled.contacts,0);
  assert.equal(sensed.state,disabled.state);
  assert.ok(sensed.race.population[0].raceBodyNeighbors.length>0);
});
