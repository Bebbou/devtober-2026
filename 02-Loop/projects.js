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
    links  boutons de la fiche : { label, url } (optionnel)
    image  une affiche épinglée au mur de l'intérieur, ex. "img/mon-projet.jpg" (optionnel, 16/9 de préférence)
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
    name: "Lino",
    icon: "user",
    kind: "à propos",
    text: "Étudiant en MMI. Je code pour le plaisir, et en ce moment pour le Devtober : un projet par jour pendant un mois.",
    links: [
      { label: "GitHub", url: "https://github.com/Bebbou" },
      { label: "le Devtober", url: "../docs/" },
    ],
  },
];
