(function (root) {
  // Adapted from 5-3/vehicleAvoidance.js and motorcycleSteering.js.
  // Example 9 owns its copies: no global `vehicules`, drawing, or locomotion here.
  function anticipation(vehicle, lookahead = 45, forward = null) {
    const speed = vehicle.vel.mag(), acceleration = Math.max(1e-6, vehicle.maxforce);
    const heading = vehicle.headingAngle();
    const direction = forward || { x: Math.cos(heading), y: Math.sin(heading) };
    const reach = Math.max(lookahead, speed * 30, speed * speed / (2 * acceleration) + speed * 10);
    // Same 30-step / half-distance probes as 5-3, extended for braking room.
    return { reach, ahead: createVector(vehicle.pos.x + direction.x * reach, vehicle.pos.y + direction.y * reach),
      ahead2: createVector(vehicle.pos.x + direction.x * reach / 2, vehicle.pos.y + direction.y * reach / 2) };
  }
  function separation(vehicle, neighbors, radius) {
    const direction = createVector(0, 0);
    let count = 0;
    if (radius > 0) for (const other of neighbors) {
      if (other.id === vehicle.id || other.dead || other.finished) continue;
      const dx = vehicle.pos.x - other.pos.x, dy = vehicle.pos.y - other.pos.y, distance = Math.hypot(dx, dy);
      if (distance >= radius) continue;
      if (distance < 1e-9) direction.add(createVector(vehicle.id < other.id ? -1 : 1, 0));
      else direction.add(createVector(dx / (distance * distance), dy / (distance * distance)));
      count++;
    }
    const desiredVelocity = direction.copy().setMag(vehicle.maxspeed);
    // No neighbor: absence of behavior, not a command to stop the vehicle.
    const force = count && direction.mag() > 1e-9 ? createVector(desiredVelocity.x - vehicle.vel.x,
      desiredVelocity.y - vehicle.vel.y).limit(vehicle.maxforce) : createVector(0, 0);
    return { force, desiredVelocity, count };
  }
  function headway(vehicle, neighbors, { distance = 125, stopGap = 6, corridor = 10, frame = null } = {}) {
    frame ||= root.RaceTrackFrame.at(vehicle.circuit, vehicle.pos, vehicle.headingAngle());
    const body = root.MotorcycleBody.snapshot(vehicle);
    let speedLimit = vehicle.maxspeed, leader = null, clearance = Infinity;
    for (const value of neighbors) {
      const other = value.headingAngle ? root.MotorcycleBody.snapshot(value) : value;
      if (other.id === vehicle.id || other.dead || other.finished) continue;
      const dx = other.pos.x - vehicle.pos.x, dy = other.pos.y - vehicle.pos.y;
      const ahead = dx * frame.forward.x + dy * frame.forward.y;
      const side = Math.abs(dx * frame.normal.x + dy * frame.normal.y);
      if (ahead <= 8 || side >= corridor) continue;
      const gap = root.MotorcycleBody.gap(body, other).clearance;
      if (gap >= distance) continue;
      // 5-3's linear headway ramp, measured body-to-body rather than centre-to-centre.
      // Match a moving leader instead of unnecessarily stopping behind it.
      const ramp = Math.max(0, Math.min(1, (gap - stopGap) / Math.max(1e-6, distance - stopGap)));
      const leaderSpeed = Math.max(0, other.vel.x * frame.forward.x + other.vel.y * frame.forward.y);
      const limit = Math.min(vehicle.maxspeed, leaderSpeed + vehicle.maxspeed * ramp);
      if (limit < speedLimit) { speedLimit = limit; leader = other; clearance = gap; }
    }
    const forward = Math.max(0, vehicle.vel.x * frame.forward.x + vehicle.vel.y * frame.forward.y);
    // This behavior is a brake only: it must never accelerate a slow/stopped rider.
    const desiredVelocity = createVector(frame.forward.x * Math.min(forward, speedLimit),
      frame.forward.y * Math.min(forward, speedLimit));
    const braking = leader && forward > speedLimit;
    const force = braking ? createVector(frame.forward.x * (speedLimit - forward),
      frame.forward.y * (speedLimit - forward)).limit(vehicle.maxforce) : createVector(0, 0);
    return { force, desiredVelocity, speedLimit, leader, clearance };
  }
  root.ReferenceSteering = { anticipation, separation, headway };
})(typeof globalThis !== "undefined" ? globalThis : this);
