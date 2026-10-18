(function (root) {
  class ModelFiles {
    static filename(text, name) {
      let stem = name || "modele";
      try {
        const payload = JSON.parse(text);
        if (payload.format === "jerez-motogp-model" && payload.genome && root.ModelStorage.modelName) {
          stem = root.ModelStorage.modelName(payload.name || stem, payload.genome);
        }
      } catch (_) { /* Non-model JSON downloads retain their supplied label. */ }
      const safe = String(stem).normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100) || "modele";
      return `${safe}.json`;
    }
    static download(text, name) {
      const blob = new Blob([text], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = ModelFiles.filename(text, name);
      document.body.appendChild(link);
      try { link.click(); }
      finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
    }

    static async read(file) {
      if (!file) return null;
      if (file.size > root.ModelStorage.MAX_FILE_BYTES) throw new Error("Fichier JSON trop volumineux (2 Mo maximum)");
      return file.text();
    }
  }
  root.ModelFiles = ModelFiles;
  if (typeof module !== "undefined") module.exports = { ModelFiles };
})(typeof globalThis !== "undefined" ? globalThis : this);
