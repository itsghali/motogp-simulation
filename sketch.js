const LIFESPAN = 100000;
const SIGHT = 90;
const MUTATION_RATE = 0.08;

let start;
let circuit;
let simulation;
let controls;
let gpuInference;
let startupError = "";
let paused = false;
let interfaceMessage = "";
let grandPrix;

function reportStorageAction(message, tone = "info") {
  interfaceMessage = message;
  controls.notify(message, tone);
  if (grandPrix?.notice) grandPrix.notice.textContent = message;
}

function storageSimulationReady() {
  if (simulation) return true;
  reportStorageAction(startupError ? `Action impossible : ${startupError}` : "Initialisation GPU en cours. Réessayer après son démarrage.", startupError ? "error" : "info");
  return false;
}

function refreshModelLibrary(selectedId) {
  const models = ModelStorage.listModels(localStorage);
  controls.setModels(models, selectedId);
  grandPrix?.setModels(models, selectedId);
}

function loadStoredModel(saved) {
  if (saved.metadata.config) controls.applyConfig(saved.metadata.config);
  controls.setProfile(saved.genome.profile);
  controls.modelName.value = saved.name;
  controls.updateProfileDescription();
  simulation.updateConfig(controls.config());
  simulation.loadGenome(saved.genome);
  paused = false;
}

function laboratoryReady() {
  if (!storageSimulationReady()) return false;
  if (grandPrix?.race || grandPrix?.playback) {
    reportStorageAction("Revenir en Training avant de modifier l’apprentissage ou charger un modèle.", "warning");
    return false;
  }
  return true;
}

function currentModelMetadata() {
  const laps = simulation.validationStats;
  const validated = simulation.status === "modèle validé" && simulation.validation.status === "modèle validé" &&
    laps.length === 3 && new Set(laps.map(lap => lap.scenario)).size === 3 &&
    laps.every(lap => lap.offTrack === 0 && Number.isFinite(lap.time) && lap.time > 0);
  return {
    generation: simulation.generation, score: simulation.bestScore, circuit: circuit.name,
    config: simulation.runConfig, seed: simulation.seed, validationProtocol: 2, validated,
    validationLaps: validated ? laps : []
  };
}

function applySelectedDrivingProfile() {
  if (!simulation || controls.profile.value === simulation.profile) return false;
  if (grandPrix?.race || grandPrix?.playback) {
    controls.profile.value = simulation.profile;
    controls.updateProfileDescription();
    reportStorageAction("Revenir en Training pour changer le profil du modèle.", "warning");
    return true;
  }
  const profile = controls.profile.value;
  const genome = simulation.bestGenome?.withProfile(profile);
  simulation.updateConfig(controls.config());
  if (genome) simulation.loadGenome(genome);
  else simulation.reset(profile);
  paused = false;
  controls.renderSaveProfile(simulation);
  reportStorageAction(genome
    ? `Profil ${ModelStorage.profileInfo(genome).label} appliqué : traits remplacés, poids neuronaux conservés. Ancienne validation annulée ; 3 nouveaux tours requis. Sauvegarde et export utiliseront ce profil.`
    : `Population ${ModelStorage.profileInfo({ profile }).label} créée : profil appliqué immédiatement.`, "success");
  return true;
}

function setup() {
  const canvas = createCanvas(920, 720);
  canvas.parent("canvas-container");
  frameRate(60);
  circuit = new Circuit(width, height, 44);
  const pose = circuit.startPose();
  start = createVector(pose.position.x, pose.position.y);

  controls = new SimulationUI(document.getElementById("controls"), {
    profile: () => applySelectedDrivingProfile(),
    toggle: () => {
      if (!storageSimulationReady()) return;
      if (grandPrix?.race || grandPrix?.playback) { grandPrix.setPaused(!paused); return; }
      if (simulation.mode === "budget" || ["modèle validé", "validation échouée"].includes(simulation.status)) {
        simulation.updateConfig(controls.config());
        if (simulation.status === "modèle validé") simulation.startValidation();
        else simulation.resumeTraining();
        paused = false;
        reportStorageAction("Simulation relancée.", "success");
      } else {
        paused = !paused;
        reportStorageAction(paused ? "Simulation en pause." : "Simulation reprise.");
      }
    },
    apply: () => {
      if (!laboratoryReady()) return;
      if (applySelectedDrivingProfile()) return;
      simulation.updateConfig(controls.config());
      if (simulation.mode === "validation") {
        simulation.startValidation();
        interfaceMessage = "Réglages appliqués ; validation remise à zéro. Génome inchangé : 3 nouveaux tours consécutifs requis. Mutation/croisement/fitness : uniquement en entraînement.";
      } else {
        simulation.resumeTraining(true);
        interfaceMessage = "Réglages appliqués ; essais d’entraînement relancés, génomes conservés.";
      }
      reportStorageAction(interfaceMessage, "success");
    },
    reset: () => {
      if (!laboratoryReady()) return;
      if (!Object.prototype.hasOwnProperty.call(DRIVING_PROFILES, controls.profile.value)) {
        reportStorageAction("Profil personnalisé sans préréglage : choisir un profil connu avant Nouvelle population.", "warning");
        return;
      }
      simulation.updateConfig(controls.config());
      simulation.reset(controls.profile.value);
      paused = false;
      reportStorageAction("Nouvelle population créée.", "success");
    },
    validate: () => {
      if (!laboratoryReady()) return;
      simulation.updateConfig(controls.config());
      const started = simulation.startValidation();
      reportStorageAction(started ? "Validation relancée." : "Aucun meilleur modèle disponible.", started ? "success" : "warning");
      if (started) paused = false;
    },
    resume: () => {
      if (!laboratoryReady()) return;
      simulation.updateConfig(controls.config());
      const resumed = simulation.resumeTraining();
      reportStorageAction(resumed || paused ? "Entraînement repris." : "Entraînement déjà actif.", "success");
      paused = false;
    },
    save: () => {
      if (!storageSimulationReady()) return;
      if (controls.profile.value !== simulation.profile) {
        applySelectedDrivingProfile();
        if (controls.profile.value !== simulation.profile) return;
      }
      if (!simulation.bestGenome) {
        reportStorageAction("Aucun meilleur modèle disponible : attendre la fin de la première génération évaluée avant de sauvegarder.", "warning");
        return;
      }
      try {
        const saved = ModelStorage.saveModel(localStorage, simulation.bestGenome, currentModelMetadata(),
          controls.modelName.value || `Jerez génération ${simulation.generation}`);
        controls.modelName.value = saved.name;
        refreshModelLibrary(saved.id);
        controls.renderSaveProfile(simulation);
        reportStorageAction(`Modèle « ${saved.name} » sauvegardé sans écraser les autres. Profil enregistré : ${saved.metadata.profileLabel}. Nom harmonisé avec le génome ; Exporter JSON conserve ce profil.`, "success");
      } catch (error) {
        reportStorageAction(`Sauvegarde impossible : ${error.message}`, "error");
      }
    },
    load: () => {
      if (!laboratoryReady()) return;
      try {
        const saved = controls.modelSelect.value ? ModelStorage.loadModel(localStorage, controls.modelSelect.value) : null;
        if (!saved) {
          reportStorageAction("Aucun modèle sauvegardé à cette adresse. Utiliser le même navigateur, la même adresse et le même port que lors de la sauvegarde.", "warning");
          return;
        }
        loadStoredModel(saved);
        reportStorageAction("Modèle chargé ; génome et réglages restaurés, validation des trois tours lancée.", "success");
      } catch (error) {
        reportStorageAction(`Chargement impossible : ${error.message}`, "error");
      }
    },
    export: () => {
      try {
        const saved = controls.modelSelect.value ? ModelStorage.loadModel(localStorage, controls.modelSelect.value) : null;
        if (!saved) throw new Error("Sélectionner un modèle local à exporter");
        ModelFiles.download(ModelStorage.exportModel(localStorage, saved.id), saved.name);
        reportStorageAction(`Export JSON de « ${saved.name} » demandé au navigateur.`, "success");
      } catch (error) { reportStorageAction(`Export impossible : ${error.message}`, "error"); }
    },
    import: async file => {
      try {
        const text = await ModelFiles.read(file);
        if (text === null) return;
        const saved = ModelStorage.importModel(localStorage, text, file.name.replace(/\.json$/i, ""));
        refreshModelLibrary(saved.id);
        if (grandPrix?.race || grandPrix?.playback) {
          reportStorageAction(`Modèle « ${saved.name} » importé et sélectionné pour la prochaine course. Course actuelle conservée.`, "success");
        } else if (simulation) {
          loadStoredModel(ModelStorage.loadModel(localStorage, saved.id));
          reportStorageAction(`Modèle « ${saved.name} » importé ; validation des 3 tours lancée. Statut du fichier non reconnu comme preuve.`, "success");
        } else reportStorageAction("Modèle importé dans la bibliothèque, non validé. Charger après initialisation du GPU pour vérifier 3 tours.", "warning");
      } catch (error) { reportStorageAction(`Import impossible : ${error.message}`, "error"); }
    }
  });
  try { refreshModelLibrary(); }
  catch (error) { reportStorageAction(`Bibliothèque indisponible : ${error.message}`, "error"); }
  if (typeof GrandPrixPresentation !== "undefined") {
    grandPrix = new GrandPrixPresentation(document.getElementById("canvas-container"), {
      simulation: () => simulation, controls: () => controls,
      raceModels: () => ModelStorage.listModels(localStorage),
      raceModel: id => id ? ModelStorage.loadModel(localStorage, id) : null,
      importModel: () => controls.importInput.click(),
      clearModels: () => { const count = ModelStorage.clearModels(localStorage); refreshModelLibrary(); return count; },
      restoreModels: () => { const count = ModelStorage.restoreModels(localStorage); refreshModelLibrary(); return count; },
      hasModelRecovery: () => ModelStorage.hasRecovery(localStorage),
      recoverSavedModels: () => { const count = ModelStorage.recoverSavedModels(localStorage); refreshModelLibrary(); return count; },
      savedModelRecoveryCount: () => ModelStorage.savedModelRecoveryCount(localStorage),
      pause: value => { paused = value; }, isPaused: () => paused
    });
  }
  initializeGpuSimulation();
}

async function initializeGpuSimulation() {
  try {
    gpuInference = new GPUInferenceEngine(typeof tf === "undefined" ? null : tf);
    await gpuInference.initialize();
    simulation = new LearningSimulation(circuit, controls.config(), gpuInference);
  } catch (error) {
    startupError = error.message;
    controls.showGpuError(startupError);
  }
}

function draw() {
  if (!simulation) {
    background(13, 18, 24);
    noStroke(); fill(startupError ? "#fda4af" : "#7dd3fc"); textSize(20); textAlign(CENTER, CENTER);
    text(startupError ? "TensorFlow.js indisponible — diagnostic à droite" : "Initialisation TensorFlow.js…", width / 2, height / 2);
    return;
  }
  grandPrix?.syncValidation?.(simulation);
  if (grandPrix?.draw(typeof deltaTime === "undefined" ? 1000 / 60 : deltaTime, paused)) return;
  const config = controls.config();
  simulation.updateConfig(config);
  if (!paused) {
    for (let cycle = 0; cycle < config.simulationSpeed; cycle++) {
      simulation.step();
      grandPrix?.recordValidation(simulation);
    }
  }

  background(13, 18, 24);
  grandPrix?.paintTraining(simulation);
  circuit.draw(controls.view().checkpoints);
  grandPrix?.paintTrainingEdges(simulation);
  const leader = simulation.leader();
  for (const motorcycle of simulation.population) {
    if (simulation.mode === "training" && (motorcycle.dead || motorcycle.finished)) continue;
    if (controls.view().bestOnly && motorcycle !== leader) continue;
    motorcycle.show(controls.view().sensors && motorcycle === leader, motorcycle === leader);
  }
  if (!grandPrix) drawTrackLabel();
  grandPrix?.updateTraining(simulation, paused);
  controls.render(simulation, paused, interfaceMessage);
}

function drawTrackLabel() {
  noStroke(); fill(255, 225); textSize(14); textAlign(LEFT, TOP);
  text("Circuito de Jerez – Ángel Nieto · 4,423 km · 11 m · 13 virages · sens horaire", 14, 12);
  textSize(11); fill(190);
  text("Le pilote reçoit uniquement ses 7 capteurs, sa vitesse et sa commande précédente.", 14, 32);
}
