# Devtober 2026

Un projet par jour pendant un mois, 31 thèmes (liste dans `docs/pages.js`). Fait par Lino Volle, étudiant en BUT MMI à Béziers. Défi imaginé par Lilian Cornet. Répondre en français.

Site statique sur GitHub Pages : `https://bebbou.github.io/devtober-2026/`. La racine redirige vers `docs/`.

## Structure

| Chemin | Contenu |
| :-- | :-- |
| `NN-Nom/` | le projet du jour (`01-Pulse`, `02-Loop`, `03-Bloom`, `04-Drift`, `05-Chaos`) |
| `docs/` | le site de documentation : une page `NN-nom.html` par jour, `pages.js` (THEMES et DOCS), `style.css`, `script.js` |
| `_template/` | les fichiers de départ d'un jour et de sa page de doc (voir `/new-day`) |
| `.github/` | la collecte des données de Pulse (`status.json` sur la branche `pulse-data`, ne pas y toucher) |
| `.claude/skills/` | `/new-day` pour démarrer un jour, `/finish-day` pour le terminer |

## Code

- Le choix de la techno est libre : frameworks et bibliothèques sont bienvenus quand ils servent le projet (Three.js, React, Vite, etc.). Pulse et Loop sont écrits à la main, Bloom utilise Three.js. On choisit l'outil le mieux adapté à l'idée du jour.
- Le site est publié tel quel sur GitHub Pages (pas d'étape de build côté serveur). Un projet qui a besoin d'un build (Vite, par exemple) livre le dossier compilé, ou une copie locale de la bibliothèque, et pas seulement le code source.
- Bloom : Three.js est copié en un seul fichier dans `03-Bloom/vendor/`, et son script est un module : il faut un serveur pour l'ouvrir, pas un double-clic.
- Suivre le style du fichier qu'on modifie : Loop et `docs/` sont en ES5 (`var`, `function`), Pulse et Bloom en ES2015+.
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
- Le CSS est en deux fichiers : `style.css` (en-tête, scène, train, pied de page) et `interieur.css` (l'intérieur d'un conteneur, puis les règles pour petits écrans et animations réduites). `interieur.css` se charge après : ne pas changer cet ordre.
- Images dans `02-Loop/img/`, moins de 400 Ko : une petite version pour l'affiche (`-small`) et une grande pour le clic.
- Descriptions courtes, environ 250 caractères : au-delà, le papier cache les caisses du dessus.
- Le texte et les liens de l'intérieur sont dans une couche 2D, car les clics ne passent pas dans la scène 3D.

## Drift (jour 4)

- Fluide en WebGL 2 écrit à la main, sans bibliothèque (`script.js`) : vitesse de l'eau à 128 px de haut, encre à 512 px au plus. Le sillage des bouteilles est dans le canal alpha de la texture d'encre, qui s'efface plus vite que l'encre. L'effet de netteté est borné par le plus fort voisin : ne pas le renforcer sans cette borne, il fabrique de l'encre.
- Les messages de départ sont dans `04-Drift/messages.js` (100 caractères au plus). Les bouteilles de la personne sont dans `localStorage` (clé `devtober-drift-4`, drapeau de visite `-vu`). Pas de serveur pour l'instant.
- Pour tester dans le panneau intégré, qui ne fait pas tourner `requestAnimationFrame` quand il est masqué : copier `index.html` en `_t.html` avec une boucle pilotée par minuteur, et supprimer ce fichier ensuite.
- Les vignettes de partage sont dans `docs/og/` (une image par jour) et déclarées par des balises `og:` dans chaque page.

## Chaos (jour 5)

- Carte de France des faits rapportés par la presse. La collecte est `.github/scripts/chaos-collect.mjs` (Node sans dépendance, 129 flux RSS) lancée toutes les heures par `.github/workflows/chaos-data.yml`, qui publie `events.json` sur la branche `chaos-data` (ne pas y toucher). `05-Chaos/events.json` est une copie de secours, la plus récente des deux l'emporte.
- Les catégories sont des mots-clés sur le titre (`CATS`) : les resserrer plutôt que les élargir, un mot trop large range des procès en « violences ». `EXCLUS` (violences sexuelles, suicides) et `PAS_UN_EVENEMENT` (procès, affaires, tribunes) écartent des titres.
- Le lieu vient de la commune du titre (API `geo.api.gouv.fr`), sinon d'un département cité, sinon du département du flux France 3. Les contours sont dans `05-Chaos/france.js` (générés depuis `gregoiredavid/france-geojson`, Licence Ouverte) et servent aussi à la collecte.
- Le fond est un SVG (départements et nombres), les pastilles et les bulles sont sur un canevas (`#cv`). Ne pas remettre un élément SVG par pastille : 5 400 éléments rendaient la carte inutilisable. Les photos sont réduites une fois en vignettes rondes (`makeSprite`), jamais copiées dans le dépôt.
- `MAX_PTS` (500) et `loadLimit` règlent le poids de la carte. `NOPHOTO` liste les catégories sans photo (vide : Lino veut montrer l'information).
- Mémoire : `localStorage` clé `devtober-chaos-5` (drapeau de visite `-vu`). L'adresse porte la vue (`p`, `off`, `t`, `x`, `q`, `d`, `e`) et prime sur la mémoire.
- Tests dans le panneau intégré : même consigne que pour Drift (`requestAnimationFrame` s'arrête quand il est masqué). Pour le déroulé : cliquer sur « Run workflow » de `chaos-data` après la fusion dans `main`.

## À faire plus tard

- Phaser R312 : Lino remet le jeu à jour la semaine du 5 octobre 2026. Quand GitHub Pages sera activé sur ce dépôt, ajouter un lien « jouer » dans son conteneur, refaire l'affiche `img/phaser-r312.png` et mettre à jour « 4 salles » et « en cours ».
- Visite guidée : chaque jour (Pulse, Loop, Bloom, Drift, Chaos) a une visite en 3 bulles (première visite seulement, relançable par « ? »). Les prochains jours en auront une aussi.
- D'autres conteneurs viendront (infographie, etc.) : Lino les envoie un par un.
