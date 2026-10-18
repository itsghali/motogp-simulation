(function (root) {
  const clamp = (n, low, high) => Math.max(low, Math.min(high, Number(n) || 0));
  class EngineSound {
    constructor(context, destination, capacity = 4) {
      this.context = context; this.buffer = this.combustionBuffer();
      this.voices = Array.from({ length: capacity }, () => {
        const osc = context.createOscillator(); const sub = context.createOscillator();
        const filter = context.createBiquadFilter(); const toneGain = context.createGain(); const subGain = context.createGain(); const gain = context.createGain();
        osc.type = "sawtooth"; sub.type = "triangle"; filter.type = "lowpass";
        subGain.gain.value = 0.12; toneGain.gain.value = 0.08; gain.gain.value = 0;
        osc.connect(toneGain); toneGain.connect(filter); sub.connect(subGain); subGain.connect(filter); filter.connect(gain); gain.connect(destination);
        osc.start(); sub.start(); const voice = { osc, sub, filter, gain, toneGain, subGain };
        this.startLoop(voice); return voice;
      });
    }
    static combustionSamples(sampleRate) {
      // Uneven four-cylinder exhaust impulses plus deterministic turbulent bursts.
      // Original synthesis, not a recording or measured mechanical RPM.
      const data = new Float32Array(Math.max(32, Math.round(sampleRate * 0.32)));
      let seed = 417, previousNoise = 0, sum = 0;
      for (let i = 0; i < data.length; i++) {
        const t = i / sampleRate, cycle = (t * 50) % 1;
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        const noise = seed / 2147483648 - 1;
        let value = 0;
        for (const firing of [0, 0.18, 0.5, 0.68]) {
          const age = ((cycle - firing + 1) % 1) * 0.02;
          const envelope = Math.exp(-age * 1800);
          value += envelope * (Math.sin(age * 2 * Math.PI * 360) + 0.5 * (noise - previousNoise));
        }
        previousNoise = noise;
        const edge = Math.min(1, i / Math.max(1, sampleRate * 0.001), (data.length - 1 - i) / Math.max(1, sampleRate * 0.001));
        data[i] = Math.tanh(value * 1.7) * edge; sum += data[i];
      }
      const mean = sum / data.length;
      for (let i = 0; i < data.length; i++) data[i] = (data[i] - mean) * 0.8;
      return data;
    }
    combustionBuffer() {
      const samples = EngineSound.combustionSamples(this.context.sampleRate);
      const buffer = this.context.createBuffer(1, samples.length, this.context.sampleRate);
      // Test doubles may expose a smaller buffer; production Web Audio uses exact length.
      const channel = buffer.getChannelData(0); channel.set(samples.subarray(0, channel.length));
      return buffer;
    }
    startLoop(voice) {
      if (voice.pulse) { try { voice.pulse.stop?.(); } catch (_) {} voice.pulse.disconnect?.(); }
      const source = this.context.createBufferSource(); source.buffer = this.buffer; source.loop = true;
      source.connect(voice.filter); source.start(); voice.pulse = source;
    }
    recordedLoop(buffer) {
      const rate = buffer.sampleRate, input = buffer.getChannelData(0);
      const length = Math.min(input.length, Math.round(rate * 0.34));
      const fade = Math.max(1, Math.min(Math.round(rate * 0.04), Math.floor(length / 4)));
      const size = length - fade, start = Math.floor((input.length - length) / 2);
      const loop = this.context.createBuffer(1, size, rate), output = loop.getChannelData(0);
      let sum = 0;
      for (let i = 0; i < size; i++) {
        const mix = Math.min(1, i / fade);
        output[i] = i < fade ? input[start + size + i] * (1 - mix) + input[start + i] * mix : input[start + i];
        sum += output[i];
      }
      const mean = sum / size; let peak = 0.001;
      for (let i = 0; i < size; i++) peak = Math.max(peak, Math.abs(output[i] - mean));
      for (let i = 0; i < size; i++) output[i] = (output[i] - mean) * 0.8 / peak;
      return loop;
    }
    setSample(buffer) {
      if (!buffer?.duration || buffer.duration < 0.08 || buffer.duration > 30) throw new Error("Son moteur : boucle entre 0,08 et 30 secondes.");
      this.buffer = buffer;
      for (const voice of this.voices) { voice.toneGain.gain.value = 0.015; voice.subGain.gain.value = 0.025; this.startLoop(voice); }
    }
    static parameters(bike, slot = 0, phase = "RACE", distance = 0) {
      const speed = clamp(bike?.vel.mag() / Math.max(0.01, bike?.maxspeed || 1), 0, 1);
      const throttle = clamp(bike?.lastDecision?.throttle ?? (phase === "LIGHTS" ? 0.45 : speed), 0, 1);
      const brake = clamp(bike?.lastDecision?.braking, 0, 1);
      // Audio RPM approximation only. No invented gear changes or physical feedback.
      const rpm = 3000 + speed * 13000 + throttle * 2200;
      const timbre = 1 + ((bike?.id ?? 0) % 7 - 3) * 0.008;
      return { rpm, frequency: rpm / 60 * 2 * timbre, playbackRate: rpm / 6000 * timbre, cutoff: 700 + throttle * 3000 + speed * 1200,
        amplitude: (slot === 0 ? 0.22 : 0.11) * (0.45 + throttle * 0.55) * (1 - brake * 0.2) / (1 + Math.max(0, distance) / 90) };
    }
    silence() {
      const now = this.context.currentTime;
      for (const voice of this.voices) { voice.gain.gain.cancelScheduledValues?.(now); voice.gain.gain.setValueAtTime(0, now); }
    }
    dispose() {
      this.silence();
      for (const voice of this.voices) { voice.osc.stop(); voice.sub.stop(); voice.pulse?.stop?.(); for (const node of Object.values(voice)) node.disconnect?.(); }
      this.voices = [];
    }
    update(bikes, active, selected, phase) {
      const live = bikes.filter(bike => !bike.dead && !bike.finished);
      const focus = live.find(bike => bike.id === selected) || live[0];
      const distance = bike => focus ? Math.hypot(bike.pos.x - focus.pos.x, bike.pos.y - focus.pos.y) : 0;
      live.sort((a, b) => distance(a) - distance(b) || a.id - b.id);
      const now = this.context.currentTime;
      this.voices.forEach((voice, slot) => {
        const bike = live[slot]; const values = EngineSound.parameters(bike, slot, phase, bike ? distance(bike) : 0);
        voice.osc.frequency.setTargetAtTime(values.frequency, now, 0.07);
        voice.sub.frequency.setTargetAtTime(values.frequency / 2, now, 0.09);
        voice.pulse?.playbackRate?.setTargetAtTime(values.playbackRate, now, 0.1);
        voice.filter.frequency.setTargetAtTime(values.cutoff, now, 0.08);
        if (active && bike) voice.gain.gain.setTargetAtTime(values.amplitude, now, 0.05);
        else { voice.gain.gain.cancelScheduledValues?.(now); voice.gain.gain.setValueAtTime(0, now); }
      });
    }
  }
  root.EngineSound = EngineSound;
  if (typeof module !== "undefined") module.exports = { EngineSound };
})(typeof globalThis !== "undefined" ? globalThis : this);
