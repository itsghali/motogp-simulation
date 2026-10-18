(function (root) {
  const TRAITS = [
    "anticipation", "direction", "braking", "acceleration",
    "aggressiveness", "trackCorrection", "cornerSensitivity"
  ];
  const INPUTS = 9;
  const HIDDEN = 12;
  const OUTPUTS = 2;

  const PROFILES = {
    prudent: [0.75, 0.45, 0.82, 0.38, 0.2, 0.78, 0.82],
    balanced: [0.58, 0.58, 0.58, 0.58, 0.5, 0.62, 0.62],
    aggressive: [0.5, 0.72, 0.3, 0.86, 0.9, 0.45, 0.48],
    lateBraking: [0.62, 0.68, 0.2, 0.82, 0.82, 0.52, 0.7],
    smoothLine: [0.82, 0.42, 0.68, 0.5, 0.35, 0.85, 0.72]
  };

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  class Genome {
    constructor(data) {
      this.profile = data.profile || "balanced";
      this.traits = { ...data.traits };
      this.weightsIH = data.weightsIH.slice();
      this.biasH = data.biasH.slice();
      this.weightsHO = data.weightsHO.slice();
      this.biasO = data.biasO.slice();
    }

    static random(rng, profile = "balanced") {
      const means = PROFILES[profile] || PROFILES.balanced;
      const traits = {};
      TRAITS.forEach((name, index) => {
        traits[name] = clamp(means[index] + rng.gaussian() * 0.08, 0, 1);
      });
      const weights = length => Array.from({ length }, () => rng.gaussian() * 0.55);
      return new Genome({
        profile,
        traits,
        weightsIH: weights(INPUTS * HIDDEN),
        biasH: weights(HIDDEN),
        weightsHO: weights(HIDDEN * OUTPUTS),
        biasO: weights(OUTPUTS)
      });
    }

    copy() {
      return new Genome(this.toJSON());
    }

    withProfile(profile) {
      if (!Object.prototype.hasOwnProperty.call(PROFILES, profile)) throw new Error("Profil de conduite inconnu");
      const genome = this.copy();
      genome.profile = profile;
      TRAITS.forEach((name, index) => { genome.traits[name] = PROFILES[profile][index]; });
      return genome;
    }

    predict(inputs) {
      if (inputs.length !== INPUTS) throw new Error(`Genome attend ${INPUTS} entrées`);
      const hidden = new Array(HIDDEN);
      for (let h = 0; h < HIDDEN; h++) {
        let sum = this.biasH[h];
        for (let i = 0; i < INPUTS; i++) sum += inputs[i] * this.weightsIH[i * HIDDEN + h];
        hidden[h] = Math.tanh(sum);
      }
      const outputs = new Array(OUTPUTS);
      for (let o = 0; o < OUTPUTS; o++) {
        let sum = this.biasO[o];
        for (let h = 0; h < HIDDEN; h++) sum += hidden[h] * this.weightsHO[h * OUTPUTS + o];
        outputs[o] = Math.tanh(sum);
      }
      return outputs;
    }

    crossover(other, rng, rate = 0.75) {
      if (rng.next() > rate) return this.copy();
      const blend = (left, right) => left.map((value, index) => rng.next() < 0.5 ? value : right[index]);
      const traits = {};
      TRAITS.forEach(name => { traits[name] = rng.next() < 0.5 ? this.traits[name] : other.traits[name]; });
      return new Genome({
        profile: this.profile,
        traits,
        weightsIH: blend(this.weightsIH, other.weightsIH),
        biasH: blend(this.biasH, other.biasH),
        weightsHO: blend(this.weightsHO, other.weightsHO),
        biasO: blend(this.biasO, other.biasO)
      });
    }

    mutate(rate, amplitude, rng) {
      const mutateArray = values => values.map(value => rng.next() < rate ? value + rng.gaussian() * amplitude : value);
      this.weightsIH = mutateArray(this.weightsIH);
      this.biasH = mutateArray(this.biasH);
      this.weightsHO = mutateArray(this.weightsHO);
      this.biasO = mutateArray(this.biasO);
      TRAITS.forEach(name => {
        if (rng.next() < rate) this.traits[name] = clamp(this.traits[name] + rng.gaussian() * amplitude, 0, 1);
      });
      return this;
    }

    dispose() {}

    toJSON() {
      return {
        version: 1,
        profile: this.profile,
        traits: { ...this.traits },
        weightsIH: this.weightsIH.slice(),
        biasH: this.biasH.slice(),
        weightsHO: this.weightsHO.slice(),
        biasO: this.biasO.slice()
      };
    }

    static fromJSON(data) {
      if (!data || data.version !== 1) throw new Error("Format de génome incompatible");
      const arrays = [data.weightsIH, data.biasH, data.weightsHO, data.biasO];
      if (arrays.some(values => !Array.isArray(values)) || data.weightsIH.length !== INPUTS * HIDDEN ||
          data.biasH.length !== HIDDEN || data.weightsHO.length !== HIDDEN * OUTPUTS || data.biasO.length !== OUTPUTS) {
        throw new Error("Génome incomplet");
      }
      if (TRAITS.some(name => !Number.isFinite(data.traits && data.traits[name]))) throw new Error("Traits invalides");
      // Leave room for all Float32 products/sums used by GPU inference.
      const maxWeight = 3.4028234663852886e38 / (2 * (Math.max(INPUTS, HIDDEN) + 1));
      if (arrays.some(values => values.some(value => !Number.isFinite(value) || Math.abs(value) > maxWeight))) throw new Error("Poids invalides ou hors plage GPU");
      if (TRAITS.some(name => data.traits[name] < 0 || data.traits[name] > 1)) throw new Error("Traits hors limites");
      return new Genome(data);
    }
  }

  const api = { Genome, DRIVING_PROFILES: PROFILES, GENOME_TRAITS: TRAITS };
  Object.assign(root, api);
  if (typeof module !== "undefined") module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
