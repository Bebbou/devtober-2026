(function () {
  "use strict";

  const $ = (s) => document.querySelector(s);

  // true si la personne préfère éviter les animations : plus d'éclats ni de tremblement, le jeu reste le même
  const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const KEY = "devtober-swarm-7";
  const PINK = "#ff0055", LIGHT = "#e0e0e0", GREY = "#8c8c8c", DARK = "#5a5a5a";

  const ARENA_W = 2200, ARENA_H = 1500; // en pixels du monde
  const DURATION = 300; // une partie : 5 minutes
  const MAX_ENEMIES = 320, MAX_GEMS = 500;

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
    // sur petit écran on voit moins de monde, mais pas moins de 0,65 fois sa taille
    zoom = clamp(Math.min(cssW, cssH) / 560, 0.65, 1.3);
  };

  /* ---------- Ce que la personne a enregistré ---------- */
  const best = { time: 0, kills: 0, level: 1, wins: 0, games: 0 };
  try { Object.assign(best, JSON.parse(localStorage.getItem(KEY)) || {}); } catch (e) { /* première partie */ }
  const saveBest = () => {
    try { localStorage.setItem(KEY, JSON.stringify(best)); } catch (e) { /* tant pis */ }
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
  ];
  const HEAL = { id: "heal", name: "Soin", max: 99, desc: () => "rend 40 PV", apply: () => (P.hp = Math.min(st.maxHp, P.hp + 40)) };

  /* ---------- Les ennemis ---------- */
  // r : rayon, hp : vie de départ, sp : vitesse, dmg : contact, xp : cristaux lâchés
  const TYPES = {
    crawler: { r: 6, hp: 2, sp: 66, dmg: 6, xp: 1 },
    brute: { r: 13, hp: 10, sp: 42, dmg: 15, xp: 4 },
    shooter: { r: 8, hp: 4, sp: 56, dmg: 6, xp: 3 },
    boss: { r: 30, hp: 220, sp: 38, dmg: 25, xp: 30 },
  };

  /* ---------- L'état d'une partie ---------- */
  let P, st, lv, enemies, bullets, ebullets, gems, parts;
  let t, kills, level, xp, need, spawnAcc, nextWave, bossAt, cam, joy, orbAngle, pending, mode;
  const keys = {};
  // mode : menu, play, levelup, pause, over, win
  mode = "menu";
  const cells = [];
  const CELL = 48;
  const COLS = Math.ceil(ARENA_W / CELL) + 1, ROWS = Math.ceil(ARENA_H / CELL) + 1;
  for (let i = 0; i < COLS * ROWS; i++) cells.push([]);

  const reset = () => {
    P = { x: ARENA_W / 2, y: ARENA_H / 2, r: 9, hp: 100, inv: 0, flash: 0, aim: 0 };
    st = { cd: 0.5, dmg: 2, count: 1, pierce: 0, range: 440, speed: 170, magnet: 60, maxHp: 100, orbs: 0 };
    lv = {};
    enemies = []; bullets = []; ebullets = []; gems = []; parts = [];
    t = 0; kills = 0; level = 1; xp = 0; need = 8; spawnAcc = 0; nextWave = 30;
    bossAt = [150, 255];
    cam = { x: P.x, y: P.y };
    joy = null; orbAngle = 0; pending = 0;
    fireCd = 0;
  };
  let fireCd = 0;
  reset();

  const spawn = (type, x, y) => {
    const d = TYPES[type];
    const m = 1 + t / 200; // la vie des ennemis monte avec le temps
    const hp = d.hp * (type === "boss" ? 1 + t / 150 : m);
    enemies.push({ type, x, y, r: d.r, hp, max: hp, sp: d.sp * (type === "crawler" ? 1 + Math.min(t / 500, 0.6) : 1), dmg: d.dmg, xp: d.xp, fire: rnd(0.5, 2), hit: 0, orbCd: 0, px: 0, py: 0 });
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

  /* ---------- Ecrans ---------- */
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
  const show = (title, build) => {
    pTitle.textContent = title;
    pBody.textContent = "";
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

  const showMenu = () => {
    mode = "menu";
    $("#pause").hidden = true;
    $("#bars").hidden = true;
    show("swarm", (b) => {
      b.appendChild(el("p", "big", "Tiens 5 minutes."));
      b.appendChild(el("p", "", "Tu te déplaces, ça tire tout seul. Chaque ennemi tué lâche un cristal : à chaque niveau, tu choisis une amélioration."));
      if (best.games) b.appendChild(statsList([["meilleur temps", fmt(best.time)], ["ennemis tués (record)", String(best.kills)], ["victoires", best.wins + " sur " + best.games]]));
      const row = el("div", "row");
      row.appendChild(button("jouer", start, true));
      row.appendChild(button("comment jouer", () => showHow(0)));
      b.appendChild(row);
      b.appendChild(el("p", "small", "ZQSD ou flèches pour bouger · P pour la pause · au doigt : glisse n'importe où"));
      // le pied de page est caché sur téléphone : les crédits sont ici
      const cr = el("p", "small", "Conçu par ");
      [["Lino Volle", "https://github.com/Bebbou"], ["doc", "../docs/07-swarm.html"], ["code", "https://github.com/Bebbou/devtober-2026/tree/main/07-Swarm"]].forEach((l, i) => {
        const a = el("a", "", l[0]);
        a.href = l[1];
        if (i) cr.appendChild(document.createTextNode(" · "));
        cr.appendChild(a);
      });
      b.appendChild(cr);
    });
  };

  const HOW = [
    "Bouge avec ZQSD, WASD ou les flèches. Au doigt ou à la souris, glisse n'importe où sur l'écran : un joystick apparaît sous ton doigt. Tu tires tout seul sur l'ennemi le plus proche.",
    "Les ennemis lâchent des cristaux blancs. Ramasse-les : la barre rose en haut se remplit, et à chaque niveau tu choisis une amélioration parmi trois.",
    "Tiens 5 minutes. Les tireurs envoient des projectiles roses, deux boss arrivent à 2:30 et à 4:15. Ta vie est la barre en haut à gauche. P met en pause.",
  ];
  const showHow = (n) => {
    show("comment jouer " + (n + 1) + " / " + HOW.length, (b) => {
      b.appendChild(el("p", "", HOW[n]));
      const row = el("div", "row");
      row.appendChild(button(n === HOW.length - 1 ? "compris" : "suivant", () => {
        if (n === HOW.length - 1) { try { localStorage.setItem(KEY + "-vu", "1"); } catch (e) { /* on s'en passe */ } showMenu(); }
        else showHow(n + 1);
      }, true));
      if (n < HOW.length - 1) row.appendChild(button("passer", showMenu));
      b.appendChild(row);
    });
  };

  const showLevelUp = () => {
    mode = "levelup";
    const pool = UPGRADES.filter((u) => (lv[u.id] || 0) < u.max);
    const picks = [];
    while (picks.length < 3 && pool.length) picks.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    while (picks.length < 3) picks.push(HEAL);
    live("Niveau " + level + " : choisis une amélioration");
    show("niveau " + level, (b) => {
      const cards = el("div", "cards");
      picks.forEach((u, i) => {
        const c = el("button", "card");
        c.type = "button";
        const l = lv[u.id] || 0;
        const tag = el("span", "lv", u.id === "heal" ? "" : "niv " + (l + 1) + " / " + u.max);
        const name = el("b", "");
        const k = el("kbd", "", String(i + 1));
        name.appendChild(k);
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
    best.games++;
    if (won) best.wins++;
    const record = t > best.time;
    if (record) best.time = t;
    best.kills = Math.max(best.kills, kills);
    best.level = Math.max(best.level, level);
    saveBest();
    $("#pause").hidden = true;
    live(won ? "Tu as tenu 5 minutes" : "Perdu");
    show(won ? "tenu" : giveUp ? "abandon" : "perdu", (b) => {
      b.appendChild(el("p", "big", won ? "Cinq minutes, tenues." : "Tu as tenu " + fmt(t) + "."));
      b.appendChild(statsList([["ennemis tués", String(kills)], ["niveau atteint", String(level)], ["meilleur temps", fmt(best.time) + (record && !won ? " (nouveau)" : "")]]));
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

  /* ---------- Une partie ---------- */
  let last = 0, raf = 0;
  const start = () => {
    reset();
    hidePanel();
    $("#bars").hidden = false;
    $("#pause").hidden = false;
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

  const burst = (x, y, n, color) => {
    if (calm) return;
    for (let i = 0; i < n && parts.length < 160; i++) {
      const a = Math.random() * 6.28, s = rnd(40, 140);
      parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.35, color });
    }
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
    burst(e.x, e.y, e.type === "boss" ? 24 : 5, e.type === "boss" ? PINK : GREY);
    if (e.type === "boss") { for (let k = 0; k < 8; k++) dropGem(e.x, e.y, 4); P.hp = Math.min(st.maxHp, P.hp + 25); }
    else dropGem(e.x, e.y, e.xp);
    enemies[i] = enemies[enemies.length - 1];
    enemies.pop();
  };

  const hurt = (dmg) => {
    if (P.inv > 0) return;
    P.hp -= dmg;
    P.inv = 0.8;
    P.flash = 0.2;
    if (P.hp <= 0) { P.hp = 0; end(false); }
  };

  const update = (dt) => {
    t += dt;
    if (t >= DURATION) {
      enemies.forEach((e) => burst(e.x, e.y, 2, GREY));
      end(true);
      return;
    }

    // la personne bouge
    const [ix, iy] = input();
    P.x = clamp(P.x + ix * st.speed * dt, P.r, ARENA_W - P.r);
    P.y = clamp(P.y + iy * st.speed * dt, P.r, ARENA_H - P.r);
    P.inv = Math.max(0, P.inv - dt);
    P.flash = Math.max(0, P.flash - dt);

    // les ennemis arrivent : plus vite à mesure que le temps passe
    spawnAcc += (1.4 + t * 0.04) * dt;
    while (spawnAcc >= 1) {
      spawnAcc -= 1;
      if (enemies.length >= MAX_ENEMIES) continue;
      const r = Math.random();
      const pBrute = t > 35 ? Math.min(0.12 + (t - 35) / 900, 0.3) : 0;
      const pShoot = t > 70 ? Math.min(0.08 + (t - 70) / 1500, 0.2) : 0;
      const type = r < pBrute ? "brute" : r < pBrute + pShoot ? "shooter" : "crawler";
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
      const dx = P.x - e.x, dy = P.y - e.y, d = Math.hypot(dx, dy) || 1;
      let mx = dx / d, my = dy / d, sp = e.sp;
      if (e.type === "shooter") {
        if (d < 240) { mx = -mx; my = -my; } else if (d < 300) sp = 0;
        e.fire -= dt;
        if (e.fire <= 0 && d < 520) {
          e.fire = 2.2;
          ebullets.push({ x: e.x, y: e.y, vx: (dx / d) * 210, vy: (dy / d) * 210, life: 4, dmg: 10 });
        }
      } else if (e.type === "boss") {
        e.fire -= dt;
        if (e.fire <= 0) {
          e.fire = 3;
          for (let k = 0; k < 12; k++) {
            const a = (k / 12) * 6.283 + t;
            ebullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * 170, vy: Math.sin(a) * 170, life: 4, dmg: 10 });
          }
        }
      }
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
      e.x = clamp(e.x + mx * sp * dt + px * 10 * dt, e.r, ARENA_W - e.r);
      e.y = clamp(e.y + my * sp * dt + py * 10 * dt, e.r, ARENA_H - e.r);
      e.hit = Math.max(0, e.hit - dt);
      e.orbCd = Math.max(0, e.orbCd - dt);
      if (d < e.r + P.r) hurt(e.dmg);
    }
    if (mode !== "play") return;

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
                e.hp -= st.dmg;
                e.hit = 0.06;
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
            if (dx * dx + dy * dy < (e.r + 6) * (e.r + 6)) { e.hp -= Math.max(1, st.dmg * 0.6); e.hit = 0.06; e.orbCd = 0.3; }
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
      if (d < P.r + 6) { gems[i] = gems[gems.length - 1]; gems.pop(); gainXp(gm.v); if (mode === "levelup") return; }
    }

    // les éclats
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) { parts[i] = parts[parts.length - 1]; parts.pop(); }
    }

    // la caméra suit, sans sortir de l'arène quand l'écran est plus petit qu'elle
    cam.x += (P.x - cam.x) * Math.min(1, dt * 8);
    cam.y += (P.y - cam.y) * Math.min(1, dt * 8);
  };

  /* ---------- Rendu ---------- */
  const hud = { time: "", level: "", kills: "", hp: -1, xp: -1 };
  const drawHud = () => {
    const tm = fmt(t), lvl = "niv " + level, ks = kills + " tués";
    if (tm !== hud.time) { hud.time = tm; $("#sTime").textContent = tm; }
    if (lvl !== hud.level) { hud.level = lvl; $("#sLevel").textContent = lvl; }
    if (ks !== hud.kills) { hud.kills = ks; $("#sKills").textContent = ks; }
    const hp = Math.round((P.hp / st.maxHp) * 100), xpp = Math.round((xp / need) * 100);
    if (hp !== hud.hp) { hud.hp = hp; $("#hpFill").style.width = hp + "%"; $("#hpBar").classList.toggle("low", hp <= 30); }
    if (xpp !== hud.xp) { hud.xp = xpp; $("#xpFill").style.width = xpp + "%"; }
  };

  const camPos = () => {
    const vw = cssW / zoom, vh = cssH / zoom;
    const x = vw >= ARENA_W ? ARENA_W / 2 : clamp(cam.x, vw / 2, ARENA_W - vw / 2);
    const y = vh >= ARENA_H ? ARENA_H / 2 : clamp(cam.y, vh / 2, ARENA_H - vh / 2);
    return [x, y, vw, vh];
  };

  const render = () => {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = "#0d0d0d";
    g.fillRect(0, 0, cv.width, cv.height);
    const [cx, cy, vw, vh] = camPos();
    const s = dpr * zoom;
    g.setTransform(s, 0, 0, s, (cssW / 2 - cx * zoom) * dpr, (cssH / 2 - cy * zoom) * dpr);

    // l'arène : un sol un peu plus clair, des points tous les 100 px, un bord
    g.fillStyle = "#111111";
    g.fillRect(0, 0, ARENA_W, ARENA_H);
    g.fillStyle = "#222222";
    const x0 = Math.max(0, Math.floor((cx - vw / 2) / 100) * 100), x1 = Math.min(ARENA_W, cx + vw / 2);
    const y0 = Math.max(0, Math.floor((cy - vh / 2) / 100) * 100), y1 = Math.min(ARENA_H, cy + vh / 2);
    for (let x = x0; x <= x1; x += 100) for (let y = y0; y <= y1; y += 100) g.fillRect(x - 1, y - 1, 2, 2);
    g.strokeStyle = "#333333";
    g.lineWidth = 3;
    g.strokeRect(0, 0, ARENA_W, ARENA_H);

    const inView = (x, y, m) => x > cx - vw / 2 - m && x < cx + vw / 2 + m && y > cy - vh / 2 - m && y < cy + vh / 2 + m;

    // les cristaux
    g.fillStyle = LIGHT;
    for (let i = 0; i < gems.length; i++) {
      const gm = gems[i];
      if (inView(gm.x, gm.y, 10)) g.fillRect(gm.x - 2, gm.y - 2, gm.v > 3 ? 6 : 4, gm.v > 3 ? 6 : 4);
    }

    // les ennemis, par forme
    g.fillStyle = GREY;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (e.type !== "crawler" || !inView(e.x, e.y, 20)) continue;
      if (e.hit > 0) { g.fillStyle = LIGHT; g.fillRect(e.x - e.r, e.y - e.r, e.r * 2, e.r * 2); g.fillStyle = GREY; }
      else g.fillRect(e.x - e.r, e.y - e.r, e.r * 2, e.r * 2);
    }
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (!inView(e.x, e.y, 60)) continue;
      if (e.type === "brute") {
        g.fillStyle = e.hit > 0 ? LIGHT : DARK;
        g.fillRect(e.x - e.r, e.y - e.r, e.r * 2, e.r * 2);
        g.strokeStyle = GREY;
        g.lineWidth = 2;
        g.strokeRect(e.x - e.r + 1, e.y - e.r + 1, e.r * 2 - 2, e.r * 2 - 2);
      } else if (e.type === "shooter") {
        g.fillStyle = e.hit > 0 ? LIGHT : GREY;
        g.beginPath();
        g.moveTo(e.x, e.y - e.r - 2);
        g.lineTo(e.x + e.r + 2, e.y);
        g.lineTo(e.x, e.y + e.r + 2);
        g.lineTo(e.x - e.r - 2, e.y);
        g.closePath();
        g.fill();
        g.fillStyle = PINK;
        g.fillRect(e.x - 1.5, e.y - 1.5, 3, 3);
      } else if (e.type === "boss") {
        g.fillStyle = e.hit > 0 ? DARK : "#1a1a1a";
        g.fillRect(e.x - e.r, e.y - e.r, e.r * 2, e.r * 2);
        g.strokeStyle = PINK;
        g.lineWidth = 3;
        g.strokeRect(e.x - e.r + 1, e.y - e.r + 1, e.r * 2 - 2, e.r * 2 - 2);
        g.fillStyle = "#333333";
        g.fillRect(e.x - 30, e.y - e.r - 14, 60, 5);
        g.fillStyle = PINK;
        g.fillRect(e.x - 30, e.y - e.r - 14, 60 * Math.max(0, e.hp / e.max), 5);
      }
    }

    // les tirs : roses, car ils sont actifs
    g.fillStyle = PINK;
    for (let i = 0; i < bullets.length; i++) g.fillRect(bullets[i].x - 3, bullets[i].y - 3, 6, 6);
    for (let i = 0; i < ebullets.length; i++) {
      const b = ebullets[i];
      g.beginPath();
      g.arc(b.x, b.y, 4, 0, 6.283);
      g.fill();
    }
    for (let o = 0; o < st.orbs; o++) {
      const a = orbAngle + (o / st.orbs) * 6.283;
      g.fillRect(P.x + Math.cos(a) * 52 - 5, P.y + Math.sin(a) * 52 - 5, 10, 10);
    }

    // les éclats
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      g.globalAlpha = Math.max(0, p.life / 0.35);
      g.fillStyle = p.color;
      g.fillRect(p.x - 2, p.y - 2, 4, 4);
    }
    g.globalAlpha = 1;

    // la personne : blanche, rose un instant quand elle est touchée, clignote tant qu'elle est protégée
    if (mode !== "menu" && !(P.inv > 0 && !calm && Math.floor(P.inv * 20) % 2 === 0)) {
      g.fillStyle = P.flash > 0 ? PINK : LIGHT;
      g.beginPath();
      g.arc(P.x, P.y, P.r, 0, 6.283);
      g.fill();
      g.fillStyle = "#0d0d0d";
      g.fillRect(P.x + Math.cos(P.aim) * 4 - 1.5, P.y + Math.sin(P.aim) * 4 - 1.5, 3, 3);
    }

    // le joystick, en pixels de l'écran
    if (joy) {
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.strokeStyle = "#333333";
      g.lineWidth = 2;
      g.beginPath();
      g.arc(joy.ox, joy.oy, 56, 0, 6.283);
      g.stroke();
      const dx = joy.x - joy.ox, dy = joy.y - joy.oy, d = Math.hypot(dx, dy), k = d > 56 ? 56 / d : 1;
      g.fillStyle = GREY;
      g.beginPath();
      g.arc(joy.ox + dx * k, joy.oy + dy * k, 20, 0, 6.283);
      g.fill();
    }
  };

  const frame = (now) => {
    raf = requestAnimationFrame(frame);
    if (mode === "play") {
      const dt = clamp((now - last) / 1000, 0, 1 / 30);
      last = now;
      update(dt);
      drawHud();
    } else {
      last = now;
    }
    render();
  };

  /* ---------- Départ ---------- */
  $("#pause").addEventListener("click", showPause);
  $("#help").addEventListener("click", () => {
    if (mode === "play") showPause();
    if (mode === "menu" || mode === "pause" || mode === "over" || mode === "win") showHow(0);
  });
  window.addEventListener("resize", () => { fit(); render(); });
  fit();
  render();

  let seen = false;
  try { seen = !!localStorage.getItem(KEY + "-vu"); } catch (e) { /* visite proposée à chaque fois */ }
  if (seen) showMenu(); else showHow(0);
  raf = requestAnimationFrame(frame);
})();
