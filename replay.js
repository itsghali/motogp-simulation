(function (root) {
  class ReplaySystem {
    constructor(capacity = 150, interval = 100) {
      this.capacity = capacity; this.interval = interval; this.reset();
    }
    reset() { this.frames = []; this.lastTime = -Infinity; this.saved = null; this.validation = null; }
    capture(time, bikes, force = false, drones = []) {
      if (!force && time - this.lastTime < this.interval - 1e-6) return;
      this.lastTime = time;
      this.frames.push({ time, drones: drones.map(drone => drone.snapshot()), bikes: bikes.map(bike => ({ id: bike.id, x: bike.pos.x, y: bike.pos.y,
        heading: bike.headingAngle(), speed: bike.vel.mag(), steering: bike.lastSteering,
        throttle: bike.lastDecision?.throttle ?? null, brake: bike.lastDecision?.braking ?? null,
        sensors: bike.sensorReadings.slice(), laps: bike.stats.laps, dead: bike.dead, finished: bike.finished })) });
      if (this.frames.length > this.capacity) this.frames.shift();
    }
    save() { this.saved = JSON.parse(JSON.stringify(this.frames)); return this.saved; }
    frameAt(time, frames = this.saved || this.frames) {
      if (!frames.length) return null;
      const target = frames[0].time + time;
      let low = 0; let high = frames.length - 1;
      while (low < high) { const mid = Math.ceil((low + high) / 2); if (frames[mid].time <= target) low = mid; else high = mid - 1; }
      return frames[low];
    }
  }
  root.ReplaySystem = ReplaySystem;
  if (typeof module !== "undefined") module.exports = { ReplaySystem };
})(typeof globalThis !== "undefined" ? globalThis : this);
