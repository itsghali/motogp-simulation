(function (root) {
  class AudioManager {
    constructor(environment = root) {
      this.environment = environment; this.context = null; this.muted = false; this.enabled = false;
      this.volumes = { master: 0.9, music: 0.16, engines: 0.85, commentary: 1, crowd: 0.15, ambience: 0.1, ui: 0.2, control: 0.3 };
      this.channels = {}; this.voices = []; this.tones = new Set(); this.error = ""; this.musicStep = -1; this.boostUntil = 0;
      this.enginesEnabled = true; this.commentaryEnabled = true; this.commentaryMode = "recorded";
      this.recorded = null; this.recordedStatus = "absent"; this.recordedSource = null; this.playPending = false; this.playBlocked = false;
    }
    async enable() {
      try {
        const Context = this.environment.AudioContext || this.environment.webkitAudioContext;
        if (!Context) throw new Error("Web Audio indisponible");
        if (!this.context) {
          this.context = new Context(); this.master = this.context.createGain(); this.master.connect(this.context.destination);
          for (const name of Object.keys(this.volumes).filter(name => name !== "master")) {
            const gain = this.context.createGain(); gain.connect(this.master); this.channels[name] = gain;
          }
          this.engineSound = new EngineSound(this.context, this.channels.engines);
          this.voices = this.engineSound.voices;
          this.makeAmbience();
        }
        await this.context.resume(); this.enabled = this.context.state === "running";
        if (!this.enabled) throw new Error("Cliquer à nouveau pour activer l’audio");
        this.connectRecording(); await this.loadDefaultEngine(); this.playBlocked = false; this.applyVolumes(); return true;
      } catch (error) {
        this.error = error.message; this.enabled = false;
        // A half-initialized context must never become a supposedly ready engine on retry.
        if (!this.engineSound || !this.crowd || !this.ambience) {
          try { this.engineSound?.dispose(); await this.context?.close?.(); } catch (_) {}
          this.context = null; this.engineSound = null; this.voices = []; this.channels = {};
          this.crowd = null; this.ambience = null; this.recordedSource = null;
        }
        return false;
      }
    }
    async loadDefaultEngine() {
      if (this.engineSampleAttempted || !this.environment.fetch || !this.context.decodeAudioData) return;
      this.engineSampleAttempted = true;
      try {
        const response = await this.environment.fetch("assets/motorbike-ezwa.ogg");
        if (!response.ok) throw new Error("Enregistrement moteur indisponible");
        const decoded = await this.context.decodeAudioData(await response.arrayBuffer());
        const loop = this.engineSound.recordedLoop(decoded); this.engineSound.setSample(loop);
        this.engineSampleStatus = "Moto enregistrée · ezwa · extrait bouclé (domaine public)";
      } catch (_) { this.engineSampleStatus = "Synthèse combustion · enregistrement indisponible"; }
    }
    loadCommentary(url, name = "motogp_audio.mp3") {
      this.playToken = (this.playToken || 0) + 1; this.playPending = false; this.recordingWanted = false;
      if (this.recorded) { this.recorded.pause(); this.recordedSource?.disconnect(); }
      this.recorded = null; this.recordedSource = null; this.recordedStatus = "chargement"; this.recordedName = name; this.playBlocked = false;
      if (!this.environment.Audio) { this.recordedStatus = "indisponible"; return false; }
      try {
        const track = new this.environment.Audio(url); this.recorded = track; track.preload = "auto"; track.loop = false;
        track.addEventListener("loadedmetadata", () => { if (this.recorded === track) this.recordedStatus = "prêt"; });
        track.addEventListener("error", () => { if (this.recorded === track) this.recordedStatus = "indisponible"; });
        track.addEventListener("ended", () => { if (this.recorded === track) this.recordedStatus = "terminé"; });
        this.connectRecording(); return true;
      } catch (_) { this.recordedStatus = "indisponible"; return false; }
    }
    connectRecording() {
      if (!this.context || !this.recorded || this.recordedSource) return;
      try {
        this.recordedSource = this.context.createMediaElementSource(this.recorded); this.recordedSource.connect(this.channels.commentary);
      } catch (_) { this.recordedStatus = "indisponible"; }
    }
    setCommentaryMode(mode) {
      this.playToken = (this.playToken || 0) + 1; this.playPending = false;
      this.commentaryMode = mode === "recorded" ? "recorded" : "dynamic";
      this.recordingWanted = false; this.recorded?.pause(); this.environment.speechSynthesis?.cancel(); this.playBlocked = false;
    }
    resetRecording() {
      this.playToken = (this.playToken || 0) + 1; this.playPending = false; this.recordingWanted = false;
      if (this.recorded) { this.recorded.pause(); try { this.recorded.currentTime = 0; } catch (_) {} }
      if (this.recordedStatus === "terminé") this.recordedStatus = "prêt";
      this.playBlocked = false;
    }
    updateRecording(active) {
      const track = this.recorded;
      const allowed = active && this.commentaryEnabled && this.commentaryMode === "recorded" && !this.muted &&
        this.volumes.master > 0 && this.volumes.commentary > 0 && this.recordedStatus !== "indisponible" && !!this.recordedSource;
      this.recordingWanted = allowed;
      if (!track) return;
      if (!allowed) { track.pause(); if (this.recordedStatus === "lecture") this.recordedStatus = "pause"; return; }
      if (track.ended || !track.paused || this.playPending || this.playBlocked) return;
      this.playPending = true; const token = this.playToken;
      Promise.resolve().then(() => this.playToken === token && this.recordingWanted && this.recorded === track ? track.play() : undefined).then(() => {
        if (this.playToken !== token) { if (!this.recordingWanted || this.recorded !== track) track.pause(); return; }
        if (!this.recordingWanted || this.recorded !== track) track.pause();
        else this.recordedStatus = "lecture";
      })
        .catch(() => { if (this.playToken !== token) return; track.pause(); if (this.recorded === track && this.recordedStatus !== "indisponible") { this.recordedStatus = "cliquer audio pour réessayer"; this.playBlocked = true; } })
        .finally(() => { if (this.playToken === token) this.playPending = false; });
    }
    makeAmbience() {
      const ctx = this.context; const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const data = buffer.getChannelData(0); let seed = 19;
      for (let i = 0; i < data.length; i++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; data[i] = seed / 2147483648 - 1; }
      for (const [name, frequency] of [["crowd", 650], ["ambience", 180]]) {
        const source = ctx.createBufferSource(); source.buffer = buffer; source.loop = true;
        const filter = ctx.createBiquadFilter(); filter.type = "lowpass"; filter.frequency.value = frequency;
        const gain = ctx.createGain(); gain.gain.value = 0; source.connect(filter); filter.connect(gain);
        gain.connect(this.channels[name]); source.start(); this[name] = gain;
      }
    }
    setVolume(name, value) {
      if (name in this.volumes) this.volumes[name] = Math.max(0, Math.min(1, Number(value) || 0));
      if (["master", "commentary"].includes(name) && this.volumes[name] === 0) this.environment.speechSynthesis?.cancel();
      if (value === 0 && name === "engines") this.engineSound?.silence();
      if (value === 0 && ["master", "commentary"].includes(name)) this.recorded?.pause();
      this.applyVolumes();
    }
    setSpeechActive(active) {
      this.speechActive = !!active && !this.muted; this.applyVolumes();
    }
    applyVolumes() {
      if (!this.context) return;
      const now = this.context.currentTime;
      if (this.muted || this.volumes.master === 0) { this.master.gain.cancelScheduledValues?.(now); this.master.gain.setValueAtTime(0, now); }
      else this.master.gain.setTargetAtTime(this.volumes.master, now, 0.06);
      for (const [name, channel] of Object.entries(this.channels)) channel.gain.setTargetAtTime(this.volumes[name] * (this.speechActive && ["engines", "music", "crowd", "ambience", "control"].includes(name) ? 0.16 : 1), now, this.speechActive ? 0.025 : 0.18);
    }
    mute(value = !this.muted) {
      this.muted = value; if (value) this.speechActive = false; this.applyVolumes(); this.playBlocked = false;
      if (value) { this.recordingWanted = false; this.recorded?.pause(); this.environment.speechSynthesis?.cancel(); }
    }
    silence() {
      this.setSpeechActive(false);
      this.engineSound?.silence();
      for (const name of ["crowd", "ambience"]) if (this[name]) {
        const gain = this[name].gain, now = this.context.currentTime;
        gain.cancelScheduledValues?.(now); gain.setValueAtTime(0, now);
      }
      for (const tone of this.tones) { try { tone.osc.stop(); } catch (_) {} tone.osc.disconnect(); tone.gain.disconnect(); }
      this.tones.clear(); this.recordingWanted = false; this.recorded?.pause();
    }
    tone(category, frequency, duration = 0.15, volume = 0.05) {
      if (!this.enabled || this.muted || !this.channels[category]) return;
      const ctx = this.context; const osc = ctx.createOscillator(); const gain = ctx.createGain(); const now = ctx.currentTime;
      osc.type = "sine"; osc.frequency.value = frequency; gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration); osc.connect(gain); gain.connect(this.channels[category]);
      const resource = { osc, gain }; this.tones.add(resource);
      osc.onended = () => { osc.disconnect(); gain.disconnect(); this.tones.delete(resource); }; osc.start(); osc.stop(now + duration);
    }
    update(bikes, phase, time, active, selected, crowd = true) {
      if (!this.enabled) return;
      try {
      const now = this.context.currentTime;
      const mix = active && !this.muted;
      if (!mix) this.silence();
      const presentation = phase !== "TRAINING" && phase !== "";
      this.engineSound.update(bikes, mix && this.enginesEnabled, selected, phase);
      this.updateRecording(mix && presentation && phase !== "TITLE");
      this.crowd.gain.setTargetAtTime(mix && presentation && crowd ? (phase === "LIGHTS" ? 0.02 : time < this.boostUntil ? 0.25 : 0.065) : 0, now, 0.2);
      this.ambience.gain.setTargetAtTime(mix && presentation ? 0.05 : 0, now, 0.2);
      if (!mix) this.silence();
      const step = Math.floor(time / 400);
      if (mix && ["INTRO", "FLYOVER", "GRID", "PODIUM"].includes(phase) && step !== this.musicStep) {
        this.musicStep = step;
        // Original procedural motif; no external samples or commercial music.
        const notes = [110, 130.81, 164.81, 146.83, 110, 164.81, 196, 146.83];
        this.tone("music", notes[(step % notes.length + notes.length) % notes.length], 0.5, phase === "GRID" ? 0.08 : 0.04);
      }
      } catch (error) {
        this.error = `Audio indisponible : ${error.message}`; this.enabled = false;
        try { this.silence(); } catch (_) {}
      }
    }
  }
  class AudioDirector {
    constructor(audio, events) {
      this.audio = audio;
      events.on(event => {
        if (["OVERTAKE", "FINISH", "CRASH", "RACE_START"].includes(event.type)) audio.boostUntil = (audio.now ? audio.now() : event.time) + 2500;
        if (event.type === "RACE_START") audio.tone("control", 440, 0.4);
        if (event.type === "FINISH") { audio.tone("control", 660, 0.6); audio.tone("music", 880, 1); }
      });
    }
  }
  const api = { AudioManager, AudioDirector }; Object.assign(root, api);
  if (typeof module !== "undefined") module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
