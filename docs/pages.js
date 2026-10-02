/*
  Données du site de documentation.

  THEMES : les 31 thèmes du Devtober, dans l'ordre (jour 1 = Pulse).
  DOCS   : les jours déjà documentés. Ils s'affichent « done » dans le calendrier.

  Pour ajouter un jour :
    1. copier 01-pulse.html en NN-nom.html et réécrire son contenu
    2. ajouter une ligne dans DOCS ci-dessous
*/
window.DEVTOBER = { year: 2026, month: 10 };

window.THEMES = [
  "Pulse", "Loop", "Bloom", "Drift", "Chaos", "Tiny", "Swarm", "Maze", "Gravity", "Fold",
  "Ripple", "Lost", "Tangle", "Bounce", "Shadow", "Tide", "Orbit", "Glitch", "Echo", "Fragile",
  "Signal", "Mirror", "Spark", "Hidden", "Melt", "Machine", "Haunted", "Grow", "Infinite", "Collapse",
  "Wake",
];

window.DOCS = [
  { day: "01", title: "Pulse", href: "01-pulse.html", status: "Terminé" },
];
