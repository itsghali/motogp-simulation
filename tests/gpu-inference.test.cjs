const test = require("node:test");
const assert = require("node:assert/strict");
const tf = require("@tensorflow/tfjs");
const { SeededRandom } = require("../random.js");
const { Genome } = require("../genome.js");
const { GPUInferenceEngine } = require("../gpu-inference.js");

test("calcul groupé identique au réseau de référence et sans fuite de tenseurs", async () => {
  await tf.setBackend("cpu");
  await tf.ready();
  const rng = new SeededRandom(3070);
  const genomes = Array.from({ length: 5 }, () => Genome.random(rng));
  const inputs = genomes.map(() => Array.from({ length: 9 }, () => rng.next()));
  const engine = new GPUInferenceEngine(tf);
  const before = tf.memory().numTensors;
  engine.setGenomes(genomes);
  const afterSetup = tf.memory().numTensors;
  for (let repeat = 0; repeat < 3; repeat++) {
    const output = engine.predict(inputs);
    output.forEach((values, index) => {
      const expected = genomes[index].predict(inputs[index]);
      values.forEach((value, component) => assert.ok(Math.abs(value - expected[component]) < 1e-5));
    });
    assert.equal(tf.memory().numTensors, afterSetup);
  }
  engine.dispose();
  assert.equal(tf.memory().numTensors, before);
});

test("taille de batch incohérente refusée", async () => {
  await tf.setBackend("cpu");
  await tf.ready();
  const engine = new GPUInferenceEngine(tf);
  engine.setGenomes([Genome.random(new SeededRandom(1))]);
  assert.throws(() => engine.predict([]), /batch GPU incohérente/);
  engine.dispose();
});

test("GPU demandé en haute performance et renderer réel vérifié", async () => {
  const originalDocument = global.document;
  const calls = [];
  const gl = {
    RENDERER: 1,
    getExtension: () => ({ UNMASKED_RENDERER_WEBGL: 2 }),
    getParameter: () => "ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 Laptop GPU, D3D11)"
  };
  global.document = { createElement: () => ({
    getContext: (kind, attributes) => {
      calls.push({ kind, attributes });
      return kind === "webgl2" ? gl : null;
    }
  }) };
  const fakeTf = {
    enableProdMode() {},
    setWebGLContext: (version, context) => calls.push({ version, context }),
    env: () => ({ set: (name, value) => calls.push({ name, value }) }),
    setBackend: async () => true,
    ready: async () => {},
    getBackend: () => "webgl",
    backend: () => ({ getGPGPUContext: () => ({ gl }) })
  };
  try {
    const engine = new GPUInferenceEngine(fakeTf);
    await engine.initialize();
    assert.equal(engine.renderer.includes("RTX 3070"), true);
    assert.equal(engine.targetRenderer, true);
    assert.equal(engine.backend, "GPU WebGL — RTX 3070");
    assert.equal(calls[0].attributes.powerPreference, "high-performance");
    assert.equal(calls[1].version, 2);
    assert.ok(calls.some(call => call.name === "WEBGL_CPU_FORWARD" && call.value === false));
  } finally {
    global.document = originalDocument;
  }
});

test("RTX cible distinguée des autres renderers sans fausse annonce", () => {
  assert.equal(GPUInferenceEngine.isTargetRenderer("ANGLE (Intel Iris Xe Graphics)"), false);
  assert.equal(GPUInferenceEngine.isTargetRenderer("WebKit WebGL"), false);
  assert.equal(GPUInferenceEngine.isTargetRenderer("ANGLE (NVIDIA GeForce RTX 3070 Laptop GPU)"), true);
});

test("renderer Intel reste utilisable en mode WebGL compatible", async () => {
  const originalDocument = global.document;
  const gl = {
    RENDERER: 1,
    getExtension: () => null,
    getParameter: () => "ANGLE (Intel, Intel Iris Xe Graphics, D3D11)"
  };
  global.document = { createElement: () => ({ getContext: () => gl }) };
  const fakeTf = {
    enableProdMode() {},
    setWebGLContext() {},
    env: () => ({ set() {} }),
    setBackend: async () => true,
    ready: async () => {},
    getBackend: () => "webgl",
    backend: () => ({ getGPGPUContext: () => ({ gl }) })
  };
  try {
    const engine = new GPUInferenceEngine(fakeTf);
    await engine.initialize();
    assert.match(engine.renderer, /Intel Iris Xe Graphics/);
    assert.equal(engine.targetRenderer, false);
    assert.equal(engine.backend, "GPU WebGL — compatible");
  } finally {
    global.document = originalDocument;
  }
});

test("WebGL indisponible utilise le backend CPU public", async () => {
  const originalDocument = global.document;
  global.document = { createElement: () => ({ getContext: () => null }) };
  let backend = "";
  const fakeTf = {
    enableProdMode() {},
    setBackend: async name => { backend = name; return true; },
    ready: async () => {},
    getBackend: () => backend
  };
  try {
    const engine = new GPUInferenceEngine(fakeTf);
    await engine.initialize();
    assert.equal(engine.renderer, "CPU navigateur");
    assert.equal(engine.targetRenderer, false);
    assert.equal(engine.backend, "CPU TensorFlow.js — mode compatible");
  } finally {
    global.document = originalDocument;
  }
});

test("diagnostic WebGPU rapporte l'adaptateur haute performance", async () => {
  const originalNavigator = global.navigator;
  let preference;
  Object.defineProperty(global, "navigator", { configurable: true, value: {
    gpu: { requestAdapter: async options => {
      preference = options.powerPreference;
      return { info: { vendor: "intel", architecture: "gen-12lp" } };
    } }
  } });
  try {
    assert.equal(await GPUInferenceEngine.probeWebGpu(), "intel / gen-12lp");
    assert.equal(preference, "high-performance");
  } finally {
    if (originalNavigator === undefined) delete global.navigator;
    else Object.defineProperty(global, "navigator", { configurable: true, value: originalNavigator });
  }
});
