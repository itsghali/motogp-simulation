(function (root) {
  const copy = value => JSON.parse(JSON.stringify(value));

  class LearningSimulation {
    constructor(circuit, config, inferenceEngine) {
      this.circuit = circuit;
      this.config = config;
      this.inference = inferenceEngine;
      this.computeBackend = inferenceEngine.backend;
      this.validation = new ValidationManager(3, 3);
      this.reset(config.profile || "balanced");
    }

    reset(profile) {
      this.seed = this.config.seed || 2027;
      this.scenarioFactory = new ScenarioFactory(this.seed);
      this.rng = new SeededRandom(this.seed);
      this.generation = 1;
      this.trainingBudgetEnd = this.config.trainingGenerations || 200;
      this.bestScore = 0;
      this.bestLap = 0;
      this.bestGenome = null;
      this.trainingBase = null;
      this.lastGeneration = null;
      this.validationStats = [];
      this.validation.reset();
      this.settingsKey = "";
      this.runConfig = null;
      this.message = "";
      this.profile = profile;
      this.genomes = Array.from({ length: this.config.populationSize }, () => Genome.random(this.rng, profile));
      this.startTrainingGeneration();
    }

    updateConfig(config) { this.config = config; }

    applyRunConfig(config = this.config) {
      const next = copy(config);
      if (this.runConfig && next.trainingGenerations !== this.runConfig.trainingGenerations) {
        this.trainingBudgetEnd = this.generation + (next.trainingGenerations || 200) - 1;
      }
      const key = JSON.stringify([next.vehicle, next.fitnessWeights, next.scenarioCount, next.trackWidth, next.seed, next.scenarioSeconds]);
      if (key !== this.settingsKey) {
        this.bestScore = 0;
        this.bestLap = 0;
        this.settingsKey = key;
      }
      this.runConfig = next;
      this.seed = next.seed || 2027;
      this.scenarioFactory = new ScenarioFactory(this.seed);
      this.maxFramesPerScenario = Math.round((next.scenarioSeconds || 120) * 60);
      if (this.circuit.trackWidth !== (next.trackWidth || 44)) this.circuit.setWidth(next.trackWidth || 44);
    }

    startTrainingGeneration() {
      this.applyRunConfig();
      this.mode = "training";
      this.status = "entraînement en cours";
      // Ensemble commun : les champions restent comparables entre générations.
      this.scenarios = this.scenarioFactory.trainingSet(this.runConfig.scenarioCount, this.generation);
      this.results = this.genomes.map(() => []);
      this.scenarioIndex = 0;
      this.spawnPopulation();
    }

    spawnPopulation() {
      this.frame = 0;
      this.simulationTime = 0;
      const activeGenomes = this.mode === "validation" ? [this.bestGenome] : this.genomes;
      this.population = activeGenomes.map((genome, index) => new Motorcycle(
        genome, this.circuit, this.scenarios[this.scenarioIndex], this.runConfig.vehicle, index
      ));
      this.inference.setGenomes(activeGenomes);
      this.validationBaseline = Motorcycle.emptyStats(this.scenarios[this.scenarioIndex].id);
    }

    step() {
      if (this.mode === "budget" || ["modèle validé", "validation échouée"].includes(this.status)) return;
      this.frame++;
      this.simulationTime += 1000 / 60;
      const inputs = this.population.map(bike => bike.dead || bike.finished ? new Array(9).fill(0) : bike.perceive());
      const outputs = this.inference.predict(inputs);
      this.population.forEach((bike, index) => {
        const events = bike.step(this.simulationTime, outputs[index], inputs[index]);
        if (this.mode === "training" && events.some(event => event.type === "lap")) bike.finished = true;
        if (this.mode === "validation") this.handleValidationEvents(bike, events);
      });
      if (this.mode === "validation" && this.status !== "validation en cours") return;
      if (this.frame >= this.maxFramesPerScenario) {
        this.population.filter(bike => !bike.dead && !bike.finished).forEach(bike => bike.fail("temps imparti dépassé"));
      }
      if (this.mode === "validation" && this.population[0].dead) {
        this.status = this.validation.fail(this.population[0].stats.failureReason || "scénario échoué");
        return;
      }
      if (this.population.every(bike => bike.dead || bike.finished)) this.finishScenario();
    }

    handleValidationEvents(bike, events) {
      if (this.status !== "validation en cours") return;
      const invalid = events.find(event => ["wrong-way", "shortcut", "missed-checkpoint", "invalid-lap", "off-track"].includes(event.type));
      if (invalid || bike.dead || bike.offTrackRun > 0) {
        this.status = this.validation.fail(bike.stats.failureReason || invalid?.type || "sortie de piste");
        return;
      }
      if (events.some(event => event.type === "start")) this.validationBaseline = { ...bike.stats };
      const lap = events.find(event => event.type === "lap");
      if (!lap) return;
      const baseline = this.validationBaseline;
      const frames = bike.stats.frames - baseline.frames;
      this.status = this.validation.recordLap({
        valid: true, time: lap.time,
        offTrackFrames: bike.stats.offTrackFrames - baseline.offTrackFrames,
        missedCheckpoints: bike.stats.missedCheckpoints - baseline.missedCheckpoints,
        wrongWay: bike.stats.wrongWay - baseline.wrongWay,
        averageSpeed: frames ? (bike.stats.speedSum - baseline.speedSum) / frames : 0,
        scenario: bike.scenario.id
      });
      this.validationStats = this.validation.laps.slice();
      this.bestLap = this.bestLap ? Math.min(this.bestLap, lap.time) : lap.time;
      if (this.status === "modèle validé") { bike.finished = true; return; }
      // Conditions suivantes à la ligne ; aucune téléportation entre les trois tours.
      this.scenarioIndex++;
      bike.changeScenario(this.scenarios[this.scenarioIndex]);
      this.validationBaseline = { ...bike.stats };
      this.frame = 0;
    }

    finishScenario() {
      if (this.mode === "validation") {
        this.status = this.validation.fail(this.population[0].stats.failureReason || "scénario échoué");
        return;
      }
      this.population.forEach((bike, index) => this.results[index].push(bike.result()));
      this.scenarioIndex++;
      if (this.scenarioIndex < this.scenarios.length) this.spawnPopulation();
      else this.finishGeneration();
    }

    finishGeneration() {
      const evaluated = this.genomes.map((genome, index) => ({
        genome, fitness: Fitness.aggregateScenarioResults(this.results[index], this.runConfig.fitnessWeights), results: this.results[index]
      }));
      // Les scores utilisent les réglages du tour ; les enfants, ceux demandés pour la suite.
      const ga = new GeneticAlgorithm(this.config, this.rng);
      const evolved = ga.evolve(evaluated);
      if (!this.bestGenome || evolved.best.fitness > this.bestScore) {
        this.bestGenome = evolved.best.genome.copy();
        this.bestScore = evolved.best.fitness;
      }
      const allResults = evaluated.flatMap(entry => entry.results);
      const reasons = {};
      allResults.forEach(result => {
        const reason = result.failureReason || (result.laps ? "tour terminé" : "tour incomplet");
        reasons[reason] = (reasons[reason] || 0) + 1;
      });
      this.lastGeneration = {
        generation: this.generation, bestScore: evolved.best.fitness,
        distinctScores: new Set(evaluated.map(entry => entry.fitness.toFixed(8))).size,
        completed: allResults.filter(result => result.laps > 0).length,
        total: allResults.length, reasons
      };
      const lapTimes = allResults.filter(result => result.bestLapTime > 0).map(result => result.bestLapTime);
      if (lapTimes.length) this.bestLap = this.bestLap ? Math.min(this.bestLap, ...lapTimes) : Math.min(...lapTimes);
      const solved = evolved.best.results.every(result => result.laps >= 1 && !result.failed);
      this.genomes = evolved.genomes;
      if (solved) this.startValidation(evolved.best.genome, this.runConfig);
      else if (this.generation >= this.trainingBudgetEnd) {
        this.mode = "budget";
        this.status = "entraînement en pause";
        this.message = "Budget atteint sans réussite complète. Reprendre entraînement conserve le meilleur génome.";
      } else { this.generation++; this.startTrainingGeneration(); }
    }

    startValidation(genome = this.bestGenome, config = this.config) {
      if (!genome) return false;
      this.applyRunConfig(config);
      this.bestGenome = genome.copy();
      this.mode = "validation";
      this.status = "validation en cours";
      this.validation.reset();
      this.validationStats = [];
      this.message = "Trois tours continus ; conditions réservées changées à chaque passage de ligne.";
      this.scenarios = this.scenarioFactory.createSet(3, "validation", 10000);
      this.scenarioIndex = 0;
      this.spawnPopulation();
      return true;
    }

    loadGenome(genome) {
      this.bestScore = 0;
      this.bestLap = 0;
      this.lastGeneration = null;
      this.profile = genome.profile;
      this.genomes = [];
      this.trainingBase = genome.copy();
      this.rng = new SeededRandom(this.config.seed || 2027);
      this.startValidation(genome);
    }

    resumeTraining(restartCurrent = false) {
      if (this.mode === "training" && !restartCurrent) return false;
      this.validation.reset();
      this.validationStats = [];
      this.genomes = Array.from({ length: this.config.populationSize }, (_, index) => {
        if (index === 0 && this.bestGenome) return this.bestGenome.copy();
        if (this.trainingBase) return this.trainingBase.copy().mutate(
          this.config.mutationRate, this.config.mutationAmplitude, this.rng
        );
        if (this.genomes[index]) return this.genomes[index].copy();
        return (this.bestGenome || Genome.random(this.rng, this.profile)).copy().mutate(
          this.config.mutationRate, this.config.mutationAmplitude, this.rng
        );
      });
      this.trainingBase = null;
      if (this.mode !== "training") this.generation++;
      this.trainingBudgetEnd = this.generation + (this.config.trainingGenerations || 200) - 1;
      this.message = "Apprentissage repris depuis la population conservée.";
      this.startTrainingGeneration();
      return true;
    }

    remaining() { return this.population.filter(bike => !bike.dead && !bike.finished).length; }

    leader() {
      const active = this.population.filter(bike => !bike.dead && !bike.finished);
      return (active.length ? active : this.population).slice().sort((a, b) => b.stats.laps - a.stats.laps ||
        b.stats.checkpoints - a.stats.checkpoints || b.stats.distanceOnTrack - a.stats.distanceOnTrack)[0] || null;
    }
  }

  root.LearningSimulation = LearningSimulation;
  if (typeof module !== "undefined") module.exports = { LearningSimulation };
})(typeof globalThis !== "undefined" ? globalThis : this);
