(function (root) {
  const BASE_POINTS = [
    [0.78, 0.56], [0.79, 0.64], [0.78, 0.72], [0.75, 0.78],
    [0.68, 0.81], [0.60, 0.82], [0.52, 0.80], [0.47, 0.75],
    [0.45, 0.68], [0.42, 0.62], [0.36, 0.59], [0.28, 0.59],
    [0.20, 0.57], [0.15, 0.52], [0.14, 0.45], [0.16, 0.39],
    [0.22, 0.35], [0.30, 0.34], [0.37, 0.37], [0.43, 0.38],
    [0.47, 0.34], [0.44, 0.29], [0.37, 0.26], [0.30, 0.25],
    [0.26, 0.21], [0.29, 0.16], [0.37, 0.13], [0.46, 0.15],
    [0.53, 0.12], [0.61, 0.10], [0.69, 0.12], [0.75, 0.17],
    [0.78, 0.22], [0.77, 0.28], [0.72, 0.31], [0.65, 0.31],
    [0.60, 0.34], [0.61, 0.39], [0.67, 0.42], [0.75, 0.43],
    [0.80, 0.46], [0.81, 0.51]
  ];

  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const dot = (a, b) => a.x * b.x + a.y * b.y;
  const cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

  function segmentsIntersect(a, b, c, d) {
    if (Math.max(a.x, b.x) < Math.min(c.x, d.x) - 1e-8 ||
      Math.max(c.x, d.x) < Math.min(a.x, b.x) - 1e-8 ||
      Math.max(a.y, b.y) < Math.min(c.y, d.y) - 1e-8 ||
      Math.max(c.y, d.y) < Math.min(a.y, b.y) - 1e-8) return false;
    const abC = cross(a, b, c);
    const abD = cross(a, b, d);
    const cdA = cross(c, d, a);
    const cdB = cross(c, d, b);
    return ((abC <= 0 && abD >= 0) || (abC >= 0 && abD <= 0)) &&
      ((cdA <= 0 && cdB >= 0) || (cdA >= 0 && cdB <= 0));
  }

  function pointInPolygon(point, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const a = polygon[i]; const b = polygon[j];
      if ((a.y > point.y) !== (b.y > point.y) &&
        point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
  }

  function projectPoint(point, a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSquared = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared));
    const projected = { x: a.x + dx * t, y: a.y + dy * t };
    return { point: projected, t, distance: distance(point, projected) };
  }

  class Circuit {
    constructor(width = 900, height = 720, trackWidth = 44) {
      this.name = "Circuito de Jerez - Ángel Nieto";
      this.realLengthMeters = 4423;
      this.realWidthMeters = 11;
      this.turns = 13;
      this.direction = "horaire";
      this.trackWidth = trackWidth;
      this.centerline = BASE_POINTS.map(([x, y]) => ({ x: x * width, y: y * height }));
      this.segmentLengths = [];
      this.cumulative = [0];
      this.totalPixels = 0;
      this.buildGeometry();
    }

    buildGeometry() {
      const count = this.centerline.length;
      this.totalPixels = 0;
      this.cumulative = [0];
      this.segmentLengths = [];
      this.inner = [];
      this.outer = [];
      for (let i = 0; i < count; i++) {
        const previous = this.centerline[(i - 1 + count) % count];
        const next = this.centerline[(i + 1) % count];
        const tx = next.x - previous.x;
        const ty = next.y - previous.y;
        const magnitude = Math.hypot(tx, ty) || 1;
        const normal = { x: -ty / magnitude, y: tx / magnitude };
        this.inner.push({ x: this.centerline[i].x + normal.x * this.trackWidth / 2, y: this.centerline[i].y + normal.y * this.trackWidth / 2 });
        this.outer.push({ x: this.centerline[i].x - normal.x * this.trackWidth / 2, y: this.centerline[i].y - normal.y * this.trackWidth / 2 });
      }
      this.walls = [];
      for (let i = 0; i < count; i++) {
        const next = (i + 1) % count;
        this.walls.push({ a: this.inner[i], b: this.inner[next] }, { a: this.outer[i], b: this.outer[next] });
        const length = distance(this.centerline[i], this.centerline[next]);
        this.segmentLengths[i] = length;
        this.totalPixels += length;
        this.cumulative[i + 1] = this.totalPixels;
      }
      this.detectCrossedBorders();
      const checkpointIndices = Array.from({ length: 21 }, (_, index) => Math.floor(index * count / 21));
      this.checkpoints = checkpointIndices.map((pointIndex, index) => {
        const nextPoint = this.centerline[(pointIndex + 1) % count];
        const center = this.centerline[pointIndex];
        const magnitude = distance(center, nextPoint) || 1;
        return {
          index,
          pointIndex,
          a: this.inner[pointIndex],
          b: this.outer[pointIndex],
          center,
          tangent: { x: (nextPoint.x - center.x) / magnitude, y: (nextPoint.y - center.y) / magnitude },
          distanceMeters: this.cumulative[pointIndex] / this.totalPixels * this.realLengthMeters
        };
      });
      this.checkpoints.forEach(cp => {
        const dx = cp.b.x - cp.a.x; const dy = cp.b.y - cp.a.y;
        const length = Math.hypot(dx, dy);
        let tangent = { x: -dy / length, y: dx / length };
        if (dot(tangent, cp.tangent) < 0) tangent = { x: -tangent.x, y: -tangent.y };
        cp.tangent = tangent;
      });
    }

    detectCrossedBorders() {
      this.crossedBorders = false;
      this.crossedEars = [];
      const crossProd = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
      const segmentsCross = (a, b, c, d) => {
        if (Math.max(a.x, b.x) < Math.min(c.x, d.x) - 1e-8 ||
          Math.max(c.x, d.x) < Math.min(a.x, b.x) - 1e-8 ||
          Math.max(a.y, b.y) < Math.min(c.y, d.y) - 1e-8 ||
          Math.max(c.y, d.y) < Math.min(a.y, b.y) - 1e-8) return false;
        const abC = crossProd(a, b, c), abD = crossProd(a, b, d);
        const cdA = crossProd(c, d, a), cdB = crossProd(c, d, b);
        return ((abC < -1e-6 && abD > 1e-6) || (abC > 1e-6 && abD < -1e-6)) &&
          ((cdA < -1e-6 && cdB > 1e-6) || (cdA > 1e-6 && cdB < -1e-6));
      };
      const findIntersection = (p1, p2, p3, p4) => {
        const dx1 = p2.x - p1.x, dy1 = p2.y - p1.y;
        const dx2 = p4.x - p3.x, dy2 = p4.y - p3.y;
        const denom = dx1 * dy2 - dy1 * dx2;
        if (Math.abs(denom) < 1e-9) return null;
        const t = ((p3.x - p1.x) * dy2 - (p3.y - p1.y) * dx2) / denom;
        return { x: p1.x + t * dx1, y: p1.y + t * dy1 };
      };
      for (let i = 0; i < this.walls.length; i++) {
        for (let j = i + 1; j < this.walls.length; j++) {
          const w1 = this.walls[i], w2 = this.walls[j];
          if (segmentsCross(w1.a, w1.b, w2.a, w2.b)) {
            this.crossedBorders = true;
            const X = findIntersection(w1.a, w1.b, w2.a, w2.b);
            if (X) {
              this.crossedEars.push(
                [X, w1.a, w2.a], [X, w1.b, w2.b],
                [X, w1.a, w2.b], [X, w1.b, w2.a]
              );
            }
          }
        }
      }
      return { crossed: this.crossedBorders, ears: this.crossedEars };
    }

    hasCrossedBorders() {
      return Boolean(this.crossedBorders);
    }

    isInCrossedEar(point) {
      if (!this.crossedBorders || !this.crossedEars.length) return false;
      const crossProd = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
      for (let i = 0; i < this.crossedEars.length; i++) {
        const [a, b, c] = this.crossedEars[i];
        const c1 = crossProd(a, b, point);
        const c2 = crossProd(b, c, point);
        const c3 = crossProd(c, a, point);
        const hasNeg = (c1 < -1e-6) || (c2 < -1e-6) || (c3 < -1e-6);
        const hasPos = (c1 > 1e-6) || (c2 > 1e-6) || (c3 > 1e-6);
        if (!(hasNeg && hasPos)) return true;
      }
      return false;
    }

    isCorridorBlocked(obstacles, minGap = 8.5) {
      if (!obstacles || obstacles.length === 0) return false;
      for (const obs of obstacles) {
        const obsPos = { x: obs.pos?.x ?? obs.x, y: obs.pos?.y ?? obs.y };
        const proj = this.nearestProjection(obsPos);
        const seg = proj.segment;
        const p1 = this.centerline[seg];
        const p2 = this.centerline[(seg + 1) % this.centerline.length];
        const dx = p2.x - p1.x, dy = p2.y - p1.y;
        const mag = Math.hypot(dx, dy) || 1;
        const nx = -dy / mag, ny = dx / mag;
        const half = this.trackWidth / 2;
        let maxContinuousGap = 0;
        let currentGap = 0;
        const step = 0.5;
        for (let offset = -half; offset <= half; offset += step) {
          const pt = { x: proj.point.x + nx * offset, y: proj.point.y + ny * offset };
          const inObs = obstacles.some(o => {
            const ox = o.pos?.x ?? o.x, oy = o.pos?.y ?? o.y;
            return Math.hypot(ox - pt.x, oy - pt.y) <= o.radius;
          });
          if (!inObs) {
            currentGap += step;
            if (currentGap > maxContinuousGap) maxContinuousGap = currentGap;
          } else {
            currentGap = 0;
          }
        }
        if (maxContinuousGap < minGap) return true;
      }
      return false;
    }

    computeMaxSafeTrackWidth(safetyMargin = 0.92) {
      if (this.cachedMaxSafeWidth) return this.cachedMaxSafeWidth;
      const count = this.centerline.length;
      const normals = [];
      for (let i = 0; i < count; i++) {
        const previous = this.centerline[(i - 1 + count) % count];
        const next = this.centerline[(i + 1) % count];
        const tx = next.x - previous.x; const ty = next.y - previous.y;
        const mag = Math.hypot(tx, ty) || 1;
        normals.push({ x: -ty / mag, y: tx / mag });
      }

      const isSafe = (w) => {
        const half = w / 2;
        const inner = []; const outer = [];
        for (let i = 0; i < count; i++) {
          inner.push({ x: this.centerline[i].x + normals[i].x * half, y: this.centerline[i].y + normals[i].y * half });
          outer.push({ x: this.centerline[i].x - normals[i].x * half, y: this.centerline[i].y - normals[i].y * half });
        }
        for (let i = 0; i < count; i++) {
          const aIn = inner[i]; const bIn = inner[(i + 1) % count];
          const aOut = outer[i]; const bOut = outer[(i + 1) % count];
          for (let j = i + 2; j < count; j++) {
            if ((j + 1) % count === i) continue;
            if (segmentsIntersect(aIn, bIn, inner[j], inner[(j + 1) % count])) return false;
            if (segmentsIntersect(aOut, bOut, outer[j], outer[(j + 1) % count])) return false;
          }
          for (let j = 0; j < count; j++) {
            if (segmentsIntersect(aIn, bIn, outer[j], outer[(j + 1) % count])) return false;
          }
        }
        return true;
      };

      let low = 24, high = 100, critical = 24;
      for (let step = 0; step < 16; step++) {
        const mid = (low + high) / 2;
        if (isSafe(mid)) { critical = mid; low = mid; }
        else { high = mid; }
      }
      this.cachedMaxSafeWidth = Math.floor(critical * safetyMargin * 2) / 2;
      return this.cachedMaxSafeWidth;
    }

    boundingBox() {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      const points = (this.inner && this.inner.length) ? this.inner.concat(this.outer) : this.centerline;
      for (const p of points) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
      return {
        minX, maxX, minY, maxY,
        width: maxX - minX, height: maxY - minY,
        centerX: (minX + maxX) / 2, centerY: (minY + maxY) / 2
      };
    }

    setWidth(trackWidth) {
      const maxSafe = this.computeMaxSafeTrackWidth();
      this.trackWidth = Math.max(24, Math.min(maxSafe, trackWidth));
      this.buildGeometry();
    }

    nearestProjection(point) {
      let best = null;
      for (let i = 0; i < this.centerline.length; i++) {
        const next = (i + 1) % this.centerline.length;
        const projected = projectPoint(point, this.centerline[i], this.centerline[next]);
        if (!best || projected.distance < best.distance) {
          best = { ...projected, segment: i, progressPixels: this.cumulative[i] + projected.t * this.segmentLengths[i] };
        }
      }
      best.progressMeters = best.progressPixels / this.totalPixels * this.realLengthMeters;
      return best;
    }

    isOnTrack(point, margin = 0) {
      if (this.crossedBorders && this.isInCrossedEar(point)) return false;
      if (margin !== 0) return this.nearestProjection(point).distance <= this.trackWidth / 2 + margin;
      if (this.crossedBorders && this.nearestProjection(point).distance > this.trackWidth / 2) return false;
      return pointInPolygon(point, this.inner) !== pointInPolygon(point, this.outer);
    }

    isSegmentOnTrack(previous, current) {
      if (!this.isOnTrack(previous) || !this.isOnTrack(current)) return false;
      if (this.walls.some(wall => segmentsIntersect(previous, current, wall.a, wall.b))) return false;
      return this.isOnTrack({ x: (previous.x + current.x) / 2, y: (previous.y + current.y) / 2 });
    }

    startPose(offset = 0) {
      const checkpoint = this.checkpoints[0];
      const normal = { x: -checkpoint.tangent.y, y: checkpoint.tangent.x };
      return {
        position: { x: checkpoint.center.x + normal.x * offset - checkpoint.tangent.x * 4, y: checkpoint.center.y + normal.y * offset - checkpoint.tangent.y * 4 },
        heading: Math.atan2(checkpoint.tangent.y, checkpoint.tangent.x)
      };
    }

    progressToCheckpoint(point, checkpointIndex) {
      const projection = this.nearestProjection(point);
      const target = this.checkpoints[checkpointIndex].distanceMeters;
      const previousIndex = (checkpointIndex - 1 + this.checkpoints.length) % this.checkpoints.length;
      const previous = this.checkpoints[previousIndex].distanceMeters;
      const span = (target - previous + this.realLengthMeters) % this.realLengthMeters || this.realLengthMeters;
      const travelled = (projection.progressMeters - previous + this.realLengthMeters) % this.realLengthMeters;
      return travelled <= span ? travelled / span : 0;
    }

    draw(showCheckpoints = true) {
      noStroke();
      fill(44, 48, 54);
      beginShape();
      this.outer.forEach(point => vertex(point.x, point.y));
      beginContour();
      this.inner.slice().reverse().forEach(point => vertex(point.x, point.y));
      endContour();
      endShape(CLOSE);
      stroke(238); strokeWeight(2); noFill();
      [this.inner, this.outer].forEach(points => {
        beginShape(); points.forEach(point => vertex(point.x, point.y)); endShape(CLOSE);
      });
      if (showCheckpoints) {
        stroke(60, 160, 255, 110); strokeWeight(1);
        this.checkpoints.slice(1).forEach(cp => line(cp.a.x, cp.a.y, cp.b.x, cp.b.y));
      }
      const finish = this.checkpoints[0];
      stroke(255); strokeWeight(4); line(finish.a.x, finish.a.y, finish.b.x, finish.b.y);
    }
  }

  class ProgressTracker {
    constructor(circuit) {
      this.circuit = circuit;
      this.nextCheckpoint = 0;
      this.started = false;
      this.maxProgressPixels = 0;
      this.laps = 0;
      this.validLap = true;
      this.lastLapStartedAt = 0;
      this.lapTimes = [];
      this.events = [];
    }

    update(previous, current, now, options = {}) {
      const events = [];
      const step = distance(previous, current);
      if (step < 1e-8) return events;
      const onTrack = options.onTrack !== false && this.circuit.isSegmentOnTrack(previous, current);
      if (!onTrack) this.validLap = false;
      if (step > this.circuit.trackWidth * 1.5) {
        this.validLap = false;
        events.push({ type: "shortcut" });
        return events;
      }
      if (!onTrack) {
        events.push({ type: "off-track" });
        return events;
      }
      const movement = { x: current.x - previous.x, y: current.y - previous.y };
      const previousProjection = this.circuit.nearestProjection(previous);
      const projection = this.circuit.nearestProjection(current);
      const length = this.circuit.totalPixels;
      let advance = projection.progressPixels - previousProjection.progressPixels;
      if (advance > length / 2) advance -= length;
      if (advance < -length / 2) advance += length;
      if (Math.abs(advance) > step * 3 + this.circuit.trackWidth) {
        this.validLap = false;
        return [{ type: "shortcut" }];
      }
      if (this.started && advance < -0.25) {
        this.validLap = false;
        return [{ type: "wrong-way" }];
      }
      const crossed = this.circuit.checkpoints.filter(cp => {
        const before = dot({ x: previous.x - cp.center.x, y: previous.y - cp.center.y }, cp.tangent);
        const after = dot({ x: current.x - cp.center.x, y: current.y - cp.center.y }, cp.tangent);
        return ((before <= 0 && after > 0) || (before >= 0 && after < 0)) &&
          segmentsIntersect(previous, current, cp.a, cp.b);
      }).sort((a, b) => {
        const fraction = cp => dot({ x: cp.center.x - previous.x, y: cp.center.y - previous.y }, cp.tangent) / dot(movement, cp.tangent);
        return fraction(a) - fraction(b);
      });
      for (const checkpoint of crossed) {
        if (dot(movement, checkpoint.tangent) <= 0) {
          this.validLap = false;
          events.push({ type: "wrong-way", checkpoint: checkpoint.index });
          continue;
        }
        if (checkpoint.index !== this.nextCheckpoint) {
          const previousIndex = (this.nextCheckpoint - 1 + this.circuit.checkpoints.length) % this.circuit.checkpoints.length;
          if (checkpoint.index !== previousIndex) {
            this.validLap = false;
            events.push({ type: "missed-checkpoint", checkpoint: checkpoint.index });
          }
          continue;
        }
        if (!this.started) {
          this.started = true;
          this.lastLapStartedAt = now;
          this.nextCheckpoint = 1;
          events.push({ type: "start" });
          continue;
        }
        if (!this.validLap) continue;
        events.push({ type: "checkpoint", checkpoint: checkpoint.index });
        this.nextCheckpoint = (this.nextCheckpoint + 1) % this.circuit.checkpoints.length;
        if (checkpoint.index === 0) {
          if (this.validLap) {
            this.laps++;
            const lapTime = now - this.lastLapStartedAt;
            this.lapTimes.push(lapTime);
            events.push({ type: "lap", lap: this.laps, time: lapTime });
          } else {
            events.push({ type: "invalid-lap" });
          }
          this.validLap = true;
          this.lastLapStartedAt = now;
        }
      }
      if (this.started && this.validLap) {
        const previousIndex = (this.nextCheckpoint - 1 + this.circuit.checkpoints.length) % this.circuit.checkpoints.length;
        const lower = this.circuit.cumulative[this.circuit.checkpoints[previousIndex].pointIndex];
        const upper = this.nextCheckpoint === 0 ? length : this.circuit.cumulative[this.circuit.checkpoints[this.nextCheckpoint].pointIndex];
        if (projection.progressPixels >= lower - 1e-6 && projection.progressPixels <= upper + 1e-6) {
          this.maxProgressPixels = Math.max(this.maxProgressPixels, this.laps * length + projection.progressPixels);
        }
      }
      this.events.push(...events);
      return events;
    }
  }

  const api = { Circuit, ProgressTracker, CircuitGeometry: { distance, segmentsIntersect, projectPoint, pointInPolygon } };
  Object.assign(root, api);
  if (typeof module !== "undefined") module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
