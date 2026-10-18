(function (root) {
  class SeededRandom {
    constructor(seed) {
      this.state = (seed >>> 0) || 0x6d2b79f5;
      this.spare = null;
    }

    next() {
      let t = this.state += 0x6d2b79f5;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    range(min, max) {
      return min + (max - min) * this.next();
    }

    gaussian() {
      if (this.spare !== null) {
        const value = this.spare;
        this.spare = null;
        return value;
      }
      const u = Math.max(this.next(), Number.EPSILON);
      const v = this.next();
      const magnitude = Math.sqrt(-2 * Math.log(u));
      this.spare = magnitude * Math.sin(2 * Math.PI * v);
      return magnitude * Math.cos(2 * Math.PI * v);
    }

    fork(offset) {
      return new SeededRandom((this.state ^ Math.imul(offset + 1, 0x9e3779b1)) >>> 0);
    }
  }

  const api = { SeededRandom };
  root.SeededRandom = SeededRandom;
  if (typeof module !== "undefined") module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
