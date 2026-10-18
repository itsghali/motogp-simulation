const test = require("node:test");
const assert = require("node:assert/strict");
const { Genome, DRIVING_PROFILES } = require("../genome.js");
const { SeededRandom } = require("../random.js");
const { ModelStorage: models } = require("../model-storage.js");
const { ModelFiles } = require("../model-files.js");
const memory = () => { const values = new Map(); return { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) }; };
const genome = profile => Genome.random(new SeededRandom(2027), profile);

test("cinq profils : nom, métadonnées et configuration dérivés du génome, traits appris exacts", () => {
  for (const profile of Object.keys(DRIVING_PROFILES)) {
    const g = genome(profile); g.traits.anticipation = 0.123; const before = JSON.stringify(g.toJSON());
    const saved = models.saveModel(memory(), g, { profile: "false", profileTraits: { anticipation: 999 }, config: { profile: "wrong", trackWidth: 44 } }, "Agressif Jerez");
    const info = models.profileInfo(g);
    assert.equal(saved.metadata.profile, profile); assert.equal(saved.metadata.config.profile, profile);
    assert.equal(saved.metadata.profileLabel, info.label); assert.deepEqual(saved.metadata.profileTraits, g.traits);
    assert.equal(saved.name, `${info.label} — Jerez`); assert.equal(saved.metadata.profileTraits.anticipation, 0.123);
    assert.equal(JSON.stringify(g.toJSON()), before);
  }
});
test("nom harmonisé : anciens profils retirés, accents conservés, préfixe stable, longueur bornée", () => {
  const g = genome("balanced");
  for (const title of ["Jerez prudent", "Agressif — Jerez", "Jerez Aggressif", "[Équilibré] Jerez", "Freinage tardif - Jerez", "Trajectoire régulière — Jerez"]) {
    assert.equal(models.modelName(title, g), "Équilibré — Jerez");
  }
  const title = models.modelName("Champion étoilé", g);
  assert.equal(title, "Équilibré — Champion étoilé"); assert.equal(models.modelName(title, g), title);
  assert.equal(models.modelName("Imprudent", g), "Équilibré — Imprudent");
  assert.ok(models.modelName("x".repeat(200), g).length <= 80);
  assert.equal(models.modelName("gp-Équilibré — Jerez", g), "gp-Équilibré — Jerez");
  assert.equal(models.modelName("gp-Jerez", g), "gp-Équilibré — Jerez");
  assert.equal(models.modelName("gp-equilibre", g), "gp-Équilibré — Jerez");
  assert.equal(models.modelName("", g), "Équilibré — Jerez");
});
test("anciens modèles mal nommés : affichage/export corrigés sans écraser les anciennes entrées", () => {
  const local = memory(); const g = genome("balanced");
  const old = { id: "old", name: "Jerez prudent", version: 2, genome: g.toJSON(), metadata: { config: { profile: "prudent" } } };
  local.setItem(models.LIBRARY_KEY, JSON.stringify({ version: 1, models: [old] }));
  const raw = local.getItem(models.LIBRARY_KEY);
  assert.equal(models.listModels(local)[0].name, "Équilibré — Jerez");
  const exported = JSON.parse(models.exportModel(local, "old"));
  assert.equal(exported.metadata.config.profile, "balanced"); assert.equal(exported.metadata.sourceName, "Jerez prudent");
  assert.equal(local.getItem(models.LIBRARY_KEY), raw);
  models.saveModel(local, genome("prudent"), {}, "second");
  assert.deepEqual(JSON.parse(local.getItem(models.LIBRARY_KEY)).models[0], old);
  assert.deepEqual(models.loadModel(local, "old").genome.toJSON(), g.toJSON());
});
test("import : faux nom/profil/traits corrigés depuis génome ; aucune validation héritée", () => {
  const local = memory(); const g = genome("lateBraking");
  const saved = models.importModel(local, JSON.stringify({ version: 2, name: "Prudent test", genome: g.toJSON(),
    metadata: { profile: "prudent", profileLabel: "Prudent", profileTraits: { braking: 1 }, validated: true, config: { profile: "prudent", trackWidth: 46 } } }));
  assert.equal(saved.name, "Freinage tardif — test"); assert.equal(saved.metadata.profile, "lateBraking");
  assert.equal(saved.metadata.config.profile, "lateBraking"); assert.equal(saved.metadata.validated, false);
  assert.deepEqual(saved.metadata.profileTraits, g.traits); assert.deepEqual(saved.genome, g.toJSON());
});
test("export : fichier et JSON restent adéquats même avec un nom de téléchargement trompeur", () => {
  const local = memory(); const g = genome("prudent");
  const saved = models.saveModel(local, g, {}, "Jerez génération 12"); const text = models.exportModel(local, saved.id);
  assert.equal(ModelFiles.filename(text, "Agressif"), "prudent-jerez-generation-12.json");
  const parsed = JSON.parse(text); assert.equal(parsed.name, saved.name); assert.equal(parsed.metadata.profile, parsed.genome.profile);
  const target = memory(); const imported = models.importModel(target, text);
  assert.equal(imported.name, saved.name); assert.deepEqual(imported.genome, g.toJSON());
  assert.equal(ModelFiles.filename('{"type":"trajectory"}', "validation run"), "validation-run.json");
});
test("profil personnalisé reste explicite au lieu de devenir faussement équilibré", () => {
  const g = genome("balanced"); g.profile = "custom-driver";
  const saved = models.saveModel(memory(), g, {}, "Prudent prototype");
  assert.equal(saved.metadata.profile, "custom-driver"); assert.equal(saved.name, "Personnalisé — prototype");
  assert.equal(saved.genome.profile, "custom-driver");
});
test("normaliser la sauvegarde ne modifie jamais l’objet de configuration actif", () => {
  const metadata = { config: { profile: "aggressive", vehicle: { maxForce: 0.18 } }, profile: "aggressive" };
  const before = JSON.stringify(metadata); models.saveModel(memory(), genome("prudent"), metadata, "test");
  assert.equal(JSON.stringify(metadata), before);
});

test("ancien génome sans origine : profil personnalisé explicite, jamais déduit du nom", () => {
  const json = genome("prudent").toJSON(); delete json.profile;
  const saved = models.importModel(memory(), JSON.stringify({ version: 1, name: "Prudent ancien", genome: json, metadata: { profile: "prudent" } }));
  assert.equal(saved.genome.profile, "custom"); assert.equal(saved.metadata.profileLabel, "Personnalisé");
  assert.equal(saved.name, "Personnalisé — ancien"); assert.deepEqual(saved.genome.traits, json.traits);
});
