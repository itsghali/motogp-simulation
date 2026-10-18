class Motorcycle extends Vehicle {
  constructor(genome, circuit, scenario, parameters, id = 0) {
    super(genome);
    this.genome = this.brain;
    this.circuit = circuit;
    this.scenario = scenario;
    this.parameters = parameters;
    this.id = id;
    this.random = new SeededRandom(scenario.seed);
    this.tracker = new ProgressTracker(circuit);
    this.sensorAngles = [-75, -45, -20, 0, 20, 45, 75].map(angle => angle * Math.PI / 180);
    this.sensorReadings = new Array(this.sensorAngles.length).fill(1);
    this.lastSteering = 0;
    this.previousPosition = null;
    this.offTrackRun = 0;
    this.stagnantFrames = 0;
    this.progressAnchor = 0;
    this.lastProgressAge = 0;
    this.age = 0;
    this.maxspeed = parameters.maxSpeed * scenario.engineFactor;
    this.maxforce = parameters.maxForce;
    this.sight = parameters.sensorRange * (0.65 + this.genome.traits.anticipation * 0.7);
    this.stats = Motorcycle.emptyStats(scenario.id);
    const pose = circuit.startPose(scenario.startOffset);
    this.pos.set(pose.position.x, pose.position.y);
    this.vel = p5.Vector.fromAngle(pose.heading + scenario.headingOffset)
      .setMag(this.maxspeed * scenario.initialSpeedFactor);
    this.heading = pose.heading + scenario.headingOffset;
    this.acc.set(0, 0);
    this.previousPosition = this.pos.copy();
    this.dead = false;
    this.finished = false;
  }

  static emptyStats(scenario) {
    return {
      scenario,
      checkpoints: 0,
      distanceOnTrack: 0,
      progressToNext: 0,
      laps: 0,
      bestLapTime: 0,
      offTrackFrames: 0,
      collisions: 0,
      wrongWay: 0,
      stagnation: 0,
      shortcuts: 0,
      missedCheckpoints: 0,
      speedSum: 0,
      frames: 0,
      failed: false
    };
  }

  headingAngle() { return this.vel.mag() > 1e-6 ? this.vel.heading() : this.heading; }

  castSensor(relativeAngle) {
    const angle = this.headingAngle() + relativeAngle;
    const direction = { x: Math.cos(angle), y: Math.sin(angle) };
    let nearest = this.sight;
    for (const wall of this.circuit.walls) {
      const x1 = wall.a.x; const y1 = wall.a.y;
      const x2 = wall.b.x; const y2 = wall.b.y;
      const x3 = this.pos.x; const y3 = this.pos.y;
      const x4 = x3 + direction.x; const y4 = y3 + direction.y;
      const denominator = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
      if (Math.abs(denominator) < 1e-9) continue;
      const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denominator;
      const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denominator;
      if (t >= 0 && t <= 1 && u >= 0 && u < nearest) nearest = u;
    }
    const noise = this.random.gaussian() * this.parameters.noiseLevel * this.scenario.sensorNoise;
    return Math.max(0, Math.min(this.sight, nearest + noise));
  }

  perceive() {
    this.sensorReadings = this.sensorAngles.map(angle => this.castSensor(angle));
    const danger = this.sensorReadings.map(distance => 1 - distance / this.sight);
    return danger.concat([
      this.vel.mag() / Math.max(this.maxspeed, 0.001),
      (this.lastSteering + 1) / 2
    ]);
  }

  decide(inputs) {
    return SteeringController.buildDecision(this.genome, inputs);
  }

  decideFromGpu(inputs, output) {
    return SteeringController.buildDecisionFromOutput(this.genome, inputs, output);
  }

  steeringForce(decision) {
    const heading = this.headingAngle();
    const turnRate = decision.steering * (0.045 + this.genome.traits.direction * 0.13) * this.scenario.grip * this.parameters.grip;
    const targetHeading = heading + turnRate;
    const brakeScale = 1 - decision.braking * this.parameters.brakingPower * this.scenario.brakingFactor;
    const targetSpeed = this.maxspeed * decision.throttle * Math.max(0.08, brakeScale);
    if (this.raceAssistance) this.racePreferredSpeed = targetSpeed;
    const desired = { x: Math.cos(targetHeading) * targetSpeed, y: Math.sin(targetHeading) * targetSpeed };
    const raw = SteeringController.computeSteeringForce({ x: this.vel.x, y: this.vel.y }, desired, this.maxforce);
    const engineScale = decision.throttle > this.vel.mag() / Math.max(this.maxspeed, 0.001)
      ? this.parameters.acceleration * this.scenario.engineFactor
      : this.parameters.brakingPower * this.scenario.brakingFactor;
    const limited = SteeringController.limitVector({ x: raw.x * engineScale, y: raw.y * engineScale }, this.maxforce);
    return createVector(limited.x, limited.y);
  }

  step(now, gpuOutput, inputs) {
    if (this.dead || this.finished) return [];
    if (!gpuOutput || !inputs) throw new Error("Décision GPU requise");
    const decision = this.decideFromGpu(inputs, gpuOutput);
    this.lastDecision = { ...decision };
    this.lastSteering = decision.steering;
    let force = this.steeringForce(decision);
    if (this.raceAssistance) force = RaceSteering.compose(this, force, this.raceNeighbors, this.raceAssistance);
    force.limit(this.maxforce);
    this.applyForce(force);
    this.previousPosition.set(this.pos.x, this.pos.y);
    super.update();
    if (this.vel.mag() > 1e-6) this.heading = this.vel.heading();
    this.age++;
    return this.updateRaceState(now);
  }

  updateRaceState(now) {
    const onTrack = this.circuit.isOnTrack(this.pos);
    if (!onTrack) {
      this.stats.offTrackFrames++;
      this.offTrackRun++;
    } else {
      this.offTrackRun = 0;
    }
    const events = this.tracker.update(this.previousPosition, this.pos, now, { onTrack });
    // Un déplacement en boucle ne constitue pas une progression dans la course.
    const minimumProgress = Math.max(2, this.maxspeed * 0.05 * 240);
    if (this.tracker.maxProgressPixels >= this.progressAnchor + minimumProgress || events.some(event => event.type === "start")) {
      this.progressAnchor = this.tracker.maxProgressPixels;
      this.lastProgressAge = this.age;
    }
    this.stagnantFrames = this.age - this.lastProgressAge;
    if (this.stagnantFrames === 240) this.stats.stagnation++;
    for (const event of events) {
      if (event.type === "checkpoint") {
        this.stats.checkpoints++;
        this.counter = 0;
      } else if (event.type === "lap") {
        this.stats.laps = this.tracker.laps;
        this.stats.bestLapTime = this.stats.bestLapTime === 0 ? event.time : Math.min(this.stats.bestLapTime, event.time);
      } else if (event.type === "wrong-way") this.stats.wrongWay++;
      else if (event.type === "shortcut") this.stats.shortcuts++;
      else if (event.type === "missed-checkpoint") this.stats.missedCheckpoints++;
    }
    this.stats.distanceOnTrack = this.tracker.maxProgressPixels;
    this.stats.progressToNext = onTrack && this.tracker.validLap && this.tracker.started
      ? this.circuit.progressToCheckpoint(this.pos, this.tracker.nextCheckpoint) : 0;
    this.stats.speedSum += this.vel.mag();
    this.stats.frames++;
    if (events.some(event => event.type === "shortcut")) this.fail("raccourci");
    else if (this.stats.missedCheckpoints > 0) this.fail("checkpoint manqué");
    else if (this.stats.wrongWay > 0) this.fail("mauvais sens");
    else if (!onTrack && this.circuit.walls.some(wall => CircuitGeometry.segmentsIntersect(this.previousPosition, this.pos, wall.a, wall.b))) this.collide();
    else if (this.offTrackRun > 45) this.fail("sortie prolongée");
    else if (this.stagnantFrames >= 300) this.fail("stagnation");
    return events;
  }

  fail(reason) {
    this.dead = true;
    this.stats.failed = true;
    this.stats.failureReason = this.stats.failureReason || reason;
  }

  changeScenario(scenario) {
    this.scenario = scenario;
    this.random = new SeededRandom(scenario.seed);
    this.maxspeed = this.parameters.maxSpeed * scenario.engineFactor;
  }

  collide() {
    if (this.dead) return;
    this.stats.collisions++;
    this.fail("collision avec limite de piste");
  }

  result() {
    return {
      ...this.stats,
      averageSpeed: this.stats.frames ? this.stats.speedSum / this.stats.frames : 0,
      failed: this.stats.failed || this.dead
    };
  }

  show(showSensors = false, highlighted = false) {
    push();
    translate(this.pos.x, this.pos.y);
    rotate(this.headingAngle());
    rectMode(CENTER);
    // Front points along +X, matching measured heading, including stationary replay.
    stroke(highlighted ? "#ffe066" : "#111820"); strokeWeight(highlighted ? 1.4 : 0.7);
    fill("#111820"); rect(-8, 0, 7, 3.7, 1); rect(8, 0, 7, 3.7, 1);
    fill(this.identity?.color || `hsl(${(this.id * 67 + 195) % 360},75%,60%)`);
    ellipse(2, 0, 13, 7); rect(-4, 0, 7, 5, 2);
    fill("#bce5ed"); ellipse(6, 0, 4, 4);
    stroke("#d7e1e8"); line(5, -4, 5, 4);
    fill("#202735"); ellipse(-2, 0, 7, 5); // Rider torso.
    fill("#f3f5ef"); ellipse(1, 0, 4, 4); // Helmet.
    noStroke(); fill("#ffffff"); textSize(5); textAlign(CENTER, CENTER);
    text(String(this.identity?.number ?? this.id + 1), -6, 0);
    pop();
    if (showSensors) {
      stroke(78, 230, 140, 100); strokeWeight(1);
      this.sensorAngles.forEach((relative, index) => {
        const angle = this.headingAngle() + relative;
        const length = this.sensorReadings[index];
        line(this.pos.x, this.pos.y, this.pos.x + Math.cos(angle) * length, this.pos.y + Math.sin(angle) * length);
      });
    }
  }
}
