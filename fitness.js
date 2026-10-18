(function (root) {
  const DEFAULT_WEIGHTS = {
    checkpoints: 160,
    distance: 0.12,
    progress: 100,
    laps: 2400,
    lapTime: 800,
    offTrack: 120,
    collision: 700,
    wrongWay: 350,
    stagnation: 220,
    shortcut: 1000,
    missedCheckpoint: 900
  };

  function calculateFitness(stats, customWeights = {}) {
    const w = { ...DEFAULT_WEIGHTS, ...customWeights };
    const bestLapBonus = stats.bestLapTime > 0 ? w.lapTime * 60000 / (60000 + stats.bestLapTime) : 0;
    const reward = stats.checkpoints * w.checkpoints + stats.distanceOnTrack * w.distance +
      stats.progressToNext * w.progress + stats.laps * w.laps + bestLapBonus;
    const penalty = stats.offTrackFrames * w.offTrack + stats.collisions * w.collision +
      stats.wrongWay * w.wrongWay + stats.stagnation * w.stagnation +
      stats.shortcuts * w.shortcut + stats.missedCheckpoints * w.missedCheckpoint;
    // Une sanction forte conserve le classement des progressions partielles.
    return (1 + Math.max(0, reward)) / (1 + Math.max(0, penalty) / 160);
  }

  function aggregateScenarioResults(results, weights) {
    if (!results.length) return 0.001;
    const scores = results.map(result => calculateFitness(result, weights));
    const failures = results.filter(result => result.failed || result.laps === 0).length;
    const mean = scores.reduce((sum, score) => sum + score, 0) / scores.length;
    const failureRate = failures / results.length;
    return mean * (0.1 + 0.9 * Math.pow(1 - failureRate, 2));
  }

  const api = { Fitness: { DEFAULT_WEIGHTS, calculateFitness, aggregateScenarioResults } };
  Object.assign(root, api);
  if (typeof module !== "undefined") module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
