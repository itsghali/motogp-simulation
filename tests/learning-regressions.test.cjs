const test = require("node:test");
const assert = require("node:assert/strict");
const { runtime, ReferenceInference, config, TestVector } = require("./helpers/runtime.cjs");

test("capteurs : murs verticaux, horizontaux, obliques, derrière et hors portée", () => {
  const { Motorcycle } = runtime();
  const probe = (a, b, angle = 0) => Motorcycle.prototype.castSensor.call({
    headingAngle: () => 0, pos: { x: 0, y: 0 }, sight: 90, circuit: { walls: [{ a, b }] },
    random: { gaussian: () => 0 }, parameters: { noiseLevel: 0 }, scenario: { sensorNoise: 0 }
  }, angle);
  assert.equal(probe({ x: 5, y: -10 }, { x: 5, y: 10 }), 5);
  assert.ok(Math.abs(probe({ x: -10, y: 5 }, { x: 10, y: 5 }, Math.PI / 2) - 5) < 1e-8);
  assert.equal(probe({ x: 3, y: -2 }, { x: 7, y: 2 }), 5);
  assert.equal(probe({ x: -5, y: -10 }, { x: -5, y: 10 }), 90);
  assert.equal(probe({ x: 100, y: -10 }, { x: 100, y: 10 }), 90);
});

test("correction latérale évite le mur droit et le mur gauche", () => {
  const { SteeringController, Genome, SeededRandom } = runtime();
  const genome = Genome.random(new SeededRandom(42));
  const right = SteeringController.buildDecisionFromOutput(genome, [0, 0, 0, 0, 1, 1, 1, 0.4, 0.5], [0, 0]);
  const left = SteeringController.buildDecisionFromOutput(genome, [1, 1, 1, 0, 0, 0, 0, 0.4, 0.5], [0, 0]);
  assert.ok(right.steering < 0);
  assert.ok(left.steering > 0);
});

test("fitness conserve le progrès même quand tous les scénarios échouent et distingue les chronos", () => {
  const { Fitness, Motorcycle } = runtime();
  const short = { ...Motorcycle.emptyStats("t"), checkpoints: 1, distanceOnTrack: 100, failed: true, collisions: 1 };
  const far = { ...short, checkpoints: 5, distanceOnTrack: 500 };
  assert.ok(Fitness.aggregateScenarioResults([far, far]) > Fitness.aggregateScenarioResults([short, short]));
  assert.ok(Fitness.calculateFitness({ ...far, bestLapTime: 20000 }) > Fitness.calculateFitness({ ...far, bestLapTime: 30000 }));
});

test("géométrie : segments éloignés colinéaires et attente immobile ne franchissent rien", () => {
  const { CircuitGeometry, Circuit, ProgressTracker } = runtime();
  assert.equal(CircuitGeometry.segmentsIntersect({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 10, y: 0 }, { x: 11, y: 0 }), false);
  const circuit = new Circuit();
  const tracker = new ProgressTracker(circuit);
  assert.equal(tracker.update(circuit.checkpoints[0].center, circuit.checkpoints[0].center, 100).length, 0);
  assert.equal(tracker.started, false);
  const initialLength = circuit.totalPixels;
  circuit.setWidth(50);
  assert.equal(circuit.totalPixels, initialLength);
  assert.equal(circuit.trackWidth, 50);
  assert.equal(circuit.isOnTrack(circuit.startPose().position), true);
});

test("même scénario et même génome : même bruit quel que soit l'indice du candidat", () => {
  const { Motorcycle, Circuit, Genome, SeededRandom, ScenarioFactory } = runtime();
  const genome = Genome.random(new SeededRandom(5));
  const scenario = new ScenarioFactory(2027).trainingSet(1, 1)[0];
  const circuit = new Circuit(920, 720, 44);
  const a = new Motorcycle(genome, circuit, scenario, config().vehicle, 0);
  const b = new Motorcycle(genome, circuit, scenario, config().vehicle, 99);
  assert.equal(JSON.stringify(a.perceive()), JSON.stringify(b.perceive()));
});

test("candidats superposés restent indépendants après 60 pas", () => {
  const api = runtime();
  const inference = new ReferenceInference();
  inference.predict = inputs => inputs.map(() => [0, -1]);
  const sim = new api.LearningSimulation(new api.Circuit(), config({ populationSize: 2, scenarioCount: 1 }), inference);
  sim.population.forEach(bike => bike.vel.set(0, 0));
  for (let frame = 0; frame < 75; frame++) sim.step();
  assert.equal(sim.population[0].pos.x, sim.population[1].pos.x);
  assert.ok(sim.population.every(bike => !bike.dead && bike.stats.collisions === 0));
});

test("validation : trois tours, trois conditions réservées et aucune réinitialisation de moto", () => {
  const api = runtime();
  const sim = new api.LearningSimulation(new api.Circuit(), config(), new ReferenceInference());
  const trainingSeeds = sim.scenarios.map(scenario => scenario.seed);
  sim.startValidation(sim.genomes[0]);
  assert.ok(sim.scenarios.every(scenario => !trainingSeeds.includes(scenario.seed)));
  const bike = sim.population[0];
  const originalPosition = { x: bike.pos.x, y: bike.pos.y };
  const ids = new Set();
  for (let lap = 1; lap <= 3; lap++) {
    ids.add(bike.scenario.id);
    bike.stats.frames += 60;
    bike.stats.speedSum += 120;
    sim.handleValidationEvents(bike, [{ type: "lap", time: 1000 + lap }]);
    assert.equal(sim.population[0], bike);
    assert.equal(bike.pos.x, originalPosition.x);
    assert.equal(bike.pos.y, originalPosition.y);
    assert.equal(sim.status, lap < 3 ? "validation en cours" : "modèle validé");
    assert.equal(sim.validationStats[lap - 1].averageSpeed, 2);
  }
  assert.equal(ids.size, 3);
  assert.equal(sim.validationStats.length, 3);
});

test("validation immédiate refusée pour sortie, checkpoint manqué, mauvais sens et collision", () => {
  for (const event of ["off-track", "missed-checkpoint", "wrong-way", "shortcut"]) {
    const api = runtime();
    const sim = new api.LearningSimulation(new api.Circuit(), config(), new ReferenceInference());
    sim.startValidation(sim.genomes[0]);
    sim.handleValidationEvents(sim.population[0], [{ type: event }]);
    assert.equal(sim.status, "validation échouée");
    assert.equal(sim.validation.failure, event);
  }
  const api = runtime();
  const sim = new api.LearningSimulation(new api.Circuit(), config(), new ReferenceInference());
  sim.startValidation(sim.genomes[0]);
  sim.population[0].collide();
  sim.handleValidationEvents(sim.population[0], []);
  assert.equal(sim.status, "validation échouée");
  assert.match(sim.validation.failure, /collision/);
  assert.equal(sim.resumeTraining(), true);
});

test("ensembles de comparaison identiques et ordre de scénarios reproductible", () => {
  const { ScenarioFactory } = runtime();
  const factory = new ScenarioFactory(2027);
  const a = factory.trainingSet(8, 1);
  const b = factory.trainingSet(8, 2);
  const sorted = xs => JSON.stringify(xs.slice().sort((x, y) => x.id.localeCompare(y.id)));
  assert.equal(sorted(a), sorted(b));
  assert.notEqual(JSON.stringify(a), JSON.stringify(b));
  assert.equal(JSON.stringify(b), JSON.stringify(factory.trainingSet(8, 2)));
});

test("sortie, mauvais sens et retour sur place ne gagnent pas de distance", () => {
  const { Circuit, ProgressTracker } = runtime();
  const circuit = new Circuit(920, 720, 44);
  const tracker = new ProgressTracker(circuit);
  const cp = circuit.checkpoints[0];
  const before = { x: cp.center.x - cp.tangent.x * 4, y: cp.center.y - cp.tangent.y * 4 };
  const after = { x: cp.center.x + cp.tangent.x * 4, y: cp.center.y + cp.tangent.y * 4 };
  tracker.update(before, after, 100, { onTrack: true });
  const highWater = tracker.maxProgressPixels;
  const wrong = tracker.update(after, before, 200, { onTrack: true });
  assert.ok(wrong.some(event => event.type === "wrong-way"));
  assert.equal(tracker.validLap, false);
  tracker.update(before, after, 300, { onTrack: false });
  assert.equal(tracker.maxProgressPixels, highWater);
});

test("génotypes sauvegardés refusent les poids non finis et traits hors limites", () => {
  const { Genome, SeededRandom } = runtime();
  const data = Genome.random(new SeededRandom(1)).toJSON();
  data.weightsIH[0] = null;
  assert.throws(() => Genome.fromJSON(data), /Poids invalides/);
  data.weightsIH[0] = 0;
  data.traits.direction = 2;
  assert.throws(() => Genome.fromJSON(data), /Traits hors limites/);
});

test("forces finales bornées et locomotion déléguée à Vehicle", () => {
  const api = runtime();
  const genome = api.Genome.random(new api.SeededRandom(4));
  const scenario = new api.ScenarioFactory(1).trainingSet(1, 1)[0];
  const bike = new api.Motorcycle(genome, new api.Circuit(), scenario, config().vehicle);
  for (const steering of [-1, 0, 1]) {
    assert.ok(bike.steeringForce({ steering, throttle: 1, braking: 0 }).mag() <= bike.maxforce + 1e-10);
  }
  assert.equal(api.Motorcycle.prototype.update, api.Vehicle.prototype.update);
  assert.ok(bike.pos instanceof TestVector);
});

test("graine 2027 : sélection réelle puis trois tours continus sur scénarios réservés", () => {
  const api = runtime();
  const simulation = new api.LearningSimulation(new api.Circuit(920, 720, 44), config({ trainingGenerations: 1 }), new ReferenceInference());
  let steps = 0;
  while (simulation.mode === "training" && steps++ < 4000) simulation.step();
  assert.ok(simulation.lastGeneration);
  assert.ok(simulation.lastGeneration.distinctScores > 1);
  assert.equal(simulation.lastGeneration.total, 24);
  assert.ok(simulation.results.flat().every(result => result.failureReason !== "collision entre candidats"));
  assert.equal(simulation.mode, "validation");
  const bike = simulation.population[0];
  while (simulation.status === "validation en cours" && steps++ < 14000) simulation.step();
  assert.equal(simulation.status, "modèle validé");
  assert.equal(simulation.population[0], bike);
  assert.equal(bike.tracker.laps, 3);
  assert.equal(bike.stats.checkpoints, 63);
  assert.equal(simulation.validationStats.length, 3);
  assert.ok(simulation.validationStats.every(lap => lap.offTrack === 0 && lap.time > 0));
  assert.equal(new Set(simulation.validationStats.map(lap => lap.scenario)).size, 3);
});

test("budget sans tour terminé : pause reprenable au lieu de validation prématurée", () => {
  const api = runtime();
  const simulation = new api.LearningSimulation(new api.Circuit(), config({ trainingGenerations: 1, scenarioSeconds: 0.1 }), new ReferenceInference());
  for (let step = 0; step < 15; step++) simulation.step();
  assert.equal(simulation.mode, "budget");
  assert.equal(simulation.status, "entraînement en pause");
  const genome = JSON.stringify(simulation.bestGenome.toJSON());
  assert.equal(simulation.resumeTraining(), true);
  assert.equal(simulation.mode, "training");
  assert.equal(JSON.stringify(simulation.genomes[0].toJSON()), genome);
});

test("génome rechargé, largeur et force changées : trois nouveaux tours continus réels", () => {
  const a = runtime(); const settings = config();
  const sim = new a.LearningSimulation(new a.Circuit(920, 720, 44), settings, new ReferenceInference());
  let steps = 0;
  while (sim.mode === "training" && steps++ < 4000) sim.step();
  assert.equal(sim.mode, "validation");
  const json = JSON.stringify(sim.bestGenome.toJSON());
  sim.loadGenome(a.Genome.fromJSON(JSON.parse(json)));
  sim.updateConfig({ ...settings, trackWidth: 46, vehicle: { ...settings.vehicle, maxForce: 0.19 } });
  sim.startValidation();
  const bike = sim.population[0];
  steps = 0;
  while (sim.status === "validation en cours" && steps++ < 12000) {
    sim.step();
    if (sim.validationStats.length < 3) assert.notEqual(sim.status, "modèle validé");
  }
  assert.equal(sim.status, "modèle validé"); assert.equal(sim.population[0], bike);
  assert.equal(sim.circuit.trackWidth, 46); assert.equal(bike.maxforce, 0.19);
  assert.equal(JSON.stringify(sim.bestGenome.toJSON()), json);
  assert.equal(bike.tracker.laps, 3); assert.equal(bike.stats.checkpoints, 63);
  assert.equal(sim.validationStats.length, 3);
  assert.ok(sim.validationStats.every(lap => lap.offTrack === 0));
});
