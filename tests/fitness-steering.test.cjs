const test = require("node:test");
const assert = require("node:assert/strict");
const { Fitness } = require("../fitness.js");
const { SteeringController } = require("../steering.js");

const stats = overrides => ({
  checkpoints: 4, distanceOnTrack: 100, progressToNext: 0.5, laps: 0, bestLapTime: 0,
  offTrackFrames: 0, collisions: 0, wrongWay: 0, stagnation: 0, shortcuts: 0,
  missedCheckpoints: 0, failed: false, ...overrides
});

test("fitness récompense progression et pénalise violations", () => {
  const clean = Fitness.calculateFitness(stats({}));
  const progressed = Fitness.calculateFitness(stats({ checkpoints: 5, distanceOnTrack: 140 }));
  const cheating = Fitness.calculateFitness(stats({ shortcuts: 1, missedCheckpoints: 1 }));
  assert.ok(progressed > clean);
  assert.ok(cheating < clean);
});

test("fitness globale moyenne et pénalité forte des échecs", () => {
  const success = Fitness.aggregateScenarioResults([stats({ laps: 1 }), stats({ laps: 1 }), stats({ laps: 1 })]);
  const unstable = Fitness.aggregateScenarioResults([stats({ laps: 1 }), stats({ failed: true }), stats({ failed: true })]);
  assert.ok(unstable < success * 0.2);
});

test("force de steering toujours limitée à maxForce", () => {
  const force = SteeringController.computeSteeringForce({ x: -10, y: 4 }, { x: 12, y: -9 }, 0.18);
  assert.ok(Math.hypot(force.x, force.y) <= 0.1800000001);
  const small = SteeringController.computeSteeringForce({ x: 1, y: 1 }, { x: 1.05, y: 1 }, 0.18);
  assert.equal(small.x, 0.050000000000000044);
});
