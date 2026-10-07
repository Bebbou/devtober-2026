(function () {
  "use strict";

  const $ = (s) => document.querySelector(s);

  // true si la personne préfère éviter les animations : plus de tremblement, d'éclats ni de clignotement, le jeu reste le même
  const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const KEY = "devtober-swarm-7";

  // pour essayer sans attendre, dans l'adresse : #temps=140 (départ à 2:20), #invincible, #perf (temps de calcul à l'écran)
  const q = new URLSearchParams(location.hash.slice(1));
  const dbg = { time: Number(q.get("temps")) || 0, god: q.has("invincible"), perf: q.has("perf") };
  const PINK = "#ff0055", LIGHT = "#e0e0e0", GREY = "#8c8c8c", DARK = "#5a5a5a", BG = "#0d0d0d";

  const ARENA_W = 2200, ARENA_H = 1500; // en pixels du monde
  const DURATION = 300; // une partie : 5 minutes
  const MAX_ENEMIES = 320, MAX_GEMS = 500;
  const DASH_TIME = 0.16, DASH_CD = 2.4;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rnd = (a, b) => a + Math.random() * (b - a);

  /* ---------- Le canevas ---------- */
  const cv = $("#cv");
  const g = cv.getContext("2d");
  let cssW = 0, cssH = 0, dpr = 1, zoom = 1;
  const fit = () => {
    const r = cv.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cssW = r.width;
    cssH = r.height;
    cv.width = Math.round(cssW * dpr);
    cv.height = Math.round(cssH * dpr);
    g.imageSmoothingEnabled = false; // les sprites restent des pixels nets
    // sur petit écran on voit moins de monde, mais pas moins de 0,9 fois sa taille
    zoom = clamp(Math.min(cssW, cssH) / 420, 0.9, 1.3);
  };

  /* ---------- Ce que la personne a enregistré ---------- */
  const best = { t: { easy: 0, normal: 0, hard: 0 }, wins: { easy: 0, normal: 0, hard: 0 }, kills: 0, level: 1, score: 0, games: 0, diff: "normal", sound: true };
  try {
    const saved = JSON.parse(localStorage.getItem(KEY)) || {};
    if (typeof saved.time === "number") saved.t = { normal: saved.time }; // ancien format
    if (typeof saved.wins === "number") delete saved.wins;
    Object.assign(best, saved, { t: Object.assign(best.t, saved.t), wins: Object.assign(best.wins, saved.wins) });
  } catch (e) { /* première partie */ }
  const saveBest = () => {
    try { localStorage.setItem(KEY, JSON.stringify(best)); } catch (e) { /* tant pis */ }
  };

  // trois niveaux de difficulté : vitesse d'arrivée, dégâts reçus, vie des ennemis
  const DIFFS = {
    easy: { name: "facile", spawn: 0.75, dmg: 0.7, hp: 0.85 },
    normal: { name: "normal", spawn: 1, dmg: 1, hp: 1 },
    hard: { name: "difficile", spawn: 1.3, dmg: 1.3, hp: 1.2 },
  };

  /* ---------- Le son : des bips synthétisés, rien à télécharger ---------- */
  let actx = null;
  const sfxAt = {};
  const tone = (name, f0, f1, dur, type, vol, gap) => {
    if (!best.sound || !actx) return;
    const now = actx.currentTime;
    if (gap && now - (sfxAt[name] || 0) < gap) return;
    sfxAt[name] = now;
    const o = actx.createOscillator(), a = actx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, now);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), now + dur);
    a.gain.setValueAtTime(vol, now);
    a.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    o.connect(a);
    a.connect(actx.destination);
    o.start(now);
    o.stop(now + dur + 0.02);
  };
  const SFX = {
    shoot: () => tone("shoot", 640, 320, 0.05, "square", 0.025, 0.07),
    hit: () => tone("hit", 220, 120, 0.04, "square", 0.03, 0.05),
    kill: () => tone("kill", 330, 110, 0.09, "square", 0.045, 0.04),
    gem: (n) => tone("gem", 700 + Math.min(n, 12) * 45, 900 + Math.min(n, 12) * 45, 0.04, "triangle", 0.04, 0.03),
    hurt: () => tone("hurt", 140, 60, 0.18, "sawtooth", 0.09),
    dash: () => tone("dash", 200, 700, 0.12, "triangle", 0.06),
    pick: () => tone("pick", 500, 1000, 0.15, "triangle", 0.07),
    boss: () => tone("boss", 90, 45, 0.6, "sawtooth", 0.1),
    wave: () => tone("wave", 160, 360, 0.2, "triangle", 0.05),
    bomb: () => tone("bomb", 120, 30, 0.35, "sawtooth", 0.1),
    level: () => { [520, 660, 880].forEach((f, i) => setTimeout(() => tone("lv" + i, f, f * 1.02, 0.12, "square", 0.05), i * 90)); },
    win: () => { [520, 660, 880, 1040].forEach((f, i) => setTimeout(() => tone("w" + i, f, f * 1.02, 0.18, "square", 0.06), i * 120)); },
    lose: () => { [330, 262, 196].forEach((f, i) => setTimeout(() => tone("l" + i, f, f * 0.9, 0.22, "square", 0.06), i * 150)); },
  };
  const soundOn = () => {
    if (!actx) {
      try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { actx = null; }
    }
    if (actx && actx.state === "suspended") actx.resume();
  };
  const syncSoundBtn = () => {
    const b = $("#sound");
    b.setAttribute("aria-pressed", best.sound ? "true" : "false");
    b.textContent = best.sound ? "son" : "muet";
  };

  /* ---------- Les images : du pixel art écrit en texte ---------- */
  // # corps, o fond, p rose, m gris, w clair. Chaque image existe en 2 poses, tournée ou non, normale ou en éclair blanc.
  const ART = {
    player: { pal: { "#": LIGHT, o: BG }, frames: [
      ["..#####..", ".#######.", "#########", "#########", "#########", "#########", ".#######.", "..#####..", ".##...##."],
      ["..#####..", ".#######.", "#########", "#########", "#########", "#########", ".#######.", "..#####..", "..##.##.."],
    ] },
    crawler: { pal: { "#": GREY, o: BG }, frames: [
      ["..#.#..", ".#####.", "#######", "##o#o##", ".#####.", ".#...#."],
      ["..#.#..", ".#####.", "#######", "##o#o##", ".#####.", "#.....#"],
    ] },
    brute: { pal: { "#": DARK, o: BG, m: GREY, p: PINK }, frames: [
      [".mmmmmmm.", "m#######m", "m#p###p#m", "m#######m", "m#ooooo#m", "m#######m", "m#######m", ".##...##.", "##.....##"],
      [".mmmmmmm.", "m#######m", "m#p###p#m", "m#######m", "m#ooooo#m", "m#######m", "m#######m", ".##...##.", ".#.....#."],
    ] },
    shooter: { pal: { "#": GREY, p: PINK }, frames: [
      ["...#...", "..###..", ".##p##.", "###p###", ".##p##.", "..###..", "...#..."],
      ["...#...", "..###..", ".#####.", "###p###", ".#####.", "..###..", "...#..."],
    ] },
    dasher: { pal: { "#": GREY, o: BG, p: PINK }, frames: [
      ["...#...", "..###..", ".#####.", "##o#o##", "#######", ".#...#.", "#.....#"],
      ["...#...", "..###..", ".#####.", "##o#o##", "#######", "..#.#..", ".#...#."],
    ] },
    splitter: { pal: { "#": LIGHT, o: BG, m: GREY }, frames: [
      [".mmmmmmm.", "m#######m", "m#o#o#o#m", "m#######m", "m#o#o#o#m", "m#######m", "m#######m", ".m#####m.", "..mmmmm.."],
      [".mmmmmmm.", "m#######m", "m#o#o#o#m", "m#######m", "m#o#o#o#m", "m#######m", ".m#####m.", ".m#####m.", "..mmmmm.."],
    ] },
    boss: { pal: { "#": "#1a1a1a", o: BG, p: PINK, m: DARK }, frames: [
      ["..ppppppppp..", ".p#########p.", "p###########p", "p#ooo###ooo#p", "p#opo###opo#p", "p#ooo###ooo#p", "p###########p", "p##o#o#o#o##p", ".p#########p.", ".p##.###.##p.", ".p##..#..##p.", "..p.......p..", "..p.......p.."],
      ["..ppppppppp..", ".p#########p.", "p###########p", "p#ooo###ooo#p", "p#opo###opo#p", "p#ooo###ooo#p", "p###########p", "p##o#o#o#o##p", ".p#########p.", ".p##.###.##p.", ".p#..###..#p.", "..p.......p..", "..p.......p.."],
    ] },
    heart: { pal: { "#": PINK }, frames: [[".#.#.", "#####", "#####", ".###.", "..#.."]] },
    magnet: { pal: { "#": LIGHT, p: PINK, o: BG }, frames: [["#.....#", "#.....#", "#.....#", "#.....#", "##...##", ".#####.", "..ppp.."]] },
    bomb: { pal: { "#": GREY, p: PINK, o: BG }, frames: [["....p..", "...p...", ".#####.", "#######", "#######", "#######", ".#####."]] },
  };
  const spriteCache = {};
  const sprite = (name, frame, flip, hit) => {
    const key = name + "|" + frame + "|" + (flip ? 1 : 0) + "|" + (hit ? 1 : 0);
    let c = spriteCache[key];
    if (c) return c;
    const a = ART[name], rows = a.frames[frame % a.frames.length];
    c = document.createElement("canvas");
    c.width = rows[0].length;
    c.height = rows.length;
    const x = c.getContext("2d");
    for (let r = 0; r < rows.length; r++) {
      for (let k = 0; k < rows[r].length; k++) {
        const ch = rows[r][flip ? rows[r].length - 1 - k : k];
        if (ch === ".") continue;
        x.fillStyle = hit ? (ch === "o" ? BG : LIGHT) : (a.pal[ch] || LIGHT);
        x.fillRect(k, r, 1, 1);
      }
    }
    spriteCache[key] = c;
    return c;
  };
  // pose une image centrée en (x, y), chaque pixel du dessin valant `s` pixels du monde
  const blit = (name, x, y, s, frame, flip, hit, alpha) => {
    const c = sprite(name, frame, flip, hit);
    if (alpha !== undefined && alpha < 1) g.globalAlpha = alpha;
    g.drawImage(c, Math.round(x - (c.width * s) / 2), Math.round(y - (c.height * s) / 2), c.width * s, c.height * s);
    if (alpha !== undefined && alpha < 1) g.globalAlpha = 1;
  };

  /* ---------- Les améliorations ---------- */
  // une fiche = un nom, une description du prochain niveau, un effet
  const UPGRADES = [
    { id: "rate", name: "Cadence", max: 6, desc: () => "tire 15 % plus vite", apply: () => (st.cd *= 0.85) },
    { id: "dmg", name: "Dégâts", max: 6, desc: () => "+1 dégât par tir", apply: () => (st.dmg += 1) },
    { id: "multi", name: "Salve", max: 4, desc: () => "+1 projectile", apply: () => (st.count += 1) },
    { id: "pierce", name: "Perforant", max: 4, desc: () => "le tir traverse +1 ennemi", apply: () => (st.pierce += 1) },
    { id: "range", name: "Portée", max: 4, desc: () => "+15 % de portée", apply: () => (st.range *= 1.15) },
    { id: "speed", name: "Vitesse", max: 5, desc: () => "+8 % de vitesse", apply: () => (st.speed *= 1.08) },
    { id: "magnet", name: "Aimant", max: 4, desc: () => "ramasse de plus loin", apply: () => (st.magnet += 45) },
    { id: "orb", name: "Lames", max: 5, desc: () => "+1 lame qui tourne autour de toi", apply: () => (st.orbs += 1) },
    { id: "heart", name: "Cœur", max: 5, desc: () => "+20 PV max et soigne 20", apply: () => { st.maxHp += 20; P.hp = Math.min(st.maxHp, P.hp + 20); } },
    { id: "crit", name: "Critique", max: 5, desc: () => "+10 % de chances de tir double", apply: () => (st.crit += 0.1) },
    { id: "wave", name: "Onde", max: 4, desc: () => "une onde repousse et blesse autour de toi", apply: () => (st.wave += 1) },
  ];
  const HEAL = { id: "heal", name: "Soin", max: 99, desc: () => "rend 40 PV", apply: () => (P.hp = Math.min(st.maxHp, P.hp + 40)) };

  /* ---------- Les ennemis ---------- */
  // r : rayon, s : taille d'un pixel du dessin, hp : vie de départ, sp : vitesse, dmg : contact, xp : cristaux lâchés
  const TYPES = {
    crawler: { r: 7, s: 2, hp: 2, sp: 66, dmg: 6, xp: 1 },
    brute: { r: 10, s: 2, hp: 10, sp: 42, dmg: 15, xp: 4 },
    shooter: { r: 8, s: 2, hp: 4, sp: 56, dmg: 6, xp: 3 },
    dasher: { r: 8, s: 2, hp: 5, sp: 60, dmg: 12, xp: 3 },
    splitter: { r: 10, s: 2, hp: 7, sp: 48, dmg: 10, xp: 3 },
    boss: { r: 25, s: 4, hp: 220, sp: 38, dmg: 25, xp: 30 },
  };

  /* ---------- L'état d'une partie ---------- */
  let P, st, lv, enemies, bullets, ebullets, gems, drops, parts, texts, waves, ghosts;
  let freeze = 0; // pause d'image à la mort du boss
  let t, kills, level, xp, need, spawnAcc, nextWave, bossAt, cam, joy, orbAngle, pending, mode, fireCd, waveCd, combo, comboT, shake, score, dm;
  const keys = {};
  mode = "menu"; // menu, play, levelup, pause, over, win
  const cells = [];
  const CELL = 48;
  const COLS = Math.ceil(ARENA_W / CELL) + 1, ROWS = Math.ceil(ARENA_H / CELL) + 1;
  for (let i = 0; i < COLS * ROWS; i++) cells.push([]);

  // la série de tués multiplie le score : x2 à 10, x3 à 20, jusqu'à x5
  const comboMult = () => 1 + Math.min(4, Math.floor(combo / 10));
  const liveScore = () => score + Math.floor(t) * 5 + level * 50;

  const reset = () => {
    P = { x: ARENA_W / 2, y: ARENA_H / 2, r: 9, hp: 100, inv: 0, flash: 0, aim: 0, dash: 0, dashCd: 0, dx: 1, dy: 0, face: 1, walk: 0 };
    st = { cd: 0.5, dmg: 2, count: 1, pierce: 0, range: 440, speed: 170, magnet: 60, maxHp: 100, orbs: 0, crit: 0, wave: 0 };
    lv = {};
    enemies = []; bullets = []; ebullets = []; gems = []; drops = []; parts = []; texts = []; waves = []; ghosts = [];
    t = 0; kills = 0; level = 1; xp = 0; need = 8; spawnAcc = 0; nextWave = 30;
    bossAt = [150, 255];
    cam = { x: P.x, y: P.y };
    joy = null; orbAngle = 0; pending = 0; fireCd = 0; waveCd = 3; combo = 0; comboT = 0; shake = 0; score = 0;
    dm = DIFFS[best.diff] || DIFFS.normal;
  };
  reset();

  let seedN = 0;
  const spawn = (type, x, y, instant) => {
    const d = TYPES[type];
    const m = (1 + t / 200) * dm.hp; // la vie des ennemis monte avec le temps
    const hp = d.hp * (type === "boss" ? (1 + t / 150) * dm.hp : m);
    enemies.push({
      type, x, y, r: d.r, hp, max: hp, sp: d.sp * (type === "crawler" ? 1 + Math.min(t / 500, 0.6) : 1), dmg: d.dmg * dm.dmg, xp: d.xp,
      fire: rnd(0.5, 2), hit: 0, orbCd: 0, kx: 0, ky: 0, age: instant ? 1 : 0, seed: seedN++ % 7, st: 0, stT: rnd(0.5, 1.5), dirx: 0, diry: 0,
    });
  };

  // un point juste en dehors de l'écran, sur un des quatre bords, et dans l'arène
  const edgePoint = (extra) => {
    const hw = cssW / zoom / 2 + extra, hh = cssH / zoom / 2 + extra;
    for (let k = 0; k < 8; k++) {
      const side = Math.floor(Math.random() * 4);
      const x = side === 0 ? P.x - hw : side === 1 ? P.x + hw : P.x + rnd(-hw, hw);
      const y = side === 2 ? P.y - hh : side === 3 ? P.y + hh : P.y + rnd(-hh, hh);
      if (x > 20 && x < ARENA_W - 20 && y > 20 && y < ARENA_H - 20) return [x, y];
    }
    return [clamp(P.x + (Math.random() < 0.5 ? -hw : hw), 20, ARENA_W - 20), clamp(P.y + rnd(-hh, hh), 20, ARENA_H - 20)];
  };

  /* ---------- Écrans ---------- */
  const panel = $("#panel"), pTitle = $("#pTitle"), pBody = $("#pBody");
  const live = (txt) => { $("#live").textContent = txt; };
  const fmt = (s) => Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0");

  const el = (tag, cls, txt) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt !== undefined) e.textContent = txt;
    return e;
  };
  const button = (label, fn, go) => {
    const b = el("button", "btn" + (go ? " go" : ""), label);
    b.type = "button";
    b.addEventListener("click", fn);
    return b;
  };
  const show = (title, build, clear) => {
    pTitle.textContent = title;
    pBody.textContent = "";
    pBody._picks = null;
    panel.classList.toggle("clear", !!clear);
    build(pBody);
    panel.hidden = false;
    const first = pBody.querySelector("button");
    if (first) first.focus({ preventScroll: true });
  };
  const hidePanel = () => { panel.hidden = true; };

  const statsList = (rows) => {
    const dl = el("dl", "stats");
    rows.forEach((r) => { dl.appendChild(el("dt", "", r[0])); dl.appendChild(el("dd", "", r[1])); });
    return dl;
  };

  // le fond du menu : des ennemis qui dérivent, sans personne à poursuivre
  const attractMode = () => {
    reset();
    for (let i = 0; i < 46; i++) {
      const type = i % 11 === 0 ? "brute" : i % 7 === 0 ? "shooter" : i % 13 === 0 ? "splitter" : "crawler";
      spawn(type, P.x + rnd(-420, 420), P.y + rnd(-260, 260), true);
      const e = enemies[enemies.length - 1];
      e.dirx = rnd(-30, 30);
      e.diry = rnd(-22, 22);
    }
  };

  const showMenu = () => {
    mode = "menu";
    attractMode();
    document.body.classList.remove("playing");
    $("#pause").hidden = true;
    $("#dashBtn").hidden = true;
    $("#bars").hidden = true;
    $("#bossBar").hidden = true;
    $("#chips").textContent = "";
    show("swarm", (b) => {
      b.appendChild(el("p", "big", "Tiens 5 minutes."));
      b.appendChild(el("p", "", "Tu te déplaces, ça tire tout seul. Chaque ennemi tué lâche un cristal : à chaque niveau, tu choisis une amélioration."));
      const row0 = el("div", "row diff");
      row0.setAttribute("role", "group");
      row0.setAttribute("aria-label", "Difficulté");
      Object.keys(DIFFS).forEach((k) => {
        const d = button(DIFFS[k].name, () => { best.diff = k; saveBest(); showMenu(); });
        d.setAttribute("aria-pressed", best.diff === k ? "true" : "false");
        row0.appendChild(d);
      });
      b.appendChild(row0);
      if (best.games) b.appendChild(statsList([["meilleur temps", fmt(best.t[best.diff] || 0)], ["victoires", String(best.wins[best.diff] || 0)], ["meilleur score", String(best.score)]]));
      const row = el("div", "row");
      row.appendChild(button("jouer", start, true));
      row.appendChild(button("comment jouer", () => showHow()));
      b.appendChild(row);
      b.appendChild(el("p", "small", "ZQSD ou flèches · Espace : dash · P : pause · au doigt : glisse n'importe où"));
      // le pied de page est caché sur téléphone : les crédits sont ici
      const cr = el("p", "small", "Conçu par ");
      [["Lino Volle", "https://github.com/Bebbou"], ["doc", "../docs/07-swarm.html"], ["code", "https://github.com/Bebbou/devtober-2026/tree/main/07-Swarm"]].forEach((l, i) => {
        const a = el("a", "", l[0]);
        a.href = l[1];
        if (i) cr.appendChild(document.createTextNode(" · "));
        cr.appendChild(a);
      });
      b.appendChild(cr);
    }, true);
  };

  // les règles tiennent sur un seul écran
  const HOW = [
    ["Bouger", "ZQSD, WASD ou les flèches. Au doigt ou à la souris : glisse n'importe où, un joystick apparaît."],
    ["Tirer", "Automatique, sur l'ennemi le plus proche."],
    ["Dash", "Espace, ou le bouton rond sur téléphone. Il te protège un instant, il revient en 2,4 s."],
    ["Grandir", "Les cristaux blancs remplissent la barre rose : à chaque niveau, une amélioration parmi trois."],
    ["Danger", "Tout ce qui est rose te blesse : tirs ennemis, ligne de charge. Tes tirs sont blancs."],
    ["Tenir", "5 minutes. Deux boss arrivent à 2:30 et 4:15. P : pause."],
  ];
  // back : où revenir après « compris » (le menu, ou la pause quand on était en partie)
  const showHow = (back) => {
    show("comment jouer", (b) => {
      const dl = el("dl", "how");
      HOW.forEach((r) => { dl.appendChild(el("dt", "", r[0])); dl.appendChild(el("dd", "", r[1])); });
      b.appendChild(dl);
      b.appendChild(button("compris", () => {
        try { localStorage.setItem(KEY + "-vu", "1"); } catch (e) { /* on s'en passe */ }
        if (back) back(); else showMenu();
      }, true));
    }, true);
  };

  const showLevelUp = () => {
    mode = "levelup";
    const pool = UPGRADES.filter((u) => (lv[u.id] || 0) < u.max);
    const picks = [];
    while (picks.length < 3 && pool.length) picks.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    while (picks.length < 3) picks.push(HEAL);
    live("Niveau " + level + " : choisis une amélioration");
    SFX.level();
    show("niveau " + level, (b) => {
      const cards = el("div", "cards");
      picks.forEach((u, i) => {
        const c = el("button", "card");
        c.type = "button";
        const l = lv[u.id] || 0;
        const tag = el("span", "lv", u.id === "heal" ? "" : "niv " + (l + 1) + " / " + u.max);
        const name = el("b", "");
        name.appendChild(el("kbd", "", String(i + 1)));
        name.appendChild(document.createTextNode(u.name));
        c.appendChild(tag);
        c.appendChild(name);
        c.appendChild(el("span", "", u.desc()));
        c.addEventListener("click", () => choose(u));
        cards.appendChild(c);
      });
      b.appendChild(cards);
    });
    pBody._picks = picks;
  };
  const choose = (u) => {
    if (mode !== "levelup") return;
    u.apply();
    lv[u.id] = (lv[u.id] || 0) + 1;
    drawChips();
    if (pending > 0) { pending--; levelUpNext(); return; }
    hidePanel();
    mode = "play";
    last = performance.now();
  };
  const levelUpNext = () => {
    level++;
    need = Math.round(need * 1.28 + 3);
    P.hp = Math.min(st.maxHp, P.hp + 12); // un niveau soigne un peu
    showLevelUp();
  };

  // les améliorations prises, en petites pastilles sous les jauges
  const drawChips = () => {
    const box = $("#chips");
    box.textContent = "";
    UPGRADES.forEach((u) => { if (lv[u.id]) box.appendChild(el("span", "", u.name + " " + lv[u.id])); });
  };

  const showPause = () => {
    if (mode !== "play") return;
    mode = "pause";
    show("pause", (b) => {
      b.appendChild(statsList([["temps", fmt(t)], ["niveau", String(level)], ["ennemis tués", String(kills)]]));
      const row = el("div", "row");
      row.appendChild(button("reprendre", resume, true));
      row.appendChild(button("abandonner", () => end(false, true)));
      b.appendChild(row);
    });
  };
  const resume = () => {
    if (mode !== "pause") return;
    hidePanel();
    mode = "play";
    last = performance.now();
  };

  const end = (won, giveUp) => {
    mode = won ? "win" : "over";
    score = liveScore() + (won ? 1000 : 0);
    best.games++;
    if (won) best.wins[best.diff] = (best.wins[best.diff] || 0) + 1;
    const record = t > (best.t[best.diff] || 0);
    if (record) best.t[best.diff] = t;
    const recScore = score > best.score;
    if (recScore) best.score = score;
    best.kills = Math.max(best.kills, kills);
    best.level = Math.max(best.level, level);
    saveBest();
    $("#pause").hidden = true;
    $("#dashBtn").hidden = true;
    $("#bossBar").hidden = true;
    $("#play").classList.remove("low");
    live(won ? "Tu as tenu 5 minutes" : "Perdu");
    if (won) SFX.win(); else if (!giveUp) SFX.lose();
    show(won ? "tenu" : giveUp ? "abandon" : "perdu", (b) => {
      b.appendChild(el("p", "big", won ? "Cinq minutes, tenues." : "Tu as tenu " + fmt(t) + "."));
      b.appendChild(statsList([
        ["score", score + (recScore ? " (record)" : "")],
        ["ennemis tués", String(kills)],
        ["niveau atteint", String(level)],
        ["meilleur temps (" + dm.name + ")", fmt(best.t[best.diff]) + (record && !won ? " (nouveau)" : "")],
      ]));
      const row = el("div", "row");
      row.appendChild(button("rejouer", start, true));
      row.appendChild(button("menu", showMenu));
      b.appendChild(row);
    });
  };

  /* ---------- Entrées ---------- */
  const KEYMAP = { KeyW: "u", KeyZ: "u", ArrowUp: "u", KeyS: "d", ArrowDown: "d", KeyA: "l", KeyQ: "l", ArrowLeft: "l", KeyD: "r", ArrowRight: "r" };
  window.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (KEYMAP[e.code]) { keys[KEYMAP[e.code]] = true; if (mode === "play") e.preventDefault(); }
    if (e.code === "Space" && mode === "play") { e.preventDefault(); dash(); }
    if (e.code === "KeyP" || e.code === "Escape") {
      if (mode === "play") showPause();
      else if (mode === "pause") resume();
    }
    if (mode === "levelup" && /^[1-3]$/.test(e.key) && pBody._picks && pBody._picks[+e.key - 1]) choose(pBody._picks[+e.key - 1]);
  });
  window.addEventListener("keyup", (e) => { if (KEYMAP[e.code]) keys[KEYMAP[e.code]] = false; });
  window.addEventListener("blur", () => { Object.keys(keys).forEach((k) => (keys[k] = false)); if (mode === "play") showPause(); });
  document.addEventListener("visibilitychange", () => { if (document.hidden && mode === "play") showPause(); });

  // le joystick : il apparaît là où le doigt (ou la souris) se pose
  cv.addEventListener("pointerdown", (e) => {
    if (mode !== "play" || joy) return;
    try { cv.setPointerCapture(e.pointerId); } catch (err) { /* identifiant inconnu */ }
    const r = cv.getBoundingClientRect();
    joy = { id: e.pointerId, ox: e.clientX - r.left, oy: e.clientY - r.top, x: e.clientX - r.left, y: e.clientY - r.top };
  });
  cv.addEventListener("pointermove", (e) => {
    if (!joy || e.pointerId !== joy.id) return;
    const r = cv.getBoundingClientRect();
    joy.x = e.clientX - r.left;
    joy.y = e.clientY - r.top;
  });
  const joyEnd = (e) => { if (joy && e.pointerId === joy.id) joy = null; };
  cv.addEventListener("pointerup", joyEnd);
  cv.addEventListener("pointercancel", joyEnd);

  const input = () => {
    let x = (keys.r ? 1 : 0) - (keys.l ? 1 : 0), y = (keys.d ? 1 : 0) - (keys.u ? 1 : 0);
    if (joy) {
      const dx = joy.x - joy.ox, dy = joy.y - joy.oy, d = Math.hypot(dx, dy);
      if (d > 6) { x = dx / Math.max(d, 56); y = dy / Math.max(d, 56); }
    }
    const m = Math.hypot(x, y);
    return m > 1 ? [x / m, y / m] : [x, y];
  };

  // la glissade : brève, rapide, protégée
  const dash = () => {
    if (mode !== "play" || P.dashCd > 0) return;
    const [ix, iy] = input();
    const m = Math.hypot(ix, iy);
    if (m > 0.1) { P.dx = ix / m; P.dy = iy / m; }
    P.dash = DASH_TIME;
    P.dashCd = DASH_CD;
    P.inv = Math.max(P.inv, DASH_TIME + 0.12);
    SFX.dash();
  };

  /* ---------- Une partie ---------- */
  let last = 0, raf = 0;
  const start = () => {
    soundOn();
    reset();
    freeze = 0;
    if (dbg.time) {
      t = dbg.time;
      bossAt = bossAt.filter((b) => b > t);
      nextWave = (Math.floor(t / 30) + 1) * 30;
    }
    hud.hp = hud.xp = hud.dash = hud.boss = -1; // les jauges se redessinent
    $("#play").classList.remove("low");
    hidePanel();
    drawChips();
    document.body.classList.add("playing");
    $("#bars").hidden = false;
    $("#pause").hidden = false;
    $("#dashBtn").hidden = false;
    mode = "play";
    last = performance.now();
    live("C'est parti");
    if (!raf) raf = requestAnimationFrame(frame);
  };

  const banner = (txt) => {
    const b = $("#banner");
    b.textContent = txt;
    b.hidden = false;
    live(txt);
    setTimeout(() => { b.hidden = true; }, 2600);
  };

  const burst = (x, y, n, color, speed) => {
    if (calm) return;
    for (let i = 0; i < n && parts.length < 200; i++) {
      const a = Math.random() * 6.28, s = rnd(40, speed || 140);
      parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rnd(0.25, 0.45), max: 0.45, color, size: Math.random() < 0.3 ? 5 : 3 });
    }
  };
  const floatText = (x, y, txt, color, size) => {
    if (texts.length > 40) texts.shift();
    texts.push({ x, y, txt, color, size, life: 0.6 });
  };

  const dropGem = (x, y, v) => {
    if (gems.length >= MAX_GEMS) { gainXp(v); return; }
    gems.push({ x: x + rnd(-6, 6), y: y + rnd(-6, 6), v, pull: false });
  };
  const gainXp = (v) => {
    xp += v;
    while (xp >= need) { xp -= need; if (mode === "levelup") pending++; else levelUpNext(); }
  };

  const kill = (i) => {
    const e = enemies[i];
    kills++;
    combo++;
    comboT = 2.5;
    score += 10 * comboMult();
    SFX.kill();
    burst(e.x, e.y, e.type === "boss" ? 40 : 6, e.type === "boss" ? PINK : GREY, e.type === "boss" ? 300 : 140);
    if (e.type === "boss") {
      for (let k = 0; k < 8; k++) dropGem(e.x, e.y, 4);
      drops.push({ type: "heart", x: e.x, y: e.y, life: 20 });
      shake = Math.max(shake, 12);
      freeze = calm ? 0 : 0.45;
      banner("boss vaincu");
      SFX.win();
    } else {
      dropGem(e.x, e.y, e.xp);
      const r = Math.random();
      if (r < 0.03) drops.push({ type: "heart", x: e.x, y: e.y, life: 14 });
      else if (r < 0.045) drops.push({ type: "magnet", x: e.x, y: e.y, life: 14 });
      else if (r < 0.055) drops.push({ type: "bomb", x: e.x, y: e.y, life: 14 });
    }
    if (e.type === "splitter") for (let k = 0; k < 3; k++) { spawn("crawler", e.x + rnd(-12, 12), e.y + rnd(-12, 12), true); enemies[enemies.length - 1].age = 0.1; }
    enemies[i] = enemies[enemies.length - 1];
    enemies.pop();
  };

  const hurt = (dmg) => {
    if (P.inv > 0 || dbg.god) return;
    P.hp -= dmg;
    P.inv = 0.8;
    P.flash = 0.2;
    shake = Math.max(shake, 6);
    SFX.hurt();
    floatText(P.x, P.y - 14, "-" + Math.round(dmg), PINK, 14);
    if (P.hp <= 0) { P.hp = 0; end(false); }
  };

  const damage = (e, d, crit, kx, ky) => {
    e.hp -= d;
    e.hit = 0.06;
    e.kx += kx;
    e.ky += ky;
    floatText(e.x + rnd(-4, 4), e.y - e.r - 4, String(Math.round(d)), crit ? PINK : LIGHT, crit ? 14 : 11);
    SFX.hit();
  };

  const pickup = (d) => {
    SFX.pick();
    if (d.type === "heart") { P.hp = Math.min(st.maxHp, P.hp + 25); floatText(P.x, P.y - 16, "+25", PINK, 14); }
    else if (d.type === "magnet") { gems.forEach((q) => (q.pull = true)); floatText(P.x, P.y - 16, "aimant", LIGHT, 12); }
    else {
      SFX.bomb();
      shake = Math.max(shake, 10);
      waves.push({ x: P.x, y: P.y, r: 0, max: 320, life: 0.4, t: 0.4 });
      enemies.forEach((e) => { if (Math.hypot(e.x - P.x, e.y - P.y) < 320) damage(e, e.type === "boss" ? 30 : 12, false, 0, 0); });
    }
  };

  const update = (dt) => {
    t += dt;
    if (t >= DURATION) {
      enemies.forEach((e) => burst(e.x, e.y, 2, GREY));
      end(true);
      return;
    }

    // la personne bouge, ou glisse
    const [ix, iy] = input();
    if (Math.hypot(ix, iy) > 0.1) { P.dx = ix; P.dy = iy; if (Math.abs(ix) > 0.2) P.face = ix > 0 ? 1 : -1; P.walk += dt; }
    if (P.dash > 0) {
      const dl = Math.hypot(P.dx, P.dy) || 1;
      P.x = clamp(P.x + (P.dx / dl) * 620 * dt, P.r, ARENA_W - P.r);
      P.y = clamp(P.y + (P.dy / dl) * 620 * dt, P.r, ARENA_H - P.r);
      P.dash -= dt;
      if (!calm) ghosts.push({ x: P.x, y: P.y, life: 0.2, face: P.face });
    } else {
      P.x = clamp(P.x + ix * st.speed * dt, P.r, ARENA_W - P.r);
      P.y = clamp(P.y + iy * st.speed * dt, P.r, ARENA_H - P.r);
    }
    P.dashCd = Math.max(0, P.dashCd - dt);
    P.inv = Math.max(0, P.inv - dt);
    P.flash = Math.max(0, P.flash - dt);
    comboT -= dt;
    if (comboT <= 0) combo = 0;
    shake = Math.max(0, shake - 40 * dt);

    // les ennemis arrivent : plus vite à mesure que le temps passe, et de nouvelles sortes au fil des minutes
    spawnAcc += (1.4 + t * 0.04) * dm.spawn * dt;
    while (spawnAcc >= 1) {
      spawnAcc -= 1;
      if (enemies.length >= MAX_ENEMIES) continue;
      const r = Math.random();
      const pBrute = t > 35 ? Math.min(0.12 + (t - 35) / 900, 0.26) : 0;
      const pShoot = t > 70 ? Math.min(0.08 + (t - 70) / 1500, 0.16) : 0;
      const pDash = t > 100 ? Math.min(0.06 + (t - 100) / 1600, 0.14) : 0;
      const pSplit = t > 150 ? Math.min(0.05 + (t - 150) / 1800, 0.12) : 0;
      let type = "crawler", c = pBrute;
      if (r < c) type = "brute";
      else if (r < (c += pShoot)) type = "shooter";
      else if (r < (c += pDash)) type = "dasher";
      else if (r < (c += pSplit)) type = "splitter";
      const [x, y] = edgePoint(40);
      spawn(type, x, y);
    }
    if (t >= nextWave) {
      nextWave += 30;
      const n = Math.min(14 + Math.floor(t / 10), 40);
      for (let i = 0; i < n && enemies.length < MAX_ENEMIES; i++) {
        const [x, y] = edgePoint(30 + (i % 3) * 14);
        spawn("crawler", x, y);
      }
      banner("vague");
    }
    if (bossAt.length && t >= bossAt[0]) {
      bossAt.shift();
      const [x, y] = edgePoint(80);
      spawn("boss", x, y);
      banner("boss");
      SFX.boss();
      shake = Math.max(shake, 8);
    }

    // la grille : retrouver les voisins sans comparer tout le monde
    for (let i = 0; i < cells.length; i++) cells[i].length = 0;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      const cx = clamp((e.x / CELL) | 0, 0, COLS - 1), cy = clamp((e.y / CELL) | 0, 0, ROWS - 1);
      cells[cy * COLS + cx].push(i);
    }

    // les ennemis avancent, se repoussent, touchent
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      e.age += dt;
      const dx = P.x - e.x, dy = P.y - e.y, d = Math.hypot(dx, dy) || 1;
      let mx = dx / d, my = dy / d, sp = e.sp;
      if (e.type === "shooter") {
        if (d < 240) { mx = -mx; my = -my; } else if (d < 300) sp = 0;
        e.fire -= dt;
        if (e.fire <= 0 && d < 520 && e.age > 0.3) {
          e.fire = 2.2;
          ebullets.push({ x: e.x, y: e.y, vx: (dx / d) * 210, vy: (dy / d) * 210, life: 4, dmg: 10 * dm.dmg });
        }
      } else if (e.type === "dasher") {
        // il avance, vise (ligne rose), puis fonce tout droit et se repose
        e.stT -= dt;
        if (e.st === 0) {
          if (d < 300 && e.stT <= 0) { e.st = 1; e.stT = 0.6; e.dirx = dx / d; e.diry = dy / d; }
        } else if (e.st === 1) { sp = 0; if (e.stT <= 0) { e.st = 2; e.stT = 0.45; } }
        else if (e.st === 2) { mx = e.dirx; my = e.diry; sp = 400; if (e.stT <= 0) { e.st = 3; e.stT = 1.2; } }
        else { sp = 0; if (e.stT <= 0) { e.st = 0; e.stT = rnd(0.5, 1.5); } }
      } else if (e.type === "boss") {
        e.fire -= dt;
        if (e.fire <= 0) {
          e.fire = 3;
          for (let k = 0; k < 12; k++) {
            const a = (k / 12) * 6.283 + t;
            ebullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * 170, vy: Math.sin(a) * 170, life: 4, dmg: 10 * dm.dmg });
          }
        }
      }
      if (mode === "menu") { mx = 0; my = 0; sp = 0; }
      let px = 0, py = 0;
      const cx = clamp((e.x / CELL) | 0, 0, COLS - 1), cy = clamp((e.y / CELL) | 0, 0, ROWS - 1);
      for (let yy = Math.max(0, cy - 1); yy <= Math.min(ROWS - 1, cy + 1); yy++) {
        for (let xx = Math.max(0, cx - 1); xx <= Math.min(COLS - 1, cx + 1); xx++) {
          const c = cells[yy * COLS + xx];
          for (let k = 0; k < c.length; k++) {
            const o = enemies[c[k]];
            if (o === e) continue;
            const ox = e.x - o.x, oy = e.y - o.y, min = e.r + o.r, dd = ox * ox + oy * oy;
            if (dd < min * min && dd > 0.01) { const s = Math.sqrt(dd); px += (ox / s) * (min - s); py += (oy / s) * (min - s); }
          }
        }
      }
      e.x = clamp(e.x + mx * sp * dt + px * 10 * dt + e.kx * dt, e.r, ARENA_W - e.r);
      e.y = clamp(e.y + my * sp * dt + py * 10 * dt + e.ky * dt, e.r, ARENA_H - e.r);
      e.kx *= Math.max(0, 1 - 9 * dt);
      e.ky *= Math.max(0, 1 - 9 * dt);
      e.hit = Math.max(0, e.hit - dt);
      e.orbCd = Math.max(0, e.orbCd - dt);
      if (d < e.r + P.r && e.age > 0.25) hurt(e.dmg);
    }
    if (mode !== "play") return;

    // l'onde : un coup qui repousse tout autour
    if (st.wave > 0) {
      waveCd -= dt;
      if (waveCd <= 0) {
        waveCd = 5.5 - 0.3 * st.wave;
        const R = 60 + 22 * st.wave;
        SFX.wave();
        waves.push({ x: P.x, y: P.y, r: 0, max: R, life: 0.35, t: 0.35 });
        enemies.forEach((e) => {
          const dx = e.x - P.x, dy = e.y - P.y, d = Math.hypot(dx, dy) || 1;
          if (d < R + e.r) damage(e, 3 + st.wave * 1.5, false, (dx / d) * (e.type === "boss" ? 120 : 420), (dy / d) * (e.type === "boss" ? 120 : 420));
        });
      }
    }

    // tir automatique sur l'ennemi le plus proche
    fireCd -= dt;
    if (fireCd <= 0 && enemies.length) {
      let near = null, nd = st.range * st.range;
      for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i], dx = e.x - P.x, dy = e.y - P.y, dd = dx * dx + dy * dy;
        if (dd < nd) { nd = dd; near = e; }
      }
      if (near) {
        fireCd = st.cd;
        const base = Math.atan2(near.y - P.y, near.x - P.x);
        P.aim = base;
        SFX.shoot();
        for (let k = 0; k < st.count; k++) {
          const a = base + (k - (st.count - 1) / 2) * 0.2;
          bullets.push({ x: P.x, y: P.y, vx: Math.cos(a) * 520, vy: Math.sin(a) * 520, life: st.range / 520, pierce: st.pierce, hit: [] });
        }
      }
    }

    // les tirs touchent
    for (let b = bullets.length - 1; b >= 0; b--) {
      const bl = bullets[b];
      bl.x += bl.vx * dt;
      bl.y += bl.vy * dt;
      bl.life -= dt;
      let gone = bl.life <= 0 || bl.x < 0 || bl.y < 0 || bl.x > ARENA_W || bl.y > ARENA_H;
      if (!gone) {
        const cx = clamp((bl.x / CELL) | 0, 0, COLS - 1), cy = clamp((bl.y / CELL) | 0, 0, ROWS - 1);
        for (let yy = Math.max(0, cy - 1); yy <= Math.min(ROWS - 1, cy + 1) && !gone; yy++) {
          for (let xx = Math.max(0, cx - 1); xx <= Math.min(COLS - 1, cx + 1) && !gone; xx++) {
            const c = cells[yy * COLS + xx];
            for (let k = 0; k < c.length; k++) {
              const e = enemies[c[k]];
              if (!e || e.hp <= 0 || bl.hit.indexOf(e) >= 0) continue;
              const dx = e.x - bl.x, dy = e.y - bl.y;
              if (dx * dx + dy * dy < (e.r + 3) * (e.r + 3)) {
                const crit = Math.random() < st.crit;
                const kb = e.type === "boss" ? 15 : 90;
                damage(e, st.dmg * (crit ? 2 : 1), crit, (bl.vx / 520) * kb, (bl.vy / 520) * kb);
                bl.hit.push(e);
                if (bl.pierce > 0) bl.pierce--; else { gone = true; break; }
              }
            }
          }
        }
      }
      if (gone) { bullets[b] = bullets[bullets.length - 1]; bullets.pop(); }
    }

    // les lames en orbite
    orbAngle += dt * 3.2;
    for (let o = 0; o < st.orbs; o++) {
      const a = orbAngle + (o / st.orbs) * 6.283;
      const ox = P.x + Math.cos(a) * 52, oy = P.y + Math.sin(a) * 52;
      const cx = clamp((ox / CELL) | 0, 0, COLS - 1), cy = clamp((oy / CELL) | 0, 0, ROWS - 1);
      for (let yy = Math.max(0, cy - 1); yy <= Math.min(ROWS - 1, cy + 1); yy++) {
        for (let xx = Math.max(0, cx - 1); xx <= Math.min(COLS - 1, cx + 1); xx++) {
          const c = cells[yy * COLS + xx];
          for (let k = 0; k < c.length; k++) {
            const e = enemies[c[k]];
            if (!e || e.orbCd > 0) continue;
            const dx = e.x - ox, dy = e.y - oy;
            if (dx * dx + dy * dy < (e.r + 6) * (e.r + 6)) { damage(e, Math.max(1, st.dmg * 0.6), false, (dx / (Math.hypot(dx, dy) || 1)) * 120, (dy / (Math.hypot(dx, dy) || 1)) * 120); e.orbCd = 0.3; }
          }
        }
      }
    }

    // les ennemis morts
    for (let i = enemies.length - 1; i >= 0; i--) if (enemies[i].hp <= 0) kill(i);

    // les projectiles ennemis
    for (let b = ebullets.length - 1; b >= 0; b--) {
      const bl = ebullets[b];
      bl.x += bl.vx * dt;
      bl.y += bl.vy * dt;
      bl.life -= dt;
      let gone = bl.life <= 0 || bl.x < 0 || bl.y < 0 || bl.x > ARENA_W || bl.y > ARENA_H;
      if (!gone && Math.hypot(bl.x - P.x, bl.y - P.y) < P.r + 4) { hurt(bl.dmg); gone = true; }
      if (gone) { ebullets[b] = ebullets[ebullets.length - 1]; ebullets.pop(); }
    }
    if (mode !== "play") return;

    // les cristaux : l'aimant les tire vers toi
    for (let i = gems.length - 1; i >= 0; i--) {
      const gm = gems[i];
      const dx = P.x - gm.x, dy = P.y - gm.y, d = Math.hypot(dx, dy);
      if (d < st.magnet) gm.pull = true;
      if (gm.pull) {
        gm.x += (dx / (d || 1)) * 420 * dt;
        gm.y += (dy / (d || 1)) * 420 * dt;
      }
      if (d < P.r + 6) { gems[i] = gems[gems.length - 1]; gems.pop(); SFX.gem(combo); gainXp(gm.v); if (mode === "levelup") return; }
    }

    // les bonus au sol : cœur, aimant, bombe
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i];
      d.life -= dt;
      if (d.life <= 0) { drops[i] = drops[drops.length - 1]; drops.pop(); continue; }
      if (Math.hypot(d.x - P.x, d.y - P.y) < P.r + 10) { drops[i] = drops[drops.length - 1]; drops.pop(); pickup(d); }
    }

    // éclats, nombres, ondes, images rémanentes
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) { parts[i] = parts[parts.length - 1]; parts.pop(); }
    }
    for (let i = texts.length - 1; i >= 0; i--) {
      const q = texts[i];
      q.life -= dt;
      if (!calm) q.y -= 36 * dt;
      if (q.life <= 0) texts.splice(i, 1);
    }
    for (let i = waves.length - 1; i >= 0; i--) {
      const w = waves[i];
      w.life -= dt;
      w.r = w.max * (1 - w.life / w.t);
      if (w.life <= 0) waves.splice(i, 1);
    }
    for (let i = ghosts.length - 1; i >= 0; i--) {
      ghosts[i].life -= dt;
      if (ghosts[i].life <= 0) ghosts.splice(i, 1);
    }

    // la caméra suit, sans sortir de l'arène quand l'écran est plus petit qu'elle
    cam.x += (P.x - cam.x) * Math.min(1, dt * 8);
    cam.y += (P.y - cam.y) * Math.min(1, dt * 8);
  };

  // le menu : les ennemis dérivent et rebondissent sur un cadre autour du centre
  const drift = (dt) => {
    enemies.forEach((e) => {
      e.x += e.dirx * dt;
      e.y += e.diry * dt;
      if (Math.abs(e.x - ARENA_W / 2) > 460) e.dirx = -e.dirx;
      if (Math.abs(e.y - ARENA_H / 2) > 300) e.diry = -e.diry;
      e.age += dt;
    });
  };

  /* ---------- Rendu ---------- */
  const hud = { time: "", level: "", kills: "", hp: -1, xp: -1, dash: -1, boss: -1 };
  const drawHud = () => {
    const tm = fmt(t), lvl = "niv " + level, ks = kills + " tués";
    if (tm !== hud.time) { hud.time = tm; $("#sTime").textContent = tm; }
    if (lvl !== hud.level) { hud.level = lvl; $("#sLevel").textContent = lvl; }
    if (ks !== hud.kills) { hud.kills = ks; $("#sKills").textContent = ks; }
    const hp = Math.round((P.hp / st.maxHp) * 100), xpp = Math.round((xp / need) * 100), ds = Math.round((1 - P.dashCd / DASH_CD) * 100);
    const hpt = Math.ceil(P.hp) + " / " + st.maxHp;
    if (hpt !== hud.hpt) { hud.hpt = hpt; $("#hpTxt").textContent = hpt; }
    const sc = liveScore() + " pts";
    if (sc !== hud.sc) { hud.sc = sc; $("#scoreTxt").textContent = sc; }
    if (hp !== hud.hp) {
      hud.hp = hp;
      $("#hpFill").style.width = hp + "%";
      $("#hpBar").classList.toggle("low", hp <= 30);
      $("#play").classList.toggle("low", hp <= 30 && mode !== "over" && mode !== "win");
    }
    if (xpp !== hud.xp) { hud.xp = xpp; $("#xpFill").style.width = xpp + "%"; }
    if (ds !== hud.dash) { hud.dash = ds; $("#dashFill").style.width = ds + "%"; $("#dashBtn").classList.toggle("ready", ds >= 100); }
    const boss = enemies.find((e) => e.type === "boss");
    const bp = boss ? Math.round((boss.hp / boss.max) * 100) : -1;
    if (bp !== hud.boss) {
      hud.boss = bp;
      $("#bossBar").hidden = bp < 0;
      if (bp >= 0) $("#bossFill").style.width = Math.max(0, bp) + "%";
    }
  };

  const camPos = () => {
    const vw = cssW / zoom, vh = cssH / zoom;
    const x = vw >= ARENA_W ? ARENA_W / 2 : clamp(cam.x, vw / 2, ARENA_W - vw / 2);
    const y = vh >= ARENA_H ? ARENA_H / 2 : clamp(cam.y, vh / 2, ARENA_H - vh / 2);
    return [x, y, vw, vh];
  };

  const hash = (i, j) => {
    let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return (h ^ (h >>> 16)) >>> 0;
  };

  const render = () => {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = BG;
    g.fillRect(0, 0, cv.width, cv.height);
    let [cx, cy, vw, vh] = camPos();
    if (mode === "menu") { cx = ARENA_W / 2; cy = ARENA_H / 2; }
    const s = dpr * zoom;
    const sx = shake > 0 && !calm ? rnd(-shake, shake) : 0, sy = shake > 0 && !calm ? rnd(-shake, shake) : 0;
    g.setTransform(s, 0, 0, s, (cssW / 2 - cx * zoom + sx) * dpr, (cssH / 2 - cy * zoom + sy) * dpr);
    g.imageSmoothingEnabled = false;

    // le sol : dalles de 100 px, quelques marques posées au hasard pour sentir qu'on avance
    const i0 = Math.max(0, Math.floor((cx - vw / 2) / 100)), i1 = Math.min(ARENA_W / 100 - 1, Math.floor((cx + vw / 2) / 100));
    const j0 = Math.max(0, Math.floor((cy - vh / 2) / 100)), j1 = Math.min(ARENA_H / 100 - 1, Math.floor((cy + vh / 2) / 100));
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        g.fillStyle = (i + j) & 1 ? "#121212" : "#101010";
        g.fillRect(i * 100, j * 100, 100, 100);
        const h = hash(i, j), ox = i * 100 + 12 + (h % 70), oy = j * 100 + 12 + ((h >> 8) % 70);
        g.fillStyle = "#1c1c1c";
        if (h % 9 === 0) { g.fillRect(ox - 4, oy - 1, 9, 2); g.fillRect(ox - 1, oy - 4, 2, 9); }
        else if (h % 9 === 1) { g.fillRect(ox, oy, 3, 3); g.fillRect(ox + 10, oy + 4, 3, 3); g.fillRect(ox + 4, oy + 12, 3, 3); }
        else if (h % 9 === 2) { g.fillRect(ox - 5, oy, 11, 2); }
      }
    }
    g.strokeStyle = "#333333";
    g.lineWidth = 4;
    g.strokeRect(0, 0, ARENA_W, ARENA_H);
    g.strokeStyle = DARK;
    g.lineWidth = 6;
    [[0, 0, 1, 1], [ARENA_W, 0, -1, 1], [0, ARENA_H, 1, -1], [ARENA_W, ARENA_H, -1, -1]].forEach((c) => {
      g.beginPath();
      g.moveTo(c[0] + c[2] * 40, c[1]);
      g.lineTo(c[0], c[1]);
      g.lineTo(c[0], c[1] + c[3] * 40);
      g.stroke();
    });

    const inView = (x, y, m) => x > cx - vw / 2 - m && x < cx + vw / 2 + m && y > cy - vh / 2 - m && y < cy + vh / 2 + m;

    // les ondes
    waves.forEach((w) => {
      g.strokeStyle = LIGHT;
      g.lineWidth = 3;
      g.globalAlpha = Math.max(0, w.life / w.t);
      g.beginPath();
      g.arc(w.x, w.y, w.r, 0, 6.283);
      g.stroke();
      g.globalAlpha = 1;
    });

    // les cristaux
    g.fillStyle = LIGHT;
    for (let i = 0; i < gems.length; i++) {
      const gm = gems[i];
      if (!inView(gm.x, gm.y, 10)) continue;
      const big = gm.v > 3;
      g.fillRect(gm.x - 2, gm.y - 2, big ? 6 : 4, big ? 6 : 4);
    }

    // les bonus : ils clignotent avant de disparaître
    drops.forEach((d) => {
      if (d.life < 3 && !calm && Math.floor(d.life * 6) % 2) return;
      blit(d.type, d.x, d.y + (calm ? 0 : Math.sin(t * 5 + d.x) * 2), 2, 0, false, false);
    });

    // les lignes de visée des chargeurs : roses, juste avant la charge
    enemies.forEach((e) => {
      if (e.type === "dasher" && e.st === 1 && inView(e.x, e.y, 400)) {
        g.strokeStyle = PINK;
        g.lineWidth = 2;
        g.setLineDash([8, 8]);
        g.beginPath();
        g.moveTo(e.x, e.y);
        g.lineTo(e.x + e.dirx * 260, e.y + e.diry * 260);
        g.stroke();
        g.setLineDash([]);
      }
    });

    // les ennemis : de petites images, qui grandissent à leur apparition
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (!inView(e.x, e.y, 60)) continue;
      const d = TYPES[e.type];
      const grow = Math.min(1, e.age / 0.25);
      const flip = e.x > P.x;
      const frame = Math.floor(t * 6 + e.seed) & 1;
      if (grow < 1) g.globalAlpha = 0.3 + 0.7 * grow;
      blit(e.type, e.x, e.y, d.s, mode === "menu" ? Math.floor(performance.now() / 250 + e.seed) & 1 : frame, flip, e.hit > 0);
      g.globalAlpha = 1;
      if (e.type === "boss") {
        g.fillStyle = "#333333";
        g.fillRect(e.x - 30, e.y - e.r - 16, 60, 5);
        g.fillStyle = PINK;
        g.fillRect(e.x - 30, e.y - e.r - 16, 60 * Math.max(0, e.hp / e.max), 5);
      }
    }

    // tes tirs sont blancs, ceux des ennemis roses : tout ce qui est rose te blesse
    g.fillStyle = LIGHT;
    for (let i = 0; i < bullets.length; i++) {
      const b = bullets[i];
      g.fillRect(b.x - 3, b.y - 3, 6, 6);
      g.globalAlpha = 0.45;
      g.fillRect(b.x - b.vx * 0.018 - 2, b.y - b.vy * 0.018 - 2, 4, 4);
      g.globalAlpha = 1;
    }
    g.fillStyle = PINK;
    for (let i = 0; i < ebullets.length; i++) {
      const b = ebullets[i];
      g.beginPath();
      g.arc(b.x, b.y, 4, 0, 6.283);
      g.fill();
    }
    g.fillStyle = LIGHT;
    for (let o = 0; o < st.orbs; o++) {
      const a = orbAngle + (o / st.orbs) * 6.283;
      g.fillRect(P.x + Math.cos(a) * 52 - 5, P.y + Math.sin(a) * 52 - 5, 10, 10);
    }

    // les éclats
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      g.globalAlpha = Math.max(0, p.life / p.max);
      g.fillStyle = p.color;
      g.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    g.globalAlpha = 1;

    // la personne : des images rémanentes pendant le dash, une pose de marche, rose un instant quand elle est touchée
    ghosts.forEach((q) => blit("player", q.x, q.y, 2, 0, q.face < 0, false, Math.max(0, q.life / 0.2) * 0.45));
    if (mode !== "menu" && !(P.inv > 0 && P.dash <= 0 && !calm && Math.floor(P.inv * 20) % 2 === 0)) {
      blit("player", P.x, P.y, 2, calm ? 0 : Math.floor(P.walk * 8) & 1, P.face < 0, P.flash > 0);
      g.fillStyle = BG;
      g.fillRect(Math.round(P.x - 4 + Math.cos(P.aim) * 2), Math.round(P.y - 5 + Math.sin(P.aim) * 2), 8, 3);
    }

    // les nombres de dégâts
    g.textAlign = "center";
    texts.forEach((q) => {
      g.globalAlpha = Math.min(1, q.life / 0.3);
      g.font = "bold " + q.size + "px 'Courier New', monospace";
      g.fillStyle = BG;
      g.fillText(q.txt, q.x + 1, q.y + 1);
      g.fillStyle = q.color;
      g.fillText(q.txt, q.x, q.y);
    });
    g.globalAlpha = 1;

    // l'écran : joystick, série de tués
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (joy) {
      g.strokeStyle = "#333333";
      g.lineWidth = 2;
      g.beginPath();
      g.arc(joy.ox, joy.oy, 56, 0, 6.283);
      g.stroke();
      const dx = joy.x - joy.ox, dy = joy.y - joy.oy, d = Math.hypot(dx, dy), k = d > 56 ? 56 / d : 1;
      g.globalAlpha = 0.4;
      g.fillStyle = GREY;
      g.beginPath();
      g.arc(joy.ox + dx * k, joy.oy + dy * k, 20, 0, 6.283);
      g.fill();
      g.globalAlpha = 1;
    }
    if (combo >= 5 && (mode === "play" || mode === "levelup" || mode === "pause")) {
      const mu = comboMult();
      g.font = "bold " + (mu >= 3 ? 20 : 16) + "px 'Courier New', monospace";
      g.fillStyle = mu >= 3 ? PINK : LIGHT;
      g.fillText("série " + combo + (mu > 1 ? "  score x" + mu : ""), cssW / 2, 96);
    }
  };

  let perfAcc = 0, perfN = 0, perfTxt = "";
  const frame = (now) => {
    raf = requestAnimationFrame(frame);
    const c0 = dbg.perf ? performance.now() : 0;
    const dt = clamp((now - last) / 1000, 0, 1 / 30);
    last = now;
    if (mode === "play") {
      if (freeze > 0) freeze -= dt;
      else update(dt);
      drawHud();
    } else if (mode === "menu") drift(dt);
    render();
    if (dbg.perf) {
      perfAcc += performance.now() - c0;
      if (++perfN >= 30) {
        perfTxt = (perfAcc / perfN).toFixed(1) + " ms · " + enemies.length + " ennemis";
        cv.dataset.perf = perfTxt;
        perfAcc = perfN = 0;
      }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = LIGHT;
      g.font = "12px 'Courier New', monospace";
      g.textAlign = "left";
      g.fillText(perfTxt, 14, cssH - 40);
    }
  };

  /* ---------- Départ ---------- */
  $("#pause").addEventListener("click", showPause);
  $("#sound").addEventListener("click", () => {
    best.sound = !best.sound;
    soundOn();
    saveBest();
    syncSoundBtn();
  });
  const dashBtn = $("#dashBtn");
  dashBtn.addEventListener("pointerdown", (e) => { e.preventDefault(); dash(); });
  $("#help").addEventListener("click", () => {
    if (mode === "play") showPause();
    else if (mode === "pause") showHow(() => { mode = "play"; showPause(); });
    else if (mode === "menu" || mode === "over" || mode === "win") showHow();
  });
  window.addEventListener("resize", () => { fit(); render(); });
  fit();
  syncSoundBtn();

  let seen = false;
  try { seen = !!localStorage.getItem(KEY + "-vu"); } catch (e) { /* visite proposée à chaque fois */ }
  if (seen) showMenu(); else showHow();
  last = performance.now();
  raf = requestAnimationFrame(frame);
})();
