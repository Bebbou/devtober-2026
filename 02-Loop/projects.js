/*
  Les conteneurs du train : un objet = un conteneur.
  Pour ajouter un projet, copie un bloc et change les textes.

    name   nom affiché sur le conteneur
    kind   une ligne sous le nom (type de projet)
    text   la description, visible quand on ouvre le conteneur
    tags   petites étiquettes (optionnel)
    links  boutons de la fiche : { label, url } (optionnel)

  Les descriptions viennent de la description de chaque dépôt GitHub : corrige-les à ta façon.
*/
window.LOOP_PROJECTS = [
  {
    name: "ProNote MMI",
    kind: "application web",
    text: "Une sorte de « ProNote » pour la promo MMI, plutôt côté dev. Elle tourne en ligne, avec un serveur qui compte les requêtes en direct.",
    tags: ["Vite", "Express", "Netlify", "Railway"],
    links: [
      { label: "voir le site", url: "https://mmi2-pronote.netlify.app/" },
      { label: "code", url: "https://github.com/Bebbou/MMI-ProNote" },
    ],
  },
  {
    name: "SAÉ 301",
    kind: "jeu vidéo · en équipe",
    text: "Création du jeu vidéo pour la SAÉ 301, avec Inas et Liku.",
    links: [{ label: "code", url: "https://github.com/Bebbou/SAE-301" }],
  },
  {
    name: "Phaser R312",
    kind: "jeu vidéo",
    text: "Création du jeu vidéo pour la R312, avec Phaser.",
    tags: ["Phaser"],
    links: [{ label: "code", url: "https://github.com/Bebbou/Projet-Phaser-R312" }],
  },
  {
    name: "ARAM Mayhem",
    kind: "outil",
    text: "Dans l'idée, c'est juste le winrate avec un « par rapport à ».",
    links: [{ label: "code", url: "https://github.com/Bebbou/ARAM-mayhem-indicator" }],
  },
  {
    name: "Musée FABI",
    kind: "site web",
    text: "Le projet du musée FABI (Fake 'Achement Bien Imité) de Marseille.",
    links: [{ label: "code", url: "https://github.com/Bebbou/Musee--FABI" }],
  },
  {
    name: "Lino",
    kind: "à propos",
    text: "Étudiant en MMI. Je code pour le plaisir, et en ce moment pour le Devtober : un projet par jour pendant un mois.",
    links: [
      { label: "GitHub", url: "https://github.com/Bebbou" },
      { label: "le Devtober", url: "../docs/" },
    ],
  },
];
