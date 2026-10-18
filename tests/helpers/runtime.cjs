const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// Doublure arithmétique de p5.Vector ; Vehicle et sa locomotion restent les sources réelles.
class TestVector {
  constructor(x = 0, y = 0) { this.x = x; this.y = y; }
  set(x, y) { this.x = x; this.y = y; return this; }
  copy() { return new TestVector(this.x, this.y); }
  add(other) { this.x += other.x; this.y += other.y; return this; }
  mag() { return Math.hypot(this.x, this.y); }
  heading() { return Math.atan2(this.y, this.x); }
  setMag(value) { const n = this.mag(); if (n) { this.x *= value / n; this.y *= value / n; } return this; }
  normalize() { return this.setMag(1); }
  limit(value) { return this.mag() > value ? this.setMag(value) : this; }
  static fromAngle(angle) { return new TestVector(Math.cos(angle), Math.sin(angle)); }
  static dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
}

function runtime() {
  const context = vm.createContext({
    console, Math, p5: { Vector: TestVector }, createVector: (x, y) => new TestVector(x, y),
    radians: angle => angle * Math.PI / 180, SIGHT: 90, LIFESPAN: 100000, MUTATION_RATE: 0.08, start: { x: 0, y: 0 }
  });
  for (const file of ["configuration.js", "random.js", "genome.js", "scenario.js", "circuit.js", "fitness.js", "steering.js",
    "genetic-algorithm.js", "validation.js", "ray.js", "vehicle.js", "motorcycle-body.js", "motorcycle-prediction.js", "race-track-frame.js", "reference-steering.js", "motorcycle-avoidance.js", "race-steering.js", "drone-steering.js", "Drone.js", "Obstacle.js", "motorcycle.js", "simulation.js", "grand-prix-rules.js"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../..", file), "utf8"), context, { filename: file });
  }
  const api = vm.runInContext("({Vehicle, Motorcycle, LearningSimulation, Genome, SeededRandom, ScenarioFactory, Circuit, ProgressTracker, SteeringController, Fitness, CircuitGeometry})", context);
  api.context = context;
  return api;
}

class ReferenceInference {
  constructor() { this.backend = "référence numérique de test"; this.renderer = "test"; }
  setGenomes(genomes) { this.genomes = genomes; }
  predict(inputs) { return inputs.map((values, index) => this.genomes[index].predict(values)); }
}

function config(overrides = {}) {
  return {
    populationSize: 12, mutationRate: 0.08, mutationAmplitude: 0.18, crossoverRate: 0.8, eliteCount: 2,
    scenarioCount: 2, trainingGenerations: 10, scenarioSeconds: 30, seed: 2027, trackWidth: 44, profile: "balanced",
    vehicle: { maxSpeed: 5.5, maxForce: 0.18, acceleration: 1, brakingPower: 1.2, sensorRange: 90, noiseLevel: 1, grip: 1 },
    ...overrides
  };
}

module.exports = { runtime, ReferenceInference, config, TestVector };
