/*
  Le portrait de Lain se dessine point par point : plus il y a de jours terminés, plus il y a
  de points visibles. De temps en temps, un faisceau descend et allume tout le portrait.

  Chargé après script.js, car il lit le calendrier pour connaître l'avancement.
*/
(function () {
  "use strict";

  var canvas = document.getElementById("portrait");
  if (!canvas) return;

  var ctx = canvas.getContext("2d");
  var S = canvas.width;
  var total = (window.THEMES || []).length || 31;
  var done = document.querySelectorAll(".day.done").length;
  var progress = done / total;
  var calm = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  var label = document.getElementById("signal");
  if (label) label.textContent = "signal " + Math.round(progress * 100) + " %";

  var img = new Image();
  img.onerror = function () { canvas.parentElement.hidden = true; };
  img.onload = function () {
    // 1) repérer chaque point clair de l'image
    var off = document.createElement("canvas");
    off.width = off.height = S;
    var o = off.getContext("2d", { willReadFrequently: true });
    o.drawImage(img, 0, 0, S, S);
    var px = o.getImageData(0, 0, S, S).data;

    var dots = [];
    for (var y = 0; y < S; y++) {
      for (var x = 0; x < S; x++) {
        var i = (y * S + x) * 4;
        var lum = Math.max(px[i], px[i + 1], px[i + 2]);
        if (lum < 46) continue;
        // chaque point a un rang fixe : il apparaît quand l'avancement dépasse ce rang
        var rank = ((((x >> 1) * 73856093) ^ ((y >> 1) * 19349663)) >>> 0) % 997 / 997;
        dots.push({ at: y * S + x, y: y / S, strength: Math.min(1, lum / 90), rank: rank });
      }
    }

    var out = ctx.createImageData(S, S);
    var buf = new Uint32Array(out.data.buffer);

    function render(now) {
      buf.fill(0);
      // le faisceau descend sur le portrait, puis fait une pause hors de l'image
      var beam = calm ? -1 : ((now % 9000) / 9000) * 1.6 - 0.2;
      for (var k = 0; k < dots.length; k++) {
        var d = dots[k];
        var base = d.rank < progress ? 1 : 0;
        var behind = beam - d.y; // > 0 : le faisceau est déjà passé sur ce point
        var lit = behind >= -0.004 && behind < 0.4 ? 1 - Math.max(0, behind) / 0.4 : 0;
        var v = Math.max(base, lit);
        if (v < 0.03) continue;
        var a = Math.round(255 * v * d.strength);
        var head = behind >= -0.004 && behind < 0.012; // tête du faisceau : plus claire
        // Uint32 en little-endian : alpha, bleu, vert, rouge (rose #FF0055, ou plus clair en tête)
        buf[d.at] = ((a << 24) | ((head ? 175 : 85) << 16) | ((head ? 140 : 0) << 8) | 255) >>> 0;
      }
      ctx.putImageData(out, 0, 0);
      if (!calm && !document.hidden) requestAnimationFrame(render);
    }

    requestAnimationFrame(render);
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden && !calm) requestAnimationFrame(render);
    });
  };
  img.src = "img/lain.png";
})();
