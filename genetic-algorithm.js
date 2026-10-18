(function (root) {
  class GeneticAlgorithm {
    constructor(options, rng) {
      this.options = { ...options };
      this.rng = rng;
    }

    rank(evaluated) {
      return evaluated.slice().sort((a, b) => b.fitness - a.fitness);
    }

    tournament(ranked, size = 4) {
      let winner = ranked[Math.floor(this.rng.next() * ranked.length)];
      for (let i = 1; i < size; i++) {
        const candidate = ranked[Math.floor(this.rng.next() * ranked.length)];
        if (candidate.fitness > winner.fitness) winner = candidate;
      }
      return winner;
    }

    evolve(evaluated) {
      if (!evaluated.length) throw new Error("Population évaluée vide");
      const ranked = this.rank(evaluated);
      const populationSize = this.options.populationSize;
      const eliteCount = Math.max(0, Math.min(this.options.eliteCount, populationSize, ranked.length));
      const next = ranked.slice(0, eliteCount).map(entry => entry.genome.copy());
      while (next.length < populationSize) {
        const first = this.tournament(ranked).genome;
        const second = this.tournament(ranked).genome;
        const child = first.crossover(second, this.rng, this.options.crossoverRate);
        child.mutate(this.options.mutationRate, this.options.mutationAmplitude, this.rng);
        next.push(child);
      }
      return { genomes: next, best: ranked[0], elites: next.slice(0, eliteCount) };
    }
  }

  root.GeneticAlgorithm = GeneticAlgorithm;
  if (typeof module !== "undefined") module.exports = { GeneticAlgorithm };
})(typeof globalThis !== "undefined" ? globalThis : this);
