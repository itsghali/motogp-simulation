const test=require("node:test"),assert=require("node:assert/strict"),vm=require("node:vm");
const {runtime,config,ReferenceInference}=require("./helpers/runtime.cjs");
const dot=(a,b)=>a.x*b.x+a.y*b.y;
function fixture(){
  const a=runtime(),frame=a.context.RaceTrackFrame;
  const sim=new a.LearningSimulation(new a.Circuit(),config(),new ReferenceInference());
  const [bike,other]=sim.population;
  const road={centerline:[{x:0,y:200},{x:1000,y:200}],nearestProjection:()=>({segment:0}),isOnTrack:()=>true};
  for(const [i,b] of [bike,other].entries()){b.id=i;b.pos.set(100,200+i*13);b.previousPosition.set(b.pos.x,b.pos.y);b.vel.set(2,2);b.heading=Math.PI/4;b.circuit=road;}
  return {...a,frame,bike,other,road,steering:vm.runInContext("RaceSteering",a.context),respond:a.context.MotorcycleAvoidance.respond};
}
test("repère : sens des segments, orthonormalité, fermeture et cap de repli",()=>{
  const {frame,context}=fixture(),circuit={centerline:[{x:0,y:0},{x:100,y:0},{x:100,y:100}],nearestProjection:()=>({segment:2})};
  const result=frame.at(circuit,context.createVector(50,50),0);
  assert.ok(result.forward.x<0&&result.forward.y<0,"segment de fermeture vers premier point");
  assert.ok(Math.abs(result.forward.mag()-1)<1e-12);assert.ok(Math.abs(result.normal.mag()-1)<1e-12);assert.ok(Math.abs(dot(result.forward,result.normal))<1e-12);
  assert.equal(result.segment,2);
  const fallback=frame.at({},context.createVector(0,0),Math.PI/2);
  assert.equal(fallback.segment,null);assert.ok(Math.abs(fallback.forward.y-1)<1e-12);
});
test("repère dégénéré : points répétés et contour entièrement nul",()=>{
  const {frame,context}=fixture(),origin=context.createVector(0,0);
  const repeated={centerline:[{x:0,y:0},{x:0,y:0},{x:0,y:10}],nearestProjection:()=>({segment:0})};
  assert.equal(frame.at(repeated,origin).forward.y,1);
  repeated.centerline[2]={x:0,y:0};
  assert.equal(frame.at(repeated,origin).segment,null);
  assert.ok(Number.isFinite(frame.at(repeated,origin).forward.x));
});
test("projection : composante arrière retirée, latérale préservée, vitesse bornée, pas d’avance inventée",()=>{
  const {frame,context}=fixture();
  for(const angle of [0,.4,Math.PI/2,Math.PI,-2]){
    const f=frame.at(null,context.createVector(0,0),angle);
    const desired=context.createVector(-3*f.forward.x+2*f.normal.x,-3*f.forward.y+2*f.normal.y);
    const before=JSON.stringify(desired),target=frame.projectDesired(desired,f,5);
    assert.ok(Math.abs(dot(target,f.forward))<1e-12);assert.ok(Math.abs(dot(target,f.normal)-2)<1e-12);
    assert.equal(JSON.stringify(desired),before);
    assert.ok(frame.projectDesired(context.createVector(100,100),f,5).mag()<=5+1e-12);
    assert.equal(frame.projectDesired(context.createVector(0,0),f,5).mag(),0);
  }
});
test("freinage conserve cap incliné à45 degrés, sans poussée normale",()=>{
  const {bike,other,respond,context}=fixture();
  bike.id=3;
  const before=JSON.stringify({pos:bike.pos,vel:bike.vel});
  const result=respond(bike,context.createVector(0,0),[other],{radius:28,strength:.6});
  assert.equal(result.mode,"brake");
  assert.ok(result.force.x<0 && result.force.y<0);
  assert.ok(Math.abs(result.force.x-result.force.y)<1e-12,"décélération sur cap proposé, pas de pivot latéral");
  assert.ok(result.force.mag()<=bike.maxforce+1e-12);
  assert.equal(JSON.stringify({pos:bike.pos,vel:bike.vel}),before);
});
test("hors interaction : aucune correction de cap imposée par segment de piste",()=>{
  const {bike,respond,context,frame}=fixture();bike.vel.set(-2,0);bike.heading=Math.PI;
  const neural=context.createVector(-.18,0),result=respond(bike,neural,[],{strength:.6});
  assert.equal(result.mode,"clear");assert.deepEqual(result.force,neural);
  assert.ok(result.force.mag()<=bike.maxforce+1e-12);
  assert.equal(bike.vel.x,-2,"aucune mutation de locomotion ou pilotage imposé");
});
test("sans menace en sens normal, ou assistance désactivée : force originale conservée",()=>{
  const {bike,steering,context}=fixture(),neural=context.createVector(.02,.03);
  assert.deepEqual(steering.compose(bike,neural,[],{separation:true,strength:.6}),neural);
  bike.vel.set(-2,0);
  assert.deepEqual(steering.compose(bike,neural,[],{separation:false,strength:.6}),neural);
  assert.deepEqual(steering.compose(bike,neural,[],{separation:true,strength:0}),neural);
});
