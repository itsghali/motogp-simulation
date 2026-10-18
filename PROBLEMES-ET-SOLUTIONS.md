# Problèmes rencontrés et solutions — MotoGP Simulation

Document reconstruit depuis échanges de développement, journaux, audits et tests. Chaque section décrit problème réel, cause, correction et validation.

## 1. Course ambiguë : quel modèle pilote ?

### Problème

Course pouvait sembler basée sur champion courant, profil sélectionné ou dernier modèle chargé. Nom affiché et génome utilisé risquaient diverger.

### Solution

- Sélection explicite du modèle de course.
- Affectation indépendante pour chacun des six pilotes.
- Aucun fallback silencieux vers champion courant.
- Nom, profil, poids et traits viennent de même entrée.
- Import pendant course prépare prochaine course sans modifier celle en cours.
- Homologation obligatoire avant départ.

### Preuve

Tests d’affectation, modèles multiples, profil, lancement et refus d’homologation.

## 2. Statut « validé » non fiable après import

### Problème

Un JSON pouvait contenir ancien statut validé alors que environnement ou réglages avaient changé.

### Solution

Tout chargement/import efface revendication active et impose trois nouveaux tours consécutifs sur scénarios réservés. Métadonnées restent historique seulement.

## 3. Réglages changés pendant évaluation

### Problème

Modifier largeur, force ou adhérence en cours de génération pouvait rendre scores incomparables et validation incohérente.

### Solution

- Séparer réglages affichés, actifs et en attente.
- Figer physique pendant génération/validation.
- Bouton **Appliquer les réglages** relance essais avec génomes conservés.
- Validation repart tour 1.
- Vitesse affichage reste immédiate.
- Mutation/croisement ne touchent que prochaine reproduction.

## 4. Boutons sauvegarder/charger semblaient inactifs

### Causes

Retour utilisateur dépendait boucle de rendu, état GPU ou présence meilleur génome. En pause, erreur restait invisible.

### Solution

Message immédiat sous commandes, indépendant de `draw()` et GPU. Erreurs explicites : pas de champion, stockage refusé, modèle absent, import invalide.

## 5. Plusieurs modèles et confusion de bibliothèque

### Problème

Premier stockage contenait emplacement unique : nouvelle sauvegarde remplaçait précédente. Bibliothèque accumulée rendait choix confus. Origines `localhost`, `127.0.0.1` et ports différents semblaient perdre modèles.

### Solution

- Bibliothèque multi-entrées versionnée.
- Nom, date, score, profil et historique.
- Export/import JSON entre origines.
- Migration ancienne sauvegarde sans suppression.
- Limite import 2 Mo et validation nombres/génome.
- Fonction restauration archive locale.
- Possibilité de vider affectations visibles sans détruire fichiers JSON.

## 6. Nom de sauvegarde différent du profil réel

### Problème

Sélecteur de profil en attente pouvait produire nom trompeur pour génome déjà entraîné.

### Solution

Nom vient du profil stocké dans génome réellement sauvegardé. Export normalise nom fichier, par exemple `prudent-jerez-g12.json`. Sélection visuelle non appliquée ne renomme pas modèle.

## 7. Pilotes stagnants bloquaient génération

### Problème

Une moto presque immobile pouvait consommer budget complet sans progrès.

### Solution

Fenêtre de 300 pas. Progression minimale :

```text
max(2 px, maxSpeed × 0,05 × 240)
```

Seuil renouvelé après progrès suffisant ou départ franchi. Stagnation élimine pilote et validation échoue explicitement.

## 8. Orientation erronée à vitesse nulle

### Problème

Capteurs pouvaient reprendre orientation arbitraire de ligne de départ quand vitesse devenait quasi nulle.

### Solution

Conserver dernier cap valide. Capteurs restent cohérents pendant freinage ou démarrage.

## 9. Séparation envoyait motos en arrière ou hors piste

### Problème

Répulsion euclidienne naïve pouvait contenir composante arrière. Sur grille serrée, moto freinait brutalement, repartait en sens inverse ou sortait piste.

### Solution

- Repère local tangent/normale de piste.
- Répulsion surtout latérale.
- Si danger longitudinal, freiner au lieu de commander marche arrière.
- Utiliser vitesse relative et temps avant contact.
- Limiter force finale.

Correction adaptée de exemple `5-3-PathFollowingComplex` aux conventions `maxspeed/maxforce` du projet.

## 10. Obstacles non évités

### Problème

Force neuronale pouvait rester dominante ou évitement réagir trop tard. Côté changeait entre frames. Dans virages serrés, moto évitait obstacle puis heurtait bordure.

### Solution

- Danger urgent prioritaire.
- Portée dynamique selon vitesse.
- Freinage anticipé.
- Choix gauche/droite persistant.
- Contrôle espace disponible et limites piste.
- État de sortie pour restituer progressivement pilotage neural.
- Placement obstacle active évitement à prochaine course.

### Limite

Certaines combinaisons modèle, piste étroite et obstacle en virage peuvent encore produire abandon. Assistance n’est pas garantie de réussite universelle.

## 11. Moto traversait obstacle

### Problème

Collision testée sur centre à instant courant permettait tunneling à grande vitesse. Forme visuelle dépassait rayon collision.

### Solution

- Corps représenté par capsule entre roues.
- Collision testée sur déplacement entre frame précédente et courante.
- Obstacles ajoutés en pause puis appliqués à relance, évitant mutation course active.

## 12. Obstacle occupait presque toute largeur

### Problème

Piste Grand Prix trop étroite par rapport rayon obstacle et largeur moto.

### Solution

Largeur Grand Prix augmentée et rendue réglable. Rendu, capteurs et limites utilisent même géométrie. Modèles anciens peuvent nécessiter réentraînement quand largeur diffère de conditions apprises.

## 13. Styles pilotes trop forts

### Problème

Appliquer traits inspirés de pilotes réels à 100 % peut écraser traits appris sans réentraîner poids. Certains profils freinent insuffisamment et abandonnent.

### Solution actuelle

Option variantes désactivée par défaut. Intensité reste réglable et clairement séparée du modèle original. Copies de course seulement ; poids et modèle sauvegardé ne sont pas modifiés.

### Enseignement

Une personnalité appliquée après entraînement n’est pas équivalente à cerveau entraîné avec cette personnalité. Pour comparaison scientifique, entraîner champion distinct par profil.

## 14. Son moteurs peu réaliste ou trop faible

### Problème

Synthèse seule manquait réalisme. Commentaire et ambiance masquaient moteurs. Navigateurs bloquaient lecture avant interaction.

### Solution

- Boucle réelle de moto fournie, avec source documentée.
- Synthèse de secours.
- Hauteur/volume liés vitesse, gaz et proximité.
- Mix séparé moteurs, voix, ambiance et master.
- Ducking moteurs/ambiance pendant commentaire.
- Activation après clic.
- MP3 ambiance importé séparément des événements vocaux.

## 15. Commentateur pas assez audible et langue incorrecte

### Solution

Anglais par défaut après retour utilisateur, bouton test voix, volume voix renforcé et sous-titres synchronisés. Événements proviennent état réel : départ, dépassement, incident, drapeau, arrivée.

Voix exacte dépend synthèse disponible dans navigateur ; sous-titres garantissent information.

## 16. Lancement Grand Prix bloqué par audio

### Problème

Initialisation audio asynchrone pouvait laisser course en attente.

### Solution

Audio devient amélioration progressive : course ne dépend pas indéfiniment de fin audio. Échec audio produit retour, pas blocage simulation.

## 17. GPU navigateur différent de GPU demandé

### Problème

Windows indiquait haute performance, mais Chrome exposait Intel ou identité masquée. Code ne peut forcer adaptateur choisi par navigateur.

### Solution finale

- Demande contexte WebGL `high-performance`.
- Diagnostic renderer réel TensorFlow.js.
- RTX 3070 reconnue comme cible optimale, sans fausse annonce.
- Tout autre renderer WebGL accepté en mode compatible.
- Repli TensorFlow.js CPU si WebGL est indisponible.
- Renderer et backend réels affichés dans le laboratoire.

Tests couvrent RTX, Intel et absence de WebGL. La simulation publique reste fonctionnelle ; vitesse d’entraînement peut diminuer.

## 18. TensorFlow.js absent sur GitHub Pages

### Problème

Une ancienne version de `index.html` référençait `node_modules/@tensorflow/tfjs/dist/tf.min.js`. `node_modules` est ignoré et absent de GitHub Pages.

### Solution finale

`index.html` charge TensorFlow.js 4.22.0 depuis jsDelivr et p5.js 1.9.4 depuis cdnjs. Tous les fichiers du projet utilisent des chemins relatifs. Un test navigateur depuis un sous-chemin local a chargé page, styles et scripts.

## 19. Audio local sans licence vérifiable

### Problème

`assets/motogp_audio.mp3` provient d’un fichier utilisateur. Son origine et ses droits de redistribution ne sont pas documentés.

### Solution

Le fichier reste local et `.gitignore` l’exclut du repo public. Le commentaire dynamique devient source initiale. Un fichier MP3/WAV/OGG peut toujours être importé par l’utilisateur pendant sa session. Le moteur libre `motorbike-ezwa.ogg` garde sa provenance documentée.

## 20. Rapport devenu obsolète après corrections

### Problème

Ancien audit décrivait bugs déjà corrigés et comptage de tests ancien. Risque : corriger deux fois problème disparu.

### Solution documentaire

Chaque analyse doit indiquer date, version/commit, commandes, graines, répétitions et dénominateur. Séparer : défaut historique corrigé, défaut actuel confirmé, hypothèse à tester.

## 21. Validation

Commandes reproductibles :

```text
npm test
npm run validate:seed
npm run audit:traffic
```

Résultat du 18 octobre 2026 : 278 tests réussis, 0 échec. La campagne seed 2027 sélectionne en génération 1 un modèle validé sur trois tours continus, 63 checkpoints, sans sortie.

`vehicle.js` est resté inchangé pendant ces évolutions.
