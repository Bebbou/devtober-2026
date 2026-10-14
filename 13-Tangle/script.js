(function () {
  "use strict";

  const $ = (s) => document.querySelector(s);

  // true si la personne préfère éviter les animations : la course avance alors par pas de 0,4 s, sans interpolation
  const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const KEY = "devtober-tangle-13";
  const hash = location.hash;
  const testMode = /[#&]test\b/.test(hash);
  const fixedSeed = (hash.match(/graine=(\d+)/) || [])[1];

  const cv = $("#cv");
  const ctx = cv.getContext("2d");
  const cardsEl = $("#cards");
  const pickEl = $("#pick");
  const endEl = $("#end");
  const liveEl = $("#live");

  const NAMES = [
    "feat/login", "fix/typo", "refactor/api", "hotfix/css", "feat/dark-mode", "chore/deps",
    "feat/cache", "fix/null", "perf/images", "feat/search", "docs/readme", "fix/race",
    "feat/export", "test/e2e", "feat/i18n", "fix/scroll",
  ];
  // une couleur franche par branche ; le nom au bout du trait la double pour ceux qui ne distinguent pas les teintes
  const COLORS = ["#ff0055", "#ff8a00", "#ffd60a", "#2bd96b", "#00d4ff", "#3d7bff", "#b45cff", "#9bb0c9"];
  const MIN_N = 4;
  const MAX_N = 8;
  const FIXED_DT = 1 / 60;

  // générateur reproductible : une même graine donne la même course
  function mulberry32(a) {
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const st = {
    phase: "pick", // pick, race, end
    n: 5,
    seed: 0,
    rnd: null,
    branches: [],
    bet: -1,
    winner: -1,
    t: 0,
    leader: -1,
    leaderChanges: 0,
    hover: -1,
    cardHover: -1,
    lastSay: 0,
    started: false,
    games: 0,
    wins: 0,
  };

  // ---------- Mémoire ----------
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "{}");
    st.games = saved.games | 0;
    st.wins = saved.wins | 0;
    if (saved.n >= MIN_N && saved.n <= MAX_N) st.n = saved.n;
  } catch (e) { /* on repart de zéro */ }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify({ games: st.games, wins: st.wins, n: st.n })); } catch (e) { /* on s'en passe */ }
  }

  function showScore() {
    $("#score").textContent = st.wins + " / " + st.games;
  }

  // ---------- Simulation ----------
  function newRound() {
    // avec #graine=N, la première manche utilise N et les suivantes N+1, N+2...
    if (fixedSeed !== undefined) st.seed = st.started ? st.seed + 1 : +fixedSeed;
    else st.seed = (Math.random() * 4294967296) >>> 0;
    st.started = true;
    st.rnd = mulberry32(st.seed);
    const r = st.rnd;
    // noms tirés sans remise
    const pool = NAMES.slice();
    st.branches = [];
    for (let i = 0; i < st.n; i++) {
      const name = pool.splice((r() * pool.length) | 0, 1)[0];
      st.branches.push({
        name: name,
        color: COLORS[i],
        f1: 1.5 + r() * 2, ph1: r(), f2: 4 + r() * 4, ph2: r(),
        c: (i + 0.5) / st.n, sp: 1 / st.n,
        p: 0, shown: 0, commits: [], next: 0.2 + r() * 0.6, form: 1,
      });
    }
    st.phase = "pick";
    st.bet = -1;
    st.winner = -1;
    st.t = 0;
    st.leader = -1;
    st.leaderChanges = 0;
    st.hover = -1;
    st.cardHover = -1;
    st.lastSay = 0;
    pickEl.hidden = false;
    endEl.hidden = true;
    liveEl.textContent = "";
    buildCards();
    layout();
    setCursor();
    draw();
  }

  function leaderIndex() {
    let best = 0;
    for (let i = 1; i < st.branches.length; i++) {
      if (st.branches[i].p > st.branches[best].p) best = i;
    }
    return best;
  }

  // un pas de simulation de durée fixe (la course ne dépend pas de la fréquence d'affichage)
  function step() {
    const r = st.rnd;
    const bs = st.branches;
    st.t += FIXED_DT;
    const due = [];
    for (let i = 0; i < bs.length; i++) if (st.t >= bs[i].next) due.push(i);
    // si deux branches franchissent la ligne dans le même pas, la plus ancienne commande gagne
    due.sort((a, b) => bs[a].next - bs[b].next);
    let avg = 0;
    for (let i = 0; i < bs.length; i++) avg += bs[i].p;
    avg /= bs.length;
    for (const i of due) {
      const b = bs[i];
      // une branche en retard rattrape un peu : sans cela, la tête s'envole et la course s'ennuie
      const catchUp = Math.max(0.6, Math.min(1.6, 1 + 0.8 * (avg - b.p)));
      b.form += (r() - 0.5) * 0.5 + (1 - b.form) * 0.15;
      b.form = Math.max(0.5, Math.min(1.6, b.form));
      b.p += 0.026 * (0.5 + r()) * b.form * catchUp;
      b.next += (0.25 + r() * 0.55) / (0.7 + 0.3 * b.form);
      if (b.p >= 1) {
        b.p = 1;
        b.commits.push(1);
        st.winner = i;
        finish();
        return;
      }
      b.commits.push(b.p);
    }
    for (const b of bs) b.shown = calm ? b.p : b.shown + (b.p - b.shown) * Math.min(1, FIXED_DT * 8);
    const l = leaderIndex();
    if (l !== st.leader) {
      if (st.leader >= 0) st.leaderChanges++;
      st.leader = l;
      if (st.t - st.lastSay > 1.5) {
        st.lastSay = st.t;
        liveEl.textContent = "en tête : " + bs[l].name + " (" + bs[l].commits.length + " commits)";
      }
    }
  }

  function finish() {
    st.phase = "end";
    if (lastType !== "mouse") st.hover = -1;
    for (const b of st.branches) b.shown = b.p;
    const won = st.winner === st.bet;
    st.games++;
    if (won) st.wins++;
    save();
    showScore();
    const w = st.branches[st.winner];
    const me = st.branches[st.bet];
    endEl.hidden = false;
    $("#endMark").textContent = won ? "merge to main" : "merge conflict";
    const text = $("#endText");
    text.textContent = "";
    const b = document.createElement("b");
    if (won) {
      b.textContent = w.name;
      text.append(b, " fait le merge vers main après " + w.commits.length + " commits. Pari gagné, l'histoire est validée.");
    } else {
      b.textContent = "CONFLICT";
      text.append(b, " sur " + me.name + " (" + me.commits.length + " commits). " + w.name + " a fait le merge vers main après " + w.commits.length + " commits. Pari perdu.");
    }
    liveEl.textContent = won ? "Pari gagné." : "Merge conflict, pari perdu.";
    draw();
    $("#again").focus();
  }

  // ---------- Dessin ----------
  const TAU = Math.PI * 2;
  const FONT = "11px 'Courier New', monospace";
  const PADX = 22;
  const Y_MAIN = 52;

  // replie une position sur [0, 1] : une branche rebondit sur le bord au lieu de sortir du cadre
  function fold(v) {
    return 1 - Math.abs(1 - (((v % 2) + 2) % 2));
  }

  // position transversale (0 à 1) d'une branche quand elle a progressé de q : sa colonne, plus deux sinus qui s'amplifient avec q
  function lateral(b, q) {
    const env = Math.min(1, q / 0.1);
    const amp = (0.3 + 1.1 * Math.min(1, q * 2)) * env * b.sp;
    const w =
      0.6 * (Math.sin(TAU * (b.f1 * q + b.ph1)) - Math.sin(TAU * b.ph1)) +
      0.4 * (Math.sin(TAU * (b.f2 * q + b.ph2)) - Math.sin(TAU * b.ph2));
    // les colonnes se resserrent vers le centre en milieu de course (le nœud), puis se rouvrent vers main
    const pull = 0.65 * Math.sin(Math.PI * q);
    return fold(b.c + (0.5 - b.c) * pull + amp * w);
  }

  let W = 0;
  let H = 0;
  // hauteur réservée au pied du graphe pour les noms écrits en colonne
  let baseH = 100;

  function layout() {
    ctx.font = FONT;
    let m = 0;
    for (const b of st.branches) m = Math.max(m, ctx.measureText(b.name).width);
    // borné : sur un canevas bas, la barre de départ ne doit pas dépasser main
    baseH = Math.min(Math.ceil(m) + 48, H * 0.4);
  }

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    W = cv.clientWidth;
    H = cv.clientHeight;
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    layout();
  }

  // (u, v) : avancée vers main (de bas en haut), puis position transversale, tous deux entre 0 et 1
  function map(u, v) {
    const yStart = H - baseH;
    return [PADX + v * (W - 2 * PADX), yStart - u * (yStart - Y_MAIN)];
  }

  function trace(b, from, to) {
    ctx.beginPath();
    for (let q = from; q < to; q += 0.01) {
      const pt = map(q, lateral(b, q));
      if (q === from) ctx.moveTo(pt[0], pt[1]); else ctx.lineTo(pt[0], pt[1]);
    }
    const e = map(to, lateral(b, to));
    ctx.lineTo(e[0], e[1]);
    ctx.stroke();
  }

  function text(str, x, y, color) {
    ctx.fillStyle = color;
    ctx.font = FONT;
    ctx.textBaseline = "middle";
    ctx.fillText(str, x, y);
  }

  function label(str, x, y, color) {
    ctx.font = FONT;
    const w = ctx.measureText(str).width;
    // le texte reste dans le cadre : il passe à gauche du point près du bord droit
    let tx = x + 9;
    if (tx + w > W - 4) tx = x - w - 8;
    // contour de la couleur du fond : le texte reste lisible quand il croise un trait
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#0d0d0d";
    ctx.strokeText(str, tx, y);
    ctx.fillStyle = color;
    ctx.fillText(str, tx, y);
  }

  // branche mise en avant : le survol du graphe, sinon celui d'une carte
  function focusIndex() {
    return st.hover >= 0 ? st.hover : st.cardHover;
  }

  function drawBranch(i, f) {
    const b = st.branches[i];
    const mine = i === st.bet;
    const ended = st.phase === "end";
    const won = ended && i === st.winner;
    const hot = i === f;
    const color = b.color;
    let alpha = 1;
    if (f >= 0) alpha = hot ? 1 : mine || won ? 0.6 : 0.18;
    else if (ended && !won && !mine) alpha = 0.3;
    // save/restore : le style de cette branche ne déborde pas sur la suite du dessin
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const big = mine || hot;
    if (b.shown > 0) {
      // le tracé ancien est plus fin que les derniers 10 % : on voit d'où la branche vient
      ctx.lineWidth = big ? 2 : 1.5;
      if (b.shown > 0.1) trace(b, 0, b.shown - 0.1);
      ctx.lineWidth = big ? 4 : 3;
      trace(b, Math.max(0, b.shown - 0.1), b.shown);
    }
    ctx.fillStyle = color;
    for (const c of b.commits) {
      if (c > b.shown + 0.0001) break;
      const pt = map(c, lateral(b, c));
      ctx.fillRect(pt[0] - 1.5, pt[1] - 1.5, 3, 3);
    }
    const h = map(b.shown, lateral(b, b.shown));
    ctx.beginPath();
    ctx.arc(h[0], h[1], big ? 6 : 5, 0, TAU);
    ctx.fill();
    if (mine || won) {
      // anneau blanc cerné de sombre : il reste visible même sur une branche claire
      ctx.beginPath();
      ctx.arc(h[0], h[1], 10, 0, TAU);
      ctx.strokeStyle = "#0d0d0d";
      ctx.lineWidth = 4.5;
      ctx.stroke();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (ended && mine && !won) {
      // le conflit : une croix et un libellé sur la branche abandonnée
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(h[0] - 7, h[1] - 7); ctx.lineTo(h[0] + 7, h[1] + 7);
      ctx.moveTo(h[0] + 7, h[1] - 7); ctx.lineTo(h[0] - 7, h[1] + 7);
      ctx.stroke();
      label("CONFLICT", h[0], h[1] + 20, "#ffffff");
    } else if (won) {
      label("merge to main", h[0], h[1] + 20, "#ffffff");
    }
    // le nom au bout du trait seulement pour la branche survolée, la mise, la gagnante et la tête de course
    if (b.shown > 0 && (hot || mine || won || (st.phase === "race" && i === st.leader))) {
      label(hot ? b.name + " · " + b.commits.length + " commits" : b.name, h[0], h[1], color);
    }
    ctx.restore();
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    const f = focusIndex();
    const pickPhase = st.phase === "pick";
    const yStart = H - baseH;
    const bs = st.branches;
    // rails : la colonne de chaque branche, très discrète pendant la course
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 6]);
    for (let i = 0; i < bs.length; i++) {
      const x = map(0, bs[i].c)[0];
      ctx.strokeStyle = bs[i].color;
      ctx.globalAlpha = pickPhase ? (i === f ? 0.7 : 0.3) : i === f ? 0.35 : 0.1;
      ctx.beginPath();
      ctx.moveTo(x, yStart);
      ctx.lineTo(x, Y_MAIN);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    // main en haut, Initial Commit en bas
    ctx.strokeStyle = "#333333";
    ctx.beginPath();
    ctx.moveTo(8, Y_MAIN);
    ctx.lineTo(W - 8, Y_MAIN);
    ctx.moveTo(8, yStart);
    ctx.lineTo(W - 8, yStart);
    ctx.stroke();
    ctx.textAlign = "start";
    text("main", 10, Y_MAIN - 14, "#8c8c8c");
    text("Initial Commit", 10, H - 12, "#8c8c8c");
    // pied de chaque colonne : un nœud et le nom écrit vers le bas
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i];
      const x = map(0, b.c)[0];
      ctx.globalAlpha = f >= 0 && i !== f ? 0.35 : st.phase === "end" && i !== st.winner && i !== st.bet ? 0.5 : 1;
      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.arc(x, yStart, i === f ? 6 : 4, 0, TAU);
      ctx.fill();
      ctx.save();
      ctx.translate(x, yStart + 16);
      ctx.rotate(Math.PI / 2);
      text(b.name, 0, 0, b.color);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    for (let i = 0; i < bs.length; i++) if (i !== st.bet && i !== f) drawBranch(i, f);
    if (st.bet >= 0 && st.bet !== f) drawBranch(st.bet, f);
    if (f >= 0) drawBranch(f, f);
  }

  // ---------- Survol ----------
  function dist2seg(px, py, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const l = dx * dx + dy * dy;
    let t = l ? ((px - a[0]) * dx + (py - a[1]) * dy) / l : 0;
    t = Math.max(0, Math.min(1, t));
    const x = a[0] + t * dx - px, y = a[1] + t * dy - py;
    return x * x + y * y;
  }

  // branche sous le pointeur : le pied de colonne et, avant le départ, toute la colonne, puis le tracé
  function hit(px, py) {
    const bs = st.branches;
    const half = (W - 2 * PADX) / bs.length / 2;
    const yStart = H - baseH;
    for (let i = 0; i < bs.length; i++) {
      const x = map(0, bs[i].c)[0];
      if (Math.abs(px - x) <= half && (st.phase === "pick" || py >= yStart - 6)) return i;
    }
    let best = -1;
    let bd = 12 * 12;
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i];
      let prev = map(0, lateral(b, 0));
      for (let q = 0.02; q < b.shown + 0.02; q += 0.02) {
        const pt = map(Math.min(q, b.shown), lateral(b, Math.min(q, b.shown)));
        const d = dist2seg(px, py, prev, pt);
        if (d < bd) { bd = d; best = i; }
        prev = pt;
      }
    }
    return best;
  }

  function setHover(i) {
    if (i === st.hover) return;
    st.hover = i;
    refresh();
  }

  // redessine et surligne la carte correspondante
  function refresh() {
    const f = focusIndex();
    for (let k = 0; k < cardsEl.children.length; k++) cardsEl.children[k].classList.toggle("hot", k === f);
    draw();
  }

  function pointer(e) {
    const r = cv.getBoundingClientRect();
    return hit(e.clientX - r.left, e.clientY - r.top);
  }

  // dernier type de pointeur : au doigt, le repérage ne se retire pas tout seul
  let lastType = "mouse";
  // un clic compte seulement s'il a commencé sur le canevas (pas après un glisser venu d'ailleurs)
  let downOnCv = false;
  cv.addEventListener("pointerdown", () => { downOnCv = true; });
  document.addEventListener("pointerup", () => { downOnCv = false; });
  // pendant le choix, tout le graphe est cliquable
  function setCursor() {
    cv.style.cursor = st.phase === "pick" ? "pointer" : "default";
  }
  setCursor();
  cv.addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse") return;
    lastType = "mouse";
    setHover(pointer(e));
  });
  cv.addEventListener("pointerleave", (e) => {
    if (e.pointerType === "mouse") setHover(-1);
  });
  cv.addEventListener("pointerup", (e) => {
    const i = pointer(e);
    lastType = e.pointerType;
    if (e.pointerType === "mouse") {
      if (e.button === 0 && downOnCv && st.phase === "pick" && i >= 0) start(i);
      return;
    }
    // au doigt : un premier toucher repère la branche, un second sur la même la mise
    if (st.phase === "pick" && i >= 0 && i === st.hover) start(i); else setHover(i);
  });

  // ---------- Interface ----------
  function buildCards() {
    const count = $(".count");
    while (count.children.length > 1) count.removeChild(count.lastChild);
    for (let n = MIN_N; n <= MAX_N; n++) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = n;
      btn.setAttribute("aria-pressed", n === st.n ? "true" : "false");
      btn.setAttribute("aria-label", n + " branches");
      btn.addEventListener("click", () => {
        st.n = n;
        save();
        newRound();
        // les boutons ont été recréés : le focus clavier revient sur le même nombre
        count.children[n - MIN_N + 1].focus();
      });
      count.appendChild(btn);
    }
    cardsEl.textContent = "";
    st.branches.forEach((b, i) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "card";
      card.style.setProperty("--c", b.color);
      const name = document.createElement("span");
      name.textContent = b.name;
      const NS = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(NS, "svg");
      svg.setAttribute("viewBox", "0 0 100 4");
      svg.setAttribute("preserveAspectRatio", "none");
      svg.setAttribute("aria-hidden", "true");
      const ln = document.createElementNS(NS, "line");
      ln.setAttribute("x1", "0"); ln.setAttribute("x2", "100"); ln.setAttribute("y1", "2"); ln.setAttribute("y2", "2");
      ln.setAttribute("stroke", b.color);
      ln.setAttribute("stroke-width", "3");
      ln.setAttribute("vector-effect", "non-scaling-stroke");
      svg.appendChild(ln);
      const small = document.createElement("small");
      small.textContent = "miser sur cette branche";
      card.append(name, svg, small);
      card.addEventListener("click", () => start(i));
      // survoler ou mettre au clavier le focus sur une carte repère la branche sur le graphe
      const preview = (on) => () => { st.cardHover = on ? i : -1; refresh(); };
      card.addEventListener("mouseenter", preview(true));
      card.addEventListener("mouseleave", preview(false));
      card.addEventListener("focus", preview(true));
      card.addEventListener("blur", preview(false));
      cardsEl.appendChild(card);
    });
  }

  function start(i) {
    if (st.phase !== "pick") return;
    st.bet = i;
    st.cardHover = -1;
    if (lastType !== "mouse") st.hover = -1;
    st.phase = "race";
    setCursor();
    pickEl.hidden = true;
    closeTour();
    // le focus reste sur la page : le bouton cliqué vient de disparaître
    liveEl.tabIndex = -1;
    liveEl.focus();
    liveEl.textContent = "Course lancée, tu as misé sur " + st.branches[i].name + ".";
    draw();
    if (!testMode) startLoop();
  }

  let rafId = 0;
  let timerId = 0;
  function startLoop() {
    if (calm) {
      // pas de mouvement continu : un bond de 0,4 s à la fois
      timerId = setInterval(() => {
        for (let k = 0; k < 24 && st.phase === "race"; k++) step();
        draw();
        if (st.phase !== "race") clearInterval(timerId);
      }, 400);
      return;
    }
    let last = performance.now();
    let acc = 0;
    const frame = (now) => {
      acc += Math.min(0.1, (now - last) / 1000);
      last = now;
      while (acc >= FIXED_DT && st.phase === "race") {
        step();
        acc -= FIXED_DT;
      }
      draw();
      if (st.phase === "race") rafId = requestAnimationFrame(frame);
    };
    rafId = requestAnimationFrame(frame);
  }

  function again() {
    cancelAnimationFrame(rafId);
    clearInterval(timerId);
    newRound();
    cardsEl.querySelector("button").focus();
  }

  // ---------- Aide ----------
  const TOUR = [
    "Chaque branche part de l'Initial Commit dans sa colonne. Survole-les pour les repérer, puis clique sur celle que tu penses voir arriver la première.",
    "Les commits tombent au hasard. Les branches se croisent et s'emmêlent, mais seule l'avance vers main compte.",
    "La première à toucher main fait l'unique merge. Si ce n'est pas la tienne, elle finit en conflit.",
  ];
  let tourAt = 0;
  const tourEl = $("#tour");

  function showTour() {
    $("#tourText").textContent = TOUR[tourAt] + " (" + (tourAt + 1) + "/" + TOUR.length + ")";
    $("#tourNext").textContent = tourAt === TOUR.length - 1 ? "compris" : "suivant";
    tourEl.hidden = false;
  }

  function closeTour() {
    tourEl.hidden = true;
    try { localStorage.setItem(KEY + "-vu", "1"); } catch (e) { /* on s'en passe */ }
  }

  $("#tourNext").addEventListener("click", () => {
    if (tourAt >= TOUR.length - 1) closeTour(); else { tourAt++; showTour(); }
  });
  $("#tourSkip").addEventListener("click", closeTour);
  $("#help").addEventListener("click", () => {
    if (st.phase !== "pick") return;
    tourAt = 0;
    showTour();
  });
  $("#again").addEventListener("click", again);

  window.addEventListener("resize", () => { resize(); draw(); });

  // ---------- Démarrage ----------
  resize();
  showScore();
  newRound();
  let seen = false;
  try { seen = !!localStorage.getItem(KEY + "-vu"); } catch (e) { /* aide proposée à chaque fois */ }
  if (!seen && !testMode) showTour();

  // en mode #test, rien ne tourne seul : la page pilote la course avec __tangle.run(secondes)
  if (testMode) {
    window.__tangle = {
      st: st,
      start: start,
      newRound: newRound,
      hover: (i) => { st.hover = i; refresh(); },
      hit: hit,
      run: (sec) => {
        const n = Math.round(sec / FIXED_DT);
        for (let k = 0; k < n && st.phase === "race"; k++) step();
        draw();
      },
    };
  }
})();
