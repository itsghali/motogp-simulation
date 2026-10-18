(function (root) {
  // Profile-agnostic Reynolds queueing / arrival: perception, priority, steering.
  // No genome access, predefined route, position write or locomotion here.
  function respond(vehicle, neural, neighbors, options = {}) {
    const base = neural.copy().limit(vehicle.maxforce);
    if (!((options.strength ?? .6) > 0)) return { force: base, mode: "clear" };
    const headingNow = vehicle.headingAngle();
    const frame = vehicle.circuit?.isOnTrack && !vehicle.circuit.isOnTrack(vehicle.pos)
      ? { forward: { x: Math.cos(headingNow), y: Math.sin(headingNow) } }
      : root.RaceTrackFrame.at(vehicle.circuit, vehicle.pos, headingNow);
    const fx = frame.forward.x, fy = frame.forward.y, nx = -fy, ny = fx;
    const desired = createVector(vehicle.vel.x + base.x, vehicle.vel.y + base.y).limit(vehicle.maxspeed), speed = vehicle.vel.mag();
    const bodyLength = 2 * (root.MotorcycleBody.HALF_AXIS + root.MotorcycleBody.RADIUS);
    const stopGap = (root.MotorcycleBody.HALF_AXIS + root.MotorcycleBody.RADIUS) * (1 + Math.min(3, options.strength ?? .6));
    const body = root.MotorcycleBody.snapshot(vehicle);
    function localProgress(other) {
      let delta = other.progress - body.progress;
      const length = vehicle.circuit?.totalPixels;
      if (Number.isFinite(delta) && length > 0) delta -= Math.round(delta / length) * length;
      return delta;
    }
    const candidates = [];
    let leader = null, closest = Infinity, cap = Infinity;
    let emergency = null, emergencyDistance = Infinity, emergencyCap = Infinity;
    for (const value of neighbors) {
      const other = value.headingAngle ? root.MotorcycleBody.snapshot(value) : value;
      if (other.id === vehicle.id || other.dead || other.finished) continue;
      const dx = other.pos.x - vehicle.pos.x, dy = other.pos.y - vehicle.pos.y;
      const distance = Math.hypot(dx, dy), ahead = dx * fx + dy * fy, side = Math.abs(dx * nx + dy * ny);
      const progress = localProgress(other);
      const leaderSpeed = Math.max(0, other.vel.x * fx + other.vel.y * fy), closing = Math.max(0, speed - leaderSpeed);
      const range = Math.max(bodyLength + (options.radius ?? 28),
        closing * closing / (2 * Math.max(1e-6, vehicle.maxforce)) + speed * 12 + bodyLength + stopGap);
      if (distance > range || side > (options.radius ?? 28) + 8 || (!Number.isFinite(progress) && ahead < -8)) continue;
      const yieldTo = Number.isFinite(progress) ? progress > 1e-6 || (Math.abs(progress) <= 1e-6 && other.id < vehicle.id)
        : ahead > 4 || (Math.abs(ahead) <= 4 && other.id < vehicle.id);
      if (yieldTo) candidates.push({ other, distance, progress, ahead });
    }
    for (const { other, distance, progress, ahead } of candidates) {
      const leaderSpeed = other.vel.mag();
      const along = Number.isFinite(progress) && progress < 2 * distance ? progress : ahead;
      const clearance = Math.min(root.MotorcycleBody.gap(body, other).clearance, along - bodyLength);
      // Queueing: merge by yielding speed, never by pushing a rider into a wall.
      const closing = Math.max(0, speed - leaderSpeed), room = Math.max(0, clearance - stopGap - closing);
      // A moving centre does not guarantee room for the rear wheel's turn.
      const allowance = leaderSpeed * Math.max(0, Math.min(1, clearance / stopGap));
      const comfort = Math.max(0, allowance + (clearance - stopGap) / 12);
      const hard = Math.max(0, allowance + Math.sqrt(2 * vehicle.maxforce * room) * .8);
      // Queue behind the nearest rider, but enforce braking distance to ALL
      // riders. A remote comfort target must not needlessly stop the convoy.
      if (distance < closest - 1e-9 || (Math.abs(distance - closest) < 1e-9 && other.id < leader?.id)) {
        leader = other; closest = distance; cap = comfort;
      }
      if (hard < emergencyCap - 1e-9 || (Math.abs(hard - emergencyCap) < 1e-9 && other.id < emergency?.id)) {
        emergency = other; emergencyDistance = distance; emergencyCap = hard;
      }
    }
    if (emergencyCap < cap) { leader = emergency; closest = emergencyDistance; cap = emergencyCap; }
    if (!leader || desired.mag() <= cap) return { force: base, mode: "clear" };
    // Choose a reachable velocity on the brain's proposed heading. Scaling a
    // desired velocity to zero before limiting force erases cornering instead.
    // The force-radius circle gives the minimum reachable speed on this ray.
    const heading = desired.mag() > 1e-6 ? desired.heading() : body.heading;
    const turn = Math.atan2(Math.sin(heading - body.heading), Math.cos(heading - body.heading));
    const parallel = speed * Math.cos(turn), across = speed * Math.sin(turn);
    const available = Math.sqrt(Math.max(0, vehicle.maxforce * vehicle.maxforce - across * across));
    const nextSpeed = Math.max(0, parallel - available, Math.min(cap, desired.mag()));
    const target = createVector(Math.cos(heading) * nextSpeed, Math.sin(heading) * nextSpeed);
    return { force: createVector(target.x - vehicle.vel.x, target.y - vehicle.vel.y).limit(vehicle.maxforce),
      mode: "brake", desiredVelocity: target, leaderId: leader.id, distance: closest };
  }
  function withCurvature(vehicle, neural, neighbors, options = {}) {
    const result = respond(vehicle, neural, neighbors, options);
    if (!((options.strength ?? .6) > 0)) { vehicle.raceTrafficSlowed = false; return result; }
    if (result.mode === "brake") vehicle.raceTrafficSlowed = true;
    const preferred = vehicle.racePreferredSpeed, speed = vehicle.vel.mag();
    if (Number.isFinite(preferred) && speed >= preferred * .95) vehicle.raceTrafficSlowed = false;
    if (!vehicle.raceTrafficSlowed || !Number.isFinite(preferred) || preferred < .1 || speed < .1 || vehicle.raceAvoidanceState)
      return result;
    // Steering in Motorcycle is an angle per step. When traffic reduces speed,
    // scale that angle too: otherwise the same turn suddenly has a smaller radius.
    // Use the requested physical speed, never genome weights or a driving profile.
    const velocity = createVector(vehicle.vel.x + result.force.x, vehicle.vel.y + result.force.y).limit(vehicle.maxspeed);
    const heading = vehicle.headingAngle();
    const turn = Math.atan2(Math.sin(velocity.heading() - heading), Math.cos(velocity.heading() - heading));
    const angle = heading + turn * Math.min(1, speed / preferred);
    const target = createVector(Math.cos(angle) * velocity.mag(), Math.sin(angle) * velocity.mag());
    return { ...result, force: createVector(target.x - vehicle.vel.x, target.y - vehicle.vel.y).limit(vehicle.maxforce),
      desiredVelocity: target, mode: result.mode === "clear" ? "recover" : result.mode };
  }
  function protectTurn(vehicle, result, neighbors) {
    const body = root.MotorcycleBody.snapshot(vehicle);
    const velocity = createVector(vehicle.vel.x + result.force.x, vehicle.vel.y + result.force.y).limit(vehicle.maxspeed);
    if (velocity.mag() < 1e-6) return result;
    const turn = Math.atan2(Math.sin(velocity.heading() - body.heading), Math.cos(velocity.heading() - body.heading));
    if (Math.abs(turn) < 1e-7) return result;
    const peers = neighbors.map(value => value.headingAngle ? root.MotorcycleBody.snapshot(value) : value)
      .filter(other => other.id !== body.id && !other.dead && !other.finished &&
        p5.Vector.dist(body.pos, other.pos) < 2 * (root.MotorcycleBody.HALF_AXIS + root.MotorcycleBody.RADIUS) +
          body.vel.mag() + other.vel.mag() + 4);
    if (!peers.length) return result;
    // Vehicle moves with current velocity, then changes velocity/heading. Check
    // that exact next-step body sweep, not just a ray through the centre.
    function clear(fraction, margin = 0) {
      const own = { pos: createVector(body.pos.x + body.vel.x, body.pos.y + body.vel.y),
        heading: body.heading + turn * fraction, previousPosition: body.pos, previousHeading: body.heading };
      return peers.every(other => {
        const next = { pos: createVector(other.pos.x + other.vel.x, other.pos.y + other.vel.y), heading: other.heading,
          previousPosition: other.pos, previousHeading: other.heading };
        return !root.MotorcycleBody.sweptContact(own, next) && root.MotorcycleBody.gap(own, next).clearance >= margin;
      });
    }
    if (clear(1, root.MotorcycleBody.RADIUS / 2) || !clear(0)) return result;
    let lo = 0, hi = 1;
    for (let step = 0; step < 12; step++) {
      const mid = (lo + hi) / 2;
      if (clear(mid, root.MotorcycleBody.RADIUS / 2)) lo = mid; else hi = mid;
    }
    const heading = body.heading + turn * lo * .95;
    const target = createVector(Math.cos(heading) * velocity.mag(), Math.sin(heading) * velocity.mag());
    return { ...result, force: createVector(target.x - body.vel.x, target.y - body.vel.y).limit(vehicle.maxforce),
      desiredVelocity: target, mode: "guard" };
  }
  root.MotorcycleAvoidance = { respond(vehicle, neural, neighbors, options = {}) {
    const result = withCurvature(vehicle, neural, neighbors, options);
    return (options.strength ?? .6) > 0 ? protectTurn(vehicle, result, neighbors) : result;
  } };
})(typeof globalThis !== "undefined" ? globalThis : this);
