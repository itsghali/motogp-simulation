# Grand Prix neuronal — couche spectacle

Extension appliquée au dossier 9. L’expérience utilise les génomes et la locomotion existants ; le tracé reste la simplification pédagogique de Jerez déjà documentée. Le décor est une interprétation originale, pas une reproduction architecturale exacte ni une retransmission officielle.

## Interface et interactions — 17 octobre 2026

- Barre de préparation compacte : modèle, import et bouton explicite **Affecter aux 6 motos**. Ce dernier est désactivé tant qu'aucun modèle n'est choisi ; affecter prépare la prochaine grille sans remplacer une course active. Changer le sélecteur seul n'affecte toujours pas les six pilotes.
- Barre d'actions distincte : lancer, Pilotes, pause, audio, obstacles, réglages, laboratoire et plein écran. Les commandes de bibliothèque (vider/restaurer) sont dans **Pilotes · affectations**, pas à côté du lancement. Les erreurs d'homologation restent visibles et ne sont pas transformées en succès d'entraînement.
- Réglages en panneau latéral défilable, cinq rubriques : Course, Assistances/obstacles, Styles, Audio, Caméra/affichage. Une rubrique ouverte à la fois. Pilotes et Laboratoire utilisent aussi des panneaux latéraux ; leur ouverture ne déplace pas le circuit. Un seul de ces trois panneaux est ouvert à la fois.
- Croix nommées, retour du focus et **Échap** pour fermer le panneau actif ou la fiche pilote. Valeurs et affectations conservées. La croix du Laboratoire est hors de son contenu `inert` : elle reste disponible pendant une course, tandis que les commandes d'entraînement restent protégées.
- Le bouton **Résultats** apparaît lorsqu'un résultat de course/validation est disponible et permet de le rouvrir après fermeture. Il disparaît lorsque le résultat devient périmé ou qu'une nouvelle course démarre.
- Classement accessible avec Tab puis Entrée/Espace. Espace sur le résumé d'une rubrique agit sur cette rubrique, sans mettre le jeu en pause. Les raccourcis de course restent ignorés pendant la saisie.
- Canvas centré au rapport920×720, ajusté aux deux dimensions disponibles sans étirement ; bandeau inférieur72 px hors piste. Fiche pilote limitée à la hauteur au-dessus de ce bandeau. Adaptation mobile sans débordement horizontal ; les panneaux ne sont pas des dialogues modaux avec piégeage de focus.

Modifications de présentation et d'interaction uniquement. Aucune modification des cerveaux, de la physique, de l'entraînement, de `vehicle.js` ou des limites d'évitement déjà documentées.

**Fermer les panneaux (17 octobre 2026)** : croix × nommée et accessible au clavier pour Réglages spectacle, Affectations des pilotes, Laboratoire et Résultats (course ou validation). Barre de fermeture collante pendant le défilement des panneaux longs. Fermer masque/replie uniquement, sans réinitialiser valeurs, affectations, résultats enregistrés ou course ; focus rendu au bouton d'ouverture (ou résumé natif de la grille). Le bouton Réglages expose aria-expanded/aria-controls ; la croix de fiche pilote possède aussi un nom accessible. Les boutons existants permettent toujours de refermer les Réglages et le Laboratoire.

**Bandeau inférieur hors piste (17 octobre 2026)** : zone dédiée de72 px sous le canvas pour sous-titres et télémétrie, plus mini-carte SVG à droite. La mini-carte n'est plus peinte sur les pixels de la course. Le canvas utilise la hauteur restante ; mêmes coordonnées physiques et conversion des clics. Les textes longs défilent dans leur cellule sans couvrir la piste. Le HUD d'entraînement occupe aussi cette réserve. Masquer le HUD masque ses informations ; aucune modification des forces ou modèles.

**Proportions d'origine rétablies (17 octobre 2026)** : élargissement horizontal grand écran retiré sur demande. Canvas centré, format920×720 non étiré, ajustement proportionnel à la largeur et hauteur disponibles. Réserve inférieure de72 px et croix de fermeture conservées. Aucun changement du monde physique, des modèles ou de l'évitement. Conversion des clics et caméra inchangées.

## Fiabilisation Grand Prix : Assistances, Obstacles et Géométrie — 17 octobre 2026

- **Géométrie des pistes larges (jusqu'à 100 px)** : sur les circuits à rayons serrés comme Jerez, une largeur de piste supérieure à ~60 px génère des auto-intersections de bordures (boucles ou "oreilles" croisées). `Circuit.detectCrossedBorders()`, `hasCrossedBorders()` et `isInCrossedEar(point)` isolent ces régions. Tout point situé dans une oreille croisée est strictement exclu de la piste navigable (`isOnTrack() -> false`). Un avertissement clair est émis au départ si la piste présente des croisements.
- **Passages totalement bloqués par des obstacles** : `Circuit.isCorridorBlocked(obstacles, minGap = 8.5)` vérifie par échantillonnage le long du circuit si la somme des diamètres d'obstacles et des marges laisse au moins un passage franchissable (8,5 px pour une moto de rayon 4 px). En cas de blocage complet, le lancement de la course est formellement refusé avant le départ avec un message explicite dans un bandeau d'alerte, sans aucune téléportation ni suppression clandestine d'obstacle.
- **Intégrité et neutralité des assistances** : lorsque l'évitement est désactivé ou réglé à un poids de 0, `vehicle.raceAvoidanceState = null` garantit qu'aucune force d'évitement résiduelle n'est appliquée. De même, quand l'anticollision est coupée (`strength: 0` ou `separation: false`), aucune force de séparation n'est superposée (`raceTrafficDecision = "disabled"`). L'autorité neuronale est strictement préservée.
- **Distinction des résultats de course** :
  1. *Défaut du simulateur* (ex: fuite de mémoire, boucle infinie, saut géométrique) : éliminé et couvert par tests.
  2. *Accident attendu* : survenue normale de collisions physiques corps balayé lorsque l'assistance d'évitement ou de séparation est désactivée par l'utilisateur.
  3. *Configuration impossible* : passage physiquement fermé, refusé avant départ.
  4. *Limites neuronales* : incapacité d'un cerveau à négocier une trajectoire extrême sans assistance.

## Anticollision commune — 17 octobre 2026

Cette section remplace les descriptions historiques de poussée latérale des correctifs précédents. Aucun traitement par profil, poids neuronal ou nom de modèle.

- Grille : placement initial ajusté par pas de 2 px jusqu'à conserver au moins 4 px entre capsules entières. Pas de déplacement correctif pendant la course.
- Priorité : position locale actuelle projetée sur la piste, bouclage des tours compris ; égalité départagée par identifiant. Le rang figé avant départ et le nombre de tours d'avance ne décident plus seuls. Hors chaussée, repli géométrique selon le cap.
- Suivi : le suivant cède par freinage, sans poussée latérale contre le bord. Confort derrière le plus proche, distance de freinage vérifiée contre tous les véhicules perçus. La marge tient compte de la demi-longueur complète de la moto ; intensité positive croissante jusqu'à 3, zéro désactive.
- Virage : vitesse suivante atteignable dans `maxforce`, correction de courbure selon la vitesse physique demandée par le cerveau après ralentissement, sans lire son génome. Garde du balayage de la roue arrière contre les voisins ; pas seulement un test du centre.
- Interaction obstacles/trafic : pendant un passage proche, freinage de la composante dirigée vers un mur, composante tangentielle préservée. Désactivé lorsque l'une des deux aides est coupée. La restitution du pilotage vérifie aussi le vrai prochain pas : déplacement avec vitesse courante, puis changement de vitesse/cap, comme `Vehicle.update`.

Forces bornées, `applyForce` et locomotion héritée uniques. Neuf entrées neuronales, JSON, apprentissage, règles d'abandon et `vehicle.js` inchangés. Ressources modifiées versionnées pour éviter un mélange navigateur ancien/nouveau.

Preuves reproductibles : `npm test`, `npm run audit:traffic`, `npm run validate:seed`. `tests/traffic-general.test.cjs` couvre les cinq cerveaux GP52, cinq rotations de grille mixte, homologation réelle et scénario utilisateur avec cinq obstacles, avec/sans variantes style 30 % et douze drones. L'audit trafic distingue explicitement contacts moto–moto et abandons contre les obstacles : zéro contact ne signifie pas six arrivées. Des échecs d'évitement statique restent présents avec d'autres cerveaux ; aucune certification universelle des obstacles ni du rendu navigateur/GPU.

## Mise à jour : moteurs, MP3 et pilotes

**Refus de lancement visible et persistant** : si la grille ne passe pas l’homologation, la raison complète reste dans un bandeau rouge accessible (`role=alert`) et la grille s’ouvre. Une réussite d’entraînement `MODEL VALIDATED` ou une annonce audio ne remplace plus ce refus. Le bandeau disparaît à une nouvelle tentative, au lancement réussi ou au retour explicite Training/Debug. La validation du laboratoire concerne ses propres paramètres ; elle ne garantit pas réussite sous le règlement Grand Prix. Choisir un autre modèle et cliquer de nouveau **Affecter le modèle ci-dessus aux six motos**, ou modifier les affectations individuelles. Le sélecteur supérieur seul ne remplace jamais les six choix existants. Aucun modèle n’est substitué automatiquement.

**Lancement et audio** : le bouton Lancer Grand Prix déclenche l’activation audio sans attendre sa promesse, puis vérifie la grille et l’homologation. Un navigateur attendant `AudioContext.resume`, le téléchargement ou le décodage moteur ne bloque plus le départ. Le bouton affiche **Vérification grille…**, empêche les doubles clics puis redevient disponible ; en cas de refus, la grille s’ouvre et la raison reste affichée. Le résultat audio tardif met à jour son propre bouton sans écraser le message de course. Le contrôle des modèles et les trois tours d’homologation restent obligatoires ; un refus d’homologation n’est pas un lancement silencieux.

**Sens local de piste (correctif 5)** : `race-track-frame.js` construit un repère à partir du segment de ligne médiane le plus proche, orienté dans l’ordre du circuit. Écartement selon sa normale, classement devant/derrière et freinage selon sa tangente. La fermeture du circuit et les points répétés sont pris en compte ; sans géométrie utilisable, repli vers le cap de la moto. Il s’agit d’une contrainte locale de steering : aucun point à rejoindre, aucune position imposée ni vitesse d’avance inventée.

Lorsque l’anticollision est active avec intensité positive, la composante négative de vitesse désirée le long de cette tangente est retirée, même sans menace proche. Une commande normale sans menace reste exactement conservée. La vitesse désirée finale est bornée par `maxspeed`, puis la force `desired - current` par `maxforce`, avec application et locomotion inchangées. Important : une vitesse réelle déjà inversée ne peut pas être retournée instantanément par une force bornée ; Vehicle applique aussi le déplacement courant avant l’accélération. Le garde-fou contraint le désir, pas une téléportation ou remise à zéro de vitesse. Désactiver l’option ou mettre intensité zéro conserve le fonctionnement précédent sans ce filtre.

Même scénario numérique que correctif4 (six `equilibre.json`, graine2027, piste52, trois tours, anticollision active) : 4/6 finisseurs, deux stagnations, aucun contresens. Contacts géométriques répétés : 644 paires/pas, contre 1661 au correctif4 et 32446 sans aide. Ce résultat ne garantit pas zéro contact ni six finisseurs pour toute grille. Les règles de collision moto–moto sont réservées au correctif6 ; aucun CRASH/DNF supplémentaire n’est déclenché ici.

**Réaction aux motos (correctif 4)** : l’option **Anticollision motos · freinage et écartement**, désactivée par défaut, exploite les menaces du correctif 3 et les capsules proches du correctif 2. `motorcycle-avoidance.js` retourne une force réutilisable ; `race-steering.js` la compose au-dessus de la force neuronale ou de l’évitement d’obstacle. `Motorcycle.step` applique toujours une seule force avec `applyForce`, puis la locomotion existante.

Moto devant dans le corridor local : vitesse désirée plafonnée selon vitesse du leader, vitesse de rapprochement, dégagement disponible et capacité de freinage ; marge de 6 px et prise en compte du déplacement précédant l’accélération dans Vehicle. Le freinage réduit aussi la composante latérale neuronale pour conserver l’angle désiré au lieu de pivoter à l’arrêt. Aucune vitesse désirée négative selon le cap courant. Voisins côte à côte : correction latérale pondérée, réduite lorsque le pivot de la roue arrière pourrait manger le dégagement disponible ; vérification de place sur la piste. Place bloquée ou voisins de part et d’autre : freinage. Le pilote derrière gère son propre espacement longitudinal.

Le rayon contrôle le voisinage rapproché ; l’horizon prédictif couvre aussi les rattrapages plus lointains. Intensité zéro désactive cette réaction ; intensité positive règle la correction latérale (saturation à 1), sans atténuer le plafond de freinage. Le contrôle neuronal reste inchangé sans menace. L’ancienne répulsion centrale prioritaire qui pouvait lancer une moto en arrière n’est plus utilisée par la composition Grand Prix ; le comportement générique `separation` reste disponible indépendamment.

Limites mesurées : six cerveaux `equilibre.json`, piste52, graine2027, trois tours, sans obstacle, donnent 4 finisseurs avec aide ; deux DNF subsistent (stagnation après deux tours, contresens après 951 pas). Aucun DNF durant les 180 premiers pas. Paires/pas signalées en contact : 1 661 avec aide contre 32 446 sans aide ; ce sont des observations géométriques répétées, pas autant de collisions uniques ou de CRASH. Rattrapage et écartement sur ligne droite passent sans contact dans les tests dédiés. La direction de réaction dépend encore du cap courant : projection selon le sens local de piste au correctif 5. Les commandes neuronales, virages et contacts déjà engagés peuvent encore provoquer des chevauchements ; aucune garantie générale d’absence de collision. Pas de politique de DNF moto–moto ajoutée à cette étape.

**Anticipation des collisions (correctif 3)** : `motorcycle-prediction.js` calcule le premier instant de contact de deux capsules orientées en supposant vitesses et caps constants. Le calcul continu utilise la vitesse relative et les axes complets des deux motos, sans échantillonnage temporel qui pourrait manquer un contact très bref. Horizon par défaut `predictionHorizon = 60` pas (une seconde à 60 Hz) ; `predictionMargin = 0` px. Une marge positive optionnelle anticipe l’entrée dans une enveloppe de sécurité, pas nécessairement un contact physique. Ces paramètres sont internes aux options de session, sans nouveau curseur UI dans cette étape.

Chaque moto reçoit `raceThreats` avant sa locomotion : voisin, délai en pas et secondes, vitesse relative, dégagement actuel et positions prédites au contact. Les menaces sont triées par délai, dégagement puis identifiant. Le filtre de perception est dynamique : distance maximale atteignable pendant l’horizon, augmentée de l’encombrement des corps. Une moto rapide peut donc être détectée au-delà du rayon local de 28 px du correctif 2. Vitesses égales sans contact, éloignement et voies parallèles libres ne produisent pas de menace ; soi-même, morts et arrivés sont exclus. Contact existant ou tangence donnent délai zéro. Le calcul est réévalué chaque pas et ne modifie ni forces, ni neuf entrées neuronales, ni positions réelles. Freinage et écartement sont réservés au correctif 4. Les changements futurs de cap, accélération ou freinage ne sont pas prédits par cette approximation locale.

**Perception du corps complet (correctif 2)** : `motorcycle-body.js` fournit une capsule orientée (axe de 16 px entre centres des roues, rayon de 4 px, longueur totale 24 px). Cette enveloppe conservatrice couvre la silhouette visible. Les voisins de course conservent copies indépendantes de position, vitesse, cap, pose précédente et états mort/arrivé. `raceBodyNeighbors` expose les voisins vivants dans le rayon de perception mesuré bord à bord, avec points d’axes les plus proches et distance libre ; soi-même, morts et arrivés sont exclus. Le rayon reste celui de l’assistance (28 px par défaut).

`bodyContacts` contient les paires dont les capsules se touchent pendant le dernier pas. Le balayage interpole les deux déplacements au même instant et les caps par le plus court angle ; une subdivision à borne de mouvement couvre les croisements rapides et rotations. Contact conservateur à tolérance 0,001 px (ou profondeur maximale 20). Aucun échantillonnage futur n’est utilisé ici : l’anticipation des collisions appartient au correctif 3. La géométrie de l’axe est également réutilisée par la collision existante contre les obstacles. À cette étape, perception seule : aucun freinage supplémentaire, CRASH moto–moto ou correction de position ; les chevauchements restent possibles tant que les correctifs de réaction et contact ne sont pas appliqués. Les neuf entrées neuronales et JSON restent inchangés.

**Règlement Grand Prix commun (correctif 1)** : `grand-prix-rules.js` fixe vitesse 5,5, force 0,18, accélération 1, puissance de freinage 1,2, portée des capteurs 90, bruit 1 et adhérence 1. Graine 2027, budget 120 secondes simulées par tour. Aucun paramètre physique n’est repris du premier pilote ou du laboratoire. Chaque affectation, avec ses traits effectifs après éventuelle variante MotoGP, subit trois tours continus et 63 checkpoints sur une copie isolée de la grille, sans assistance ni obstacle. Tout abandon, sortie ou tour incomplet refuse le lancement avec numéro, modèle et raison. L’inférence CPU utilise les vrais poids ; elle ne remplace jamais le lot GPU actif. Une première homologation peut prendre quelques secondes. Les huit derniers résultats sont gardés en mémoire et invalidés par changement de poids, traits, ordre ou largeur. Ce contrôle ne certifie pas les interactions entre motos ni l’évitement d’obstacles et ne crée pas de certificat de validation d’entraînement.

**Piste Grand Prix élargie** : largeur initiale 52 px, réglable de 24 à 100 dans Réglages spectacle. Poids/traits, circuit d’entraînement et validation restent inchangés. Largeur figée au lancement et enregistrée dans le contexte replay. Le plafond 100 est autorisé sur demande ; la géométrie existante admet environ 53 px avant de perdre sa marge de sécurité. Au-delà, les bords peuvent se croiser : avertissement visible, aucune garantie de passage ou d’homologation des cerveaux GP52 sur une piste 100 px. Aucun changement de tracé ou d’algorithme d’évitement dans cette modification.

**Obstacles physiques** : collision sur le corps orienté de la moto, roues incluses (axe de 16 px, rayon de 4 px), et sur l’espace balayé entre deux pas. Anticipation adaptée à la roue avant ; arrêt par DNF et un seul événement CRASH si collision. Aucune téléportation ni double locomotion. Un obstacle ajouté pendant une course prépare toujours la suivante : placement met la course en pause, aperçu non rempli marqué INACTIF, aucun doublon d’aperçu sur un obstacle déjà actif. Relancer Grand Prix pour appliquer les ajouts/suppressions. Le classement indique la cause du DNF. Un passage bloqué ou un cerveau inadapté peut encore provoquer arrêt, collision ou abandon ; élargir ne réentraîne pas le modèle.

**Expérience** : Race/Cinematic/Spectator démarrent désormais la présentation au premier choix si les six affectations sont complètes ; sinon la grille s’ouvre avec l’erreur précise. Cinematic choisit la caméra CINEMATIC, Spectator suit le leader, Race donne la vue générale. Changer entre ces trois modes conserve la même course. Training/Debug restaurent l’entraînement ; Debug active ses capteurs/checkpoints et les restaure à la sortie.

**Restaurer les sauvegardes du site (N)** retrouve les modèles créés avec « Sauvegarder meilleur modèle » dans toutes les archives locales, même si la dernière suppression ne concernait que des imports. Ajoute uniquement les identifiants manquants ; modèles actuels et fichiers JSON conservés, poids et traits récupérés exactement. Les imports archivés ne sont pas ajoutés par ce bouton. Le bouton disparaît après récupération complète. **Restaurer les modèles** reste l’annulation de la dernière suppression d’une bibliothèque vide ; après succès, le premier modèle récupéré est affiché et le bouton disparaît. Les six affectations restent à choisir avant une course.

**Vider les modèles** retire tous les modèles sauvegardés/importés des sélecteurs et remet les six affectations à zéro. Une archive locale est écrite avant la suppression ; si le stockage est plein, la bibliothèque reste intacte. **Restaurer les modèles** récupère la dernière bibliothèque retirée, uniquement si la liste est encore vide. Les archives précédentes restent conservées dans ce navigateur. Une ancienne sauvegarde ne repeuple pas automatiquement la liste. Les fichiers JSON du dossier, la population active et les instantanés de course/replay ne sont pas modifiés. Importer ensuite uniquement les modèles souhaités ; aucun modèle n’est ajouté automatiquement.

La page adopte désormais une présentation de retransmission rouge/noir en Training comme en Race. **Laboratoire** affiche les contrôles et statistiques techniques ; ils sont escamotés au départ. Classement de course compact, numéros/couleurs des pilotes, sélection, carte et bandeau de session restent visibles. Le tracé physique n’est pas modifié ; dégagements et vibreurs sont mis en cache par-dessus le décor.

**Activer audio** rend maintenant les motos audibles aussi en Training. Le bouton **Lancer Grand Prix** active l’audio dans le geste de lancement, sauf si l’utilisateur l’a déjà coupé. Enregistrement moteur bouclé par moto (quatre motos maximum), plus huit oscillateurs harmoniques atténués, filtre d’échappement, régime estimé à partir de vitesse/gaz et atténuation selon proximité du pilote suivi. Aucun rapport mécanique ni vitesse km/h fictive n’est ajouté. Pause, mute ou désactivation des moteurs arrêtent le mix.

Le commentaire principal est désormais la synthèse anglaise des événements réels. Le sélecteur English/Français conserve le français en option ; seules les voix de la langue choisie sont proposées. Absence de voix signalée, sous-titres maintenus. Le fichier utilisateur `assets/motogp_audio.mp3` reste chargé comme ambiance enregistrée optionnelle. Dans Réglages spectacle : source MP3/dynamique, import local MP3/WAV/OGG (25 Mo maximum), recommencer le fichier, volume commentaire et activation séparée. Le MP3 suit pause/reprise et ne reboucle pas à la fin. Il n’est pas synchronisé aux dépassements ; les sous-titres RACE CONTROL restent les événements réels de la simulation. La synthèse vocale ne joue pas simultanément. Le fichier défaillant laisse fonctionner les moteurs et autorise le repli vers la voix dynamique.

La grille Invitational contient six identités réelles, avec numéros personnels (pas une grille officielle d’une saison revendiquée) : Marc Márquez 93, Francesco Bagnaia 63, Jorge Martín 89, Fabio Quartararo 20, Pedro Acosta 37, Brad Binder 33. **Modèle de course** exige un choix explicite dans les sauvegardes ou les JSON importés. Aucun repli vers le champion ou le leader courant. Ouvrir **Affectations des six pilotes** et choisir un modèle pour chaque ligne ; les six choix sont obligatoires. **Affecter le modèle ci-dessus aux six motos** constitue un raccourci explicite, puis chaque ligne reste indépendante. L’import accepte plusieurs JSON. Même cerveau autorisé plusieurs fois. Poids, traits et profil enregistrés restent exacts par défaut. La physique commune appartient au règlement Grand Prix décrit ci-dessus ; les configurations des JSON restent réservées à leur entraînement. Les affectations sont homologuées puis figées au lancement ; les changements suivants préparent la prochaine course. Modèle réel indiqué dans chaque fiche et ligne de résultats.

**Modifier le profil pour créer des variantes MotoGP**, désactivé par défaut, interpole les traits du modèle choisi vers six cibles pédagogiques distinctes : `traitCourse = traitOriginal × (1 − intensité) + traitCible × intensité`. Si activé, intensité initiale **100 %** : traits de la cible entièrement appliqués, sans mélange. Réglable de 0 à 100 % pour la prochaine course. Les poids restent identiques ; cela affecte réellement la décision et ses forces, sans trajectoire imposée. Le modèle enregistré et ses preuves de validation restent intacts. Le résultat de cette course ne vaut jamais validation du modèle.

Le défaut 100 % applique entièrement le profil demandé. Une intensité réduite reste disponible au choix de l’utilisateur ; 30 % constituait une réduction de stabilité, retirée comme défaut à sa demande. Le test numérique à intensité explicitement réduite à 30 %, graine 2027, entraîne réellement un champion puis fait terminer **trois tours et 63 checkpoints aux six variantes**, avec temps d’arrivée distincts et génome original intact. Cette réussite sur un scénario de test ne garantit pas tous les circuits, réglages, modèles et intensités. Chaque pilote reste soumis aux mêmes capteurs, limites de force et règles de course.

| Pilote | Interprétation pédagogique |
| --- | --- |
| Marc Márquez | Freinage tardif, direction et attaque élevées |
| Francesco Bagnaia | Anticipation, correction et contrôle en entrée |
| Jorge Martín | Attaque et accélération élevées |
| Fabio Quartararo | Fluidité, anticipation et correction progressives |
| Pedro Acosta | Direction incisive et freinage tardif |
| Brad Binder | Attaque avec contrôle en entrée |

Les valeurs ne proviennent pas de télémétrie professionnelle ; ce sont des choix de modélisation explicités et testés. Descriptions de référence : [Márquez, évolution du freinage — Brembo](https://www.brembo.com/en/motorsport/motogp/marc-marquez-braking-years), [Quartararo, style fluide — MotoGP](https://www.motogp.com/en/news/2019/07/10/bilan-de-mi-saison-quartararo-la-promesse/154603), [Martín, agressivité déclarée au freinage — MotoGP](https://www.motogp.com/id/news/2016/08/26/martin-tous-les-pilotes-revent-de-monter-sur-le-podium/168274), [Bagnaia, entretien sur le freinage — Motor Sport](https://www.motorsportmagazine.com/articles/motorcycles/motogp/motogp-king-bagnaia-i-brake-with-the-forks-bottomed-out-i-love-to-feel-the-front-tyre/), [Binder compare son entrée à Acosta — entretien Crash](https://www.crash.net/motogp/news/1062670/1/brad-binder-names-game-changing-pedro-acosta-attribute-he-must-copy-ktm). Les styles réels évoluent avec machine, piste et conditions ; les profils ne prétendent pas les reproduire exactement.

## Utilisation

1. Ouvrir `index.html` depuis le serveur local habituel. Attendre le GPU.
2. Choisir **Modèle de course** dans la barre supérieure, ou **Importer modèle JSON**. Pour un nouveau modèle, entraîner puis **Sauvegarder meilleur modèle** dans le Laboratoire.
3. **Lancer Grand Prix** copie les six modèles affectés, dans le même ordre que les pilotes et le batch GPU. Une ligne vide ou un modèle supprimé bloque le départ. Poids et traits conservés par défaut ; variantes MotoGP uniquement sur activation explicite. Un modèle peu entraîné peut abandonner : aucun résultat n’est fabriqué. Importer pendant une course prépare la prochaine, sans modifier le lot neuronal de la course actuelle.
4. Sélectionner Race, Cinematic ou Spectator ; suivre un pilote par clic ou choisir une caméra.
5. **Activer audio** débloque Web Audio après un geste. Sans audio ou synthèse vocale, simulation et sous-titres restent disponibles.
6. **Réglages spectacle** configure tours, feux, qualité, foule, détails, ombres, particules, voix, volumes, HUD, accessibilité et enregistrement.
7. Revenir à Training pour continuer les essais conservés. Debug garde l’entraînement et active capteurs/checkpoints.

Les réglages d’apprentissage sont inactifs pendant la course, pour éviter de remplacer son lot d’inférence. Ils redeviennent accessibles au retour Training. Le nombre de tours et les durées des feux s’appliquent à la prochaine course. La séquence est configurable et pédagogique, sans revendication réglementaire.

## Architecture et invariants

| Fichier | Responsabilité |
| --- | --- |
| `simulation.js` | Core d’apprentissage existant, indépendant des nouveaux modules |
| `race-session.js` | Session de course indépendante, copies des génomes/configuration, chronos et classement |
| `race-analytics.js` | Treize zones de virage sur le schéma, vitesses entrée/minimum/sortie, steering moyen et échecs |
| `race-events.js` | Bus borné et drapeaux GREEN/YELLOW/RED/CHEQUERED |
| `commentary.js` | Variantes françaises, priorités, file bornée, déduplication, délai de parole |
| `audio-manager.js` | Mix, musique originale synthétisée, moteurs et bruit ambiant procédural |
| `engine-sound.js` | Quatre voix moteur à deux couches, régime audio, gaz et proximité |
| `rider-roster.js` | Identités et traits inspirés, copies isolées des génomes de course |
| `broadcast.css` | Habillage retransmission commun et tiroir laboratoire |
| `camera-director.js` | Sept caméras, suivi lissé, priorité événements, zoom selon vitesse |
| `replay.js` | Instantanés copiés de positions, orientations, vitesse, commandes et capteurs |
| `replay-motorcycle.js` | Reconstruction visuelle par sous-classe de Motorcycle/Vehicle |
| `venue.js` | Entité décor héritant de Vehicle, tribunes, stands, paddock, contrôle course, fan zone, panneaux et personnel |
| `grand-prix.js` | Orchestration de présentation, HUD, résultats, podium, replay, commandes et accessibilité |
| `motorcycle.js` | Mémorisation de la décision réellement appliquée pour la télémétrie, couleurs par agent ; forces et locomotion conservées |
| `sketch.js` | Point d’intégration optionnel de la présentation |

Une course utilise un circuit indépendant, une grille de départ immobile, un scénario partagé reproductible et la même inférence que le core. Seul le placement initial constitue une disposition scénarisée. Ensuite : perception existante → décision existante → steering limité → applyForce → Vehicle.update. Aucun centre de piste, panneau, événement, classement ou trajectoire enregistrée n’entre dans les neuf entrées neuronales.

Le classement suit la progression validée et les tours. Les écarts en cours sont des **mètres de progression**, pas des secondes fictives à partir d’une distance euclidienne. Après arrivée, les écarts sont les différences de temps d’arrivée. Un dépassement exige progression suffisante et inversion tenue pendant une seconde, sans annoncer les éliminations comme des dépassements. Une bataille exige deux secondes de proximité.

La course ne remplace pas le protocole scientifique : seule `ValidationManager` peut confirmer trois tours continus sur trois scénarios réservés. Un test compare toutes les positions/états échantillonnés et le résultat complet avec et sans enregistrement : résultats identiques.

## Présentation et budgets

- Training : décor statique en cache si Détails circuit actif ; moteurs facultatifs après activation audio. Aucun MP3, public animé, musique ou cérémonie à chaque génération. Low désactive les détails. Le core fonctionne sans charger les modules spectacle.
- Race : six pilotes dans la grille Invitational ; le core accepte douze agents maximum. Simulation à pas fixes 60 Hz avec accumulateur borné ; une pause arrête les pas, les horloges et immédiatement le son.
- Décor : deux surfaces 920 × 720 précalculées ; foule sans milliers de nœuds DOM. Les paramètres ne modifient ni les murs ni les capteurs.
- Audio : huit volumes séparés (master, musique, moteurs, voix, public, ambiance, interface, contrôle course), huit oscillateurs pour quatre moteurs persistants. Musique procédurale originale ; commentaire MP3 fourni séparément.
- Replay course : cent instantanés à 10 Hz, environ dix secondes ; aucune image sauvegardée. Décocher l’enregistrement arrête les captures futures.
- Validation : jusqu’à 15 000 instantanés à 10 Hz pour un seul agent, soit 25 minutes maximum. Le protocole existant dure au maximum trois fois quatre minutes.
- Événements : historique limité à 200, commentaires à huit ; HUD actualisé au plus 6,7 fois/seconde ; cent particules maximum.
- Qualité Low désactive foule, particules, ombres et décor ; Medium/High/Cinematic réactivent ces éléments, personnalisables séparément. Ce sont des presets légers, pas trois pipelines graphiques différents.
- Mouvements réduits, secousse désactivée par défaut, tailles HUD, sous-titres et audio muet. Mise à l’échelle du canvas sans changer la géométrie physique.

## Replay et validation

Le replay affiche des objets distincts et ne réécrit jamais l’état des motos réelles. Sa vitesse ne change pas celle du core. Pendant un replay de course, la course réelle, les drones et le lot GPU sont figés. Les drones sont reconstruits depuis les positions enregistrées ; aucune simulation de boids en replay. Les obstacles restent ceux du contexte de la course. Pendant un replay de validation, l’entraînement attend la fin du visionnage.

La carte **MODEL VALIDATED — 3 SUCCESSFUL LAPS** contient horodatage UTC explicite, génération, agent, fitness et temps des trois tours. L’enregistrement complet provient des positions réelles et contient les commandes effectivement appliquées. Export trajectoire JSON disponible sur cette carte. L’export n’est pas une preuve de validation réimportable et ne remplace pas la bibliothèque de modèles existante.

La carte de fréquentation et la trajectoire utilisent uniquement les positions enregistrées après conduite. La carte rouge marque les positions d’élimination, y compris stagnation et dépassement de temps ; elle ne prétend pas représenter exclusivement des chutes mécaniques.

## Raccourcis

| Touche | Action |
| --- | --- |
| Espace | Pause/reprise |
| D | Debug/Training |
| C | Caméra suivante |
| F | Suivre leader |
| M | Couper/rétablir audio |
| H | Afficher/masquer HUD |
| R | Revoir buffer course ou dernière validation enregistrée |

Les touches sont ignorées pendant la saisie dans un champ ou sur un bouton. Pause propose reprise, recommencer course, réglages, caméra et retour entraînement. Plein écran dépend du support navigateur.

## Limites explicites

Les motos disposent désormais d’une séparation réactive optionnelle ; aucun contact rigide entre motos, aspiration ou stratégie de dépassement planifiée. Les obstacles déclenchent une collision cercle/segment et un abandon, même si l’évitement est désactivé. Les événements constatent seulement leurs progressions relatives. Les sons sont stylisés ; pas de système de rapports inventé, pas de voix imitée. Les écrans du décor portent un visuel statique original ; le classement dynamique est dans le HUD. La caméra flyover trace le circuit en vue globale ; les sept caméras restent top-down.

Les variantes facultatives du cahier des charges — safety car, faux départ pénalisé, hymne, secteurs, hélicoptère, pit lane accessible — ne sont pas simulées. Les treize zones d’analyse des virages sont schématiques : moyennes des visites, vitesse minimale, vitesse de sortie, steering absolu moyen et proportion de visites terminées par une élimination. Mesures échantillonnées à 10 Hz, affichées dans les résultats, sans prétention de coordonnées officielles. BLUE/WHITE ne sont pas affichés sans règles correspondantes. Les scénarios météo futurs ne sont pas annoncés comme implémentés ; le réglage d’adhérence existant agit réellement sur le steering.

## Vérification

Depuis ce dossier : `npm test` et `npm run validate:seed`. Les tests couvrent grille immobile, temporalité des feux, bornes des forces, isolement génome/configuration, vrais pas de locomotion, classement/écarts, dépassements/batailles, drapeaux, DNF/arrivée, commentaires, audio absent/mix borné, caméra et replay. La validation numérique originale conserve trois tours, 63 checkpoints et 6834 pas pour la graine de référence.

`vehicle.js` reste inchangé. Enregistrement externe du domaine public fourni localement, provenance dans assets/motorbike-ezwa-SOURCE.md ; aucune nouvelle dépendance.


## Réglages ajoutés — prochaine course

| Réglage | Effet |
| --- | --- |
| Anticollision motos, rayon 1–150 px, intensité espacement 0–5 | Priorité locale et freinage sans poussée latérale ; marge croissante saturée à 3, zéro désactive. Garde de rotation du corps. Poids neuronal 0–5 indépendant. Désactivée par défaut. |
| Évitement, anticipation 10–200 px, poids 0–5 | Sondes ahead/ahead2 et corridor continu ; portée au moins vitesse × 30 pas, agrandie selon freinage ; danger immédiat prioritaire. Désactivé par défaut. |
| Obstacles | Ajouter/supprimer avant lancement ou préparer prochaine course ; x 0–920, y 0–720, rayon 2–60 px, 24 maximum. Collision utilise rayon moto 4 px plus segment parcouru. |
| Drones | Activation, quantité 0–32, perception 10–250 px et poids séparation/alignement/cohésion 0–5. Générateur indépendant, confinement réactif, aucune influence sur motos/GPU. |

Toutes ces options sont copiées au lancement. Pendant la course, les champs préparent la suivante. Les obstacles réels restent visibles avec leur rayon ; la liste d’édition montre les coordonnées et rayons de la prochaine course. Les neuf entrées neuronales ne voient toujours que les limites de piste, la vitesse et la direction précédente ; les assistances sont calculées séparément. La somme finale reste bornée à `maxforce`. Une seule locomotion héritée par pas.

Le rendu procédural montre deux roues, carénage, pilote, casque et numéro ; aucun sprite manquant possible. Le replay utilise le même dessin. Les drones ne se déplacent que pendant la phase RACE ; avant le départ et après la course, leur groupe reste figé. Pause et redémarrage respectent les mêmes graines. Maximum 32 drones : 600 pas mesurés à 225,7 ms en test CPU numérique isolé ; résultat dépendant de machine, pas une mesure de FPS GPU.

Moteurs : quatre voix persistantes (huit oscillateurs), timbre légèrement différent par id ; mix selon proximité du pilote suivi, y compris en vue globale. Régime purement synthétique, estimé d’après vitesse/gaz, freinage atténuant l’amplitude. Commentaire : mêmes phrases pour voix et sous-titres, noms réels, dépassements confirmés après hystérésis ; priorités, limite huit annonces et expiration 15 s. Pause, replay et changement de source vident les annonces en attente ; aucune voix ancienne rejouée à la reprise. MP3 et synthèse exclusifs.

La séparation et l’évitement peuvent changer les décisions appliquées et provoquer des abandons avec des cerveaux entraînés sans ces aides. La course ne certifie pas la validation du modèle. Les modèles d’origine et les anciens JSON ne sont pas réécrits. Preuves, détails de chaque sprint et limites : [SPRINTS.md](SPRINTS.md), journal local [AI-CHANGELOG.md](AI-CHANGELOG.md).


## Correction après retour utilisateur : souris, moteurs et anglais

**Placer obstacles à la souris**, directement dans la barre supérieure, active le réticule. Clic sur la chaussée ajoute un obstacle ; Maj + clic sur un obstacle prévu le supprime. Le rayon se règle dans Réglages spectacle. Les positions tiennent compte de la taille affichée du canvas et de la caméra en course. En Training, l’aperçu n’affecte pas les motos ni l’apprentissage. En course, le placement prépare uniquement la suivante ; configuration de la course/replay actuel conservée. Le replay doit être quitté avant d’éditer. Le bouton de lancement termine le placement et applique les obstacles prévus.

Le moteur charge par défaut le véritable enregistrement générique « Motorbike - 4 » de ezwa (domaine public), fourni localement dans assets/motorbike-ezwa.ogg. Un extrait central est bouclé avec fondu de raccord et normalisation ; filtre et vitesse de lecture restent réactifs. Provenance dans assets/motorbike-ezwa-SOURCE.md. En cas de fichier indisponible, une synthèse de pulsations de combustion à allumage irrégulier et bruit d’échappement prend le relais. Quatre boucles persistantes, vitesse de lecture liée à vitesse/gaz ; aucune source créée par image. Ce son n’est pas identifié comme celui d’une MotoGP précise et ne fournit pas de régime mécanique mesuré. Pour remplacer l’enregistrement fourni, **Son moteur réel (optionnel)** importe une boucle locale WAV/MP3/OGG décodable, 15 Mo maximum, durée 0,08 à 30 s ; les anciennes boucles sont arrêtées/déconnectées au remplacement. Choisir une boucle stable ; vitesse de lecture basée sur un régime nominal synthétique de 6000 tr/min, pas une mesure du fichier.

Commentaire anglais par défaut, mêmes événements et mêmes phrases pour voix/sous-titres ; français sélectionnable. **Tester la voix** permet un contrôle audio indépendant, explicitement hors événement de course. Volume voix initial 100 %, master 90 % (ancien produit : 52 %, nouveau : 90 %). Pendant une annonce vocale, moteurs, musique, public, ambiance et direction course baissent à 16 % de leur niveau réglé ; restauration à la fin, pause, annulation ou changement de langue. SpeechSynthesis reste limité à son volume natif maximal ; aucun faux gain supérieur à 100 % n’est annoncé.


## Correction de l’évitement et de la séparation — 16 octobre 2026

Historique du 16 octobre : priorité d’obstacle sur cerveau et répulsion centrale critique. Depuis le correctif 4, cette répulsion centrale n’est plus composée en Grand Prix : la force d’obstacle sert de base puis la réaction trafic applique freinage/écartement. Les comportements restent indépendants ; composition bornée et une seule locomotion Vehicle.

L’anticipation combine désormais portée minimale réglée, vitesse × 30 pas et distance de freinage. Le côté de passage est conservé dans le repère d’approche jusqu’au franchissement du centre de l’obstacle ; le côté praticable est choisi par sondes locales de chaussée et d’autres obstacles. Freinage anticipé et vitesse latérale amortie donnent la place nécessaire. L’allure d’approche est conservée pour éviter un boost vers maxspeed. Un passage totalement bloqué provoque un freinage, même à vitesse nulle, plutôt qu’une relance neuronale vers l’obstacle. Aucun déplacement direct ni trajectoire prédéfinie.

Ajouter un obstacle, par coordonnées ou souris, coche automatiquement l’évitement pour la prochaine course. Il reste possible de le désactiver volontairement avant lancement. La barre de course affiche explicitement obstacles, état d’évitement et séparation. Les objets d’édition sont étiquetés APERÇU · PROCHAINE COURSE ; ils ne changent pas une course/replay déjà lancés. Relancer applique les changements.

Régression : l’ancienne version heurtait un obstacle de rayon 10 à 5,5 px/pas (distance minimale 12,63 px, collision à 14 px). Les tests actuels font réellement dépasser cet obstacle, avec locomotion Vehicle, à 2 et 5,5 px/pas, sans collision et centre restant sur chaussée. Test avec vrai modèle Jerez : obstacle de rayon 6 à 70 px après départ, collision sans aide, tour terminé sans collision avec aide. Les poids sauvegardés restent exacts.

Limites : une obstruction trop large ou un obstacle découvert à l’intérieur d’une distance physiquement infranchissable ne peut pas être évité par une force bornée. Les modèles appris peuvent mal récupérer après une forte déviation dans un virage : un essai CPU avec obstacle à 160 px du départ finit encore en mauvais sens après le contournement ; essais à 70 et 300 px terminés. Le protocole de checkpoints/validation est conservé ; aucun abandon masqué pour obtenir un résultat favorable.

## Fonctionnement de l'évitement et de la séparation — 17 octobre 2026

- Anticipation obstacles : sondes `ahead` et `ahead2`, à portée complète et mi-portée. Un corridor continu garde les petits obstacles entre sondes détectables. Portée agrandie selon vitesse et distance de freinage ; côté de passage mémorisé et contrôle de chaussée conservés.
- Anticollision motos : séparation inverse-distance et rampe de suivi `headway`. Dégagement mesuré entre corps complets, vitesse du leader prise en compte ; freinage uniquement, aucune accélération ajoutée. Perception limitée aux menaces prédictives ou corps très proches pour ne pas freiner inutilement dans les virages. Écartement projeté sur normale locale et borné selon place disponible et rotation du corps.

Composition dans `race-steering.js` et `motorcycle-avoidance.js`, force finale bornée à `maxforce`, déplacement unique par locomotion héritée. Options indépendantes : **Évitement** pour obstacles ajoutés, **Anticollision motos** pour trafic ; désactivation ou intensité zéro conserve exactement la commande neuronale. Aucune modification des JSON, de l’entraînement ou de `vehicle.js`. Pas de trajectoire imposée ni garantie zéro contact ; blocages et stagnations restent possibles.

Tests ciblés : `node --test tests/reference-steering.test.cjs tests/motorcycle-avoidance.test.cjs tests/race-assistance.test.cjs tests/race-track-frame.test.cjs` — 33 tests réussis, dont locomotion réelle, suivi, écartement, obstacles, désactivation et grille trois tours sans contresens.

## Restituer le pilotage après contournement — 17 octobre 2026

Le verrou de côté ne doit pas imposer le cap d'approche lorsqu'une commande neuronale propose déjà un passage dégagé. `RaceSteering.neuralPathClear` vérifie le corps balayé (roues avant/arrière et changement de cap inclus) sur une projection locale de la vitesse proposée, avec horizon minimal de 30 pas, agrandi selon temps de freinage, et marge de 1 px. Le contrôleur conserve la force neuronale si cette projection ne touche aucun obstacle ; sinon l'évitement garde priorité. Aucun déplacement supplémentaire ni trajectoire prédéfinie ; poids et critères d'abandon inchangés.

Régression précise : six copies d'Agressif GP52, piste 52, trois tours, anticipation 45, poids 1.5, obstacles de rayon 12 aux positions (309,180), (632,587), (696,202), (671,311), (386,478). Évitement seul : six arrivées, aucun contact avec obstacle ou limite et aucune sortie, contre zéro arrivée avant correction. Même résultat avec styles MotoGP à 30 % et douze drones. Tests : `node --test tests/obstacle-handoff.test.cjs`.

Ce résultat ne certifie pas l'anticollision motos : ses blocages et perturbations du pilotage restent non résolus dans cette configuration. Aucun mode jury globalement validé n'est annoncé. Prédiction à vitesse constante, pas de garantie pour tout placement d'obstacle ou tout modèle. Pendant la session, `tests/gp52-models.test.cjs` et `AI-CHANGELOG.md` ont été constatés vides après avoir eu du contenu ; ces fichiers n'ont pas été vidés par ce correctif. Une suite globale verte n'est pas une preuve d'intégrité des tests manquants.
