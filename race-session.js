(function (root) {
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  class RaceSession {
    constructor(circuit, config, inference, genomes, events, options = {}) {
      if (!genomes.length) throw new Error("Aucun génome disponible pour la course");
      this.circuit = circuit; this.config = JSON.parse(JSON.stringify(config)); this.inference = inference;
      this.events = events; this.targetLaps = clamp(Math.round(options.laps || 3), 1, 20);
      this.timing = { intro: 5000, flyover: 4500, grid: 4000, light: 700, hold: 1200, ...options.timing };
      for (const key of Object.keys(this.timing)) this.timing[key] = clamp(Number(this.timing[key]) || 0, 0, 30000);
      this.phase = "TITLE"; this.phaseTime = 0; this.time = 0; this.lights = 0; this.fastestLap = 0;
      this.rankOrder = []; this.pendingPasses = new Map(); this.battles = new Map(); this.finalLap = false;
      this.flags = new FlagManager(events); this.replay = new ReplaySystem(100, 100);
      this.recordReplay = true;
      this.assistance = Object.freeze({ separation: false, radius: 28, strength: 0.6, neuralWeight: 1, avoidance: false, lookahead: 45, avoidanceWeight: 1.5,
        predictionHorizon: 60, predictionMargin: 0, ...options.assistance });
      this.obstacles = (options.obstacles || []).map(spec => new Obstacle(genomes[0], spec));
      this.replay.context = JSON.parse(JSON.stringify({ trackWidth: circuit.trackWidth, assistance: this.assistance, obstacles: this.obstacles.map(o => o.snapshot()) }));
      this.droneOptions = Object.freeze({ enabled: false, count: 12, radius: 100, separation: 1.5, alignment: 1, cohesion: 0.7, ...options.drones });
      const droneRandom = new SeededRandom(this.config.seed ^ 0x51d0);
      this.drones = this.droneOptions.enabled ? Array.from({ length: Math.min(32, Math.max(0, Math.round(this.droneOptions.count))) }, (_, id) => new Drone(genomes[0], id, droneRandom)) : [];
      this.replay.context.drones = { ...this.droneOptions };
      this.highestSpeed = 0; this.crashes = []; this.heat = new Map(); this.bodyContacts = [];
      this.analytics = new RaceAnalytics(circuit);
      this.maxTime = (this.config.scenarioSeconds || 120) * this.targetLaps * 1000;
      const scenario = new ScenarioFactory(this.config.seed).createSet(1, "race", 777)[0];
      const count = Math.min(12, genomes.length);
      const gridBodies = [];
      this.population = genomes.slice(0, count).map((genome, id) => {
        const bike = new Motorcycle(genome, circuit, { ...scenario, initialSpeedFactor: 0, headingOffset: 0 }, this.config.vehicle, id);
        // Grid placement only. Driving still exclusively uses Motorcycle.step / Vehicle.update.
        const rowSpacing = 2 * (MotorcycleBody.HALF_AXIS + MotorcycleBody.RADIUS);
        let setback = 10 + Math.floor(id / 2) * rowSpacing + (id % 2) * 8;
        const offset = (id % 2 ? 1 : -1) * circuit.trackWidth * 0.24;
        let pose, body;
        for (let attempt = 0; attempt < 200; attempt++, setback += 2) {
          pose = RaceSession.poseAt(circuit, circuit.totalPixels - setback, offset);
          body = { pos: createVector(pose.x, pose.y), heading: pose.heading };
          if (circuit.isOnTrack(body.pos) && gridBodies.every(other => MotorcycleBody.gap(body, other).clearance >= MotorcycleBody.RADIUS)) break;
          if (attempt === 199) { this.flags.dispose(); throw new Error("Grille trop encombrée : aucun emplacement sûr"); }
        }
        gridBodies.push(body);
        bike.pos.set(pose.x, pose.y); bike.previousPosition.set(pose.x, pose.y);
        bike.vel.set(0, 0); bike.acc.set(0, 0); bike.heading = pose.heading;
        bike.race = { finishTime: null, lastLap: 0, overtakes: 0, offTrack: false, progress: -setback, maxSpeed: 0 };
        if (options.identities?.[id]) bike.identity = { ...options.identities[id] };
        return bike;
      });
      try { this.inference.setGenomes(this.population.map(bike => bike.genome)); }
      catch (error) { this.flags.dispose(); throw error; }
      this.rankOrder = this.population.map(bike => bike.id);
    }
    static poseAt(circuit, distance, offset = 0) {
      const d = (distance % circuit.totalPixels + circuit.totalPixels) % circuit.totalPixels;
      let index = circuit.segmentLengths.findIndex((length, i) => d < circuit.cumulative[i] + length);
      if (index < 0) index = 0;
      const a = circuit.centerline[index]; const b = circuit.centerline[(index + 1) % circuit.centerline.length];
      const t = (d - circuit.cumulative[index]) / circuit.segmentLengths[index];
      const heading = Math.atan2(b.y - a.y, b.x - a.x);
      return { x: a.x + (b.x - a.x) * t - Math.sin(heading) * offset,
        y: a.y + (b.y - a.y) * t + Math.cos(heading) * offset, heading };
    }
    emit(type, bike, extra = {}) { this.events.emit(type, { time: this.time, id: bike?.id, riderName: bike?.identity?.name, x: bike?.pos.x, y: bike?.pos.y, ...extra }); }
    begin() { if (this.phase === "TITLE") this.transition("INTRO"); }
    transition(phase) {
      this.phase = phase; this.phaseTime = 0;
      this.emit("PHASE", null, { phase });
      if (phase === "RACE") { this.lights = 0; this.emit("RACE_START"); if (this.targetLaps === 1) { this.finalLap = true; this.emit("FINAL_LAP", this.population[0]); } }
    }
    advancePresentation(delta) {
      if (["TITLE", "RACE", "PODIUM"].includes(this.phase)) return;
      this.phaseTime += clamp(delta, 0, 100);
      const phases = { INTRO: [this.timing.intro, "FLYOVER"], FLYOVER: [this.timing.flyover, "GRID"],
        GRID: [this.timing.grid, "LIGHTS"], LIGHTS: [this.timing.light * 5 + this.timing.hold, "RACE"],
        RESULTS: [8000, "PODIUM"] };
      if (this.phase === "LIGHTS") this.lights = this.timing.light ? Math.min(5, Math.floor(this.phaseTime / this.timing.light) + 1) : 5;
      const next = phases[this.phase]; if (next && this.phaseTime >= next[0]) this.transition(next[1]);
    }
    step() {
      if (this.phase !== "RACE") return;
      this.time += 1000 / 60;
      const inputs = this.population.map(bike => bike.dead || bike.finished ? Array(9).fill(0) : bike.perceive());
      const outputs = this.inference.predict(inputs);
      const neighbors = this.population.map(bike => MotorcycleBody.snapshot(bike));
      this.population.forEach((bike, i) => {
        bike.raceAssistance = this.assistance; bike.raceNeighbors = neighbors; bike.raceObstacles = this.obstacles;
        bike.raceBodyNeighbors = MotorcycleBody.nearby(neighbors[i], neighbors, this.assistance.radius);
        bike.raceThreats = MotorcyclePrediction.threats(neighbors[i], neighbors, {
          horizon: this.assistance.predictionHorizon, margin: this.assistance.predictionMargin });
        if (bike.dead || bike.finished) return;
        bike.previousHeading = bike.headingAngle();
        const events = bike.step(this.time, outputs[i], inputs[i]);
        if (!bike.dead && this.obstacles.some(obstacle => RaceSteering.collision(bike, obstacle))) {
          bike.stats.collisions++; bike.fail("collision avec obstacle");
        }
        this.observe(bike, events);
        if (this.time >= this.maxTime && !bike.finished && !bike.dead) { bike.fail("temps de course dépassé"); this.observe(bike, []); }
      });
      // Perception only in correctif 2: record contacts without changing locomotion
      // or declaring a CRASH. Avoidance and contact policy are separate steps.
      const bodies = this.population.map(bike => MotorcycleBody.snapshot(bike));
      this.bodyContacts = [];
      for (let i = 0; i < bodies.length; i++) for (let j = i+1; j < bodies.length; j++) {
        if (neighbors[i].dead || neighbors[i].finished || neighbors[j].dead || neighbors[j].finished) continue;
        if (MotorcycleBody.sweptContact(bodies[i], bodies[j])) this.bodyContacts.push({ a: bodies[i].id, b: bodies[j].id });
      }
      const flock = this.drones.map(drone => ({ id: drone.id, pos: drone.pos.copy(), vel: drone.vel.copy() }));
      const forces = this.drones.map(drone => DroneSteering.compose(drone, flock, this.droneOptions));
      this.drones.forEach((drone, i) => drone.step(forces[i]));
      this.updateStandings(); this.flags.update(this.time);
      if (this.recordReplay) this.replay.capture(this.time, this.population, false, this.drones);
      if (this.population.every(bike => bike.dead || bike.finished)) {
        if (this.recordReplay) { this.replay.capture(this.time, this.population, true, this.drones); this.replay.save(); }
        if (!this.population.some(bike => bike.finished)) this.emit("RACE_STOPPED");
        this.transition("RESULTS");
      }
    }
    observe(bike, events) {
      const state = bike.race;
      if (bike.age % 6 === 0 || bike.dead) this.analytics.sample(bike);
      state.progress = bike.tracker.started ? bike.tracker.maxProgressPixels : state.progress;
      state.maxSpeed = Math.max(state.maxSpeed, bike.vel.mag()); this.highestSpeed = Math.max(this.highestSpeed, state.maxSpeed);
      const key = `${Math.floor(bike.pos.x / 12)},${Math.floor(bike.pos.y / 12)}`;
      if (this.heat.size < 5000 || this.heat.has(key)) this.heat.set(key, (this.heat.get(key) || 0) + 1);
      if (bike.offTrackRun > 0 && !state.offTrack) this.emit("OFF_TRACK", bike);
      state.offTrack = bike.offTrackRun > 0;
      for (const event of events) {
        if (event.type !== "lap") continue;
        state.lastLap = event.time; this.emit("LAP_COMPLETED", bike, { lap: bike.stats.laps, lapTime: event.time });
        if (!this.fastestLap || event.time < this.fastestLap) { this.fastestLap = event.time; this.emit("FAST_LAP", bike, { lapTime: event.time }); }
        if (bike.stats.laps === this.targetLaps - 1 && !this.finalLap) { this.finalLap = true; this.emit("FINAL_LAP", bike); }
        if (bike.stats.laps >= this.targetLaps) {
          bike.finished = true; state.finishTime = this.time; this.emit("FINISH", bike); break;
        }
      }
      if (bike.dead && !state.dnf) {
        this.analytics.fail(bike);
        state.dnf = true; this.crashes.push({ x: bike.pos.x, y: bike.pos.y });
        this.emit(bike.stats.collisions ? "CRASH" : "DNF", bike, { reason: bike.stats.failureReason });
      }
    }
    standings() {
      return this.population.slice().sort((a, b) => {
        if (a.finished || b.finished) return a.finished && b.finished ? a.race.finishTime - b.race.finishTime || a.id - b.id : a.finished ? -1 : 1;
        if (a.dead !== b.dead) return a.dead ? 1 : -1;
        return b.race.progress - a.race.progress || a.id - b.id;
      });
    }
    updateStandings() {
      const ordered = this.standings();
      const oldLeader = this.rankOrder[0];
      const confirmed = new Set();
      // Persistent pairwise ordering: no announcement for start sorting, DNF or lap wrapping.
      for (let i = 0; i < ordered.length; i++) for (let j = i + 1; j < ordered.length; j++) {
        const ahead = ordered[i]; const behind = ordered[j]; const key = `${ahead.id}:${behind.id}`;
        if (ahead.dead || behind.dead || ahead.finished || behind.finished || !ahead.tracker.started || !behind.tracker.started) continue;
        const gap = ahead.race.progress - behind.race.progress;
        if (this.rankOrder.indexOf(ahead.id) > this.rankOrder.indexOf(behind.id) && gap > 3) {
          confirmed.add(key);
          if (!this.pendingPasses.has(key)) this.pendingPasses.set(key, this.time);
          if (this.time - this.pendingPasses.get(key) >= 1000) {
            ahead.race.overtakes++; this.emit("OVERTAKE", ahead, { passed: behind.id, passedName: behind.identity?.name });
            this.rankOrder.splice(this.rankOrder.indexOf(ahead.id), 1);
            this.rankOrder.splice(this.rankOrder.indexOf(behind.id), 0, ahead.id);
            this.pendingPasses.delete(key);
          }
        }
        if (gap >= 0 && gap < 20) {
          if (!this.battles.has(key)) this.battles.set(key, { since: this.time, announced: false });
          const battle = this.battles.get(key);
          if (!battle.announced && this.time - battle.since > 2000) { battle.announced = true; this.emit("CLOSE_BATTLE", ahead, { rival: behind.id }); }
        } else this.battles.delete(key);
      }
      for (const key of this.pendingPasses.keys()) if (!confirmed.has(key)) this.pendingPasses.delete(key);
      const actualPairs = new Set();
      for (let i = 0; i < ordered.length; i++) for (let j = i + 1; j < ordered.length; j++) actualPairs.add(`${ordered[i].id}:${ordered[j].id}`);
      for (const key of this.battles.keys()) if (!actualPairs.has(key)) this.battles.delete(key);
      if (oldLeader !== this.rankOrder[0]) this.emit("LEADER_CHANGE", this.population.find(bike => bike.id === this.rankOrder[0]));
    }
    gap(bike, leader = this.standings()[0]) {
      if (bike === leader) return "LEADER";
      if (bike.finished && leader.finished) return `+${((bike.race.finishTime - leader.race.finishTime) / 1000).toFixed(3)} s`;
      const metres = Math.max(0, leader.race.progress - bike.race.progress) / this.circuit.totalPixels * this.circuit.realLengthMeters;
      return `+${metres.toFixed(1)} m`;
    }
    summary() {
      const finishers = this.standings().filter(bike => bike.finished);
      return { winner: finishers[0]?.id ?? null, finishers: finishers.length,
        dnf: this.population.filter(bike => bike.dead).length, completion: finishers.length / this.population.length,
        fastestLap: this.fastestLap, highestSpeed: this.highestSpeed,
        mostOvertakes: this.population.slice().sort((a, b) => b.race.overtakes - a.race.overtakes)[0]?.id };
    }
  }
  root.RaceSession = RaceSession;
  if (typeof module !== "undefined") module.exports = { RaceSession };
})(typeof globalThis !== "undefined" ? globalThis : this);
