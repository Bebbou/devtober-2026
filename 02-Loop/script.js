(function () {
  "use strict";

  var $ = function (s) { return document.querySelector(s); };
  var PROJECTS = window.LOOP_PROJECTS || [];
  var stage = $("#stage");
  var train = $("#train");
  var ties = $("#ties");
  var wires = $("#wires");
  var streaks = $("#streaks");
  var fumi = $("#fumi");
  var sky = $("#sky");
  var stamp = $("#stamp");
  var arrow = $("#arrow");
  var lever = $("#lever");
  var knob = $("#knob");
  var orb = $("#orb");
  var odo = $("#odo");
  var dlg = $("#dlg");
  var sndBtn = $("#snd");

  // Vitesse de croisière en pixels par seconde (0 si la personne préfère éviter les animations)
  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var CRUISE = reduced ? 0 : 46;
  var MAX = 1200; // vitesse maximale quand on pousse le train
  var KMH = 1 / 1.2; // pour afficher une vitesse "en km/h" qui sonne juste
  var METRE = 4.32; // pixels parcourus pour faire un mètre (cohérent avec KMH)

  var esc = function (s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); };
  var pad = function (n, len) { return ("000000" + n).slice(-len); };
  var mod = function (a, n) { return ((a % n) + n) % n; };
  var seeded = function (seed) { return function () { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }; };

  /* ---------- Le train ----------
     Un "tour" = la liste des conteneurs, une fois. On le répète assez de fois pour remplir
     l'écran, et on déplace le train d'un tour exactement : la couture ne se voit jamais. */
  var period = 0; // largeur d'un tour, en pixels

  // La couleur de chaque conteneur : des teintes de vrais conteneurs, passées et sombres
  var LIVERIES = [
    ["#243240", "#1d2a36"], // acier
    ["#3d1c22", "#33171c"], // lie-de-vin
    ["#2f3524", "#292e1f"], // olive
    ["#4a2a1c", "#3f2318"], // rouille
    ["#1f3535", "#1a2d2d"], // sarcelle
    ["#3b1a2a", "#321625"], // prune
  ];

  /* Les pictogrammes : de petits dessins au trait sur une grille de 24 x 24.
     Dans projects.js, "icon" choisit celui d'un projet. Pour en ajouter un, une ligne ici. */
  var ICONS = {
    chart: "M4 20V12M9 20V5M14 20v-9M19 20V8M2 21h20",
    pad: "M6 8h12a4 4 0 0 1 4 4v2a3 3 0 0 1-5.2 2L16 15H8l-.8 1A3 3 0 0 1 2 14v-2a4 4 0 0 1 4-4zM8 10.5v3M6.5 12h3M15.5 11h1v1h-1zM18 13h1v1h-1z",
    sprite: "M6 21V10a6 6 0 0 1 12 0v11l-2.3-2-1.7 2-2-2-2 2-1.7-2zM9.5 10h1.5v2.5H9.5zM13 10h1.5v2.5H13z",
    target: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 1v6M12 17v6M1 12h6M17 12h6M12 11.2a.8.8 0 1 0 0 1.6.8.8 0 0 0 0-1.6z",
    columns: "M3 9l9-5 9 5zM5 11v8M10 11v8M14 11v8M19 11v8M3 21h18",
    user: "M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0z",
    pen: "M4 20l1-5L16 4l4 4L9 19zM14 6l4 4",
    layers: "M12 3l9 5-9 5-9-5zM3 12l9 5 9-5M3 16l9 5 9-5",
    code: "M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16",
    globe: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c3.5 3 3.5 15 0 18M12 3c-3.5 3-3.5 15 0 18",
    box: "M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10",
  };
  var icon = function (name) { return ICONS[name] || ICONS.box; };

  function plate(i) { return "LNVU " + pad(i + 1, 6) + " " + ((i * 7 + 3) % 10); }

  // la couleur suit l'ordre, sauf si le projet en choisit une avec "tone" (0 à 5)
  function livery(p, i) { return LIVERIES[(typeof p.tone === "number" ? p.tone : i) % LIVERIES.length]; }

  function boxHTML(p, i, real) {
    var liv = livery(p, i);
    var vars =
      "--i:" + i + ";--liv:" + liv[0] + ";--liv2:" + liv[1] +
      ";--s1:" + ((i * 37 + 11) % 70 + 8) + "%;--s2:" + ((i * 53 + 29) % 70 + 8) + "%;--s3:" + ((i * 29 + 47) % 70 + 8) + "%";
    return (
      '<button class="box" type="button" data-i="' + i + '" style="' + vars + '"' + (real ? "" : ' tabindex="-1" aria-hidden="true"') + ">" +
        '<span class="cont"><span class="wear"></span><span class="id">' + plate(i) + "</span>" +
        '<span class="stencil">LINO·LINES</span>' +
        "<b>" + esc(p.name) + "</b><small>" + esc(p.kind) + "</small>" +
        '<svg class="pict" viewBox="0 0 24 24" aria-hidden="true"><path d="' + icon(p.icon) + '"/></svg><span class="go">ouvrir →</span></span>' +
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

  /* ---------- La ville : deux rangées d'immeubles ----------
     Tirés au hasard (mais toujours les mêmes) et répétés pour boucler.
     far  : très loin, presque effacée, défile à 10 % de la vitesse du train
     near : plus proche, avec des fenêtres, des enseignes et des fenêtres allumées, défile à 22 % */
  var LAYERS = [
    { el: $("#cityFar"), seed: 7, w: [34, 84], h: [40, 150], par: 0.1, period: 0, near: false },
    { el: $("#cityNear"), seed: 21, w: [46, 116], h: [70, 260], par: 0.22, period: 0, near: true },
  ];
  // Les enseignes : "ループ" veut dire "loop"
  var WORDS = ["ループ", "boucle", "gare", "24h", "projets", "départ", "ouvert", "lino", "devtober"];

  function buildCity(layer) {
    var rnd = seeded(layer.seed);
    var one = "";
    var width = 0;
    while (width < 1500) {
      var w = Math.round(layer.w[0] + rnd() * (layer.w[1] - layer.w[0]));
      var h = Math.round(layer.h[0] + rnd() * (layer.h[1] - layer.h[0]));
      var cls = (rnd() < 0.22 ? " ant" : "") + (rnd() < 0.16 ? " lit" : "");
      var kids = "";
      if (layer.near) {
        // des fenêtres allumées, posées sur la trame de points
        var cols = Math.floor((w - 14) / 11);
        var rows = Math.floor((h - 24) / 15);
        var n = Math.floor(rnd() * 3);
        for (var k = 0; k < n && cols > 0 && rows > 0; k++) {
          kids += '<span class="lw' + (rnd() < 0.12 ? " rose" : "") + '" style="left:' + (9 + 11 * Math.floor(rnd() * cols)) + "px;top:" + (14 + 15 * Math.floor(rnd() * rows)) +
            "px;--d:-" + (rnd() * 14).toFixed(1) + "s;--cycle:" + (9 + rnd() * 10).toFixed(1) + 's"></span>';
        }
        // une enseigne verticale, allumée en rose une fois sur deux
        if (w >= 60 && rnd() < 0.2) {
          var fits = WORDS.filter(function (word) { return word.length * 13 + 14 < h - 30; });
          if (fits.length) {
            kids += '<span class="sign' + (rnd() < 0.55 ? " on" : "") + '" style="--d:-' + (rnd() * 7).toFixed(1) + 's">' + fits[Math.floor(rnd() * fits.length)] + "</span>";
          }
        }
      }
      one += '<i style="width:' + w + "px;height:" + h + 'px"' + (cls ? ' class="' + cls.trim() + '"' : "") + ">" + kids + "</i>";
      width += w - 1;
    }
    layer.el.innerHTML = one;
    layer.period = layer.el.scrollWidth;
    var tours = Math.ceil(stage.clientWidth / layer.period) + 1;
    var all = one;
    for (var t = 1; t < tours; t++) all += one;
    layer.el.innerHTML = all;
  }

  /* ---------- Les fils électriques ----------
     Quatre poteaux, chacun avec ses traverses, tous différents et un peu de travers.
     Entre deux poteaux, un fil par isolateur, qui s'affaisse. Un fil bien droit court tout du long. */
  var WIRE_P = 1440; // largeur d'un motif, répété
  var WIRE_H = 300;

  function buildWires() {
    var rnd = seeded(11);
    var poles = [
      { x: 110, top: 52, tilt: -1.2, arms: [14, 36], trans: 30 },
      { x: 520, top: 86, tilt: 0.9, arms: [14] },
      { x: 770, top: 40, tilt: 1.5, arms: [12, 32], trans: 52 },
      { x: 1190, top: 72, tilt: -0.7, arms: [14, 30] },
    ];
    var parts = [];
    var attach = [];

    poles.forEach(function (p) {
      var sin = Math.sin(p.tilt * Math.PI / 180);
      var pts = [];
      parts.push('<g transform="rotate(' + p.tilt + " " + p.x + " " + WIRE_H + ')" stroke="#333" stroke-width="1.5">');
      parts.push('<path d="M' + p.x + " " + p.top + "V" + WIRE_H + '" stroke-width="3"/>');
      p.arms.forEach(function (a) {
        var y = p.top + a;
        parts.push('<path d="M' + (p.x - 26) + " " + y + "H" + (p.x + 26) + '"/>');
        [-22, -10, 10, 22].forEach(function (dx) {
          parts.push('<path d="M' + (p.x + dx) + " " + y + 'v-5"/>');
          // le poteau penche : le haut est décalé, les fils doivent suivre
          pts.push([p.x + dx + (WIRE_H - y) * sin, y - 6]);
        });
      });
      if (p.trans) parts.push('<rect x="' + (p.x + 6) + '" y="' + (p.top + p.trans) + '" width="12" height="22" fill="#0d0d0d"/>');
      parts.push("</g>");
      attach.push(pts);
    });

    var curve = function (a, b, dx, sag, color) {
      var c = (a[1] + b[1]) / 2 + 2 * sag;
      return '<path d="M' + a[0].toFixed(1) + " " + a[1] + "Q" + ((a[0] + dx) / 2).toFixed(1) + " " + c.toFixed(1) + " " + dx.toFixed(1) + " " + b[1] + '" stroke="' + color + '"/>';
    };
    poles.forEach(function (p, i) {
      [1, 2].forEach(function (step) {
        var j = (i + step) % poles.length;
        var wrap = i + step >= poles.length ? WIRE_P : 0;
        var n = step === 1 ? Math.min(attach[i].length, attach[j].length) : 2;
        for (var k = 0; k < n; k++) {
          var a = attach[i][k % attach[i].length];
          var b = attach[j][(step === 1 ? k : k + 1) % attach[j].length];
          var x2 = b[0] + wrap;
          var sag = (step === 1 ? 10 : 26) + (x2 - a[0]) * 0.05 * (0.7 + rnd() * 0.7);
          var color = step === 1 ? "#3a3a3a" : "#2c2c2c";
          parts.push(curve(a, b, x2, sag, color));
          // un fil qui dépasse à droite revient à gauche
          if (wrap) parts.push(curve([a[0] - WIRE_P, a[1]], b, x2 - WIRE_P, sag, color));
        }
      });
    });

    // le fil droit, et un hauban
    parts.push('<path d="M-10 106H' + (WIRE_P + 10) + '" stroke="#3a3a3a" stroke-width="1.2"/>');
    parts.push('<path d="M775 62L836 300" stroke="#2a2a2a"/>');
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + WIRE_P + '" height="' + WIRE_H + '" fill="none">' + parts.join("") + "</svg>";
    wires.style.backgroundImage = 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")';
    wires.style.backgroundSize = WIRE_P + "px " + WIRE_H + "px";
  }

  /* ---------- Les corbeaux : une petite bande traverse le ciel de temps en temps ---------- */
  var CROW = '<svg width="22" height="12" viewBox="0 0 22 12"><path class="haut" d="M1 6L6 1L11 7L16 1L21 6"/><path class="bas" d="M1 8L6 8L11 10L16 8L21 8"/></svg>';

  function spawnCrows() {
    if (!reduced && !document.hidden) {
      var W = stage.clientWidth;
      var count = 2 + Math.floor(Math.random() * 3);
      var top = 6 + Math.random() * 26;
      var toLeft = Math.random() < 0.5;
      var dur = 17 + Math.random() * 8;
      for (var n = 0; n < count; n++) {
        var el = document.createElement("div");
        el.className = "crow";
        el.style.top = top + n * 4 + Math.random() * 5 + "%";
        el.style.animationDuration = dur + n * 0.5 + "s";
        el.style.setProperty("--from", (toLeft ? W + 40 + n * 36 : -80 - n * 36) + "px");
        el.style.setProperty("--to", (toLeft ? -90 : W + 40) + "px");
        el.style.setProperty("--drop", Math.round(Math.random() * 50) + "px");
        el.innerHTML = CROW;
        el.addEventListener("animationend", function (e) { if (e.target === this) this.remove(); });
        sky.appendChild(el);
      }
    }
    setTimeout(spawnCrows, 22000 + Math.random() * 30000);
  }

  /* ---------- Traînées de vitesse ---------- */
  var STREAKS = [];
  var width = 0; // largeur de la scène

  function buildStreaks() {
    width = stage.clientWidth;
    var rnd = seeded(3);
    STREAKS = [];
    var html = "";
    for (var n = 0; n < 10; n++) {
      var len = Math.round(70 + rnd() * 170);
      STREAKS.push({ len: len, f: 1.7 + rnd() * 1.6, off: rnd() * 3000 });
      html += '<i style="top:' + Math.round(14 + rnd() * 62) + "%;width:" + len + 'px"></i>';
    }
    streaks.innerHTML = html;
  }

  /* ---------- Le son (éteint au départ) ----------
     Tout est fabriqué par le navigateur, aucun fichier : le ronflement des fils électriques,
     le "tchac-tchac" des roues sur les joints du rail, et la cloche du passage à niveau. */
  var actx = null;
  var master = null;
  var humGain = null;
  var noiseBuf = null;
  var soundOn = false;
  var bellHigh = false;
  var nextBell = 0;
  var lastJoint = 0;

  function startAudio() {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    if (!actx) {
      actx = new AC();
      master = actx.createGain();
      master.gain.value = 0.8;
      master.connect(actx.destination);
      humGain = actx.createGain();
      humGain.gain.value = 0;
      humGain.connect(master);
      [[50, 0.5], [100, 0.35], [150, 0.12]].forEach(function (p) {
        var o = actx.createOscillator();
        o.frequency.value = p[0];
        var g = actx.createGain();
        g.gain.value = p[1];
        o.connect(g);
        g.connect(humGain);
        o.start();
      });
      noiseBuf = actx.createBuffer(1, Math.floor(actx.sampleRate * 0.15), actx.sampleRate);
      var data = noiseBuf.getChannelData(0);
      for (var i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    if (actx.state === "suspended") actx.resume();
    return true;
  }

  function clack(vol) {
    var t = actx.currentTime;
    var src = actx.createBufferSource();
    src.buffer = noiseBuf;
    var f = actx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = 800 + Math.random() * 500;
    f.Q.value = 1.1;
    var g = actx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start(t);
    src.stop(t + 0.1);
  }

  // Une cloche : trois sons purs qui ne sont pas des multiples l'un de l'autre, qui s'éteignent
  function bell(pan) {
    var t = actx.currentTime;
    var base = bellHigh ? 1850 : 1700;
    bellHigh = !bellHigh;
    var g = actx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.07, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    if (actx.createStereoPanner) {
      var p = actx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p);
      p.connect(master);
    } else {
      g.connect(master);
    }
    [[1, 1], [2.76, 0.35], [5.4, 0.12]].forEach(function (partial) {
      var o = actx.createOscillator();
      o.frequency.value = base * partial[0];
      var og = actx.createGain();
      og.gain.value = partial[1];
      o.connect(og);
      og.connect(g);
      o.start(t);
      o.stop(t + 0.6);
    });
  }

  sndBtn.addEventListener("click", function () {
    soundOn = !soundOn;
    if (soundOn && !startAudio()) soundOn = false;
    if (actx) humGain.gain.setTargetAtTime(soundOn ? 0.022 : 0, actx.currentTime, 0.4);
    sndBtn.setAttribute("aria-pressed", String(soundOn));
    sndBtn.textContent = soundOn ? "son : on" : "son : off";
  });

  document.addEventListener("visibilitychange", function () {
    if (!actx || !soundOn) return;
    if (document.hidden) actx.suspend(); else actx.resume();
  });

  /* ---------- Le cycle du jour ----------
     Le temps ne passe que quand le train avance : il faut DAY pixels pour faire un jour complet,
     et il recule si le train recule. On démarre en pleine nuit (phase 0.78).
     Un seul astre traverse le ciel : le soleil dans la première partie du cycle, la lune ensuite. */
  var DAY = 14000;
  var PHASE0 = 0.78;
  var SKY = [[0, "#2a1118"], [0.18, "#1d1d1d"], [0.45, "#1d1d1d"], [0.6, "#2a1118"], [0.7, "#0d0d0d"], [0.95, "#0d0d0d"], [1, "#2a1118"]];
  var LIT = [[0, 1], [0.18, 0], [0.6, 0], [0.7, 1], [1, 1]]; // 1 = nuit (les lumières sont allumées)

  function hex(c) { return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]; }
  function rgb(a) { return "rgb(" + Math.round(a[0]) + "," + Math.round(a[1]) + "," + Math.round(a[2]) + ")"; }
  function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

  // cherche la valeur d'une liste de repères [phase, valeur] ; "blend" sait mélanger deux valeurs
  function between(keys, p, blend) {
    for (var i = 1; i < keys.length; i++) {
      if (p <= keys[i][0]) {
        var a = keys[i - 1];
        var b = keys[i];
        return blend(a[1], b[1], (p - a[0]) / (b[0] - a[0]));
      }
    }
    return keys[keys.length - 1][1];
  }

  var phaseShown = -1;
  function updateDay() {
    var p = mod(PHASE0 + x / DAY, 1);
    var q = Math.round(p * 1000);
    if (q === phaseShown) return;
    phaseShown = q;

    var bg = between(SKY, p, function (a, b, t) { return mix(hex(a), hex(b), t); });
    var lit = between(LIT, p, function (a, b, t) { return a + (b - a) * t; });
    var white = [255, 255, 255];
    var root = document.documentElement.style;
    root.setProperty("--bg", rgb(bg));
    root.setProperty("--far", rgb(mix(bg, white, 0.045)));
    root.setProperty("--near", rgb(mix(bg, white, 0.1)));
    root.setProperty("--dots", rgb(mix(bg, white, 0.075)));
    root.setProperty("--lit", lit.toFixed(2));

    // l'astre : un arc d'un bord à l'autre, rose près de l'horizon quand c'est le soleil
    var sun = p < 0.62;
    var t = sun ? p / 0.62 : (p - 0.62) / 0.38;
    var ground = train.getBoundingClientRect().bottom - stage.getBoundingClientRect().top;
    var lift = Math.sin(Math.PI * t);
    var ox = t * (width + 80) - 40;
    var oy = ground - 26 - lift * Math.max(60, ground - 120);
    orb.style.transform = "translate3d(" + ox.toFixed(1) + "px," + oy.toFixed(1) + "px,0)";
    orb.style.setProperty("--orb", sun ? rgb(mix([255, 0, 85], [224, 224, 224], Math.min(1, lift * 2.2))) : "#8c8c8c");
  }

  /* ---------- Compteur : tours et kilomètres (gardés d'une visite à l'autre) ---------- */
  var stored = 0;
  try { stored = parseFloat(localStorage.getItem("loop:m")) || 0; } catch (e) {}
  var trip = 0; // pixels parcourus pendant cette visite

  function saveTotal() {
    try { localStorage.setItem("loop:m", String(Math.round(stored + trip / METRE))); } catch (e) {}
  }
  setInterval(saveTotal, 3000);
  window.addEventListener("pagehide", saveTotal);

  var fmtDistance = function (m) {
    return m < 1000 ? Math.round(m) + " m" : (m / 1000).toFixed(1).replace(".", ",") + " km";
  };

  /* ---------- Mouvement ----------
     x   : distance parcourue (sans limite)
     v   : vitesse actuelle, en pixels par seconde (négative = le train recule)
     La vitesse glisse doucement vers la vitesse voulue : 0 à l'arrêt, sinon la croisière.
     Au chargement le train est à l'arrêt, puis démarre tout seul. */
  var x = 0;
  var v = 0;
  var dir = 1;
  var hover = false; // la souris est sur un conteneur
  var focused = false; // un conteneur a le focus (clavier)
  var opened = false; // la fiche est ouverte
  var dragging = false;
  var glideTo = null; // position à atteindre (focus clavier)
  var mx = -1; // position de la souris sur la scène (-1 = dehors)
  var my = -1;
  var driveUntil = 0; // tant que c'est dans le futur, on est en train de pousser le train : le survol ne freine pas

  var leverOn = false; // la manette est tenue
  var leverSpeed = 0;
  var wanted = function () { return leverOn ? leverSpeed : hover || focused || opened ? 0 : dir * CRUISE; };

  var last = 0;
  var shown = {}; // dernières valeurs écrites dans la page, pour ne rien réécrire pour rien
  var setText = function (el, key, text) { if (shown[key] !== text) { shown[key] = text; el.textContent = text; } };
  var FUMI_EXTRA = 2600; // distance (hors écran) entre deux passages du signal

  function frame(now) {
    var dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    var before = x;

    // Survol : on regarde sous la souris à chaque image, car le train bouge sous elle
    if (mx >= 0 && now > driveUntil) {
      var under = document.elementFromPoint(mx, my);
      hover = !!(under && under.closest(".box"));
    } else {
      hover = false;
    }

    if (!dragging) {
      // freine vite quand on survole, reprend doucement ensuite
      var k = leverOn ? 3 : hover || focused || opened ? 5 : 1.4;
      v += (wanted() - v) * (1 - Math.exp(-dt * k));
      x += v * dt;
    }
    if (glideTo !== null) {
      var d = glideTo - x;
      x += d * (1 - Math.exp(-dt * 8));
      if (Math.abs(d) < 0.5) glideTo = null;
    }
    trip += Math.abs(x - before);
    var speed = Math.abs(v);
    updateDay();

    // chaque plan avance à sa vitesse : le signal devant tout, puis le train, les poteaux, la ville
    train.style.transform = "translate3d(" + -mod(x, period) + "px,0,0)";
    train.style.setProperty("--rot", mod(x * 8.2, 360).toFixed(1) + "deg");
    var amp = (Math.min(1, speed / 450) * 1.5).toFixed(2);
    if (shown.amp !== amp) { shown.amp = amp; train.style.setProperty("--amp", amp + "px"); }
    ties.style.backgroundPositionX = -mod(x, 22) + "px";
    wires.style.backgroundPositionX = -mod(x * 0.55, WIRE_P) + "px";
    LAYERS.forEach(function (l) { l.el.style.transform = "translate3d(" + -mod(x * l.par, l.period) + "px,0,0)"; });

    // le signal de passage à niveau : il arrive par la droite, traverse l'écran, et revient bien plus tard
    var fx = width + 60 - mod(x * 1.12, width + FUMI_EXTRA);
    fumi.style.transform = "translate3d(" + fx.toFixed(1) + "px,0,0)";
    var fumiOn = fx > -90 && fx < width;

    // les traînées : de plus en plus visibles quand le train va vite
    var level = Math.min(1, Math.max(0, (speed - 380) / 700));
    streaks.style.opacity = level.toFixed(2);
    if (level > 0.01) {
      var all = streaks.children;
      for (var s = 0; s < STREAKS.length; s++) {
        var st = STREAKS[s];
        var px = width - mod(x * st.f + st.off, width + st.len);
        all[s].style.transform = "translate3d(" + px + "px,0,0)";
      }
    }

    // le son : un "tchac-tchac" à chaque joint du rail, la cloche quand le signal est à l'écran
    if (soundOn && actx) {
      var joint = Math.floor(Math.abs(x) / 260);
      if (joint !== lastJoint) {
        lastJoint = joint;
        if (speed > 25) {
          var vol = 0.05 + Math.min(1, speed / 500) * 0.12;
          clack(vol);
          setTimeout(function () { clack(vol * 0.7); }, 85);
        }
      }
      if (fumiOn && now > nextBell) {
        bell(Math.max(-1, Math.min(1, ((fx + 45) / width) * 2 - 1)) * 0.7);
        nextBell = now + 620;
      }
    }

    // compteur de vitesse
    setText(stamp, "kmh", Math.round(speed * KMH) + " km/h");
    setText(arrow, "dir", speed < 8 ? "··" : v > 0 ? ">>" : "<<");
    arrow.classList.toggle("go", speed >= 8);
    // le curseur de la manette : au milieu à l'arrêt, plus loin quand on va plus vite (échelle en racine carrée)
    var knobAt = (Math.sqrt(Math.min(1, speed / MAX)) * (v < 0 ? -1 : 1) + 1) / 2;
    knob.style.left = (knobAt * 100).toFixed(1) + "%";
    lever.classList.toggle("on", leverOn || speed >= 8);
    setText(odo, "odo", "tour " + (Math.floor(trip / period) + 1) + " · " + fmtDistance(stored + trip / METRE));

    requestAnimationFrame(frame);
  }

  /* ---------- La manette ----------
     On la tient et on la déplace : à gauche le train recule, à droite il avance, au centre il s'arrête.
     On la lâche : il reprend sa croisière. */
  function pullLever(e) {
    var r = lever.getBoundingClientRect();
    var s = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1));
    if (Math.abs(s) < 0.05) s = 0;
    leverSpeed = (s < 0 ? -1 : 1) * s * s * MAX;
    driveUntil = performance.now() + 900;
    if (Math.abs(leverSpeed) > 8) dir = leverSpeed > 0 ? 1 : -1;
  }

  lever.addEventListener("pointerdown", function (e) {
    if (e.button !== 0) return;
    e.stopPropagation(); // ne pas faire glisser la scène
    leverOn = true;
    lever.setPointerCapture(e.pointerId);
    pullLever(e);
  });
  lever.addEventListener("pointermove", function (e) { if (leverOn) pullLever(e); });
  var dropLever = function () { leverOn = false; };
  lever.addEventListener("pointerup", dropLever);
  lever.addEventListener("pointercancel", dropLever);

  /* ---------- Conduire : molette, glisser ---------- */
  function push(amount) {
    driveUntil = performance.now() + 900;
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
    trip += Math.abs(dx);
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
    open(+b.getAttribute("data-i"), b);
  });

  // Survol : le train s'arrête devant le conteneur (la souris seulement, pas le doigt)
  stage.addEventListener("pointermove", function (e) { if (e.pointerType === "mouse") { mx = e.clientX; my = e.clientY; } });
  stage.addEventListener("pointerleave", function () { mx = -1; });

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

  /* ---------- L'intérieur du conteneur ---------- */
  function open(i, from) {
    var p = PROJECTS[i];
    if (!p) return;
    $("#dKind").textContent = p.kind;
    $("#dName").textContent = p.name;
    $("#dText").textContent = p.text;
    $("#dPlate").textContent = plate(i);
    $("#dDoorL").textContent = plate(i);
    $("#dIcon").innerHTML = '<path d="' + icon(p.icon) + '"/>';

    // les technos deviennent des caisses
    $("#dTags").innerHTML = (p.tags || []).map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("");

    // les liens deviennent des étiquettes suspendues, chacune avec un fil de longueur différente
    $("#dLinks").innerHTML = (p.links || []).map(function (l, k) {
      var ext = /^https?:/.test(l.url);
      return '<a href="' + esc(l.url) + '"' + (ext ? ' target="_blank" rel="noopener"' : "") +
        ' style="--cord:' + (34 + (k * 31) % 56) + "px;--d:-" + (k * 1.4).toFixed(1) + 's">' + esc(l.label) + "</a>";
    }).join("");

    // l'intérieur prend la couleur du conteneur
    var liv = livery(p, i);
    dlg.style.setProperty("--liv", liv[0]);
    dlg.style.setProperty("--liv2", liv[1]);

    // le conteneur cliqué grossit jusqu'à remplir l'écran, en partant de sa place sur la scène
    if (from) {
      var r = from.getBoundingClientRect();
      dlg.style.setProperty("--ox", r.left + r.width / 2 + "px");
      dlg.style.setProperty("--oy", r.top + r.height / 2 + "px");
      dlg.style.setProperty("--s0", Math.max(0.2, Math.min(0.6, r.width / Math.min(720, window.innerWidth * 0.92))).toFixed(2));
    }
    dlg.style.setProperty("--rx", "0deg");
    dlg.style.setProperty("--ry", "0deg");
    opened = true;
    dlg.showModal();
  }

  // on sort en fondu
  var leaving = false;
  function closeFiche() {
    if (leaving || !dlg.open) return;
    leaving = true;
    dlg.classList.add("sort");
    setTimeout(function () {
      dlg.close();
      dlg.classList.remove("sort");
      leaving = false;
    }, reduced ? 0 : 230);
  }

  dlg.addEventListener("close", function () { opened = false; });
  dlg.addEventListener("cancel", function (e) { e.preventDefault(); closeFiche(); });
  $("#dClose").addEventListener("click", closeFiche);

  // la caméra penche légèrement du côté de la souris
  dlg.addEventListener("pointermove", function (e) {
    if (reduced || e.pointerType !== "mouse") return;
    dlg.style.setProperty("--ry", ((e.clientX / window.innerWidth - 0.5) * 5).toFixed(2) + "deg");
    dlg.style.setProperty("--rx", (-(e.clientY / window.innerHeight - 0.5) * 4).toFixed(2) + "deg");
  });

  /* ---------- Démarrage ---------- */
  function buildAll() {
    LAYERS.forEach(buildCity);
    buildTrain();
    buildStreaks();
  }
  buildAll();
  buildWires();
  setTimeout(spawnCrows, 5000);

  var resizeTimer;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(buildAll, 150);
  });

  requestAnimationFrame(function (t) { last = t; frame(t); });
})();
