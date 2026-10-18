const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const { runtime, ReferenceInference } = require("./runtime.cjs");
const root = path.join(__dirname, "../..");
const profiles = ["prudent", "equilibre", "agressif", "freinage-tardif", "trajectoire-reguliere"];
const obstacles = [[309, 180], [632, 587], [696, 202], [671, 311], [386, 478]].map(([x, y]) => ({ x, y, radius: 12 }));
function campaign({ profile = "agressif", traffic = true, addedObstacles = false, laps = 3, order = 0, diagnostics = false, inspired = false } = {}) {
  const a = runtime();
  for (const file of ["race-events.js", "replay.js", "race-analytics.js", "rider-roster.js", "race-session.js"])
    vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), a.context);
  const raw = profiles.map(name => JSON.parse(fs.readFileSync(path.join(root, "models-gp52", `${name}-gp52.json`), "utf8")));
  const genomes = Array.from({ length: 6 }, (_, i) => a.Genome.fromJSON(raw[profile === "mixed" ? (i + order) % raw.length : profiles.indexOf(profile)].genome));
  const before = JSON.stringify(genomes.map(g => g.toJSON())), inference = new ReferenceInference();
  const riders = a.context.RiderRoster.build(genomes, inspired, .3);
  const ridersBefore = JSON.stringify(riders.map(rider => rider.genome.toJSON()));
  const race = new a.context.RaceSession(new a.Circuit(920, 720, 52), a.context.GrandPrixRules.configuration(52), inference,
    riders.map(rider => rider.genome), new a.context.RaceEvents(), { laps, obstacles: addedObstacles ? obstacles : [],
      drones: { enabled: inspired, count: 12, radius: 100, separation: 1.5, alignment: 1, cohesion: .7 },
      assistance: { separation: traffic, avoidance: addedObstacles } });
  race.recordReplay = false; race.transition("RACE");
  const samples = [], decisions = new Map();
  if (diagnostics) {
    const respond = a.context.MotorcycleAvoidance.respond;
    a.context.MotorcycleAvoidance.respond = (bike, force, neighbors, options) => {
      const result = respond(bike, force, neighbors, options);
      decisions.set(bike.id, { id: bike.id, pos: { ...bike.pos }, vel: { ...bike.vel }, progress: bike.race.progress,
        heading: bike.headingAngle(), force: { ...result.force }, leader: result.leaderId, mode: result.mode });
      return result;
    };
  }
  let contacts = 0, contactSteps = 0, step = 0, worstContactRun = 0, contactRun = 0;
  for (; step < 22000 && race.phase === "RACE"; step++) {
    race.step(); contacts += race.bodyContacts.length;
    if (race.bodyContacts.length) {
      contactSteps++; contactRun++; worstContactRun = Math.max(worstContactRun, contactRun);
      if (diagnostics && samples.length < 10) samples.push({ step, contacts: race.bodyContacts, decisions: [...decisions.values()] });
    } else contactRun = 0;
  }
  return { profile, addedObstacles, finishers: race.summary().finishers, contacts, contactSteps, worstContactRun, step,
    phase: race.phase, samples, unchanged: before === JSON.stringify(genomes.map(g => g.toJSON())) &&
      ridersBefore === JSON.stringify(riders.map(rider => rider.genome.toJSON())),
    bikes: race.population.map(b => ({ id: b.id, laps: b.stats.laps, reason: b.stats.failureReason, wrongWay: b.stats.wrongWay,
      offTrack: b.stats.offTrackFrames, x: Math.round(b.pos.x), y: Math.round(b.pos.y) })) };
}
module.exports = { campaign, profiles, obstacles };
