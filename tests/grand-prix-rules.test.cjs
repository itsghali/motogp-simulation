const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const { runtime, ReferenceInference } = require("./helpers/runtime.cjs");
function fixture() {
  const a = runtime();
  for (const file of ["race-events.js", "replay.js", "race-analytics.js", "rider-roster.js", "race-session.js", "grand-prix.js"])
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), a.context);
  Object.assign(a, vm.runInContext("({GrandPrixRules, RaceSession, RaceEvents, GrandPrixPresentation})", a.context));
  a.load = file => a.Genome.fromJSON(JSON.parse(fs.readFileSync(path.join(__dirname, "..", file), "utf8")).genome);
  return a;
}
test("règlement indépendant des JSON, copies isolées, largeur bornée", () => {
  const a = fixture(), one = a.GrandPrixRules.configuration(), two = a.GrandPrixRules.configuration();
  one.vehicle.maxSpeed = 99;
  assert.equal(two.vehicle.maxSpeed, 5.5); assert.equal(two.vehicle.maxForce, 0.18);
  assert.equal(two.trackWidth, 52); assert.equal(a.GrandPrixRules.configuration(24).trackWidth, 24);
  for (const width of [54, 80, 100]) assert.equal(a.GrandPrixRules.configuration(width).trackWidth, width);
  for (const width of [NaN, Infinity, 23, 100.01, 101, "52"]) assert.throws(() => a.GrandPrixRules.configuration(width));
});
test("six cerveaux équilibrés homologués sur trois tours et 63 checkpoints, sources et GPU isolés", () => {
  const a = fixture(), genomes = Array.from({length:6}, () => a.load("equilibre.json"));
  const before = JSON.stringify(genomes.map(g => g.toJSON()));
  const inference = new ReferenceInference(); inference.setGenomes(genomes);
  const report = a.GrandPrixRules.qualify(a.GrandPrixRules.configuration(), genomes);
  assert.equal(report.passed, true);
  assert.ok(report.riders.every(r => r.passed && r.laps === 3 && r.checkpoints === 63));
  assert.equal(JSON.stringify(genomes.map(g => g.toJSON())), before); assert.equal(inference.genomes, genomes);
});
test("homologation mixte détecte incompatibilité sans croire validated du JSON", () => {
  const a = fixture(), files = ["equilibre.json", "agressif.json", "agressif-jerez-generation-2.json", "prudent.json", "freinage_tardif.json", "trajectoire_reguliere.json"];
  const report = a.GrandPrixRules.qualify(a.GrandPrixRules.configuration(), files.map(a.load));
  assert.equal(report.passed, false);
  assert.ok(report.riders.some(r => !r.passed && r.reason));
  assert.equal(report.riders[0].passed, true);
});
test("cache invalidé par poids, traits, ordre ou largeur, refus avant toucher course/GPU", () => {
  const a = fixture(), p = Object.create(a.GrandPrixPresentation.prototype);
  const genomes = [a.load("equilibre.json"), a.load("agressif.json")];
  const original = a.GrandPrixRules.qualify; let calls = 0;
  a.GrandPrixRules.qualify = () => { calls++; return {passed:true}; };
  const cfg = a.GrandPrixRules.configuration();
  p.qualifyRoster(cfg, genomes); p.qualifyRoster(cfg, genomes); assert.equal(calls, 1);
  p.qualifyRoster(cfg, [...genomes].reverse()); assert.equal(calls, 2);
  genomes[0].weightsIH[0] += .1; p.qualifyRoster(cfg, genomes); assert.equal(calls, 3);
  genomes[0].traits.direction += .01; p.qualifyRoster(cfg, genomes); assert.equal(calls, 4);
  p.qualifyRoster(a.GrandPrixRules.configuration(44), genomes); assert.equal(calls, 5);
  a.GrandPrixRules.qualify = original;
  const nodes = new Map(), get = key => { if (!nodes.has(key)) nodes.set(key, {value:({laps:3,light:700,hold:1200,model:"chosen"})[key]}); return nodes.get(key); };
  const current = {}, inference = {setGenomes(){throw new Error("ne doit pas toucher GPU");}};
  Object.assign(p, {race:current, notice:{}, settings:{inspired:false}, get,
    host:{simulation:()=>({inference}),raceModel:()=>({id:"chosen",name:"incompatible",genome:genomes[0],metadata:{validated:true}})},
    qualifyRoster:()=>({passed:false,riders:[{id:0,passed:false,reason:"mauvais sens"}]})});
  assert.equal(p.startRace(), false); assert.equal(p.race, current);
  assert.match(p.notice.textContent, /Homologation Grand Prix refusée.*pilote 1.*mauvais sens/);
});
test("changer premier pilote conserve physique et respecte poids de chaque affectation", () => {
  const a = fixture(), p = Object.create(a.GrandPrixPresentation.prototype);
  const sources = ["equilibre.json", "agressif-jerez-generation-2.json"].map((file, id) => ({
    id:String(id), name:file, genome:a.load(file), metadata:JSON.parse(fs.readFileSync(path.join(__dirname, "..", file), "utf8")).metadata
  }));
  const before = JSON.stringify(sources.map(s => ({genome:s.genome.toJSON(),metadata:s.metadata})));
  const inference = new ReferenceInference();
  const nodes = new Map(), get = key => { if (!nodes.has(key)) nodes.set(key, {value:({laps:3,light:700,hold:1200})[key]}); return nodes.get(key); };
  a.context.document = {getElementById:()=>({})}; vm.runInContext("Venue = class {}", a.context);
  const qualifications = [];
  Object.assign(p, {settings:{inspired:false},get,notice:{},events:new a.RaceEvents(),
    host:{simulation:()=>({inference}),raceModel:id=>sources[Number(id)],pause(){}},
    // This test isolates configuration ownership. The preceding tests run real qualification.
    qualifyRoster:(config, genomes)=>{qualifications.push(JSON.stringify(config));return {passed:true};},
    audio:{resetRecording(){}},commentary:{clear(){}},camera:{},ghosts:new Map(),result:{},trainingHud:{},hud:{}});
  for (const first of ["0","1"]) {
    p.assignments = Array.from({length:6},(_,i)=>String((Number(first)+i)%2));
    assert.equal(p.startRace(), true);
    assert.equal(p.race.config.vehicle.maxSpeed,5.5); assert.equal(p.race.config.vehicle.maxForce,.18);
    assert.ok(p.race.population.every(b=>b.parameters.maxSpeed===5.5 && b.parameters.maxForce===.18));
    p.race.population.forEach((b,i)=>assert.equal(JSON.stringify(b.genome.toJSON()),JSON.stringify(sources[Number(p.assignments[i])].genome.toJSON())));
    assert.equal(p.race.population[0].age,0,"homologation ne fait pas avancer course visible");
    assert.equal(p.race.time,0);
  }
  assert.equal(qualifications[0],qualifications[1]);
  assert.equal(JSON.stringify(sources.map(s=>({genome:s.genome.toJSON(),metadata:s.metadata}))),before);
});
