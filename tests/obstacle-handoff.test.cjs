const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const { runtime, config, ReferenceInference } = require("./helpers/runtime.cjs");
function fixture() {
  const a = runtime(), sim = new a.LearningSimulation(new a.Circuit(), config(), new ReferenceInference());
  const bike = sim.population[0];
  bike.pos.set(100, 200); bike.previousPosition.set(100, 200); bike.vel.set(2, 0); bike.heading = 0;
  return { ...a, bike, steering: vm.runInContext("RaceSteering", a.context) };
}
test("restitution : cerveau conservé si son passage est dégagé malgré verrou obstacle", () => {
  const { bike: b, steering: s, context } = fixture();
  b.circuit = { isOnTrack: () => true };
  b.raceObstacles = [{ pos: { x: 110, y: 181 }, radius: 12 }];
  const neural = context.createVector(.03, .02), state = s.avoidance(b, b.raceObstacles).state;
  assert.ok(state, "ancien comportement aurait encore priorité");
  b.raceAvoidanceState = state;
  const before = JSON.stringify({ pos: b.pos, vel: b.vel, acc: b.acc, genome: b.genome.toJSON(), obstacles: b.raceObstacles });
  assert.equal(s.neuralPathClear(b, neural, b.raceObstacles), true);
  assert.deepEqual(s.compose(b, neural, [], { avoidance: true, avoidanceWeight: 1.5 }), neural);
  assert.equal(JSON.stringify({ pos: b.pos, vel: b.vel, acc: b.acc, genome: b.genome.toJSON(), obstacles: b.raceObstacles }), before);
});
test("restitution : corps complet, obstacle devant, derrière et rotation ne sont pas ignorés", () => {
  const { bike: b, steering: s, context } = fixture(), force = context.createVector(0, 0);
  const obstacle = (x, y, radius = 2) => ({ pos: { x, y }, radius });
  assert.equal(s.neuralPathClear(b, force, []), true);
  assert.equal(s.neuralPathClear(b, force, [obstacle(140, 200)]), false);
  assert.equal(s.neuralPathClear(b, force, [obstacle(89, 200)]), false, "roue arrière");
  assert.equal(s.neuralPathClear(b, force, [obstacle(80, 200)]), true);
  b.vel.set(.01, 0);
  assert.equal(s.neuralPathClear(b, context.createVector(-.01, .18), [obstacle(106, 205)]), false, "rotation balayée");
  b.vel.set(0, 0); assert.equal(s.neuralPathClear(b, force, [obstacle(140, 200)]), false);
});
test("restitution : anticipation agrandie avec distance de freinage, forces et zéro préservés", () => {
  const { bike: b, steering: s, context } = fixture();
  b.vel.set(5, 0); b.maxforce = .02;
  b.raceObstacles = [{ pos: { x: 300, y: 200 }, radius: 12 }];
  const neural = context.createVector(.02, 0);
  assert.equal(s.neuralPathClear(b, neural, b.raceObstacles), false);
  const result = s.compose(b, neural, [], { avoidance: true, avoidanceWeight: 1.5 });
  assert.ok(result.mag() <= b.maxforce + 1e-9);
  assert.deepEqual(s.compose(b, neural, [], { avoidance: false }), neural);
  assert.deepEqual(s.compose(b, neural, [], { avoidance: true, avoidanceWeight: 0 }), neural);
});

test("restitution : déplacement courant puis rotation, pas seulement rayon de vitesse proposée", () => {
  const { bike: b, steering: s, context } = fixture();
  b.vel.set(.1, 0); b.heading = 0;
  const force = context.createVector(-.18, .18), velocity = b.vel.copy().add(force);
  const obstacle = { pos: { x: 104, y: 188 }, radius: 1 };
  const oldProbe = { previousPosition: b.pos, previousHeading: 0,
    pos: context.createVector(b.pos.x + velocity.x * 30, b.pos.y + velocity.y * 30), headingAngle: () => velocity.heading() };
  assert.equal(s.collision(oldProbe, { pos: obstacle.pos, radius: 2 }), false, "ancien test manque roue arrière");
  assert.equal(s.neuralPathClear(b, force, [obstacle]), false, "balayage prochain pas interdit restitution");
});
test("bord local : freinage normal borné, tangente conservée, aucune trajectoire ni mutation", () => {
  const { bike: b, steering: s, context } = fixture();
  b.circuit = { walls: [{ a: { x: 110, y: 100 }, b: { x: 110, y: 300 } }] };
  b.vel.set(3, 1);
  const force = context.createVector(.1, 0), before = JSON.stringify([b.pos, b.vel, b.acc]);
  const result = s.wallClearance(b, force);
  assert.ok(result.x < 0); assert.equal(result.y, 0);
  assert.ok(result.mag() <= b.maxforce + 1e-12);
  assert.equal(JSON.stringify([b.pos, b.vel, b.acc]), before);
  b.vel.set(0, 2); assert.equal(s.wallClearance(b, context.createVector(0, 0)).mag(), 0);
  b.vel.set(-2, 0); assert.equal(s.wallClearance(b, force), force, "éloignement libre");
  b.pos.set(0, 200); b.vel.set(2, 0);
  assert.equal(s.wallClearance(b, force), force, "bord éloigné");
  b.pos.set(100, 200); b.vel.set(3, 0); b.raceObstacles = [{ pos: { x: 130, y: 230 }, radius: 2 }];
  assert.deepEqual(s.compose(b, force, [], { avoidance: false }), force);
  assert.deepEqual(s.compose(b, force, [], { avoidance: true, avoidanceWeight: 0 }), force);
});

for (const inspired of [false, true]) test(`régression utilisateur : six Agressif GP52, cinq obstacles, style ${inspired ? "30% + 12 drones" : "original"}, trois tours sans DNF`, () => {
  const a = runtime();
  for (const file of ["race-events.js", "replay.js", "race-analytics.js", "rider-roster.js", "race-session.js"])
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), a.context);
  const raw = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "models-gp52", "agressif-gp52.json"), "utf8"));
  const genome = a.Genome.fromJSON(raw.genome), before = JSON.stringify(genome.toJSON());
  const roster = a.context.RiderRoster.build(Array(6).fill(genome), inspired, .3);
  const expected = roster.map(rider => JSON.stringify(rider.genome.toJSON()));
  const obstacles = [[309, 180], [632, 587], [696, 202], [671, 311], [386, 478]].map(([x, y]) => ({ x, y, radius: 12 }));
  const race = new a.context.RaceSession(new a.Circuit(920, 720, 52), a.context.GrandPrixRules.configuration(52),
    new ReferenceInference(), roster.map(rider => rider.genome), new a.context.RaceEvents(), {
      laps: 3, obstacles, drones: { enabled: inspired, count: 12, radius: 100, separation: 1.5, alignment: 1, cohesion: .7 },
      assistance: { avoidance: true, separation: false, lookahead: 45, avoidanceWeight: 1.5, neuralWeight: 1 }
    });
  race.recordReplay = false; race.transition("RACE");
  let interventions = 0;
  const steering = vm.runInContext("RaceSteering", a.context), clear = steering.neuralPathClear;
  steering.neuralPathClear = (...args) => { const result = clear.apply(steering, args); if (!result) interventions++; return result; };
  for (let step = 0; step < 22000 && race.phase === "RACE"; step++) race.step();
  assert.equal(race.phase, "RESULTS");
  assert.ok(interventions > 0, "évitement réellement utilisé, pas désactivé pour faire passer test");
  assert.equal(race.summary().finishers, 6, JSON.stringify(race.population.map(b => b.stats.failureReason)));
  for (const b of race.population) {
    assert.equal(b.stats.laps, 3); assert.equal(b.stats.collisions, 0); assert.equal(b.stats.wrongWay, 0);
    assert.equal(b.stats.offTrackFrames, 0); assert.equal(JSON.stringify(b.genome.toJSON()), expected[b.id]);
  }
  assert.equal(JSON.stringify(genome.toJSON()), before);
});
