(function (root) {
  class RaceEvents {
    constructor() { this.listeners = new Set(); this.history = []; this.errors = 0; }
    on(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
    emit(type, data = {}) {
      const event = { ...data, type };
      this.history.push(event);
      if (this.history.length > 200) this.history.shift();
      // Presentation failures must never stop locomotion or learning.
      for (const listener of this.listeners) { try { listener(event); } catch (_) { this.errors++; } }
      return event;
    }
  }
  class FlagManager {
    constructor(events) {
      this.flag = "RED"; this.until = 0;
      this.unsubscribe = events.on(event => {
        if (event.type === "RACE_START") this.flag = "GREEN";
        if (["OFF_TRACK", "CRASH"].includes(event.type) && this.flag !== "CHEQUERED") {
          this.flag = "YELLOW"; this.until = event.time + 3500;
        }
        if (event.type === "FINISH") this.flag = "CHEQUERED";
        if (event.type === "RACE_STOPPED") this.flag = "RED";
      });
    }
    update(time) { if (this.flag === "YELLOW" && time >= this.until) this.flag = "GREEN"; }
    dispose() { this.unsubscribe(); }
  }
  const api = { RaceEvents, FlagManager };
  Object.assign(root, api);
  if (typeof module !== "undefined") module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
