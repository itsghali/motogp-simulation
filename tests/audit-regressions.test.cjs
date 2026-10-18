const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const { runtime, config, ReferenceInference } = require("./helpers/runtime.cjs");
const configuration = require("../configuration.js");
const { Genome } = require("../genome.js");
const { SeededRandom } = require("../random.js");
const { ModelStorage: storage } = require("../model-storage.js");

function fixture() {
  const a = runtime();
  for (const file of ["race-events.js", "replay.js", "race-analytics.js", "rider-roster.js", "race-session.js", "engine-sound.js", "audio-manager.js", "commentary.js", "camera-director.js", "grand-prix.js"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), a.context);
  }
  Object.assign(a, vm.runInContext("({ GrandPrixPresentation, RaceSession, RaceEvents, ReplaySystem, CameraDirector })", a.context));
  const sim = new a.LearningSimulation(new a.Circuit(), config(), new ReferenceInference());
  const nodes = new Map(); const node = key => {
    if (!nodes.has(key)) nodes.set(key, { value: ({ laps: 3, light: 700, hold: 1200 })[key], dataset: {},
      children: [], replaceChildren() { this.children = []; }, appendChild(child) { this.children.push(child); } });
    return nodes.get(key);
  };
  a.context.document = { getElementById: () => node("controls"), createElement: () => ({}) };
  vm.runInContext("Venue = class {}", a.context);
  for (const name of ["background", "push", "pop", "translate", "scale", "noStroke", "fill", "ellipse", "textSize", "textAlign", "text"]) a.context[name] = () => {};
  a.context.CENTER = 0;
  const p = Object.create(a.GrandPrixPresentation.prototype);
  // These UI/state tests use random untrained brains. Real qualification has its own integration suite.
  p.qualifyRoster = () => ({ passed: true });
  const events = new a.RaceEvents(); let paused = false;
  Object.assign(p, { host: { simulation: () => sim, pause: value => { paused = value; }, isPaused: () => paused,
    controls: () => ({ checkboxes: { sensors: node("sensors"), checkpoints: node("checkpoints") } }) },
    events, clock: 0, settings: { inspired: false, replay: true }, get: node, hud: {}, result: node("results"),
    trainingHud: {}, camera: new a.CameraDirector(events), ghosts: new Map(), notice: {},
    audio: { resetRecording() {}, update() {}, now() {} }, commentary: { clear() {}, tick() {} },
    updateAudioStatus() {}, renderPanels() {}, drawMiniMap() {} });
  return { ...a, sim, p, node };
}

test("largeur Grand Prix indépendante, figée avec replay, sans modifier modèle ni entraînement", () => {
  const {p,sim,node} = fixture(), trainingWidth = sim.circuit.trackWidth;
  const metadata = {profileLabel:"Équilibré",config:config({trackWidth:24})};
  const before = JSON.stringify(metadata);
  p.host.raceModel = () => ({id:"chosen",name:"test",genome:sim.genomes[0],metadata});
  node("model").value="chosen"; node("track-width").value="52";
  assert.equal(p.startRace(),true);
  assert.equal(p.race.circuit.trackWidth,52); assert.equal(p.race.config.trackWidth,52);
  assert.ok(p.race.circuit.computeMaxSafeTrackWidth()>=52);
  assert.equal(p.race.replay.context.trackWidth,52); assert.match(p.notice.textContent,/Piste 52 px/);
  node("track-width").value="32"; assert.equal(p.race.circuit.trackWidth,52);
  assert.equal(sim.circuit.trackWidth,trainingWidth); assert.equal(JSON.stringify(metadata),before);
  p.setMode("training"); assert.equal(sim.circuit.trackWidth,trainingWidth);
});

test("largeur Grand Prix 100 : champ, lancement, replay et rejet hors borne sans modifier entraînement", () => {
  const { p, sim, node } = fixture(), trainingWidth = sim.circuit.trackWidth;
  const source = fs.readFileSync(path.join(__dirname, "..", "grand-prix.js"), "utf8");
  assert.match(source, /id="gp-track-width"[^>]*max="100"/);
  assert.match(source, /bords du tracé actuel peuvent se croiser/);
  p.host.raceModel = () => ({ id: "chosen", name: "test", genome: sim.genomes[0], metadata: {} });
  node("model").value = "chosen"; node("track-width").value = "100";
  assert.equal(p.startRace(), true);
  const current = p.race;
  assert.equal(current.circuit.trackWidth, 100); assert.equal(current.config.trackWidth, 100);
  assert.equal(current.replay.context.trackWidth, 100); assert.match(p.notice.textContent, /Piste 100 px/);
  assert.equal(sim.circuit.trackWidth, trainingWidth);
  node("track-width").value = "101";
  assert.equal(p.startRace(), false); assert.equal(p.race, current);
  assert.equal(current.circuit.trackWidth, 100); assert.equal(sim.circuit.trackWidth, trainingWidth);
  p.setMode("training");
});

test("modes course démarrent la présentation, changent caméra sans relancer et montrent les affectations manquantes", () => {
  for (const mode of ["race","cinematic","spectator"]) {
    const {p,sim,node}=fixture(); p.mode="training";
    node("model").value="chosen";
    p.host.raceModel=()=>({id:"chosen",name:"test",genome:sim.genomes[0],metadata:{profileLabel:"Équilibré"}});
    p.setMode(mode); assert.equal(p.mode,mode); assert.equal(p.race.phase,"INTRO");
    assert.equal(p.camera.mode, mode==="cinematic"?"CINEMATIC":mode==="spectator"?"FOLLOW_LEADER":"OVERVIEW");
    const session=p.race; p.setMode("race"); assert.equal(p.race,session);
    p.setMode("training"); assert.equal(p.race,null);
    p.host.raceModel=()=>null; p.setMode(mode);
    assert.equal(p.mode,"training"); assert.equal(node("grid").open,true); assert.match(p.notice.textContent,/Choisir un modèle/);
  }
});

test("29 réglages : bornes et pas identiques pour sauvegarde, import et restauration UI", () => {
  const values = new Map(); const local = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
  const genome = Genome.random(new SeededRandom(4));
  for (const [key, , min, max, step] of configuration.sliders) {
    const section = key in configuration.fitnessKeys ? "fitnessWeights" : ["maxSpeed", "maxForce", "acceleration", "brakingPower", "sensorRange", "noiseLevel", "grip"].includes(key) ? "vehicle" : null;
    const name = configuration.fitnessKeys[key] || key;
    for (const [value, expected] of [[min - 100, min], [max + 100, max], [min + step * 0.6, Number((min + step).toFixed(8))]]) {
      const input = section ? { [section]: { [name]: value } } : { [name]: value };
      const normalized = configuration.normalize(input);
      assert.equal(section ? normalized[section][name] : normalized[name], expected, key);
      const saved = storage.saveModel(local, genome, { config: input }, "test");
      const imported = storage.importModel(local, storage.exportModel(local, saved.id));
      assert.deepEqual(imported.metadata.config, saved.metadata.config);
    }
  }
});

test("JSON invalide : types, poids Float32 et configuration refusés sans modifier bibliothèque", () => {
  const values = new Map(); const local = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
  const model = storage.saveModel(local, Genome.random(new SeededRandom(7)), {}, "conservé");
  const before = local.getItem(storage.LIBRARY_KEY); const text = storage.exportModel(local, model.id);
  for (const bad of [null, [], "bad", { vehicle: null }, { fitnessWeights: [] }, { trackWidth: null }, { vehicle: { maxForce: "0.3" } }]) {
    const payload = JSON.parse(text); payload.metadata.config = bad;
    assert.throws(() => storage.importModel(local, JSON.stringify(payload)));
    assert.equal(local.getItem(storage.LIBRARY_KEY), before);
  }
  const payload = JSON.parse(text); payload.genome.weightsIH[0] = 1e308;
  assert.throws(() => storage.importModel(local, JSON.stringify(payload)), /Poids/);
  assert.equal(local.getItem(storage.LIBRARY_KEY), before);
});

test("lancement échoué : course précédente, drapeaux et inférence conservés ; réglages numériques vérifiés", () => {
  const a = fixture(); const { p, sim, node } = a;
  const model = { id: "one", name: "Équilibré — test", genome: sim.genomes[0], metadata: { profileLabel: "Équilibré", config: config({ trackWidth: 999, vehicle: { ...config().vehicle, maxForce: 999 } }) } };
  p.host.raceModel = () => model; node("model").value = "one";
  assert.equal(p.startRace(), true); assert.equal(p.race.config.trackWidth, 52); assert.equal(p.race.config.vehicle.maxForce, 0.18);
  const current = p.race; const listeners = p.events.listeners.size; const before = JSON.stringify(sim.inference.genomes.map(g => g.toJSON()));
  for (const [field, value] of [["laps", ""], ["laps", "3.5"], ["light", "99"], ["hold", "5001"]]) {
    const previous = node(field).value; node(field).value = value;
    assert.equal(p.startRace(), false); assert.equal(p.race, current); assert.equal(p.events.listeners.size, listeners);
    node(field).value = previous;
  }
  const pack = sim.inference.setGenomes.bind(sim.inference); let rejected = false;
  sim.inference.setGenomes = genomes => { if (!rejected) { rejected = true; throw new Error("GPU interrompu"); } pack(genomes); };
  assert.equal(p.startRace(), false); assert.match(p.notice.textContent, /GPU interrompu/);
  assert.equal(p.race, current); assert.equal(p.events.listeners.size, listeners);
  assert.equal(JSON.stringify(sim.inference.genomes.map(g => g.toJSON())), before);
});

test("replay fige réellement course, pilote et moteur d’inférence ; sortie reprend même session", () => {
  const a = fixture(); const { p, sim, node } = a;
  const race = new a.RaceSession(new a.Circuit(), config(), sim.inference, sim.genomes.slice(0, 2), p.events);
  p.race = race; race.transition("RACE"); race.circuit.draw = () => {};
  race.population.forEach(bike => { bike.show = () => {}; });
  race.replay.capture(0, race.population); race.replay.capture(1000, race.population);
  p.watchReplay(); assert.equal(node("controls").inert, true); assert.equal(node("live").hidden, false);
  const before = JSON.stringify(race.population.map(b => ({ pos: b.pos, stats: b.stats, genome: b.genome.toJSON() })));
  vm.runInContext("ReplayMotorcycle = class { displaySnapshot() {} }", a.context);
  p.draw(100, false); p.draw(100, false);
  assert.equal(race.time, 0); assert.equal(JSON.stringify(race.population.map(b => ({ pos: b.pos, stats: b.stats, genome: b.genome.toJSON() }))), before);
  p.stopReplay(); assert.equal(node("live").hidden, true); assert.equal(node("controls").inert, true);
  p.draw(20, false); assert.ok(race.time > 0); assert.equal(p.race, race);
});

test("validation périmée retirée sur nouveau modèle, échec ou reprise ; replay terminé déverrouille laboratoire", () => {
  const a = fixture(); const { p, sim, node } = a;
  p.validationSource = sim.population[0]; p.validationRun = { source: sim.population[0] };
  p.result.dataset.kind = "validation"; p.result.hidden = false;
  p.syncValidation(sim); assert.equal(p.validationRun, null); assert.equal(p.result.hidden, true);
  sim.bestGenome = sim.genomes[0].copy(); sim.startValidation();
  p.validationSource = sim.population[0]; p.validationRun = { source: sim.population[0] };
  p.syncValidation(sim); assert.ok(p.validationRun);
  sim.loadGenome(sim.bestGenome.withProfile("aggressive")); p.syncValidation(sim); assert.equal(p.validationRun, null);
  p.playback = { frames: [{ time: 0, bikes: [] }], elapsed: 1201, speed: 0.5, validation: true };
  assert.equal(p.draw(20, false), false); assert.equal(p.playback, null); assert.equal(node("controls").inert, false);
});

test("mode Debug restaure options de vue à la sortie ; pause affiche état réel", () => {
  const { p, node } = fixture(); node("sensors").checked = false; node("checkpoints").checked = false;
  p.setMode("debug"); assert.equal(node("sensors").checked, true); assert.equal(node("checkpoints").checked, true);
  p.setMode("training"); assert.equal(node("sensors").checked, false); assert.equal(node("checkpoints").checked, false);
  p.setPaused(true); assert.equal(node("pause").textContent, "Reprendre");
  p.setPaused(false); assert.equal(node("pause").textContent, "Pause");
});

test("échec partiel allocation GPU libère tous les tenseurs déjà créés", () => {
  const { GPUInferenceEngine } = require("../gpu-inference.js"); let created = 0; let disposed = 0;
  const tensor = () => { created++; if (created === 3) throw new Error("mémoire GPU"); return { dispose() { disposed++; } }; };
  const engine = new GPUInferenceEngine({ tensor3d: tensor, tensor2d: tensor });
  assert.throws(() => engine.setGenomes([Genome.random(new SeededRandom(7))]), /mémoire GPU/);
  assert.equal(disposed, 2); assert.equal(engine.tensors.length, 0); assert.equal(engine.populationSize, 0);
});

test("course puis retour Training restaure aussi pause préalable du laboratoire", () => {
  const { p, sim, node } = fixture();
  p.host.pause(true); node("model").value = "chosen";
  p.host.raceModel = () => ({ id: "chosen", name: "Équilibré — test", genome: sim.genomes[0], metadata: { profileLabel: "Équilibré" } });
  assert.equal(p.startRace(), true); assert.equal(p.host.isPaused(), false); assert.equal(node("pause").textContent, "Pause");
  assert.equal(p.startRace(), true); assert.equal(p.trainingPaused, true, "recommencer course conserve pause initiale");
  p.setMode("training"); assert.equal(p.host.isPaused(), true); assert.equal(p.trainingPaused, undefined);
  assert.equal(sim.inference.genomes[0], sim.population[0].genome);
});

test("chronomètre arrondit avant passage de minute, sans afficher 0:60.000", () => {
  const { timeText } = require("../grand-prix.js");
  assert.equal(timeText(59999.999999), "1:00.000"); assert.equal(timeText(60001), "1:00.001");
  assert.equal(timeText(22000), "0:22.000"); assert.equal(timeText(0), "—"); assert.equal(timeText(NaN), "—");
});
