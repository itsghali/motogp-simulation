(function (root) {
  const timeText = value => {
    if (!Number.isFinite(value) || value <= 0) return "—";
    const milliseconds = Math.round(value);
    return `${Math.floor(milliseconds / 60000)}:${((milliseconds % 60000) / 1000).toFixed(3).padStart(6, "0")}`;
  };
  const riderName = bike => bike?.identity?.name || `Agent ${(bike?.id ?? 0) + 1}`;
  class GrandPrixPresentation {
    constructor(container, host) {
      this.host = host; this.mode = "training"; this.race = null; this.events = new RaceEvents();
      this.audio = new AudioManager(); this.commentary = new CommentaryEngine(this.events, this.audio); this.commentary.setLanguage("en");
      this.audio.setCommentaryMode("dynamic");
      this.audioDirector = new AudioDirector(this.audio, this.events); this.camera = new CameraDirector(this.events);
      this.clock = 0; this.lastPanel = -Infinity; this.playback = null; this.validationRun = null; this.validationSource = null;
      this.cardRiderId = null; this.cardDismissed = false;
      this.commentary.now = () => this.clock; this.audio.now = () => this.clock;
      this.settings = {
        quality: "high", crowd: true, particles: true, shadows: true, details: true,
        hud: true, subtitles: true, reduced: root.matchMedia?.("(prefers-reduced-motion: reduce)").matches || false,
        shake: 0, heat: false, line: false, replay: true, inspired: false, trainingAudio: true
      };
      this.particles = []; this.ghosts = new Map();
      this.build(container);
      this.events.on(event => {
        if (event.type === "FINISH" && this.settings.particles) for (let i = 0; i < 35 && this.particles.length < 100; i++) {
          this.particles.push({ x: 400 + (i * 37) % 120, y: 130, age: 0, hue: i * 47 });
        }
        if (["OFF_TRACK", "CRASH"].includes(event.type) && this.settings.particles) for (let i = 0; i < 8 && this.particles.length < 100; i++) {
          this.particles.push({ x: event.x, y: event.y, age: 0, hue: 34 + i, dust: true });
        }
      });
    }
    build(container) {
      container.parentNode.classList.add("broadcast-app");
      const toolbar = document.createElement("section"); toolbar.id = "gp-toolbar"; toolbar.setAttribute("aria-label", "Grand Prix et présentation");
      toolbar.innerHTML = `<div class="gp-brand"><strong>Moto<span>GP</span></strong><small>RACING SIMULATOR / JEREZ</small></div>
        <label>Expérience <select id="gp-mode"><option value="training">Training</option><option value="race">Race</option><option value="cinematic">Cinematic</option><option value="debug">Debug</option><option value="spectator">Spectator</option></select></label>
        <label>Modèle de course <select id="gp-model" aria-describedby="gp-model-info"></select></label><button id="gp-import-model">Importer modèle JSON</button><button id="gp-clear-models">Vider les modèles</button><button id="gp-restore-models" hidden>Restaurer les modèles</button><button id="gp-restore-saved-models" hidden>Restaurer les sauvegardes du site</button>
        <details id="gp-grid"><summary>Affectations des six pilotes · prochaine course</summary><div id="gp-assignments"></div><button id="gp-fill-grid">Affecter le modèle ci-dessus aux six motos</button><p>Chaque ligne choisit un cerveau enregistré ; même cerveau autorisé plusieurs fois. Profil conservé. Physique commune : vitesse 5,5, force 0,18. Trois tours d’homologation avant départ ; modèles incompatibles refusés.</p></details><button id="gp-launch">Lancer Grand Prix</button><button id="gp-pause">Pause</button><button id="gp-live" hidden>Quitter replay</button><button id="gp-audio">Activer audio</button><button id="gp-obstacle-mode" aria-pressed="false">Placer obstacles à la souris</button><button id="gp-settings-toggle">Réglages spectacle</button><button id="gp-lab-toggle" aria-expanded="false" aria-controls="controls">Laboratoire</button><button id="gp-fullscreen">Plein écran</button><span id="gp-model-info" role="status"></span>`;
      container.parentNode.insertBefore(toolbar, container.parentNode.firstChild);
      const panel = document.createElement("section"); panel.id = "gp-settings"; panel.hidden = true;
      panel.innerHTML = `<h2>Réalisation du Grand Prix</h2><p>Course fictive · tracé schématique Jerez · assistances réactives optionnelles, course uniquement.</p>
        <fieldset><legend>Assistance réactive de course · prochaine course</legend>
        <label>Largeur piste Grand Prix (px) <input id="gp-track-width" type="number" min="24" max="100" step="2" value="52"></label>
        <p>24–100 px ; 52 px par défaut. Au-delà d’environ 53 px, les bords du tracé actuel peuvent se croiser. Prochaine course uniquement ; entraînement inchangé.</p>
        <label><input id="gp-drones" type="checkbox"> Drones boids · prochaine course</label>
        <label>Quantité (0–32) <input id="gp-drone-count" type="number" min="0" max="32" value="12"></label>
        <label>Perception (px) <input id="gp-drone-radius" type="number" min="10" max="250" value="100"></label>
        <label>Séparation drones <input id="gp-drone-separation" type="number" min="0" max="5" step="0.1" value="1.5"></label>
        <label>Alignement <input id="gp-drone-alignment" type="number" min="0" max="5" step="0.1" value="1"></label>
        <label>Cohésion <input id="gp-drone-cohesion" type="number" min="0" max="5" step="0.1" value="0.7"></label>
        <label><input id="gp-avoidance" type="checkbox"> Évitement anticipatif</label>
        <label>Anticipation (px) <input id="gp-lookahead" type="number" min="10" max="200" value="45"></label>
        <label>Poids évitement <input id="gp-avoidance-weight" type="number" min="0" max="5" step="0.1" value="1.5"></label>
        <label>Obstacle X <input id="gp-obstacle-x" type="number" min="0" max="920" value="460"></label>
        <label>Y <input id="gp-obstacle-y" type="number" min="0" max="720" value="360"></label>
        <label>Rayon (px) <input id="gp-obstacle-radius" type="number" min="2" max="60" value="12"></label>
        <button id="gp-obstacle-add">Ajouter obstacle</button><div id="gp-obstacle-list"></div>
        <p>Obstacles physiques même sans évitement. Ajouter/supprimer prépare la prochaine course.</p>
        <label><input id="gp-separation" type="checkbox"> Anticollision motos · priorité et espacement</label>
        <label>Rayon (px) <input id="gp-separation-radius" type="number" min="1" max="150" value="28"></label>
        <label>Intensité espacement <input id="gp-separation-strength" type="number" min="0" max="5" step="0.1" value="0.6"></label>
        <p>Le pilote derrière ou non prioritaire ralentit ; rotation adaptée à la vitesse, sans poussée latérale. Intensité : marge de sécurité croissante, saturée à 3 ; zéro désactive. Aucune garantie si le passage est physiquement impossible.</p>
        <label>Poids neuronal <input id="gp-neural-weight" type="number" min="0" max="5" step="0.1" value="1"></label>
        <p>Neuf entrées neuronales conservées. Forces d’assistance distinctes du cerveau. Options figées au départ.</p></fieldset>
        <label><input id="gp-inspired" type="checkbox"> Modifier le profil pour créer des variantes MotoGP — course seulement</label>
        <label>Intensité style (%) <input id="gp-style-strength" type="number" min="0" max="100" value="100"></label>
        <p class="gp-setting-help">Par défaut : cerveau choisi sur chaque ligne, poids et traits conservés. Option activée : traits remplacés selon les styles MotoGP, intensité 100 % par défaut. Modèle enregistré inchangé.</p>
        <label>Son moteur réel (optionnel) <input id="gp-engine-file" type="file" accept="audio/*,.mp3,.wav,.ogg"></label><span id="gp-engine-name">Enregistrement moto fourni · synthèse combustion en secours</span>
        <p>Importer une courte boucle moteur stable, 30 s maximum, pour employer un véritable enregistrement. Hauteur adaptée au régime synthétique.</p>
        <label><input id="gp-engines" type="checkbox" checked> Sons des motos</label>
        <label><input id="gp-training-audio" type="checkbox" checked> Moteurs pendant l’entraînement</label>
        <label>Source commentaire <select id="gp-commentary-source"><option value="dynamic">English commentary · live events</option><option value="recorded">MP3 enregistré · ambiance optionnelle</option></select></label>
        <label>Importer commentaire <input id="gp-commentary-file" type="file" accept="audio/mpeg,audio/wav,audio/ogg,.mp3,.wav,.ogg"></label>
        <span id="gp-commentary-name">Aucun fichier importé</span><button id="gp-commentary-restart">Recommencer MP3</button>
        <div id="gp-recorded-media" hidden></div>
        <p class="gp-setting-help">Le MP3 est un commentaire d’ambiance, sans synchronisation avec les dépassements simulés. Les sous-titres indiquent les événements de la simulation.</p>
        <label>Tours <input id="gp-laps" type="number" min="1" max="20" value="3"></label>
        <label>Intervalle feux (ms) <input id="gp-light" type="number" min="100" max="3000" value="700"></label>
        <label>Maintien cinq feux (ms) <input id="gp-hold" type="number" min="0" max="5000" value="1200"></label>
        <label>Qualité <select id="gp-quality"><option value="low">Low</option><option value="medium">Medium</option><option value="high" selected>High</option><option value="cinematic">Cinematic</option></select></label>
        <label>Caméra <select id="gp-camera">${this.camera.modes.map(mode => `<option>${mode}</option>`).join("")}</select></label>
        <label>Langue commentaire <select id="gp-commentary-language"><option value="en">English</option><option value="fr">Français</option></select></label><button id="gp-voice-test">Tester la voix</button><p>La voix prend priorité : moteurs, musique et public baissent pendant les annonces.</p><label>Voix <select id="gp-voice"><option value="">Voix disponible selon langue</option></select></label>
        <label><input id="gp-commentary" type="checkbox" checked> Commentaire vocal</label>
        <div id="gp-options"></div><div id="gp-mix"></div>
        <label>Taille HUD <input id="gp-font" type="range" min="12" max="22" value="14"></label>
        <label>Secousse caméra <input id="gp-shake" type="range" min="0" max="100" value="0"></label>
        <p>Espace : pause · D : debug · C : caméra · F : leader · M : muet · H : HUD · R : replay. Cliquer sur une moto pour suivre.</p>`;
      toolbar.after(panel);
      const session = document.createElement("section"); session.id = "gp-sessionbar";
      session.innerHTML = `<div class="gp-event"><span>GRAN PREMIO DE ESPAÑA</span><strong>CIRCUITO DE JEREZ <small>ÁNGEL NIETO</small></strong></div><span id="gp-session-state">TRAINING</span><span id="gp-session-timer">GEN 01</span><span id="gp-sound-state" role="status">AUDIO OFF</span>`;
      toolbar.after(session);
      container.style.position = "relative";
      const hud = document.createElement("div"); hud.id = "gp-hud"; hud.innerHTML = `<div id="gp-broadcast"></div><div id="gp-center"></div><div id="gp-rider-card"></div><div id="gp-bottom-hud"><div id="gp-subtitle" role="status" aria-live="polite"></div><div id="gp-telemetry"></div><div id="gp-minimap" role="img" aria-label="Mini-carte du circuit"></div></div>`;
      container.appendChild(hud); this.hud = hud;
      const training = document.createElement("div"); training.id = "gp-training-hud"; training.setAttribute("aria-label", "État de l’entraînement");
      container.appendChild(training); this.trainingHud = training;
      const result = document.createElement("section"); result.id = "gp-results"; result.hidden = true; container.after(result); this.result = result;
      const notice = document.createElement("div"); notice.id = "gp-notice"; notice.setAttribute("role", "status"); toolbar.after(notice); this.notice = notice;
      const get = id => document.getElementById(`gp-${id}`); this.get = get;
      this.shell = container.parentNode;
      this.organizeToolbar(toolbar);
      this.addPanelClose(panel, "settings", "Fermer les réglages spectacle");
      this.addPanelClose(get("grid"), "grid", "Fermer les affectations des pilotes");
      const labClose = this.addPanelClose(document.getElementById("controls"), "lab", "Fermer le laboratoire");
      // The laboratory is inert during a race; its close command must remain usable.
      labClose.parentNode.classList.add("gp-lab-closebar"); this.shell.appendChild(labClose.parentNode);
      get("grid").addEventListener("toggle", () => {
        if (get("grid").open) { this.closePanel("settings", false); this.closePanel("lab", false); }
      });
      get("settings-toggle").setAttribute("aria-controls", "gp-settings");
      get("settings-toggle").setAttribute("aria-expanded", "false");
      this.assignments = Array(6).fill("");
      try { this.setModels(this.host.raceModels()); }
      catch (error) { this.setModels([]); this.notice.textContent = `Bibliothèque indisponible : ${error.message}`; }
      get("model").addEventListener("change", () => this.showModelInfo());
      get("fill-grid").addEventListener("click", () => this.fillRosterFromModel());
      get("import-model").addEventListener("click", () => this.host.importModel());
      get("clear-models").addEventListener("click", () => this.changeModelLibrary("clearModels"));
      get("restore-models").addEventListener("click", () => this.changeModelLibrary("restoreModels"));
      get("restore-saved-models").addEventListener("click", () => this.changeModelLibrary("recoverSavedModels"));
      this.pendingObstacles = []; this.obstacleEditing = false;
      get("obstacle-mode").addEventListener("click", () => {
        this.obstacleEditing = !this.obstacleEditing;
        if (this.obstacleEditing && this.race) this.setPaused(true);
        get("obstacle-mode").setAttribute("aria-pressed", String(this.obstacleEditing));
        get("obstacle-mode").textContent = this.obstacleEditing ? "Terminer placement obstacles" : "Placer obstacles à la souris";
        this.notice.textContent = this.obstacleEditing ? "Placement : course en pause. Cliquer sur la piste : ajouter ; Maj + clic : supprimer. Contours = aperçus INACTIFS. Relancer Grand Prix pour appliquer." : "Placement terminé : lancer une nouvelle course pour appliquer les obstacles.";
      });
      get("obstacle-add").addEventListener("click", () => {
        try {
          if (this.pendingObstacles.length >= 24) throw new Error("24 obstacles maximum.");
          this.pendingObstacles.push({ x: this.raceNumber("obstacle-x", 460, 0, 920), y: this.raceNumber("obstacle-y", 360, 0, 720), radius: this.raceNumber("obstacle-radius", 12, 2, 60) });
          this.enableObstacleAvoidance(); this.renderObstacles();
          this.notice.textContent = "Obstacle ajouté ; évitement activé pour la prochaine course.";
        } catch (error) { this.notice.textContent = error.message; }
      });
      this.mountRecording();
      get("mode").addEventListener("change", event => this.setMode(event.target.value));
      get("launch").addEventListener("click", () => this.launchRace());
      get("live").addEventListener("click", () => this.stopReplay());
      get("pause").addEventListener("click", () => this.setPaused(!this.host.isPaused()));
      get("audio").addEventListener("click", async () => {
        if (!this.audio.enabled || this.audio.playBlocked) { await this.enableAudio(); }
        else { this.audio.mute(); get("audio").textContent = this.audio.muted ? "Rétablir audio" : "Couper audio"; }
      });
      get("lab-toggle").addEventListener("click", () => {
        const opened = !this.shell.classList.contains("lab-open");
        if (opened) { this.closePanel("settings", false); this.closePanel("grid", false); }
        this.shell.classList.toggle("lab-open", opened); get("lab-toggle").setAttribute("aria-expanded", String(opened));
      });
      get("engine-file").addEventListener("change", async event => {
        const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
        try {
          if (file.size > 15 * 1024 * 1024) throw new Error("Son moteur : 15 Mo maximum.");
          if (!await this.enableAudio()) return;
          const buffer = await this.audio.context.decodeAudioData(await file.arrayBuffer());
          this.audio.engineSound.setSample(buffer); get("engine-name").textContent = `Enregistrement moteur : ${file.name}`; this.audio.engineSampleStatus = get("engine-name").textContent;
        } catch (error) { this.notice.textContent = error.message; }
      });
      get("engines").addEventListener("change", event => { this.audio.enginesEnabled = event.target.checked; if (!event.target.checked) this.audio.engineSound?.silence(); });
      get("training-audio").addEventListener("change", event => { this.settings.trainingAudio = event.target.checked; });
      get("inspired").addEventListener("change", event => { this.settings.inspired = event.target.checked; });
      get("commentary-source").addEventListener("change", event => { this.commentary.suspend(); this.audio.setCommentaryMode(event.target.value); });
      get("commentary-restart").addEventListener("click", () => this.audio.resetRecording());
      get("commentary-file").addEventListener("change", event => {
        const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
        if (file.size > 25 * 1024 * 1024 || !/\.(mp3|wav|ogg)$/i.test(file.name)) { this.notice.textContent = "Choisir MP3, WAV ou OGG, 25 Mo maximum."; return; }
        const url = URL.createObjectURL(file); this.audio.loadCommentary(url, file.name);
        this.mountRecording();
        if (this.commentaryBlob) URL.revokeObjectURL(this.commentaryBlob); this.commentaryBlob = url;
        get("commentary-name").textContent = file.name; this.audio.setCommentaryMode("recorded"); get("commentary-source").value = "recorded";
      });
      get("settings-toggle").addEventListener("click", () => this.setSettingsOpen(panel.hidden));
      get("fullscreen").addEventListener("click", () => {
        const task = document.fullscreenElement ? document.exitFullscreen?.() : document.querySelector("main").requestFullscreen?.();
        task?.catch(() => { this.notice.textContent = "Plein écran indisponible dans ce navigateur."; });
      });
      get("camera").addEventListener("change", event => { this.camera.mode = event.target.value; });
      get("quality").addEventListener("change", event => {
        this.settings.quality = event.target.value;
        for (const key of ["crowd", "particles", "shadows", "details"]) { this.settings[key] = event.target.value !== "low"; get(key).checked = this.settings[key]; }
      });
      for (const [key, label] of Object.entries({ crowd: "Foule", particles: "Particules", shadows: "Ombres", details: "Détails circuit", hud: "HUD", subtitles: "Sous-titres", reduced: "Mouvements réduits", heat: "Carte sorties / fréquentation", line: "Trajectoire réellement enregistrée", replay: "Enregistrer replay" })) {
        const labelNode = document.createElement("label"); const input = document.createElement("input"); input.type = "checkbox"; input.id = key === "hud" ? "gp-option-hud" : `gp-${key}`; input.checked = this.settings[key];
        input.addEventListener("change", () => { this.settings[key] = input.checked; }); labelNode.append(input, document.createTextNode(label)); get("options").appendChild(labelNode);
      }
      for (const [key, label] of Object.entries({ master: "Master", music: "Musique", engines: "Moteurs", commentary: "Voix", crowd: "Public", ambience: "Ambiance", ui: "Interface", control: "Direction course" })) {
        const labelNode = document.createElement("label"); labelNode.textContent = label;
        const input = document.createElement("input"); Object.assign(input, { type: "range", min: 0, max: 100, value: this.audio.volumes[key] * 100 });
        input.id = `gp-volume-${key}`; labelNode.htmlFor = input.id;
        input.addEventListener("input", () => { this.audio.setVolume(key, Number(input.value) / 100); if (key === "commentary" && Number(input.value) === 0) root.speechSynthesis?.cancel(); });
        labelNode.appendChild(input); get("mix").appendChild(labelNode);
      }
      const voices = () => {
        const select = get("voice"); const chosen = select.value;
        select.replaceChildren(new Option("Voix disponible selon langue", ""));
        const french = this.commentary.availableVoices();
        for (const voice of french) select.add(new Option(voice.name, voice.name)); select.value = chosen;
        this.commentary.voiceStatus = french.length ? "" : this.commentary.language === "en" ? "No English voice available · subtitles on" : "Aucune voix française disponible · sous-titres actifs";
      };
      get("commentary-language").addEventListener("change", event => { this.commentary.setLanguage(event.target.value); voices(); });
      get("voice-test").addEventListener("click", async () => {
        await this.enableAudio(); this.commentary.suspend(); this.audio.setCommentaryMode("dynamic"); get("commentary-source").value = "dynamic";
        this.commentary.queue.push({ text: this.commentary.language === "en" ? "Welcome to Jerez. This is your live race commentary." : "Bienvenue à Jerez. Voici votre commentaire de course.", priority: 100, time: this.clock });
        this.commentary.tick(this.clock); this.updateAudioStatus();
      });
      voices(); root.speechSynthesis?.addEventListener("voiceschanged", voices);
      get("voice").addEventListener("change", event => { this.commentary.voice = event.target.value; });
      get("commentary").addEventListener("change", event => {
        this.commentary.enabled = event.target.checked; this.audio.commentaryEnabled = event.target.checked;
        if (!event.target.checked) { this.commentary.suspend(); this.audio.recorded?.pause(); }
      });
      get("font").addEventListener("input", event => { hud.style.fontSize = `${event.target.value}px`; });
      get("shake").addEventListener("input", event => { this.settings.shake = Number(event.target.value) / 100; });
      this.organizeSettings(panel);
      root.addEventListener("keydown", event => {
        if (event.key === "Escape" && this.dismissOpenPanel()) { event.preventDefault(); return; }
        if (["INPUT", "SELECT", "TEXTAREA", "BUTTON", "SUMMARY"].includes(event.target.tagName) || event.ctrlKey || event.altKey || event.metaKey || event.repeat) return;
        const key = event.key.toLowerCase();
        if (key === " ") { event.preventDefault(); this.setPaused(!this.host.isPaused()); }
        if (key === "d") this.setMode(this.mode === "debug" ? "training" : "debug");
        if (key === "c") { this.camera.cycle(); get("camera").value = this.camera.mode; }
        if (key === "f") { this.camera.mode = "FOLLOW_LEADER"; get("camera").value = this.camera.mode; }
        if (key === "m") this.audio.mute();
        if (key === "h") { this.settings.hud = !this.settings.hud; get("option-hud").checked = this.settings.hud; }
        if (key === "r") this.watchReplay();
      });
      const onRiderTrigger = event => {
        if (this.handleObstaclePointer(event)) return;
        const row = event.target.closest?.(".gp-tower li");
        if (row && this.race) {
          const bikeId = Number(row.dataset.bikeId);
          if (Number.isFinite(bikeId)) {
            event.stopPropagation();
            this.selectRider(bikeId);
            return;
          }
        }
        if (!this.race || event.target.tagName !== "CANVAS") return;
        const box = event.target.getBoundingClientRect(); const point = this.camera.worldPoint((event.clientX - box.left) * 920 / box.width, (event.clientY - box.top) * 720 / box.height);
        const bike = this.race.population.slice().sort((a, b) => Math.hypot(a.pos.x - point.x, a.pos.y - point.y) - Math.hypot(b.pos.x - point.x, b.pos.y - point.y))[0];
        if (bike && Math.hypot(bike.pos.x - point.x, bike.pos.y - point.y) < 25) {
          this.selectRider(bike.id);
        }
      };
      root.addEventListener("pointerdown", onRiderTrigger, true);
      root.addEventListener("click", onRiderTrigger, true);
      container.addEventListener("pointerdown", onRiderTrigger, true);
      container.addEventListener("click", onRiderTrigger, true);
    }
    handleObstaclePointer(event) {
      if (!this.obstacleEditing || event.target.tagName !== "CANVAS") return false;
      event.stopPropagation?.();
      if (event.type !== "pointerdown" || this.lastObstacleEvent === event) return true;
      this.lastObstacleEvent = event;
      if (this.playback) { this.notice.textContent = "Quitter le replay avant de placer des obstacles."; return true; }
      const box = event.target.getBoundingClientRect();
      if (!(box.width > 0 && box.height > 0)) return true;
      const screen = { x: (event.clientX - box.left) * 920 / box.width, y: (event.clientY - box.top) * 720 / box.height };
      const point = this.race ? this.camera.worldPoint(screen.x, screen.y) : screen;
      const circuit = this.race?.circuit || this.host.simulation()?.circuit;
      if (event.shiftKey) {
        const index = this.pendingObstacles.findIndex(spec => Math.hypot(spec.x - point.x, spec.y - point.y) <= spec.radius + 6);
        if (index >= 0) this.pendingObstacles.splice(index, 1);
      } else {
        if (!circuit?.isOnTrack(point)) { this.notice.textContent = "Cliquer sur la chaussée du circuit."; return true; }
        if (this.pendingObstacles.length >= 24) { this.notice.textContent = "24 obstacles maximum."; return true; }
        try { this.pendingObstacles.push({ x: Math.round(point.x), y: Math.round(point.y), radius: this.raceNumber("obstacle-radius", 12, 2, 60) }); }
        catch (error) { this.notice.textContent = error.message; return true; }
        this.enableObstacleAvoidance();
      }
      this.renderObstacles();
      this.notice.textContent = `${this.pendingObstacles.length} obstacle(s) pour la prochaine course · évitement ${this.get("avoidance")?.checked ? "activé" : "désactivé"}. Maj + clic pour supprimer. La course actuelle reste figée.`;
      return true;
    }
    enableObstacleAvoidance() { const input = this.get("avoidance"); if (input) input.checked = true; }
    drawObstaclePreview() {
      if (!this.obstacleEditing) return;
      const genome = this.host.simulation()?.population[0]?.genome;
      if (!genome) return;
      if (this.previewSpecs !== JSON.stringify(this.pendingObstacles)) {
        this.previewSpecs = JSON.stringify(this.pendingObstacles); this.obstaclePreviews = this.pendingObstacles.map(spec => new Obstacle(genome, spec));
      }
      for (const obstacle of this.obstaclePreviews || []) {
        const active = this.race?.obstacles?.some(item => item.pos.x === obstacle.pos.x && item.pos.y === obstacle.pos.y && item.radius === obstacle.radius);
        if (!active) obstacle.show(true);
      }
    }
    selectRider(bikeId) {
      if (!this.race) return;
      const id = Number(bikeId);
      if (!Number.isFinite(id)) return;
      const target = this.race.population.find(b => b.id === id);
      if (!target) return;
      this.cardRiderId = id;
      this.camera.selected = id;
      this.camera.mode = "FOLLOW_SELECTED";
      const camSelect = this.get("camera");
      if (camSelect) camSelect.value = this.camera.mode;
      this.cardDismissed = false;
      const cardNode = this.get("rider-card");
      if (cardNode) cardNode.style.display = "";
      this.lastPanel = -Infinity;
      this.renderPanels(this.host?.isPaused?.() || false);
    }
    async enableAudio(announce = true) {
      if (!this.audio.enabled || this.audio.playBlocked) {
        const ok = await this.audio.enable();
        if (ok && this.audio.engineSampleStatus) this.get("engine-name").textContent = this.audio.engineSampleStatus;
        this.get("audio").textContent = ok ? (this.audio.muted ? "Rétablir audio" : "Couper audio") : "Réessayer audio";
        if (announce && !this.launchFailure) this.notice.textContent = ok ? "Audio actif : moteurs liés à vitesse/gaz/freinage ; régime synthétique estimé, sans mesure mécanique." : this.audio.error;
        return ok;
      }
      return true;
    }
    setPaused(value) {
      this.host.pause(value);
      const button = this.get("pause"); if (button) button.textContent = value ? "Reprendre" : "Pause";
      if (value) { this.audio.update([], "", 0, false); this.commentary?.suspend?.(); const subtitle = this.get("subtitle"); if (subtitle) subtitle.textContent = ""; root.speechSynthesis?.cancel(); }
      this.updateAudioStatus();
    }
    mountRecording() {
      const container = this.get("recorded-media"); container.replaceChildren();
      if (this.audio.recorded) { this.audio.recorded.id = "gp-recorded-track"; container.appendChild(this.audio.recorded); }
    }
    paintTraining(sim) {
      if (!this.settings.details) return;
      if (!this.trainingVenue) this.trainingVenue = new Venue(sim.population[0].genome);
      this.trainingVenue.show(false); this.trainingVenue.showTrackUnderlay(sim.circuit);
    }
    paintTrainingEdges(sim) { if (this.settings.details) this.trainingVenue?.showTrackEdges(sim.circuit); this.drawObstaclePreview(); }
    updateTraining(sim, paused) {
      this.trainingHud.hidden = false;
      this.get("pause").textContent = paused ? "Reprendre" : "Pause";
      const leader = sim.leader();
      this.audio.update(sim.population, "TRAINING", sim.simulationTime, !paused && this.settings.trainingAudio, leader?.id, false);
      const now = root.performance?.now() || Date.now(); if (now - (this.trainingPanelAt || 0) < 180) return;
      this.trainingPanelAt = now;
      const state = paused ? "PAUSED" : sim.status === "modèle validé" ? "MODEL VALIDATED" : sim.status === "validation échouée" ? "VALIDATION FAILED" : sim.mode === "budget" ? "BUDGET PAUSED" : sim.mode === "validation" ? "VALIDATION" : "TRAINING";
      this.trainingHud.textContent = `${state}  /  GEN ${String(sim.generation).padStart(2, "0")}  /  ${sim.remaining()} AGENTS  /  BEST ${sim.bestScore.toFixed(1)}`;
      this.get("session-state").textContent = state;
      this.get("session-timer").textContent = `GEN ${String(sim.generation).padStart(2, "0")}`;
      this.updateAudioStatus();
    }
    updateAudioStatus() {
      const text = !this.audio.enabled ? "CLICK AUDIO" : this.audio.muted ? "MUTED" : this.playback || this.host?.isPaused?.() ? "AUDIO PAUSED" :
        `${this.audio.enginesEnabled ? "ENGINE ON" : "ENGINE OFF"} · ${this.race ? this.audio.commentaryMode === "recorded" ? `MP3 ${this.audio.recordedStatus}` : "LIVE VOICE" : "TRAINING"}`;
      const voiceInfo = this.race && this.audio.commentaryMode === "dynamic" && this.commentary.voiceStatus ? ` · ${this.commentary.voiceStatus}` : "";
      const element = this.get("sound-state"); if (element.textContent !== text + voiceInfo) element.textContent = text + voiceInfo;
    }
    setMode(mode) {
      if (this.mode === "debug" && mode !== "debug" && this.debugView) {
        const checkboxes = this.host.controls().checkboxes;
        checkboxes.sensors.checked = this.debugView.sensors; checkboxes.checkpoints.checked = this.debugView.checkpoints;
        this.debugView = null;
      }
      if (["training", "debug"].includes(mode)) {
        this.clearLaunchFailure();
        if (mode === "debug" && this.mode !== "debug") {
          const checkboxes = this.host.controls().checkboxes;
          this.debugView = { sensors: checkboxes.sensors.checked, checkpoints: checkboxes.checkpoints.checked };
        }
        this.race?.flags.dispose();
        if (this.trainingPaused !== undefined) { this.host.pause(this.trainingPaused); this.trainingPaused = undefined; }
        this.mode = mode; this.race = null; this.playback = null; this.result.hidden = true; this.commentary.clear();
        this.setResultsAvailable(false);
        const simulation = this.host.simulation(); if (simulation) simulation.inference.setGenomes(simulation.population.map(bike => bike.genome));
        document.getElementById("controls").inert = false; this.hud.hidden = true;
        const live = this.get("live"); if (live) live.hidden = true;
        this.audio.update([], "", 0, false); this.notice.textContent = mode === "debug" ? "Debug : capteurs et checkpoints actifs." : "Entraînement repris · moteurs disponibles après activation audio.";
        if (mode === "debug") { this.host.controls().checkboxes.sensors.checked = true; this.host.controls().checkboxes.checkpoints.checked = true; }
      } else {
        if (!this.race) {
          if (!this.startRace()) {
            this.get("mode").value = this.mode;
            const grid = this.get("grid"); if (grid) grid.open = true;
            return;
          }
          this.race.begin();
        }
        this.mode = mode; this.camera.mode = mode === "cinematic" ? "CINEMATIC" : mode === "spectator" ? "FOLLOW_LEADER" : "OVERVIEW";
      }
      this.get("mode").value = this.mode; this.get("camera").value = this.camera.mode;
    }
    changeModelLibrary(action) {
      try {
        const count = this.host[action]();
        if (action === "clearModels") this.assignments.fill("");
        const models = this.host.raceModels();
        const selected = action === "recoverSavedModels" ? models.find(model => !model.metadata.imported) : models[0];
        this.setModels(models, action !== "clearModels" ? selected?.id : undefined);
        this.get("restore-models").hidden = models.length > 0 || !this.host.hasModelRecovery();
        this.notice.textContent = action === "clearModels"
          ? `${count} modèles retirés. Bibliothèque vide ; récupération disponible avec « Restaurer les modèles ».`
          : action === "recoverSavedModels"
            ? `${count} sauvegardes du site récupérées depuis les archives. Modèles actuels conservés. Affecter un modèle à chaque pilote.`
            : `${count} modèles restaurés dans la liste « Modèle de course ». Affecter maintenant un modèle à chaque pilote.`;
      } catch (error) { this.notice.textContent = `Bibliothèque inchangée : ${error.message}`; }
    }
    setModels(models, selectedId) {
      const select = this.get("model"); const previous = select.value;
      this.models = models; select.replaceChildren();
      const empty = document.createElement("option"); empty.value = ""; empty.textContent = "Choisir un modèle sauvegardé ou importer JSON"; select.appendChild(empty);
      for (const model of models) {
        const option = document.createElement("option"); option.value = model.id;
        option.textContent = `${model.name} · ${model.metadata.imported ? "JSON importé" : "Sauvegarde locale"}`;
        select.appendChild(option);
      }
      select.value = [selectedId, previous].find(id => models.some(model => model.id === id)) || "";
      const restore = this.get("restore-models");
      if (restore) restore.hidden = models.length > 0 || !this.host.hasModelRecovery?.();
      const savedRestore = this.get("restore-saved-models");
      if (savedRestore) {
        const count = this.host.savedModelRecoveryCount?.() || 0;
        savedRestore.hidden = count === 0;
        savedRestore.textContent = `Restaurer les sauvegardes du site (${count})`;
      }
      if (this.assignments) this.renderAssignments();
      this.showModelInfo();
    }
    renderAssignments() {
      const grid = this.get("assignments"); grid.replaceChildren();
      RiderRoster.riders.forEach((rider, i) => {
        const row = document.createElement("label"); row.textContent = `#${rider.number} ${rider.name} `;
        const select = document.createElement("select"); select.id = `gp-rider-model-${i}`; select.setAttribute("aria-label", `Modèle ${rider.name}`);
        const empty = document.createElement("option"); empty.value = ""; empty.textContent = "Choisir un modèle"; select.appendChild(empty);
        for (const model of this.models) {
          const option = document.createElement("option"); option.value = model.id;
          option.textContent = `${model.name} · ${model.metadata.profileLabel}`; select.appendChild(option);
        }
        select.value = this.assignments[i] || "";
        select.addEventListener("change", () => { this.assignments[i] = select.value; this.showModelInfo(); });
        row.appendChild(select); grid.appendChild(row);
      });
    }
    organizeSettings(panel) {
      const children = Array.from(panel.children), groups = {};
      const sections = { course:"Course et départ", assistance:"Assistances et obstacles", riders:"Styles des pilotes", audio:"Sons et commentaire", display:"Caméra et affichage" };
      for (const [key, label] of Object.entries(sections)) {
        const section = document.createElement("details"); section.className = "gp-setting-section";
        const summary = document.createElement("summary"); summary.textContent = label; section.appendChild(summary);
        section.open = key === "course"; groups[key] = section; panel.appendChild(section);
        section.addEventListener("toggle", () => { if (section.open) for (const other of Object.values(groups)) if (other !== section) other.open = false; });
      }
      const keys = {
        course:["laps", "light", "hold"], riders:["inspired", "style-strength"],
        audio:["engine-file", "engine-name", "engines", "training-audio", "commentary-source", "commentary-file", "commentary-name", "commentary-restart", "recorded-media", "commentary-language", "voice-test", "voice", "commentary", "mix"],
        display:["quality", "camera", "options", "font", "shake"]
      };
      let previous = null;
      for (const child of children) {
        if (child.classList.contains("gp-panel-closebar") || child.tagName === "H2") continue;
        const id = (child.id || child.querySelector("input,select,button")?.id || "").replace(/^gp-/, "");
        const key = child.tagName === "FIELDSET" ? "assistance" : Object.keys(keys).find(group => keys[group].includes(id));
        if (key) { groups[key].appendChild(child); previous = key; }
        else if (previous && child.tagName === "P") groups[previous].appendChild(child);
      }
    }
    organizeToolbar(toolbar) {
      const get = this.get;
      const setup = document.createElement("div"); setup.className = "gp-toolbar-setup";
      toolbar.appendChild(setup);
      setup.append(toolbar.querySelector(".gp-brand"), get("mode").closest("label"), get("model").closest("label"), get("import-model"), get("fill-grid"));
      get("fill-grid").textContent = "Affecter aux 6 motos";
      const actions = document.createElement("div"); actions.className = "gp-toolbar-actions";
      toolbar.appendChild(actions);
      const results = document.createElement("button"); results.id = "gp-results-toggle"; results.type = "button";
      results.textContent = "Résultats"; results.hidden = true; results.setAttribute("aria-controls", "gp-results"); results.setAttribute("aria-expanded", "false");
      results.addEventListener("click", () => {
        this.result.hidden = !this.result.hidden; results.setAttribute("aria-expanded", String(!this.result.hidden));
        if (!this.result.hidden) this.result.querySelector(".gp-panel-close")?.focus();
      });
      toolbar.appendChild(results);
      for (const key of ["launch", "grid", "pause", "audio", "obstacle-mode", "settings-toggle", "lab-toggle", "fullscreen", "live", "results-toggle"]) actions.appendChild(get(key));
      const library = document.createElement("div"); library.className = "gp-library-actions";
      for (const key of ["clear-models", "restore-models", "restore-saved-models"]) library.appendChild(get(key));
      get("grid").appendChild(library);
      get("grid").querySelector("summary").textContent = "Pilotes · affectations";
      const context = document.createElement("div"); context.className = "gp-toolbar-context"; context.appendChild(get("model-info"));
      toolbar.append(setup, actions, context);
    }
    fillRosterFromModel() {
      const model = this.models.find(entry => entry.id === this.get("model").value);
      if (!model) { this.notice.textContent = "Choisir un modèle avant de l’affecter aux six motos."; return false; }
      this.assignments.fill(model.id); this.renderAssignments(); this.showModelInfo();
      this.notice.textContent = `6/6 affectations préparées : ${model.name}. Lancer Grand Prix pour vérifier la grille et démarrer.`;
      return true;
    }
    showModelInfo() {
      const model = this.models.find(entry => entry.id === this.get("model").value);
      const assigned = this.assignments ? `${this.assignments.filter(id => this.models.some(entry => entry.id === id)).length}/6 affectations · ` : "";
      this.get("model-info").textContent = assigned + (model ? `Prochaine course : ${model.name} · Profil : ${model.metadata.profileLabel}. Poids et traits enregistrés conservés sauf variantes MotoGP activées.` : "Affecter un modèle à chaque pilote avant le départ.");
      this.get("model-info").title = this.get("model-info").textContent;
      const fill = this.get("fill-grid"); if (fill) { fill.disabled = !model; fill.title = model ? "Préparer les six pilotes avec ce cerveau, sans modifier la course actuelle" : "Choisir d’abord un modèle de course"; }
    }
    renderObstacles() {
      const list = this.get("obstacle-list"); list.replaceChildren();
      this.pendingObstacles.forEach((spec, i) => {
        const row = document.createElement("div"); row.textContent = `Obstacle ${i + 1} : (${spec.x}, ${spec.y}), rayon ${spec.radius} px `;
        this.button(row, "Supprimer", () => { this.pendingObstacles.splice(i, 1); this.renderObstacles(); }); list.appendChild(row);
      });
    }
    raceNumber(key, fallback, min, max) {
      const raw = this.get(key)?.value;
      if (raw === undefined) return fallback;
      const value = Number(raw);
      if (raw === "" || !Number.isFinite(value) || value < min || value > max) throw new Error(`${key} : valeur entre ${min} et ${max}.`);
      return value;
    }
    reportLaunchFailure(message) {
      this.launchFailure = String(message).startsWith("Course impossible :") ? String(message) : `Course impossible : ${message}`;
      this.notice.textContent = this.launchFailure;
      this.notice.classList?.add("gp-launch-failed");
      this.notice.setAttribute?.("role", "alert");
    }
    clearLaunchFailure() {
      if (this.notice.textContent === this.launchFailure) this.notice.textContent = "";
      this.launchFailure = "";
      this.notice.classList?.remove("gp-launch-failed");
      this.notice.setAttribute?.("role", "status");
    }
    async launchRace() {
      if (this.launchPending) return false;
      this.clearLaunchFailure();
      const button = this.get("launch");
      const label = button.textContent;
      this.launchPending = true; button.disabled = true; button.textContent = "Vérification grille…";
      this.notice.textContent = "Vérification des six affectations et homologation sur trois tours…";
      try {
        // Start audio from the user's gesture, but never gate racing on resume,
        // fetching or decoding sound. Its late result must not hide race errors.
        try { Promise.resolve(this.enableAudio(false)).catch(() => { this.get("audio").textContent = "Réessayer audio"; }); }
        catch (_) { this.get("audio").textContent = "Réessayer audio"; }
        // Give the browser a chance to display launch feedback before CPU qualification.
        await new Promise(resolve => root.setTimeout(resolve, 0));
        if (!this.startRace()) { this.reportLaunchFailure(this.notice.textContent); this.get("grid").open = true; return false; }
        this.race.begin();
        return true;
      } catch (error) {
        this.reportLaunchFailure(error.message);
        return false;
      } finally {
        this.launchPending = false; button.disabled = false; button.textContent = label;
      }
    }
    qualifyRoster(config, genomes) {
      const key = JSON.stringify({ config, genomes: genomes.map(genome => genome.toJSON()) });
      this.qualificationCache ||= new Map();
      if (!this.qualificationCache.has(key)) {
        const report = GrandPrixRules.qualify(config, genomes);
        if (this.qualificationCache.size >= 8) this.qualificationCache.delete(this.qualificationCache.keys().next().value);
        this.qualificationCache.set(key, report);
      }
      return this.qualificationCache.get(key);
    }
    startRace() {
      const sim = this.host.simulation();
      if (!sim) { this.reportLaunchFailure("Attendre l’initialisation GPU."); this.get("mode").value = this.mode; return false; }
      let model, raceConfig, roster, genomes, circuit, nextRace, venue, attemptedInference = false;
      try {
        const ids = this.assignments || Array(6).fill(this.get("model").value);
        const chosen = ids.map((id, i) => {
          const entry = id ? this.host.raceModel(id) : null;
          if (!entry) throw new Error(`Choisir un modèle pour le pilote ${i + 1} avant la course.`);
          return entry;
        });
        model = chosen[0];
        for (const [key, min, max] of [["laps", 1, 20], ["light", 100, 3000], ["hold", 0, 5000]]) {
          const input = this.get(key); const value = Number(input.value);
          if (input.value === "" || !Number.isFinite(value) || value < min || value > max || !Number.isInteger(value)) throw new Error(`Réglage ${key} : entier entre ${min} et ${max}.`);
        }
        const strengthInput = this.get("style-strength");
        const strength = strengthInput?.value === undefined ? 1 : Number(strengthInput.value) / 100;
        if (this.settings.inspired && (!Number.isFinite(strength) || strength < 0 || strength > 1 || strengthInput?.value === "")) throw new Error("Intensité style : valeur entre 0 et 100 %.");
        roster = RiderRoster.build(chosen.map(entry => entry.genome), this.settings.inspired, strength);
        roster.forEach((entry, i) => {
          const source = chosen[i];
          entry.identity.model = { id: source.id, name: source.name, profileLabel: source.metadata.profileLabel };
          if (!this.settings.inspired) entry.identity.style = `${source.name} · ${source.metadata.profileLabel}`;
        });
        genomes = roster.map(entry => entry.genome);
        raceConfig = GrandPrixRules.configuration(this.raceNumber("track-width", 52, 24, 100));
        const qualification = this.qualifyRoster(raceConfig, genomes);
        if (!qualification.passed) {
          const failures = qualification.riders.filter(rider => !rider.passed)
            .map(rider => `pilote ${rider.id + 1} (${chosen[rider.id].name}) : ${rider.reason || "trois tours non validés"}`);
          throw new Error(`Homologation Grand Prix refusée — ${failures.join(" ; ")}. Choisir un autre modèle dans la grille ou réentraîner ces cerveaux avec la physique commune. La validation d’entraînement ne vaut pas homologation Grand Prix.`);
        }
        circuit = new Circuit(920, 720, raceConfig.trackWidth);
        if (circuit.isCorridorBlocked(this.pendingObstacles)) {
          throw new Error("Configuration impossible : passage totalement bloqué par les obstacles sur la piste (aucun corridor praticable de largeur ≥ 8,5 px).");
        }
        venue = new Venue(genomes[0]);
        attemptedInference = true;
        nextRace = new RaceSession(circuit, raceConfig, sim.inference, genomes, this.events, {
          obstacles: this.pendingObstacles || [],
          drones: {
            enabled: !!this.get("drones")?.checked, count: this.raceNumber("drone-count", 12, 0, 32),
            radius: this.raceNumber("drone-radius", 100, 10, 250), separation: this.raceNumber("drone-separation", 1.5, 0, 5),
            alignment: this.raceNumber("drone-alignment", 1, 0, 5), cohesion: this.raceNumber("drone-cohesion", 0.7, 0, 5)
          },
          assistance: {
            avoidance: !!this.get("avoidance")?.checked, lookahead: this.raceNumber("lookahead", 45, 10, 200), avoidanceWeight: this.raceNumber("avoidance-weight", 1.5, 0, 5), separation: !!this.get("separation")?.checked,
            radius: this.raceNumber("separation-radius", 28, 1, 150), strength: this.raceNumber("separation-strength", 0.6, 0, 5),
            neuralWeight: this.raceNumber("neural-weight", 1, 0, 5)
          },
          identities: roster.map(entry => entry.identity), laps: Number(this.get("laps").value), timing: { light: Number(this.get("light").value), hold: Number(this.get("hold").value) }
        });
      } catch (error) {
        if (attemptedInference) try { sim.inference.setGenomes((this.race?.population || sim.population).map(bike => bike.genome)); } catch (_) { }
        this.reportLaunchFailure(error.message); return false;
      }
      const profileLabel = model.metadata.profileLabel;
      if (!this.race && this.trainingPaused === undefined) this.trainingPaused = Boolean(this.host.isPaused?.());
      this.race?.flags.dispose();
      this.commentary.clear(); this.events.history = []; this.clock = 0; this.playback = null;
      this.raceToken = (this.raceToken || 0) + 1; this.accumulator = 0;
      this.cardRiderId = null; this.cardDismissed = false;
      this.broadcastRibbon = null; this.standingsTower = null; this.towerRows = null;
      this.race = nextRace; this.obstacleEditing = false;
      const placement = this.get("obstacle-mode"); placement?.setAttribute?.("aria-pressed", "false"); if (placement) placement.textContent = "Placer obstacles à la souris";
      this.get("live").hidden = true;
      this.audio.resetRecording(); this.trainingHud.hidden = true;
      this.venue = venue; this.ghosts.clear(); this.particles = [];
      this.raceModel = { id: model.id, name: model.name, profileLabel };
      this.generation = model.metadata.generation || 0; this.fitness = Number.isFinite(model.metadata.score) ? model.metadata.score : 0; this.mode = "race"; this.get("mode").value = "race";
      this.get("camera").value = this.camera.mode = "OVERVIEW";
      Object.assign(this.camera, { focus: null, focusUntil: 0, priority: 0, selected: 0, x: 460, y: 360, zoom: 1 });
      this.result.hidden = true; document.getElementById("controls").inert = true; this.setPaused(false);
      this.setResultsAvailable(false);
      this.clearLaunchFailure();
      this.notice.textContent = `Course : six cerveaux homologués sur trois tours · Physique commune (vitesse 5,5 ; force 0,18) · ` + (this.settings.inspired ? `Variantes MotoGP ${Math.round(roster[0].identity.styleStrength * 100)} % : traits modifiés pour cette course.` : "6 affectations figées : poids et traits enregistrés conservés.");
      this.notice.textContent += ` Piste ${circuit.trackWidth} px · ${nextRace.obstacles.length} obstacle(s) · évitement ${nextRace.assistance.avoidance ? "ACTIF" : "DÉSACTIVÉ"} · séparation ${nextRace.assistance.separation ? "ACTIVE" : "DÉSACTIVÉE"}.`;
      if (circuit.hasCrossedBorders()) this.notice.textContent += " (attention : bords croisés détectés pour cette largeur — tracé non garanti).";
      if (!model.metadata.validated) this.notice.textContent += " Aucune validation enregistrée pour ce modèle ; abandons possibles.";
      this.lastPanel = -Infinity; return true;
    }
    syncValidation(sim) {
      if (sim.mode === "validation" && sim.population[0] === this.validationSource && sim.status !== "validation échouée") return;
      this.validationRun = null; this.validationSource = null; this.validationRecorder = null;
      if (this.result?.dataset?.kind === "validation" && !this.race && !this.playback) {
        this.result.hidden = true; this.result.replaceChildren();
        this.setResultsAvailable(false);
      }
    }
    recordValidation(sim) {
      this.syncValidation(sim);
      if (sim.mode !== "validation") return;
      if (sim.status === "modèle validé" && this.validationRun?.source === sim.population[0]) return;
      if (this.validationSource !== sim.population[0]) {
        this.validationSource = sim.population[0]; this.validationRecorder = new ReplaySystem(15000, 100);
      }
      if (sim.status !== "validation en cours" && sim.status !== "modèle validé") return;
      if (this.settings.replay) this.validationRecorder.capture(sim.simulationTime, sim.population, sim.status === "modèle validé");
      if (sim.status === "modèle validé" && this.validationRun?.source !== this.validationSource) {
        this.validationRun = {
          source: this.validationSource, frames: this.validationRecorder.save(), generation: sim.generation,
          fitness: sim.bestScore, laps: sim.validationStats.slice(), timestamp: new Date().toISOString(), circuit: new Circuit(920, 720, sim.circuit.trackWidth)
        };
        if (!this.launchFailure) this.notice.textContent = `MODEL VALIDATED · 3 tours · Agent ${this.validationSource.id + 1} · génération ${sim.generation} · ${this.validationRun.timestamp}`;
        this.showValidation();
      }
    }
    setSettingsOpen(open) {
      if (open) { this.closePanel("grid", false); this.closePanel("lab", false); }
      this.get("settings").hidden = !open;
      this.get("settings-toggle")?.setAttribute("aria-expanded", String(open));
    }
    dismissOpenPanel() {
      const settings = this.get("settings");
      if (settings && !settings.hidden) { this.closePanel("settings"); return true; }
      if (this.get("grid")?.open) { this.closePanel("grid"); return true; }
      if (this.shell?.classList.contains?.("lab-open")) { this.closePanel("lab"); return true; }
      if (this.result && !this.result.hidden) { this.closePanel("results"); return true; }
      const card = this.get("rider-card");
      if (card?.children?.length && card.style?.display !== "none") { this.cardDismissed = true; card.style.display = "none"; return true; }
      return false;
    }
    setResultsAvailable(available, expanded = false) {
      const button = this.get("results-toggle");
      if (button) { button.hidden = !available; button.setAttribute?.("aria-expanded", String(expanded)); }
    }
    closePanel(key, restoreFocus = true) {
      let opener;
      if (key === "settings") { this.setSettingsOpen(false); opener = this.get("settings-toggle"); }
      else if (key === "grid") { const grid = this.get("grid"); if (grid) { grid.open = false; opener = grid.querySelector?.("summary"); } }
      else if (key === "lab") {
        this.shell?.classList.remove("lab-open"); opener = this.get("lab-toggle");
        opener?.setAttribute("aria-expanded", "false");
      } else if (key === "results") { this.result.hidden = true; this.setResultsAvailable(true); opener = this.get("results-toggle") || this.get("launch"); }
      if (restoreFocus) opener?.focus?.();
    }
    addPanelClose(parent, key, label) {
      const bar = document.createElement("div"); bar.className = "gp-panel-closebar";
      const close = document.createElement("button"); close.type = "button"; close.className = "gp-panel-close";
      close.textContent = "×"; close.title = label; close.setAttribute("aria-label", label);
      const title = document.createElement("strong"); title.textContent = ({settings:"Réglages spectacle",grid:"Grille des pilotes",lab:"Laboratoire",results:"Résultats"})[key] || label;
      close.addEventListener("click", () => this.closePanel(key)); bar.appendChild(title); bar.appendChild(close);
      // Preserve the native summary as the first child of details.
      const anchor = parent.tagName?.toLowerCase() === "details" ? parent.querySelector("summary")?.nextSibling : parent.firstChild;
      parent.insertBefore(bar, anchor || null);
      return close;
    }
    showValidation() {
      const run = this.validationRun; this.result.hidden = false; this.result.replaceChildren();
      this.result.dataset.kind = "validation";
      this.setResultsAvailable(true, true);
      this.addPanelClose(this.result, "results", "Fermer les résultats de validation");
      const title = document.createElement("h2"); title.textContent = "MODEL VALIDATED — 3 SUCCESSFUL LAPS"; this.result.appendChild(title);
      const info = document.createElement("p"); info.textContent = `Génération ${run.generation} · Agent ${run.source.id + 1} · fitness ${run.fitness.toFixed(2)} · ${run.timestamp} · ${run.laps.map(lap => timeText(lap.time)).join(" / ")}`; this.result.appendChild(info);
      if (!run.frames.length) return;
      this.button(this.result, "Revoir validation complète", () => this.watchReplay(true));
      this.button(this.result, "Exporter trajectoire validée JSON", () => {
        try {
          ModelFiles.download(JSON.stringify({
            type: "neural-gp-validation-trajectory", version: 1,
            timestamp: run.timestamp, generation: run.generation, fitness: run.fitness, laps: run.laps,
            trackWidth: run.circuit.trackWidth, frames: run.frames
          }), `validation-generation-${run.generation}`);
          this.notice.textContent = "Export trajectoire demandé au navigateur. Ce fichier d’analyse n’est pas un modèle rechargeable.";
        } catch (error) { this.notice.textContent = `Export trajectoire impossible : ${error.message}`; }
      });
    }
    button(parent, text, action) {
      const button = document.createElement("button"); button.textContent = text; button.addEventListener("click", () => { this.audio.tone("ui", 550); action(); }); parent.appendChild(button);
    }
    watchReplay(validation = false) {
      if (!this.settings.replay) { this.notice.textContent = "Replay désactivé dans les réglages."; return; }
      const frames = validation ? this.validationRun?.frames : this.race?.replay.save() || this.validationRun?.frames;
      if (!frames?.length) { this.notice.textContent = "Aucune trajectoire enregistrée."; return; }
      const useValidation = validation || !this.race;
      if (useValidation) this.camera.selected = this.validationRun.source.id;
      this.commentary?.suspend?.(); this.audio.update([], "", 0, false);
      this.playback = { frames, elapsed: 0, speed: 0.5, validation: useValidation };
      document.getElementById("controls").inert = true; this.get("live").hidden = false;
      this.ghosts.clear(); this.lastPanel = -Infinity;
    }
    stopReplay() {
      this.playback = null; this.ghosts.clear(); this.lastPanel = -Infinity;
      this.get("live").hidden = true; document.getElementById("controls").inert = !!this.race;
    }
    draw(delta, paused) {
      const race = this.race;
      if (!race && !this.playback) { this.hud.hidden = true; return false; }
      this.trainingHud.hidden = true;
      delta = Math.min(100, Math.max(0, Number(delta) || 1000 / 60));
      if (!paused) {
        this.clock += delta;
        if (race && !this.playback) {
          race.recordReplay = this.settings.replay;
          race.advancePresentation(delta);
          if (race.phase === "RACE") {
            this.accumulator = Math.min(100, (this.accumulator || 0) + delta);
            while (this.accumulator >= 1000 / 60 - 1e-6) { race.step(); this.accumulator -= 1000 / 60; }
          } else this.accumulator = 0;
        }
        if (this.playback) {
          this.playback.elapsed += delta * this.playback.speed;
          const frames = this.playback.frames;
          if (this.playback.elapsed > frames[frames.length - 1].time - frames[0].time + 1200) this.stopReplay();
        }
        if (!this.playback) this.commentary.tick(this.clock);
      }
      if (!race && !this.playback) { this.hud.hidden = true; return false; }
      const circuit = this.playback?.validation ? this.validationRun.circuit : race?.circuit || this.host.simulation().circuit;
      const bikes = this.playback?.validation ? [this.validationRun.source] : race?.population || [this.validationRun.source];
      const leader = race?.standings()[0] || bikes[0];
      const frame = this.playback ? ReplaySystem.prototype.frameAt.call({}, this.playback.elapsed, this.playback.frames) : null;
      const cameraBikes = frame ? frame.bikes.map(bike => ({ id: bike.id, pos: { x: bike.x, y: bike.y } })) : bikes;
      this.camera.update(cameraBikes, cameraBikes.find(bike => bike.id === leader.id) || cameraBikes[0], circuit, race?.time || 0, delta, this.settings.reduced);
      background(35, 51, 47); push(); translate(460, 360); scale(this.camera.zoom);
      const shake = !this.settings.reduced && race?.time < 500 && race?.phase === "RACE" ? Math.sin(this.clock / 23) * this.settings.shake * 2 : 0;
      translate(-this.camera.x + shake, -this.camera.y);
      if (this.venue && this.settings.details && !this.playback?.validation) { this.venue.show(this.settings.crowd); this.venue.showTrackUnderlay(circuit); }
      circuit.draw(this.mode === "debug");
      if (this.venue && this.settings.details && !this.playback?.validation) this.venue.showTrackEdges(circuit);
      if (race && !this.playback?.validation) for (const obstacle of race.obstacles) obstacle.show();
      this.drawObstaclePreview();
      if (this.settings.heat && race) this.drawHeat(race);
      if (this.settings.line) this.drawRecordedLine(frame ? this.playback.frames : race?.replay.frames || [], this.camera.selected);
      if (frame) {
        for (const snapshot of frame.bikes) {
          let ghost = this.ghosts.get(snapshot.id);
          if (!ghost) {
            const source = bikes.find(bike => bike.id === snapshot.id) || bikes[0];
            ghost = new ReplayMotorcycle(source.genome, circuit, source.scenario, source.parameters, snapshot.id); ghost.identity = source.identity; this.ghosts.set(snapshot.id, ghost);
          }
          ghost.displaySnapshot(snapshot, snapshot.id === this.camera.selected);
        }
      } else for (const bike of bikes) {
        if (this.settings.shadows) { noStroke(); fill(0, 55); ellipse(bike.pos.x + 3, bike.pos.y + 3, 16, 9); }
        bike.show(this.mode === "debug" && bike.id === this.camera.selected, bike === leader);
        noStroke(); fill("#ffffff"); textSize(9); textAlign(CENTER, CENTER); text(String(bike.identity?.number ?? bike.id + 1), bike.pos.x, bike.pos.y - 10);
      }
      if (race && !this.playback?.validation) {
        const snapshots = frame ? frame.drones || [] : race.drones.map(drone => drone.snapshot());
        for (const snapshot of snapshots) race.drones.find(drone => drone.id === snapshot.id)?.show(snapshot, frame?.time ?? race.time);
      }
      if (race && this.settings.details && !this.playback?.validation) this.venue.showActivity(race, this.clock, this.settings);
      if (race?.phase === "FLYOVER") {
        const points = circuit.centerline.slice(0, Math.ceil(circuit.centerline.length * race.phaseTime / Math.max(1, race.timing.flyover)));
        stroke("#a9f7c5"); strokeWeight(3); noFill(); beginShape(); points.forEach(point => vertex(point.x, point.y)); endShape();
      }
      pop();
      if (this.settings.hud) this.drawMiniMap(circuit, cameraBikes);
      if (!paused && this.settings.particles && !this.settings.reduced) this.drawParticles(delta);
      const phase = race?.phase || "VALIDATION REPLAY";
      const audioFocus = ["FOLLOW_LEADER", "CINEMATIC"].includes(this.camera.mode) ? leader?.id : this.camera.selected;
      this.audio.update(bikes, phase, this.clock, !paused && !!race && !this.playback, audioFocus, this.settings.crowd);
      this.updateAudioStatus();
      this.renderPanels(paused, frame);
      return true;
    }
    drawHeat(race) {
      noStroke();
      for (const [key, count] of race.heat) { const [x, y] = key.split(",").map(Number); fill(255, 160, 45, Math.min(120, count * 2)); rect(x * 12, y * 12, 12, 12); }
      fill(255, 50, 70, 170); for (const point of race.crashes) ellipse(point.x, point.y, 16, 16);
    }
    drawRecordedLine(frames, selected) {
      stroke("#e6bc63"); strokeWeight(1); noFill(); beginShape();
      for (const frame of frames) { const bike = frame.bikes.find(bike => bike.id === selected); if (bike) vertex(bike.x, bike.y); } endShape();
    }
    drawMiniMap(circuit, bikes) {
      const target = this.get("minimap");
      if (!target) return;
      // Presentation in the reserved footer, never painted over world pixels.
      const points = circuit.centerline.map(point => `${Number(point.x)},${Number(point.y)}`).join(" ");
      const markers = bikes.map(bike => `<circle cx="${Number(bike.pos.x)}" cy="${Number(bike.pos.y)}" r="10" fill="${bike.id === this.camera.selected ? "#ffe080" : "#f3f4ed"}"/>`).join("");
      target.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-30 -20 980 760" width="100%" height="100%" aria-hidden="true"><polygon points="${points}" fill="none" stroke="#8dafa4" stroke-width="8"/>${markers}</svg>`;
    }
    drawParticles(delta) {
      this.particles = this.particles.filter(p => p.age < 2200);
      noStroke(); for (const p of this.particles) {
        p.age += delta; fill(p.dust ? "#c3ad84" : `hsl(${p.hue % 360},80%,65%)`);
        const x = p.dust ? (p.x - this.camera.x) * this.camera.zoom + 460 : p.x;
        const y = p.dust ? (p.y - this.camera.y) * this.camera.zoom + 360 : p.y;
        rect(x + Math.sin(p.age / 200 + p.hue) * (p.dust ? 5 : 25), y + p.age / (p.dust ? 100 : 5), p.dust ? 2 : 4, p.dust ? 2 : 6);
      }
    }
    renderPanels(paused, replayFrame) {
      this.hud.hidden = !this.settings.hud;
      if (this.clock - this.lastPanel < 150 && this.lastPaused === paused) return;
      this.lastPanel = this.clock; this.lastPaused = paused;
      const race = this.race; const phase = race?.phase || "VALIDATION REPLAY";
      const ordered = race?.standings() || [];
      const state = this.get("session-state"); const timer = this.get("session-timer");
      if (state) state.textContent = paused ? "PAUSED" : this.playback ? "REPLAY" : phase;
      if (timer) timer.textContent = `LAP ${Math.min(race?.targetLaps || 3, (ordered[0]?.stats.laps || 0) + 1)} / ${race?.targetLaps || 3}`;
      const broadcast = this.get("broadcast");
      if (!this.broadcastRibbon) {
        this.broadcastRibbon = document.createElement("div");
        this.broadcastRibbon.className = "gp-ribbon";
      }
      this.broadcastRibbon.textContent = `${this.playback ? `REPLAY ${this.playback.speed}×` : phase}  /  LAP ${Math.min(race?.targetLaps || 3, (ordered[0]?.stats.laps || 0) + 1)} OF ${race?.targetLaps || 3}`;
      this.broadcastRibbon.dataset.flag = race?.flags.flag || "GREEN";

      const showTower = ordered.length && ["RACE", "RESULTS", "GRID"].includes(phase);
      if (showTower) {
        if (!this.standingsTower) {
          this.standingsTower = document.createElement("ol");
          this.standingsTower.className = "gp-tower";
        }
        const activeBikes = ordered.slice(0, 8);
        if (!this.towerRows) this.towerRows = [];
        activeBikes.forEach((bike, i) => {
          let row = this.towerRows[i];
          if (!row) {
            row = document.createElement("li");
            const posSpan = document.createElement("span"); posSpan.className = "gp-position";
            const numSpan = document.createElement("span"); numSpan.className = "gp-rider-number";
            const nameSpan = document.createElement("span"); nameSpan.className = "gp-rider-name";
            const gapSpan = document.createElement("span"); gapSpan.className = "gp-rider-gap";
            row.append(posSpan, numSpan, nameSpan, gapSpan);
            const selectAction = (e) => {
              e.stopPropagation();
              e.preventDefault?.();
              const bid = Number(row.dataset.bikeId);
              if (Number.isFinite(bid)) this.selectRider(bid);
            };
            row.addEventListener("pointerdown", selectAction);
            row.addEventListener("click", selectAction);
            row.tabIndex = 0; row.setAttribute?.("role", "button");
            row.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") selectAction(e); });
            row.onclick = selectAction;
            this.towerRows[i] = row;
            this.standingsTower.appendChild(row);
          }
          row.style?.setProperty("--rider-color", bike.identity?.color || "#e33442");
          row.style.cursor = "pointer";
          row.dataset.bikeId = String(bike.id);
          const isSelected = bike.id === (this.cardRiderId ?? this.camera.selected);
          row.dataset.selected = String(isSelected);
          row.title = `Cliquer pour observer ${riderName(bike)} (carte & réseau)`;
          row.setAttribute?.("aria-label", `Observer ${riderName(bike)}`);

          const gap = bike.finished ? "FIN" : bike.dead ? "OUT" : phase === "GRID" ? "GRID" : race.gap(bike) === "LEADER" ? "LEADER" : race.gap(bike);
          const children = row.children || [];
          if (children[0]) children[0].textContent = i + 1;
          if (children[1]) children[1].textContent = bike.identity?.number ?? bike.id + 1;
          if (children[2]) children[2].textContent = bike.identity?.short || `AGENT ${bike.id + 1}`;
          if (children[3]) children[3].textContent = gap;
        });
      }
      if (!broadcast.children?.includes?.(this.broadcastRibbon) || (showTower && !broadcast.children?.includes?.(this.standingsTower))) {
        broadcast.replaceChildren(this.broadcastRibbon);
        if (showTower) broadcast.appendChild(this.standingsTower);
      } else if (!showTower && broadcast.children?.includes?.(this.standingsTower)) {
        broadcast.replaceChildren(this.broadcastRibbon);
      }
      const center = this.get("center");
      const centerKey = `${paused}:${phase}:${race?.lights || 0}:${this.raceToken || 0}:${!!this.playback}`;
      if (this.centerKey !== centerKey) {
        this.centerKey = centerKey; center.replaceChildren();
        const title = document.createElement("h2"); const description = document.createElement("p");
        if (paused) {
          title.textContent = "PAUSE"; description.textContent = "Simulation arrêtée"; center.append(title, description);
          this.button(center, "Reprendre", () => this.setPaused(false));
          this.button(center, "Recommencer course", () => { if (this.startRace()) this.race.begin(); });
          this.button(center, "Réglages", () => this.setSettingsOpen(true));
          this.button(center, "Caméra", () => { this.camera.cycle(); this.get("camera").value = this.camera.mode; });
          this.button(center, "Quitter course", () => this.setMode("training"));
        } else if (["TITLE", "INTRO", "FLYOVER", "GRID", "LIGHTS", "PODIUM"].includes(phase) && !this.playback) {
          title.textContent = { TITLE: "MOTOGP INVITATIONAL", INTRO: "GRAN PREMIO DE ESPAÑA", FLYOVER: "CIRCUITO DE JEREZ", GRID: "STARTING GRID", LIGHTS: "STARTING LIGHTS", PODIUM: "PARC FERMÉ" }[phase];
          description.textContent = phase === "GRID" ? ordered.slice(0, 4).map((bike, i) => `P${i + 1} ${riderName(bike)}`).join(" · ") : "Jerez de la Frontera · España · 4,423 km · 13 virages";
          center.append(title, description);
          if (phase === "TITLE") this.button(center, "Commencer présentation", () => race.begin());
          if (["INTRO", "FLYOVER", "GRID"].includes(phase)) this.button(center, "Passer au départ", () => race.transition("LIGHTS"));
          if (phase === "INTRO") { const info = document.createElement("p"); info.textContent = `${race.targetLaps} LAPS  /  ${race.population.length} RIDERS  /  INVITATIONAL`; center.appendChild(info); }
          if (phase === "LIGHTS") { const lights = document.createElement("div"); lights.className = "gp-lights"; lights.setAttribute("aria-label", `${race.lights} feux rouges sur 5`); lights.textContent = "●".repeat(race.lights) + "○".repeat(5 - race.lights); center.appendChild(lights); }
          if (phase === "PODIUM") {
            const podium = document.createElement("div"); podium.className = "gp-podium";
            const finishers = ordered.filter(bike => bike.finished);
            for (const position of [2, 1, 3]) { const place = document.createElement("div"); place.textContent = `P${position} · ${finishers[position - 1] ? riderName(finishers[position - 1]) : "—"}`; place.dataset.place = position; podium.appendChild(place); }
            center.appendChild(podium);
          }
        }
      }
      const subtitle = this.get("subtitle");
      subtitle.textContent = this.settings.subtitles && this.clock < this.commentary.subtitleUntil ? `RACE CONTROL  /  ${this.commentary.subtitle}` : "";
      const selected = replayFrame?.bikes.find(bike => bike.id === this.camera.selected);
      const bike = race?.population.find(bike => bike.id === this.camera.selected);
      const ahead = bike ? ordered[ordered.indexOf(bike) - 1] : null;
      const card = this.get("rider-card");
      if (card) {
        card.replaceChildren();
        if (this.cardDismissed) {
          card.style.display = "none";
        } else {
          card.style.display = "";
          const focused = (this.cardRiderId !== null && this.cardRiderId !== undefined
            ? race?.population.find(b => b.id === this.cardRiderId)
            : null) || bike || ordered[0];
          if (focused && !this.playback) {
            card.style.setProperty("--rider-color", focused.identity?.color || "#e32638");
            const headerRow = document.createElement("div");
            headerRow.style.cssText = "display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;";
            const eyebrow = document.createElement("div"); eyebrow.className = "gp-card-eyebrow"; eyebrow.textContent = `RIDER FOCUS · #${focused.identity?.number ?? focused.id + 1}`;
            const closeBtn = document.createElement("button"); closeBtn.className = "gp-card-close"; closeBtn.textContent = "✕"; closeBtn.title = "Fermer";
            closeBtn.type = "button"; closeBtn.setAttribute("aria-label", "Fermer la fiche pilote");
            closeBtn.addEventListener("click", e => { e.stopPropagation(); this.cardDismissed = true; card.style.display = "none"; });
            headerRow.append(eyebrow, closeBtn); card.appendChild(headerRow);

            for (const [className, value] of [["gp-card-number", focused.identity?.number ?? focused.id + 1],
            ["gp-card-name", riderName(focused)], ["gp-card-style", focused.identity?.style || "Agent génétique"], ["gp-card-label", `Cerveau : ${focused.identity?.model?.name || "—"}`],
            ["gp-card-label", `LAST LAP  ${timeText(focused.race.lastLap)}`], ["gp-card-label", `BEST LAP  ${timeText(focused.stats.bestLapTime)}`]]) {
              const part = document.createElement("div"); part.className = className; part.textContent = value; card.appendChild(part);
            }
            for (const [label, value] of [["THROTTLE", focused.lastDecision?.throttle || 0], ["BRAKE", focused.lastDecision?.braking || 0]]) {
              const row = document.createElement("div"); row.className = "gp-card-meter";
              const text = document.createElement("span"); text.textContent = `${label}  ${Math.round(value * 100)} %`;
              const bar = document.createElement("meter"); bar.min = 0; bar.max = 1; bar.value = value; bar.setAttribute("aria-label", label);
              row.append(text, bar); card.appendChild(row);
            }
            const physSec = document.createElement("div"); physSec.className = "gp-card-section";
            const physTitle = document.createElement("div"); physTitle.className = "gp-card-section-title"; physTitle.textContent = "Véhicule & Physique";
            const physGrid = document.createElement("div"); physGrid.className = "gp-card-grid";
            physGrid.innerHTML = `<span>Vitesse max: <strong>${focused.maxspeed.toFixed(1)}</strong></span><span>Force max: <strong>${focused.maxforce.toFixed(2)}</strong></span><span>Grip: <strong>${(focused.parameters?.grip ?? 1).toFixed(2)}</strong></span><span>Portée: <strong>${focused.sight.toFixed(0)} px</strong></span>`;
            physSec.append(physTitle, physGrid); card.appendChild(physSec);

            const traits = focused.genome?.traits || {};
            const traitsSec = document.createElement("div"); traitsSec.className = "gp-card-section";
            const traitsTitle = document.createElement("div"); traitsTitle.className = "gp-card-section-title";
            traitsTitle.textContent = `Traits génétiques (${focused.genome?.profile || "standard"})`;
            const traitsGrid = document.createElement("div"); traitsGrid.className = "gp-card-grid";
            traitsGrid.innerHTML = `<span>Anticipation: <strong>${(traits.anticipation ?? 0).toFixed(2)}</strong></span><span>Direction: <strong>${(traits.direction ?? 0).toFixed(2)}</strong></span><span>Freinage: <strong>${(traits.braking ?? 0).toFixed(2)}</strong></span><span>Accélération: <strong>${(traits.acceleration ?? 0).toFixed(2)}</strong></span><span>Agressivité: <strong>${(traits.aggressiveness ?? 0).toFixed(2)}</strong></span><span>Correction: <strong>${(traits.trackCorrection ?? 0).toFixed(2)}</strong></span><span>Virages: <strong>${(traits.cornerSensitivity ?? 0).toFixed(2)}</strong></span>`;
            traitsSec.append(traitsTitle, traitsGrid); card.appendChild(traitsSec);

            const nnSec = document.createElement("div"); nnSec.className = "gp-card-section";
            const nnTitle = document.createElement("div"); nnTitle.className = "gp-card-section-title";
            nnTitle.textContent = "Réseau neuronal (9 → 12 → 2)";
            const weights = focused.genome ? [...focused.genome.weightsIH, ...focused.genome.biasH, ...focused.genome.weightsHO, ...focused.genome.biasO] : [];
            const minW = weights.length ? Math.min(...weights).toFixed(2) : "0";
            const maxW = weights.length ? Math.max(...weights).toFixed(2) : "0";
            const normL2 = weights.length ? Math.hypot(...weights).toFixed(1) : "0";
            const nnGrid = document.createElement("div"); nnGrid.className = "gp-card-grid";
            nnGrid.innerHTML = `<span>Poids/biais: <strong>146</strong></span><span>Norme L2: <strong>${normL2}</strong></span><span>Poids min: <strong>${minW}</strong></span><span>Poids max: <strong>${maxW}</strong></span><span>Steering: <strong>${focused.lastDecision?.steering !== undefined ? focused.lastDecision.steering.toFixed(2) : "0.00"}</strong></span><span>Vitesse courante: <strong>${focused.vel ? focused.vel.mag().toFixed(2) : "0.00"}</strong></span>`;
            nnSec.append(nnTitle, nnGrid); card.appendChild(nnSec);
          }
        }
      }
      const lapState = bike?.finished ? `FINISHED ${timeText(bike.race.finishTime)}` : bike?.dead ? "DNF" : `LAP ${bike?.tracker.started ? timeText(race.time - bike.tracker.lastLapStartedAt) : "—"}`;
      this.get("telemetry").textContent = selected ? `${riderName(race?.population.find(b => b.id === selected.id))} · ${selected.speed.toFixed(2)} px/pas · steering ${selected.steering.toFixed(2)} · throttle ${selected.throttle?.toFixed(2) ?? "—"} · brake ${selected.brake?.toFixed(2) ?? "—"} · capteurs ${selected.sensors.map(n => n.toFixed(0)).join(" / ")}` : bike ? `${bike.identity?.number ?? bike.id + 1}  ${riderName(bike)}   /   ${bike.identity?.style || this.camera.mode}   /   ${lapState}   /   GAP ${ahead ? race.gap(bike, ahead) : "LEADER"}` : "Replay de validation · trajectoire mesurée";
      if (race && ["RESULTS", "PODIUM"].includes(phase) && this.result.dataset.session !== String(this.raceToken)) this.showResults();
    }
    showResults() {
      const race = this.race; this.result.hidden = false; this.result.replaceChildren(); this.result.dataset.session = String(this.raceToken);
      this.result.dataset.kind = "race";
      this.setResultsAvailable(true, true);
      this.addPanelClose(this.result, "results", "Fermer les résultats de course");
      const heading = document.createElement("h2"); heading.textContent = "FINAL CLASSIFICATION"; this.result.appendChild(heading);
      const table = document.createElement("table"); table.innerHTML = "<thead><tr><th>Pos</th><th>Pilote</th><th>Tours</th><th>Temps</th><th>Écart leader</th><th>Meilleur tour</th><th>Statut</th></tr></thead>";
      const body = document.createElement("tbody");
      race.standings().forEach((bike, i) => {
        const row = document.createElement("tr"); for (const value of [i + 1, `${bike.identity?.number ?? bike.id + 1} ${riderName(bike)} · ${bike.identity?.model?.name || "—"} · ${bike.genome.profile}`, bike.stats.laps, timeText(bike.race.finishTime), race.gap(bike), timeText(bike.stats.bestLapTime), bike.finished ? "FINISHED" : `DNF · ${bike.stats.failureReason || "abandon"}`]) { const cell = document.createElement("td"); cell.textContent = value; row.appendChild(cell); } body.appendChild(row);
      }); table.appendChild(body); this.result.appendChild(table);
      const summary = race.summary(); const info = document.createElement("p");
      info.textContent = `Piste/paramètres : ${this.raceModel?.name || "—"} · Vainqueur ${summary.winner === null ? "aucun" : riderName(race.population.find(b => b.id === summary.winner))} · Meilleur tour ${timeText(summary.fastestLap)} · Dépassements max : ${riderName(race.population.find(b => b.id === summary.mostOvertakes))} · Vitesse max ${summary.highestSpeed.toFixed(2)} px/pas · DNF ${summary.dnf} · Finisseurs ${summary.finishers}/${race.population.length} (${(summary.completion * 100).toFixed(0)} %) · Génération ${this.generation} · Fitness ${this.fitness.toFixed(2)}. Course ≠ preuve de validation.`; this.result.appendChild(info);
      this.button(this.result, "Revoir les 10 dernières secondes", () => this.watchReplay());
      this.button(this.result, "Replay 0,25×", () => { this.watchReplay(); if (this.playback) this.playback.speed = 0.25; });
      this.button(this.result, "Podium", () => race.transition("PODIUM"));
      this.button(this.result, "Retour entraînement", () => this.setMode("training"));
      const details = document.createElement("details"); const label = document.createElement("summary");
      label.textContent = "Statistiques des 13 zones de virage schématiques"; details.appendChild(label);
      const cornerTable = document.createElement("table"); cornerTable.innerHTML = "<thead><tr><th>Zone</th><th>Entrées</th><th>V entrée</th><th>V min</th><th>V sortie</th><th>|Steering| moyen</th><th>Échecs</th></tr></thead>";
      const cornerBody = document.createElement("tbody");
      for (const corner of race.analytics.report()) {
        const row = document.createElement("tr");
        for (const value of [corner.turn, corner.entries, corner.entrySpeed?.toFixed(2) ?? "—", corner.minimumSpeed?.toFixed(2) ?? "—", corner.exitSpeed?.toFixed(2) ?? "—", corner.averageSteering?.toFixed(2) ?? "—", corner.failureRate === null ? "—" : `${(corner.failureRate * 100).toFixed(0)} %`]) {
          const cell = document.createElement("td"); cell.textContent = value; row.appendChild(cell);
        }
        cornerBody.appendChild(row);
      }
      cornerTable.appendChild(cornerBody); details.appendChild(cornerTable); this.result.appendChild(details);
      if (this.validationRun) this.button(this.result, "Revoir validation complète", () => this.watchReplay(true));
    }
  }
  root.GrandPrixPresentation = GrandPrixPresentation;
  if (typeof module !== "undefined") module.exports = { GrandPrixPresentation, timeText };
})(typeof globalThis !== "undefined" ? globalThis : this);

