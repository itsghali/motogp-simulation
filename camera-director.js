(function (root) {
  class CameraDirector {
    constructor(events) {
      this.modes = ["OVERVIEW", "FOLLOW_LEADER", "FOLLOW_SELECTED", "CORNER", "START", "FINISH", "CINEMATIC"];
      this.mode = "OVERVIEW"; this.selected = 0; this.x = 460; this.y = 360; this.zoom = 1;
      this.focus = null; this.focusUntil = 0; this.priority = 0;
      events.on(event => {
        const priority = { FINISH: 100, CRASH: 90, CLOSE_BATTLE: 80, OVERTAKE: 70, FAST_LAP: 50 }[event.type];
        if (priority && (event.time >= this.focusUntil || priority >= this.priority)) {
          this.focus = event.id; this.focusUntil = event.time + 4000; this.priority = priority;
        }
      });
    }
    cycle() { this.mode = this.modes[(this.modes.indexOf(this.mode) + 1) % this.modes.length]; }
    update(bikes, leader, circuit, time, delta, reducedMotion) {
      let target = { x: 460, y: 360 }; let zoom = 1;
      if (this.mode === "OVERVIEW" && circuit && typeof circuit.boundingBox === "function") {
        const box = circuit.boundingBox();
        target = { x: box.centerX, y: box.centerY };
        const padding = 50;
        const zoomX = (920 - padding * 2) / Math.max(1, box.width);
        const zoomY = (720 - padding * 2) / Math.max(1, box.height);
        zoom = Math.max(1, Math.min(1.35, Math.min(zoomX, zoomY)));
      } else if (this.mode !== "OVERVIEW") {
        let bike = this.mode === "FOLLOW_SELECTED" ? bikes.find(b => b.id === this.selected) : leader;
        if (this.mode === "CINEMATIC" && time < this.focusUntil) bike = bikes.find(b => b.id === this.focus) || bike;
        if (["START", "FINISH"].includes(this.mode)) target = circuit.checkpoints[0].center;
        else if (this.mode === "CORNER") target = circuit.centerline[20];
        else if (bike) target = bike.pos;
        const ratio = bike?.vel ? bike.vel.mag() / Math.max(0.01, bike.maxspeed) : 0.5;
        zoom = this.mode === "CINEMATIC" ? 1.8 - Math.min(1, ratio) * 0.4 : 1.65;
      }
      if (reducedMotion) { this.x = target.x; this.y = target.y; this.zoom = zoom; return; }
      const smooth = 1 - Math.exp(-Math.max(0, delta) / 300);
      this.x += (target.x - this.x) * smooth; this.y += (target.y - this.y) * smooth; this.zoom += (zoom - this.zoom) * smooth;
    }
    worldPoint(x, y) { return { x: (x - 460) / this.zoom + this.x, y: (y - 360) / this.zoom + this.y }; }
  }
  root.CameraDirector = CameraDirector;
  if (typeof module !== "undefined") module.exports = { CameraDirector };
})(typeof globalThis !== "undefined" ? globalThis : this);
