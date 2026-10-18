(function (root) {
  const SLIDERS = root.SimulationConfig.sliders;

  class SimulationUI {
    constructor(container, callbacks) {
      this.container = container;
      this.callbacks = callbacks;
      this.inputs = {};
      this.outputs = {};
      this.checkboxes = {};
      this.build();
    }

    build() {
      this.container.innerHTML = `<h1>MotoGP GA · Jerez</h1><div id="status" class="status">entraînement en cours</div>`;
      const actions = document.createElement("div");
      actions.className = "actions";
      [
        ["toggle", "Démarrer / pause"], ["reset", "Nouvelle population"],
        ["resume", "Reprendre entraînement"],
        ["apply", "Appliquer les réglages"],
        ["validate", "Relancer validation"], ["save", "Sauvegarder meilleur modèle"], ["load", "Charger modèle"],
        ["export", "Exporter JSON"], ["import", "Importer JSON"]
      ].forEach(([key, label]) => {
        const button = document.createElement("button");
        button.textContent = label;
        button.addEventListener("click", () => key === "import" ? this.importInput.click() : this.callbacks[key]());
        actions.appendChild(button);
      });
      this.container.appendChild(actions);
      const feedback = document.createElement("div");
      Object.assign(feedback, { id: "action-feedback", role: "status", ariaLive: "polite", ariaAtomic: "true", hidden: true });
      this.actionFeedback = feedback;
      this.container.appendChild(feedback);
      const storageHint = document.createElement("p");
      storageHint.textContent = "Sauvegarder ajoute le modèle actif sans écraser les précédents. Exporter JSON télécharge uniquement la sauvegarde sélectionnée ; sauvegarder d’abord pour exporter un profil ou un modèle modifié. Charger ou importer impose une nouvelle validation de 3 tours consécutifs.";
      this.container.appendChild(storageHint);
      const nameLabel = document.createElement("label");
      nameLabel.textContent = "Nom personnel — profil du modèle ajouté automatiquement";
      this.modelName = document.createElement("input");
      Object.assign(this.modelName, { type: "text", id: "model-name", maxLength: 80, value: "", placeholder: "Ex. Jerez génération 12" });
      nameLabel.htmlFor = this.modelName.id;
      nameLabel.appendChild(this.modelName);
      this.container.appendChild(nameLabel);
      this.saveProfileInfo = document.createElement("p"); this.saveProfileInfo.id = "model-profile-preview";
      this.saveProfileInfo.textContent = "Le nom et le JSON utiliseront le profil réellement appliqué au modèle.";
      this.container.appendChild(this.saveProfileInfo);
      this.modelName.addEventListener("input", () => { if (this.lastSimulation) this.renderSaveProfile(this.lastSimulation); });
      const modelLabel = document.createElement("label"); modelLabel.textContent = "Modèle local à charger ou exporter";
      this.modelSelect = document.createElement("select"); this.modelSelect.id = "model-select";
      modelLabel.htmlFor = this.modelSelect.id; modelLabel.appendChild(this.modelSelect); this.container.appendChild(modelLabel);
      this.modelInfo = document.createElement("p"); this.container.appendChild(this.modelInfo);
      this.models = [];
      this.modelSelect.addEventListener("change", () => this.showModelInfo());
      this.importInput = document.createElement("input");
      Object.assign(this.importInput, { type: "file", multiple: true, accept: ".json,application/json", hidden: true, id: "model-import" });
      this.importInput.addEventListener("change", async () => {
        const files = Array.from(this.importInput.files || []); this.importInput.value = "";
        for (const file of files) await this.callbacks.import(file);
      });
      this.container.appendChild(this.importInput);
      this.setModels([]);

      const profileLabel = document.createElement("label");
      profileLabel.innerHTML = `<span>Profil de conduite</span>`;
      const select = document.createElement("select");
      [["prudent", "Prudent"], ["balanced", "Équilibré"], ["aggressive", "Agressif"],
       ["lateBraking", "Freinage tardif"], ["smoothLine", "Trajectoire régulière"]].forEach(([value, label]) => {
        const option = document.createElement("option"); option.value = value; option.textContent = label; select.appendChild(option);
      });
      select.value = "balanced";
      profileLabel.appendChild(select); this.profile = select; this.container.appendChild(profileLabel);
      this.profileDescription = document.createElement("p"); this.profileDescription.id = "driving-profile-description";
      this.container.appendChild(this.profileDescription);
      select.addEventListener("change", () => { this.updateProfileDescription(); this.callbacks.profile?.(); }); this.updateProfileDescription();
      const hint = document.createElement("p");
      hint.textContent = "Changer le profil l’applique immédiatement : traits remplacés, poids neuronaux conservés, validation relancée. Sans champion, une nouvelle population est créée. Nouvelle population réinitialise tout l’apprentissage. Autres réglages : Appliquer les réglages, ou prochaine génération.";
      this.container.appendChild(hint);

      const toggles = document.createElement("div");
      toggles.className = "toggles";
      [["sensors", "Afficher capteurs", false], ["checkpoints", "Afficher checkpoints", true], ["bestOnly", "Afficher seulement meilleur", false]].forEach(([key, label, checked]) => {
        const wrapper = document.createElement("label");
        const input = document.createElement("input"); input.type = "checkbox"; input.checked = checked;
        wrapper.append(input, document.createTextNode(label)); toggles.appendChild(wrapper); this.checkboxes[key] = input;
      });
      this.container.appendChild(toggles);

      const details = document.createElement("details");
      details.open = true;
      details.innerHTML = "<summary>Paramètres</summary>";
      SLIDERS.forEach(([key, label, min, max, step, value]) => {
        const wrapper = document.createElement("label");
        const title = document.createElement("span");
        const output = document.createElement("output"); output.value = value;
        title.textContent = label; title.append(" ", output);
        const input = document.createElement("input");
        Object.assign(input, { id: `control-${key}`, type: "range", min, max, step, value });
        wrapper.htmlFor = input.id;
        input.addEventListener("input", () => { output.value = input.value; });
        wrapper.append(title, input); details.appendChild(wrapper); this.inputs[key] = input;
        this.outputs[key] = output;
      });
      this.container.appendChild(details);
      const stats = document.createElement("pre"); stats.id = "stats"; this.container.insertBefore(stats, details); this.stats = stats;
      const laps = document.createElement("div"); laps.id = "validation-stats"; this.container.appendChild(laps); this.laps = laps;
    }

    number(key) { return Number(this.inputs[key].value); }

    notify(message, tone = "info") {
      this.actionFeedback.textContent = message;
      this.actionFeedback.dataset.tone = tone;
      this.actionFeedback.hidden = false;
    }

    setModels(models, selectedId) {
      const previous = this.modelSelect.value;
      this.models = models;
      this.modelSelect.innerHTML = "";
      if (!models.length) {
        const option = document.createElement("option"); option.value = ""; option.textContent = "Aucun modèle local";
        this.modelSelect.appendChild(option);
      }
      models.forEach(model => {
        const option = document.createElement("option"); option.value = model.id;
        option.textContent = `${model.name} · ${model.savedAt || "date inconnue"}`;
        this.modelSelect.appendChild(option);
      });
      this.modelSelect.value = [selectedId, previous].find(id => models.some(model => model.id === id)) || models[models.length - 1]?.id || "";
      this.showModelInfo();
    }

    showModelInfo() {
      const model = this.models.find(entry => entry.id === this.modelSelect.value);
      this.modelInfo.textContent = model
        ? `Profil enregistré : ${ModelStorage.profileInfo(model.genome).label}. Score enregistré : ${Number.isFinite(model.metadata.score) ? model.metadata.score.toFixed(1) : "—"} · ${model.metadata.validated ? "historique de validation enregistré" : "non validé"}. Validation actuelle obligatoire : 3 tours consécutifs réussis.`
        : "Bibliothèque vide. Sauvegarder après une génération évaluée, ou importer un fichier JSON.";
    }

    updateProfileDescription() {
      const info = ModelStorage.profileInfo({ profile: this.profile.value });
      this.profileDescription.textContent = `${info.label} : ${info.description} Changer ce choix applique les traits du profil au modèle ; poids neuronaux conservés, trois nouveaux tours de validation requis. Après entraînement, les traits évoluent.`;
    }

    renderSaveProfile(simulation) {
      this.lastSimulation = simulation;
      if (!simulation.bestGenome) { this.saveProfileInfo.textContent = "Aucun meilleur modèle sauvegardable pour l’instant."; return; }
      const info = ModelStorage.profileInfo(simulation.bestGenome);
      const name = ModelStorage.modelName(this.modelName.value || `Jerez génération ${simulation.generation}`, simulation.bestGenome);
      this.saveProfileInfo.textContent = `Sera sauvegardé : ${name}. Profil du modèle : ${info.label}. Traits et poids actuels enregistrés exactement.`;
    }

    config() {
      return {
        populationSize: this.number("populationSize"),
        mutationRate: this.number("mutationRate"),
        mutationAmplitude: this.number("mutationAmplitude"),
        crossoverRate: this.number("crossoverRate"),
        eliteCount: this.number("eliteCount"),
        scenarioCount: this.number("scenarioCount"),
        trainingGenerations: this.number("trainingGenerations"),
        scenarioSeconds: this.number("scenarioSeconds"),
        seed: this.number("seed"),
        trackWidth: this.number("trackWidth"),
        profile: this.profile.value,
        simulationSpeed: this.number("simulationSpeed"),
        vehicle: {
          maxSpeed: this.number("maxSpeed"), maxForce: this.number("maxForce"),
          acceleration: this.number("acceleration"), brakingPower: this.number("brakingPower"),
          sensorRange: this.number("sensorRange"), noiseLevel: this.number("noiseLevel"), grip: this.number("grip")
        },
        fitnessWeights: {
          checkpoints: this.number("fitCheckpoints"), distance: this.number("fitDistance"),
          progress: this.number("fitProgress"), laps: this.number("fitLaps"), lapTime: this.number("fitLapTime"),
          offTrack: this.number("fitOffTrack"), collision: this.number("fitCollision"),
          wrongWay: this.number("fitWrongWay"), stagnation: this.number("fitStagnation"),
          shortcut: this.number("fitShortcut"), missedCheckpoint: this.number("fitMissed")
        }
      };
    }

    applyConfig(config) {
      config = root.SimulationConfig.normalize(config);
      const fitnessKeys = root.SimulationConfig.fitnessKeys;
      Object.entries(this.inputs).forEach(([key, input]) => {
        const value = key in fitnessKeys ? config.fitnessWeights?.[fitnessKeys[key]] : config[key] ?? config.vehicle?.[key];
        if (!Number.isFinite(value)) return;
        input.value = Math.max(Number(input.min), Math.min(Number(input.max), value));
        this.outputs[key].value = input.value;
      });
      if (config.profile) this.setProfile(config.profile);
      this.updateProfileDescription();
    }

    setProfile(profile) {
      if (!Array.from(this.profile.children).some(option => option.value === profile)) {
        const option = document.createElement("option"); option.value = profile;
        option.textContent = `Personnalisé (${profile})`; option.disabled = true; this.profile.appendChild(option);
      }
      this.profile.value = profile;
    }

    view() {
      return {
        sensors: this.checkboxes.sensors.checked,
        checkpoints: this.checkboxes.checkpoints.checked,
        bestOnly: this.checkboxes.bestOnly.checked
      };
    }

    settingsMessage(simulation) {
      const active = simulation.runConfig;
      const requested = this.config();
      const pending = active && Object.keys(requested).some(key =>
        !["simulationSpeed", "profile"].includes(key) && JSON.stringify(requested[key]) !== JSON.stringify(active[key]));
      const message = !pending ? "Réglages actifs." : simulation.mode === "training"
        ? "Réglages en attente : Appliquer les réglages immédiatement, ou prochaine génération."
        : "Réglages en attente : Appliquer les réglages ou relancer la simulation.";
      return [message,
        pending && simulation.status === "modèle validé" ? "Validation acquise pour les réglages actifs uniquement, pas pour les changements en attente." : "",
        simulation.mode === "validation" ? "Validation : génome figé. Mutation, croisement et fitness servent uniquement à l’entraînement." : "",
        requested.profile !== simulation.profile ? "Profil non appliqué : Appliquer les réglages pour synchroniser le modèle." : ""
      ].filter(Boolean).join("\n");
    }

    render(simulation, paused, message = "") {
      this.renderSaveProfile(simulation);
      const status = this.container.querySelector("#status");
      status.textContent = paused ? `${simulation.status} · pause` : simulation.status;
      status.dataset.state = simulation.status;
      const leader = simulation.leader();
      this.stats.textContent = [
        `Génération : ${simulation.generation}`,
        `Meilleur score : ${simulation.bestScore.toFixed(1)}`,
        `Meilleur tour : ${simulation.bestLap ? (simulation.bestLap / 1000).toFixed(2) + " s" : "—"}`,
        `Tours accomplis : ${leader ? leader.stats.laps : 0}`,
        `Population restante : ${simulation.remaining()}`,
        `Temps simulé du scénario : ${(simulation.simulationTime / 1000).toFixed(1)} s`,
        leader ? `Pilote affiché : ${leader.dead ? "éliminé — " + (leader.stats.failureReason || "échec") : leader.finished ? "tour terminé" : "en course"} · vitesse ${leader.vel.mag().toFixed(2)} px/pas` : "",
        ["modèle validé", "validation échouée"].includes(simulation.status) || simulation.mode === "budget"
          ? "Simulation arrêtée : Démarrer / pause relance ; Reprendre entraînement poursuit l’apprentissage." : "",
        `Scénario : ${simulation.scenarioIndex + 1}/${simulation.scenarios.length}`,
        `Largeur simulée : ${simulation.circuit.trackWidth} px (référence réelle : 11 m)`,
        "Candidats indépendants",
        this.settingsMessage(simulation),
        `Calcul neuronal : ${simulation.computeBackend}`,
        `Calcul TensorFlow : ${simulation.inference.renderer}`,
        simulation.lastGeneration ? `Dernière génération : ${simulation.lastGeneration.completed}/${simulation.lastGeneration.total} tours · ${simulation.lastGeneration.distinctScores} scores distincts` : "",
        simulation.lastGeneration ? `Résultats : ${Object.entries(simulation.lastGeneration.reasons).map(([reason, count]) => `${reason} : ${count}`).join(" · ")}` : "",
        simulation.validation.failure ? `Échec validation : ${simulation.validation.failure}` : "",
        simulation.message,
        message
      ].filter(Boolean).join("\n");
      this.laps.innerHTML = simulation.validationStats.length
        ? `<h2>Validation — trois tours</h2>${simulation.validationStats.map((lap, index) =>
          `<div>Tour ${index + 1} · ${(lap.time / 1000).toFixed(2)} s · sorties ${lap.offTrack} · vitesse moy. ${lap.averageSpeed.toFixed(2)} px/pas · ${lap.scenario}</div>`).join("")}`
        : "";
    }

    showGpuError(message) {
      const status = this.container.querySelector("#status");
      status.textContent = "TensorFlow.js indisponible";
      status.dataset.state = "validation échouée";
      this.stats.textContent = message;
    }
  }

  root.SimulationUI = SimulationUI;
})(typeof globalThis !== "undefined" ? globalThis : this);
