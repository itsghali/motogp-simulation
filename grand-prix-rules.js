(function (root) {
  // Race rules belong to the event, never to the first rider or laboratory state.
  const VEHICLE = Object.freeze({
    maxSpeed: 5.5, maxForce: 0.18, acceleration: 1,
    brakingPower: 1.2, sensorRange: 90, noiseLevel: 1, grip: 1
  });
  function configuration(trackWidth = 52) {
    if (!Number.isFinite(trackWidth) || trackWidth < 24 || trackWidth > 100) throw new Error("Largeur Grand Prix invalide");
    return { seed: 2027, trackWidth, scenarioSeconds: 120, vehicle: { ...VEHICLE } };
  }
  function qualify(config, genomes) {
    if (!genomes.length || genomes.length > 12) throw new Error("Grille d’homologation invalide");
    // Separate inference, events and copies: qualification cannot change a live race,
    // its GPU batch, source JSON, random state or training validation certificate.
    const inference = {
      setGenomes(values) { this.genomes = values; },
      predict(inputs) { return inputs.map((values, i) => this.genomes[i].predict(values)); }
    };
    const race = new root.RaceSession(new root.Circuit(920, 720, config.trackWidth), config,
      inference, genomes, new root.RaceEvents(), { laps: 3 });
    race.recordReplay = false;
    try {
      race.transition("RACE");
      const budget = Math.ceil(race.maxTime * 60 / 1000) + 1;
      for (let step = 0; step < budget && race.phase === "RACE"; step++) race.step();
      const riders = race.population.map(bike => ({
        id: bike.id, passed: bike.finished && !bike.dead && bike.stats.laps === 3 &&
          bike.stats.checkpoints === 63 && bike.stats.offTrackFrames === 0 && bike.stats.collisions === 0,
        laps: bike.stats.laps, checkpoints: bike.stats.checkpoints,
        reason: bike.stats.failureReason || (bike.stats.offTrackFrames ? "sortie de piste" : bike.finished ? "" : "homologation incomplète")
      }));
      return { passed: riders.every(rider => rider.passed), riders };
    } finally { race.flags.dispose(); }
  }
  root.GrandPrixRules = { configuration, qualify };
})(typeof globalThis !== "undefined" ? globalThis : this);
