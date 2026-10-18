# Profils de conduite et identité des sauvegardes

## Les cinq profils du laboratoire

| Profil | Caractéristiques initiales |
| --- | --- |
| Prudent | Anticipation forte ; freinage plus précoce ; accélération et agressivité faibles ; correction vers la piste forte |
| Équilibré | Compromis entre anticipation, direction, freinage et accélération |
| Agressif | Accélération et agressivité fortes ; direction plus vive ; freinage plus tardif ; correction vers la piste plus faible |
| Freinage tardif | Seuil de déclenchement du freinage le plus tardif ; accélération et agressivité fortes |
| Trajectoire régulière | Anticipation et correction fortes ; direction modérée ; agressivité réduite |

Changer **Profil de conduite** l’applique immédiatement. Avec un meilleur modèle disponible, ses sept traits sont remplacés par les valeurs du tableau ci-dessous ; les poids et biais du réseau sont conservés. L’ancienne validation est annulée, les scores remis à zéro et trois nouveaux tours sont lancés. Sans meilleur modèle, une population du profil choisi est créée. Sélectionner de nouveau le même profil conserve les traits appris. **Nouvelle population** réinitialise tout l’apprentissage. Les profils ne garantissent pas la réussite et ne fournissent aucune trajectoire au pilote.

Les centres des distributions d’initialisation sont les suivants, sur une échelle de 0 à 1 :

| Profil | Anticipation | Direction | Freinage | Accélération | Agressivité | Correction piste | Sensibilité virages |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Prudent | 0,75 | 0,45 | 0,82 | 0,38 | 0,20 | 0,78 | 0,82 |
| Équilibré | 0,58 | 0,58 | 0,58 | 0,58 | 0,50 | 0,62 | 0,62 |
| Agressif | 0,50 | 0,72 | 0,30 | 0,86 | 0,90 | 0,45 | 0,48 |
| Freinage tardif | 0,62 | 0,68 | 0,20 | 0,82 | 0,82 | 0,52 | 0,70 |
| Trajectoire régulière | 0,82 | 0,42 | 0,68 | 0,50 | 0,35 | 0,85 | 0,72 |

À la création d’une population, chaque agent reçoit une variation aléatoire reproductible autour de ces centres, écart-type 0,08, bornée entre 0 et 1. Appliquer un autre profil à un modèle existant utilise exactement les valeurs du tableau, sans hasard. Les mutations/croisements peuvent ensuite modifier les traits. Le nom désigne le profil initial ou le dernier profil explicitement appliqué ; les valeurs actuelles exactes restent dans le génome et dans les métadonnées exportées.

Un trait Freinage élevé déclenche la réaction plus tôt dans le contrôleur. Il ne s’agit pas de la puissance physique de freinage, réglée séparément. Anticipation agit sur la portée des capteurs ; Direction amplifie la commande neuronale ; Correction piste et Sensibilité virages influencent les réponses aux dangers détectés. Les forces restent limitées à maxForce.

## Nom de sauvegarde et fichier exporté

La référence est toujours **le génome enregistré**. Le sélecteur applique réellement son profil avant sauvegarde ; saisir un mot de profil dans le nom personnel ne change pas la conduite.

| Situation | Résultat |
| --- | --- |
| Génome prudent, nom personnel « Jerez génération 12 » | `Prudent — Jerez génération 12` |
| Export de ce modèle | `prudent-jerez-generation-12.json` |
| Génome équilibré, nom saisi « Jerez prudent » | `Équilibré — Jerez` |
| Modèle prudent ou équilibré, puis choix du profil Agressif | Traits Agressif appliqués ; nouvelle validation ; sauvegarde et export Agressif |
| Ancien fichier sans profil déclaré dans son génome | Personnalisé ; aucune origine inventée à partir du nom |

Les mots de profils présents dans le titre sont remplacés par un préfixe canonique unique. Les autres mots du nom personnel sont conservés. Le champ est actualisé après sauvegarde et un aperçu annonce le nom avant celle-ci. Les métadonnées du JSON contiennent `profile`, `profileLabel`, `profileTraits` ; `genome.profile` et `metadata.config.profile` restent cohérents. Les traits correspondent exactement au génome appris, pas aux valeurs initiales du tableau.

Les anciens modèles gardent leurs identifiants, génomes et entrées de stockage d’origine. Leur nom d’affichage et d’export est harmonisé sans écrire par-dessus l’ancienne entrée. Le nom d’origine peut être conservé dans `metadata.sourceName` pour traçabilité ; il ne détermine jamais le profil. Un import ne récupère pas un statut validé : trois nouveaux tours restent obligatoires.

Le chargement restaure le profil du génome dans le sélecteur et ses réglages associés. Un intitulé personnalisé ne change jamais la conduite ou la provenance d’un modèle.

## Styles des pilotes en course

La course exige un modèle sauvegardé/importé dans chacune des six lignes **Affectations des six pilotes**. Le choix **Modèle de course** reste un raccourci collectif via **Affecter le modèle ci-dessus aux six motos**. Chaque copie conserve exactement le profil, les traits appris et les poids de son affectation. Les modèles peuvent différer ou être volontairement identiques. Le nom canonique et le profil sont identiques dans la bibliothèque, le JSON et la course ; le nom de fichier est normalisé sans accents pour le téléchargement.

Les variantes Márquez, Bagnaia, Martín, Quartararo, Acosta et Binder sont décrites dans [GRAND_PRIX.md](GRAND_PRIX.md). Leur activation est optionnelle et désactivée par défaut ; si activées, leur intensité initiale reste 100 %. Ce sont des copies du modèle sélectionné avec des traits inspirés. **Sauvegarder meilleur modèle** enregistre le champion d’entraînement, pas automatiquement la variante du pilote affiché à la télévision. Son profil est ajouté au nom et aux métadonnées lors de la sauvegarde ; l’export conserve ces mêmes données.

## Vérification

`npm test` couvre les cinq profils, leur application réelle avec conservation des poids, l’annulation de validation, les noms contradictoires (dont « Aggressif »), les configurations importées incohérentes, les anciens modèles, les traits exacts, les noms de fichiers et la restauration après chargement. `vehicle.js`, les règles de steering et le protocole de validation ne sont pas modifiés.
