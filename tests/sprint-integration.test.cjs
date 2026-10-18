const test=require("node:test"), assert=require("node:assert/strict"), fs=require("node:fs"), path=require("node:path"), vm=require("node:vm");
const {runtime,config,ReferenceInference}=require("./helpers/runtime.cjs");
function setup(options={}) {
 const a=runtime();
 for(const file of ["race-events.js","replay.js","race-analytics.js","rider-roster.js","race-session.js","engine-sound.js","audio-manager.js","commentary.js"])
  vm.runInContext(fs.readFileSync(path.join(__dirname,"..",file),"utf8"),a.context);
 Object.assign(a,vm.runInContext("({RaceSession,RaceEvents,RiderRoster,CommentaryEngine,ReplaySystem})",a.context));
 const load=name=>{const json=JSON.parse(fs.readFileSync(path.join(__dirname,"..",name),"utf8"));return a.Genome.fromJSON(json.genome);};
 const originals=[load("Jerez-equilibre.json"),load("agressif-jerez-generation-2.json")];
 const roster=a.RiderRoster.build(Array.from({length:6},(_,i)=>originals[i%2]),false);
 const events=new a.RaceEvents(), inference=new ReferenceInference();
 const race=new a.RaceSession(new a.Circuit(),config({scenarioSeconds:60}),inference,roster.map(e=>e.genome),events,{laps:1,identities:roster.map(e=>e.identity),...options});
 return {...a,race,events,inference,originals};
}
function run(race){race.transition("RACE");for(let n=0;n<4000&&race.phase==="RACE";n++)race.step();}
test("sprint 8 : course intégrée, cerveaux différents, aides, obstacles, drones, voix et replay",()=>{
 const a=setup({assistance:{separation:true,radius:18,strength:0.2,avoidance:true},obstacles:[{x:460,y:360,radius:12}],drones:{enabled:true,count:12}});
 const before=JSON.stringify(a.originals.map(g=>g.toJSON()));let spoken=[];
 const speech={getVoices:()=>[{name:"FR",lang:"fr-FR"}],cancel(){},speak(u){spoken.push(u.text);}};
 const c=new a.CommentaryEngine(a.events,{enabled:true,muted:false,commentaryMode:"dynamic",volumes:{master:1,commentary:1}},{speechSynthesis:speech,SpeechSynthesisUtterance:class{constructor(text){this.text=text;}}});
 c.now=()=>a.race.time;
 a.race.transition("RACE");
 for(let i=0;i<4000&&a.race.phase==="RACE";i++){a.race.step();c.tick(a.race.time);}
 assert.equal(a.race.phase,"RESULTS");assert.equal(a.race.summary().finishers+a.race.summary().dnf,6);
 assert.equal(a.race.drones.length,12);assert.equal(a.inference.genomes.length,6);
 assert.equal(JSON.stringify(a.originals.map(g=>g.toJSON())),before);
 assert.ok(spoken.length>0);assert.ok(a.events.history.every(e=>e.type!=="OVERTAKE"||Number.isInteger(e.passed)));
 const saved=a.race.replay.saved;assert.ok(saved.length>0);assert.equal(saved.at(-1).drones.length,12);
 assert.equal(a.race.replay.context.obstacles[0].radius,12);
 const live=JSON.stringify(a.race.population.map(b=>({p:b.pos,s:b.stats}))), drones=JSON.stringify(a.race.drones.map(d=>d.snapshot()));
 for(let t=0;t<10000;t+=100)a.race.replay.frameAt(t);
 assert.equal(JSON.stringify(a.race.population.map(b=>({p:b.pos,s:b.stats}))),live);assert.equal(JSON.stringify(a.race.drones.map(d=>d.snapshot())),drones);
});
test("sprint 8 : drones activés/désactivés ne changent aucune décision ni résultat moto",()=>{
 const a=setup(), b=setup({drones:{enabled:true,count:32}});run(a.race);run(b.race);
 const result=r=>JSON.stringify(r.population.map(v=>({pos:v.pos,vel:v.vel,stats:v.stats,race:v.race})));
 assert.equal(result(a.race),result(b.race));assert.deepEqual(JSON.parse(JSON.stringify(a.race.summary())),JSON.parse(JSON.stringify(b.race.summary())));
});
test("sprint 8 : collision produit exactement un événement CRASH, obstacle figé au départ",()=>{
 const a=setup(), b=a.race.population[0];
 const Obstacle=vm.runInContext("Obstacle",a.context);
 const spec={x:b.pos.x,y:b.pos.y,radius:5};a.race.obstacles.push(new Obstacle(b.genome,spec));spec.x=0;
 a.race.transition("RACE");a.race.step();a.race.step();
 assert.equal(b.dead,true);assert.equal(b.stats.collisions,1);assert.equal(b.stats.failureReason,"collision avec obstacle");
 assert.equal(a.events.history.filter(e=>e.type==="CRASH"&&e.id===b.id).length,1);
});

test("corps visible : obstacle sous la roue avant arrête la moto et produit un seul incident",()=>{
 const a=setup(),b=a.race.population[0],heading=b.headingAngle(),Obstacle=vm.runInContext("Obstacle",a.context);
 a.race.obstacles.push(new Obstacle(b.genome,{x:b.pos.x+Math.cos(heading)*12,y:b.pos.y+Math.sin(heading)*12,radius:2}));
 a.race.transition("RACE");a.race.step();const impact={x:b.pos.x,y:b.pos.y};a.race.step();
 assert.equal(b.dead,true);assert.equal(b.stats.failureReason,"collision avec obstacle");
 assert.equal(b.pos.x,impact.x);assert.equal(b.pos.y,impact.y);
 assert.equal(a.events.history.filter(e=>e.type==="CRASH"&&e.id===b.id).length,1);
});


test("régression réelle : même cerveau, obstacle sur sa ligne, collision sans aide / tour terminé avec aide",()=>{
 const a=setup();const circuit=new a.Circuit(920,720,44), point=a.RaceSession.poseAt(circuit,70);
 const spec={x:point.x,y:point.y,radius:6};const original=JSON.stringify(a.originals[0].toJSON());
 const results=[];
 for(const enabled of [false,true]){
  const events=new a.RaceEvents(), race=new a.RaceSession(circuit,config({scenarioSeconds:90}),new ReferenceInference(),[a.originals[0]],events,{laps:1,obstacles:[spec],assistance:{avoidance:enabled}});
  race.transition("RACE");let closest=Infinity;
  for(let step=0;step<5400&&race.phase==="RACE";step++){
   race.step();closest=Math.min(closest,Math.hypot(race.population[0].pos.x-spec.x,race.population[0].pos.y-spec.y));
  }
  results.push({bike:race.population[0],closest});race.flags.dispose();
 }
 assert.equal(results[0].bike.stats.failureReason,"collision avec obstacle");
 assert.equal(results[1].bike.finished,true);assert.equal(results[1].bike.stats.collisions,0);assert.ok(results[1].closest>10);
 assert.equal(JSON.stringify(a.originals[0].toJSON()),original);
});
