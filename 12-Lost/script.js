(() => {
  "use strict";

  const $ = (s) => document.querySelector(s);

  // true si la personne préfère éviter les animations : le faisceau colle alors au pointeur
  const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const stage = $("#stage");
  const exit = $("#exit");
  const cv = $("#dark");
  const ctx = cv.getContext("2d");

  const HINT_DELAY = 30000; // sans succès, un indice apparaît
  const STEP = 48; // pas des flèches du clavier, en pixels

  let w = 0;
  let h = 0;
  let radius = 120;
  let beam = { x: 0, y: 0 }; // position affichée
  let aim = { x: 0, y: 0 }; // position visée (pointeur, doigt ou clavier)
  let raf = 0;
  let found = false;

  // Le bouton ne doit pas être dans la zone éclairée au départ (le centre de l'écran)
  const placeExit = () => {
    let x;
    let y;
    do {
      x = 18 + Math.random() * 64;
      y = 12 + Math.random() * 76;
    } while (Math.abs(x - 50) < 26 && Math.abs(y - 50) < 24);
    exit.style.left = x + "%";
    exit.style.top = y + "%";
  };

  const draw = () => {
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#0d0d0d";
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = "destination-out";
    const g = ctx.createRadialGradient(beam.x, beam.y, 0, beam.x, beam.y, radius);
    g.addColorStop(0, "rgba(0,0,0,1)");
    g.addColorStop(0.55, "rgba(0,0,0,0.85)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(beam.x - radius, beam.y - radius, radius * 2, radius * 2);
  };

  const exitCenter = () => {
    const r = exit.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };

  // Le bouton passe au rose quand le faisceau est dessus
  const checkFound = () => {
    const c = exitCenter();
    const on = Math.hypot(c.x - beam.x, c.y - beam.y) < radius * 0.5;
    if (on !== exit.classList.contains("found")) exit.classList.toggle("found", on);
    if (on) found = true;
  };

  // La boucle ne tourne que tant que le faisceau rattrape sa cible
  const tick = () => {
    raf = 0;
    const dx = aim.x - beam.x;
    const dy = aim.y - beam.y;
    if (calm || Math.hypot(dx, dy) < 0.5) {
      beam.x = aim.x;
      beam.y = aim.y;
    } else {
      beam.x += dx * 0.22;
      beam.y += dy * 0.22;
      raf = requestAnimationFrame(tick);
    }
    draw();
    checkFound();
  };

  const move = (x, y) => {
    aim.x = Math.max(0, Math.min(w, x));
    aim.y = Math.max(0, Math.min(h, y));
    if (!raf) raf = requestAnimationFrame(tick);
  };

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth;
    h = window.innerHeight;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    radius = Math.max(90, Math.min(150, Math.min(w, h) * 0.28));
    aim.x = Math.min(aim.x, w);
    aim.y = Math.min(aim.y, h);
    beam.x = aim.x;
    beam.y = aim.y;
    draw();
    checkFound();
  };

  // Indice en texte, donné une seule fois : direction du bouton par rapport au faisceau
  const hint = () => {
    if (found) return;
    const c = exitCenter();
    const v = c.y < beam.y - 40 ? "vers le haut" : c.y > beam.y + 40 ? "vers le bas" : "";
    const hz = c.x < beam.x - 40 ? "vers la gauche" : c.x > beam.x + 40 ? "vers la droite" : "";
    const dir = [v, hz].filter(Boolean).join(", ") || "tout près";
    $("#hint").textContent = "Un bouton est caché : " + dir + ".";
  };

  window.addEventListener("pointermove", (e) => move(e.clientX, e.clientY));
  window.addEventListener("pointerdown", (e) => move(e.clientX, e.clientY));
  window.addEventListener("resize", resize);

  // Sans souris : les flèches déplacent la lampe, Tab l'amène sur le bouton
  window.addEventListener("keydown", (e) => {
    const d = {
      ArrowLeft: [-STEP, 0],
      ArrowRight: [STEP, 0],
      ArrowUp: [0, -STEP],
      ArrowDown: [0, STEP],
    }[e.key];
    if (!d || e.altKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    move(aim.x + d[0], aim.y + d[1]);
  });
  exit.addEventListener("focus", () => {
    const c = exitCenter();
    move(c.x, c.y);
  });

  placeExit();
  aim.x = window.innerWidth / 2;
  aim.y = window.innerHeight * 0.45;
  resize();
  setTimeout(hint, HINT_DELAY);

  // Pour les tests : la position du bouton est lisible sans capture
  if (/[#&]test\b/.test(location.hash)) window.__lost = { exit, beam, aim, move };
})();
