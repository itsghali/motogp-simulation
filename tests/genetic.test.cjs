const test = require("node:test");
const assert = require("node:assert/strict");
const { SeededRandom } = require("../random.js");
const { Genome, DRIVING_PROFILES } = require("../genome.js");
const { GeneticAlgorithm } = require("../genetic-algorithm.js");
const { GPUInferenceEngine } = require("../gpu-inference.js");

test("profils initialisent des traits distincts", () => {
  const prudent = Genome.random(new SeededRandom(9), "prudent");
  const aggressive = Genome.random(new SeededRandom(9), "aggressive");
  assert.ok(prudent.traits.braking > aggressive.traits.braking);
  assert.ok(aggressive.traits.aggressiveness > prudent.traits.aggressiveness);
  assert.equal(Object.keys(DRIVING_PROFILES).length, 5);
});

test("appliquer un profil copie les sept traits exacts, conserve tous les poids et refuse les profils inconnus", () => {
  const original = Genome.random(new SeededRandom(9));
  const before = original.toJSON();
  for (const [profile, traits] of Object.entries(DRIVING_PROFILES)) {
    const applied = original.withProfile(profile);
    assert.equal(applied.profile, profile);
    assert.deepEqual(Object.values(applied.traits), traits);
    for (const key of ["weightsIH", "biasH", "weightsHO", "biasO"]) {
      assert.deepEqual(applied[key], original[key]); assert.notEqual(applied[key], original[key]);
    }
    assert.notEqual(applied.traits, original.traits);
    assert.deepEqual(original.toJSON(), before);
  }
  for (const profile of ["", "unknown", "__proto__", "constructor"]) assert.throws(() => original.withProfile(profile), /inconnu/);
});

test("croisement prend les deux parents", () => {
  const first = Genome.random(new SeededRandom(1));
  const second = Genome.random(new SeededRandom(2));
  first.weightsIH.fill(-1);
  second.weightsIH.fill(1);
  const child = first.crossover(second, new SeededRandom(5), 1);
  assert.equal(child.weightsIH.includes(-1), true);
  assert.equal(child.weightsIH.includes(1), true);
});

test("mutation reproductible avec graine fixe", () => {
  const base = Genome.random(new SeededRandom(3));
  const first = base.copy().mutate(1, 0.2, new SeededRandom(77));
  const second = base.copy().mutate(1, 0.2, new SeededRandom(77));
  assert.deepEqual(first.toJSON(), second.toJSON());
  assert.notDeepEqual(first.weightsIH, base.weightsIH);
});

test("élitisme préserve exactement les meilleurs", () => {
  const rng = new SeededRandom(11);
  const genomes = Array.from({ length: 6 }, () => Genome.random(rng));
  const evaluated = genomes.map((genome, index) => ({ genome, fitness: index + 1 }));
  const ga = new GeneticAlgorithm({ populationSize: 6, eliteCount: 2, crossoverRate: 1, mutationRate: 1, mutationAmplitude: 1 }, new SeededRandom(12));
  const next = ga.evolve(evaluated);
  assert.deepEqual(next.genomes[0].toJSON(), genomes[5].toJSON());
  assert.deepEqual(next.genomes[1].toJSON(), genomes[4].toJSON());
  assert.equal(next.genomes.length, 6);
});

test("batch GPU compacte tous les poids sans perte", () => {
  const genomes = [Genome.random(new SeededRandom(21)), Genome.random(new SeededRandom(22))];
  const packed = GPUInferenceEngine.packGenomes(genomes);
  assert.equal(packed.weightsIH.length, 2 * 9 * 12);
  assert.equal(packed.biasH.length, 2 * 12);
  assert.equal(packed.weightsHO.length, 2 * 12 * 2);
  assert.equal(packed.biasO.length, 2 * 2);
  assert.deepEqual(packed.weightsIH.slice(0, 9 * 12), genomes[0].weightsIH);
});
