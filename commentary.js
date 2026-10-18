(function (root) {
  const PHRASES = {
    INTRO: ["Bienvenue à Jerez. Les agents entrent en scène.", "Le Grand Prix neuronal va commencer à Jerez."],
    GRID: ["Les pilotes sont immobiles sur la grille.", "Derniers préparatifs avant le départ."],
    LIGHTS: ["Les feux s’allument…", "Attention aux feux de départ…"],
    RACE_START: ["Les feux s’éteignent, c’est parti !", "Départ du Grand Prix !"],
    OVERTAKE: ["Agent {id} gagne une place !", "Dépassement confirmé pour Agent {id}."],
    LEADER_CHANGE: ["Nouveau leader : Agent {id} !", "Agent {id} prend les commandes."],
    OFF_TRACK: ["Agent {id} élargit hors de la piste.", "Sortie de piste pour Agent {id}."],
    CRASH: ["Incident pour Agent {id} !", "La course s’arrête pour Agent {id}."],
    DNF: ["Abandon de Agent {id}.", "Agent {id} ne terminera pas cette course."],
    FAST_LAP: ["Meilleur tour pour Agent {id} !", "Agent {id} établit la référence chronométrique."],
    CLOSE_BATTLE: ["La bataille se resserre autour de Agent {id}.", "Les écarts sont minimes autour de Agent {id}."],
    FINAL_LAP: ["Dernier tour !", "Il reste un tour à parcourir."],
    FINISH: ["Agent {id} franchit l’arrivée !", "Drapeau à damiers pour Agent {id}."],
    MODEL_VALIDATED: ["Modèle validé : trois tours consécutifs réussis !", "Trois tours propres : validation du modèle confirmée."]
  };
  const ENGLISH_PHRASES = {
    INTRO: ["Welcome to Jerez. The riders are ready.", "The neural Grand Prix is about to begin."],
    GRID: ["The riders are waiting on the grid.", "Final preparations before the start."],
    LIGHTS: ["The red lights are coming on.", "Watch the starting lights."],
    RACE_START: ["Lights out! We are racing at Jerez!", "And away they go! The Grand Prix is underway!"],
    OVERTAKE: ["Agent {id} gains a position!", "A confirmed overtake by Agent {id}."],
    LEADER_CHANGE: ["Agent {id} takes the lead!", "A new leader: Agent {id}!"],
    OFF_TRACK: ["Agent {id} runs off the track.", "Agent {id} goes wide, beyond the track limits."],
    CRASH: ["An incident for Agent {id}!", "Agent {id} is out after a collision."],
    DNF: ["Agent {id} retires from the race.", "Agent {id} will not finish this race."],
    FAST_LAP: ["Fastest lap for Agent {id}!", "Agent {id} sets a new fastest lap!"],
    CLOSE_BATTLE: ["A close battle around Agent {id}.", "Very little separates Agent {id} and the chasing rider."],
    FINAL_LAP: ["The final lap!", "One lap to go at Jerez!"],
    FINISH: ["Agent {id} crosses the finish line!", "The chequered flag for Agent {id}!"],
    MODEL_VALIDATED: ["Model validated: three consecutive clean laps!", "Three successful laps. Model validation confirmed."]
  };
  const PRIORITY = { CRASH: 100, FINISH: 100, MODEL_VALIDATED: 100, LEADER_CHANGE: 90, FINAL_LAP: 90,
    RACE_START: 95, OVERTAKE: 70, FAST_LAP: 60, CLOSE_BATTLE: 40, OFF_TRACK: 65, DNF: 80 };
  class CommentaryEngine {
    constructor(events, audio, environment = root) {
      this.audio = audio; this.environment = environment; this.enabled = true; this.queue = []; this.last = new Map();
      this.language = "fr"; this.active = null; this.token = 0; this.voiceStatus = ""; this.variants = {}; this.nextAt = 0; this.subtitle = ""; this.subtitleUntil = 0; this.voice = "";
      events.on(event => this.receive(event));
    }
    setLanguage(language) {
      this.suspend(); this.last.clear(); this.voice = ""; this.voiceStatus = "";
      this.language = language === "fr" ? "fr" : "en";
    }
    availableVoices() {
      return (this.environment.speechSynthesis?.getVoices() || []).filter(voice => String(voice.lang).replace("_", "-").toLowerCase().split("-")[0] === this.language);
    }
    receive(event) {
      event = { ...event, time: this.now ? this.now() : event.time };
      const type = event.type === "PHASE" ? event.phase : event.type;
      const phrases = this.language === "en" ? ENGLISH_PHRASES : PHRASES;
      if (!phrases[type]) return;
      const key = `${type}:${event.id ?? "all"}`;
      if (event.time - (this.last.get(key) ?? -Infinity) < 10000) return;
      this.last.set(key, event.time);
      const variants = phrases[type]; const index = this.variants[type] || 0; this.variants[type] = index + 1;
      let text = variants[index % variants.length];
      if (event.riderName) text = text.replace("Agent {id}", event.riderName);
      text = text.replace("{id}", String((event.id ?? 0) + 1).padStart(2, "0"));
      if (type === "OVERTAKE" && event.passedName) text = this.language === "en" ? `${event.riderName || `Agent ${event.id + 1}`} passes ${event.passedName}. Overtake confirmed!` : `${event.riderName || `Agent ${event.id + 1}`} dépasse ${event.passedName}. Dépassement confirmé.`;
      this.queue.push({ text, eventType: type, riderId: event.id, priority: PRIORITY[type] || 20, time: event.time });
      this.queue.sort((a, b) => b.priority - a.priority || a.time - b.time); this.queue.length = Math.min(8, this.queue.length);
    }
    tick(time) {
      this.queue = this.queue.filter(item => time - item.time < 15000);
      if (!this.queue.length) return;
      const speech = this.environment.speechSynthesis;
      const urgent = this.active && this.queue[0].priority > this.active.priority;
      if (!urgent && (time < this.nextAt || (this.active && speech?.speaking))) return;
      if (urgent) { this.token++; speech?.cancel(); this.active = null; this.audio.setSpeechActive?.(false); }
      const item = this.queue.shift();
      const duration = Math.max(5000, Math.min(12000, item.text.length * 65));
      this.subtitle = item.text; this.subtitleUntil = time + duration; this.nextAt = time + duration + 500;
      if (this.audio.commentaryMode === "recorded" && this.audio.recordedStatus !== "indisponible") return;
      if (!this.enabled || this.audio.muted || !this.audio.enabled || !speech || !this.environment.SpeechSynthesisUtterance) return;
      if (!(this.audio.volumes.master > 0 && this.audio.volumes.commentary > 0)) return;
      try {
        const voices = this.availableVoices();
        const voice = voices.find(voice => voice.name === this.voice) || voices[0];
        if (!voice) { this.voiceStatus = this.language === "en" ? "No English voice available · subtitles on" : "Aucune voix française disponible · sous-titres actifs"; return; }
        this.voiceStatus = `${this.language === "en" ? "English voice" : "Voix française"} : ${voice.name}`;
        const utterance = new this.environment.SpeechSynthesisUtterance(item.text);
        utterance.lang = this.language === "en" ? "en-GB" : "fr-FR"; utterance.rate = 1.04; utterance.voice = voice;
        utterance.volume = this.audio.volumes.master * this.audio.volumes.commentary;
        const token = ++this.token; this.active = item;
        utterance.onstart = () => {
          if (token !== this.token) return;
          const now = this.now ? this.now() : time;
          this.audio.setSpeechActive?.(true);
          this.subtitle = item.text; this.subtitleUntil = now + duration; this.nextAt = now + duration + 500;
        };
        utterance.onend = () => {
          if (token !== this.token) return;
          this.active = null; this.audio.setSpeechActive?.(false);
          this.nextAt = (this.now ? this.now() : time) + 400;
          this.subtitleUntil = Math.max(this.subtitleUntil, this.nextAt);
        };
        utterance.onerror = error => {
          if (token !== this.token) return;
          this.active = null; this.audio.setSpeechActive?.(false);
          // cancel() on mute/source changes is a normal lifecycle event, not a missing voice.
          if (!["canceled", "interrupted"].includes(error?.error)) this.voiceStatus = "Voix indisponible · sous-titres actifs";
        };
        speech.speak(utterance);
      } catch (_) { this.active = null; this.voiceStatus = "Synthèse indisponible · sous-titres actifs"; }
    }
    suspend() { this.audio.setSpeechActive?.(false); this.token++; this.active = null; this.queue = []; this.nextAt = 0; this.subtitle = ""; this.subtitleUntil = 0; this.environment.speechSynthesis?.cancel(); }
    clear() { this.suspend(); this.last.clear(); }
  }
  root.CommentaryEngine = CommentaryEngine;
  if (typeof module !== "undefined") module.exports = { CommentaryEngine };
})(typeof globalThis !== "undefined" ? globalThis : this);
