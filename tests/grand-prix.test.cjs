const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { runtime, config, ReferenceInference } = require("./helpers/runtime.cjs");

function gpRuntime() {
  const api = runtime();
  for (const file of ["race-events.js", "replay.js", "race-analytics.js", "rider-roster.js", "race-session.js", "engine-sound.js", "audio-manager.js", "commentary.js", "camera-director.js", "replay-motorcycle.js", "grand-prix.js"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), api.context, { filename: file });
  }
  return Object.assign(api, vm.runInContext("({ RaceEvents, FlagManager, ReplaySystem, RaceAnalytics, RaceSession, AudioManager, AudioDirector, CommentaryEngine, CameraDirector, GrandPrixPresentation, ReplayMotorcycle })", api.context));
}
function makeRace(options = {}, count = 4) {
  const api = gpRuntime(); const circuit = new api.Circuit(); const settings = config();
  const genomes = Array.from({ length: count }, () => api.Genome.random(new api.SeededRandom(2027)));
  const inference = new ReferenceInference(); const events = new api.RaceEvents();
  const race = new api.RaceSession(circuit, settings, inference, genomes, events, options);
  return { ...api, circuit, settings, genomes, inference, events, race };
}
const snapshot = bike => JSON.stringify({ pos: bike.pos, vel: bike.vel, acc: bike.acc, genome: bike.genome.toJSON(), stats: bike.stats });

test("bus borné : consommateurs isolés, désabonnement, aucun crash du core", () => {
  const { RaceEvents } = gpRuntime(); const bus = new RaceEvents(); let received = 0;
  bus.on(() => { throw new Error("audio absent"); }); const off = bus.on(() => received++);
  for (let i = 0; i < 240; i++) bus.emit("LAP", { time: i });
  assert.equal(received, 240); assert.equal(bus.errors, 240); assert.equal(bus.history.length, 200);
  off(); bus.emit("FINISH"); assert.equal(received, 240);
});
test("grille sur piste, immobile avant extinction ; timing configurable sans inférence", () => {
  const a = makeRace({ timing: { intro: 100, flyover: 100, grid: 100, light: 100, hold: 100 } }, 12);
  const { race, inference } = a;
  assert.equal(race.population.length, 12); assert.equal(new Set(race.population.map(b => `${b.pos.x}:${b.pos.y}`)).size, 12);
  assert.ok(race.population.every(bike => bike.vel.mag() === 0 && a.circuit.isOnTrack(bike.pos)));
  let calls = 0; const predict = inference.predict.bind(inference); inference.predict = inputs => { calls++; return predict(inputs); };
  const before = race.population.map(snapshot);
  race.begin();
  for (let i = 0; i < 8; i++) { race.step(); race.advancePresentation(100); }
  assert.equal(race.phase, "LIGHTS"); assert.equal(race.lights, 5); assert.equal(calls, 0);
  assert.deepEqual(race.population.map(snapshot), before);
  race.advancePresentation(100); assert.equal(race.phase, "RACE"); assert.equal(race.flags.flag, "GREEN");
  race.step(); assert.equal(calls, 1); assert.ok(race.population.some(bike => bike.vel.mag() > 0));
});
test("course : génomes copiés, réglages isolés, forces bornées, entraînement inchangé", () => {
  const a = makeRace(); const genomeBefore = JSON.stringify(a.genomes.map(g => g.toJSON())); const configBefore = JSON.stringify(a.settings);
  a.race.transition("RACE");
  for (const bike of a.race.population) {
    assert.ok(bike instanceof a.Vehicle); assert.notEqual(bike.genome, a.genomes[bike.id]);
    const apply = bike.applyForce.bind(bike); bike.applyForce = force => { assert.ok(force.mag() <= bike.maxforce + 1e-9); apply(force); };
  }
  for (let i = 0; i < 200; i++) a.race.step();
  assert.equal(JSON.stringify(a.genomes.map(g => g.toJSON())), genomeBefore); assert.equal(JSON.stringify(a.settings), configBefore);
});
test("classement et écarts utilisent progression, arrivée figée, DNF derrière actifs", () => {
  const { race } = makeRace(); const [a, b, c] = race.population;
  a.race.progress = 200; b.race.progress = 400; c.race.progress = 100;
  a.pos.set(0, 0); b.pos.set(0, 0); assert.equal(race.standings()[0], b);
  assert.match(race.gap(a), /^\+[1-9].* m$/);
  a.finished = b.finished = true; a.race.finishTime = 4000; b.race.finishTime = 3000;
  assert.equal(race.gap(a), "+1.000 s"); assert.equal(race.standings()[0], b);
  c.dead = true; assert.equal(race.standings().at(-1), c);
});
test("dépassement : hystérésis, aucune annonce sur oscillations, départ ou DNF", () => {
  const { race, events } = makeRace({}, 2); const [a, b] = race.population;
  a.tracker.started = b.tracker.started = true;
  a.race.progress = 100; b.race.progress = 110;
  race.time = 1000; race.updateStandings(); race.time = 1500; race.updateStandings();
  assert.equal(events.history.filter(e => e.type === "OVERTAKE").length, 0);
  a.race.progress = 112; race.time = 1700; race.updateStandings();
  b.race.progress = 120; race.time = 1800; race.updateStandings(); race.time = 2900; race.updateStandings();
  assert.equal(events.history.filter(e => e.type === "OVERTAKE").length, 1);
  assert.equal(events.history.filter(e => e.type === "LEADER_CHANGE").length, 1);
  race.time = 4500; race.updateStandings(); assert.equal(b.race.overtakes, 1);
  a.dead = true; race.time = 6000; race.updateStandings(); assert.equal(b.race.overtakes, 1);
});
test("bataille soutenue annoncée une fois ; drapeau jaune temporaire, damier persistant", () => {
  const { race, events } = makeRace({}, 2); const [a, b] = race.population;
  a.tracker.started = b.tracker.started = true; a.race.progress = 15; b.race.progress = 10;
  for (let t = 0; t < 5000; t += 500) { race.time = t; race.updateStandings(); }
  assert.equal(events.history.filter(e => e.type === "CLOSE_BATTLE").length, 1);
  race.emit("OFF_TRACK", a); assert.equal(race.flags.flag, "YELLOW"); race.flags.update(9000); assert.equal(race.flags.flag, "GREEN");
  race.emit("FINISH", a); race.emit("CRASH", b); race.flags.update(20000); assert.equal(race.flags.flag, "CHEQUERED");
});
test("trois tours pour arrivée, chronos réels, dernier tour et statistiques", () => {
  const { race, events } = makeRace({}, 1); const bike = race.population[0];
  race.transition("RACE");
  for (let lap = 1; lap <= 3; lap++) {
    race.time = lap * 10000; bike.stats.laps = lap;
    race.observe(bike, [{ type: "lap", time: 10000 - lap }]);
    assert.equal(bike.finished, lap === 3);
  }
  assert.equal(events.history.filter(e => e.type === "FINAL_LAP").length, 1);
  assert.equal(events.history.filter(e => e.type === "FINISH").length, 1);
  assert.equal(race.summary().winner, 0); assert.equal(race.summary().completion, 1); assert.equal(race.fastestLap, 9997);
});
test("DNF sans faux vainqueur ; timeout termine réellement la session", () => {
  const { race, events } = makeRace({}, 1); race.maxTime = 1; race.transition("RACE"); race.step();
  assert.equal(race.phase, "RESULTS"); assert.equal(race.population[0].dead, true);
  assert.equal(race.summary().winner, null); assert.equal(race.summary().completion, 0); assert.equal(race.flags.flag, "RED");
  assert.equal(events.history.filter(e => e.type === "DNF").length, 1);
  race.advancePresentation(100); assert.equal(race.phase, "RESULTS");
  for (let i = 0; i < 80; i++) race.advancePresentation(100);
  assert.equal(race.phase, "PODIUM");
});
test("replay : mémoire bornée, données copiées, interpolation temporelle sans mutation réelle", () => {
  const { race, ReplaySystem, ReplayMotorcycle, Vehicle } = makeRace({}, 1); const bike = race.population[0];
  const replay = new ReplaySystem(10, 100);
  for (let t = 0; t <= 2000; t += 10) replay.capture(t, [bike]);
  assert.equal(replay.frames.length, 10); assert.equal(replay.frames[0].time, 1100);
  const saved = replay.save(); const original = snapshot(bike); const snapshot0 = JSON.stringify(saved);
  const ghost = new ReplayMotorcycle(bike.genome, race.circuit, bike.scenario, bike.parameters, 0);
  assert.ok(ghost instanceof Vehicle);
  ghost.show = () => {};
  for (const speed of [0.25, 0.5]) {
    const frame = replay.frameAt(400 * speed); ghost.displaySnapshot(frame.bikes[0]);
    assert.ok(frame.time <= 1100 + 400 * speed);
  }
  assert.equal(snapshot(bike), original); assert.equal(JSON.stringify(saved), snapshot0);
  bike.sensorReadings[0] = 12345; assert.notEqual(saved[0].bikes[0].sensors[0], 12345);
});
test("commentaires : priorités, cooldown, déduplication, variantes, sous-titres sans audio", () => {
  const { RaceEvents, CommentaryEngine } = gpRuntime(); const events = new RaceEvents();
  const commentary = new CommentaryEngine(events, { muted: false, enabled: false }, {});
  events.emit("OVERTAKE", { id: 1, time: 0 }); events.emit("OVERTAKE", { id: 1, time: 100 });
  events.emit("CRASH", { id: 4, time: 300 }); assert.equal(commentary.queue.length, 2);
  commentary.tick(300); assert.match(commentary.subtitle, /05/); assert.equal(commentary.queue.length, 1);
  commentary.tick(400); assert.equal(commentary.queue.length, 1); commentary.tick(6000); assert.match(commentary.subtitle, /02/);
  events.emit("OVERTAKE", { id: 1, time: 12000 }); assert.notEqual(commentary.queue[0].text, commentary.subtitle);
  for (let i = 0; i < 30; i++) events.emit("CRASH", { id: i, time: 12000 }); assert.equal(commentary.queue.length, 8);
  commentary.tick(40000); assert.equal(commentary.queue.length, 0);
});
test("horloge commentaire inclut présentation sans expirer les événements course", () => {
  const { RaceEvents, CommentaryEngine } = gpRuntime(); const bus = new RaceEvents();
  const commentary = new CommentaryEngine(bus, { enabled: false }, {}); commentary.now = () => 25000;
  bus.emit("RACE_START", { time: 0 }); commentary.tick(25000); assert.match(commentary.subtitle, /parti|Départ/);
});
test("caméra : suivi lissé, sélection, priorité événements, coordonnées inverses, immobilité pause", () => {
  const { RaceEvents, CameraDirector, circuit, race } = makeRace(); const events = new RaceEvents(); const camera = new CameraDirector(events);
  camera.mode = "FOLLOW_SELECTED"; camera.selected = 1; const bike = race.population[1];
  camera.update(race.population, race.population[0], circuit, 0, 16, false);
  assert.ok(camera.zoom > 1 && camera.zoom < 1.65); const old = camera.x;
  camera.update(race.population, race.population[0], circuit, 0, 0, false); assert.equal(camera.x, old);
  camera.update(race.population, race.population[0], circuit, 0, 16, true); assert.equal(camera.x, bike.pos.x);
  const point = camera.worldPoint(460, 360); assert.equal(point.x, bike.pos.x);
  events.emit("FINISH", { id: 2, time: 100 }); events.emit("FAST_LAP", { id: 3, time: 200 }); assert.equal(camera.focus, 2);
  events.emit("OVERTAKE", { id: 1, time: 5000 }); assert.equal(camera.focus, 1);
});
test("audio absent ou bloqué : repli sans exception, volumes bornés", async () => {
  const { AudioManager } = gpRuntime(); const audio = new AudioManager({});
  assert.equal(await audio.enable(), false); assert.match(audio.error, /indisponible/);
  audio.update([], "RACE", 10, true); audio.tone("control", 440); audio.setVolume("master", 500); assert.equal(audio.volumes.master, 1);
  audio.setVolume("engines", -1); assert.equal(audio.volumes.engines, 0); audio.mute(); assert.equal(audio.muted, true);
});
test("validation : enregistrement trois tours indépendant, succès unique, capacité bornée", () => {
  const a = makeRace({}, 1); const presentation = Object.create(a.GrandPrixPresentation.prototype);
  Object.assign(presentation, { settings: { replay: true }, notice: {}, showValidation() { this.shown = (this.shown || 0) + 1; } });
  const sim = { mode: "validation", status: "validation en cours", population: a.race.population, simulationTime: 100, generation: 7, bestScore: 50, validationStats: [], circuit: a.circuit };
  presentation.recordValidation(sim); sim.simulationTime = 200; presentation.recordValidation(sim);
  sim.status = "modèle validé"; sim.validationStats = [{ time: 10 }, { time: 11 }, { time: 12 }];
  presentation.recordValidation(sim); const count = presentation.validationRecorder.frames.length;
  for (let i = 0; i < 100; i++) presentation.recordValidation(sim);
  assert.equal(presentation.shown, 1); assert.equal(presentation.validationRun.laps.length, 3); assert.equal(presentation.validationRecorder.frames.length, count);
  assert.equal(presentation.validationRun.generation, 7); assert.equal(presentation.validationRun.source, sim.population[0]);
  const silent = Object.create(a.GrandPrixPresentation.prototype);
  Object.assign(silent, { settings: { replay: false }, notice: {}, showValidation() { this.shown = true; } });
  silent.recordValidation(sim); assert.equal(silent.shown, true); assert.equal(silent.validationRun.frames.length, 0);
});

test("course numérique complète : vrais capteurs, vraies forces, aucun auto-pilotage, génome intact", () => {
  const a = gpRuntime(); const settings = config({ trainingGenerations: 1 });
  const sim = new a.LearningSimulation(new a.Circuit(), settings, new ReferenceInference());
  let steps = 0; while (sim.mode === "training" && steps++ < 4000) sim.step();
  assert.ok(sim.bestGenome); const before = JSON.stringify(sim.bestGenome.toJSON());
  const training = sim.population[0]; const frozen = snapshot(training);
  const race = new a.RaceSession(new a.Circuit(), settings, sim.inference, [sim.bestGenome], new a.RaceEvents());
  race.transition("RACE"); let ticks = 0; while (race.phase === "RACE" && ticks++ < 22000) race.step();
  assert.equal(race.phase, "RESULTS");
  assert.ok(race.population[0].finished || race.population[0].dead);
  assert.equal(JSON.stringify(sim.bestGenome.toJSON()), before); assert.equal(snapshot(training), frozen);
  assert.ok(race.population[0].age > 0); assert.ok(race.population[0].lastDecision);
  assert.ok(race.replay.frames.length <= 100); assert.ok(race.replay.frames.at(-1).bikes[0].throttle !== null);
  // Resume the same inference batch after restoring training, without resetting any candidate.
  sim.inference.setGenomes(sim.population.map(bike => bike.genome)); sim.step();
  assert.equal(sim.population[0], training); assert.notEqual(snapshot(training), frozen);
});

test("observation et replay ne changent aucune trajectoire ni résultat de validation", () => {
  const a = gpRuntime(); const settings = config({ trainingGenerations: 1 });
  const baseline = new a.LearningSimulation(new a.Circuit(), settings, new ReferenceInference());
  const observed = new a.LearningSimulation(new a.Circuit(), settings, new ReferenceInference());
  const presentation = Object.create(a.GrandPrixPresentation.prototype);
  Object.assign(presentation, { settings: { replay: true }, notice: {}, showValidation() {} });
  let steps = 0;
  while ((baseline.status !== "modèle validé" || observed.status !== "modèle validé") && steps++ < 14000) {
    baseline.step(); observed.step(); presentation.recordValidation(observed);
    if (steps % 400 === 0) assert.equal(snapshot(baseline.population[0]), snapshot(observed.population[0]));
  }
  assert.equal(baseline.status, "modèle validé"); assert.equal(observed.status, baseline.status);
  assert.equal(JSON.stringify(observed.validationStats), JSON.stringify(baseline.validationStats));
  assert.equal(JSON.stringify(observed.bestGenome.toJSON()), JSON.stringify(baseline.bestGenome.toJSON()));
  assert.ok(presentation.validationRun.frames.length > 500);
  assert.equal(presentation.validationRun.frames.at(-1).bikes[0].laps, 3);
  assert.equal(snapshot(baseline.population[0]), snapshot(observed.population[0]));
});

test("audio : nombre de moteurs constant, silence en entraînement, reprise et mix", async () => {
  const { AudioManager, race } = makeRace();
  const param = () => ({ value: 0, setTargetAtTime(value) { this.value = value; }, setValueAtTime(value) { this.value = value; }, exponentialRampToValueAtTime(value) { this.value = value; } });
  let oscillators = 0;
  class FakeContext {
    constructor() { this.destination = {}; this.currentTime = 0; this.sampleRate = 100; this.state = "suspended"; }
    async resume() { this.state = "running"; }
    createGain() { return { gain: param(), connect() {}, disconnect() {} }; }
    createOscillator() { oscillators++; return { frequency: param(), connect() {}, start() {}, stop() {}, disconnect() {} }; }
    createBuffer() { return { getChannelData: () => new Float32Array(200) }; }
    createBufferSource() { return { connect() {}, start() {} }; }
    createBiquadFilter() { return { frequency: param(), connect() {} }; }
  }
  const audio = new AudioManager({ AudioContext: FakeContext }); assert.equal(await audio.enable(), true); assert.equal(oscillators, 8);
  audio.update(race.population, "RACE", 10, true, 0); assert.ok(audio.voices[0].gain.gain.value > 0);
  audio.update(race.population, "RACE", 20, false, 0); assert.ok(audio.voices.every(voice => voice.gain.gain.value === 0));
  assert.equal(audio.crowd.gain.value, 0); assert.equal(audio.ambience.gain.value, 0);
  audio.setVolume("master", 0.75); assert.equal(audio.master.gain.value, 0.75); audio.mute(true); assert.equal(audio.master.gain.value, 0);
  await audio.enable(); assert.equal(oscillators, 8, "repeated gesture never creates extra engine pool");
});

test("désactiver replay retire son enregistrement ; détacher drapeaux évite accumulation", () => {
  const { race, events } = makeRace({}, 1); const listeners = events.listeners.size;
  race.recordReplay = false; race.transition("RACE"); for (let i = 0; i < 20; i++) race.step();
  assert.equal(race.replay.frames.length, 0); race.flags.dispose(); assert.equal(events.listeners.size, listeners - 1);
});

test("analyse virages : mesures réelles, entrée/sortie, minimum et échec sans toucher pilote", () => {
  const { race, RaceAnalytics, circuit } = makeRace({}, 1); const bike = race.population[0]; const analytics = new RaceAnalytics(circuit);
  assert.equal(analytics.report().length, 13); assert.equal(analytics.report()[0].entrySpeed, null);
  const point = circuit.centerline[3]; bike.pos.set(point.x, point.y); bike.vel.set(3, 0); bike.lastSteering = -0.5;
  const before = snapshot(bike); analytics.sample(bike); assert.equal(snapshot(bike), before);
  bike.vel.set(1, 0); analytics.sample(bike);
  const exit = circuit.centerline[5]; bike.pos.set(exit.x, exit.y); bike.vel.set(4, 0); analytics.sample(bike);
  let report = analytics.report()[0]; assert.equal(report.entries, 1); assert.equal(report.entrySpeed, 3); assert.equal(report.minimumSpeed, 1); assert.equal(report.exitSpeed, 4); assert.equal(report.averageSteering, 0.5);
  bike.pos.set(point.x, point.y); analytics.sample(bike); analytics.fail(bike);
  report = analytics.report()[0]; assert.equal(report.entries, 2); assert.equal(report.failureRate, 0.5);
});

test("HUD conserve les boutons entre actualisations pour permettre un clic fiable", () => {
  const a = makeRace({}, 1);
  class Element {
    constructor() { this.children = []; this.dataset = {}; this.replacements = 0; }
    append(...nodes) { this.children.push(...nodes); }
    appendChild(node) { this.children.push(node); }
    replaceChildren(...nodes) { this.replacements++; this.children = nodes; }
    addEventListener() {}
    setAttribute() {}
  }
  a.context.document = { createElement: () => new Element() };
  const nodes = new Map(["broadcast", "center", "subtitle", "telemetry"].map(key => [key, new Element()]));
  const p = Object.create(a.GrandPrixPresentation.prototype);
  Object.assign(p, { race: a.race, raceToken: 1, clock: 200, lastPanel: -Infinity, hud: {}, camera: { selected: 0, mode: "OVERVIEW" },
    settings: { hud: true, subtitles: true }, commentary: { subtitleUntil: 0 }, generation: 1, fitness: 0, get: key => nodes.get(key), result: new Element() });
  a.race.transition("INTRO"); p.renderPanels(false, null);
  const button = nodes.get("center").children[2]; const replacements = nodes.get("center").replacements;
  for (let i = 0; i < 10; i++) { p.clock += 200; p.renderPanels(false, null); }
  assert.equal(nodes.get("center").replacements, replacements); assert.equal(nodes.get("center").children[2], button);
  a.race.transition("LIGHTS"); p.clock += 200; p.renderPanels(false, null);
  assert.equal(nodes.get("center").replacements, replacements + 1);
});

test("cliquer sur un pilote dans la tour sélectionne ce pilote et actualise la carte même en mode Cinematic", () => {
  const a = makeRace({}, 4);
  class Element {
    constructor() { this.children = []; this.dataset = {}; this.replacements = 0; this.style = { setProperty() {} }; }
    append(...nodes) { this.children.push(...nodes); }
    appendChild(node) { this.children.push(node); }
    replaceChildren(...nodes) { this.replacements++; this.children = nodes; }
    addEventListener() {}
    setAttribute() {}
  }
  a.context.document = { createElement: () => new Element() };
  const nodes = new Map(["broadcast", "center", "subtitle", "telemetry", "rider-card", "camera"].map(key => [key, new Element()]));
  const p = Object.create(a.GrandPrixPresentation.prototype);
  Object.assign(p, {
    race: a.race, raceToken: 1, clock: 200, lastPanel: -Infinity, hud: {},
    camera: { selected: 0, mode: "CINEMATIC" },
    cardRiderId: null, cardDismissed: false,
    settings: { hud: true, subtitles: true }, commentary: { subtitleUntil: 0 },
    generation: 1, fitness: 0, get: key => nodes.get(key), result: new Element(),
    host: { isPaused: () => false }
  });
  a.race.transition("RACE");
  p.renderPanels(false, null);
  assert.equal(p.camera.selected, 0);

  // Click on rider 2 in standings tower
  p.selectRider(2);
  assert.equal(p.cardRiderId, 2);
  assert.equal(p.camera.selected, 2);
  assert.equal(p.camera.mode, "FOLLOW_SELECTED");
  assert.equal(p.cardDismissed, false);
});

