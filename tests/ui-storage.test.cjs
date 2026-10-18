const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const { Genome } = require("../genome.js");
const { SeededRandom } = require("../random.js");
const { ModelStorage } = require("../model-storage.js");

class Element {
  constructor() { this.children = []; this.listeners = {}; this.dataset = {}; }
  append(...nodes) { this.children.push(...nodes); }
  appendChild(node) { this.append(node); }
  insertBefore(node, before) { this.children.splice(this.children.indexOf(before), 0, node); }
  addEventListener(event, action) { this.listeners[event] = action; }
  querySelector() { return this.status || (this.status = new Element()); }
}

test("contrôles élargissement, budget et reprise ; restauration des paramètres et valeurs affichées", () => {
  const context = vm.createContext({ ModelStorage, SimulationConfig: require("../configuration.js"), document: { createElement: () => new Element(), createTextNode: text => text } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../ui.js"), "utf8"), context);
  let resumed = false;
  const ui = new context.SimulationUI(new Element(), { resume: () => { resumed = true; } });
  assert.equal(ui.config().trackWidth, 44);
  assert.equal(ui.config().trainingGenerations, 200);
  assert.equal(ui.inputs.trackWidth.id, "control-trackWidth");
  const labels = ui.container.children.flatMap(node => node.children || []);
  assert.ok(labels.some(label => label.htmlFor === ui.inputs.trackWidth.id));
  const action = ui.container.children.flatMap(node => node.children || []).find(node => node.textContent === "Reprendre entraînement");
  action.listeners.click();
  assert.equal(resumed, true);
  const saved = JSON.parse(JSON.stringify(ui.config()));
  saved.vehicle.maxForce = 0.3;
  saved.trackWidth = 50;
  saved.seed = 88;
  saved.fitnessWeights.checkpoints = 300;
  ui.applyConfig(saved);
  assert.equal(ui.config().vehicle.maxForce, 0.3);
  assert.equal(ui.config().trackWidth, 50);
  assert.equal(ui.config().seed, 88);
  assert.equal(ui.config().fitnessWeights.checkpoints, 300);
  assert.equal(Number(ui.outputs.maxForce.value), 0.3);
  assert.equal(Number(ui.outputs.trackWidth.value), 50);
  const genome = Genome.random(new SeededRandom(88));
  const values = new Map();
  const storage = { setItem: (key, value) => values.set(key, value), getItem: key => values.get(key) || null };
  ModelStorage.saveGenome(storage, genome, { config: saved, validationProtocol: 2 });
  const restored = ModelStorage.loadGenome(storage);
  assert.deepEqual(restored.metadata.config, saved);
  assert.deepEqual(restored.genome.toJSON(), genome.toJSON());
});

test("sauvegardes v1 restent rechargeables sans déclarer un modèle validé", () => {
  const genome = Genome.random(new SeededRandom(7));
  const storage = { getItem: () => JSON.stringify({ version: 1, genome: genome.toJSON(), metadata: { score: 3 } }) };
  const loaded = ModelStorage.loadGenome(storage);
  assert.deepEqual(loaded.genome.toJSON(), genome.toJSON());
  assert.equal(loaded.metadata.validated, undefined);
});
