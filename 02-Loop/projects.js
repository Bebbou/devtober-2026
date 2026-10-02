/*
  Les conteneurs du train : un objet = un conteneur.
  Pour ajouter un projet, copie un bloc et change les textes.

    name   nom affiché sur le conteneur
    icon   pictogramme du conteneur : chart, pad, sprite, target, columns, user, pen, layers, code, globe
           (box si absent). Pour en ajouter un, voir ICONS dans script.js
    tone   couleur du conteneur, de 0 à 5 (optionnel : sinon elle suit l'ordre)
    kind   une ligne sous le nom (type de projet)
    text   la description, visible quand on ouvre le conteneur
    tags   les outils, en caisses de bois (optionnel) : { name: "React", logo: "react" } pour une caisse
           avec son logo (voir logos.js), ou juste "Illustrator" pour une caisse avec le nom seul
    links  boutons de la fiche : { label, url } (optionnel). Quatre par rangée, une rangée de plus au-delà.
           Un bouton peut aussi copier un texte : { label: "discord", copy: "mon-pseudo" }
    image  une affiche épinglée au mur de l'intérieur, ex. "img/mon-projet.jpg" (optionnel, en paysage ou en portrait)
    imageLarge  la version en grand, ouverte quand on clique sur l'affiche (optionnel)
           avec imageAlt (description pour les lecteurs d'écran) et imageCaption (légende sous l'affiche)

  Les descriptions viennent de la description de chaque dépôt GitHub : corrige-les à ta façon.
*/
window.LOOP_PROJECTS = [
  {
    name: "ProNote MMI",
    icon: "chart",
    kind: "site web",
    text: "L'application de la promo MMI : devoirs, notes, emploi du temps, chat en temps réel, documents partagés et sondages, avec des mises à jour instantanées pour tout le groupe. Elle s'installe comme une appli et envoie des notifications.",
    tags: [
      { name: "React", logo: "react" },
      { name: "Vite", logo: "vite" },
      { name: "Node.js", logo: "nodejs" },
      { name: "Express", logo: "express" },
      { name: "Socket.IO", logo: "socketio" },
      { name: "PostgreSQL", logo: "postgresql" },
      { name: "Prisma", logo: "prisma" },
      { name: "Netlify", logo: "netlify" },
      { name: "Railway", logo: "railway" },
    ],
    links: [
      { label: "voir le site", url: "https://mmi2-pronote.netlify.app/" },
      { label: "code", url: "https://github.com/Bebbou/MMI-ProNote" },
      { label: "son pouls en direct", url: "../01-Pulse/" },
    ],
  },
  {
    name: "Musée FABI",
    icon: "columns",
    kind: "site web · avec Lilian",
    text: "Le musée FABI (Fake 'Achement Bien Imité) de Marseille, un faux musée en ligne : un catalogue de peintures et de sculptures, une visite 3D à explorer au clavier, et un site en français et en anglais. Conçu avec Lilian.",
    tags: [
      { name: "HTML", logo: "html" },
      { name: "CSS", logo: "css" },
      { name: "JavaScript", logo: "javascript" },
      { name: "Three.js", logo: "threejs" },
      { name: "PHP", logo: "php" },
      { name: "MySQL", logo: "mysql" },
      { name: "GitHub Pages", logo: "githubpages" },
    ],
    links: [
      { label: "voir le site", url: "https://bebbou.github.io/Musee--FABI/res/" },
      { label: "visite 3D", url: "https://bebbou.github.io/Musee--FABI/res/assets/3d/viewer_3d.html" },
      { label: "code", url: "https://github.com/Bebbou/Musee--FABI" },
    ],
  },
  {
    name: "Artemis",
    icon: "pad",
    kind: "jeu vidéo · SAÉ 301",
    text: "Artemis, un rogue-like sur la Lune : on descend niveau après niveau dans un ravin, avec une torche dont la lumière change tout, car certains ennemis ne se voient que dans le noir. Seul ou à deux, sur borne d'arcade. Fait avec Inas et Liku.",
    image: "img/sae-301.jpg",
    imageAlt: "L'affiche d'Artemis : deux personnages en pixel art devant des ruines grecques sur la Lune",
    imageCaption: "ARTEMIS · SAÉ 301",
    tags: [
      "Phaser 3",
      { name: "JavaScript", logo: "javascript" },
      { name: "HTML", logo: "html" },
      "Tiled",
      { name: "GitHub Pages", logo: "githubpages" },
    ],
    links: [
      { label: "jouer", url: "https://bebbou.github.io/SAE-301/" },
      { label: "documentation", url: "https://bebbou.github.io/SAE-301/docs/documentation.html" },
      { label: "code", url: "https://github.com/Bebbou/SAE-301" },
    ],
  },
  {
    name: "Phaser R312",
    icon: "sprite",
    kind: "jeu vidéo · en cours",
    text: "Un jeu de puzzle au tour par tour, en pixel art : on avance case par case, et chaque pas fait jouer le monde, avec ses pièges qui s'effondrent et ses ennemis. Leviers, portes, tirs, objectifs à colorier : 4 salles pour l'instant.",
    image: "img/phaser-r312.png",
    imageAlt: "La première salle du jeu : un petit personnage, deux ennemis violets, des pièges numérotés, un levier, une porte et la sortie en vert",
    imageCaption: "SALLE 1 / 4",
    tags: [
      "Phaser 3",
      { name: "JavaScript", logo: "javascript" },
      { name: "HTML", logo: "html" },
      "Tiled",
    ],
    links: [{ label: "code", url: "https://github.com/Bebbou/Projet-Phaser-R312" }],
  },
  {
    name: "Chicken Teriyaki",
    icon: "pen",
    kind: "digital painting",
    text: "Un digital painting : le chicken teriyaki du fast-food Wok To Walk, peint vu de dessus avec ses ingrédients autour : sésame, ciboulette, shichimi, sauce teriyaki, concombre et poulet marinés.",
    image: "img/chicken-teriyaki-small.jpg",
    imageLarge: "img/chicken-teriyaki.jpg",
    imageAlt: "Un plat de poulet teriyaki, du riz et du concombre dans une poêle vue de dessus, entouré de cuillères de sésame et de ciboulette, d'épices et d'une bouteille de sauce, peint à la main sur un fond de papier",
    imageCaption: "WOK TO WALK · A4",
    tags: [{ name: "Photoshop", logo: "photoshop" }],
    links: [{ label: "voir en grand", url: "img/chicken-teriyaki.jpg" }],
  },
  {
    name: "Printemps de la Culture",
    icon: "layers",
    kind: "affiche · exercice",
    text: "Une affiche A3 pour le Printemps de la Culture de Brignoles, édition 2026 : un tournesol dont le cœur est La Nuit étoilée, du papier déchiré, les icônes des arts. Un exercice de cours pour travailler avec une IA : j'ai préparé les deux parties de la fleur, elle les a assemblées.",
    image: "img/printemps-culture-small.jpg",
    imageLarge: "img/printemps-culture.jpg",
    imageAlt: "L'affiche du Printemps de la Culture 2026 : un grand tournesol dont le cœur reproduit La Nuit étoilée, sur des bandes de papier déchiré bleues et vertes, avec le titre en haut, les dates en bas et les logos des partenaires",
    imageCaption: "AFFICHE A3 · 2026",
    tags: [
      { name: "Photoshop", logo: "photoshop" },
      { name: "InDesign", logo: "indesign" },
      { name: "Gemini", logo: "gemini" },
    ],
    links: [{ label: "voir en grand", url: "img/printemps-culture.jpg" }],
  },
  {
    name: "Lino",
    icon: "user",
    kind: "à propos",
    text: "Étudiant en BUT MMI à l'IUT de Béziers, parcours développement web et dispositifs interactifs. Passionné d'UI/UX et de front-end : des interfaces fluides, soignées, rapides. Ce train fait partie du Devtober : un projet par jour pendant un mois.",
    image: "img/interface.jpg",
    imageAlt: "Mon interface : une page sombre et rouge avec mon avatar et la liste de mes liens",
    imageCaption: "MON INTERFACE",
    tags: [
      { name: "HTML", logo: "html" },
      { name: "CSS", logo: "css" },
      { name: "JavaScript", logo: "javascript" },
      { name: "PHP", logo: "php" },
      { name: "Figma", logo: "figma" },
      { name: "Adobe CC", logo: "adobecc" },
    ],
    links: [
      { label: "portfolio", url: "https://bebbou.github.io/portfolio/" },
      { label: "github", url: "https://github.com/Bebbou" },
      { label: "linkedin", url: "https://www.linkedin.com/in/lino-volle/" },
      { label: "instagram", url: "https://www.instagram.com/lino.volle/" },
      { label: "discord", copy: "bebou.png" },
      { label: "e-mail", url: "mailto:lino.volle.dev@gmail.com" },
      { label: "cv", url: "https://bebbou.github.io/interface/cv.html" },
      { label: "mon interface", url: "https://bebbou.github.io/interface/" },
    ],
  },
];
