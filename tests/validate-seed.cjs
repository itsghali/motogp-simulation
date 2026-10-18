const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { runtime, ReferenceInference, config } = require("./helpers/runtime.cjs");

const api = runtime();
const settings = config({ trainingGenerations: 1 });
const simulation = new api.LearningSimulation(new api.Circuit(920, 720, 44), settings, new ReferenceInference());
let steps = 0;
while (simulation.mode === "training" && steps++ < 4000) simulation.step();
assert.equal(simulation.mode, "validation");
const motorcycle = simulation.population[0];
while (simulation.status === "validation en cours" && steps++ < 14000) simulation.step();
assert.equal(simulation.status, "modèle validé");
assert.equal(simulation.population[0], motorcycle);
assert.equal(motorcycle.tracker.laps, 3);
assert.equal(motorcycle.stats.checkpoints, 63);
assert.ok(simulation.validationStats.every(lap => lap.offTrack === 0));
assert.equal(new Set(simulation.validationStats.map(lap => lap.scenario)).size, 3);
console.log(JSON.stringify({
  method: "Test numérique : locomotion Vehicle réelle, doublure p5.Vector, inférence CPU de référence ; aucun pilote scripté",
  seed: settings.seed, population: settings.populationSize, trainingScenarios: settings.scenarioCount,
  width: settings.trackWidth, status: simulation.status, checkpoints: motorcycle.stats.checkpoints,
  generation: simulation.generation, steps,
  genomeSha256: crypto.createHash("sha256").update(JSON.stringify(simulation.bestGenome.toJSON())).digest("hex"),
  laps: simulation.validationStats
}, null, 2));
