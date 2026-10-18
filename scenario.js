(function (root) {
  class ScenarioFactory {
    constructor(seed = 2027) {
      this.seed = seed >>> 0;
    }

    createSet(count, phase = "training", generation = 0) {
      const phaseSalt = phase === "validation" ? 0x51f15e : 0x7a1a1;
      const rng = new root.SeededRandom((this.seed ^ phaseSalt ^ Math.imul(generation + 1, 2654435761)) >>> 0);
      return Array.from({ length: count }, (_, index) => ({
        id: `${phase}-${generation}-${index}`,
        seed: Math.floor(rng.next() * 0xffffffff) >>> 0,
        startOffset: rng.range(-3.5, 3.5),
        headingOffset: rng.range(-0.075, 0.075),
        initialSpeedFactor: rng.range(0.25, 0.55),
        grip: rng.range(0.88, 1.04),
        sensorNoise: rng.range(0.65, 1.25),
        engineFactor: rng.range(0.92, 1.07),
        brakingFactor: rng.range(0.92, 1.07)
      }));
    }

    trainingSet(count, generation) {
      const scenarios = this.createSet(count, "training", 0);
      const rng = new root.SeededRandom((this.seed ^ Math.imul(generation, 0x9e3779b1)) >>> 0);
      for (let i = scenarios.length - 1; i > 0; i--) {
        const j = Math.floor(rng.next() * (i + 1));
        [scenarios[i], scenarios[j]] = [scenarios[j], scenarios[i]];
      }
      return scenarios;
    }
  }

  root.ScenarioFactory = ScenarioFactory;
  if (typeof module !== "undefined") module.exports = { ScenarioFactory };
})(typeof globalThis !== "undefined" ? globalThis : this);
