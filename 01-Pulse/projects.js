/*
  Liste des projets surveillés.

  Champs d'un projet :
    repo     (obligatoire)  nom du dépôt GitHub
    name     (optionnel)    nom affiché, sinon le nom du dépôt
    owner    (optionnel)    propriétaire du dépôt, sinon "owner" ci-dessous
    url      (optionnel)    site déployé : sert à savoir s'il est en ligne
    stats    (optionnel)    URL du serveur qui expose /stats : { requests, errors, sockets, … }
                            (voir MMI-ProNote : server/utils/stats.js). Active "serveur en ligne",
                            les requêtes sur 24 h et le nombre de connectés.
    planned  (optionnel)    true = projet à venir, ligne plate grisée, aucun appel réseau

  Exemple de projet à venir :
    { repo: "mon-futur-projet", name: "Mon futur projet", planned: true }
*/
window.PULSE = {
  owner: "Bebbou",
  projects: [
    { repo: "MMI-ProNote", name: "ProNote MMI", url: "https://mmi2-pronote.netlify.app/", stats: "https://mmi-pronote-production.up.railway.app/stats" },
    { repo: "SAE-301", name: "SAE 301" },
    { repo: "Projet-Phaser-R312", name: "Phaser R312" },
    { repo: "ARAM-mayhem-indicator", name: "ARAM Mayhem" },
    { repo: "driftwm", name: "driftwm" },
    { repo: "Musee--FABI", name: "Musée FABI" },
    { repo: "interface", name: "Interface" },
    { repo: "devtober-2026", name: "Devtober 2026" },
  ],
};
