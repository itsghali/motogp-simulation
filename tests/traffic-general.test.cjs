const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm"), crypto = require("node:crypto");
const { runtime, config, ReferenceInference } = require("./helpers/runtime.cjs");
const { campaign, profiles } = require("./helpers/race-campaign.cjs");
function fixture() {
  const a = runtime(), sim = new a.LearningSimulation(new a.Circuit(), config(), new ReferenceInference());
  const [bike, other, third] = sim.population;
  for (const [id, b] of [bike, other, third].entries()) {
    b.id = id; b.pos.set(100, 200); b.previousPosition.set(100, 200); b.vel.set(3, 0); b.heading = 0;
    b.circuit = { isOnTrack: () => true }; b.race = { progress: 0 };
  }
  other.pos.set(140, 200); other.vel.set(1, 0); other.race.progress = 40;
  return { ...a, bike, other, third, respond: a.context.MotorcycleAvoidance.respond };
}
test("anticollision indépendante du génome : aucune lecture de poids, traits ou profil", () => {
  const { bike: b, other: o, context, respond } = fixture(), force = context.createVector(.1, .04);
  const expected = respond(b, force, [o], { strength: .6 });
  const forbidden = new Proxy({}, { get() { throw new Error("Accès au génome interdit pour anticollision"); } });
  b.genome = forbidden; o.genome = forbidden;
  const actual = respond(b, force, [o], { strength: .6 });
  assert.equal(actual.mode, "brake"); assert.deepEqual(actual.force, expected.force);
});
test("freinage conserve exactement braquage proposé et force atteignable", () => {
  const { bike: b, other: o, context, respond } = fixture(), neural = context.createVector(.1, .06);
  const result = respond(b, neural, [o], { strength: .6 }), next = b.vel.copy().add(result.force), desired = b.vel.copy().add(neural);
  assert.equal(result.mode, "brake"); assert.ok(Math.abs(next.heading() - desired.heading()) < 1e-12);
  assert.ok(result.force.mag() <= b.maxforce + 1e-12); assert.ok(next.mag() < desired.mag());
  const before = JSON.stringify([b.pos, b.vel, b.acc, o.pos, o.vel]);
  respond(b, neural, [o], { strength: .6 }); assert.equal(JSON.stringify([b.pos, b.vel, b.acc, o.pos, o.vel]), before);
});
test("vitesse demandée : courbure compensée après freinage, récupération puis désactivation exacte", () => {
  const { bike: b, other: o, context, respond } = fixture(), n = context.createVector(.1, .06);
  b.maxspeed = 8; b.racePreferredSpeed = 6;
  const desired = b.vel.copy().add(n), result = respond(b, n, [o], { strength: .6 });
  assert.equal(result.mode, "brake"); assert.equal(b.raceTrafficSlowed, true);
  assert.ok(Math.abs(b.vel.copy().add(result.force).heading() - desired.heading() / 2) < 1e-12);
  assert.ok(result.force.mag() <= b.maxforce + 1e-12);
  const recover = respond(b, n, [], { strength: .6 });
  assert.equal(recover.mode, "recover");
  assert.ok(Math.abs(b.vel.copy().add(recover.force).mag() - desired.mag()) < 1e-12);
  b.vel.set(5.8, 0);
  assert.deepEqual(respond(b, n, [], { strength: .6 }).force, n); assert.equal(b.raceTrafficSlowed, false);
  b.raceTrafficSlowed = true;
  assert.deepEqual(respond(b, n, [o], { strength: 0 }).force, n); assert.equal(b.raceTrafficSlowed, false);
});
test("évitement actif garde son braquage : pas de double compensation de sa manoeuvre", () => {
  const { bike: b, other: o, context, respond } = fixture(), n = context.createVector(.1, .06);
  b.racePreferredSpeed = 6; b.raceAvoidanceState = {};
  const result = respond(b, n, [o], { strength: .6 });
  assert.equal(result.mode, "brake");
  assert.ok(Math.abs(b.vel.copy().add(result.force).heading() - b.vel.copy().add(n).heading()) < 1e-12);
});
test("vitesse physique exposée au contrôleur, sans changer forces ni apprentissage", () => {
  const { bike: b } = fixture(), d = { steering: .2, throttle: .5, braking: .2 };
  const expected = b.steeringForce(d); assert.equal(b.racePreferredSpeed, undefined);
  b.raceAssistance = { separation: true };
  assert.deepEqual(b.steeringForce(d), expected);
  assert.equal(b.racePreferredSpeed, b.maxspeed * .5 * Math.max(.08, 1 - .2 * b.parameters.brakingPower * b.scenario.brakingFactor));
});
test("priorité de progression et égalité par id, indépendante ordre voisins, sans cycle mutuel", () => {
  const { bike: b, other: o, third: t, context, respond } = fixture(), force = context.createVector(.08, 0);
  b.race.progress = 10; o.race.progress = 10; t.race.progress = 10;
  o.pos.set(100, 209); t.pos.set(100, 191);
  assert.equal(respond(b, force, [o, t], { strength: .6 }).mode, "clear", "id0 prioritaire continue");
  const left = respond(t, force, [b, o], { strength: .6 }), right = respond(t, force, [o, b], { strength: .6 });
  assert.equal(left.mode, "brake"); assert.deepEqual(left.force, right.force);
  b.race.progress = 9; o.race.progress = 11;
  assert.equal(respond(b, force, [o], { strength: .6 }).mode, "brake");
  assert.equal(respond(o, force, [b], { strength: .6 }).mode, "clear");
});
test("voisin proche rapide ne masque pas un pilote arrêté plus loin", () => {
  const { bike: b, other: o, third: t, context, respond } = fixture(), n = context.createVector(.1, 0);
  o.vel.set(4.5, 0); t.pos.set(160, 200); t.vel.set(0, 0); t.race.progress = 60;
  assert.equal(respond(b, n, [o], { strength: .6 }).mode, "clear");
  const result = respond(b, n, [o, t], { strength: .6 });
  assert.equal(result.mode, "brake"); assert.equal(result.leaderId, t.id);
  assert.deepEqual(respond(b, n, [t, o], { strength: .6 }).force, result.force);
});
test("avant ligne de départ : priorité suit position actuelle, pas rang de grille figé", () => {
  const { bike: b, other: o, Circuit, context, respond } = fixture(), B = context.MotorcycleBody;
  const road = new Circuit(920, 720, 52); b.circuit = road; o.circuit = road;
  b.id = 4; o.id = 5;
  b.pos.set(742.5, 387.8); b.vel.set(-.7, 1.5); b.race.progress = -58;
  o.pos.set(731, 392.6); o.vel.set(-.007, 1.7); o.race.progress = -100;
  assert.equal(B.snapshot(o).progress, road.nearestProjection(o.pos).progressPixels);
  assert.notEqual(B.snapshot(o).progress, o.race.progress);
  const result = respond(b, context.createVector(0, .1), [o], { strength: .6 });
  assert.equal(result.mode, "brake"); assert.equal(result.leaderId, o.id);
  assert.equal(respond(o, context.createVector(0, .1), [b], { strength: .6 }).mode, "clear");
});
test("départ immobile : céder priorité ne tourne jamais moto vers son voisin", () => {
  const { bike: b, other: o, context, respond } = fixture();
  b.vel.set(0, 0); o.vel.set(0, 0); o.pos.set(125, 209);
  const n = context.createVector(.1, .03), result = respond(b, n, [o], { strength: .6 });
  assert.equal(result.mode, "brake"); assert.equal(result.force.mag(), 0); assert.equal(b.heading, 0);
  o.pos.set(180, 209);
  assert.deepEqual(respond(b, n, [o], { strength: .6 }).force, n, "redémarrage libre sans impulsion artificielle");
});
test("rattraper un tour : priorité locale tient compte bouclage, pas classement absolu", () => {
  const { bike: b, other: o, context, respond } = fixture(), n = context.createVector(.1, 0);
  b.circuit.totalPixels = 1000; o.circuit.totalPixels = 1000;
  b.race.progress = 1050; o.race.progress = 100;
  assert.equal(respond(b, n, [o], { strength: .6 }).mode, "brake", "rider àun tour physiquement devant reste un obstacle");
  assert.equal(respond(o, n, [b], { strength: .6 }).mode, "clear", "aucun arrêt réciproque");
});
test("roue arrière en rotation : leader en mouvement ne donne pas droit avancer dans corps", () => {
  const { bike: b, other: o, context, respond } = fixture();
  b.pos.set(0, 0); b.vel.set(.09, .27); b.heading = b.vel.heading(); b.race.progress = -72;
  o.pos.set(7, 20); o.vel.set(-.44, .98); o.heading = o.vel.heading(); o.race.progress = -44;
  const force = context.createVector(.054, .134), result = respond(b, force, [o], { strength: .6 });
  assert.ok(result.mode === "brake" || result.mode === "guard");
  assert.ok(b.vel.copy().add(result.force).mag() < b.vel.mag());
  assert.ok(result.force.mag() <= b.maxforce + 1e-12);
});
test("garde rotation : conducteur prioritaire ne frappe pas corps derrière lui", () => {
  const { bike: b, other: o, context, respond } = fixture(), B = context.MotorcycleBody;
  b.pos.set(0, 0); b.vel.set(.1, 0); b.heading = 0; b.race.progress = 10;
  o.pos.set(-16, -9); o.vel.set(0, 0); o.heading = 0; o.race.progress = -6;
  const n = context.createVector(.08, .1), other = B.snapshot(o);
  other.previousPosition = other.pos.copy(); other.previousHeading = other.heading;
  const future = force => ({ pos: context.createVector(.1, 0), heading: b.vel.copy().add(force).heading(),
    previousPosition: b.pos.copy(), previousHeading: 0 });
  assert.equal(B.sweptContact(future(n), other), true, "régression : centre libre mais roue arrière heurte");
  const result = respond(b, n, [o], { strength: .6 });
  assert.equal(result.mode, "guard"); assert.equal(B.sweptContact(future(result.force), other), false);
  assert.ok(result.force.mag() <= b.maxforce + 1e-12); assert.equal(b.pos.x, 0); assert.equal(b.vel.x, .1);
});
test("forces finies et bornées, absence de boost et cap conservé sur 300 géométries reproductibles", () => {
  const { bike: b, other: o, context, respond } = fixture();
  for (let i = 0; i < 300; i++) {
    const angle = i * .17, speed = (i % 40) * .15;
    b.maxspeed = 8; b.maxforce = .02 + (i % 15) * .025;
    b.vel.set(Math.cos(angle) * speed, Math.sin(angle) * speed); b.heading = angle;
    b.pos.set(100, 200); o.pos.set(100 + Math.cos(angle) * 35, 200 + Math.sin(angle) * 35);
    o.vel.set(Math.cos(angle), Math.sin(angle));
    const n = context.createVector(Math.sin(i) * .2, Math.cos(i) * .2).limit(b.maxforce);
    const before = JSON.stringify([b.pos, b.vel, b.acc]), result = respond(b, n, [o], { strength: .6 });
    assert.ok(Number.isFinite(result.force.mag())); assert.ok(result.force.mag() <= b.maxforce + 1e-9);
    const next = b.vel.copy().add(result.force), desired = b.vel.copy().add(n);
    if (result.mode === "brake") {
      assert.ok(next.mag() <= desired.mag() + 1e-9);
      if (next.mag() > 1e-6 && desired.mag() > 1e-6)
        assert.ok(Math.abs(next.x * desired.y - next.y * desired.x) < 1e-8);
    }
    assert.equal(JSON.stringify([b.pos, b.vel, b.acc]), before);
  }
});
test("grille sans chevauchement corps complet : 12 motos, largeurs 24/32/44/52", () => {
  const a = runtime();
  for (const file of ["race-events.js", "replay.js", "race-analytics.js", "race-session.js"])
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), a.context);
  const sim = new a.LearningSimulation(new a.Circuit(), config(), new ReferenceInference()), genome = sim.population[0].genome;
  for (const width of [24, 32, 44, 52]) {
    const race = new a.context.RaceSession(new a.Circuit(920, 720, width), a.context.GrandPrixRules.configuration(width),
      new ReferenceInference(), Array(12).fill(genome), new a.context.RaceEvents());
    const bodies = race.population.map(a.context.MotorcycleBody.snapshot);
    for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++)
      assert.ok(a.context.MotorcycleBody.gap(bodies[i], bodies[j]).clearance >= a.context.MotorcycleBody.RADIUS - 1e-9, `${width}px : ${i}/${j}`);
    assert.ok(race.population.every(b => race.circuit.isOnTrack(b.pos) && b.vel.mag() === 0));
    race.flags.dispose();
  }
});
test("cinq cerveaux de campagne réels : fichiers non vides et poids distincts", () => {
  const hashes = profiles.map(profile => {
    const raw = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "models-gp52", `${profile}-gp52.json`), "utf8"));
    assert.ok(raw.genome.weightsIH.length > 0);
    return crypto.createHash("sha256").update(JSON.stringify(raw.genome.weightsIH)).digest("hex");
  });
  assert.equal(new Set(hashes).size, 5);
});
test("lancement réel : cinq cerveaux homologués sur nouvelle grille, aides coupées", () => {
  const a = runtime();
  for (const file of ["race-events.js", "replay.js", "race-analytics.js", "race-session.js"])
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), a.context);
  for (const profile of profiles) {
    const raw = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "models-gp52", `${profile}-gp52.json`), "utf8"));
    const genome = a.Genome.fromJSON(raw.genome), before = JSON.stringify(genome.toJSON());
    const report = a.context.GrandPrixRules.qualify(a.context.GrandPrixRules.configuration(52), Array(6).fill(genome));
    assert.equal(report.passed, true, JSON.stringify({ profile, riders: report.riders }));
    assert.ok(report.riders.every(rider => rider.checkpoints === 63 && rider.laps === 3));
    assert.equal(JSON.stringify(genome.toJSON()), before);
  }
});
for (const profile of profiles) test(`anticollision générale : ${profile}, six motos / trois tours, zéro contact`, () => {
  const result = campaign({ profile });
  assert.equal(result.phase, "RESULTS"); assert.equal(result.finishers, 6, JSON.stringify(result.bikes));
  assert.equal(result.contacts, 0); assert.equal(result.unchanged, true);
  assert.ok(result.bikes.every(b => b.laps === 3 && b.wrongWay === 0 && b.offTrack === 0));
});
for (const order of [0, 1, 2, 3, 4]) test(`grille mixte indépendante des affectations : rotation ${order}, zéro contact`, () => {
  const result = campaign({ profile: "mixed", order });
  assert.equal(result.finishers, 6, JSON.stringify(result.bikes)); assert.equal(result.contacts, 0); assert.ok(result.unchanged);
});
test("cas utilisateur : deux aides, Agressif GP52 et cinq obstacles, six arrivées sans contact", () => {
  const result = campaign({ profile: "agressif", addedObstacles: true });
  assert.equal(result.finishers, 6, JSON.stringify(result.bikes)); assert.equal(result.contacts, 0); assert.ok(result.unchanged);
});
test("cas utilisateur : deux aides, variantes style 30 % et douze drones, six arrivées sans contact", () => {
  const result = campaign({ profile: "agressif", addedObstacles: true, inspired: true });
  assert.equal(result.finishers, 6, JSON.stringify(result.bikes)); assert.equal(result.contacts, 0); assert.ok(result.unchanged);
});
