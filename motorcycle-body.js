(function (root) {
  const HALF_AXIS = 8, RADIUS = 4;
  const turn = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
  function axis(position, heading) {
    const x = Math.cos(heading) * HALF_AXIS, y = Math.sin(heading) * HALF_AXIS;
    return [createVector(position.x - x, position.y - y), createVector(position.x + x, position.y + y)];
  }
  function snapshot(bike) {
    const heading = bike.headingAngle ? bike.headingAngle() : bike.heading;
    // Collision priority needs current road position, not race ranking progress
    // (which remains frozen before the start line and can differ by whole laps).
    const onRoad = !bike.circuit?.isOnTrack || bike.circuit.isOnTrack(bike.pos);
    const progress = onRoad ? bike.circuit?.nearestProjection?.(bike.pos)?.progressPixels ?? bike.race?.progress : undefined;
    return { id: bike.id, pos: bike.pos.copy(), vel: bike.vel.copy(), heading, progress,
      previousPosition: (bike.previousPosition || bike.pos).copy(), previousHeading: bike.previousHeading ?? heading,
      dead: !!bike.dead, finished: !!bike.finished };
  }
  function closestSegments(a, b, c, d) {
    const ux = b.x - a.x, uy = b.y - a.y, vx = d.x - c.x, vy = d.y - c.y;
    const cross = ux * vy - uy * vx;
    if (Math.abs(cross) > 1e-12) {
      const dx = c.x - a.x, dy = c.y - a.y;
      const t = (dx * vy - dy * vx) / cross, s = (dx * uy - dy * ux) / cross;
      if (t >= 0 && t <= 1 && s >= 0 && s <= 1) {
        const point = createVector(a.x + t * ux, a.y + t * uy);
        return { distance: 0, pointA: point, pointB: point.copy() };
      }
    }
    function project(p, from, to) {
      const x = to.x - from.x, y = to.y - from.y, length2 = x*x + y*y;
      const t = length2 ? Math.max(0, Math.min(1, ((p.x-from.x)*x + (p.y-from.y)*y)/length2)) : 0;
      return createVector(from.x + t*x, from.y + t*y);
    }
    const candidates = [[a.copy(), project(a,c,d)], [b.copy(), project(b,c,d)],
      [project(c,a,b), c.copy()], [project(d,a,b), d.copy()]];
    const pair = candidates.reduce((best, pair) => p5.Vector.dist(...pair) < p5.Vector.dist(...best) ? pair : best);
    return { distance: p5.Vector.dist(...pair), pointA: pair[0], pointB: pair[1] };
  }
  function gap(a, b) {
    const result = closestSegments(...axis(a.pos, a.heading), ...axis(b.pos, b.heading));
    return { ...result, clearance: result.distance - 2 * RADIUS };
  }
  function poseAt(body, t) {
    return { pos: createVector(body.previousPosition.x + (body.pos.x-body.previousPosition.x)*t,
      body.previousPosition.y + (body.pos.y-body.previousPosition.y)*t),
      heading: body.previousHeading + turn(body.previousHeading,body.heading)*t };
  }
  function sweptContact(a, b) {
    // Synchronized movement over the same step. Independent path hulls would
    // falsely collide bikes that visit the same place at different instants.
    const dx = (a.pos.x-a.previousPosition.x) - (b.pos.x-b.previousPosition.x);
    const dy = (a.pos.y-a.previousPosition.y) - (b.pos.y-b.previousPosition.y);
    const bound = Math.hypot(dx,dy) + HALF_AXIS *
      (Math.abs(turn(a.previousHeading,a.heading)) + Math.abs(turn(b.previousHeading,b.heading)));
    function interval(lo, hi, depth) {
      const mid = (lo+hi)/2, clearance = gap(poseAt(a,mid),poseAt(b,mid)).clearance;
      if (clearance <= 1e-9) return true;
      const uncertainty = bound * (hi-lo)/2;
      if (clearance > uncertainty + 1e-9) return false;
      // Conservative contact at subpixel tolerance; never skip a fast crossing.
      if (uncertainty <= 0.001 || depth === 20) return true;
      return interval(lo,mid,depth+1) || interval(mid,hi,depth+1);
    }
    return interval(0,1,0);
  }
  function nearby(body, neighbors, radius) {
    if (!(radius >= 0) || !Number.isFinite(radius)) return [];
    return neighbors.filter(other => other.id !== body.id && !other.dead && !other.finished)
      .map(other => ({ other, ...gap(body,other) }))
      .filter(result => result.clearance <= radius)
      .sort((a,b) => a.clearance-b.clearance || a.other.id-b.other.id);
  }
  root.MotorcycleBody = { HALF_AXIS, RADIUS, axis, snapshot, gap, sweptContact, nearby };
})(typeof globalThis !== "undefined" ? globalThis : this);
