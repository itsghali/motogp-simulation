const test = require("node:test");
const assert = require("node:assert/strict");
require("../random.js");
const { Genome } = require("../genome.js");
const { ScenarioFactory } = require("../scenario.js");
const { ValidationManager } = require("../validation.js");
const { ModelStorage } = require("../model-storage.js");

test("scénarios reproductibles avec graine fixe", () => {
  const first = new ScenarioFactory(2027).createSet(4, "training", 3);
  const second = new ScenarioFactory(2027).createSet(4, "training", 3);
  assert.deepEqual(first, second);
});

test("scénarios varient et validation reste hors entraînement", () => {
  const factory = new ScenarioFactory(2027);
  const training = factory.createSet(5, "training", 1);
  const validation = factory.createSet(3, "validation", 10000);
  assert.equal(new Set(training.map(item => item.seed)).size, 5);
  assert.equal(validation.some(item => training.some(train => train.seed === item.seed)), false);
  for (const scenario of training) {
    assert.ok(scenario.grip >= 0.88 && scenario.grip <= 1.04);
    assert.ok(scenario.engineFactor >= 0.92 && scenario.engineFactor <= 1.07);
  }
});

function validLap(scenario) {
  return { valid: true, time: 90000, offTrackFrames: 0, missedCheckpoints: 0, wrongWay: 0, averageSpeed: 4.2, scenario };
}

test("validation réussit après exactement trois tours consécutifs et trois scénarios", () => {
  const validation = new ValidationManager(3, 3);
  assert.equal(validation.recordLap(validLap("validation-a")), "validation en cours");
  assert.equal(validation.recordLap(validLap("validation-b")), "validation en cours");
  assert.equal(validation.recordLap(validLap("validation-c")), "modèle validé");
  assert.equal(validation.laps.length, 3);
});

test("validation échoue sur sortie, checkpoint manqué ou scénario échoué", () => {
  for (const bad of [
    { offTrackFrames: 1 }, { missedCheckpoints: 1 }, { wrongWay: 1 }, { valid: false }
  ]) {
    const validation = new ValidationManager();
    assert.equal(validation.recordLap({ ...validLap("v"), ...bad }), "validation échouée");
  }
  const scenarioFailure = new ValidationManager();
  assert.equal(scenarioFailure.fail("scénario échoué"), "validation échouée");
});

test("trois tours sur moins de trois scénarios ne valident pas", () => {
  const validation = new ValidationManager(3, 3);
  validation.recordLap(validLap("a"));
  validation.recordLap(validLap("a"));
  assert.equal(validation.recordLap(validLap("b")), "validation échouée");
});

test("sauvegarde et recharge le génome sans perte", () => {
  const values = new Map();
  const storage = { setItem: (key, value) => values.set(key, value), getItem: key => values.get(key) || null };
  const genome = Genome.random(new globalThis.SeededRandom(42), "smoothLine");
  ModelStorage.saveGenome(storage, genome, { score: 12 });
  const loaded = ModelStorage.loadGenome(storage);
  assert.deepEqual(loaded.genome.toJSON(), genome.toJSON());
  assert.equal(loaded.metadata.score, 12);
});
