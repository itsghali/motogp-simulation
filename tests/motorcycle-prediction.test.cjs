const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const {runtime,config,ReferenceInference}=require("./helpers/runtime.cjs");
function fixture(){
  const a=runtime();
  return {...a,prediction:a.context.MotorcyclePrediction,geometry:a.context.MotorcycleBody,
    body:(id,x,y,vx=0,vy=0,heading=0)=>({id,pos:a.context.createVector(x,y),vel:a.context.createVector(vx,vy),heading,dead:false,finished:false})};
}
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
test("rattrapage : temps bord à bord, vitesse relative et positions prédites",()=>{
  const {prediction:p,body:b}=fixture(),a=b(0,0,0,5),other=b(1,100,0,2);
  const before=JSON.stringify([a,other]),hit=p.impact(a,other);
  close(hit.timeToImpact,76/3);close(hit.secondsToImpact,76/180);
  assert.equal(hit.clearance,76);assert.equal(hit.relativeVelocity.x,-3);
  close(hit.otherPosition.x-hit.ownPosition.x,24);assert.equal(hit.overlapping,false);
  close(p.impact(other,a).timeToImpact,hit.timeToImpact);
  assert.equal(JSON.stringify([a,other]),before);
});
test("pas de menace : éloignement, vitesses égales, voie parallèle libre et horizon",()=>{
  const {prediction:p,body:b}=fixture(),a=b(0,0,0,5);
  assert.equal(p.impact(a,b(1,40,0,6)),null);
  assert.equal(p.impact(a,b(1,40,0,5)),null);
  assert.equal(p.impact(a,b(1,60,8.01,3)),null);
  assert.equal(p.impact(a,b(1,100,0,2),{horizon:25}),null);
  assert.equal(p.impact(a,b(1,10000,0)),null);
});
test("croisement perpendiculaire : capsules complètes, pas seulement centres",()=>{
  const {prediction:p,body:b}=fixture();
  const hit=p.impact(b(0,-50,0,5,0),b(1,0,-50,0,5,Math.PI/2));
  close(hit.timeToImpact,(50-8-8/Math.sqrt(2))/5);
  assert.ok(hit.timeToImpact<10,"contact avant coïncidence des centres");
  assert.equal(p.impact(b(0,-50,0,5),b(1,0,-150,0,5,Math.PI/2)),null);
});
test("tangence et haute vitesse : aucun trou d’échantillonnage temporel",()=>{
  const {prediction:p,body:b}=fixture();
  close(p.impact(b(0,0,0),b(1,60,8,-2)).timeToImpact,22);
  const fast=b(1,100,0,-10000),a=b(0,0,0);
  close(p.impact(a,fast).timeToImpact,.0076);
  assert.equal(p.impact(a,fast,{horizon:.0075}),null);
  close(p.impact(a,fast,{horizon:.0076}).timeToImpact,.0076);
});
test("contact immédiat, marge optionnelle, arrêt et bornes",()=>{
  const {prediction:p,body:b}=fixture(),a=b(0,0,0);
  assert.equal(p.impact(a,b(1,24,0),{horizon:0}).timeToImpact,0);
  assert.equal(p.impact(a,b(1,23,0)).overlapping,true);
  assert.equal(p.impact(a,b(1,26,0)),null);
  const marginHit=p.impact(a,b(1,26,0),{margin:2});
  assert.equal(marginHit.timeToImpact,0);assert.equal(marginHit.overlapping,false);
  assert.equal(p.impact(a,b(1,30,0),{horizon:0}),null);
  for(const options of [{horizon:-1},{horizon:NaN},{horizon:Infinity},{margin:-1},{margin:NaN}]) assert.throws(()=>p.impact(a,b(1,24,0),options));
});
test("voisinage dynamique : menace au-delà rayon28, exclusions et ordre déterministe",()=>{
  const {prediction:p,body:b}=fixture(),a=b(0,0,0,5);
  const threats=p.threats(a,[a,b(3,84,0,2),b(2,54,0,2),b(1,54,0,2),
    {...b(4,30,0),dead:true},{...b(5,30,0),finished:true}]);
  assert.deepEqual(Array.from(threats,x=>x.other.id),[1,2,3]);
  assert.ok(threats.every(x=>x.clearance>28));
  assert.equal(p.threats({...a,dead:true},[b(1,0,0)]).length,0);
});
test("angles variés : aucun contact échantillonné manqué, temps prédit sur enveloppe",()=>{
  const {prediction:p,geometry:g,body:b,SeededRandom}=fixture(),rng=new SeededRandom(2027);
  for(let i=0;i<80;i++){
    const a=b(0,0,0,rng.range(-2,2),rng.range(-2,2),rng.range(-Math.PI,Math.PI));
    const other=b(1,rng.range(-80,80),rng.range(-80,80),rng.range(-4,4),rng.range(-4,4),rng.range(-Math.PI,Math.PI));
    const hit=p.impact(a,other),pose=(v,t)=>({...v,pos:{x:v.pos.x+v.vel.x*t,y:v.pos.y+v.vel.y*t}});
    if(hit && hit.timeToImpact>0) close(g.gap(pose(a,hit.timeToImpact),pose(other,hit.timeToImpact)).clearance,0);
    for(let t=0;t<=60;t+=.5) if(g.gap(pose(a,t),pose(other,t)).clearance<=0){
      assert.ok(hit && hit.timeToImpact<=t+1e-7,`cas=${i} t=${t}`);break;
    }
  }
});
test("intégration : menaces fournies avant locomotion, décisions et trajectoires préservées",()=>{
  function run(disabled){
    const a=fixture();
    for(const f of ["race-events.js","replay.js","race-analytics.js","race-session.js"])
      vm.runInContext(fs.readFileSync(path.join(__dirname,"..",f),"utf8"),a.context);
    const genome=a.Genome.fromJSON(JSON.parse(fs.readFileSync(path.join(__dirname,"..","equilibre.json"),"utf8")).genome);
    const race=new a.context.RaceSession(new a.Circuit(920,720,52),config(),new ReferenceInference(),Array(6).fill(genome),new a.context.RaceEvents(),{laps:1});
    if(disabled)a.prediction.threats=()=>[];
    race.transition("RACE");let threats=0;
    for(let step=0;step<120;step++){
      race.step();for(const bike of race.population){
        threats+=bike.raceThreats.length;
        assert.ok(bike.raceThreats.every(t=>t.timeToImpact>=0 && t.timeToImpact<=60 && t.other.id!==bike.id));
      }
    }
    return {threats,state:JSON.stringify(race.population.map(b=>({pos:b.pos,vel:b.vel,stats:b.stats,decision:b.lastDecision})))};
  }
  const sensed=run(false),disabled=run(true);
  assert.ok(sensed.threats>0);assert.equal(disabled.threats,0);assert.equal(sensed.state,disabled.state);
});
