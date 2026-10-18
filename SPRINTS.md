# Grand Prix neuronal — contrat et preuves

## Sprint 0 — état initial
16 octobre 2026 : `npm test` : 144/144, aucun échec. `npm run validate:seed` : 6834 pas, 63 checkpoints, trois tours réservés, zéro sortie. SHA256 génome : 9b67aa2c63c09c46155826ad01facfaead293066733f29d79359414e8bde5ec1.
Consignes, ARCHITECTURE.md, journal racine et AUDIT-2026-10-16.md lus avant modification.

Modules : modèles/compatibilité : genome.js, model-storage.js, model-files.js ; Training : simulation.js, validation.js, fitness.js ; course : grand-prix.js, race-session.js, rider-roster.js ; forces : steering.js, motorcycle.js ; replay : replay.js, replay-motorcycle.js ; audio : engine-sound.js, audio-manager.js ; événements/voix : race-events.js, commentary.js.
Existants : modèle unique explicite, variantes optionnelles désactivées, pool moteur borné, MP3 et SpeechSynthesis, classement avec dépassement confirmé, replay figé, restauration GPU Training. Absents : affectations individuelles, vraie silhouette moto, séparation, obstacles et drones.

## Contrat des modes et réglages
- Training/Debug : protocole, fitness, neuf entrées neuronales et locomotion conservés. Assistances physiques nouvelles réservées Race/Cinematic/Spectator.
- Race : affectations, traits, configuration physique, séparation, obstacles et drones copiés au lancement. Changer leurs contrôles prépare la prochaine course ; redémarrer applique les changements.
- Replay : course réelle et batch GPU figés ; reconstruction des mesures enregistrées, sans inférence ni physique supplémentaire. Sortie retrouve la même course.
- Audio, volumes, mute, commentaire, caméra, HUD, qualité : effet immédiat. Pause coupe audio et voix, suspend simulation ; reprise sans annonces accumulées.
- Enregistrement replay : immédiat pour les captures suivantes. Aucun rattrapage des images omises.
- Réglages du laboratoire : Appliquer reconstruit selon contrat existant ; taille population et paramètres génétiques prennent effet via reconstruction/nouvelle population. Profil applique explicitement les traits et invalide la validation. Aucun de ces réglages ne remplace un batch de course.
- Plusieurs modèles peuvent volontairement partager le même cerveau ; profil affiché est celui du génome enregistré. Aucun remplacement implicite par un préréglage.

Journal de cette mission dans AI-CHANGELOG.md de cet exemple : périmètre exclusivement dossier 9.

## Livraison par sprint

| Sprint | Fonction livrée | Fichiers créés/modifiés dans exemple 9 | Tests exécutés |
| --- | --- | --- | --- |
| 0 | État initial et contrat Training/Race/Replay | SPRINTS.md, AI-CHANGELOG.md créés | npm test : 144/144 ; npm run validate:seed : réussite |
| 1 | Affectation indépendante, imports multiples, refus ligne vide, ordre GPU, provenance dans résultats | grand-prix.js, ui.js, tests/broadcast-enhancements.test.cjs | npm test : 145/145 |
| 2 | Rendu moto procédural, cap conservé, dessin commun replay | motorcycle.js, tests/broadcast-enhancements.test.cjs | npm test : 146/146 |
| 3 | Séparation Race, cas superposition, poids et somme bornée, désactivation exacte | race-steering.js et tests/race-assistance.test.cjs créés ; motorcycle.js, race-session.js, grand-prix.js, index.html, tests/helpers/runtime.cjs modifiés | npm test : 148/148 |
| 4 | Obstacle Vehicle, éditeur, anticipation prioritaire et collision segment | Obstacle.js créé ; race-steering.js, race-session.js, grand-prix.js, index.html, tests/helpers/runtime.cjs, tests/race-assistance.test.cjs modifiés | npm test : 150/150 |
| 5 | Drone Vehicle, trois règles, confinement, graines indépendantes, replay mesuré | Drone.js, drone-steering.js créés ; race-session.js, replay.js, grand-prix.js, index.html, tests/helpers/runtime.cjs, tests/race-assistance.test.cjs modifiés | npm test : 152/152 ; test isolé drones : 2/2 |
| 6 | Timbres moteur, gains coupés immédiatement, pool stable, ressources transitoires libérées | engine-sound.js, audio-manager.js, grand-prix.js, tests/broadcast-enhancements.test.cjs | npm test : 153/153 |
| 7 | Français dynamique principal, mêmes textes voix/sous-titres, priorité/expiration, pause sans file | commentary.js, race-session.js, grand-prix.js, tests/broadcast-enhancements.test.cjs | npm test : 155/155 après réparation d’une fixture sans commentary |
| 8 | Course combinée, indépendance drones, collisions réelles, robustesse audio, UI et documentation | tests/sprint-integration.test.cjs créé ; audio-manager.js, commentary.js, grand-prix.js, index.html, broadcast.css, tests/broadcast-enhancements.test.cjs, README.md, GRAND_PRIX.md, PROFILS.md, SPRINTS.md, AI-CHANGELOG.md modifiés ; captures/manifest dans evidence/ créés | Tests intégrés : 3/3 ; npm test final : 160/160 ; npm run validate:seed final : réussite ; tous JS racine : node --check réussi ; 37 scripts uniques présents |

Chaque sprint a conservé vehicle.js. Empreinte finale égale à celle de l’audit : C385D1DCB27F8BCD9DF95DEDDF8A18BB3E6F1B3417740889F53274FBE846FDA7. Aucun fichier modèle JSON d’origine écrit, aucun paquet installé, aucune modification hors exemple 9. Le journal de mission reste local afin de respecter ce périmètre ; journal racine seulement lu.

## Vérifications navigateur réelles

Origine isolée `http://127.0.0.1:8765`, distincte de la bibliothèque utilisateur sur port 5500. Tests initiaux des sprints 1–7 automatisés avant vérification navigateur commune au sprint 8.

- Import simultané de Jerez-equilibre.json et agressif-jerez-generation-2.json via vrai sélecteur multiple ; modèles d’origine conservés.
- Refus du départ sans affectation, affectation collective explicite puis remplacement individuel. Indicateur 6/6, cerveau équilibré dans fiche Marc, cerveau agressif dans ligne Bagnaia des résultats.
- Ajout/suppression d’obstacle, coordonnées/rayon visibles ; séparation 0,2, anticipation et 12 drones activés ; course d’un tour.
- Course avec un équilibré/cinq agressifs : 1 finisseur et 5 DNF. Course avec cinq équilibrés/un agressif : 3 finisseurs et 3 DNF ; Marc 22,583 s, Acosta 23,033 s, Binder 23,167 s ; meilleur tour Acosta 22,100 s. Aucun succès artificiel ni garantie de finir avec assistance.
- Pause/reprise, reprise via menu, redémarrage, caméra FOLLOW_SELECTED/FOLLOW_LEADER et OVERVIEW ; rendu réel examiné à plusieurs échelles, sans asset manquant. Drones visibles et animés pendant RACE ; immobiles en pause.
- Voix françaises détectées : Microsoft Hortense, Julie, Paul. Paul sélectionnée, statut français constaté. Pause efface immédiatement le sous-titre et affiche AUDIO PAUSED ; replay 0,25× affiche AUDIO PAUSED, même contexte d’obstacles/drones. Source MP3/dynamique, moteurs et commentaire indépendants manipulés. L’annulation normale de synthèse par mute était présentée à tort comme indisponibilité ; traitement et test de régression ajoutés.
- Raccourcis C, M, H manipulés ; HUD rétabli et caméra FOLLOW_LEADER constatés après rafraîchissement de l’affichage. Raccourcis et autres contrôles historiques couverts aussi par suite existante ; pas de revendication d’une campagne manuelle exhaustive sur tous appareils.
- Modes Cinematic/Spectator puis Debug/Training, sortie explicite replay, restauration laboratoire observés. Restauration exacte du batch GPU également vérifiée par tests automatisés existants.
- Un cache navigateur conservait d’anciens scripts audio ; ressources locales désormais versionnées dans index.html. Vérifications répétées après chargement cohérent. Aucune erreur console relevée sur version contrôlée.
- Captures locales : evidence/sprint8-settings.jpg, evidence/sprint8-results.jpg, evidence/sprint8-replay.jpg. Manifest SHA256 final des JSON : evidence/model-manifest.json, empreinte de livraison et non preuve rétrospective à elle seule.

## Limites restantes

- Aides de course changent le pilotage appliqué ; des modèles validés seuls peuvent abandonner avec séparation/obstacles. Aucun réentraînement ni changement de fitness/protocole caché.
- Profil par pilote = profil réellement enregistré dans son modèle. Pour d’autres traits, sauvegarder explicitement une variante au laboratoire ; l’option MotoGP remplace les traits uniquement sur activation explicite.
- Circuit et paramètres physiques communs proviennent du premier modèle. Pas de six configurations de piste différentes.
- Pas de collision rigide moto/moto ni de suspension mécanique ; collision obstacle approxime moto par rayon 4 px et segment parcouru. Évitement local ne garantit pas de solution dans un groupe d’obstacles bloquant toute la piste.
- Drones figés avant départ et après course ; replay limité au buffer existant d’environ dix secondes. Confinement réactif, aucune téléportation.
- Son synthétique et voix dépendants du navigateur/périphérique ; paramètres audio et signaux de synthèse vérifiés, aucune validation subjective de l’écoute physique revendiquée. Sans voix FR, sous-titres fonctionnent. Huit oscillateurs moteur stables, sons UI/musique transitoires libérés ; ces sons courts peuvent créer des oscillateurs ponctuels.
- Mesure 32 drones × 600 pas = 225,7 ms CPU numérique isolé, sans rendu. Pas de garantie FPS sur toutes machines.
- p5.js reste issu du CDN existant ; pas de campagne mobile exhaustive, ni de certification de réalisme MotoGP.


## Retour utilisateur — souris, son moteur et anglais

Cette correction remplace le choix français par défaut décrit dans les sprints historiques. Le Grand Prix démarre désormais en anglais ; français toujours disponible. Master 90 %, voix 100 %, fond sonore abaissé à 16 % pendant les annonces. Tests de texte anglais, voix correspondante, égalité voix/sous-titres et restauration du mix ajoutés.

Le bouton de placement souris ajoute par clic sur la piste, supprime par Maj + clic et affiche un aperçu Vehicle. Taille CSS/caméra prises en compte ; un événement ne crée jamais deux obstacles. En Training : aucun effet physique ; en course : prépare la suivante, sans modifier contexte/replay actif.

Un véritable son de moto générique est livré : Motorbike - 4, ezwa, domaine public. Le fichier source reste intact et local ; extrait central bouclé/normalisé au décodage. Synthèse combustion en secours, import d’une autre boucle possible. Aucun régime mécanique authentifié ni modèle MotoGP précis revendiqué. Provenance : assets/motorbike-ezwa-SOURCE.md.

Vérifications : npm test 164/164 ; npm run validate:seed inchangé (6834 pas, 63 checkpoints, trois tours, zéro sortie) ; syntaxe JS vérifiée. Navigateur réel : ajout/Maj-suppression/réajout, liste (484,77), langue EN/FR, David en anglais, Welcome to Jerez et annonces d’arrivée en anglais, décodage du fichier moteur fourni confirmé, import WAV de test réussi ; course avec obstacle et évitement : 6/6 finisseurs. Aucune erreur console. Captures : evidence/mouse-obstacle-placement.jpg, evidence/mouse-audio-settings.jpg, evidence/mouse-obstacle-english-commentary.jpg. Fichier WAV de test synthétique supprimé après vérification ; aucune écoute matérielle subjective certifiée.


## Retour utilisateur — évitement et séparation corrigés

Causes reproduites : évitement additionné au cerveau avant danger tardif (annulation possible), côté changeant avec le cap, absence d’activation automatique à l’ajout d’obstacles et aperçu futur pouvant être confondu avec configuration active. Référence 5-3 lue : separation, vehicleAvoidance et priorité dans Motorcycle.applyBehaviors ; adaptation sans ses dépendances globales ni son constructeur différent.

Correction : évitement prioritaire dès détection, anticipation freinage/vitesse, côté de passage stable et praticable, vitesse latérale amortie, arrêt prioritaire si passage bloqué, allure d’approche plafonnée ; séparation critique prioritaire. Ajout coche évitement, états affichés au lancement, aperçu explicitement futur. Training, fitness, validation, modèles et vehicle.js intacts.

Tests : npm test 170/170 ; suite ciblée race-assistance + sprint-integration passée ; validate:seed de référence identique. Cas décisif : une force non nulle ne suffit plus comme preuve ; vrais mouvements jusqu’après l’obstacle, collisions balayées contrôlées à chaque pas. Vrai modèle : collision sans aide / un tour fini avec aide, obstacle à 70 px du départ. Pas de promesse de réussite universelle : cas de virage à 160 px finit encore en mauvais sens après évitement ; à 300 px terminé. Limites détaillées dans GRAND_PRIX.md.

Navigateur final avoidance4 : obstacle (725,472), rayon 6, évitement activé automatiquement puis affiché ACTIF ; six modèles équilibrés, six arrivées 21,983–22,433 s, zéro DNF, vitesse max 2,06 px/pas. Aperçu futur dessiné sans erreur. Captures evidence/avoidance-fixed-results.jpg et evidence/avoidance-future-preview.jpg. Empreintes modèles et vehicle.js confirmées inchangées.
