const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { runtime, ReferenceInference } = require("./helpers/runtime.cjs");

class Element {
  constructor(tag = "div") { this.tag = tag; this.children = []; this.listeners = {}; this.dataset = {}; }
  append(...nodes) { this.children.push(...nodes); }
  appendChild(node) { this.append(node); }
  insertBefore(node, before) { this.children.splice(this.children.indexOf(before), 0, node); }
  addEventListener(event, action) { this.listeners[event] = action; }
  set innerHTML(value) { this.children = []; this.html = value; }
  click() { return this.listeners.click?.(); }
  querySelector() { return this.status || (this.status = new Element()); }
  all() { return [this, ...this.children.flatMap(child => child instanceof Element ? child.all() : [])]; }
}

async function app(values = new Map(), Presentation) {
  const api = runtime();
  const context = api.context;
  const container = new Element();
  Object.assign(context, {
    document: { createElement: tag => new Element(tag), createTextNode: text => text, getElementById: () => container },
    localStorage: { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) },
    GPUInferenceEngine: class extends ReferenceInference { async initialize() {} },
    createCanvas: (width, height) => { Object.assign(context, { width, height }); return { parent() {} }; },
    frameRate() {}, CENTER: 0, LEFT: 0, TOP: 0
  });
  for (const file of ["model-storage.js", "model-files.js", "ui.js", "sketch.js"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), context, { filename: file });
  }
  if (Presentation) context.GrandPrixPresentation = Presentation;
  vm.runInContext("setup()", context);
  await new Promise(resolve => setImmediate(resolve));
  const state = () => vm.runInContext("({simulation, controls, paused, interfaceMessage})", context);
  assert.ok(state().simulation, "simulation initialisée");
  const click = label => {
    const button = container.all().find(node => node.tag === "button" && node.textContent === label);
    assert.ok(button, label); return button.listeners.click();
  };
  const set = (key, value) => {
    state().controls.inputs[key].value = value;
    state().controls.inputs[key].listeners.input();
  };
  const render = () => { const s = state(); s.controls.render(s.simulation, s.paused, s.interfaceMessage); };
  return { ...api, state, click, set, render, values, container };
}

const fitnessKeys = { fitCheckpoints: "checkpoints", fitDistance: "distance", fitProgress: "progress", fitLaps: "laps",
  fitLapTime: "lapTime", fitOffTrack: "offTrack", fitCollision: "collision", fitWrongWay: "wrongWay",
  fitStagnation: "stagnation", fitShortcut: "shortcut", fitMissed: "missedCheckpoint" };
function mapped(config, key) { return key in fitnessKeys ? config.fitnessWeights[fitnessKeys[key]] : config[key] ?? config.vehicle[key]; }

test("vider/restaurer synchronise les deux sélecteurs sans remplacer le cerveau actif ou le GPU", async () => {
  let gp;
  class Presentation {
    constructor(container, host) { gp = this; this.host = host; this.notice = {}; }
    setModels(models) { this.models = models; }
  }
  const a = await app(new Map(), Presentation), sim = a.state().simulation;
  sim.bestGenome = sim.genomes[0].copy(); a.state().controls.modelName.value = "à retirer";
  a.click("Sauvegarder meilleur modèle");
  const before = sim.genomes, inference = sim.inference.genomes;
  assert.ok(gp.host.raceModels().length > 0);
  assert.equal(gp.host.clearModels(), 1);
  assert.equal(gp.models.length, 0); assert.equal(a.state().controls.models.length, 0);
  assert.equal(gp.host.hasModelRecovery(), true);
  assert.equal(gp.host.restoreModels(), 1);
  assert.equal(gp.models.length, 1);
  assert.equal(sim.genomes, before); assert.equal(sim.inference.genomes, inference);
});

test("bibliothèque course reliée aux vraies sauvegardes/imports ; importer pendant course conserve le lot GPU", async () => {
  let gp;
  class Presentation {
    constructor(container, host) { gp = this; this.host = host; this.notice = {}; this.setModels(host.raceModels()); }
    setModels(models, selectedId) { this.models = models; this.selectedId = selectedId || ""; }
  }
  const a = await app(new Map(), Presentation); const { simulation: sim, controls: ui } = a.state();
  assert.equal(gp.models.length, 0); assert.equal(gp.host.raceModel(""), null);
  assert.equal(gp.host.raceModel("missing"), null);
  sim.bestGenome = sim.genomes[0].copy(); ui.modelName.value = "course";
  a.click("Sauvegarder meilleur modèle");
  assert.equal(gp.models.length, 1); assert.equal(gp.selectedId, ui.modelSelect.value);
  const model = gp.host.raceModel(gp.selectedId);
  assert.equal(JSON.stringify(model.genome.toJSON()), JSON.stringify(sim.bestGenome.toJSON()));
  let opened = 0; ui.importInput.click = () => opened++; gp.host.importModel(); assert.equal(opened, 1);
  const exported = a.context.ModelStorage.exportModel(a.context.localStorage, gp.selectedId);
  gp.race = {}; const population = sim.population; const inferenceBatch = sim.inference.genomes;
  ui.importInput.files = [{ name: "model.json", size: exported.length, text: async () => exported }];
  await ui.importInput.listeners.change();
  assert.equal(gp.models.length, 2); assert.equal(gp.selectedId, ui.modelSelect.value);
  assert.equal(sim.population, population); assert.equal(sim.inference.genomes, inferenceBatch);
  assert.match(gp.notice.textContent, /prochaine course/);
  assert.equal(gp.host.raceModel(gp.selectedId).metadata.imported, true);
  ui.importInput.files = [{ name: "bad.json", size: 1, text: async () => "{" }];
  await ui.importInput.listeners.change();
  assert.match(gp.notice.textContent, /Import impossible/); assert.equal(sim.inference.genomes, inferenceBatch);
});

test("29 curseurs : bornes, pas, affichage, configuration et restauration complète", async () => {
  const { state, set, container } = await app();
  const ui = state().controls;
  assert.equal(Object.keys(ui.inputs).length, 29);
  const original = JSON.parse(JSON.stringify(ui.config()));
  for (const [key, input] of Object.entries(ui.inputs)) {
    assert.ok(container.all().some(node => node.htmlFor === input.id), key + " accessible");
    assert.ok(Number(input.step) > 0);
    for (const value of [Number(input.min), Number(input.max), Number(input.min) + Number(input.step)]) {
      set(key, value);
      assert.equal(Number(ui.outputs[key].value), value, key + " affichage");
      assert.equal(mapped(ui.config(), key), value, key + " transmis");
    }
  }
  ui.applyConfig(original);
  assert.equal(JSON.stringify(ui.config()), JSON.stringify(original));
  for (const key of Object.keys(ui.inputs)) assert.equal(Number(ui.outputs[key].value), mapped(original, key));
});

test("pause, vitesse simulation, reprise et affichage réel des trois options", async () => {
  const a = await app();
  const { simulation: sim, controls: ui } = a.state();
  const renders = [];
  let ticks = 0;
  sim.step = () => { ticks++; };
  sim.circuit.draw = checkpoints => renders.push(["track", checkpoints]);
  sim.population.forEach((bike, index) => { bike.show = (sensors, leader) => renders.push([index, sensors, leader]); });
  Object.assign(a.context, { background() {}, noStroke() {}, fill() {}, textSize() {}, textAlign() {}, text() {} });
  const draw = () => vm.runInContext("draw()", a.context);
  a.click("Démarrer / pause"); draw(); assert.equal(ticks, 0);
  a.set("simulationSpeed", 7); a.click("Démarrer / pause"); draw(); assert.equal(ticks, 7);
  a.set("simulationSpeed", 1); draw(); assert.equal(ticks, 8);
  ui.checkboxes.sensors.checked = true;
  ui.checkboxes.checkpoints.checked = false;
  ui.checkboxes.bestOnly.checked = true;
  renders.length = 0; draw();
  assert.equal(renders.length, 2);
  assert.deepEqual(renders[0], ["track", false]);
  assert.deepEqual(renders[1].slice(1), [true, true]);
  ui.checkboxes.bestOnly.checked = false; ui.checkboxes.sensors.checked = false; ui.checkboxes.checkpoints.checked = true;
  renders.length = 0; draw();
  assert.equal(renders.length, sim.population.length + 1);
  assert.equal(renders[0][1], true);
  assert.ok(renders.slice(1).every(render => render[1] === false));
});

test("nouvelle population applique tous paramètres, cinq profils et graine reproductible", async () => {
  const a = await app();
  a.set("populationSize", 20); a.set("scenarioCount", 1); a.set("trackWidth", 50);
  a.set("maxSpeed", 7); a.set("maxForce", 0.3); a.set("acceleration", 1.5); a.set("brakingPower", 1.6);
  a.set("sensorRange", 140); a.set("noiseLevel", 2); a.set("grip", 0.8); a.set("scenarioSeconds", 50); a.set("seed", 88);
  const signatures = [];
  for (const profile of ["prudent", "balanced", "aggressive", "lateBraking", "smoothLine"]) {
    a.state().controls.profile.value = profile; a.click("Nouvelle population");
    const sim = a.state().simulation;
    assert.equal(sim.profile, profile); assert.equal(sim.genomes.length, 20); assert.equal(sim.scenarios.length, 1);
    assert.equal(sim.circuit.trackWidth, 50); assert.equal(sim.maxFramesPerScenario, 3000);
    assert.equal(sim.population[0].maxforce, 0.3);
    assert.equal(sim.population[0].maxspeed, 7 * sim.population[0].scenario.engineFactor);
    assert.equal(JSON.stringify(sim.population[0].parameters), JSON.stringify(a.state().controls.config().vehicle));
    signatures.push(JSON.stringify(sim.genomes[0].toJSON()));
    a.click("Nouvelle population"); assert.equal(JSON.stringify(sim.genomes[0].toJSON()), signatures.at(-1));
  }
  assert.equal(new Set(signatures).size, 5);
});

test("validation lit les derniers curseurs même sans nouvelle image ; reprise conserve champion", async () => {
  const a = await app(); const sim = a.state().simulation;
  a.click("Relancer validation"); assert.match(a.state().interfaceMessage, /Aucun meilleur/);
  sim.bestGenome = sim.genomes[0].copy();
  const champion = JSON.stringify(sim.bestGenome.toJSON());
  a.set("trackWidth", 52); a.set("maxForce", 0.4);
  a.click("Relancer validation");
  assert.equal(sim.circuit.trackWidth, 52); assert.equal(sim.population[0].maxforce, 0.4);
  assert.equal(sim.status, "validation en cours"); assert.equal(sim.scenarios.length, 3);
  sim.status = sim.validation.fail("test");
  a.set("populationSize", 30); a.click("Reprendre entraînement");
  assert.equal(sim.status, "entraînement en cours"); assert.equal(sim.genomes.length, 30);
  assert.equal(sim.validation.failure, null); assert.equal(sim.validationStats.length, 0);
  assert.equal(JSON.stringify(sim.genomes[0].toJSON()), champion);
  a.click("Reprendre entraînement"); assert.match(a.state().interfaceMessage, /déjà actif/);
});

test("sauvegarder/charger : vide, restauration complète, validation, stockage interdit et données corrompues", async () => {
  const a = await app(); const sim = a.state().simulation;
  a.click("Sauvegarder meilleur modèle"); assert.match(a.state().interfaceMessage, /Aucun meilleur/);
  a.click("Charger modèle"); assert.match(a.state().interfaceMessage, /Aucun modèle sauvegardé/);
  sim.bestGenome = sim.genomes[0].copy();
  const saved = JSON.stringify(sim.runConfig);
  a.click("Sauvegarder meilleur modèle"); assert.equal(a.values.size, 1);
  a.set("trackWidth", 24); a.set("seed", 99); a.set("maxForce", 0.5);
  a.click("Charger modèle");
  assert.equal(JSON.stringify(sim.runConfig), saved); assert.equal(sim.status, "validation en cours");
  assert.equal(a.state().paused, false); assert.equal(sim.validationStats.length, 0);
  a.context.localStorage.setItem = () => { throw new Error("quota dépassé"); };
  assert.doesNotThrow(() => a.click("Sauvegarder meilleur modèle"));
  assert.match(a.state().interfaceMessage, /Sauvegarde impossible.*quota dépassé/);
  for (const key of a.values.keys()) a.values.set(key, "{broken");
  assert.doesNotThrow(() => a.click("Charger modèle")); assert.match(a.state().interfaceMessage, /Chargement impossible/);
});

test("nouvelle population efface échec validation et statistiques périmées", async () => {
  const a = await app(); const sim = a.state().simulation;
  sim.validation.fail("sortie de piste");
  a.click("Nouvelle population"); a.render();
  assert.equal(sim.validation.failure, null);
  assert.doesNotMatch(a.state().controls.stats.textContent, /Échec validation/);
});

test("réglages différés : physique figée, nouvel algorithme génétique et scénario appliqués dès génération suivante", async () => {
  const a = await app(); const sim = a.state().simulation;
  let options;
  const evolve = a.context.GeneticAlgorithm.prototype.evolve;
  a.context.GeneticAlgorithm.prototype.evolve = function (evaluated) { options = this.options; return evolve.call(this, evaluated); };
  a.set("populationSize", 20); a.set("scenarioCount", 2); a.set("trainingGenerations", 30);
  a.set("mutationRate", 0.3); a.set("mutationAmplitude", 0.7); a.set("crossoverRate", 0.2); a.set("eliteCount", 3);
  a.set("maxForce", 0.4); a.set("trackWidth", 50); a.set("fitCollision", 1000);
  sim.updateConfig(a.state().controls.config()); a.render();
  assert.match(a.state().controls.stats.textContent, /Réglages en attente/);
  assert.equal(sim.population[0].maxforce, 0.18); assert.equal(sim.circuit.trackWidth, 44);
  const generation = sim.generation;
  while (sim.generation === generation) {
    sim.population.forEach(bike => bike.fail("test")); sim.finishScenario();
  }
  assert.equal(options.mutationRate, 0.3); assert.equal(options.mutationAmplitude, 0.7);
  assert.equal(options.crossoverRate, 0.2); assert.equal(options.eliteCount, 3);
  assert.equal(sim.genomes.length, 20); assert.equal(sim.scenarios.length, 2);
  assert.equal(sim.population[0].maxforce, 0.4); assert.equal(sim.circuit.trackWidth, 50);
  assert.equal(sim.runConfig.fitnessWeights.collision, 1000); assert.equal(sim.trainingBudgetEnd, 31);
  a.render(); assert.match(a.state().controls.stats.textContent, /Réglages actifs/);
});

test("11 poids fitness : chaque curseur modifie effectivement récompense ou pénalité", async () => {
  const a = await app();
  const stats = { ...a.Motorcycle.emptyStats("test"), checkpoints: 1, distanceOnTrack: 1, progressToNext: 1,
    laps: 1, bestLapTime: 60000, offTrackFrames: 1, collisions: 1, wrongWay: 1, stagnation: 1,
    shortcuts: 1, missedCheckpoints: 1 };
  const ui = a.state().controls;
  const original = JSON.parse(JSON.stringify(ui.config()));
  const baseline = a.Fitness.calculateFitness(stats, original.fitnessWeights);
  for (const [key, component] of Object.entries(fitnessKeys)) {
    ui.applyConfig(original);
    a.set(key, Number(ui.inputs[key].max));
    const score = a.Fitness.calculateFitness(stats, ui.config().fitnessWeights);
    assert.ok(["checkpoints", "distance", "progress", "laps", "lapTime"].includes(component)
      ? score > baseline : score < baseline, key + " effet réel");
  }
});

test("Démarrer relance vraiment après budget épuisé ou validation échouée", async () => {
  for (const status of ["entraînement en pause", "validation échouée"]) {
    const a = await app(); const sim = a.state().simulation;
    sim.mode = status === "entraînement en pause" ? "budget" : "validation";
    sim.status = status;
    sim.population.forEach(bike => bike.fail("test"));
    a.click("Démarrer / pause");
    assert.equal(a.state().paused, false);
    assert.equal(sim.status, "entraînement en cours");
    assert.ok(sim.remaining() > 0);
  }
});

test("Démarrer après validation réussie relance les trois tours, sans effacer le génome", async () => {
  const a = await app(); const sim = a.state().simulation;
  sim.bestGenome = sim.genomes[0].copy();
  const genome = JSON.stringify(sim.bestGenome.toJSON());
  sim.mode = "validation"; sim.status = "modèle validé";
  a.click("Démarrer / pause");
  assert.equal(sim.status, "validation en cours"); assert.equal(a.state().paused, false);
  assert.equal(JSON.stringify(sim.bestGenome.toJSON()), genome);
});

test("Appliquer transmet les 29 curseurs sans attendre une génération ni perdre les génomes", async () => {
  const a = await app(); const sim = a.state().simulation; const ui = a.state().controls;
  const original = JSON.parse(JSON.stringify(ui.config()));
  a.click("Démarrer / pause");
  for (const [key, input] of Object.entries(ui.inputs)) {
    ui.applyConfig(original);
    a.set(key, Number(input.min) + Number(input.step));
    const genome = JSON.stringify(sim.genomes[0].toJSON());
    const generation = sim.generation;
    a.click("Appliquer les réglages");
    assert.equal(mapped(sim.runConfig, key), mapped(ui.config(), key), key + " appliqué");
    assert.equal(sim.population.length, ui.config().populationSize);
    assert.equal(sim.genomes.length, ui.config().populationSize);
    assert.equal(JSON.stringify(sim.genomes[0].toJSON()), genome);
    assert.equal(sim.generation, generation); assert.equal(a.state().paused, true);
    assert.equal(sim.frame, 0);
  }
});

test("Appliquer pendant validation réinitialise tous les tours pour les nouvelles conditions", async () => {
  const a = await app(); const sim = a.state().simulation;
  sim.bestGenome = sim.genomes[0].copy(); a.click("Relancer validation");
  sim.validationStats = [{ time: 1000 }];
  a.set("trackWidth", 52); a.click("Appliquer les réglages");
  assert.equal(sim.circuit.trackWidth, 52); assert.equal(sim.status, "validation en cours");
  assert.equal(sim.validationStats.length, 0); assert.equal(sim.scenarioIndex, 0);
  assert.equal(sim.population.length, 1);
});

test("rendu entraînement masque éliminés et pilotes arrivés plutôt que des obstacles immobiles", async () => {
  const a = await app(); const sim = a.state().simulation;
  sim.population[0].fail("collision"); sim.population[1].finished = true;
  let shown = 0;
  sim.step = () => {};
  sim.circuit.draw = () => {};
  sim.population.forEach(bike => { bike.show = () => { assert.ok(!bike.dead && !bike.finished); shown++; }; });
  Object.assign(a.context, { background() {}, noStroke() {}, fill() {}, textSize() {}, textAlign() {}, text() {} });
  vm.runInContext("draw()", a.context);
  assert.equal(shown, sim.population.length - 2);
  assert.match(a.state().controls.stats.textContent, /Pilote affiché : en course/);
});

test("sauvegarde et chargement donnent un retour visible immédiat sans appeler draw", async () => {
  const a = await app(); const ui = a.state().controls;
  a.click("Sauvegarder meilleur modèle");
  assert.match(ui.actionFeedback.textContent, /première génération/i);
  assert.equal(ui.actionFeedback.hidden, false);
  assert.equal(ui.actionFeedback.role, "status");
  a.click("Charger modèle");
  assert.match(ui.actionFeedback.textContent, /Aucun modèle sauvegardé/);
  assert.match(ui.actionFeedback.textContent, /adresse|port/);
  a.state().simulation.bestGenome = a.state().simulation.genomes[0].copy();
  a.click("Sauvegarder meilleur modèle");
  assert.match(ui.actionFeedback.textContent, /sauvegardé/);
  assert.equal(ui.actionFeedback.dataset.tone, "success");
  a.click("Charger modèle");
  assert.match(ui.actionFeedback.textContent, /Modèle chargé/);
  a.context.localStorage.setItem = () => { throw new Error("stockage interdit"); };
  a.click("Sauvegarder meilleur modèle");
  assert.match(ui.actionFeedback.textContent, /stockage interdit/);
  assert.equal(ui.actionFeedback.dataset.tone, "error");
});

test("GPU non initialisé ou indisponible : boutons stockage ne restent jamais silencieux", async () => {
  const a = await app(); const ui = a.state().controls;
  vm.runInContext('simulation = undefined; startupError = "RTX indisponible"', a.context);
  for (const label of ["Sauvegarder meilleur modèle", "Charger modèle"]) {
    a.click(label);
    assert.match(ui.actionFeedback.textContent, /RTX indisponible/);
    assert.equal(ui.actionFeedback.dataset.tone, "error");
  }
  vm.runInContext('startupError = ""', a.context);
  a.click("Charger modèle");
  assert.match(ui.actionFeedback.textContent, /Initialisation GPU en cours/);
});

test("chargement après rechargement complet de l'application restaure la sauvegarde persistante", async () => {
  const storage = new Map(); const first = await app(storage);
  first.set("trackWidth", 50); first.click("Nouvelle population");
  first.state().simulation.bestGenome = first.state().simulation.genomes[0].copy();
  const genome = JSON.stringify(first.state().simulation.bestGenome.toJSON());
  first.click("Sauvegarder meilleur modèle");
  const reloaded = await app(storage);
  assert.equal(reloaded.state().simulation.bestGenome, null);
  reloaded.click("Charger modèle");
  assert.equal(JSON.stringify(reloaded.state().simulation.bestGenome.toJSON()), genome);
  assert.equal(reloaded.state().simulation.circuit.trackWidth, 50);
  assert.equal(reloaded.state().simulation.status, "validation en cours");
  assert.match(reloaded.state().controls.actionFeedback.textContent, /Modèle chargé/);
});

test("bibliothèque UI : noms, sélection, export du bon génome, import et nouvelle validation", async () => {
  const a = await app(); const sim = a.state().simulation; const ui = a.state().controls;
  sim.bestGenome = sim.genomes[0].copy(); ui.modelName.value = "Prudent A";
  a.click("Sauvegarder meilleur modèle"); const first = ui.modelSelect.value;
  const genomeA = JSON.stringify(sim.bestGenome.toJSON());
  sim.bestGenome = sim.genomes[1].copy(); ui.modelName.value = "Agressif B";
  a.click("Sauvegarder meilleur modèle"); const second = ui.modelSelect.value;
  assert.notEqual(first, second); assert.equal(ui.models.length, 2);
  ui.modelSelect.value = first; ui.modelSelect.listeners.change();
  a.click("Charger modèle"); assert.equal(JSON.stringify(sim.bestGenome.toJSON()), genomeA);
  let exported;
  a.context.ModelFiles.download = (text, name) => { exported = text; assert.equal(name, "Équilibré — A"); };
  a.click("Exporter JSON"); assert.equal(JSON.stringify(JSON.parse(exported).genome), genomeA);
  const forged = JSON.parse(exported); forged.metadata.validated = true; forged.metadata.validationLaps = [{ time: 1 }, { time: 1 }, { time: 1 }];
  ui.importInput.files = [{ name: "import.json", size: 1000, text: async () => JSON.stringify(forged) }];
  await ui.importInput.listeners.change();
  assert.equal(ui.importInput.value, ""); assert.equal(ui.models.length, 3);
  assert.equal(ui.models.at(-1).metadata.validated, false);
  assert.equal(sim.status, "validation en cours"); assert.equal(sim.validationStats.length, 0);
  assert.equal(JSON.stringify(sim.bestGenome.toJSON()), genomeA);
  assert.match(ui.actionFeedback.textContent, /3 tours/);
});

test("import invalide ou sans GPU et export vide donnent un résultat explicite sans perdre les modèles", async () => {
  const a = await app(); const ui = a.state().controls;
  a.click("Exporter JSON"); assert.match(ui.actionFeedback.textContent, /Export impossible/);
  const valid = { version: 2, genome: a.state().simulation.genomes[0].toJSON(), metadata: { validated: true } };
  vm.runInContext('simulation = undefined; startupError = "RTX indisponible"', a.context);
  await ui.callbacks.import({ name: "hors-ligne.json", size: 100, text: async () => JSON.stringify(valid) });
  assert.equal(ui.models.length, 1); assert.equal(ui.models[0].metadata.validated, false);
  assert.match(ui.actionFeedback.textContent, /non validé/);
  await ui.callbacks.import({ name: "bad.json", size: 3, text: async () => "bad" });
  assert.match(ui.actionFeedback.textContent, /Import impossible/); assert.equal(ui.models.length, 1);
});

test("historique sauvegardé n'autorise jamais la validation courante avant exactement trois tours", async () => {
  const a = await app(); const sim = a.state().simulation; const ui = a.state().controls;
  sim.bestGenome = sim.genomes[0].copy(); a.click("Relancer validation");
  const bike = sim.population[0];
  for (let lap = 1; lap <= 3; lap++) {
    bike.stats.frames += 100; bike.stats.speedSum += 200;
    sim.handleValidationEvents(bike, [{ type: "lap", time: 22000 }]);
    assert.equal(sim.status, lap === 3 ? "modèle validé" : "validation en cours");
    a.click("Sauvegarder meilleur modèle");
    assert.equal(ui.models.at(-1).metadata.validated, lap === 3);
  }
  a.click("Charger modèle");
  assert.equal(sim.status, "validation en cours"); assert.equal(sim.validationStats.length, 0);
  sim.handleValidationEvents(sim.population[0], [{ type: "off-track" }]);
  assert.equal(sim.status, "validation échouée");
  a.click("Sauvegarder meilleur modèle"); assert.equal(ui.models.at(-1).metadata.validated, false);
});

test("charger un autre modèle efface score, chrono et population issus de l'ancien essai", async () => {
  const a = await app(); const sim = a.state().simulation;
  sim.bestGenome = sim.genomes[0].copy(); a.set("mutationRate", 0); a.click("Appliquer les réglages");
  a.click("Sauvegarder meilleur modèle");
  const stored = JSON.stringify(sim.bestGenome.toJSON());
  sim.bestScore = 999999; sim.bestLap = 123; sim.lastGeneration = { reasons: { ancien: 1 } };
  a.click("Charger modèle");
  assert.equal(sim.bestScore, 0); assert.equal(sim.bestLap, 0); assert.equal(sim.lastGeneration, null);
  a.click("Reprendre entraînement");
  assert.ok(sim.genomes.every(genome => JSON.stringify(genome.toJSON()) === stored), "mutation zéro : toute population descend du modèle chargé");
});

test("charger, modifier après deux tours, appliquer, puis refaire trois tours sans modifier l'original", async () => {
  const a = await app(); const sim = a.state().simulation; const ui = a.state().controls;
  sim.bestGenome = sim.genomes[0].copy(); a.click("Sauvegarder meilleur modèle");
  const original = a.context.ModelStorage.exportModel(a.context.localStorage, ui.modelSelect.value);
  a.click("Charger modèle");
  const gene = JSON.stringify(sim.bestGenome.toJSON());
  const lap = () => { const bike = sim.population[0]; bike.stats.frames += 100; bike.stats.speedSum += 200;
    sim.handleValidationEvents(bike, [{ type: "lap", time: 22000 }]); };
  lap(); lap(); assert.equal(sim.validationStats.length, 2);
  a.set("maxForce", 0.3); a.set("mutationRate", 0.4); a.render();
  assert.equal(sim.population[0].maxforce, 0.18); assert.equal(sim.validationStats.length, 2);
  assert.match(ui.stats.textContent, /Réglages en attente/);
  a.click("Appliquer les réglages");
  assert.equal(sim.population[0].maxforce, 0.3); assert.equal(sim.validationStats.length, 0);
  assert.equal(JSON.stringify(sim.bestGenome.toJSON()), gene);
  assert.match(a.state().interfaceMessage, /validation.*zéro/i);
  lap(); lap(); assert.equal(sim.status, "validation en cours");
  lap(); assert.equal(sim.status, "modèle validé");
  assert.equal(a.context.ModelStorage.exportModel(a.context.localStorage, ui.modelSelect.value), original);
});

test("changer le profil sans champion applique immédiatement une nouvelle population reproductible", async () => {
  const a = await app(); const sim = a.state().simulation; const ui = a.state().controls;
  const genes = JSON.stringify(sim.genomes.map(genome => genome.toJSON()));
  ui.profile.value = "aggressive"; ui.profile.listeners.change(); a.render();
  assert.equal(sim.profile, "aggressive");
  const applied = JSON.stringify(sim.genomes.map(genome => genome.toJSON()));
  assert.notEqual(applied, genes); assert.ok(sim.genomes.every(genome => genome.profile === "aggressive"));
  assert.equal(sim.bestGenome, null); assert.match(a.state().interfaceMessage, /appliqué immédiatement/);
  a.click("Nouvelle population"); assert.equal(JSON.stringify(sim.genomes.map(genome => genome.toJSON())), applied);
});

test("modèle validé équilibré → choix agressif → traits appliqués, validation annulée, sauvegarde/export cohérents", async () => {
  const a = await app(); const sim = a.state().simulation; const ui = a.state().controls;
  sim.bestGenome = sim.genomes[0].copy(); a.click("Relancer validation");
  for (let i = 0; i < 3; i++) {
    const bike = sim.population[0]; bike.stats.frames += 100; bike.stats.speedSum += 200;
    sim.handleValidationEvents(bike, [{ type: "lap", time: 22000 }]);
  }
  assert.equal(sim.status, "modèle validé");
  a.click("Sauvegarder meilleur modèle"); const priorId = ui.modelSelect.value;
  const prior = a.context.ModelStorage.exportModel(a.context.localStorage, priorId);
  const original = JSON.stringify(sim.bestGenome.toJSON());
  ui.profile.value = "aggressive"; ui.profile.listeners.change();
  assert.equal(sim.profile, "aggressive"); assert.equal(sim.bestGenome.profile, "aggressive");
  assert.equal(sim.status, "validation en cours"); assert.equal(sim.validationStats.length, 0);
  assert.equal(sim.validation.status, "validation en cours");
  assert.notEqual(JSON.stringify(sim.bestGenome.toJSON()), original);
  for (const key of ["weightsIH", "biasH", "weightsHO", "biasO"]) assert.equal(JSON.stringify(sim.bestGenome[key]), JSON.stringify(JSON.parse(original)[key]));
  assert.equal(JSON.stringify(Object.values(sim.bestGenome.traits)), JSON.stringify(a.context.DRIVING_PROFILES.aggressive));
  assert.equal(sim.population[0].genome.profile, "aggressive");
  assert.equal(sim.inference.genomes[0].profile, "aggressive");
  ui.modelName.value = "Jerez Aggressif"; a.render();
  assert.match(ui.saveProfileInfo.textContent, /Agressif — Jerez/);
  a.click("Sauvegarder meilleur modèle"); assert.equal(ui.modelName.value, "Agressif — Jerez");
  const saved = ui.models.at(-1); assert.equal(saved.metadata.profile, "aggressive"); assert.equal(saved.metadata.config.profile, "aggressive");
  assert.equal(saved.metadata.validated, false); assert.equal(saved.metadata.validationLaps.length, 0);
  let exported; a.context.ModelFiles.download = (text, name) => { exported = text; assert.equal(name, saved.name); };
  a.click("Exporter JSON"); assert.equal(JSON.parse(exported).genome.profile, "aggressive");
  assert.equal(a.context.ModelFiles.filename(exported, "Équilibré"), "agressif-jerez.json");
  a.click("Charger modèle"); assert.equal(ui.profile.value, "aggressive"); assert.match(ui.modelInfo.textContent, /Profil enregistré : Agressif/);
  assert.equal(a.context.ModelStorage.exportModel(a.context.localStorage, priorId), prior);
  sim.bestGenome.traits.direction = 0.123;
  const applied = JSON.stringify(sim.bestGenome.toJSON());
  ui.profile.listeners.change(); assert.equal(JSON.stringify(sim.bestGenome.toJSON()), applied, "même choix ne réinitialise pas les traits appris");
});

test("Appliquer et Sauvegarder synchronisent aussi un changement de profil sans événement DOM", async () => {
  for (const action of ["Appliquer les réglages", "Sauvegarder meilleur modèle"]) {
    const a = await app(); const { simulation: sim, controls: ui } = a.state();
    sim.bestGenome = sim.genomes[0].copy(); ui.profile.value = "prudent";
    a.click(action); assert.equal(sim.bestGenome.profile, "prudent");
    assert.equal(sim.profile, "prudent"); assert.equal(sim.status, "validation en cours");
    if (action === "Sauvegarder meilleur modèle") assert.equal(ui.models.at(-1).genome.profile, "prudent");
  }
});

test("changer de profil pendant course est refusé sans toucher au modèle ni au lot GPU", async () => {
  class Presentation {
    constructor(container, host) { this.host = host; this.race = {}; this.notice = {}; }
    setModels() {}
  }
  const a = await app(new Map(), Presentation); const { simulation: sim, controls: ui } = a.state();
  sim.bestGenome = sim.genomes[0].copy();
  const before = JSON.stringify(sim.bestGenome.toJSON()); const batch = sim.inference.genomes;
  ui.profile.value = "aggressive"; ui.profile.listeners.change();
  assert.equal(ui.profile.value, "balanced"); assert.equal(sim.profile, "balanced");
  assert.equal(JSON.stringify(sim.bestGenome.toJSON()), before); assert.equal(sim.inference.genomes, batch);
  assert.match(a.state().interfaceMessage, /Revenir en Training/);
});

test("commandes laboratoire protégées pendant course et initialisation ; export exige une sélection", async () => {
  class Presentation {
    constructor(container, host) { this.host = host; this.race = {}; this.notice = {}; }
    setModels() {}
  }
  const a = await app(new Map(), Presentation); const { simulation: sim, controls: ui } = a.state();
  sim.bestGenome = sim.genomes[0].copy(); const before = JSON.stringify(sim.bestGenome.toJSON()); const batch = sim.inference.genomes;
  for (const label of ["Nouvelle population", "Appliquer les réglages", "Relancer validation", "Reprendre entraînement", "Charger modèle"]) {
    a.click(label); assert.match(a.state().interfaceMessage, /Revenir en Training/);
    assert.equal(JSON.stringify(sim.bestGenome.toJSON()), before); assert.equal(sim.inference.genomes, batch);
  }
  a.click("Sauvegarder meilleur modèle"); ui.modelSelect.value = "";
  a.click("Exporter JSON"); assert.match(a.state().interfaceMessage, /Sélectionner un modèle/);
  vm.runInContext("simulation = undefined", a.context);
  for (const label of ["Démarrer / pause", "Nouvelle population", "Appliquer les réglages", "Relancer validation", "Reprendre entraînement"]) {
    a.click(label); assert.match(a.state().interfaceMessage, /Initialisation GPU/);
  }
});

test("profil personnalisé importé reste sélectionnable à l’affichage, sauvegardable et exportable sans conversion", async () => {
  const a = await app(); const ui = a.state().controls;
  const json = a.state().simulation.genomes[0].toJSON(); json.profile = "custom-driver";
  const text = JSON.stringify({ version: 2, name: "Prototype", genome: json });
  ui.importInput.files = [{ name: "custom.json", size: text.length, text: async () => text }];
  await ui.importInput.listeners.change();
  assert.equal(ui.profile.value, "custom-driver");
  const option = ui.profile.children.find(option => option.value === "custom-driver");
  assert.ok(option); assert.equal(option.disabled, true);
  assert.equal(ui.config().profile, "custom-driver");
  a.click("Sauvegarder meilleur modèle");
  assert.match(a.state().interfaceMessage, /sauvegardé/);
  assert.equal(JSON.stringify(ui.models.at(-1).genome), JSON.stringify(json));
  assert.equal(ui.modelName.value, "Personnalisé — Prototype");
  a.click("Nouvelle population"); assert.match(a.state().interfaceMessage, /sans préréglage/);
  assert.equal(JSON.stringify(a.state().simulation.bestGenome.toJSON()), JSON.stringify(json));
});

test("chaque commande actualise le retour visible ; validation sans champion respecte pause", async () => {
  const a = await app(); const { controls: ui } = a.state();
  a.click("Sauvegarder meilleur modèle"); assert.match(ui.actionFeedback.textContent, /Aucun meilleur/);
  a.click("Démarrer / pause"); assert.equal(a.state().paused, true); assert.match(ui.actionFeedback.textContent, /en pause/);
  a.click("Relancer validation"); assert.equal(a.state().paused, true);
  assert.equal(ui.actionFeedback.textContent, a.state().interfaceMessage);
  a.click("Reprendre entraînement"); assert.equal(a.state().paused, false); assert.match(ui.actionFeedback.textContent, /repris/);
  a.click("Nouvelle population"); assert.match(ui.actionFeedback.textContent, /Nouvelle population/);
  a.click("Appliquer les réglages"); assert.match(ui.actionFeedback.textContent, /Réglages appliqués/);
});

test("le sélecteur explique les caractéristiques de chacun des cinq profils", async () => {
  const a = await app(); const ui = a.state().controls;
  for (const [profile, expected] of [["prudent", /freinage précoce/], ["balanced", /Compromis/], ["aggressive", /direction vive/], ["lateBraking", /plus tard/], ["smoothLine", /direction modérée/]]) {
    ui.profile.value = profile; ui.profile.listeners.change(); assert.match(ui.profileDescription.textContent, expected);
  }
});

test("mutation après chargement agit seulement à la reprise, sur descendants reproductibles du modèle", async () => {
  const a = await app(); const sim = a.state().simulation;
  sim.bestGenome = sim.genomes[0].copy(); a.click("Sauvegarder meilleur modèle");
  const saved = JSON.stringify(sim.bestGenome.toJSON());
  const resume = () => {
    a.click("Charger modèle"); a.set("mutationRate", 0.5); a.set("mutationAmplitude", 1);
    assert.equal(JSON.stringify(sim.bestGenome.toJSON()), saved);
    a.click("Reprendre entraînement");
    assert.equal(JSON.stringify(sim.genomes[0].toJSON()), saved);
    assert.ok(sim.genomes.slice(1).some(genome => JSON.stringify(genome.toJSON()) !== saved));
    return JSON.stringify(sim.genomes.map(genome => genome.toJSON()));
  };
  assert.equal(resume(), resume());
});

test("réglages en attente après réussite ne revendiquent pas une validation des nouvelles conditions", async () => {
  const a = await app(); const sim = a.state().simulation; const ui = a.state().controls;
  sim.bestGenome = sim.genomes[0].copy(); a.click("Relancer validation");
  for (let i = 0; i < 3; i++) {
    const bike = sim.population[0]; bike.stats.frames += 100; bike.stats.speedSum += 200;
    sim.handleValidationEvents(bike, [{ type: "lap", time: 22000 }]);
  }
  a.set("trackWidth", 52); a.render();
  assert.match(ui.stats.textContent, /Validation acquise pour les réglages actifs uniquement/);
  assert.equal(sim.circuit.trackWidth, 44);
  a.click("Appliquer les réglages");
  assert.equal(sim.circuit.trackWidth, 52); assert.equal(sim.status, "validation en cours");
  assert.equal(sim.validationStats.length, 0);
});
