(function (root) {
  // Interpretations of published riding descriptions, not measured rider telemetry.
  const RIDERS = [
    { name: "Marc Márquez", short: "M. MARQUEZ", code: "MM93", number: 93, color: "#ed303b", style: "Attaque · freinage tardif", profile: "lateBraking", traits: { aggressiveness: 0.91, direction: 0.79, braking: 0.24, acceleration: 0.83 } },
    { name: "Francesco Bagnaia", short: "BAGNAIA", code: "FB63", number: 63, color: "#b72237", style: "Entrée précise · freinage maîtrisé", profile: "balanced", traits: { anticipation: 0.78, braking: 0.48, trackCorrection: 0.76, cornerSensitivity: 0.79, aggressiveness: 0.65 } },
    { name: "Jorge Martín", short: "MARTIN", code: "JM89", number: 89, color: "#9f82ef", style: "Attaque · remise des gaz", profile: "aggressive", traits: { acceleration: 0.91, direction: 0.76, braking: 0.3, aggressiveness: 0.88 } },
    { name: "Fabio Quartararo", short: "QUARTARARO", code: "FQ20", number: 20, color: "#4497fc", style: "Fluidité · vitesse en courbe", profile: "smoothLine", traits: { anticipation: 0.86, direction: 0.48, cornerSensitivity: 0.8, trackCorrection: 0.87 } },
    { name: "Pedro Acosta", short: "ACOSTA", code: "PA37", number: 37, color: "#ff953f", style: "Entrée incisive · freinage tardif", profile: "lateBraking", traits: { braking: 0.2, direction: 0.84, aggressiveness: 0.84, cornerSensitivity: 0.78 } },
    { name: "Brad Binder", short: "BINDER", code: "BB33", number: 33, color: "#f7bb39", style: "Attaque · contrôle en entrée", profile: "aggressive", traits: { braking: 0.4, direction: 0.75, trackCorrection: 0.63, cornerSensitivity: 0.65 } }
  ].map(rider => Object.freeze({ ...rider, traits: Object.freeze(rider.traits) }));
  Object.freeze(RIDERS);
  class RiderRoster {
    static get riders() { return RIDERS; }
    static build(genomes, inspired = true, strength = 1) {
      if (!genomes.length) throw new Error("Aucun génome disponible");
      strength = Number.isFinite(strength) ? Math.max(0, Math.min(1, strength)) : 1;
      return RIDERS.slice(0, inspired ? RIDERS.length : Math.min(RIDERS.length, genomes.length)).map((rider, i) => {
        const genome = genomes[i % genomes.length].copy();
        if (inspired && strength > 0) {
          const base = { ...genome.traits };
          const means = root.DRIVING_PROFILES[rider.profile];
          root.GENOME_TRAITS.forEach((name, index) => { genome.traits[name] = means[index]; });
          Object.assign(genome.traits, rider.traits); genome.profile = rider.profile;
          root.GENOME_TRAITS.forEach(name => { genome.traits[name] = base[name] * (1 - strength) + genome.traits[name] * strength; });
        }
        return { genome, identity: { ...rider, traits: undefined, inspired, styleStrength: inspired ? strength : 0 } };
      });
    }
    static label(bike) { return bike?.identity?.name || `Agent ${(bike?.id ?? 0) + 1}`; }
  }
  root.RiderRoster = RiderRoster;
  if (typeof module !== "undefined") module.exports = { RiderRoster };
})(typeof globalThis !== "undefined" ? globalThis : this);
