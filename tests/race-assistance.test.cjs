const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const {runtime, config, ReferenceInference} = require("./helpers/runtime.cjs");
function fixture() {
  const a = runtime(); const steering = vm.runInContext("RaceSteering", a.context);
  const sim = new a.LearningSimulation(new a.Circuit(), config(), new ReferenceInference());
  const [bike, other] = sim.population; bike.pos.set(50, 50); bike.vel.set(0, 0); other.pos.set(55, 50);
  return {...a, steering, bike, other};
}
test("sprint 3 : proche, loin, absent, éliminé, arrivé et superposition déterministe", () => {
  const {steering: s, bike: b, other: o} = fixture();
  assert.ok(s.separation(b, [o], 20).x < 0);
  assert.equal(s.separation(b, [o], 5).mag(), 0);
  assert.equal(s.separation(b, [], 20).mag(), 0);
  o.dead = true; assert.equal(s.separation(b, [o], 20).mag(), 0);
  o.dead = false; o.finished = true; assert.equal(s.separation(b, [o], 20).mag(), 0);
  o.finished = false; o.pos.set(50, 50);
  assert.ok(s.separation(b, [o], 20).x < 0); assert.ok(s.separation(o, [b], 20).x > 0);
  assert.equal(s.separation(b, [o], 20).y, 0);
});
test("sprint 3 : somme bornée, désactivation exacte, un seul pas de locomotion", () => {
  const {steering: s, bike: b, other: o, context} = fixture();
  const neural = b.steeringForce(b.decide(Array(9).fill(0.4)));
  assert.ok(s.compose(b, neural, [o], {separation: true, radius: 20, strength: 100}).mag() <= b.maxforce + 1e-9);
  assert.deepEqual(s.compose(b, neural, [o], {separation: false}), neural);
  const inputs = b.perceive(), output = b.genome.predict(inputs); b.raceAssistance = {separation: true, radius: 20, strength: 1}; b.raceNeighbors = [o];
  vm.runInContext("globalThis.updateCount=0; const originalUpdate=Vehicle.prototype.update; Vehicle.prototype.update=function(){ updateCount++; return originalUpdate.call(this); }", context);
  b.step(16, output, inputs); assert.equal(context.updateCount, 1);
});


test("sprint 4 : anticipation vide, devant/derrière, latéral/loin, proche et multiple", () => {
  const {steering: s, bike: b} = fixture(); b.heading = 0;
  const obstacle = (x, y, radius = 5) => ({pos: {x, y}, radius});
  assert.equal(s.avoidance(b, []).force.mag(), 0);
  assert.ok(s.avoidance(b, [obstacle(80, 50)]).force.y > 0);
  for (const o of [obstacle(20, 50), obstacle(80, 80), obstacle(200, 50)]) assert.equal(s.avoidance(b, [o]).force.mag(), 0);
  const danger = s.avoidance(b, [obstacle(51, 50)]); assert.equal(danger.immediate, true); assert.ok(danger.force.x < 0);
  const multiple = s.avoidance(b, [obstacle(80, 50), obstacle(55, 51)]); assert.equal(multiple.immediate, true);
  assert.ok(Number.isFinite(s.avoidance(b, [obstacle(50, 50)]).force.mag()));
  b.raceObstacles = [obstacle(51, 50)];
  const final = s.compose(b, b.vel.copy(), [], {avoidance:true, avoidanceWeight:5});
  assert.ok(final.x < 0 && final.mag() <= b.maxforce + 1e-9);
});
test("sprint 4 : collision segment balayé, tangente, obstacle Vehicle et copie indépendante", () => {
  const {steering:s, bike:b, context, Vehicle} = fixture();
  b.heading = 0;
  const Obstacle = vm.runInContext("Obstacle", context); const spec = {x:50,y:50,radius:5};
  const o = new Obstacle(b.genome, spec); assert.ok(o instanceof Vehicle); spec.radius=60; assert.equal(o.radius,5);
  b.previousPosition.set(20,50); b.pos.set(80,50); assert.equal(s.collision(b,o),true);
  b.previousPosition.set(20,59); b.pos.set(80,59); assert.equal(s.collision(b,o),true);
  b.previousPosition.set(20,60); b.pos.set(80,60); assert.equal(s.collision(b,o),false);
  assert.throws(()=>new Obstacle(b.genome,{x:NaN,y:1,radius:5}));
});

test("obstacle : roues avant/arrière, mouvement rapide et rotation couverts par le corps balayé", () => {
  const {steering:s,bike:b} = fixture(); b.heading = 0; b.previousHeading = 0;
  b.previousPosition.set(50,50); b.pos.set(50,50);
  const obstacle = (x,y) => ({pos:{x,y},radius:2});
  assert.equal(s.collision(b,obstacle(63,50)),true,"roue avant même à l’arrêt");
  assert.equal(s.collision(b,obstacle(37,50)),true,"roue arrière");
  assert.equal(s.collision(b,obstacle(65,50)),false);
  assert.equal(s.collision(b,obstacle(50,57)),false,"pas de grand cercle latéral artificiel");
  b.previousPosition.set(50,10); b.pos.set(50,90);
  assert.equal(s.collision(b,obstacle(57,50)),true,"balayage transversal entre deux images");
  b.previousPosition.set(50,50); b.pos.set(50,50); b.heading=Math.PI/2;
  assert.equal(s.collision(b,obstacle(55,55)),true,"rotation sur place");
});


test("sprint 5 : boids distincts, sans voisin, perception, superposition et confinement", () => {
  const {context, bike:b, other:o} = fixture(); const s = vm.runInContext("DroneSteering",context);
  b.vel.set(0,0); o.vel.set(0,1);
  assert.equal(s.alignment(b,[],30).mag(),0); assert.equal(s.cohesion(b,[],30).mag(),0);
  assert.ok(s.alignment(b,[o],30).y>0); assert.ok(s.cohesion(b,[o],30).x>0); assert.ok(s.separation(b,[o],30).x<0);
  o.pos.set(80,50); assert.equal(s.cohesion(b,[o],30).mag(),0);
  o.pos.set(50,50); assert.ok(Number.isFinite(s.separation(b,[o],30).mag()));
  b.pos.set(0,0); const boundary=s.confinement(b); assert.ok(boundary.x>0 && boundary.y>0);
  assert.ok(s.compose(b,[o],{radius:100,separation:5,alignment:5,cohesion:5}).mag()<=b.maxforce+1e-9);
});
test("sprint 5 : drones reproductibles, Vehicle, locomotion héritée et coût borné 32", () => {
  const {context, bike, SeededRandom, Vehicle} = fixture(); const Drone=vm.runInContext("Drone",context), s=vm.runInContext("DroneSteering",context);
  const make=()=>{const random=new SeededRandom(2027);return Array.from({length:32},(_,i)=>new Drone(bike.genome,i,random));};
  const flock=make(), copy=make(); assert.deepEqual(flock.map(d=>d.snapshot()),copy.map(d=>d.snapshot()));
  const start=performance.now();
  for(let step=0;step<600;step++) {
    const states=flock.map(d=>({id:d.id,pos:d.pos.copy(),vel:d.vel.copy()}));
    const forces=flock.map(d=>s.compose(d,states,{radius:100,separation:1.5,alignment:1,cohesion:0.7}));
    flock.forEach((d,i)=>{assert.ok(d instanceof Vehicle);assert.ok(forces[i].mag()<=d.maxforce+1e-9);d.step(forces[i]);});
  }
  console.log(`Drones 32 × 600 pas : ${(performance.now()-start).toFixed(1)} ms (test numérique CPU)`);
  assert.ok(flock.every(d=>Number.isFinite(d.pos.x)&&Number.isFinite(d.pos.y)));
});


test("régression évitement : vrais pas Vehicle, cerveau opposé, 2 et 5,5 px/pas, passage sans collision",()=>{
 for(const speed of [2,5.5]) {
  const {steering:s,bike:b,Vehicle,context}=fixture();b.pos.set(100,200);b.vel.set(speed,0);b.maxspeed=speed;b.heading=0;
  b.circuit={isOnTrack:p=>p.y>=178&&p.y<=222};const obstacle={pos:{x:190,y:200},radius:10};b.raceObstacles=[obstacle];
  let minimum=Infinity;
  for(let i=0;i<400&&b.pos.x<220;i++) {
   const neural=s.desired(b,context.createVector(1,0));
   const force=s.compose(b,neural,[],{avoidance:true,avoidanceWeight:1.5,lookahead:45});
   assert.ok(force.mag()<=b.maxforce+1e-9);b.previousPosition.set(b.pos.x,b.pos.y);b.applyForce(force);Vehicle.prototype.update.call(b);b.heading=b.vel.heading();
   minimum=Math.min(minimum,s.segmentDistance(obstacle.pos,b.previousPosition,b.pos));assert.equal(s.collision(b,obstacle),false,`speed=${speed}, x=${b.pos.x}`);
   assert.ok(b.circuit.isOnTrack(b.pos),"le centre du véhicule reste sur la chaussée");
  }
  assert.ok(b.pos.x>=220,"obstacle réellement dépassé, pas seulement force non nulle");assert.ok(minimum>14);
 }
});
test("régression évitement : côté stable, piste fermée d’un côté, derrière et blocage complet",()=>{
 const {steering:s,bike:b,context}=fixture();b.pos.set(100,200);b.vel.set(2,0);b.heading=0;
 const obstacle={pos:{x:155,y:200},radius:8};
 const road={isOnTrack:p=>p.y>=178&&p.y<=205};
 let result=s.avoidance(b,[obstacle],45,null,road);assert.equal(result.state.sign,-1,"passe côté intérieur praticable");
 b.heading=0.4;b.vel.set(1.8,0.7);const next=s.avoidance(b,[obstacle],45,result.state,road);assert.equal(next.state.sign,result.state.sign);assert.equal(next.state.forward,result.state.forward);
 b.pos.set(200,200);b.vel.set(2,0);b.heading=0;assert.equal(s.avoidance(b,[obstacle],45,null,road).force.mag(),0);
 b.pos.set(100,200);b.vel.set(0,0);b.circuit=road;b.raceObstacles=[{pos:{x:140,y:200},radius:25}];
 const blocked=s.compose(b,context.createVector(0.18,0),[],{avoidance:true,avoidanceWeight:1.5,lookahead:45});
 assert.equal(blocked.mag(),0,"freinage prioritaire même à l’arrêt : le cerveau ne relance pas dans un passage bloqué");
});
test("régression séparation : arrêt devant moto immobile sans marche arrière, zéro désactive",()=>{
 const {steering:s,bike:b,other:o,context}=fixture();b.vel.set(0,0);b.heading=0;o.vel.set(0,0);o.heading=0;o.pos.set(b.pos.x+25,b.pos.y);
 const neural=context.createVector(b.maxforce,0);
 assert.equal(s.compose(b,neural,[o],{separation:true,radius:28,strength:0.6}).mag(),0);
 assert.deepEqual(s.compose(b,neural,[o],{separation:true,radius:28,strength:0}),neural);
 b.raceObstacles=[{pos:{x:b.pos.x+30,y:b.pos.y},radius:5}];
 assert.deepEqual(s.compose(b,neural,[],{avoidance:false}),neural);
 assert.deepEqual(s.compose(b,neural,[],{avoidance:true,avoidanceWeight:0}),neural);
});


test("régression évitement : conserver allure d’approche, sans accélérer vers maxspeed",()=>{
 const {steering:s,bike:b,context}=fixture();b.pos.set(100,200);b.vel.set(2,0);b.maxspeed=5.5;b.heading=0;
 const obstacle={pos:{x:160,y:200},radius:6};let result=s.avoidance(b,[obstacle]);assert.equal(result.state.cruiseSpeed,2);
 b.pos.set(155,188.5);b.vel.set(1,0);result=s.avoidance(b,[obstacle],45,result.state);
 assert.equal(result.state.cruiseSpeed,2);const desired=context.createVector(b.vel.x+result.force.x,b.vel.y+result.force.y);
 assert.ok(desired.mag()<=2+1e-9);assert.ok(result.force.mag()<=b.maxforce+1e-9);
});
