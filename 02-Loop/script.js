(function () {
  "use strict";

  var $ = function (s) { return document.querySelector(s); };
  var PROJECTS = window.LOOP_PROJECTS || [];
  var stage = $("#stage");
  var train = $("#train");
  var city = $("#city");
  var ties = $("#ties");
  var stamp = $("#stamp");
  var dlg = $("#dlg");

  // Vitesse de croisière en pixels par seconde (0 si la personne préfère éviter les animations)
  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var CRUISE = reduced ? 0 : 46;
  var MAX = 1200; // vitesse maximale quand on pousse le train
  var KMH = 1 / 1.2; // pour afficher une vitesse "en km/h" qui sonne juste

  var esc = function (s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); };
  var pad = function (n, len) { return ("000000" + n).slice(-len); };
  var mod = function (a, n) { return ((a % n) + n) % n; };

  /* ---------- Construction du train ----------
     Un "tour" = la liste des projets une fois. On le répète assez de fois pour remplir l'écran,
     et on déplace le train d'un tour exactement : la couture ne se voit jamais. */
  var period = 0; // largeur d'un tour, en pixels

  function boxHTML(p, i, real) {
    var code = "LNVU " + pad(i + 1, 6) + " " + ((i * 7 + 3) % 10);
    return (
      '<button class="box" type="button" data-i="' + i + '"' + (real ? "" : ' tabindex="-1" aria-hidden="true"') + ">" +
        '<span class="cont"><span class="id">' + code + "</span><b>" + esc(p.name) + "</b><small>" + esc(p.kind) + "</small></span>" +
        '<span class="chassis"><i></i><i></i><i></i><i></i></span>' +
      "</button>"
    );
  }

  function buildTrain() {
    var one = function (real) { return PROJECTS.map(function (p, i) { return boxHTML(p, i, real); }).join(""); };
    train.innerHTML = one(true);
    period = train.scrollWidth + parseFloat(getComputedStyle(train).columnGap || 16);
    var tours = Math.ceil(stage.clientWidth / period) + 1;
    var html = one(true);
    for (var t = 1; t < tours; t++) html += one(false);
    train.innerHTML = html;
  }

  /* ---------- La ville au loin ----------
     Des immeubles tirés au hasard (mais toujours les mêmes), répétés deux fois pour boucler. */
  var cityPeriod = 0;

  function buildCity() {
    var seed = 7;
    var rnd = function () { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    var one = "";
    var width = 0;
    while (width < 1500) {
      var w = Math.round(46 + rnd() * 70);
      var h = Math.round(70 + rnd() * 190);
      one += '<i style="width:' + w + "px;height:" + h + 'px"' + (rnd() < 0.18 ? ' class="lit"' : "") + "></i>";
      width += w - 1;
    }
    city.innerHTML = one;
    cityPeriod = city.scrollWidth;
    var tours = Math.ceil(stage.clientWidth / cityPeriod) + 1;
    var all = one;
    for (var t = 1; t < tours; t++) all += one;
    city.innerHTML = all;
  }

  /* ---------- Mouvement ----------
     x   : distance parcourue (sans limite)
     v   : vitesse actuelle, en pixels par seconde (négative = le train recule)
     La vitesse glisse doucement vers la vitesse voulue : 0 à l'arrêt, sinon la croisière. */
  var x = 0;
  var v = CRUISE;
  var dir = 1;
  var hover = false; // la souris est sur un conteneur
  var focused = false; // un conteneur a le focus (clavier)
  var opened = false; // la fiche est ouverte
  var dragging = false;
  var glideTo = null; // position à atteindre (focus clavier)

  var wanted = function () { return hover || focused || opened ? 0 : dir * CRUISE; };

  var last = 0;
  function frame(now) {
    var dt = Math.min((now - last) / 1000, 0.05);
    last = now;

    if (!dragging) {
      // freine vite quand on survole, reprend doucement ensuite
      var k = hover || focused || opened ? 5 : 1.4;
      v += (wanted() - v) * (1 - Math.exp(-dt * k));
      x += v * dt;
    }
    if (glideTo !== null) {
      var d = glideTo - x;
      x += d * (1 - Math.exp(-dt * 8));
      if (Math.abs(d) < 0.5) glideTo = null;
    }

    train.style.transform = "translate3d(" + -mod(x, period) + "px,0,0)";
    city.style.transform = "translate3d(" + -mod(x * 0.2, cityPeriod) + "px,0,0)";
    ties.style.backgroundPositionX = -mod(x, 22) + "px";
    stamp.textContent = Math.round(Math.abs(v) * KMH) + " km/h";

    requestAnimationFrame(frame);
  }

  /* ---------- Conduire : molette, glisser ---------- */
  function push(amount) {
    v = Math.max(-MAX, Math.min(MAX, v + amount));
    if (Math.abs(v) > CRUISE * 1.5) dir = v > 0 ? 1 : -1;
  }

  stage.addEventListener("wheel", function (e) {
    e.preventDefault();
    var d = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
    push(d * 1.5);
  }, { passive: false });

  var moved = 0;
  var lastX = 0;
  var lastT = 0;

  stage.addEventListener("pointerdown", function (e) {
    if (e.button !== 0) return;
    dragging = true;
    moved = 0;
    lastX = e.clientX;
    lastT = performance.now();
    stage.classList.add("drag");
  });

  window.addEventListener("pointermove", function (e) {
    if (!dragging) return;
    var now = performance.now();
    var dx = e.clientX - lastX;
    moved += Math.abs(dx);
    x -= dx;
    // la vitesse du doigt devient la vitesse du train quand on le lâche
    if (now > lastT) v = -dx / ((now - lastT) / 1000) * 0.6 + v * 0.4;
    lastX = e.clientX;
    lastT = now;
  });

  function release() {
    if (!dragging) return;
    dragging = false;
    stage.classList.remove("drag");
    v = Math.max(-MAX, Math.min(MAX, v));
    if (Math.abs(v) > CRUISE * 1.5) dir = v > 0 ? 1 : -1;
  }
  window.addEventListener("pointerup", release);
  window.addEventListener("pointercancel", release);

  // Un glissement ne doit pas ouvrir un conteneur
  train.addEventListener("click", function (e) {
    var b = e.target.closest(".box");
    if (!b) return;
    if (moved > 6) { moved = 0; return; }
    open(+b.getAttribute("data-i"));
  });

  // Survol : le train s'arrête devant le conteneur
  train.addEventListener("mouseover", function (e) { hover = !!e.target.closest(".box"); });
  train.addEventListener("mouseleave", function () { hover = false; });

  /* ---------- Clavier ---------- */
  var boxesOf = function (i) { return Array.prototype.slice.call(train.querySelectorAll('.box[data-i="' + i + '"]')); };

  train.addEventListener("focusin", function (e) {
    var b = e.target.closest(".box");
    if (!b) return;
    focused = true;
    var boxes = boxesOf(b.getAttribute("data-i"));
    boxes.forEach(function (el) { el.classList.add("kb"); });
    // amène l'exemplaire le plus proche au centre de l'écran
    var center = stage.getBoundingClientRect().width / 2;
    var best = null;
    boxes.forEach(function (el) {
      var r = el.getBoundingClientRect();
      var off = r.left + r.width / 2 - center;
      if (best === null || Math.abs(off) < Math.abs(best)) best = off;
    });
    glideTo = x + best;
  });

  train.addEventListener("focusout", function () {
    focused = false;
    Array.prototype.forEach.call(train.querySelectorAll(".kb"), function (el) { el.classList.remove("kb"); });
  });

  // Le focus peut faire défiler la scène : on la remet en place
  stage.addEventListener("scroll", function () { stage.scrollLeft = 0; });

  window.addEventListener("keydown", function (e) {
    if (opened) return;
    if (e.key === "ArrowRight") push(500);
    if (e.key === "ArrowLeft") push(-500);
  });

  /* ---------- La fiche ---------- */
  function open(i) {
    var p = PROJECTS[i];
    if (!p) return;
    $("#dKind").textContent = p.kind;
    $("#dName").textContent = p.name;
    $("#dText").textContent = p.text;
    $("#dTags").innerHTML = (p.tags || []).map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("");
    $("#dTags").hidden = !(p.tags && p.tags.length);
    $("#dLinks").innerHTML = (p.links || []).map(function (l) {
      var ext = /^https?:/.test(l.url);
      return '<a href="' + esc(l.url) + '"' + (ext ? ' target="_blank" rel="noopener"' : "") + ">" + esc(l.label) + "</a>";
    }).join("");
    opened = true;
    dlg.showModal();
  }

  dlg.addEventListener("close", function () { opened = false; });
  $("#dClose").addEventListener("click", function () { dlg.close(); });
  // un clic à côté de la fiche la ferme
  dlg.addEventListener("click", function (e) { if (e.target === dlg) dlg.close(); });

  /* ---------- Démarrage ---------- */
  buildCity();
  buildTrain();

  var resizeTimer;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { buildCity(); buildTrain(); }, 150);
  });

  requestAnimationFrame(function (t) { last = t; frame(t); });
})();
