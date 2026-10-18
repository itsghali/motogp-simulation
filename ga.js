
// Fonctions pour le calcul génétique
// On va créer une nouvelle génération de voitures
function nextGeneration() {
    console.log('next generation');
    
    // On calcule la fitness de chaque voiture: on regarde
    // combien de checkpoints elle a passé
    calculateFitnessForAllCars();

    for (let i = 0; i < TOTAL; i++) {
      // Pour la mutation, on choisit un parent au hasard
      // population est le tableau des voitures "vivantes", on
      // le remplit avec des voitures issues de la génération précédente
      // et choisies parmis les meilleurs, avec de l'aléatoire et 
      // des mutations possibles (c'est fait dans pickOne())
      population[i] = pickOne();
    }

    // On vide le tableau des voitures mortes
    for (let i = 0; i < TOTAL; i++) {
      savedVehicles[i].dispose();
    }
    savedVehicles = [];
  }
  
  // On choisit un parent au hasard
  function pickOne() {
    let index = 0;

    // Algorithme de la roulette
    // On tire au hasard une voiture parmis les meilleures,
    // mais avec une probabilité proportionnelle à la fitness
    // la voiture qui est allée le plus loin a plus de chances
    // d'être choisie que les autres
    // On parcourt le tableau des voitures en enlevant
    // la fitness à r et on s'arrête dès que r <= 0;
    // la valeur de index est le véhicule choisi
    let r = random(1);
    while (r > 0) {
      r = r - savedVehicles[index].fitness;
      index++;
    }
    index--;

    // l'heureux élu !
    let vehicle = savedVehicles[index];
    // on en fait une copie et on la mute
    let child = new Vehicle(vehicle.brain);
    child.mutate();
    return child;
  }
  
  // On calcule la fitness de chaque voiture
  function calculateFitnessForAllCars() {
    for (let vehicle of savedVehicles) {
      vehicle.calculateFitness();
    }
    // Normalize all values
    let sum = 0;
    for (let vehicle of savedVehicles) {
      sum += vehicle.fitness;
    }
    for (let vehicle of savedVehicles) {
      vehicle.fitness = vehicle.fitness / sum;
    }
  }