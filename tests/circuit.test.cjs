const test = require("node:test");
const assert = require("node:assert/strict");
const { Circuit, ProgressTracker, CircuitGeometry } = require("../circuit.js");

function crossCheckpoint(tracker, checkpoint, time, forward = true) {
  const direction = forward ? 1 : -1;
  const before = {
    x: checkpoint.center.x - checkpoint.tangent.x * 4 * direction,
    y: checkpoint.center.y - checkpoint.tangent.y * 4 * direction
  };
  const after = {
    x: checkpoint.center.x + checkpoint.tangent.x * 4 * direction,
    y: checkpoint.center.y + checkpoint.tangent.y * 4 * direction
  };
  return tracker.update(before, after, time, { onTrack: true });
}

function startedTracker(circuit) {
  const tracker = new ProgressTracker(circuit);
  crossCheckpoint(tracker, circuit.checkpoints[0], 0);
  return tracker;
}

test("checkpoints acceptés uniquement dans l’ordre", () => {
  const circuit = new Circuit();
  const tracker = startedTracker(circuit);
  const skipped = crossCheckpoint(tracker, circuit.checkpoints[2], 100);
  assert.equal(tracker.nextCheckpoint, 1);
  assert.equal(skipped.some(event => event.type === "missed-checkpoint"), true);
  const expected = crossCheckpoint(tracker, circuit.checkpoints[1], 200);
  assert.equal(expected.some(event => event.type === "checkpoint"), false);
  assert.equal(tracker.nextCheckpoint, 1);
  assert.equal(tracker.validLap, false);
});

test("franchir deux fois le même checkpoint ne donne aucun crédit", () => {
  const circuit = new Circuit();
  const tracker = startedTracker(circuit);
  crossCheckpoint(tracker, circuit.checkpoints[1], 100);
  const repeated = crossCheckpoint(tracker, circuit.checkpoints[1], 200);
  assert.equal(repeated.some(event => event.type === "checkpoint"), false);
  assert.equal(tracker.nextCheckpoint, 2);
});

test("tour complet détecté après toute la séquence et la ligne", () => {
  const circuit = new Circuit();
  const tracker = startedTracker(circuit);
  let time = 0;
  for (let index = 1; index < circuit.checkpoints.length; index++) {
    time += 100;
    crossCheckpoint(tracker, circuit.checkpoints[index], time);
  }
  const events = crossCheckpoint(tracker, circuit.checkpoints[0], time + 100);
  assert.equal(events.some(event => event.type === "lap"), true);
  assert.equal(tracker.laps, 1);
  assert.equal(tracker.lapTimes[0], time + 100);
});

test("mauvais sens et raccourci rejetés", () => {
  const circuit = new Circuit();
  const tracker = startedTracker(circuit);
  const wrong = crossCheckpoint(tracker, circuit.checkpoints[1], 100, false);
  assert.equal(wrong.some(event => event.type === "wrong-way"), true);
  assert.equal(tracker.nextCheckpoint, 1);
  const far = { x: 0, y: 0 };
  const jump = { x: circuit.trackWidth * 2, y: 0 };
  const shortcut = tracker.update(far, jump, 200, { onTrack: false });
  assert.equal(shortcut.some(event => event.type === "shortcut"), true);
  assert.equal(tracker.validLap, false);
});

test("géométrie conserve métriques officielles et départ sur piste", () => {
  const circuit = new Circuit();
  assert.equal(circuit.realLengthMeters, 4423);
  assert.equal(circuit.realWidthMeters, 11);
  assert.equal(circuit.turns, 13);
  assert.equal(circuit.direction, "horaire");
  assert.equal(circuit.isOnTrack(circuit.startPose().position), true);
});

test("centre de piste ne s’auto-intersecte pas", () => {
  const circuit = new Circuit(900, 720, 24);
  const points = circuit.centerline;
  for (let i = 0; i < points.length; i++) {
    const iNext = (i + 1) % points.length;
    for (let j = i + 1; j < points.length; j++) {
      const jNext = (j + 1) % points.length;
      if (i === j || iNext === j || jNext === i) continue;
      assert.equal(CircuitGeometry.segmentsIntersect(points[i], points[iNext], points[j], points[jNext]), false, `segments ${i} et ${j}`);
    }
  }
});

test("largeurs jusqu'à 100 px : détection des bords croisés et rejet strict des points dans les oreilles", () => {
  const c52 = new Circuit(920, 720, 52);
  assert.equal(c52.hasCrossedBorders(), false, "largeur 52 px sans bords croisés");

  const c100 = new Circuit(920, 720, 100);
  assert.equal(c100.hasCrossedBorders(), true, "largeur 100 px produit des bords croisés");
  const crossed = c100.detectCrossedBorders();
  assert.equal(crossed.crossed, true, "au moins un croisement détecté");
  assert.ok(crossed.ears.length > 0, "boucles croisées générées");

  // Vérifier qu'un point au centre de la boucle croisée n'est pas silencieusement traité comme piste valide
  const earPoly = crossed.ears[0];
  if (earPoly && earPoly.length >= 3) {
    const cx = (earPoly[0].x + earPoly[1].x + earPoly[2].x) / 3;
    const cy = (earPoly[0].y + earPoly[1].y + earPoly[2].y) / 3;
    assert.equal(c100.isInCrossedEar({ x: cx, y: cy }), true);
    assert.equal(c100.isOnTrack({ x: cx, y: cy }), false, "point dans boucle croisée refusé");
  }
});

test("isCorridorBlocked : détection passage totalement bloqué ou corridor praticable", () => {
  const circuit = new Circuit(920, 720, 52);
  const pose = circuit.startPose();
  const forward = { x: Math.cos(pose.heading), y: Math.sin(pose.heading) };
  const normal = { x: -forward.y, y: forward.x };

  // Bloquer entièrement la largeur de piste (52 px) avec deux gros obstacles
  const blockingObs = [
    { pos: { x: pose.position.x + normal.x * 12, y: pose.position.y + normal.y * 12 }, radius: 18 },
    { pos: { x: pose.position.x - normal.x * 12, y: pose.position.y - normal.y * 12 }, radius: 18 }
  ];
  assert.equal(circuit.isCorridorBlocked(blockingObs), true, "passage fermé détecté");

  // Laisser un corridor praticable de 15 px
  const passableObs = [
    { pos: { x: pose.position.x + normal.x * 16, y: pose.position.y + normal.y * 16 }, radius: 10 }
  ];
  assert.equal(circuit.isCorridorBlocked(passableObs), false, "passage ouvert autorisé");
});

