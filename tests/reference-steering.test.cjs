const test=require("node:test"),assert=require("node:assert/strict"),vm=require("node:vm");
const {runtime,config,ReferenceInference}=require("./helpers/runtime.cjs");
function fixture(){
  const a=runtime(),sim=new a.LearningSimulation(new a.Circuit(),config(),new ReferenceInference());
  const [bike,other,third]=sim.population;
  for(const [id,b] of [bike,other,third].entries()){
    b.id=id;b.maxspeed=5.5;b.pos.set(100,200);b.previousPosition.set(100,200);b.heading=0;b.vel.set(2,0);b.circuit={isOnTrack:()=>true};
  }
  return {...a,bike,other,third,reference:a.context.ReferenceSteering,steering:vm.runInContext("RaceSteering",a.context)};
}
test("référence5-3 : ahead à30 pas, ahead2 àmi-distance, anticipation freinage et arrêt",()=>{
  const {bike:b,reference:r}=fixture();
  let probes=r.anticipation(b,45);
  assert.equal(probes.reach,60);assert.equal(probes.ahead.x,160);assert.equal(probes.ahead2.x,130);
  assert.equal(probes.ahead.y,200);
  b.vel.set(5.5,0);b.maxforce=.02;probes=r.anticipation(b,45);
  assert.equal(probes.reach,811.25,"portée agrandie pour freinage borné");
  b.vel.set(0,0);probes=r.anticipation(b,45,{x:0,y:1});
  assert.equal(probes.ahead.y,245);assert.equal(probes.ahead2.y,222.5);
});
test("référence5-3 : deux sondes et corridor ne ratent pas petit obstacle entre sondes",()=>{
  const {bike:b,steering:s}=fixture(),obstacle={pos:{x:145,y:200},radius:2};
  const result=s.avoidance(b,[obstacle],45);
  assert.ok(Math.hypot(result.probes.ahead.x-145,result.probes.ahead.y-200)>12);
  assert.ok(Math.hypot(result.probes.ahead2.x-145,result.probes.ahead2.y-200)>12);
  assert.equal(result.state.obstacle,obstacle);assert.ok(result.force.mag()<=b.maxforce+1e-9);
  for(const x of [130,160])assert.ok(s.avoidance(b,[{pos:{x,y:200},radius:2}]).state);
});
test("obstacle pertinent choisi malgré voisin latéral plus proche, liste vide et derrière",()=>{
  const {bike:b,steering:s}=fixture(),lateral={pos:{x:110,y:230},radius:2},ahead={pos:{x:155,y:200},radius:4};
  assert.equal(s.avoidance(b,[lateral,ahead]).state.obstacle,ahead);
  assert.equal(s.avoidance(b,[]).force.mag(),0);
  assert.equal(s.avoidance(b,[{pos:{x:30,y:200},radius:4}]).state,null);
});
test("référence5-3 : séparation inverse-distance, exclusions, superposition et limites",()=>{
  const {bike:b,other:o,third:t,reference:r,steering:s}=fixture();b.vel.set(0,0);o.pos.set(110,200);t.pos.set(80,200);
  assert.ok(r.separation(b,[o,t],30).force.x<0,"voisin à10 domine voisin à20");
  assert.equal(r.separation(b,[],30).force.mag(),0);
  assert.equal(r.separation(b,[o],5).force.mag(),0);
  o.dead=true;assert.equal(r.separation(b,[b,o],30).force.mag(),0);o.dead=false;o.finished=true;
  assert.equal(r.separation(b,[o],30).force.mag(),0);o.finished=false;o.pos.set(100,200);
  const force=s.separation(b,[o],30);assert.ok(force.x<0);assert.ok(force.mag()<=b.maxforce+1e-9);
  assert.ok(r.separation(o,[b],30).force.x>0,"superposition départagée par identifiant");
});
test("référence5-3 : headway rampe linéaire bord àbord et freinage sans accélération",()=>{
  const {bike:b,other:o,reference:r}=fixture();b.vel.set(5,0);o.vel.set(0,0);o.pos.set(157,200);
  let result=r.headway(b,[o],{distance:60});
  assert.equal(result.clearance,33);assert.equal(result.speedLimit,2.75);assert.equal(result.desiredVelocity.x,2.75);
  assert.ok(result.force.x<0);assert.ok(Math.abs(result.force.y)<1e-9);assert.ok(result.force.mag()<=b.maxforce+1e-9);
  o.vel.set(2,0);result=r.headway(b,[o],{distance:60});assert.equal(result.speedLimit,4.75);
  b.vel.set(1,0);assert.equal(r.headway(b,[o],{distance:60}).force.mag(),0,"pas de gaz ajoutés par freinage");
  b.vel.set(0,0);o.vel.set(0,0);o.pos.set(125,200);result=r.headway(b,[o],{distance:28});
  assert.equal(result.speedLimit,0);assert.equal(result.force.mag(),0,"arrêt sans marche arrière");
});
test("headway : voisins derrière/latéraux/lointains, morts et arrivés ignorés",()=>{
  const {bike:b,other:o,reference:r}=fixture();
  for(const [x,y] of [[60,200],[130,220],[300,200]]){
    o.pos.set(x,y);assert.equal(r.headway(b,[o],{distance:60}).leader,null);
  }
  o.pos.set(130,200);o.dead=true;assert.equal(r.headway(b,[o]).leader,null);
  o.dead=false;o.finished=true;assert.equal(r.headway(b,[o]).leader,null);
});
test("composition consomme anticipation et anticollision commune, zéro désactive exactement",()=>{
  const {bike:b,other:o,reference:r,steering:s,context}=fixture(),counts={anticipation:0,traffic:0};
  const anticipation=r.anticipation,traffic=context.MotorcycleAvoidance.respond;
  r.anticipation=(...args)=>{counts.anticipation++;return anticipation(...args);};
  context.MotorcycleAvoidance.respond=(...args)=>{counts.traffic++;return traffic(...args);};
  o.pos.set(100,209);b.raceObstacles=[];
  const neural=context.createVector(.05,0),options={avoidance:true,separation:true,radius:28,strength:.6};
  const force=s.compose(b,neural,[o],options);
  assert.ok(force.mag()<=b.maxforce+1e-9);assert.ok(b.raceObstacleProbes.ahead);
  assert.ok(Object.values(counts).every(n=>n>0));
  const before=JSON.stringify(counts);
  assert.deepEqual(s.compose(b,neural,[o],{...options,separation:false,avoidance:false}),neural);
  assert.equal(b.raceObstacleProbes,null);assert.equal(JSON.stringify(counts),before);
});
test("modules indépendants ne mutent pas position/vitesse/accélération des sources",()=>{
  const {bike:b,other:o,reference:r,context}=fixture();o.pos.set(130,200);
  const state=()=>JSON.stringify([b,o].map(v=>({pos:v.pos,vel:v.vel,acc:v.acc,genome:v.genome.toJSON()}))),before=state();
  r.anticipation(b);r.separation(b,[o],40);r.headway(b,[o],{distance:40});
  context.MotorcycleAvoidance.respond(b,context.createVector(.1,0),[o],{radius:28,strength:.6});
  assert.equal(state(),before);
});
