(function () {
  "use strict";

  var train = document.getElementById("train");
  var COUNT = 8; // nombre de wagons dans une moitié du train

  // Une moitié du train, puis la même une seconde fois (voir le commentaire dans style.css)
  var half = "";
  for (var i = 1; i <= COUNT; i++) {
    half +=
      '<div class="wagon">' +
      '<span class="window"></span><span class="window"></span><span class="window"></span>' +
      "<small>" + (i < 10 ? "0" + i : i) + "</small>" +
      "</div>";
  }
  train.innerHTML = half + half;
})();
