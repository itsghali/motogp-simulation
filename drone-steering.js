const DroneSteering = {
  neighbors(vehicle, flock, radius) {
    return flock.filter(other => other.id !== vehicle.id && p5.Vector.dist(vehicle.pos, other.pos) < radius);
  },
  separation(vehicle, flock, radius) { return RaceSteering.separation(vehicle, flock, radius); },
  alignment(vehicle, flock, radius) {
    const neighbors = this.neighbors(vehicle, flock, radius), average = createVector(0, 0);
    for (const other of neighbors) average.add(other.vel);
    return neighbors.length ? RaceSteering.desired(vehicle, average) : average;
  },
  cohesion(vehicle, flock, radius) {
    const neighbors = this.neighbors(vehicle, flock, radius), center = createVector(0, 0);
    if (!neighbors.length) return center;
    for (const other of neighbors) center.add(other.pos);
    return RaceSteering.desired(vehicle, createVector(center.x / neighbors.length - vehicle.pos.x, center.y / neighbors.length - vehicle.pos.y));
  },
  confinement(vehicle) {
    const p = vehicle.pos, margin = 90;
    return RaceSteering.desired(vehicle, createVector(p.x < margin ? 1 : p.x > 920 - margin ? -1 : 0, p.y < margin ? 1 : p.y > 720 - margin ? -1 : 0));
  },
  compose(vehicle, flock, options) {
    return RaceSteering.scale(this.separation(vehicle, flock, options.radius), options.separation)
      .add(RaceSteering.scale(this.alignment(vehicle, flock, options.radius), options.alignment))
      .add(RaceSteering.scale(this.cohesion(vehicle, flock, options.radius), options.cohesion))
      .add(RaceSteering.scale(this.confinement(vehicle), 3)).limit(vehicle.maxforce);
  }
};
