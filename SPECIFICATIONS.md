# Spécifications — MotoGP Simulation

Dernière vérification documentaire : 18 octobre 2026.

## 1. Objectif

Simuler apprentissage et course de motos autonomes sur une représentation pédagogique du Circuito de Jerez. Un contrôleur neuronal est optimisé par algorithme génétique, puis homologué sur trois tours continus avant utilisation en Grand Prix.

Le projet sépare strictement :

1. perception de environnement ;
2. décision neuronale et traits de conduite ;
3. calcul de force de steering ;
4. locomotion héritée de `Vehicle` ;
5. évaluation, sélection et évolution ;
6. couche spectacle Grand Prix.

Aucune moto intelligente ne suit une trajectoire image par image codée à la main.

## 2. Modes

| Mode | Rôle | Évolution génétique |
|---|---|---|
| Training | Évaluer population et produire générations | Active |
| Validation | Vérifier champion sur scénarios réservés | Inactive |
| Race | Grand Prix avec modèles choisis | Inactive |
| Cinematic | Course avec réalisation automatique | Inactive |
| Spectator | Observation et caméras | Inactive |
| Debug | Capteurs, géométrie et diagnostics | Selon contexte |
| Replay | Rejouer état enregistré | Inactive |

Passer en course suspend entraînement sans perdre population. Retour vers Training restaure population et batch d’inférence.

## 3. Circuit

- Référence : Circuito de Jerez - Ángel Nieto.
- Sens : horaire.
- Tracé normalisé : 42 points.
- 13 virages représentés.
- Ligne départ/arrivée et checkpoints ordonnés.
- Limites calculées depuis polygones communs au rendu, capteurs et collisions.

La largeur en pixels est pédagogique, non conversion exacte des 11 m réels. La géométrie contrôle : projection sur piste, progression longitudinale, départ, checkpoints, sorties et contresens.

## 4. Perception

Le réseau reçoit neuf entrées :

- sept distances normalisées aux limites de piste ;
- vitesse courante ;
- commande précédente.

Le contrôleur ne reçoit pas :

- trajectoire idéale ;
- centre du prochain virage ;
- position du prochain checkpoint ;
- séquence de commandes préenregistrée.

Les rayons détectent mêmes frontières que collisions. Le dernier cap connu est conservé à vitesse quasi nulle pour éviter capteurs orientés arbitrairement.

## 5. Génome

### 5.1 Réseau

Architecture dense `9-12-2` :

```text
9 entrées → 12 neurones tanh → 2 sorties tanh
```

Sorties pilotent direction et gaz/freinage. Les poids et biais constituent partie neuronale du génome.

### 5.2 Traits

Sept traits complètent réseau :

- anticipation ;
- direction ;
- freinage ;
- accélération ;
- agressivité ;
- correction vers piste ;
- sensibilité aux virages.

Profils prudent, équilibré, agressif, freinage tardif et trajectoire régulière définissent distributions initiales. Évolution modifie ensuite valeurs.

## 6. Steering et locomotion

Pipeline :

```text
capteurs → réseau + traits → direction désirée
vitesseDésirée = direction × maxSpeed
steering = vitesseDésirée - vitesseActuelle
steering limité à maxForce
applyForce(steering)
Vehicle.update()
```

Une seule mise à jour locomotion par pas. `vehicle.js` reste intact.

En Grand Prix, aides optionnelles ajoutent des forces indépendantes : séparation, anticipation de collision et évitement obstacle. Composition respecte priorité du danger et limite force finale.

## 7. Algorithme génétique

Cycle :

1. créer population depuis profil choisi ;
2. évaluer chaque génome sur mêmes scénarios de génération ;
3. calculer fitness ;
4. conserver élites ;
5. sélectionner parents par tournoi ;
6. croiser poids, biais et traits ;
7. muter selon taux et amplitude ;
8. produire génération suivante ;
9. déclencher validation si candidat satisfait entraînement.

Paramètres initiaux documentés : population 80, mutation 0,08, amplitude 0,18, croisement 0,80, cinq élites, trois scénarios, budget 200 générations, graine 2027.

La graine et ensemble commun de scénarios permettent comparer candidats de façon reproductible.

## 8. Fitness

Récompenses principales : checkpoints, progression autorisée, tours et chrono. Pénalités : sortie, collision limite, contresens, stagnation, raccourci et checkpoint manqué.

Forme par scénario :

```text
score = (1 + récompenses) / (1 + pénalités / 160)
```

Bonus chrono :

```text
800 × 60000 / (60000 + temps_ms)
```

Score global = moyenne des scénarios, multipliée par pénalité quadratique liée au taux d’échec.

La distance récompensée est maximum de progression longitudinale autorisée. Repasser même zone, tourner sur place ou rouler hors piste ne produit pas distance artificielle.

## 9. Scénarios

Variations : pose initiale, vitesse, adhérence, bruit capteur, moteur et freinage. Tous candidats d’une génération reçoivent même ensemble, dans ordre reproductible.

Les réglages physiques sont figés pendant génération et validation. Un changement devient actif à génération suivante ou après action explicite.

## 10. Validation stricte

Un modèle est déclaré validé uniquement après :

- trois tours complets consécutifs ;
- trois scénarios réservés ;
- 63 checkpoints au total ;
- aucune téléportation ;
- aucune réinitialisation vitesse entre tours ;
- aucune sortie, collision, stagnation, erreur checkpoint, raccourci, contresens ou timeout.

Importer ou charger modèle supprime toute revendication de validation du fichier et relance protocole complet. Le statut JSON seul n’est jamais preuve.

## 11. Bibliothèque de modèles

Format versionné contenant génome, traits, profil, réglages actifs, graine et statistiques historiques.

Fonctions :

- sauvegarder plusieurs modèles nommés ;
- sélectionner modèle ;
- charger et revalider ;
- exporter JSON ;
- importer JSON jusqu’à 2 Mo ;
- migrer anciens formats ;
- restaurer archive locale historique.

Deux noms identiques peuvent représenter entrées distinctes. Nom exporté est harmonisé avec profil réellement contenu dans génome. Texte importé est affiché via texte, jamais injecté comme HTML.

`localStorage` dépend origine : domaine, protocole et port différents possèdent bibliothèques différentes.

## 12. Grand Prix

### 12.1 Affectations

Six pilotes possèdent sélection indépendante de modèle. Même cerveau peut être affecté plusieurs fois. Sans choix explicite ou homologation réussie, départ est refusé.

### 12.2 Règlement commun

Physique de course commune dans `grand-prix-rules.js`, notamment vitesse maximale 5,5 et force maximale 0,18. Réglages du laboratoire et JSON ne peuvent remplacer silencieusement règlement.

### 12.3 Séparation

Répulsion projetée dans repère de piste. Composante latérale écarte motos ; rapprochement longitudinal provoque freinage plutôt que marche arrière. Vitesse relative et temps avant contact permettent anticipation.

### 12.4 Évitement

- détection anticipée par projection future ;
- portée dynamique liée vitesse ;
- côté de contournement choisi puis conservé ;
- vérification espace libre et limites piste ;
- freinage si passage insuffisant ;
- état persistant pour éviter changement gauche/droite ;
- phase de restitution après obstacle pour rendre pilotage au cerveau.

### 12.5 Collision

Corps moto modélisé par capsule roues avant/arrière. Contact balayé entre deux frames empêche traversée obstacle à grande vitesse.

## 13. Couche spectacle

- grille, cinq feux, classement, drapeaux, résultats et podium ;
- sept caméras et sélection manuelle ;
- replay dix dernières secondes à 0,5× ou 0,25× ;
- mini-carte et télémétrie ;
- moteurs réactifs vitesse/gaz/proximité ;
- MP3 ambiance séparé ;
- commentaire événementiel et sous-titres ;
- drones pilotés par séparation, alignement et cohésion ;
- tribunes mises en cache pour performance.

Replay reconstruit états enregistrés ; il ne recalcule ni IA ni physique.

## 14. Modules

| Groupe | Fichiers principaux |
|---|---|
| Circuit | `circuit.js`, `boundary.js`, `race-track-frame.js` |
| IA | `genome.js`, `nn.js`, `gpu-inference.js` |
| Évolution | `genetic-algorithm.js`, `ga.js`, `fitness.js`, `scenario.js` |
| Pilotage | `steering.js`, `reference-steering.js`, `race-steering.js` |
| Moto | `motorcycle.js`, `motorcycle-body.js`, `motorcycle-prediction.js`, `motorcycle-avoidance.js` |
| Validation | `validation.js`, `simulation.js` |
| Modèles | `model-storage.js`, `model-files.js`, `configuration.js` |
| Course | `grand-prix.js`, `grand-prix-rules.js`, `race-session.js`, `race-events.js` |
| Spectacle | `camera-director.js`, `venue.js`, `replay.js`, `race-analytics.js` |
| Audio | `audio-manager.js`, `engine-sound.js`, `commentary.js` |
| Drones | `Drone.js`, `drone-steering.js` |
| Interface | `ui.js`, `sketch.js`, `style.css`, `broadcast.css` |

## 15. Tests

```text
npm ci
npm test
npm run validate:seed
```

Tests couvrent unités, intégration, stockage, GPU, profils, course, obstacles, collisions, séparation, replay, contrôles et campagne reproductible.

`validate:seed` exécute perception, réseau, force, locomotion et checkpoints sans injecter trajectoire ou événement de tour.

## 16. Déploiement web

Application statique publiée depuis la racine du repo `motogp-simulation`. Tous les chemins locaux sont relatifs et fonctionnent sous le sous-chemin GitHub Pages.

TensorFlow.js 4.22.0 et p5.js 1.9.4 sont chargés depuis des CDN versionnés. Le moteur demande WebGL haute performance. Une RTX 3070 est reconnue comme cible optimale, tout autre renderer WebGL fonctionne en mode compatible, puis le backend CPU sert de dernier repli. Le renderer réel reste affiché dans le laboratoire.

Le fichier local `assets/motogp_audio.mp3` est exclu de la publication faute de licence vérifiable. Le commentaire dynamique, le moteur enregistré libre et la synthèse restent opérationnels. L’utilisateur peut importer son propre fichier audio pendant la session.

## 17. Invariants

- `vehicle.js` inchangé.
- Aucun déplacement direct par comportement.
- Aucun modèle déclaré validé depuis métadonnée seule.
- Training, Race et Replay restent séparés.
- Anciens JSON restent compatibles.
- Assistance physique ne modifie pas entraînement silencieusement.
