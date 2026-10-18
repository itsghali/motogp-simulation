(function (root) {
  // Corner zones on the existing schematic, not surveyed geographic coordinates.
  const CORNERS = [3, 7, 10, 14, 18, 20, 24, 26, 28, 32, 35, 37, 40];
  class RaceAnalytics {
    constructor(circuit) {
      this.circuit = circuit; this.active = new Map();
      this.corners = CORNERS.map((_, i) => ({ turn: i + 1, entries: 0, completed: 0, failures: 0, entrySpeed: 0,
        exitSpeed: 0, minimumSpeed: Infinity, steeringSum: 0, samples: 0 }));
    }
    sample(bike) {
      const projection = this.circuit.nearestProjection(bike.pos);
      const distances = CORNERS.map(index => {
        const delta = Math.abs(this.circuit.cumulative[index] - projection.progressPixels);
        return Math.min(delta, this.circuit.totalPixels - delta);
      });
      const nearest = distances.indexOf(Math.min(...distances));
      const zone = distances[nearest] <= 25 ? nearest : -1;
      const previous = this.active.get(bike.id);
      if (previous !== undefined && previous !== zone) {
        const corner = this.corners[previous]; corner.completed++; corner.exitSpeed += bike.vel.mag(); this.active.delete(bike.id);
      }
      if (zone >= 0) {
        const corner = this.corners[zone];
        if (previous !== zone) { corner.entries++; corner.entrySpeed += bike.vel.mag(); this.active.set(bike.id, zone); }
        corner.samples++; corner.minimumSpeed = Math.min(corner.minimumSpeed, bike.vel.mag()); corner.steeringSum += Math.abs(bike.lastSteering);
      }
    }
    fail(bike) {
      const index = this.active.get(bike.id); if (index !== undefined) { this.corners[index].failures++; this.active.delete(bike.id); }
    }
    report() {
      return this.corners.map(c => ({ turn: c.turn, entries: c.entries,
        entrySpeed: c.entries ? c.entrySpeed / c.entries : null,
        exitSpeed: c.completed ? c.exitSpeed / c.completed : null,
        minimumSpeed: Number.isFinite(c.minimumSpeed) ? c.minimumSpeed : null,
        averageSteering: c.samples ? c.steeringSum / c.samples : null,
        failureRate: c.entries ? c.failures / c.entries : null }));
    }
  }
  root.RaceAnalytics = RaceAnalytics;
  if (typeof module !== "undefined") module.exports = { RaceAnalytics };
})(typeof globalThis !== "undefined" ? globalThis : this);
