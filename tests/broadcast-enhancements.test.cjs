const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");
const { runtime, config, ReferenceInference } = require("./helpers/runtime.cjs");
function api() {
  const a = runtime();
  for (const file of ["race-events.js", "replay.js", "race-analytics.js", "rider-roster.js", "race-session.js", "engine-sound.js", "audio-manager.js", "commentary.js", "camera-director.js", "venue.js", "grand-prix.js"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), a.context, { filename: file });
  }
  Object.assign(a, vm.runInContext("({ RaceEvents, RaceSession, RiderRoster, EngineSound, AudioManager, CommentaryEngine, CameraDirector, Venue, GrandPrixPresentation })", a.context));
  // Isolate presentation tests using random brains from the real three-lap homologation suite.
  a.GrandPrixPresentation.prototype.qualifyRoster = () => ({ passed: true });
  return a;
}
function parameter() { return { value: 0, setTargetAtTime(v) { this.value = v; }, setValueAtTime(v) { this.value = v; }, exponentialRampToValueAtTime(v) { this.value = v; } }; }

test("vider bibliothèque efface six affectations, préserve course/replay et affiche les erreurs de stockage", () => {
  const a = api(), prototype = a.GrandPrixPresentation.prototype;
  const nodes = { "restore-models": {}, model: { value: "ancien" } };
  const race = {}, playback = {}; let models = [{ id: "ancien" }];
  const view = { assignments: Array(6).fill("ancien"), race, playback, notice: {},
    host: { clearModels() { const count = models.length; models = []; return count; }, raceModels: () => models, hasModelRecovery: () => true },
    get: key => nodes[key], setModels(value) { this.models = value; nodes.model.value = ""; } };
  prototype.changeModelLibrary.call(view, "clearModels");
  assert.deepEqual(view.assignments, Array(6).fill("")); assert.deepEqual(view.models, []);
  assert.equal(view.race, race); assert.equal(view.playback, playback);
  assert.equal(nodes["restore-models"].hidden, false); assert.match(view.notice.textContent, /1 modèles retirés/);
  view.assignments.fill("gardé"); view.host.clearModels = () => { throw new Error("quota"); };
  prototype.changeModelLibrary.call(view, "clearModels");
  assert.deepEqual(view.assignments, Array(6).fill("gardé")); assert.match(view.notice.textContent, /inchangée : quota/);
});
test("restaurer montre le modèle récupéré et masque le bouton après succès ou rechargement", () => {
  const a = api();
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../model-storage.js"), "utf8"), a.context);
  const data = new Map(), local = { getItem: key => data.get(key) || null, setItem: (key, value) => data.set(key, value) };
  const storage = a.context.ModelStorage;
  const saved = storage.saveModel(local, a.Genome.random(new a.SeededRandom(12)), {}, "à récupérer");
  storage.clearModels(local);
  const nodes = new Map(), get = key => {
    if (!nodes.has(key)) nodes.set(key, { value: "", children: [], replaceChildren() { this.children = []; }, appendChild(node) { this.children.push(node); } });
    return nodes.get(key);
  };
  a.context.document = { createElement: () => ({}) };
  const p = Object.create(a.GrandPrixPresentation.prototype);
  Object.assign(p, { get, notice: {}, renderAssignments() {},
    host: { raceModels: () => storage.listModels(local), restoreModels: () => storage.restoreModels(local), hasModelRecovery: () => storage.hasRecovery(local) } });
  p.setModels([]); assert.equal(get("restore-models").hidden, false);
  p.changeModelLibrary("restoreModels");
  assert.equal(get("model").value, saved.id, "modèle restauré visible immédiatement");
  assert.equal(get("restore-models").hidden, true, "aucune seconde restauration trompeuse");
  assert.match(p.notice.textContent, /1 modèles restaurés/);
  p.setModels(storage.listModels(local)); assert.equal(get("restore-models").hidden, true);
  assert.equal(JSON.stringify(storage.loadModel(local, saved.id).genome.toJSON()), JSON.stringify(saved.genome));
  storage.clearModels(local);
  storage.importModel(local, JSON.stringify(saved));
  const imported = JSON.parse(local.getItem(storage.LIBRARY_KEY)); imported.models[0].id = "recent-import";
  local.setItem(storage.LIBRARY_KEY, JSON.stringify(imported));
  p.host.savedModelRecoveryCount = () => storage.savedModelRecoveryCount(local);
  p.host.recoverSavedModels = () => storage.recoverSavedModels(local);
  p.setModels(storage.listModels(local)); assert.equal(get("restore-saved-models").hidden, false);
  p.changeModelLibrary("recoverSavedModels");
  assert.equal(get("model").value, saved.id);
  assert.equal(p.models.length, 2); assert.equal(get("restore-saved-models").hidden, true);
  assert.match(p.notice.textContent, /1 sauvegardes du site récupérées/);
});
class AudioContextDouble {
  constructor() { this.destination = {}; this.currentTime = 0; this.sampleRate = 100; this.state = "running"; this.oscillators = []; this.sources = []; }
  async resume() { this.state = "running"; }
  node() { return { connections: [], connect(node) { this.connections.push(node); }, disconnect() { this.connections = []; } }; }
  createGain() { return { ...this.node(), gain: parameter() }; }
  createOscillator() { const n = { ...this.node(), frequency: parameter(), start() {}, stop() {} }; this.oscillators.push(n); return n; }
  createBiquadFilter() { return { ...this.node(), frequency: parameter() }; }
  createBuffer() { return { getChannelData: () => new Float32Array(200) }; }
  createBufferSource() { return { ...this.node(), start() {} }; }
  createMediaElementSource(track) { const n = { ...this.node(), track }; this.sources.push(n); return n; }
}
class AudioDouble {
  constructor(url) { this.src = url; this.paused = true; this.ended = false; this.currentTime = 0; this.listeners = {}; this.playCount = 0; }
  addEventListener(event, fn) { this.listeners[event] = fn; }
  pause() { this.paused = true; }
  async play() { this.playCount++; this.paused = false; if (this.playImplementation) return this.playImplementation(); }
}
const flush = () => new Promise(resolve => setImmediate(resolve));
async function audioFixture() {
  const a = api();
  const audio = new a.AudioManager({ AudioContext: AudioContextDouble, Audio: AudioDouble });
  audio.loadCommentary("assets/motogp_audio.mp3"); assert.equal(await audio.enable(), true);
  return { ...a, audio };
}
function bike(a, id = 0, speed = 0) {
  const genome = a.Genome.random(new a.SeededRandom(2027));
  const result = new a.Motorcycle(genome, new a.Circuit(), new a.ScenarioFactory().createSet(1)[0], config().vehicle, id);
  result.vel.set(speed, 0); return result;
}
test("moteur : régime croît avec vitesse/gaz, freinage et distance atténuent sans muter la moto", () => {
  const a = api(); const b = bike(a); const baseline = JSON.stringify(b.genome.toJSON());
  const idle = a.EngineSound.parameters(b); b.vel.set(b.maxspeed, 0); b.lastDecision = { throttle: 1, braking: 0 };
  const full = a.EngineSound.parameters(b); assert.ok(full.frequency > idle.frequency * 2); assert.ok(full.amplitude > idle.amplitude);
  assert.ok(full.frequency < 1000); b.lastDecision.braking = 1;
  assert.ok(a.EngineSound.parameters(b).amplitude < full.amplitude);
  assert.ok(a.EngineSound.parameters(b, 0, "RACE", 200).amplitude < a.EngineSound.parameters(b).amplitude);
  assert.equal(JSON.stringify(b.genome.toJSON()), baseline);
});
test("pool moteur : quatre motos proches, huit oscillateurs stables, pause et désactivation silencieuses", async () => {
  const a = await audioFixture(); const bikes = Array.from({ length: 100 }, (_, i) => bike(a, i, i === 90 ? 4 : 1));
  bikes[90].pos.set(20, 20); bikes.forEach((b, i) => { if (i !== 90) b.pos.set(1000 + i * 10, 1000); });
  a.audio.update(bikes, "RACE", 100, true, 90);
  assert.equal(a.audio.voices.length, 4); assert.equal(a.audio.context.oscillators.length, 8);
  assert.equal(a.audio.voices[0].osc.frequency.value, a.EngineSound.parameters(bikes[90]).frequency);
  assert.ok(a.audio.voices[0].gain.gain.value > 0.02);
  for (let i = 0; i < 20; i++) a.audio.update(bikes, "RACE", 100, true, 90);
  assert.equal(a.audio.context.oscillators.length, 8);
  a.audio.update(bikes, "RACE", 100, false, 90); assert.ok(a.audio.voices.every(v => v.gain.gain.value === 0));
  a.audio.enginesEnabled = false; a.audio.update(bikes, "RACE", 100, true, 90); assert.ok(a.audio.voices.every(v => v.gain.gain.value === 0));
  await flush();
});
test("training : moteurs audibles après geste, sans public ni MP3 ; course : MP3 routé vers volume voix", async () => {
  const a = await audioFixture(); const b = bike(a, 0, 2);
  a.audio.update([b], "TRAINING", 0, true, 0); await flush();
  assert.ok(a.audio.voices[0].gain.gain.value > 0); assert.equal(a.audio.crowd.gain.value, 0); assert.equal(a.audio.ambience.gain.value, 0); assert.equal(a.audio.recorded.playCount, 0);
  a.audio.update([b], "RACE", 10, true, 0); await flush();
  assert.equal(a.audio.recorded.paused, false); assert.equal(a.audio.recordedStatus, "lecture");
  assert.equal(a.audio.recordedSource.connections[0], a.audio.channels.commentary);
  a.audio.setVolume("commentary", 0); a.audio.update([b], "RACE", 10, true, 0); assert.equal(a.audio.recorded.paused, true);
  a.audio.setVolume("commentary", 0.6); a.audio.update([b], "RACE", 10, true, 0); await flush(); assert.equal(a.audio.recorded.paused, false);
  a.audio.mute(true); assert.equal(a.audio.recorded.paused, true); assert.equal(a.audio.master.gain.value, 0);
});
test("MP3 : pause conserve position, reprise continue, fin ne reboucle pas, nouvelle course repart de zéro", async () => {
  const { audio } = await audioFixture(); audio.updateRecording(true); await flush();
  audio.recorded.currentTime = 17; audio.updateRecording(false); assert.equal(audio.recorded.currentTime, 17); assert.equal(audio.recorded.paused, true);
  audio.updateRecording(true); await flush(); assert.equal(audio.recorded.currentTime, 17);
  const count = audio.recorded.playCount; audio.recorded.ended = true; audio.recorded.paused = true;
  audio.updateRecording(true); await flush(); assert.equal(audio.recorded.playCount, count);
  audio.resetRecording(); assert.equal(audio.recorded.currentTime, 0);
});
test("MP3 : autoplay refusé sans répétition de requêtes ; erreur média n’empêche pas les moteurs", async () => {
  const a = await audioFixture(); a.audio.recorded.playImplementation = () => Promise.reject(new Error("NotAllowedError"));
  a.audio.updateRecording(true); await flush(); assert.equal(a.audio.playBlocked, true);
  for (let i = 0; i < 20; i++) a.audio.updateRecording(true);
  await flush(); assert.equal(a.audio.recorded.playCount, 1);
  a.audio.recorded.playImplementation = null; await a.audio.enable(); a.audio.updateRecording(true); await flush(); assert.equal(a.audio.recorded.playCount, 2);
  a.audio.recorded.listeners.error(); const b = bike(a, 0, 2); a.audio.update([b], "RACE", 0, true, 0);
  assert.equal(a.audio.recordedStatus, "indisponible"); assert.ok(a.audio.voices[0].gain.gain.value > 0);
});
test("MP3 : une lecture en attente ne repart pas après pause ou remplacement", async () => {
  const { audio } = await audioFixture(); let release;
  audio.recorded.playImplementation = () => new Promise(resolve => { release = resolve; });
  audio.updateRecording(true); await Promise.resolve(); await Promise.resolve();
  audio.updateRecording(false); release(); await flush(); assert.equal(audio.recorded.paused, true);
  const old = audio.recorded; audio.loadCommentary("blob:replacement", "new.mp3"); old.listeners.error();
  assert.notEqual(audio.recordedStatus, "indisponible"); assert.equal(old.paused, true);
});
test("MP3 : rejet tardif après redémarrage ne bloque pas la nouvelle lecture ; ancien succès respecte mode dynamique", async () => {
  const { audio } = await audioFixture(); let reject;
  audio.recorded.playImplementation = () => new Promise((resolve, fail) => { reject = fail; });
  audio.updateRecording(true); await Promise.resolve(); await Promise.resolve();
  audio.resetRecording(); audio.recorded.playImplementation = null;
  audio.updateRecording(true); reject(new Error("lecture interrompue")); await flush();
  assert.equal(audio.playBlocked, false); assert.equal(audio.recordedStatus, "lecture"); assert.equal(audio.recorded.paused, false);
  audio.resetRecording(); let release;
  audio.recorded.playImplementation = () => new Promise(resolve => { release = () => { audio.recorded.paused = false; resolve(); }; });
  audio.updateRecording(true); await Promise.resolve(); await Promise.resolve();
  audio.setCommentaryMode("dynamic"); release(); await flush();
  assert.equal(audio.recorded.paused, true); assert.equal(audio.playBlocked, false);
});

test("MP3 et synthèse ne se superposent pas ; commentaires dynamiques utilisent les noms réels", () => {
  const a = api(); const events = new a.RaceEvents(); const speech = { getVoices: () => [{name:"Français",lang:"fr-FR"}], cancel() {}, speak(u) { this.spoken = u.text; } };
  const audio = { enabled: true, muted: false, commentaryMode: "recorded", recordedStatus: "lecture", volumes: { master: 0.6, commentary: 0.8 } };
  const commentary = new a.CommentaryEngine(events, audio, { speechSynthesis: speech, SpeechSynthesisUtterance: class { constructor(text) { this.text = text; } } });
  events.emit("OVERTAKE", { id: 0, riderName: "Marc Márquez", time: 0 }); commentary.tick(0);
  assert.match(commentary.subtitle, /Marc Márquez/); assert.equal(speech.spoken, undefined);
  audio.commentaryMode = "dynamic"; events.emit("FINISH", { id: 3, riderName: "Fabio Quartararo", time: 6000 }); commentary.tick(6000);
  assert.match(speech.spoken, /Fabio Quartararo/); assert.doesNotMatch(speech.spoken, /Agent/);
});
test("six pilotes distincts : traits inspirés reproductibles, poids et modèles originaux intacts", () => {
  const a = api(); const original = a.Genome.random(new a.SeededRandom(2027)); const before = JSON.stringify(original.toJSON());
  const roster = a.RiderRoster.build([original]); assert.equal(roster.length, 6);
  assert.equal(new Set(roster.map(e => e.identity.number)).size, 6); assert.equal(new Set(roster.map(e => e.identity.name)).size, 6);
  assert.equal(new Set(roster.map(e => JSON.stringify(e.genome.traits))).size, 6);
  for (const entry of roster) {
    assert.notEqual(entry.genome, original); assert.equal(JSON.stringify(entry.genome.weightsIH), JSON.stringify(original.weightsIH));
    assert.ok(Object.values(entry.genome.traits).every(value => value >= 0 && value <= 1));
  }
  assert.equal(JSON.stringify(a.RiderRoster.build([original]).map(e => e.genome.toJSON())), JSON.stringify(roster.map(e => e.genome.toJSON())));
  assert.equal(JSON.stringify(original.toJSON()), before);
  const unchanged = a.RiderRoster.build([original], false); assert.equal(JSON.stringify(unchanged[0].genome.toJSON()), before);
  const zero = a.RiderRoster.build([original], true, 0); assert.equal(JSON.stringify(zero[0].genome.toJSON()), before);
  assert.equal(a.RiderRoster.build([original], true, 500)[0].identity.styleStrength, 1);
  assert.throws(() => a.RiderRoster.build([]));
});
test("styles pilotent réellement la décision : Márquez plus tardif/agressif que Quartararo, forces limitées", () => {
  const a = api(); const roster = a.RiderRoster.build([a.Genome.random(new a.SeededRandom(2027))]);
  const scenario = new a.ScenarioFactory().createSet(1)[0]; const circuit = new a.Circuit();
  const riders = roster.map((entry, i) => new a.Motorcycle(entry.genome, circuit, scenario, config().vehicle, i));
  const inputs = [0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.3, 0.5];
  const decisions = riders.map(rider => rider.decideFromGpu(inputs, [0.6, 0.5]));
  assert.ok(decisions[0].braking < decisions[3].braking); assert.ok(decisions[0].throttle > decisions[3].throttle); assert.ok(decisions[0].steering > decisions[3].steering);
  riders.forEach((rider, i) => assert.ok(rider.steeringForce(decisions[i]).mag() <= rider.maxforce + 1e-9));
});
test("course reçoit identités et numéros ; événements conservent nom réel sans changer les inputs", () => {
  const a = api(); const original = a.Genome.random(new a.SeededRandom(2027)); const roster = a.RiderRoster.build([original]);
  const bus = new a.RaceEvents(); const race = new a.RaceSession(new a.Circuit(), config(), new ReferenceInference(), roster.map(e => e.genome), bus, { identities: roster.map(e => e.identity) });
  race.transition("RACE"); race.step();
  assert.equal(race.population[0].identity.number, 93); assert.equal(race.population[0].perceive().length, 9);
  race.emit("OVERTAKE", race.population[0]); assert.equal(bus.history.at(-1).riderName, "Marc Márquez");
});
test("enveloppe broadcast : sortie course restaure le lot GPU et tous les candidats du laboratoire", () => {
  const a = api(); const sim = new a.LearningSimulation(new a.Circuit(), config(), new ReferenceInference());
  const before = JSON.stringify(sim.genomes.map(g => g.toJSON())); const population = sim.population; let paused = true;
  const elements = new Map(); const node = key => { if (!elements.has(key)) elements.set(key, { value: { laps: 3, light: 700, hold: 1200 }[key], textContent: "", hidden: false }); return elements.get(key); };
  a.context.document = { getElementById: () => node("controls") };
  vm.runInContext("Venue = class { constructor() {} }", a.context);
  const p = Object.create(a.GrandPrixPresentation.prototype);
  node("model").value = "chosen";
  Object.assign(p, { host: { simulation: () => sim, raceModel: () => ({ id: "chosen", name: "Équilibré — Test", genome: sim.genomes[0], metadata: { profileLabel: "Équilibré" } }), pause: value => { paused = value; } }, settings: { inspired: true },
    events: new a.RaceEvents(), commentary: { clear() {} }, audio: { resetRecording() {}, update() {} },
    get: node, camera: new a.CameraDirector(new a.RaceEvents()), ghosts: new Map(), trainingHud: {}, result: {}, notice: {}, hud: {} });
  assert.equal(p.startRace(), true); assert.equal(p.race.population.length, 6); assert.equal(paused, false);
  assert.equal(sim.population, population); assert.equal(JSON.stringify(sim.genomes.map(g => g.toJSON())), before);
  p.setMode("training"); assert.equal(sim.population, population); assert.equal(sim.inference.genomes[0], population[0].genome); assert.equal(sim.inference.genomes.length, population.length);
});
test("course exige choix explicite ; JSON conserve poids/traits mais physique Grand Prix indépendante", () => {
  const a = api();
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../model-storage.js"), "utf8"), a.context);
  const storage = new Map(); const local = { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) };
  const models = a.context.ModelStorage;
  const sim = new a.LearningSimulation(new a.Circuit(), config(), new ReferenceInference());
  sim.bestGenome = sim.genomes[0];
  const original = a.Genome.random(new a.SeededRandom(42), "prudent");
  const saved = models.saveModel(local, original, { generation: 8, score: 123, config: config({ trackWidth: 50, vehicle: { ...config().vehicle, maxForce: 0.27 } }) }, "Agressif test");
  const imported = models.importModel(local, models.exportModel(local, saved.id));
  const elements = new Map(); const node = key => {
    if (!elements.has(key)) elements.set(key, { value: { model: "", laps: 3, light: 700, hold: 1200 }[key], textContent: "", children: [],
      replaceChildren() { this.children = []; }, appendChild(child) { this.children.push(child); } });
    return elements.get(key);
  };
  a.context.document = { getElementById: () => node("controls"), createElement: () => ({}) };
  vm.runInContext("Venue = class { constructor() {} }", a.context);
  const p = Object.create(a.GrandPrixPresentation.prototype);
  Object.assign(p, { host: { simulation: () => sim, raceModel: id => models.loadModel(local, id), pause() {} }, settings: { inspired: false },
    events: new a.RaceEvents(), commentary: { clear() {} }, audio: { resetRecording() {} }, get: node,
    camera: new a.CameraDirector(new a.RaceEvents()), ghosts: new Map(), trainingHud: {}, result: {}, notice: {}, hud: {} });
  p.setModels(models.listModels(local));
  assert.equal(node("model").value, "", "aucun dernier modèle choisi implicitement");
  assert.equal(p.startRace(), false); assert.match(p.notice.textContent, /Choisir un modèle/);
  assert.equal(sim.inference.genomes.length, sim.population.length);
  const trainingBefore = JSON.stringify(sim.genomes.map(g => g.toJSON()));
  for (const model of [saved, imported]) {
    p.setModels(models.listModels(local), model.id);
    assert.equal(node("model").value, model.id); assert.match(node("model-info").textContent, /Prudent/);
    assert.equal(p.startRace(), true); assert.equal(p.race.population.length, 6);
    assert.equal(p.race.circuit.trackWidth, 52); assert.equal(p.race.config.vehicle.maxForce, 0.18);
    assert.equal(p.raceModel.name, saved.name); assert.equal(p.generation, 8); assert.equal(p.fitness, 123);
    for (const bike of p.race.population) {
      assert.equal(JSON.stringify(bike.genome.toJSON()), JSON.stringify(original.toJSON()));
      assert.match(bike.identity.style, /Prudent/);
      const apply = bike.applyForce.bind(bike);
      bike.applyForce = force => { assert.ok(force.mag() <= bike.maxforce + 1e-9); apply(force); };
    }
    p.race.transition("RACE"); for (let i = 0; i < 100; i++) p.race.step();
    assert.equal(JSON.stringify(sim.genomes.map(g => g.toJSON())), trainingBefore);
    assert.equal(JSON.stringify(models.loadModel(local, model.id).genome.toJSON()), JSON.stringify(original.toJSON()));
  }
  const active = p.race; node("model").value = "removed";
  assert.equal(p.startRace(), false); assert.equal(p.race, active);
  p.host.raceModel = () => { throw new Error("stockage refusé"); };
  assert.equal(p.startRace(), false); assert.match(p.notice.textContent, /stockage refusé/);
  node("model").value = ""; p.setModels(models.listModels(local)); assert.equal(node("model").value, "");
  p.setModels(models.listModels(local), imported.id); p.setModels(models.listModels(local)); assert.equal(node("model").value, imported.id);
  p.setModels([]); assert.equal(node("model").value, "");
  const source = fs.readFileSync(path.join(__dirname, "../grand-prix.js"), "utf8");
  assert.match(source, /inspired: false/); assert.match(source, /id="gp-inspired" type="checkbox">/);
});
test("décor piste mis en cache, indépendant des murs et forces", () => {
  const a = api(); const circuit = new a.Circuit(); const original = JSON.stringify(circuit.walls); let created = 0; let clears = 0;
  const context = { clearRect() { clears++; }, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, stroke() {}, setLineDash() {} };
  a.context.document = { createElement() { created++; return { getContext: () => context }; } };
  a.context.drawingContext = { drawImage() {} };
  const venue = Object.create(a.Venue.prototype);
  for (let i = 0; i < 100; i++) { venue.showTrackUnderlay(circuit); venue.showTrackEdges(circuit); }
  assert.equal(created, 2); assert.equal(clears, 2); assert.equal(JSON.stringify(circuit.walls), original);
  circuit.setWidth(46); venue.showTrackUnderlay(circuit); assert.equal(created, 2); assert.equal(clears, 4);
});
test("MP3 local sans licence exclu de la publication ; aucun chemin Downloads nécessaire", () => {
  const ignore = fs.readFileSync(path.join(__dirname, "../.gitignore"), "utf8");
  const source = fs.readFileSync(path.join(__dirname, "../grand-prix.js"), "utf8");
  assert.match(ignore, /assets\/motogp_audio\.mp3/);
  assert.ok(!source.includes('"assets/motogp_audio.mp3"')); assert.ok(!source.includes("Downloads"));
});

test("bouton pause arrête immédiatement moteurs et fichier sans attendre une frame", async () => {
  const a = await audioFixture(); const b = bike(a, 0, 2); a.audio.update([b], "RACE", 0, true, 0); await flush();
  assert.equal(a.audio.recorded.paused, false); let paused = false; const label = {};
  const p = Object.create(a.GrandPrixPresentation.prototype);
  Object.assign(p, { audio: a.audio, race: {}, get: () => label, host: { pause: value => { paused = value; }, isPaused: () => paused } });
  p.setPaused(true); assert.equal(paused, true); assert.equal(a.audio.recorded.paused, true);
  assert.ok(a.audio.voices.every(voice => voice.gain.gain.value === 0)); assert.equal(label.textContent, "AUDIO PAUSED");
  p.setPaused(false); assert.equal(paused, false);
});

test("intensité réduite explicitement à 30 % : six styles terminent trois tours sans mutation de l’original", () => {
  const a = api(); const settings = config({ scenarioSeconds: 120 });
  const sim = new a.LearningSimulation(new a.Circuit(920, 720), settings, new ReferenceInference());
  let ticks = 0; while (!sim.bestGenome && ticks++ < 5000) sim.step();
  assert.ok(sim.bestGenome); const original = JSON.stringify(sim.bestGenome.toJSON());
  const roster = a.RiderRoster.build([sim.bestGenome], true, 0.3);
  const race = new a.RaceSession(new a.Circuit(920, 720), settings, new ReferenceInference(), roster.map(e => e.genome), new a.RaceEvents(), { identities: roster.map(e => e.identity) });
  race.transition("RACE"); ticks = 0; while (race.phase === "RACE" && ticks++ < 22000) race.step();
  assert.equal(race.phase, "RESULTS"); assert.equal(race.summary().finishers, 6);
  assert.ok(race.population.every(rider => rider.stats.laps === 3 && rider.stats.checkpoints === 63 && !rider.dead));
  assert.equal(new Set(race.population.map(rider => rider.race.finishTime)).size, 6);
  assert.equal(JSON.stringify(sim.bestGenome.toJSON()), original);
});

test("défaut 100 % : chaque cible est entièrement appliquée sans mélange avec les traits d’origine", () => {
  const a = api(); const base = a.Genome.random(new a.SeededRandom(2027));
  const other = base.copy(); Object.keys(other.traits).forEach(key => { other.traits[key] = 0; });
  const roster = a.RiderRoster.build([base]); const second = a.RiderRoster.build([other]);
  const traits = vm.runInContext("GENOME_TRAITS", a.context);
  const profiles = vm.runInContext("DRIVING_PROFILES", a.context);
  roster.forEach((entry, i) => {
    const rider = a.RiderRoster.riders[i]; assert.equal(entry.identity.styleStrength, 1);
    traits.forEach((key, index) => assert.equal(entry.genome.traits[key], rider.traits[key] ?? profiles[rider.profile][index]));
    assert.equal(JSON.stringify(entry.genome.traits), JSON.stringify(second[i].genome.traits));
    assert.equal(JSON.stringify(entry.genome.weightsIH), JSON.stringify(base.weightsIH));
  });
  assert.equal(a.RiderRoster.build([base], true, NaN)[0].identity.styleStrength, 1);
  const ui = fs.readFileSync(path.join(__dirname, "../grand-prix.js"), "utf8");
  assert.match(ui, /id="gp-style-strength"[^>]*value="100"/);
});


test("sprint 1 : affectations indépendantes figées, batch ordonné, refus des trous", () => {
  const a = api(); const sim = new a.LearningSimulation(new a.Circuit(), config(), new ReferenceInference());
  const sources = [0, 1].map(i => ({ id: String(i), name: `Cerveau ${i}`, genome: a.Genome.random(new a.SeededRandom(31 + i)), metadata: { profileLabel: "Équilibré" } }));
  const original = JSON.stringify(sources.map(m => m.genome.toJSON()));
  const nodes = new Map(); const get = key => {
    if (!nodes.has(key)) nodes.set(key, { value: ({ laps: 1, light: 700, hold: 1200 })[key] }); return nodes.get(key);
  };
  a.context.document = { getElementById: () => ({}) }; vm.runInContext("Venue = class {}", a.context);
  const p = Object.create(a.GrandPrixPresentation.prototype);
  Object.assign(p, { assignments: ["0", "1", "0", "1", "0", ""], get, settings: { inspired: false },
    host: { simulation: () => sim, raceModel: id => sources.find(m => m.id === id), pause() {} },
    events: new a.RaceEvents(), commentary: { clear() {} }, audio: { resetRecording() {} },
    camera: {}, ghosts: new Map(), trainingHud: {}, result: {}, notice: {} });
  assert.equal(p.startRace(), false); assert.match(p.notice.textContent, /pilote 6/);
  p.assignments[5] = "1"; assert.equal(p.startRace(), true);
  const inputs = Array(9).fill(0.4);
  assert.notDeepEqual(sources[0].genome.predict(inputs), sources[1].genome.predict(inputs));
  p.race.population.forEach((b, i) => {
    assert.equal(JSON.stringify(b.genome.toJSON()), JSON.stringify(sources[i % 2].genome.toJSON()));
    assert.equal(sim.inference.genomes[i], b.genome); assert.equal(b.identity.model.id, String(i % 2));
  });
  p.assignments.fill("1"); assert.equal(p.race.population[0].identity.model.id, "0");
  assert.equal(JSON.stringify(sources.map(m => m.genome.toJSON())), original);
});


test("sprint 2 : silhouette moto commune au replay, cap immobile, physique intacte", () => {
  const a = api(); const b = bike(a, 0, 0); b.heading = 1.23;
  const before = JSON.stringify({ pos: b.pos, vel: b.vel, genome: b.genome.toJSON(), stats: b.stats });
  const calls = []; for (const name of ["push", "pop", "translate", "rotate", "rectMode", "stroke", "strokeWeight", "fill", "rect", "ellipse", "line", "noStroke", "textSize", "textAlign", "text"]) a.context[name] = (...args) => calls.push([name, ...args]);
  a.context.CENTER = 0; b.show(false, true);
  assert.ok(calls.some(c => c[0] === "rotate" && c[1] === 1.23));
  assert.ok(calls.filter(c => c[0] === "rect").length >= 3);
  assert.ok(calls.filter(c => c[0] === "ellipse").length >= 4);
  assert.equal(JSON.stringify({ pos: b.pos, vel: b.vel, genome: b.genome.toJSON(), stats: b.stats }), before);
  const replay = fs.readFileSync(path.join(__dirname, "../replay-motorcycle.js"), "utf8");
  assert.match(replay, /this.show\(false, selected\)/);
});


test("sprint 6 : timbres distincts, arrêt immédiat et pool stable après courses répétées", async () => {
  const a = await audioFixture(); const b = bike(a,0,2), c=bike(a,1,2);
  assert.notEqual(a.EngineSound.parameters(b).frequency,a.EngineSound.parameters(c).frequency);
  let hardStops=0; for (const v of a.audio.voices) { const original=v.gain.gain.setValueAtTime; v.gain.gain.setValueAtTime=function(n,t){if(n===0)hardStops++;original.call(this,n,t);}; }
  for(let race=0;race<12;race++) { a.audio.resetRecording(); await a.audio.enable(); a.audio.update([b,c],"RACE",100,true,0); a.audio.update([b,c],"RACE",100,false,0); }
  assert.equal(a.audio.context.oscillators.length,8); assert.ok(hardStops>=48); assert.equal(a.audio.tones.size,0);
  a.audio.update([b],"RACE",100,true,0); a.audio.mute(true); assert.equal(a.audio.master.gain.value,0);
  a.audio.engineSound.dispose(); assert.equal(a.audio.engineSound.voices.length,0);
});


test("sprint 7 : voix française, texte identique, pause, événements périmés et absence de voix", () => {
  const a=api(), events=new a.RaceEvents(); let voices=[{name:"FR",lang:"fr-FR"}], spoken=[], cancelled=0;
  const speech={getVoices:()=>voices, cancel(){cancelled++;}, speak(u){spoken.push(u);}};
  const audio={enabled:true,muted:false,commentaryMode:"dynamic",volumes:{master:0.7,commentary:0.8}};
  const c=new a.CommentaryEngine(events,audio,{speechSynthesis:speech,SpeechSynthesisUtterance:class{constructor(text){this.text=text;}}});
  events.emit("OVERTAKE",{time:0,id:0,riderName:"Marc Márquez",passedName:"Jorge Martín"});c.tick(0);
  assert.equal(spoken.length,1);assert.equal(spoken[0].text,c.subtitle);assert.match(c.subtitle,/Jorge Martín/);assert.equal(spoken[0].voice.lang,"fr-FR");
  const stale=spoken[0];c.suspend();stale.onstart();assert.equal(c.subtitle,"");assert.equal(c.queue.length,0);
  events.emit("FAST_LAP",{time:1000,id:2,riderName:"Fabio Quartararo"});c.tick(20000);assert.equal(spoken.length,1);
  voices=[{name:"EN",lang:"en-US"}];events.emit("FINISH",{time:21000,id:2,riderName:"Fabio Quartararo"});c.tick(21000);
  assert.equal(spoken.length,1);assert.match(c.subtitle,/Fabio/);assert.match(c.voiceStatus,/Aucune voix française/);
  assert.ok(cancelled>=1);
});
test("sprint 7 : priorité interrompt annonce faible sans chevauchement, muet sans accumulation",()=>{
  const a=api(),bus=new a.RaceEvents(), spoken=[];
  const speech={speaking:false,getVoices:()=>[{name:"FR",lang:"fr-FR"}],cancel(){this.speaking=false;},speak(u){this.speaking=true;spoken.push(u);}};
  const audio={enabled:true,muted:false,commentaryMode:"dynamic",volumes:{master:1,commentary:1}};
  const c=new a.CommentaryEngine(bus,audio,{speechSynthesis:speech,SpeechSynthesisUtterance:class{constructor(text){this.text=text;}}});
  bus.emit("CLOSE_BATTLE",{time:0,id:1});c.tick(0);bus.emit("CRASH",{time:100,id:2});c.tick(100);
  assert.equal(spoken.length,2);assert.match(c.subtitle,/03/);
  c.suspend();audio.muted=true;bus.emit("FINISH",{time:20000,id:2});c.tick(20000);assert.equal(spoken.length,2);assert.equal(c.queue.length,0);
});


test("sprint 8 : échec audio partiel puis reprise, erreur moteur sans interruption de course",async()=>{
 const a=api();let attempts=0,closed=0;
 class Flaky extends AudioContextDouble {
   createBuffer(){if(attempts++===0)throw new Error("allocation audio refusée");return super.createBuffer();}
   async close(){closed++;}
 }
 const audio=new a.AudioManager({AudioContext:Flaky,Audio:AudioDouble});
 assert.equal(await audio.enable(),false);assert.equal(audio.context,null);assert.equal(closed,1);
 assert.equal(await audio.enable(),true);assert.equal(audio.voices.length,4);
 audio.voices[0].osc.frequency.setTargetAtTime=()=>{throw new Error("périphérique perdu");};
 assert.doesNotThrow(()=>audio.update([bike(a)],"RACE",0,true,0));assert.equal(audio.enabled,false);assert.match(audio.error,/périphérique perdu/);
});


test("sprint 8 : annulation normale de voix par mute ne signale pas une voix absente",()=>{
 const a=api(),events=new a.RaceEvents();let utterance;
 const speech={getVoices:()=>[{name:"FR",lang:"fr-FR"}],cancel(){},speak(u){utterance=u;}};
 const c=new a.CommentaryEngine(events,{enabled:true,muted:false,commentaryMode:"dynamic",volumes:{master:1,commentary:1}},{speechSynthesis:speech,SpeechSynthesisUtterance:class{constructor(text){this.text=text;}}});
 events.emit("RACE_START",{time:0});c.tick(0);utterance.onerror({error:"canceled"});assert.match(c.voiceStatus,/Voix française/);
 utterance.onerror({error:"synthesis-failed"});assert.match(c.voiceStatus,/indisponible/);
});


test("retour utilisateur : anglais événementiel, sous-titre identique, baisse/restauration du mix",async()=>{
 const a=await audioFixture(), events=new a.RaceEvents();let spoken;
 const speech={getVoices:()=>[{name:"FR",lang:"fr-FR"},{name:"UK",lang:"en-GB"}],cancel(){},speak(u){spoken=u;}};
 const c=new a.CommentaryEngine(events,a.audio,{speechSynthesis:speech,SpeechSynthesisUtterance:class{constructor(text){this.text=text;}}});
 c.setLanguage("en");a.audio.setCommentaryMode("dynamic");
 events.emit("OVERTAKE",{time:0,id:0,riderName:"Marc Márquez",passedName:"Jorge Martín"});c.tick(0);
 assert.equal(spoken.lang,"en-GB");assert.equal(spoken.voice.name,"UK");assert.equal(spoken.text,c.subtitle);assert.match(spoken.text,/passes Jorge Martín/);
 assert.equal(spoken.volume,0.9);const base=a.audio.channels.engines.gain.value;spoken.onstart();
 assert.ok(a.audio.channels.engines.gain.value<base*0.2);assert.equal(a.audio.channels.commentary.gain.value,1);
 spoken.onend();assert.equal(a.audio.channels.engines.gain.value,base);
 c.setLanguage("fr");assert.equal(c.queue.length,0);assert.equal(c.language,"fr");
});
test("retour utilisateur : combustion déterministe bornée, boucles persistantes et remplacement sans fuite",async()=>{
 const a=api();const data=a.EngineSound.combustionSamples(48000),other=a.EngineSound.combustionSamples(48000);
 assert.deepEqual(data,other);assert.ok(data.some(v=>Math.abs(v)>0.2));assert.ok(data.every(v=>Number.isFinite(v)&&Math.abs(v)<=1));
 const sources=[];
 class Context extends AudioContextDouble {
   createBufferSource(){const n={...this.node(),playbackRate:parameter(),start(){},stop(){this.stopped=true;}};sources.push(n);return n;}
 }
 const context=new Context(), engine=new a.EngineSound(context,context.destination);
 assert.equal(sources.length,4);const b=bike(a,0,0);engine.update([b],true,0,"RACE");const idle=sources[0].playbackRate.value;
 b.vel.set(b.maxspeed,0);b.lastDecision={throttle:1,braking:0};engine.update([b],true,0,"RACE");assert.ok(sources[0].playbackRate.value>idle);
 for(let i=0;i<300;i++)engine.update([b],true,0,"RACE");assert.equal(sources.length,4);
 assert.throws(()=>engine.setSample({duration:40}));engine.setSample({duration:1});assert.equal(sources.length,8);assert.ok(sources.slice(0,4).every(s=>s.stopped));
 engine.dispose();assert.ok(sources.every(s=>s.stopped));
});
test("retour utilisateur : souris, coordonnées caméra/CSS, doublons, suppression et snapshot de course",()=>{
 const a=api(),p=Object.create(a.GrandPrixPresentation.prototype);let list=0;
 const circuit={isOnTrack:point=>point.x>=100&&point.x<=800&&point.y>=100&&point.y<=650};
 Object.assign(p,{obstacleEditing:true,pendingObstacles:[],notice:{},host:{simulation:()=>({circuit})},get:()=>({value:12}),renderObstacles(){list++;}});
 const canvas={tagName:"CANVAS",getBoundingClientRect:()=>({left:10,top:20,width:460,height:360})};
 const event=(x,y,extra={})=>({type:"pointerdown",target:canvas,clientX:10+x/2,clientY:20+y/2,stopPropagation(){},...extra});
 const first=event(200,300);assert.equal(p.handleObstaclePointer(first),true);p.handleObstaclePointer(first);assert.equal(p.pendingObstacles.length,1);
 p.handleObstaclePointer(event(200,300,{type:"click"}));assert.equal(p.pendingObstacles.length,1);
 assert.deepEqual(JSON.parse(JSON.stringify(p.pendingObstacles[0])),{x:200,y:300,radius:12});p.handleObstaclePointer(event(20,20));assert.equal(p.pendingObstacles.length,1);
 p.handleObstaclePointer(event(200,300,{shiftKey:true}));assert.equal(p.pendingObstacles.length,0);
 p.race={circuit,obstacles:[]};p.camera={worldPoint:(x,y)=>({x:x+100,y:y+100})};p.handleObstaclePointer(event(200,300));
 assert.deepEqual(JSON.parse(JSON.stringify(p.pendingObstacles[0])),{x:300,y:400,radius:12});assert.equal(p.race.obstacles.length,0);
 p.playback={};p.handleObstaclePointer(event(400,400));assert.equal(p.pendingObstacles.length,1);assert.match(p.notice.textContent,/replay/);
 assert.ok(list>=3);
});


test("cadrage d'origine sans étirement horizontal et conversion clic/caméra conservée", () => {
 const css=fs.readFileSync(path.join(__dirname,"../broadcast.css"),"utf8");
 assert.doesNotMatch(css, /width: max\(calc\(100% - 560px\)/);
 assert.match(css, /\.broadcast-app \{[^}]*height: 100dvh;[^}]*minmax\(360px, 1fr\)/);
 assert.match(css, /#canvas-container \{[^}]*height: 100%;/);
 assert.match(css, /#canvas-container canvas \{[^}]*height: auto !important[^}]*aspect-ratio: 920 \/ 720/);
 const a=api(),p=Object.create(a.GrandPrixPresentation.prototype);
 const circuit={isOnTrack:()=>true};
 Object.assign(p,{obstacleEditing:true,pendingObstacles:[],notice:{},host:{simulation:()=>({circuit})},get:()=>({value:12}),renderObstacles(){}});
 // Coordinate conversion remains robust even with independent display scales.
 const box={left:280,top:238,width:1328,height:600};
 const canvas={tagName:"CANVAS",getBoundingClientRect:()=>box};
 const click=(x,y)=>({type:"pointerdown",target:canvas,clientX:box.left+x*box.width/920,clientY:box.top+y*box.height/720,stopPropagation(){}});
 p.handleObstaclePointer(click(696,202));
 assert.deepEqual(JSON.parse(JSON.stringify(p.pendingObstacles[0])),{x:696,y:202,radius:12});
 p.race={circuit,obstacles:[]};p.camera={worldPoint:(x,y)=>({x:(x-460)/1.5+460,y:(y-360)/1.5+360})};
 p.handleObstaclePointer(click(610,510));
 assert.deepEqual(JSON.parse(JSON.stringify(p.pendingObstacles[1])),{x:560,y:460,radius:12});
});

test("HUD inférieur : place réservée hors canvas, mini-carte SVG sans peinture sur circuit", () => {
 const css=fs.readFileSync(path.join(__dirname,"../broadcast.css"),"utf8");
 const source=fs.readFileSync(path.join(__dirname,"../grand-prix.js"),"utf8");
 assert.match(css, /--gp-footer-height: 72px/);
 assert.match(css, /max-height: calc\(100% - var\(--gp-footer-height\)\)/);
 assert.match(css, /#gp-bottom-hud \{[^}]*height: var\(--gp-footer-height\)/);
 assert.match(css, /#gp-bottom-hud #gp-subtitle,[^}]*position: static/);
 assert.match(source, /id="gp-bottom-hud"><div id="gp-subtitle"[\s\S]*?id="gp-telemetry"[\s\S]*?id="gp-minimap"/);
 const a=api(),p=Object.create(a.GrandPrixPresentation.prototype),target={};
 p.get=id=>id==="minimap"?target:null;p.camera={selected:2};
 const circuit={centerline:[{x:0,y:0},{x:100,y:0},{x:50,y:50}]};
 const bikes=[{id:1,pos:{x:20,y:10}},{id:2,pos:{x:30,y:20}}],before=JSON.stringify([circuit,bikes]);
 p.drawMiniMap(circuit,bikes);
 assert.match(target.innerHTML, /<polygon points="0,0 100,0 50,50"/);
 assert.match(target.innerHTML, /cx="30" cy="20" r="10" fill="#ffe080"/);
 assert.equal(JSON.stringify([circuit,bikes]),before);
 p.get=()=>null;assert.doesNotThrow(()=>p.drawMiniMap(circuit,bikes));
});

test("croix panneaux : accessibles, fermeture et focus sans effacer réglages ni course", () => {
 const a=api(),p=Object.create(a.GrandPrixPresentation.prototype);
 class Node {
  constructor(tag="div"){this.tagName=tag.toUpperCase();this.children=[];this.attrs={};this.listeners={};this.hidden=false;}
  get firstChild(){return this.children[0]||null;}
  appendChild(node){this.children.push(node);}
  insertBefore(node,anchor){const i=this.children.indexOf(anchor);this.children.splice(i<0?this.children.length:i,0,node);}
  setAttribute(key,value){this.attrs[key]=value;}
  addEventListener(key,fn){this.listeners[key]=fn;}
  querySelector(){return this.summary;}
  focus(){this.focused=true;}
 }
 a.context.document={createElement:tag=>new Node(tag)};
 const nodes={settings:new Node(),"settings-toggle":new Node("button"),grid:new Node("details"),"lab-toggle":new Node("button"),launch:new Node("button")};
 nodes.grid.summary=new Node("summary");nodes.grid.appendChild(nodes.grid.summary);nodes.grid.open=true;
 const classes=new Set(["lab-open"]),race={},playback={},settings={neuralWeight:1};
 Object.assign(p,{get:key=>nodes[key],shell:{classList:{remove:key=>classes.delete(key)}},result:new Node(),race,playback,settings});
 nodes.settings.input={value:"100"};p.result.dataset={session:"original"};
 const close=p.addPanelClose(nodes.settings,"settings","Fermer les réglages spectacle");
 assert.equal(close.type,"button");assert.equal(close.textContent,"×");assert.equal(close.attrs["aria-label"],"Fermer les réglages spectacle");
 p.setSettingsOpen(true);assert.equal(nodes.settings.hidden,false);assert.equal(nodes["settings-toggle"].attrs["aria-expanded"],"true");
 close.listeners.click();assert.equal(nodes.settings.hidden,true);assert.equal(nodes["settings-toggle"].attrs["aria-expanded"],"false");assert.ok(nodes["settings-toggle"].focused);
 p.setSettingsOpen(true);assert.equal(nodes.settings.input.value,"100");
 const gridClose=p.addPanelClose(nodes.grid,"grid","Fermer les affectations");
 assert.equal(nodes.grid.firstChild,nodes.grid.summary);gridClose.listeners.click();assert.equal(nodes.grid.open,false);assert.ok(nodes.grid.summary.focused);
 p.closePanel("lab");assert.equal(classes.has("lab-open"),false);assert.equal(nodes["lab-toggle"].attrs["aria-expanded"],"false");assert.ok(nodes["lab-toggle"].focused);
 p.closePanel("results");assert.equal(p.result.hidden,true);assert.equal(p.result.dataset.session,"original");assert.ok(nodes.launch.focused);
 assert.equal(p.race,race);assert.equal(p.playback,playback);assert.equal(p.settings,settings);
 const css=fs.readFileSync(path.join(__dirname,"../broadcast.css"),"utf8");
 assert.match(css,/\.gp-panel-closebar \{[^}]*position: sticky; top: 0/);assert.match(css,/width: 44px; height: 44px/);
});

test("retour utilisateur : enregistrement fourni chargé une fois, boucle normalisée, secours hors ligne",async()=>{
 const a=api();let requests=0;
 const source=new Float32Array(48000);for(let i=0;i<source.length;i++)source[i]=0.1+0.3*Math.sin(i*0.07);
 const decoded={sampleRate:48000,length:source.length,duration:1,getChannelData:()=>source};
 class Context extends AudioContextDouble {
  constructor(){super();this.sampleRate=48000;}
  createBuffer(channels,length,rate){const data=new Float32Array(length);return {sampleRate:rate,length,duration:length/rate,getChannelData:()=>data};}
  async decodeAudioData(){return decoded;}
 }
 const audio=new a.AudioManager({AudioContext:Context,fetch:async url=>{requests++;assert.equal(url,"assets/motorbike-ezwa.ogg");return {ok:true,arrayBuffer:async()=>new ArrayBuffer(1)};}});
 assert.equal(await audio.enable(),true);assert.match(audio.engineSampleStatus,/ezwa/);assert.equal(requests,1);
 assert.ok(audio.engineSound.buffer.duration>0.2&&audio.engineSound.buffer.duration<0.4);
 const samples=audio.engineSound.buffer.getChannelData(0);assert.ok(samples.every(n=>Number.isFinite(n)&&Math.abs(n)<=0.801));
 assert.ok(Math.abs(samples.reduce((sum,n)=>sum+n,0)/samples.length)<1e-5);
 await audio.enable();assert.equal(requests,1);
 const missing=new a.AudioManager({AudioContext:Context,fetch:async()=>{throw new Error("hors ligne");}});
 assert.equal(await missing.enable(),true);assert.match(missing.engineSampleStatus,/indisponible/);
 const asset=fs.readFileSync(path.join(__dirname,"../assets/motorbike-ezwa.ogg"));assert.equal(crypto.createHash("sha1").update(asset).digest("hex"),"8499324760f6c63c4b8aed173e22c00de8ebd8e2");
});


test("aperçu futur exclut les obstacles déjà physiques et se dessine sans disque plein",()=>{
 const a=api(),p=Object.create(a.GrandPrixPresentation.prototype),g=a.Genome.random(new a.SeededRandom(7));
 const displayed=[]; a.context.recordPreview=(x,preview)=>displayed.push({x,preview});
 vm.runInContext("Obstacle.prototype.show=function(preview){recordPreview(this.pos.x,preview)}",a.context);
 Object.assign(p,{obstacleEditing:true,host:{simulation:()=>({population:[{genome:g}]})},pendingObstacles:[{x:200,y:300,radius:12},{x:250,y:300,radius:12}],race:{obstacles:[{pos:{x:200,y:300},radius:12}]}});
 p.drawObstaclePreview();assert.deepEqual(displayed,[{x:250,preview:true}]);
 const calls=[];for(const name of ["push","pop","stroke","strokeWeight","ellipse","line","noStroke","textAlign","textSize","text"])a.context[name]=()=>{};
 a.context.noFill=()=>calls.push("outline");a.context.fill=()=>calls.push("fill");a.context.CENTER=0;
 vm.runInContext(fs.readFileSync(path.join(__dirname,"../Obstacle.js"),"utf8").replace("class Obstacle", "class PreviewObstacle")+"; new PreviewObstacle(Genome.random(new SeededRandom(1)),{x:100,y:100,radius:12}).show(true)",a.context);
 assert.deepEqual(calls,["outline","fill"],"aucun remplissage du corps, uniquement le texte");
});

test("ajout souris active l’évitement de prochaine course, sans modifier l’assistance actuelle",()=>{
 const a=api(),p=Object.create(a.GrandPrixPresentation.prototype), avoidance={checked:false}, circuit={isOnTrack:()=>true};
 Object.assign(p,{obstacleEditing:true,pendingObstacles:[],notice:{},race:{circuit,assistance:{avoidance:false},obstacles:[]},camera:{worldPoint:(x,y)=>({x,y})},get:key=>key==="avoidance"?avoidance:{value:6},renderObstacles(){}});
 p.handleObstaclePointer({type:"pointerdown",target:{tagName:"CANVAS",getBoundingClientRect:()=>({left:0,top:0,width:920,height:720})},clientX:200,clientY:300,stopPropagation(){}});
 assert.equal(avoidance.checked,true);assert.equal(p.race.assistance.avoidance,false);assert.equal(p.race.obstacles.length,0);assert.equal(p.pendingObstacles.length,1);
});
