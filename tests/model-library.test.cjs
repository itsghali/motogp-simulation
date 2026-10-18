const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { Genome } = require("../genome.js");
const { SeededRandom } = require("../random.js");
const { ModelStorage: storage } = require("../model-storage.js");

function memory() {
  const values = new Map();
  return { values, get length() { return values.size; }, key: i => [...values.keys()][i] || null,
    getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
}
const genome = seed => Genome.random(new SeededRandom(seed));

test("récupérer les sauvegardes du site recherche les anciennes archives, pas seulement les derniers imports", () => {
  const local = memory();
  const saved = storage.saveModel(local, genome(20), { score: 100 }, "sur le site");
  const original = JSON.stringify(JSON.parse(local.getItem(storage.LIBRARY_KEY)).models[0]);
  storage.importModel(local, storage.exportModel(local, saved.id));
  storage.clearModels(local);
  const imported = storage.saveModel(local, genome(21), { imported: true }, "import récent");
  storage.clearModels(local); storage.restoreModels(local);
  assert.equal(storage.savedModelRecoveryCount(local), 1);
  assert.equal(storage.recoverSavedModels(local), 1);
  assert.equal(storage.listModels(local).length, 2);
  const restored = JSON.parse(local.getItem(storage.LIBRARY_KEY)).models.find(model => model.id === saved.id);
  assert.equal(JSON.stringify(restored), original);
  assert.deepEqual(storage.loadModel(local, imported.id).genome.toJSON(), genome(21).toJSON());
  assert.equal(storage.savedModelRecoveryCount(local), 0);
  assert.equal(storage.recoverSavedModels(local), 0);
});

test("récupération des sauvegardes ne remplace aucun modèle présent et reste atomique au quota", () => {
  const local = memory(); const saved = storage.saveModel(local, genome(22));
  storage.clearModels(local);
  storage.saveModel(local, genome(23));
  const current = JSON.parse(local.getItem(storage.LIBRARY_KEY)); current.models[0].id = "current-unrelated";
  local.setItem(storage.LIBRARY_KEY, JSON.stringify(current));
  const raw = local.getItem(storage.LIBRARY_KEY);
  const write = local.setItem;
  local.setItem = () => { throw new Error("quota"); };
  assert.throws(() => storage.recoverSavedModels(local), /quota/);
  assert.equal(local.getItem(storage.LIBRARY_KEY), raw);
  local.setItem = write; storage.recoverSavedModels(local);
  const library = JSON.parse(local.getItem(storage.LIBRARY_KEY));
  const recovered = library.models.find(model => model.id === saved.id);
  recovered.genome = genome(24).toJSON(); local.setItem(storage.LIBRARY_KEY, JSON.stringify(library));
  assert.equal(storage.recoverSavedModels(local), 0);
  assert.deepEqual(storage.loadModel(local, saved.id).genome.toJSON(), genome(24).toJSON());
});

test("vider tous les modèles conserve une récupération exacte et les autres préférences", () => {
  const local = memory();
  storage.saveGenome(local, genome(10));
  storage.saveModel(local, genome(11), {}, "premier");
  storage.saveModel(local, genome(12), {}, "second");
  local.setItem("audio-preference", "quiet");
  const raw = local.getItem(storage.LIBRARY_KEY);
  const legacy = local.getItem(storage.STORAGE_KEY);
  assert.equal(storage.clearModels(local), 3);
  assert.deepEqual(storage.listModels(local), []);
  assert.equal(storage.loadModel(local), null);
  assert.equal(storage.hasRecovery(local), true);
  assert.equal(storage.clearModels(local), 0);
  assert.equal(storage.restoreModels(local), 3);
  assert.equal(local.getItem(storage.LIBRARY_KEY), raw);
  assert.equal(local.getItem(storage.STORAGE_KEY), legacy);
  assert.equal(local.getItem("audio-preference"), "quiet");
});

test("vider ancienne sauvegarde seule ne la fait pas réapparaître ; restauration conserve les poids", () => {
  const local = memory(); storage.saveGenome(local, genome(13));
  assert.equal(storage.clearModels(local), 1);
  assert.deepEqual(storage.listModels(local), []);
  assert.equal(storage.restoreModels(local), 1);
  assert.deepEqual(storage.loadModel(local, "legacy").genome.toJSON(), genome(13).toJSON());
});

test("échecs de stockage à chaque étape préservent la bibliothèque ; restauration refuse un écrasement", () => {
  for (const failAt of [1, 2, 3]) {
    const local = memory(); storage.saveModel(local, genome(14), {}, "conservé");
    const raw = local.getItem(storage.LIBRARY_KEY), write = local.setItem; let calls = 0;
    local.setItem = (key, value) => { if (++calls === failAt) throw new Error("quota"); write(key, value); };
    assert.throws(() => storage.clearModels(local), /quota/);
    assert.equal(local.getItem(storage.LIBRARY_KEY), raw);
  }
  const local = memory();
  assert.throws(() => storage.restoreModels(local), /Aucune/);
  storage.saveModel(local, genome(15)); storage.clearModels(local);
  storage.saveModel(local, genome(16)); const raw = local.getItem(storage.LIBRARY_KEY);
  assert.throws(() => storage.restoreModels(local), /nouveaux modèles conservés/);
  assert.equal(local.getItem(storage.LIBRARY_KEY), raw);
});

test("bibliothèque garde plusieurs modèles même avec même nom, et charge précisément la sélection", () => {
  const local = memory();
  const a = storage.saveModel(local, genome(1), { score: 50 }, "essai");
  const b = storage.saveModel(local, genome(2), { score: 80 }, "essai");
  assert.notEqual(a.id, b.id);
  assert.equal(storage.listModels(local).length, 2);
  assert.deepEqual(storage.loadModel(local, a.id).genome.toJSON(), genome(1).toJSON());
  assert.deepEqual(storage.loadModel(local, b.id).genome.toJSON(), genome(2).toJSON());
  assert.equal(storage.loadModel(local, "inconnu"), null);
});

test("ancienne sauvegarde récupérée sans écrasement lors du premier ajout à la bibliothèque", () => {
  const local = memory(); storage.saveGenome(local, genome(3), { score: 99 });
  const legacyRaw = local.getItem(storage.STORAGE_KEY);
  assert.equal(storage.listModels(local)[0].id, "legacy");
  storage.saveModel(local, genome(4), {}, "nouveau");
  assert.equal(storage.listModels(local).length, 2);
  assert.equal(local.getItem(storage.STORAGE_KEY), legacyRaw);
  assert.deepEqual(storage.loadModel(local, "legacy").genome.toJSON(), genome(3).toJSON());
});

test("export/import conserve génome et réglages, sans accepter un drapeau de validation externe", () => {
  const local = memory(); const other = memory();
  const model = storage.saveModel(local, genome(5), { validated: true, validationLaps: [{ time: 100 }], config: { trackWidth: 50 } }, "champion");
  const imported = storage.importModel(other, storage.exportModel(local, model.id));
  assert.deepEqual(imported.genome, model.genome);
  assert.deepEqual(imported.metadata.config, model.metadata.config);
  assert.equal(imported.name, "Équilibré — champion");
  assert.equal(imported.metadata.validated, false);
  assert.deepEqual(imported.metadata.validationLaps, []);
  storage.importModel(other, storage.exportModel(local, model.id));
  assert.equal(storage.listModels(other).length, 2);
});

test("import invalide, version inconnue, poids corrompus et fichier surdimensionné ne modifient rien", () => {
  const local = memory(); storage.saveModel(local, genome(6), {}, "conservé");
  const before = local.getItem(storage.LIBRARY_KEY);
  const valid = JSON.parse(storage.exportModel(local, storage.listModels(local)[0].id));
  const corrupt = JSON.parse(JSON.stringify(valid)); corrupt.genome.weightsIH[0] = null;
  for (const text of ["{bad", "null", JSON.stringify({ ...valid, version: 999 }), JSON.stringify(corrupt), "x".repeat(storage.MAX_FILE_BYTES + 1)]) {
    assert.throws(() => storage.importModel(local, text));
    assert.equal(local.getItem(storage.LIBRARY_KEY), before);
  }
});

test("quota refusé préserve toutes les entrées existantes", () => {
  const local = memory(); storage.saveModel(local, genome(7), {}, "conservé");
  const before = local.getItem(storage.LIBRARY_KEY);
  local.setItem = () => { throw new Error("quota"); };
  assert.throws(() => storage.saveModel(local, genome(8), {}, "nouveau"), /quota/);
  assert.equal(local.getItem(storage.LIBRARY_KEY), before);
});

test("fichiers : téléchargement Blob JSON, nom sûr et révocation URL ; lecture bornée", async () => {
  let downloaded, removed = false, revoked = false, clicked = false;
  const link = { click() { clicked = true; }, remove() { removed = true; } };
  const context = vm.createContext({ Blob, ModelStorage: storage,
    document: { createElement: () => link, body: { appendChild(node) { downloaded = node; } } },
    URL: { createObjectURL: blob => { assert.equal(blob.type, "application/json"); return "blob:test"; }, revokeObjectURL: () => { revoked = true; } },
    setTimeout: action => action() });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../model-files.js"), "utf8"), context);
  context.ModelFiles.download('{"model":1}', '../mon modèle');
  assert.ok(clicked && removed && revoked); assert.equal(downloaded.href, "blob:test");
  assert.match(downloaded.download, /^[a-z0-9_-]+\.json$/i);
  assert.equal(await context.ModelFiles.read({ size: 3, text: async () => "abc" }), "abc");
  assert.equal(await context.ModelFiles.read(null), null);
  await assert.rejects(context.ModelFiles.read({ size: storage.MAX_FILE_BYTES + 1 }), /volumineux/);
});
