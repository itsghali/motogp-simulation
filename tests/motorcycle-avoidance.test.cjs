const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const {runtime,config,ReferenceInference}=require("./helpers/runtime.cjs");
function fixture(){
  const a=runtime(),sim=new a.LearningSimulation(new a.Circuit(),config(),new ReferenceInference());
  const bikes=sim.population.slice(0,3);
  bikes.forEach((b,i)=>{b.id=i;b.pos.set(100+i*100,200);b.previousPosition.set(b.pos.x,b.pos.y);b.vel.set(2,0);b.heading=0;b.circuit={isOnTrack:()=>true};});
  return {...a,bikes,respond:a.context.MotorcycleAvoidance.respond,steering:vm.runInContext("RaceSteering",a.context),body:a.context.MotorcycleBody};
}
const options={separation:true,radius:28,strength:.6};
test("moto devant : freiner sans force latérale ni vitesse désirée arrière",()=>{
  const {bikes:[b,o],respond,context}=fixture();b.vel.set(5,0);o.vel.set(1,0);
  const force=respond(b,context.createVector(.18,0),[o],options);
  assert.equal(force.mode,"brake");assert.ok(force.force.x<0);assert.equal(force.force.y,0);
  assert.ok(b.vel.x+force.force.x>=0);assert.ok(force.force.mag()<=b.maxforce+1e-9);
  b.vel.set(0,0);o.vel.set(0,0);o.pos.set(125,200);
  assert.equal(respond(b,context.createVector(.18,0),[o],options).force.mag(),0);
  assert.equal(respond(b,context.createVector(.12,.12),[o],options).force.mag(),0,"arrêt sans pivot neural latéral");
});
test("côte à côte : priorité stable et freinage sans poussée latérale",()=>{
  const {bikes:[b,o],respond,context}=fixture();o.pos.set(100,209);
  const left=respond(b,context.createVector(.08,0),[o],options),right=respond(o,context.createVector(.08,0),[b],options);
  assert.equal(left.mode,"clear");assert.equal(right.mode,"brake");
  assert.equal(left.force.y,0);assert.equal(right.force.y,0);assert.ok(right.force.x<0);
  for(const result of [left,right])assert.ok(result.force.mag()<=b.maxforce+1e-9);
});
test("pas de menace / zéro / désactivation : cerveau conservé exactement",()=>{
  const {bikes:[b,o],respond,steering,context}=fixture(),neural=context.createVector(.05,.02);
  assert.deepEqual(respond(b,neural,[o],options).force,neural);
  o.pos.set(100,209);
  assert.deepEqual(steering.compose(b,neural,[o],{...options,separation:false}),neural);
  assert.deepEqual(steering.compose(b,neural,[o],{...options,strength:0}),neural);
  o.dead=true;assert.deepEqual(respond(b,neural,[o],options).force,neural);
  o.dead=false;o.finished=true;assert.deepEqual(respond(b,neural,[o],options).force,neural);
});
test("voisins des deux côtés : aucun arrêt mutuel ni poussée vers mur",()=>{
  const {bikes:[b,o,third],respond,context}=fixture();o.pos.set(100,209);third.pos.set(100,191);
  const sandwich=respond(b,context.createVector(.18,0),[o,third],options);
  assert.equal(sandwich.mode,"clear");assert.equal(sandwich.force.x,.18);assert.equal(sandwich.force.y,0);
  b.circuit={isOnTrack:p=>p.y>=196&&p.y<=220};
  const edge=respond(b,context.createVector(.18,0),[o],options);
  assert.equal(edge.mode,"clear");assert.equal(edge.force.y,0);
  assert.ok(edge.force.mag()<=b.maxforce+1e-9);
  b.id=3;
  const yieldTo=respond(b,context.createVector(.18,0),[o,third],options);
  assert.equal(yieldTo.mode,"brake");assert.ok(yieldTo.force.x<0);assert.equal(yieldTo.force.y,0);
});
test("rattrapage réel : locomotion Vehicle, suivi sans contact sur ligne droite",()=>{
  const {bikes:[b,o],respond,body,Vehicle,context}=fixture();b.vel.set(5,0);o.vel.set(1,0);o.pos.set(250,200);
  let min=Infinity,brakes=0;
  for(let step=0;step<240;step++){
    const before=[body.snapshot(b),body.snapshot(o)],force=respond(b,context.createVector(.18,0),[before[1]],options);
    if(force.mode==="brake")brakes++;
    b.applyForce(force.force);
    for(const bike of [b,o]){bike.previousPosition.set(bike.pos.x,bike.pos.y);bike.previousHeading=bike.headingAngle();Vehicle.prototype.update.call(bike);if(bike.vel.mag()>1e-6)bike.heading=bike.vel.heading();}
    min=Math.min(min,body.gap(body.snapshot(b),body.snapshot(o)).clearance);
    assert.equal(body.sweptContact(body.snapshot(b),body.snapshot(o)),false,`step ${step}`);
    assert.ok(b.vel.x>=-1e-9);assert.ok(force.force.mag()<=b.maxforce+1e-9);
  }
  assert.ok(brakes>0);assert.ok(min>0);assert.ok(b.pos.x>300,"le suiveur continue à avancer");
});
test("insertion réelle : motos côte à côte gagnent marge longitudinale sans contact",()=>{
  const {bikes:[b,o],respond,body,Vehicle,context}=fixture();o.pos.set(100,209);
  const initial=body.gap(body.snapshot(b),body.snapshot(o)).clearance;
  for(let i=0;i<120;i++){
    const states=[body.snapshot(b),body.snapshot(o)],forces=[b,o].map(bike=>respond(bike,context.createVector(.05,0),states,options).force);
    [b,o].forEach((bike,index)=>{bike.applyForce(forces[index]);bike.previousPosition.set(bike.pos.x,bike.pos.y);bike.previousHeading=bike.headingAngle();Vehicle.prototype.update.call(bike);bike.heading=bike.vel.heading();});
    assert.equal(body.sweptContact(body.snapshot(b),body.snapshot(o)),false);
  }
  assert.ok(body.gap(body.snapshot(b),body.snapshot(o)).clearance>initial);
});
test("composition obstacle + trafic : arrêt obstacle conservé et force totale bornée",()=>{
  const {bikes:[b,o],steering,context}=fixture();b.pos.set(100,200);b.vel.set(0,0);o.pos.set(50,200);
  b.circuit={isOnTrack:p=>p.y>=195&&p.y<=205};b.raceObstacles=[{pos:{x:140,y:200},radius:25}];
  const force=steering.compose(b,context.createVector(.18,0),[o],{...options,avoidance:true,avoidanceWeight:1.5});
  assert.equal(force.mag(),0);
});
test("Grand Prix trois tours : contacts réduits et absence de contresens avec repère piste",()=>{
  function run(enabled){
    const a=runtime();
    for(const f of ["race-events.js","replay.js","race-analytics.js","race-session.js"])
      vm.runInContext(fs.readFileSync(path.join(__dirname,"..",f),"utf8"),a.context);
    const genome=a.Genome.fromJSON(JSON.parse(fs.readFileSync(path.join(__dirname,"..","equilibre.json"),"utf8")).genome);
    const race=new a.context.RaceSession(new a.Circuit(920,720,52),a.context.GrandPrixRules.configuration(),new ReferenceInference(),Array(6).fill(genome),new a.context.RaceEvents(),{laps:3,assistance:{separation:enabled}});
    race.recordReplay=false;race.transition("RACE");let contacts=0;
    for(let step=0;step<22000&&race.phase==="RACE";step++){
      race.step();contacts+=race.bodyContacts.length;
    if(enabled&&step<180)assert.ok(race.population.every(b=>!b.dead),"aucun DNF immédiat sur grille");
    if(enabled)assert.ok(race.population.every(b=>b.stats.wrongWay===0),"pas de contresens sur trois tours");
      assert.ok(race.population.every(b=>Number.isFinite(b.pos.x)&&Number.isFinite(b.pos.y)));
    }
    assert.equal(race.phase,"RESULTS");
    return {contacts,finishers:race.population.filter(b=>b.finished).length};
  }
  const off=run(false),on=run(true);
  assert.equal(off.finishers,6);
  assert.ok(on.finishers>=4,"stagnations encore possibles sans stratégie de dépassement");
  assert.ok(on.contacts<off.contacts/5,"réduction nette, pas garantie de zéro contact");
});
