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
        p: 0, shown: 0, commits: [], next: 0.2 + r() * 0.6, form: 1,
      });
    }
    st.phase = "pick";
    st.bet = -1;
    st.winner = -1;
    st.t = 0;
    st.leader = -1;
    st.leaderChanges = 0;
    st.lastSay = 0;
    pickEl.hidden = false;
    endEl.hidden = true;
    liveEl.textContent = "";
    buildCards();
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
  // position transversale d'une branche quand elle a progressé de q : deux sinus, qui s'amplifient avec q
  function lateral(b, q) {
    const env = Math.min(1, q / 0.1);
    const amp = (0.08 + 0.14 * Math.min(1, q * 2)) * env;
    const TAU = Math.PI * 2;
    const w =
      0.6 * (Math.sin(TAU * (b.f1 * q + b.ph1)) - Math.sin(TAU * b.ph1)) +
      0.4 * (Math.sin(TAU * (b.f2 * q + b.ph2)) - Math.sin(TAU * b.ph2));
    return 0.5 + amp * w;
  }

  let W = 0;
  let H = 0;

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    W = cv.clientWidth;
    H = cv.clientHeight;
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // (u, v) : avancée vers main (de bas en haut), puis position transversale, tous deux entre 0 et 1
  function map(u, v) {
    const x0 = 28, x1 = W - 28, yStart = H - 36, yMain = 44;
    return [x0 + v * (x1 - x0), yStart - u * (yStart - yMain)];
  }

  function trace(b, upto) {
    ctx.beginPath();
    let first = true;
    for (let q = 0; q < upto; q += 0.01) {
      const pt = map(q, lateral(b, q));
      if (first) { ctx.moveTo(pt[0], pt[1]); first = false; } else ctx.lineTo(pt[0], pt[1]);
    }
    const e = map(upto, lateral(b, upto));
    ctx.lineTo(e[0], e[1]);
    ctx.stroke();
  }

  function label(text, x, y, color) {
    ctx.fillStyle = color;
    ctx.font = "11px 'Courier New', monospace";
    const w = ctx.measureText(text).width;
    // le texte reste dans le cadre : il passe à gauche du point près du bord droit
    let tx = x + 9;
    if (tx + w > W - 4) tx = x - w - 8;
    ctx.textBaseline = "middle";
    // contour de la couleur du fond : le texte reste lisible quand il croise un trait
    ctx.lineJoin = "round";
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#0d0d0d";
    ctx.strokeText(text, tx, y);
    ctx.fillText(text, tx, y);
  }

  function drawBranch(i) {
    const b = st.branches[i];
    const mine = i === st.bet;
    const ended = st.phase === "end";
    const won = ended && i === st.winner;
    const color = b.color;
    const dim = ended && !won && !mine;
    // save/restore : le style de cette branche ne déborde pas sur la suite du dessin
    ctx.save();
    // à la fin, seules la gagnante et la branche misée gardent leur éclat (le trait seulement : le nom reste lisible)
    ctx.globalAlpha = dim ? 0.3 : 1;
    ctx.strokeStyle = color;
    ctx.lineWidth = mine ? 3.5 : 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (b.shown > 0) trace(b, b.shown);
    ctx.fillStyle = color;
    for (const c of b.commits) {
      if (c > b.shown + 0.0001) break;
      const pt = map(c, lateral(b, c));
      ctx.fillRect(pt[0] - 2, pt[1] - 2, 4, 4);
    }
    const h = map(b.shown, lateral(b, b.shown));
    ctx.beginPath();
    ctx.arc(h[0], h[1], mine ? 6 : 5, 0, Math.PI * 2);
    ctx.fill();
    if (mine) {
      // anneau blanc cerné de sombre : il reste visible même sur une branche claire
      ctx.beginPath();
      ctx.arc(h[0], h[1], 10, 0, Math.PI * 2);
      ctx.strokeStyle = "#0d0d0d";
      ctx.lineWidth = 4.5;
      ctx.stroke();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
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
    ctx.globalAlpha = 1;
    label(b.name, h[0], h[1], dim ? "#8c8c8c" : color);
    ctx.restore();
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    // ligne d'arrivée, en haut
    const a = map(1, 0);
    ctx.strokeStyle = "#333333";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(8, a[1]);
    ctx.lineTo(W - 8, a[1]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#8c8c8c";
    ctx.font = "11px 'Courier New', monospace";
    ctx.textBaseline = "middle";
    ctx.fillText("main", 10, a[1] - 12);
    // point de départ, en bas
    const s = map(0, 0.5);
    for (let i = 0; i < st.branches.length; i++) if (i !== st.bet) drawBranch(i);
    if (st.bet >= 0) drawBranch(st.bet);
    ctx.fillStyle = "#e0e0e0";
    ctx.beginPath();
    ctx.arc(s[0], s[1], 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#8c8c8c";
    ctx.textAlign = "center";
    ctx.fillText("Initial Commit", s[0], s[1] + 16);
    ctx.textAlign = "start";
  }

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
      cardsEl.appendChild(card);
    });
  }

  function start(i) {
    if (st.phase !== "pick") return;
    st.bet = i;
    st.phase = "race";
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
    "Les branches partent toutes de l'Initial Commit. Choisis celle que tu penses voir arriver la première.",
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
      run: (sec) => {
        const n = Math.round(sec / FIXED_DT);
        for (let k = 0; k < n && st.phase === "race"; k++) step();
        draw();
      },
    };
  }
})();
