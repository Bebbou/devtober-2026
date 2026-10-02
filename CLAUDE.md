# Devtober 2026

Un projet par jour pendant un mois, 31 thèmes (liste dans `docs/pages.js`). Fait par Lino Volle, étudiant en BUT MMI à Béziers. Défi imaginé par Lilian Cornet. Répondre en français.

Site statique sur GitHub Pages : `https://bebbou.github.io/devtober-2026/`. La racine redirige vers `docs/`.

## Structure

| Chemin | Contenu |
| :-- | :-- |
| `NN-Nom/` | le projet du jour (`01-Pulse`, `02-Loop`) |
| `docs/` | le site de documentation : une page `NN-nom.html` par jour, `pages.js` (THEMES et DOCS), `style.css`, `script.js` |
| `_template/` | les fichiers de départ d'un jour et de sa page de doc (voir `/new-day`) |
| `.github/` | la collecte des données de Pulse (`status.json` sur la branche `pulse-data`, ne pas y toucher) |
| `.claude/skills/` | `/new-day` pour démarrer un jour, `/finish-day` pour le terminer |

## Code

- HTML, CSS et JavaScript écrits à la main. Pas de framework, pas de build, pas de dépendance. Les logos et images sont des fichiers du dépôt.
- Suivre le style du fichier qu'on modifie : Loop et `docs/` sont en ES5 (`var`, `function`), Pulse en ES2015+.
- Prettier : 2 espaces, guillemets doubles, point-virgule, 100 colonnes, fin de ligne LF.
- Les copies de travail sont en CRLF (`core.autocrlf`) : faire les remplacements de texte en acceptant les deux fins de ligne.
- Accessibilité : respecter `prefers-reduced-motion`, tout utilisable au clavier, vérifier à 375 px de large.

## Direction artistique

Fond `#0d0d0d`, texte `#e0e0e0`, accent `#ff0055`, gris `#8c8c8c` et `#5a5a5a`, traits `#1f1f1f` et `#333`. Le rose n'apparaît que sur ce qui est actif ou allumé. Traits de 1 px, pas de flou ni de lueur (jamais sur les chiffres). Marqueur de section `>> titre`. Courier New sur Loop, Geist sur Pulse. Rester simple : Lino a déjà refusé un générateur trop compliqué.

## Écriture

Les textes (pages, descriptions, docs, commentaires) ne doivent pas sonner « généré par une IA » :

- pas de gras en début de puce (`**Terme.** explication`) ;
- pas de phrase de conclusion à effet (« La couture ne se voit jamais. »), de « c'est ce qui donne… », de « Raison : » ;
- pas de « vraiment », « simplement », « véritable », « de vrais… » ;
- pas de trois adjectifs d'affilée (« fluide, soigné, rapide »), pas de « pas X mais Y » en série ;
- pas de phrase qui annonce la liste (« Ce que X ne fait pas encore… ») ;
- pas de tiret long (—) dans les phrases, pas d'emoji ;
- phrases courtes et factuelles, chiffres précis, « j'ai » quand c'est Lino qui parle ;
- commentaires de code brefs, en français, qui disent pourquoi. Pas de bannières décoratives.

Pour relire : `grep -n -i -E 'vraiment|vrai[es]? |simplement|véritable|—|raison :' <fichiers>`.

## Aperçu local

```bash
php -S localhost:8765 -t "C:/Users/cvoll/Documents/GitHub/devtober-2026"
```

Toujours avec `-t` et un chemin absolu. Un ancien serveur resté sur le port donne des 404 : l'arrêter (par son port, sans toucher aux autres processus) avant de relancer, et l'arrêter en fin de test. Dans le navigateur intégré, une capture d'écran force le rendu : les mesures lues juste avant peuvent être périmées.

## Git

Lino commite et pousse lui-même. Ne pas faire de commit, de push ni de branche sans qu'il le demande. Une branche par jour (`02/Loop`), fusionnée par pull request.

## Loop (jour 2)

- Les conteneurs sont dans `02-Loop/projects.js` (le format est décrit en tête du fichier). Logos en CC0 dans `logos.js` (simple-icons), pictogrammes dans `ICONS` de `script.js`.
- Images dans `02-Loop/img/`, moins de 400 Ko : une petite version pour l'affiche (`-small`) et une grande pour le clic.
- Descriptions courtes, environ 250 caractères : au-delà, le papier cache les caisses du dessus.
- Le texte et les liens de l'intérieur sont dans une couche 2D, car les clics ne passent pas dans la scène 3D.

## À faire plus tard

- Phaser R312 : Lino remet le jeu à jour la semaine du 5 octobre 2026. Quand GitHub Pages sera activé sur ce dépôt, ajouter un lien « jouer » dans son conteneur, refaire l'affiche `img/phaser-r312.png` et mettre à jour « 4 salles » et « en cours ».
- D'autres conteneurs viendront (infographie, etc.) : Lino les envoie un par un.
