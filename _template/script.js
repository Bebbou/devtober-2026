(function () {
  "use strict";

  var $ = function (s) { return document.querySelector(s); };

  // true si la personne préfère éviter les animations : toute boucle d'animation doit le respecter
  var calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var stage = $("#stage");

  // À COMPLÉTER
})();
