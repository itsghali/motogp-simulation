(function (root) {
  class ValidationManager {
    constructor(requiredLaps = 3, requiredScenarios = 3) {
      this.requiredLaps = requiredLaps;
      this.requiredScenarios = requiredScenarios;
      this.reset();
    }

    reset() {
      this.status = "validation en cours";
      this.laps = [];
      this.scenarios = new Set();
      this.failure = null;
    }

    recordLap(stats) {
      if (this.status !== "validation en cours") return this.status;
      if (!stats.valid || !Number.isFinite(stats.time) || stats.time <= 0 ||
          !Number.isFinite(stats.averageSpeed) || stats.averageSpeed < 0 ||
          typeof stats.scenario !== "string" || !stats.scenario ||
          stats.offTrackFrames !== 0 || stats.missedCheckpoints !== 0 || stats.wrongWay !== 0) {
        return this.fail("tour invalide");
      }
      if (this.laps.length >= this.requiredLaps) return this.status;
      this.laps.push({
        time: stats.time,
        offTrack: stats.offTrackFrames,
        averageSpeed: stats.averageSpeed,
        scenario: stats.scenario
      });
      this.scenarios.add(stats.scenario);
      if (this.laps.length === this.requiredLaps) {
        this.status = this.scenarios.size >= this.requiredScenarios ? "modèle validé" : "validation échouée";
        if (this.status === "validation échouée") this.failure = "scénarios distincts insuffisants";
      }
      return this.status;
    }

    fail(reason) {
      if (this.status !== "validation en cours") return this.status;
      this.status = "validation échouée";
      this.failure = reason;
      return this.status;
    }
  }

  root.ValidationManager = ValidationManager;
  if (typeof module !== "undefined") module.exports = { ValidationManager };
})(typeof globalThis !== "undefined" ? globalThis : this);
