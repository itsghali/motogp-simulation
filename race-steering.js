// Race-only reactive assistance. All forces use example 9 lowercase limits.
const RaceSteering = {
  desired(vehicle, direction) {
    if (direction.mag() < 1e-9) return createVector(0, 0);
    const desired = direction.copy().setMag(vehicle.maxspeed);
    return createVector(desired.x - vehicle.vel.x, desired.y - vehicle.vel.y).limit(vehicle.maxforce);
  },
  scale(vector, weight) { return createVector(vector.x * weight, vector.y * weight); },
  separation(vehicle, neighbors, radius) {
    return ReferenceSteering.separation(vehicle, neighbors, radius).force;
  },
  segmentDistance(point, from, to) {
    const dx = to.x - from.x, dy = to.y - from.y, length2 = dx * dx + dy * dy;
    const t = length2 ? Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / length2)) : 0;
    return Math.hypot(point.x - from.x - t * dx, point.y - from.y - t * dy);
  },
  bodyAxis(position, heading) {
    return MotorcycleBody.axis(position, heading);
  },
  wallClearance(vehicle, force) {
    // Local wall avoidance while passing an obstacle. Remove unsafe velocity
    // toward a perceived wall, retaining tangential movement, not a target path.
    const desired = createVector(vehicle.vel.x + force.x, vehicle.vel.y + force.y).limit(vehicle.maxspeed);
    let changed = false;
    for (const wall of vehicle.circuit?.walls || []) {
      const dx = wall.b.x - wall.a.x, dy = wall.b.y - wall.a.y, length2 = dx * dx + dy * dy;
      if (length2 < 1e-9) continue;
      const t = Math.max(0, Math.min(1, ((vehicle.pos.x - wall.a.x) * dx + (vehicle.pos.y - wall.a.y) * dy) / length2));
      const nx = vehicle.pos.x - wall.a.x - t * dx, ny = vehicle.pos.y - wall.a.y - t * dy;
      const distance = Math.hypot(nx, ny);
      if (distance < 1e-6) continue;
      const ux = nx / distance, uy = ny / distance;
      const outward = -(desired.x * ux + desired.y * uy);
      const allowance = Math.sqrt(2 * vehicle.maxforce * Math.max(0, distance - MotorcycleBody.RADIUS - 2)) * .7;
      if (outward > allowance) {
        desired.x += ux * (outward - allowance); desired.y += uy * (outward - allowance);
        changed = true;
      }
    }
    return changed ? createVector(desired.x - vehicle.vel.x, desired.y - vehicle.vel.y).limit(vehicle.maxforce) : force;
  },
  neuralPathClear(vehicle, force, obstacles) {
    if (!obstacles.length) return true;
    // Local constant-velocity prediction, not an extra locomotion update.
    // Keep both body orientations: a clear centre ray can still hit a rear wheel.
    const velocity = createVector(vehicle.vel.x + force.x, vehicle.vel.y + force.y).limit(vehicle.maxspeed);
    if (velocity.mag() < 1e-6) return false;
    const horizon = Math.max(30, vehicle.vel.mag() / Math.max(1e-6, vehicle.maxforce) + 10);
    const heading = velocity.heading();
    const probe = { previousPosition: vehicle.pos, previousHeading: vehicle.headingAngle(),
      pos: createVector(vehicle.pos.x + velocity.x * horizon, vehicle.pos.y + velocity.y * horizon),
      headingAngle: () => heading };
    // Vehicle.update first moves with CURRENT velocity, then updates velocity.
    // A long proposed-velocity ray alone can miss that immediate wheel sweep.
    const next = { ...probe, pos: createVector(vehicle.pos.x + vehicle.vel.x, vehicle.pos.y + vehicle.vel.y) };
    return obstacles.every(obstacle => {
      const inflated = { pos: obstacle.pos, radius: obstacle.radius + 1 };
      return !this.collision(next, inflated) && !this.collision(probe, inflated);
    });
  },
  collision(vehicle, obstacle) {
    const heading = vehicle.headingAngle();
    const previousHeading = vehicle.previousHeading ?? heading;
    const before = this.bodyAxis(vehicle.previousPosition, previousHeading), after = this.bodyAxis(vehicle.pos, heading);
    const points = [...before, ...after].sort((a, b) => a.x - b.x || a.y - b.y);
    const crossProduct = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    const chain = sorted => {
      const result = [];
      for (const point of sorted) {
        while (result.length > 1 && crossProduct(result.at(-2), result.at(-1), point) <= 0) result.pop();
        result.push(point);
      }
      return result.slice(0, -1);
    };
    const hull = [...chain(points), ...chain([...points].reverse())];
    // Edges plus interior cover the swept body, including fast transverse motion.
    let positive = false, negative = false, area = 0;
    let distance = Infinity;
    for (let i = 0; i < hull.length; i++) {
      const a = hull[i], b = hull[(i + 1) % hull.length];
      distance = Math.min(distance, this.segmentDistance(obstacle.pos, a, b));
      const cross = (b.x - a.x) * (obstacle.pos.y - a.y) - (b.y - a.y) * (obstacle.pos.x - a.x);
      positive ||= cross > 1e-9; negative ||= cross < -1e-9;
      area += a.x * b.y - b.x * a.y;
    }
    if (Math.abs(area) > 1e-9 && !(positive && negative)) return true;
    const turn = Math.atan2(Math.sin(heading - previousHeading), Math.cos(heading - previousHeading));
    const turnMargin = 8 * (1 - Math.cos(turn / 2));
    return distance <= obstacle.radius + 4 + turnMargin;
  },
  avoidance(vehicle, obstacles, lookahead = 45, previous = null, circuit = null) {
    const speed = vehicle.vel.mag(), acceleration = Math.max(1e-6, vehicle.maxforce);
    const heading = vehicle.headingAngle();
    let frame = { x: Math.cos(heading), y: Math.sin(heading) };
    // Keep the approach frame while passing: turning must not reverse the chosen side.
    if (previous && obstacles.includes(previous.obstacle)) {
      const dx = previous.obstacle.pos.x - vehicle.pos.x, dy = previous.obstacle.pos.y - vehicle.pos.y;
      if (dx * previous.forward.x + dy * previous.forward.y > -previous.obstacle.radius - 12) frame = previous.forward;
      else previous = null;
    } else previous = null;
    const fx = frame.x, fy = frame.y;
    const probes = ReferenceSteering.anticipation(vehicle, lookahead, frame), reach = probes.reach;
    let threat = null, nearest = Infinity;
    for (const obstacle of obstacles) {
      const dx = obstacle.pos.x - vehicle.pos.x, dy = obstacle.pos.y - vehicle.pos.y;
      const ahead = dx * fx + dy * fy, side = dx * -fy + dy * fx;
      const axis = this.bodyAxis(vehicle.pos, heading);
      const gap = this.segmentDistance(obstacle.pos, axis[0], axis[1]) - obstacle.radius - 4;
      const locked = previous?.obstacle === obstacle;
      const probeDistance = Math.min(p5.Vector.dist(probes.ahead, obstacle.pos), p5.Vector.dist(probes.ahead2, obstacle.pos));
      const sampled = probeDistance < obstacle.radius + 10;
      const inCorridor = Math.abs(side) < obstacle.radius + 10;
      // The two reference probes perceive threats; the continuous corridor also
      // catches small obstacles between them (a blind spot of point-only probes).
      if (locked || gap < 0 || (ahead >= 0 && ahead <= reach + obstacle.radius && (sampled || inCorridor))) {
        const score = ahead - obstacle.radius;
        if (score < nearest) { nearest = score; threat = { obstacle, gap, side, dx, dy, ahead }; }
      }
    }
    if (!threat) return { force: createVector(0, 0), immediate: false, state: null, probes };
    const radius = threat.obstacle.radius + 4, clearance = radius + 1.5;
    const freeSide = sign => {
      const target = { x: threat.obstacle.pos.x - fy * sign * clearance, y: threat.obstacle.pos.y + fx * sign * clearance };
      if (circuit && [ [0, 0], [-fy * 4, fx * 4], [fy * 4, -fx * 4], [fx * 4, fy * 4], [-fx * 4, -fy * 4] ]
        .some(([x, y]) => !circuit.isOnTrack({ x: target.x + x, y: target.y + y }))) return false;
      return !obstacles.some(other => other !== threat.obstacle && Math.hypot(target.x - other.pos.x, target.y - other.pos.y) <= other.radius + 4);
    };
    let sign = previous?.obstacle === threat.obstacle ? previous.sign : threat.side > 1e-9 ? -1 : 1;
    if (!previous || previous.obstacle !== threat.obstacle) {
      if (!freeSide(sign)) sign = freeSide(-sign) ? -sign : 0;
    }
    const cruiseSpeed = previous?.obstacle === threat.obstacle ? previous.cruiseSpeed : Math.min(vehicle.maxspeed, Math.max(speed, vehicle.maxspeed * 0.25));
    const state = { obstacle: threat.obstacle, sign, forward: frame, cruiseSpeed };
    const immediate = threat.gap <= Math.max(8, speed * 5);
    // Existing overlap cannot be repaired by teleportation. Return a bounded escape force.
    if (threat.gap < 0 && Math.hypot(threat.dx, threat.dy) > 1e-9) {
      return { force: this.desired(vehicle, createVector(-threat.dx, -threat.dy)), immediate: true, state, probes };
    }
    if (!sign) return { force: createVector(-vehicle.vel.x, -vehicle.vel.y).limit(vehicle.maxforce), immediate, state, probes };
    const lateralPosition = -threat.side;
    const lateralError = sign * clearance - lateralPosition;
    const lateralVelocity = vehicle.vel.x * -fy + vehicle.vel.y * fx;
    const lateralSpeed = Math.sign(lateralError) * Math.min(vehicle.maxspeed, Math.abs(lateralError) * 0.2, Math.sqrt(2 * acceleration * Math.abs(lateralError)) * 0.8) - lateralVelocity * 0.5;
    const lateralTime = Math.sqrt(2 * Math.abs(lateralError) / acceleration) + Math.abs(lateralVelocity) / acceleration;
    const distanceToFront = threat.ahead - radius - 8;
    // Brake early enough to buy lateral clearance; resume forward speed once beside it.
    const forwardSpeed = Math.abs(lateralError) < 1 ? cruiseSpeed
      : Math.max(0, Math.min(cruiseSpeed, Math.max(0, distanceToFront) / Math.max(1, lateralTime)));
    const desired = createVector(fx * forwardSpeed - fy * lateralSpeed, fy * forwardSpeed + fx * lateralSpeed).limit(cruiseSpeed);
    const force = createVector(desired.x - vehicle.vel.x, desired.y - vehicle.vel.y).limit(vehicle.maxforce);
    return { force, immediate, state, probes };
  },
  compose(vehicle, neural, neighbors, options) {
    let force = this.scale(neural, options.neuralWeight ?? 1).limit(vehicle.maxforce);
    vehicle.raceObstacleProbes = null;
    if (options.avoidance && (options.avoidanceWeight ?? 1.5) > 0) {
      const danger = this.avoidance(vehicle, vehicle.raceObstacles || [], options.lookahead, vehicle.raceAvoidanceState, vehicle.circuit);
      vehicle.raceAvoidanceState = danger.state;
      vehicle.raceObstacleProbes = danger.probes;
      // Obstacle avoidance supplies the base force; traffic can then cap speed
      // or request bounded lateral clearance without adding another update.
      // Side locking stabilises perception, but must not monopolise steering
      // once the brain proposes a body-clear passage (especially in a bend).
      if (danger.state && !this.neuralPathClear(vehicle, force, vehicle.raceObstacles || []))
        force = this.scale(danger.force, options.avoidanceWeight ?? 1.5).limit(vehicle.maxforce);
      // Traffic changes the approach speed/pose: guard the shared maneuver's
      // exit without changing obstacle-only driving when traffic is disabled.
      if (options.separation && (options.strength ?? .6) > 0 &&
        (vehicle.raceObstacles || []).some(obstacle => p5.Vector.dist(vehicle.pos, obstacle.pos) <
        (options.lookahead ?? 45) + obstacle.radius + 24)) force = this.wallClearance(vehicle, force);
    }
    if (options.separation && (options.strength ?? 0.6) > 0) {
      const traffic = MotorcycleAvoidance.respond(vehicle, force, neighbors, options);
      vehicle.raceTrafficDecision = traffic.mode;
      return traffic.force;
    }
    vehicle.raceTrafficDecision = "disabled";
    return force.limit(vehicle.maxforce);
  }
};