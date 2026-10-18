const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const { runtime } = require("./helpers/runtime.cjs");

// Connected-tree lookup matters: moving a control into a detached wrapper
// makes document.getElementById return null, unlike a simple id-map double.
class Node {
  constructor(tag = "div", id = "") { this.tagName = tag.toUpperCase(); this.id = id; this.children = []; this.listeners = {}; this.attrs = {}; this.className = ""; this.hidden = false; }
  get firstChild() { return this.children[0] || null; }
  get nextSibling() { return this.parentNode?.children[this.parentNode.children.indexOf(this) + 1] || null; }
  get classList() { return { contains: key => this.className.split(" ").includes(key), remove: key => { this.className = this.className.split(" ").filter(x => x !== key).join(" "); } }; }
  appendChild(node) { if (node.parentNode) node.parentNode.children = node.parentNode.children.filter(x => x !== node); node.parentNode = this; this.children.push(node); }
  append(...nodes) { nodes.forEach(node => this.appendChild(node)); }
  all() { return [this, ...this.children.flatMap(node => node.all())]; }
  matches(selector) { return selector.split(",").some(s => s.startsWith(".") ? this.classList.contains(s.slice(1)) : s.startsWith("#") ? this.id === s.slice(1) : this.tagName === s.toUpperCase()); }
  querySelector(selector) { return this.all().slice(1).find(node => node.matches(selector)) || null; }
  closest(selector) { return this.matches(selector) ? this : this.parentNode?.closest(selector) || null; }
  setAttribute(key, value) { this.attrs[key] = value; }
  addEventListener(key, fn) { this.listeners[key] = fn; }
  focus() { this.focused = true; }
}
function fixture() {
  const a = runtime(), root = new Node("main");
  const doc = { createElement: tag => new Node(tag), getElementById: id => root.all().find(node => node.id === id) || null };
  a.context.document = doc;
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../grand-prix.js"), "utf8"), a.context);
  const p = Object.create(a.context.GrandPrixPresentation.prototype); p.get = key => doc.getElementById(`gp-${key}`);
  return { p, root, doc };
}

test("barre compacte : tous les contrôles restent connectés, IDs uniques et affectation directe", () => {
  const { p, root } = fixture(), toolbar = new Node("section"); root.appendChild(toolbar);
  const brand = new Node(); brand.className = "gp-brand"; toolbar.appendChild(brand);
  for (const key of ["mode", "model"]) { const label = new Node("label"); label.appendChild(new Node("select", `gp-${key}`)); toolbar.appendChild(label); }
  const grid = new Node("details", "gp-grid"); grid.appendChild(new Node("summary")); grid.appendChild(new Node("button", "gp-fill-grid")); toolbar.appendChild(grid);
  const ids = ["launch", "pause", "audio", "obstacle-mode", "settings-toggle", "lab-toggle", "fullscreen", "live", "clear-models", "restore-models", "restore-saved-models", "import-model", "model-info"];
  ids.forEach(key => toolbar.appendChild(new Node("button", `gp-${key}`)));
  p.organizeToolbar(toolbar);
  for (const key of [...ids, "model", "mode", "fill-grid", "grid"]) assert.equal(root.all().filter(node => node.id === `gp-${key}`).length, 1, key);
  assert.equal(p.get("fill-grid").parentNode.className, "gp-toolbar-setup");
  assert.equal(p.get("clear-models").closest("details"), grid);
  assert.equal(p.get("launch").parentNode.className, "gp-toolbar-actions");
  p.result = new Node("section"); p.result.hidden = true;
  const close = new Node("button"); close.className = "gp-panel-close"; p.result.appendChild(close);
  p.setResultsAvailable(true); assert.equal(p.get("results-toggle").hidden, false);
  p.get("results-toggle").listeners.click(); assert.equal(p.result.hidden, false); assert.ok(close.focused);
  p.closePanel("results"); assert.equal(p.result.hidden, true); assert.equal(p.get("results-toggle").hidden, false);
  p.get("results-toggle").listeners.click(); assert.equal(p.result.hidden, false);
  p.setResultsAvailable(false); assert.equal(p.get("results-toggle").hidden, true);
});

test("rubriques : valeurs/listeners conservés, classification correcte et une seule rubrique ouverte", () => {
  const { p, root, doc } = fixture(), panel = new Node("section", "gp-settings"); root.appendChild(panel);
  const header = new Node(); header.className = "gp-panel-closebar"; panel.appendChild(header);
  const fieldset = new Node("fieldset"), avoidance = new Node("input", "gp-avoidance"); fieldset.appendChild(avoidance); panel.appendChild(fieldset);
  for (const key of ["inspired", "style-strength", "engine-file", "laps", "light", "hold", "quality", "camera", "commentary-language", "font", "shake"]) {
    const label = new Node("label"), input = new Node("input", `gp-${key}`); input.value = `value-${key}`; input.listeners.change = () => key;
    label.appendChild(input); panel.appendChild(label);
  }
  const before = doc.getElementById("gp-laps"), listener = before.listeners.change;
  p.organizeSettings(panel);
  assert.equal(doc.getElementById("gp-laps"), before); assert.equal(before.value, "value-laps"); assert.equal(before.listeners.change, listener);
  assert.equal(before.closest("details").firstChild.textContent, "Course et départ");
  assert.equal(avoidance.closest("details").firstChild.textContent, "Assistances et obstacles");
  assert.equal(doc.getElementById("gp-commentary-language").closest("details").firstChild.textContent, "Sons et commentaire");
  const groups = panel.children.filter(node => node.tagName === "DETAILS"), audio = doc.getElementById("gp-engine-file").closest("details");
  assert.equal(groups.length, 5); audio.open = true; audio.listeners.toggle(); assert.equal(groups.filter(node => node.open).length, 1);
  assert.equal(panel.firstChild, header);
});

test("Échap et ouverture exclusive : fermeture sans perte, aucun panneau ouvert laisse Échap libre", () => {
  const { p, root } = fixture();
  for (const key of ["settings", "settings-toggle", "lab-toggle"]) root.appendChild(new Node("div", `gp-${key}`));
  const grid = new Node("details", "gp-grid"); grid.appendChild(new Node("summary")); root.appendChild(grid); grid.open = true;
  p.shell = root; root.className = "lab-open"; p.result = { hidden: true }; p.get("settings").value = "kept";
  p.setSettingsOpen(true); assert.equal(grid.open, false); assert.equal(root.classList.contains("lab-open"), false);
  assert.equal(p.dismissOpenPanel(), true); assert.equal(p.get("settings").hidden, true); assert.equal(p.get("settings").value, "kept");
  assert.ok(p.get("settings-toggle").focused); assert.equal(p.dismissOpenPanel(), false);
  const source = fs.readFileSync(path.join(__dirname, "../grand-prix.js"), "utf8");
  assert.match(source, /"BUTTON", "SUMMARY"/); // Space on an accordion must not pause racing.
  assert.match(source, /e.key === "Enter" \|\| e.key === " "/);
});

test("affecter aux six : sélection explicite obligatoire, aucune mutation de course ou modèle", () => {
  const { p, root } = fixture(), select = new Node("select", "gp-model"); root.appendChild(select);
  const model = { id: "brain", name: "Cerveau", genome: { unchanged: true } }, race = {};
  Object.assign(p, { models: [model], assignments: Array(6).fill("old"), notice: {}, race, renderAssignments() {}, showModelInfo() {} });
  select.value = ""; assert.equal(p.fillRosterFromModel(), false); assert.deepEqual(p.assignments, Array(6).fill("old"));
  select.value = "brain"; assert.equal(p.fillRosterFromModel(), true); assert.deepEqual(p.assignments, Array(6).fill("brain")); assert.equal(p.race, race); assert.deepEqual(model.genome, { unchanged: true });
});
