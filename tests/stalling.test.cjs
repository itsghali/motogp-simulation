const test = require("node:test");
const assert = require("node:assert/strict");
const { runtime, ReferenceInference, config } = require("./helpers/runtime.cjs");

test("afficher seulement meilleur sélectionne un pilote vivant, pas un éliminé mieux classé", () => {
  const a = runtime();
  const sim = new a.LearningSimulation(new a.Circuit(), config(), new ReferenceInference());
  sim.population[0].stats.checkpoints = 10;
  sim.population[0].fail("collision avec limite de piste");
  sim.population[1].stats.checkpoints = 8;
  sim.population[1].finished = true;
  assert.ok(!sim.leader().dead && !sim.leader().finished);
});

test("pilote immobile garde sa dernière orientation au lieu de viser le départ du circuit", () => {
  const a = runtime();
  const sim = new a.LearningSimulation(new a.Circuit(), config(), new ReferenceInference());
  const bike = sim.population[0];
  bike.heading = Math.PI / 2;
  bike.vel.set(0, 0);
  const force = bike.steeringForce({ steering: 0, throttle: 1, braking: 0 });
  assert.ok(force.y > 0);
  assert.ok(Math.abs(force.x) < 1e-8);
  assert.ok(force.mag() <= bike.maxforce + 1e-10);
  bike.parameters.noiseLevel = 0;
  bike.circuit.walls = [{ a: { x: bike.pos.x - 10, y: bike.pos.y + 5 }, b: { x: bike.pos.x + 10, y: bike.pos.y + 5 } }];
  assert.ok(Math.abs(bike.castSensor(0) - 5) < 1e-8);
});

test("absence de progression élimine aussi un pilote qui bouge sur place", () => {
  const a = runtime();
  const sim = new a.LearningSimulation(new a.Circuit(), config(), new ReferenceInference());
  const bike = sim.population[0];
  // Le déplacement local reste perceptible mais aucun nouveau progrès ordonné n'est réalisé.
  bike.vel.set(0.2, 0);
  for (let frame = 1; frame <= 301 && !bike.dead; frame++) {
    bike.age = frame;
    bike.updateRaceState(frame * 1000 / 60);
  }
  assert.equal(bike.dead, true);
  assert.equal(bike.stats.failureReason, "stagnation");
  assert.equal(bike.stats.stagnation, 1);
});

test("arrêt appris : génération continue après élimination des candidats sans accélération", () => {
  const a = runtime();
  const inference = new ReferenceInference();
  inference.predict = inputs => inputs.map(() => [0, -1]);
  const sim = new a.LearningSimulation(new a.Circuit(), config({ scenarioCount: 1 }), inference);
  for (let i = 0; i < 700 && sim.generation === 1; i++) sim.step();
  assert.equal(sim.generation, 2);
  assert.ok(sim.lastGeneration);
  assert.ok(sim.population.some(bike => !bike.dead));
});

test("validation ne compte jamais un pilote bloqué comme un tour réussi", () => {
  const a = runtime();
  const inference = new ReferenceInference();
  inference.predict = inputs => inputs.map(() => [0, -1]);
  const sim = new a.LearningSimulation(new a.Circuit(), config(), inference);
  sim.startValidation(sim.genomes[0]);
  sim.population[0].vel.set(0, 0);
  for (let i = 0; i < 310 && sim.status === "validation en cours"; i++) sim.step();
  assert.equal(sim.status, "validation échouée");
  assert.equal(sim.validation.failure, "stagnation");
  assert.equal(sim.validationStats.length, 0);
});

test("ramper à 0,12 px/pas ne retient pas le reste de la population jusqu'au timeout", () => {
  const a = runtime(); const sim = new a.LearningSimulation(new a.Circuit(), config(), new ReferenceInference());
  const bike = sim.population[0];
  bike.vel.set(0.12, 0);
  bike.tracker.update = () => { bike.tracker.maxProgressPixels += 0.12; return []; };
  for (let frame = 1; frame <= 301 && !bike.dead; frame++) {
    bike.age = frame; bike.updateRaceState(frame * 1000 / 60);
  }
  assert.equal(bike.stats.failureReason, "stagnation");
});
