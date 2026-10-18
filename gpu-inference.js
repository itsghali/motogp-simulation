(function (root) {
  const INPUTS = 9;
  const HIDDEN = 12;
  const OUTPUTS = 2;

  class GPUInferenceEngine {
    constructor(tfApi) {
      this.tf = tfApi;
      this.backend = "initialisation";
      this.renderer = "non identifié";
      this.populationSize = 0;
      this.tensors = [];
    }

    async initialize() {
      if (!this.tf) throw new Error("TensorFlow.js non chargé");
      this.tf.enableProdMode();
      const preferred = GPUInferenceEngine.createPreferredContext();
      if (preferred) {
        try {
          this.tf.setWebGLContext(preferred.version, preferred.gl);
          this.tf.env().set("WEBGL_VERSION", preferred.version);
          this.tf.env().set("WEBGL_CPU_FORWARD", false);
          const available = await this.tf.setBackend("webgl");
          await this.tf.ready();
          if (available && this.tf.getBackend() === "webgl") {
            this.renderer = GPUInferenceEngine.detectRenderer(this.tf.backend().getGPGPUContext().gl);
            this.targetRenderer = GPUInferenceEngine.isTargetRenderer(this.renderer);
            this.backend = this.targetRenderer ? "GPU WebGL — RTX 3070" : "GPU WebGL — compatible";
            return this.backend;
          }
        } catch (_) {
          // Public demo can continue on CPU when WebGL setup is unavailable.
        }
      }

      const cpuAvailable = await this.tf.setBackend("cpu");
      await this.tf.ready();
      if (!cpuAvailable || this.tf.getBackend() !== "cpu") throw new Error("Aucun backend TensorFlow.js disponible");
      this.renderer = "CPU navigateur";
      this.targetRenderer = false;
      this.backend = "CPU TensorFlow.js — mode compatible";
      return this.backend;
    }

    static createPreferredContext() {
      if (typeof document === "undefined") return null;
      const canvas = document.createElement("canvas");
      const attributes = { powerPreference: "high-performance", failIfMajorPerformanceCaveat: true };
      const gl2 = canvas.getContext("webgl2", attributes);
      if (gl2) return { version: 2, gl: gl2 };
      const gl1 = canvas.getContext("webgl", attributes);
      return gl1 ? { version: 1, gl: gl1 } : null;
    }

    static detectRenderer(gl) {
      const debug = gl.getExtension("WEBGL_debug_renderer_info");
      const renderer = debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
      return renderer || "non identifié";
    }

    static isTargetRenderer(renderer) {
      return /NVIDIA.*(GeForce\s+)?RTX\s*3070/i.test(renderer);
    }

    static async probeWebGpu() {
      if (typeof navigator === "undefined" || !navigator.gpu) return "indisponible";
      try {
        const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
        if (!adapter) return "aucun adaptateur";
        const info = adapter.info || (adapter.requestAdapterInfo ? await adapter.requestAdapterInfo() : null);
        return info ? [info.vendor, info.architecture, info.device, info.description].filter(Boolean).join(" / ") || "identité masquée" : "identité masquée";
      } catch (error) {
        return `échec (${error.message})`;
      }
    }

    static packGenomes(genomes) {
      return {
        weightsIH: genomes.flatMap(genome => genome.weightsIH),
        biasH: genomes.flatMap(genome => genome.biasH),
        weightsHO: genomes.flatMap(genome => genome.weightsHO),
        biasO: genomes.flatMap(genome => genome.biasO)
      };
    }

    setGenomes(genomes) {
      this.disposeTensors();
      this.populationSize = genomes.length;
      const packed = GPUInferenceEngine.packGenomes(genomes);
      const tf = this.tf;
      try {
        this.tensors.push(this.weightsIH = tf.tensor3d(packed.weightsIH, [this.populationSize, INPUTS, HIDDEN]));
        this.tensors.push(this.biasH = tf.tensor2d(packed.biasH, [this.populationSize, HIDDEN]));
        this.tensors.push(this.weightsHO = tf.tensor3d(packed.weightsHO, [this.populationSize, HIDDEN, OUTPUTS]));
        this.tensors.push(this.biasO = tf.tensor2d(packed.biasO, [this.populationSize, OUTPUTS]));
        this.predict(Array.from({ length: this.populationSize }, () => new Array(INPUTS).fill(0)));
      } catch (error) {
        this.disposeTensors(); this.populationSize = 0; throw error;
      }
    }

    predict(inputBatch) {
      if (inputBatch.length !== this.populationSize) throw new Error("Taille batch GPU incohérente");
      const tf = this.tf;
      return tf.tidy(() => {
        const inputs = tf.tensor2d(inputBatch, [this.populationSize, INPUTS]);
        const hidden = tf.matMul(inputs.expandDims(1), this.weightsIH)
          .add(this.biasH.expandDims(1)).tanh();
        const output = tf.matMul(hidden, this.weightsHO)
          .add(this.biasO.expandDims(1)).tanh().reshape([this.populationSize, OUTPUTS]);
        const values = output.dataSync();
        return Array.from({ length: this.populationSize }, (_, index) => [values[index * 2], values[index * 2 + 1]]);
      });
    }

    memory() {
      return this.tf.memory();
    }

    disposeTensors() {
      this.tensors.forEach(tensor => tensor.dispose());
      this.tensors = [];
    }

    dispose() {
      this.disposeTensors();
    }
  }

  root.GPUInferenceEngine = GPUInferenceEngine;
  if (typeof module !== "undefined") module.exports = { GPUInferenceEngine };
})(typeof globalThis !== "undefined" ? globalThis : this);
