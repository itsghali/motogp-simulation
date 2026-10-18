# Vérification des corrections — 15 octobre 2026

## 16 octobre 2026 — Parcours chargé → paramètres → revalidation → entraînement

Suite complète : **79 tests réussis, zéro échec** (`npm test`). Trois nouveaux tests ont d'abord révélé ancien score/chrono conservés après chargement et messages ambigus ; la vérification de reprise a également couvert l'ancienne population mélangée au modèle chargé. Correction : chargement/import conserve une base de génome pour la reprise, efface les comparaisons et résultats antérieurs et ne construit ses descendants mutés qu'au moment de reprendre l'entraînement, selon les réglages et la graine courants. L'original sauvegardé reste inchangé.

Cas explicitement testés : deux tours acquis puis modification en attente ; aucune modification de physique ni de génome avant application ; application effaçant les tours ; exactement trois nouveaux tours requis ; profil initial encore en attente ; validation historique ne couvrant pas des changements non appliqués ; mutation n'altérant pas le pilote de validation ; reprise avec élite intacte, descendants reproductibles, et aucune ancienne population quand mutation vaut zéro. Le message de l'action Appliquer apparaît immédiatement et précise remise à zéro et portée des paramètres génétiques.

Nouvelle preuve numérique complète dans `tests/learning-regressions.test.cjs` : sélection par apprentissage, sérialisation/rechargement réel du génome, largeur **44 → 46 px**, force **0,18 → 0,19**, puis **trois nouveaux tours continus**, 63 checkpoints, zéro sortie, même instance de moto et génome inchangé. Temps observés lors du diagnostic reproductible : 21,40 / 23,23 / 22,87 s, 4053 pas de validation. Aucun événement de tour injecté dans cette preuve ; les tests unitaires de transitions utilisent séparément des événements contrôlés.

`npm run validate:seed` : également réussi avec les réglages standards, 6834 pas et trois tours 21,58 / 23,37 / 22,98 s. Références p5.Vector et inférence numériques CPU de test, pas une nouvelle démonstration GPU ou de téléchargement. Les limites de contrôle navigateur des fichiers indiquées ci-dessous restent applicables. Syntaxe, espaces et empreintes des 11 vehicle.js vérifiés.

Modifiés : `simulation.js`, `sketch.js`, `ui.js`, `tests/controls.test.cjs`, `tests/learning-regressions.test.cjs`, `README.md`, `VALIDATION.md`, `../AI-CHANGELOG.md`. Aucun fichier créé ; aucune modification de locomotion, de validation.js ou de vehicle.js. Cette couverture ne garantit pas la convergence de tous les réglages extrêmes ni l'absence absolue de bugs.

## 16 octobre 2026 — Bibliothèque locale, export/import JSON

**73 tests réussis, zéro échec** avec `npm test`. Ajout d'une bibliothèque locale avec noms, identifiants distincts, date, score enregistré et sélection. Chaque sauvegarde ajoute une entrée ; même nom ou import du même fichier n'écrase rien. Ancienne sauvegarde conservée et intégrée sans modification lors du premier ajout. Export JSON de l'entrée sélectionnée ; import local borné à 2 Mo, format et poids vérifiés, statut de validation externe révoqué.

Tests nouveaux : plusieurs modèles et noms identiques ; migration non destructive ; sélection exacte ; aller-retour JSON ; poids/version/JSON invalides et limite de taille ; quota refusé préservant les données ; téléchargement Blob, nom de fichier sûr et libération d'URL ; lecture fichier ; import sans GPU ; sélection/export/import par les callbacks réels ; 2 tours insuffisants, validation après 3 tours, chargement remettant la tentative à zéro et sortie de piste invalidant la nouvelle tentative.

`npm run validate:seed` reste réussi : trois tours continus sur scénarios réservés, 63 checkpoints, 6834 pas, aucun événement de tour injecté ; 21,58 / 23,37 / 22,98 s. Cette démonstration utilise les références numériques p5.Vector/inférence de test, sans constituer une nouvelle mesure GPU.

Contrôle Chrome séparé : nouvelle interface visible, ancienne sauvegarde reconnue, RTX 3070 affichée. Le clic Exporter JSON est accepté avec message de succès et aucune erreur console ; cependant l'événement de téléchargement attendu par l'outil expire et son inspection interne est bloquée par la politique navigateur. Le téléchargement final et le choix de fichier réel ne sont donc pas présentés comme confirmés ; leurs adaptateurs et les callbacks sont couverts automatiquement. Aucun ancien modèle utilisateur écrasé ; onglet de contrôle fermé, onglet utilisateur non rechargé par l'agent.

Créés : `model-files.js`, `tests/model-library.test.cjs`. Modifiés : `model-storage.js`, `ui.js`, `sketch.js`, `index.html`, `style.css`, `tests/controls.test.cjs`, `README.md`, `VALIDATION.md`, `../AI-CHANGELOG.md`. `validation.js`, locomotion et tous les fichiers `vehicle.js` restent inchangés. La bibliothèque conserve un historique, jamais une exemption à la règle stricte des trois tours.

## 16 octobre 2026 — Retour immédiat des boutons de stockage

Les boutons Sauvegarder/Charger affichaient leur résultat seulement dans le bloc de statistiques lors du prochain rendu. Avant initialisation ou après erreur GPU, ils retournaient sans message. L'interface dispose maintenant d'un encadré directement sous les boutons, mis à jour immédiatement par le clic, indépendant de `draw()`, avec statut accessible et distinction succès/avertissement/erreur. Les messages précisent : première génération évaluée nécessaire avant sauvegarde ; stockage local sans fichier téléchargé ; même navigateur, protocole, hôte et port nécessaires au rechargement.

`npm test` : **64 réussis, zéro échec**. Les tests couvrent retour sans rendu, modèle absent, GPU en initialisation/indisponible, sauvegarde réussie, accès au stockage refusé, données corrompues, puis chargement après reconstruction complète de l'application avec stockage partagé. DOM, stockage et inférence sont des doubles de test ; aucune sauvegarde réelle utilisateur écrasée.

`npm run validate:seed` : trois tours réservés consécutifs validés, zéro sortie, 63 checkpoints, 6834 pas ; temps 21,58 / 23,37 / 22,98 s. Vérifications syntaxe et espaces réussies. `vehicle.js` reste inchangé.

Limite de vérification : tentative navigateur bloquée par serveur temporaire inaccessible (timeout), puis serveur du projet refusant la connexion. Le cycle réel de stockage dans un navigateur n'a donc pas été confirmé pour ce correctif ; les preuves automatisées ci-dessus ne sont pas présentées comme un test visuel réussi.

Modifiés : `ui.js`, `sketch.js`, `style.css`, `tests/controls.test.cjs`, `README.md`, `VALIDATION.md`, `../AI-CHANGELOG.md`. Aucun fichier créé.

## Complément : véhicules bloqués et application immédiate

Dernière suite : **61 tests réussis, zéro échec** (`npm test`). Nouveau fichier `tests/stalling.test.cjs` ; tests des commandes étendus. Cinq défauts ont été reproduits avant correction : boutons de démarrage après arrêt terminal, sélection d'un pilote éliminé/arrivé, cap perdu à l'arrêt, progression stagnante malgré une vitesse non nulle. Le navigateur a aussi montré un dernier candidat roulant à environ 0,12 px/pas, ce qui pouvait retenir un scénario jusqu'au timeout.

Corrections : priorité aux pilotes vivants pour l'affichage du meilleur ; masquage des éliminés/arrivés pendant l'entraînement ; dernier cap conservé à vitesse nulle pour steering, perception et rendu ; élimination après 300 pas sans progrès suffisant. Seuil de progrès : `max(2 px, maxspeed × 0,05 × 240)`, depuis le dernier ancrage significatif ou le départ initial. Les forces restent limitées et appliquées à la locomotion Vehicle existante. Aucun accélérateur automatique, déplacement direct ou score artificiel ajouté.

L'interface possède maintenant **7 boutons** : ajout de « Appliquer les réglages », qui redémarre l'évaluation avec les valeurs affichées et conserve les génomes. Les 29 curseurs sont testés individuellement jusqu'à leur configuration active via ce bouton, y compris pendant une pause. En validation, tous les tours précédents sont effacés lors de l'application de nouvelles conditions. Profil initial : toujours « Nouvelle population ». « Démarrer / pause » reprend l'entraînement après budget/échec et relance la validation après réussite. Temps simulé, vitesse et état du pilote sont visibles.

Contrôle navigateur complémentaire : RTX 3070 identifiée, meilleur pilote vivant observé en mouvement à 1,73–1,74 px/pas ; les 87 vérifications des 29 curseurs passent ; « Appliquer les réglages » applique immédiatement 52 px de largeur et garde la pause. Aucune erreur console observée lors du contrôle. La nouvelle validation GPU complète n'a pas été observée jusqu'au terme avant interruption ; ne pas la confondre avec la preuve numérique suivante. Aucun modèle sauvegardé écrasé ; onglet temporaire absent après interruption.

Preuve reproductible relancée après dernière correction : `npm run validate:seed` réussit en **6834 pas**, génération 1, 63 checkpoints, trois tours continus réservés de **21,58 / 23,37 / 22,98 s**, zéro sortie, même génome SHA-256 que précédemment. Référence numérique CPU/p5.Vector de test, pas une mesure de performance GPU. Les 6886 pas mentionnés dans les preuves antérieures restent des résultats historiques avant détection de stagnation renforcée.

Modifiés : `motorcycle.js`, `simulation.js`, `sketch.js`, `ui.js`, `tests/controls.test.cjs`, `tests/learning-regressions.test.cjs`, `README.md`, `VALIDATION.md`, journal racine `../AI-CHANGELOG.md`. Créé : `tests/stalling.test.cjs`. Limite : un contrôleur encore mauvais peut s'arrêter ou échouer ; il doit être éliminé puis remplacé, pas recevoir un pilotage artificiel. Les paramètres extrêmes ne garantissent pas la convergence.

## Résultat

42 tests automatisés réussis, zéro échec. Démonstration numérique reproductible de trois tours continus, puis contrôle dans un navigateur avec p5.js réel et inférence TensorFlow.js WebGL sur NVIDIA GeForce RTX 3070 Laptop GPU.

Le contrôle navigateur utilise les valeurs par défaut : graine 2027, profil équilibré, population 80, trois scénarios d'entraînement, largeur 44 px. La vitesse de simulation a été temporairement réglée à 30 pour raccourcir le test, puis rétablie à 4. Aucune trajectoire de pilotage ni événement de fin de tour n'est injecté. Le génome sélectionné termine les trois tours réservés sans téléportation entre les tours.

| Tour | Scénario réservé | Temps simulé | Sorties | Vitesse moyenne |
| --- | --- | --- | --- | --- |
| 1 | validation-10000-0 | 21,58 s | 0 | 1,84 px/pas |
| 2 | validation-10000-1 | 23,37 s | 0 | 1,69 px/pas |
| 3 | validation-10000-2 | 22,98 s | 0 | 1,73 px/pas |

Statut navigateur observé : **modèle validé**, 3 tours. Première génération : 6 tours terminés sur 240 évaluations, 79 scores distincts. Cette graine contient déjà un candidat capable de finir ; la sélection le retrouve en génération 1. Cela prouve le parcours et les règles de validation, pas une amélioration progressive sur plusieurs générations ni une garantie pour tous les réglages.

## Commandes reproductibles

Dans `9-VoitureSuitCircuit genetic algo` :

```text
npm test
npm run validate:seed
```

La seconde commande utilise une population de 12 et deux scénarios d'entraînement pour limiter le coût du test. Elle exécute les sources réelles de perception, génome, steering, locomotion Vehicle, progression et validation. Seuls p5.Vector et l'inférence sont remplacés par des références numériques de test ; ce n'est pas une preuve GPU à elle seule. Résultat : 6886 pas au total, 63 checkpoints de validation, trois scénarios réservés, trois tours valides. SHA-256 du génome sélectionné : `9b67aa2c63c09c46155826ad01facfaead293066733f29d79359414e8bde5ec1`.

Pour reproduire le contrôle navigateur, servir le dossier par HTTP, garder les paramètres par défaut et utiliser « Nouvelle population ». Le panneau doit identifier la RTX 3070. Attendre les trois scénarios d'entraînement puis les trois tours de validation. Le rendu reste local au portable ; aucun appel à un modèle distant ne pilote les motos.

## Paramètres ajoutés

| Contrôle | Minimum | Maximum | Défaut |
| --- | --- | --- | --- |
| Largeur simulée | 24 px | 52 px | 44 px |
| Budget par session | 10 générations | 1000 générations | 200 générations |
| Durée maximale d'un tour | 30 s | 240 s | 120 s |
| Graine | 1 | 9999 | 2027 |

Les autres paramètres et poids conservent leurs valeurs initiales, listées dans README.md et ui.js. La largeur initiale était 24 px ; la nouvelle valeur augmente la largeur de 83 %. Les 11 m affichés restent la référence réelle, pas l'échelle de la piste pédagogique.

## Fichiers

Modifiés : `circuit.js`, `fitness.js`, `genome.js`, `motorcycle.js`, `scenario.js`, `simulation.js`, `steering.js`, `validation.js`, `model-storage.js`, `sketch.js`, `ui.js`, `package.json`, `README.md`, `tests/circuit.test.cjs` ; journal du dépôt `../AI-CHANGELOG.md`.

Créés : `tests/helpers/runtime.cjs`, `tests/learning-regressions.test.cjs`, `tests/ui-storage.test.cjs`, `tests/validate-seed.cjs`, `VALIDATION.md`.

Les 11 fichiers `vehicle.js` du dépôt ont conservé leur empreinte SHA-256. Celui de cet exemple : `C385D1DCB27F8BCD9DF95DEDDF8A18BB3E6F1B3417740889F53274FBE846FDA7`.

## Limites

- Le dessin reste une approximation polygonale de Jerez et la largeur est volontairement amplifiée.
- Les collisions entre candidats indépendants sont désactivées ; les collisions avec les limites restent pénalisées. Ce n'est pas un simulateur de course avec adversaires.
- La validation utilise trois tours continus avec changements de conditions à la ligne ; les variations de pose initiale des scénarios 2 et 3 ne sont pas appliquées en mouvement.
- Les capteurs, la locomotion et l'évolution génétique utilisent le CPU ; seules les opérations neuronales sont exécutées sur WebGL. Les petits réseaux et la lecture synchrone des résultats peuvent limiter l'accélération.
- La sélection du GPU par Chrome reste un problème distinct : l'application refuse Intel et le contrôle réussi a été fait dans le navigateur intégré à Codex.

## Contrôle des commandes — 15 octobre 2026

Suite étendue : **50 tests réussis, zéro échec**, commande `npm test` depuis ce dossier. Le fichier `tests/controls.test.cjs` exécute les véritables callbacks de `sketch.js`, avec DOM et inférence de test. Il couvre les 29 curseurs, les 6 boutons, les 5 profils et les 3 options de rendu ; chaque poids de fitness doit modifier le score dans le sens attendu. Les cas sauvegarde vide, stockage interdit, données corrompues, restauration complète et revalidation sont inclus.

Corrections : validation manuelle synchronisée avec les derniers réglages ; erreurs de sauvegarde affichées ; état de validation effacé à la réinitialisation et à la reprise ; nouveaux paramètres génétiques utilisés pour les enfants de la génération suivante. Les scores des essais en cours gardent les anciens poids. Le panneau signale les réglages en attente, et précise que le profil initialise une nouvelle population.

Contrôle navigateur intégré sur `http://127.0.0.1:8765/index.html` : 29 véritables éléments range testés avec Fin, Début et Flèche droite, soit **87 vérifications** de valeur et d'affichage. Les six boutons, cinq choix de profil et trois cases ont été actionnés. La largeur affichée passe bien de 44 à 52 px après « Nouvelle population ». Le navigateur identifie la RTX 3070 et ne rapporte aucune erreur console. Aucun modèle utilisateur sauvegardé n'a été écrasé ; le cycle réussi sauvegarde/chargement et les erreurs de stockage sont vérifiés dans les tests automatisés, pas par écrasement d'une sauvegarde navigateur. Réglages restaurés et onglet de diagnostic fermé.

`npm run validate:seed` relancé après corrections : toujours 6886 pas, 63 checkpoints, trois tours continus réservés de 21,58 / 23,37 / 22,98 s, sans sortie. Cette exécution numérique ne remplace pas une nouvelle preuve GPU complète pour tous les réglages possibles. Les combinaisons extrêmes peuvent dégrader l'apprentissage ; un contrôle fonctionnel n'est pas une garantie de convergence.

Fichiers modifiés pour ce contrôle : `sketch.js`, `simulation.js`, `ui.js`, `README.md`, `VALIDATION.md`, `tests/helpers/runtime.cjs`, journal racine `../AI-CHANGELOG.md`. Créé : `tests/controls.test.cjs`. Aucun `vehicle.js` modifié.
