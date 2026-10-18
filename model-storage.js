(function (root) {
  const configuration = root.SimulationConfig || (typeof require !== "undefined" ? require("./configuration.js") : null);
  const STORAGE_KEY = "jerez-motogp-ga-best-genome-v1";
  const LIBRARY_KEY = "jerez-motogp-ga-model-library-v1";
  const MAX_FILE_BYTES = 2 * 1024 * 1024;
  const PROFILE_DETAILS = Object.freeze({
    prudent: { label: "Prudent", description: "Anticipation forte, freinage précoce, accélération et agressivité faibles." },
    balanced: { label: "Équilibré", description: "Compromis entre anticipation, direction, freinage et accélération." },
    aggressive: { label: "Agressif", description: "Accélération et agressivité fortes, direction vive, freinage plus tardif." },
    lateBraking: { label: "Freinage tardif", description: "Freinage déclenché plus tard, accélération et agressivité fortes." },
    smoothLine: { label: "Trajectoire régulière", description: "Anticipation et correction vers la piste fortes, direction modérée, agressivité réduite." }
  });

  function profileInfo(genome) {
    const id = typeof genome?.profile === "string" ? genome.profile : "custom";
    const definition = Object.prototype.hasOwnProperty.call(PROFILE_DETAILS, id) ? PROFILE_DETAILS[id] :
      { label: "Personnalisé", description: "Profil importé personnalisé ; consulter les traits enregistrés." };
    return { id, ...definition, traits: { ...(genome?.traits || {}) } };
  }

  function modelName(name, genome) {
    const isGp = typeof name === "string" && /^gp[\s–—_-]/i.test(name.trim());
    const cleanPrefix = isGp ? "gp-" : "";
    const unprefixed = isGp ? name.trim().replace(/^gp[\s–—_-]+/i, "") : name;
    const label = profileInfo(genome).label;
    const requested = typeof unprefixed === "string" && unprefixed.trim() ? unprefixed.trim() : "Jerez";
    const stem = requested.replace(/(?<![\p{L}\p{N}])(?:freinage[\s_-]+tardif|trajectoire[\s_-]+r[ée]guli[èe]re|[ée]quilibr[ée]|prudent|balanced|ag{1,2}ressif|aggressive|lateBraking|smoothLine|personnalis[ée])(?![\p{L}\p{N}])/giu, "")
      .replace(/^[\s—–\-_[\]:]+|[\s—–\-_[\]:]+$/g, "").replace(/\s{2,}/g, " ").trim() || "Jerez";
    return `${cleanPrefix}${label} — ${stem.slice(0, 80 - label.length - 3 - cleanPrefix.length)}`;
  }

  function namedModel(payload, id, name) {
    const checked = decode(payload); const canonicalName = modelName(name, checked.genome);
    if (typeof name === "string" && name.trim() && canonicalName !== name.trim()) {
      checked.metadata = { ...checked.metadata, sourceName: checked.metadata.sourceName || cleanName(name) };
    }
    return { ...checked, id, name: canonicalName };
  }

  function decode(payload) {
    if (!payload || ![1, 2].includes(payload.version) || !payload.genome) throw new Error("Sauvegarde incompatible");
    const genome = root.Genome.fromJSON(payload.genome);
    if (typeof payload.genome.profile !== "string" || !payload.genome.profile.trim()) genome.profile = "custom";
    const supplied = payload.metadata && typeof payload.metadata === "object" && !Array.isArray(payload.metadata) ? payload.metadata : {};
    const info = profileInfo(genome);
    const metadata = { ...supplied, profile: info.id, profileLabel: info.label, profileTraits: info.traits };
    if (supplied.config !== undefined) {
      if (!supplied.config || typeof supplied.config !== "object" || Array.isArray(supplied.config)) throw new Error("Configuration invalide");
      metadata.config = configuration.normalize({ ...supplied.config, profile: info.id });
    }
    return { version: 2, savedAt: typeof payload.savedAt === "string" ? payload.savedAt : "", metadata, genome: genome.toJSON() };
  }

  function readLibrary(storage) {
    const raw = storage.getItem(LIBRARY_KEY);
    if (!raw) {
      const legacy = storage.getItem(STORAGE_KEY);
      return legacy ? [namedModel(JSON.parse(legacy), "legacy", "Ancienne sauvegarde")] : [];
    }
    const library = JSON.parse(raw);
    if (library.version !== 1 || !Array.isArray(library.models)) throw new Error("Bibliothèque incompatible");
    const ids = new Set();
    return library.models.map(model => {
      if (typeof model.id !== "string" || !model.id || ids.has(model.id)) throw new Error("Identifiant de modèle invalide");
      ids.add(model.id);
      return namedModel(model, model.id, model.name);
    });
  }

  function cleanName(name) { return typeof name === "string" && name.trim() ? name.trim().slice(0, 80) : "Modèle sans nom"; }

  function addModel(storage, payload, name) {
    const models = readLibrary(storage);
    let suffix = 1;
    const stamp = Date.now();
    while (models.some(model => model.id === `model-${stamp}-${suffix}`)) suffix++;
    const model = namedModel(payload, `model-${stamp}-${suffix}`, name);
    const rawLibrary = storage.getItem(LIBRARY_KEY);
    const existing = rawLibrary ? JSON.parse(rawLibrary).models : models;
    storage.setItem(LIBRARY_KEY, JSON.stringify({ version: 1, models: [...existing, model] }));
    return model;
  }

  function saveModel(storage, genome, metadata = {}, name) {
    return addModel(storage, { version: 2, savedAt: new Date().toISOString(), metadata, genome: genome.toJSON() }, name);
  }

  function loadModel(storage, id) {
    const models = readLibrary(storage);
    const model = id ? models.find(entry => entry.id === id) : models[models.length - 1];
    if (!model) return null;
    return { ...model, genome: root.Genome.fromJSON(model.genome) };
  }

  function exportModel(storage, id) {
    const model = loadModel(storage, id);
    if (!model) throw new Error("Sélectionner un modèle à exporter");
    return JSON.stringify({ format: "jerez-motogp-model", ...model, genome: model.genome.toJSON() }, null, 2);
  }

  function importModel(storage, text, fallbackName) {
    if (typeof text !== "string" || text.length > MAX_FILE_BYTES) throw new Error("Fichier JSON trop volumineux (2 Mo maximum)");
    const payload = JSON.parse(text);
    const checked = decode(payload);
    // Un fichier externe n'est jamais une preuve de validation locale.
    checked.metadata = { ...checked.metadata, validated: false, validationLaps: [], imported: true };
    return addModel(storage, checked, payload.name || fallbackName);
  }

  const RECOVERY_KEY = `${LIBRARY_KEY}-recovery`;

  function clearModels(storage) {
    const models = readLibrary(storage);
    if (!models.length) return 0;
    const raw = storage.getItem(LIBRARY_KEY) || JSON.stringify({ version: 1, models });
    let suffix = 1;
    const prefix = `${RECOVERY_KEY}-${Date.now()}`;
    while (storage.getItem(`${prefix}-${suffix}`)) suffix++;
    const archiveKey = `${prefix}-${suffix}`;
    // Archive first: quota errors must never destroy the active library.
    storage.setItem(archiveKey, raw);
    storage.setItem(RECOVERY_KEY, archiveKey);
    // An explicit empty library prevents legacy saves from reappearing.
    storage.setItem(LIBRARY_KEY, JSON.stringify({ version: 1, models: [] }));
    return models.length;
  }

  function hasRecovery(storage) {
    const key = storage.getItem(RECOVERY_KEY);
    return !!(key && storage.getItem(key));
  }

  function restoreModels(storage) {
    if (readLibrary(storage).length) throw new Error("Vider la bibliothèque avant de restaurer ; nouveaux modèles conservés.");
    const key = storage.getItem(RECOVERY_KEY);
    const raw = key && storage.getItem(key);
    if (!raw) throw new Error("Aucune bibliothèque à restaurer.");
    const models = readLibrary({ getItem: name => name === LIBRARY_KEY ? raw : null });
    storage.setItem(LIBRARY_KEY, raw);
    return models.length;
  }

  function missingSavedModels(storage) {
    const ids = new Set(readLibrary(storage).map(model => model.id));
    const keys = new Set([storage.getItem(RECOVERY_KEY)]);
    if (typeof storage.key === "function") for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key?.startsWith(`${RECOVERY_KEY}-`)) keys.add(key);
    }
    const recovered = [];
    for (const key of [...keys].filter(Boolean).sort().reverse()) {
      const raw = storage.getItem(key);
      if (!raw) continue;
      // Validate before writing, but retain the archived entries byte-for-byte in value.
      readLibrary({ getItem: name => name === LIBRARY_KEY ? raw : null });
      for (const model of JSON.parse(raw).models) {
        if (!model.metadata?.imported && !ids.has(model.id)) { ids.add(model.id); recovered.push(model); }
      }
    }
    return recovered;
  }

  function recoverSavedModels(storage) {
    const recovered = missingSavedModels(storage);
    if (!recovered.length) return 0;
    const raw = storage.getItem(LIBRARY_KEY);
    const existing = raw ? JSON.parse(raw).models : readLibrary(storage);
    storage.setItem(LIBRARY_KEY, JSON.stringify({ version: 1, models: [...existing, ...recovered] }));
    return recovered.length;
  }

  function saveGenome(storage, genome, metadata = {}) {
    const payload = decode({ version: 2, savedAt: new Date().toISOString(), metadata, genome: genome.toJSON() });
    storage.setItem(STORAGE_KEY, JSON.stringify(payload));
    return payload;
  }

  function loadGenome(storage) {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const payload = JSON.parse(raw);
    const checked = decode(payload);
    return { genome: root.Genome.fromJSON(checked.genome), metadata: checked.metadata, savedAt: checked.savedAt };
  }

  const api = { ModelStorage: { STORAGE_KEY, LIBRARY_KEY, MAX_FILE_BYTES, saveGenome, loadGenome,
    listModels: readLibrary, saveModel, loadModel, exportModel, importModel, profileInfo, modelName,
    clearModels, restoreModels, hasRecovery, recoverSavedModels,
    savedModelRecoveryCount: storage => missingSavedModels(storage).length } };
  Object.assign(root, api);
  if (typeof module !== "undefined") module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
