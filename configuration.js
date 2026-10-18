(function (root) {
  const SLIDERS = [
    ["populationSize", "Taille population", 20, 240, 10, 80],
    ["mutationRate", "Taux mutation", 0, 0.5, 0.01, 0.08],
    ["mutationAmplitude", "Amplitude mutation", 0.01, 1, 0.01, 0.18],
    ["crossoverRate", "Taux croisement", 0, 1, 0.01, 0.8],
    ["eliteCount", "Nombre d’élites", 1, 20, 1, 5],
    ["scenarioCount", "Scénarios / génération", 1, 8, 1, 3],
    ["trainingGenerations", "Budget générations", 10, 1000, 10, 200],
    ["scenarioSeconds", "Durée maximale / tour (s)", 30, 240, 10, 120],
    ["seed", "Graine reproductible", 1, 9999, 1, 2027],
    ["trackWidth", "Largeur piste simulée (px)", 24, 52, 2, 44],
    ["maxSpeed", "maxSpeed", 2, 10, 0.1, 5.5],
    ["maxForce", "maxForce", 0.02, 0.5, 0.01, 0.18],
    ["acceleration", "Accélération", 0.2, 2, 0.05, 1],
    ["brakingPower", "Puissance freinage", 0.2, 2, 0.05, 1.2],
    ["sensorRange", "Portée capteurs", 30, 180, 5, 90],
    ["noiseLevel", "Niveau bruit", 0, 10, 0.1, 1],
    ["grip", "Adhérence", 0.5, 1.2, 0.01, 1],
    ["simulationSpeed", "Vitesse simulation", 1, 30, 1, 4],
    ["fitCheckpoints", "Fitness checkpoints", 0, 400, 10, 160],
    ["fitDistance", "Fitness distance", 0, 1, 0.01, 0.12],
    ["fitProgress", "Fitness progression", 0, 300, 10, 100],
    ["fitLaps", "Fitness tours", 0, 5000, 100, 2400],
    ["fitLapTime", "Fitness chrono", 0, 2000, 50, 800],
    ["fitOffTrack", "Pénalité sortie", 0, 500, 10, 120],
    ["fitCollision", "Pénalité collision", 0, 1500, 50, 700],
    ["fitWrongWay", "Pénalité demi-tour", 0, 1000, 25, 350],
    ["fitStagnation", "Pénalité stagnation", 0, 800, 20, 220],
    ["fitShortcut", "Pénalité raccourci", 0, 2000, 50, 1000],
    ["fitMissed", "Pénalité checkpoint manqué", 0, 2000, 50, 900]
  ];
  const fitnessKeys = {
    fitCheckpoints: "checkpoints", fitDistance: "distance", fitProgress: "progress",
    fitLaps: "laps", fitLapTime: "lapTime", fitOffTrack: "offTrack", fitCollision: "collision",
    fitWrongWay: "wrongWay", fitStagnation: "stagnation", fitShortcut: "shortcut", fitMissed: "missedCheckpoint"
  };
  const vehicleKeys = new Set(["maxSpeed", "maxForce", "acceleration", "brakingPower", "sensorRange", "noiseLevel", "grip"]);
  const object = value => value && typeof value === "object" && !Array.isArray(value);
  function normalize(config = {}, fallback = {}) {
    for (const source of [config, fallback]) {
      if (!object(source)) throw new Error("Configuration invalide");
      for (const key of ["vehicle", "fitnessWeights"]) {
        if (source[key] !== undefined && !object(source[key])) throw new Error(`Configuration ${key} invalide`);
      }
    }
    const result = {};
    for (const [key, , min, max, step] of SLIDERS) {
      const section = key in fitnessKeys ? "fitnessWeights" : vehicleKeys.has(key) ? "vehicle" : null;
      const name = fitnessKeys[key] || key;
      const requested = section ? config[section]?.[name] : config[name];
      const value = requested === undefined ? (section ? fallback[section]?.[name] : fallback[name]) : requested;
      if (value === undefined) continue;
      if (!Number.isFinite(value)) throw new Error(`Réglage ${name} invalide`);
      const bounded = Math.max(min, Math.min(max, value));
      const normalized = Number((min + Math.round((bounded - min) / step) * step).toFixed(8));
      if (section) { result[section] ||= {}; result[section][name] = normalized; }
      else result[name] = normalized;
    }
    const profile = config.profile ?? fallback.profile;
    if (profile !== undefined) {
      if (typeof profile !== "string" || !profile.trim()) throw new Error("Profil de configuration invalide");
      result.profile = profile;
    }
    return result;
  }
  root.SimulationConfig = { sliders: SLIDERS, fitnessKeys, normalize };
  if (typeof module !== "undefined") module.exports = root.SimulationConfig;
})(typeof globalThis !== "undefined" ? globalThis : this);
