(() => {
  "use strict";

  const cfg = window.PULSE;
  const $ = (sel, root = document) => root.querySelector(sel);

  const DAY = 86400000;
  const CACHE_TTL = 10 * 60 * 1000; // l'API GitHub n'est rappelée qu'après 10 min
  const AUTO_REFRESH = 60 * 1000; // les pings « en ligne » sont refaits chaque minute
  // Les couleurs viennent du CSS (--life, --flat, --bg) : un seul endroit à modifier
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const mix = (a, b, t) => {
    const hex = /^#[0-9a-f]{6}$/i;
    if (!hex.test(a) || !hex.test(b)) return a;
    const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const [x, y] = [rgb(a), rgb(b)];
    return "#" + x.map((v, i) => Math.round(v * t + y[i] * (1 - t)).toString(16).padStart(2, "0")).join("");
  };
  const LIFE = css("--life") || "#ff0055";
  const FLAT = css("--flat") || "#6b6b6b";
  const BG = css("--bg") || "#0d0d0d";
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const rtf = new Intl.RelativeTimeFormat("fr", { numeric: "auto" });
  const nf = new Intl.NumberFormat("fr-FR");

  /* ------------------------------------------------------------------ */
  /*  Tracé ECG                                                          */
  /* ------------------------------------------------------------------ */

  const gauss = (x, c, w) => Math.exp(-((x - c) ** 2) / (2 * w * w));

  // Un battement complet (ondes P, Q, R, S, T) sur une phase de 0 à 1
  const beat = (p) =>
    0.12 * gauss(p, 0.14, 0.028) -
    0.1 * gauss(p, 0.255, 0.009) +
    1.0 * gauss(p, 0.28, 0.008) -
    0.22 * gauss(p, 0.305, 0.011) +
    0.26 * gauss(p, 0.52, 0.05);

  class Ecg {
    constructor(canvas, { speed = 90, gap = 18, lineWidth = 1.6 } = {}) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.speed = speed; // colonnes par seconde
      this.gap = reduceMotion ? 0 : gap;
      this.lineWidth = lineWidth;
      this.bpm = 0;
      this.amp = 0;
      this.color = FLAT;
      this.visible = true;
      this.last = 0;
      this.acc = 0;

      new ResizeObserver(() => this.resize()).observe(canvas);
      new IntersectionObserver(([e]) => {
        this.visible = e.isIntersecting;
        this.last = 0;
      }).observe(canvas);
      this.resize();
    }

    set(bpm, amp, color) {
      this.bpm = bpm;
      this.amp = amp;
      this.color = color;
      if (reduceMotion) this.redraw();
    }

    resize() {
      const r = this.canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.W = Math.max(1, Math.floor(r.width));
      this.H = Math.max(1, Math.floor(r.height));
      this.canvas.width = this.W * dpr;
      this.canvas.height = this.H * dpr;
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.redraw();
    }

    // Remplit tout l'écran d'historique pour que le tracé vive dès le départ
    redraw() {
      this.ys = new Float32Array(this.W);
      this.t = -this.W / this.speed;
      this.cursor = 0;
      for (let i = 0; i < this.W; i++) this.sample(i);
      this.draw();
    }

    sample(i) {
      let v = 0;
      if (this.bpm > 0) {
        const phase = (((this.t * this.bpm) / 60) % 1 + 1) % 1;
        v = beat(phase) * this.amp + 0.015 * Math.sin(this.t * 1.3);
      }
      this.ys[i] = v;
      this.t += 1 / this.speed;
    }

    tick(now) {
      if (!this.visible || reduceMotion) return;
      if (!this.last) this.last = now;
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.acc += this.speed * dt;
      while (this.acc >= 1) {
        this.acc -= 1;
        this.sample(this.cursor);
        this.cursor = (this.cursor + 1) % this.W;
      }
      this.draw();
    }

    draw() {
      const { ctx, W, H, ys, cursor, gap } = this;
      const base = H * 0.64;
      const scale = H * 0.52;
      const seg = 5;

      ctx.clearRect(0, 0, W, H);
      ctx.lineWidth = this.lineWidth;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = this.color;

      for (let i = 0; i < W; i += seg) {
        if (gap && (i - cursor + W) % W < gap) continue; // zone effacée devant le curseur
        let end = Math.min(i + seg, W - 1);
        if (gap && i < cursor && end >= cursor) end = cursor - 1;
        if (end <= i) continue;

        const age = gap ? ((cursor - 1 - i + W) % W) / W : 0;
        ctx.globalAlpha = 1 - age * 0.92;
        ctx.beginPath();
        ctx.moveTo(i, base - ys[i] * scale);
        for (let j = i + 1; j <= end; j++) ctx.lineTo(j, base - ys[j] * scale);
        ctx.stroke();
      }

      // Tête lumineuse du balayage
      if (gap) {
        const x = (cursor - 1 + W) % W;
        ctx.globalAlpha = 1;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(x, base - ys[x] * scale, 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  const monitors = [];
  const loop = (now) => {
    for (const m of monitors) m.tick(now);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  /* ------------------------------------------------------------------ */
  /*  Signes vitaux                                                      */
  /* ------------------------------------------------------------------ */

  const daysSince = (iso) => (Date.now() - new Date(iso).getTime()) / DAY;

  function ago(iso) {
    const diff = (new Date(iso).getTime() - Date.now()) / 1000;
    const units = [
      ["year", 31536000],
      ["month", 2592000],
      ["day", 86400],
      ["hour", 3600],
      ["minute", 60],
    ];
    for (const [unit, secs] of units) {
      if (Math.abs(diff) >= secs) return rtf.format(Math.round(diff / secs), unit);
    }
    return "à l'instant";
  }

  // Transforme l'activité d'un dépôt en rythme cardiaque
  function vitals(d) {
    if (d.planned) return { key: "planned", label: "à venir", bpm: 0, amp: 0, color: FLAT };
    if (d.missing) return { key: "missing", label: "introuvable", bpm: 0, amp: 0, color: FLAT };
    if (d.limit) return { key: "limit", label: "limite api", bpm: 0, amp: 0, color: FLAT };
    if (d.unavailable) return { key: "limit", label: "indisponible", bpm: 0, amp: 0, color: FLAT };
    if (d.c7 > 0) {
      return { key: "active", label: "actif", bpm: Math.min(150, 46 + d.c7 * 5), amp: 1, color: LIFE };
    }
    if (d.c30 > 0) return { key: "calm", label: "calme", bpm: 36, amp: 0.6, color: mix(LIFE, BG, 0.72) };
    if (daysSince(d.pushedAt) < 90) return { key: "sleep", label: "endormi", bpm: 28, amp: 0.4, color: mix(LIFE, BG, 0.45) };
    return { key: "flat", label: "ligne plate", bpm: 0, amp: 0, color: FLAT };
  }

  /* ------------------------------------------------------------------ */
  /*  Données GitHub                                                     */
  /* ------------------------------------------------------------------ */

  class RateLimit extends Error {
    constructor(reset) {
      super("rate limit");
      this.reset = reset;
    }
  }

  async function gh(path) {
    const res = await fetch("https://api.github.com" + path, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (res.status === 403 || res.status === 429) {
      throw new RateLimit(Number(res.headers.get("x-ratelimit-reset")) * 1000 || 0);
    }
    if (res.status === 404 || res.status === 409) return null; // privé, introuvable ou vide
    if (!res.ok) throw new Error("GitHub " + res.status);
    return res.json();
  }

  const cacheKey = (p) => `pulse:v1:${p.owner}/${p.repo}`;
  const readCache = (p) => {
    try {
      return JSON.parse(localStorage.getItem(cacheKey(p)));
    } catch {
      return null;
    }
  };
  const writeCache = (p, data) => {
    try {
      localStorage.setItem(cacheKey(p), JSON.stringify({ t: Date.now(), data }));
    } catch {
      /* stockage indisponible : on s'en passe */
    }
  };

  // Quand GitHub dit "stop", on s'arrête jusqu'à l'heure de reprise (mémorisée entre deux visites)
  const BLOCK_KEY = "pulse:v1:blocked-until";
  const blockedUntil = () => {
    try {
      return Number(localStorage.getItem(BLOCK_KEY)) || 0;
    } catch {
      return 0;
    }
  };
  const blockFor = (reset) => {
    try {
      localStorage.setItem(BLOCK_KEY, String(reset || Date.now() + CACHE_TTL));
    } catch {
      /* stockage indisponible */
    }
  };

  async function fetchRepo(p) {
    const base = `/repos/${p.owner}/${p.repo}`;
    const since = new Date(Date.now() - 30 * DAY).toISOString();
    const repo = await gh(base);
    if (!repo) return { missing: true };
    const [commits, deployments] = await Promise.all([
      gh(`${base}/commits?since=${since}&per_page=100`),
      gh(`${base}/deployments?per_page=1`),
    ]);

    const buckets = new Array(30).fill(0);
    let c7 = 0;
    for (const c of commits || []) {
      const date = c.commit?.author?.date || c.commit?.committer?.date;
      if (!date) continue;
      const age = (Date.now() - new Date(date).getTime()) / DAY;
      if (age < 7) c7++;
      const idx = 29 - Math.floor(age);
      if (idx >= 0 && idx < 30) buckets[idx]++;
    }

    let deploy = null;
    if (deployments && deployments.length) {
      const last = deployments[0];
      const statuses = await gh(`${base}/deployments/${last.id}/statuses?per_page=1`).catch(() => null);
      deploy = { at: last.created_at, env: last.environment, state: statuses?.[0]?.state || "unknown" };
    }

    return {
      c7,
      c30: (commits || []).length,
      buckets,
      pushedAt: repo.pushed_at,
      desc: repo.description || "",
      issues: repo.open_issues_count,
      htmlUrl: repo.html_url,
      deploy,
    };
  }

  async function loadProject(p, force) {
    if (p.planned) return { data: { planned: true }, state: "ok" };
    const cached = readCache(p);
    if (cached && !force && Date.now() - cached.t < CACHE_TTL) return { data: cached.data, state: "ok" };

    const until = blockedUntil();
    if (until > Date.now()) {
      return cached
        ? { data: cached.data, state: "stale", reset: until }
        : { data: { limit: true }, state: "error", reset: until };
    }

    try {
      const data = await fetchRepo(p);
      writeCache(p, data);
      return { data, state: "ok" };
    } catch (err) {
      const limited = err instanceof RateLimit;
      if (limited) blockFor(err.reset);
      if (cached) return { data: cached.data, state: "stale", reset: limited ? blockedUntil() : 0 };
      return { data: limited ? { limit: true } : { unavailable: true }, state: "error", reset: limited ? blockedUntil() : 0 };
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Disponibilité et statistiques personnalisées                       */
  /* ------------------------------------------------------------------ */

  // fetch en no-cors : on sait si le site répond, pas son code HTTP
  async function ping(url) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 6000);
    const start = performance.now();
    try {
      await fetch(url, { mode: "no-cors", cache: "no-store", signal: ctl.signal });
      return { up: true, ms: Math.round(performance.now() - start) };
    } catch {
      return { up: false };
    } finally {
      clearTimeout(timer);
    }
  }

  // Le serveur du projet répond-il vraiment ? Contrairement au ping du site, ici on lit
  // la réponse (CORS ouvert côté serveur) : un serveur en erreur est bien détecté
  async function fetchStats(url) {
    const start = performance.now();
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) return { up: false };
      return { up: true, ms: Math.round(performance.now() - start), data: await res.json() };
    } catch {
      return { up: false };
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Interface                                                          */
  /* ------------------------------------------------------------------ */

  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  const projects = cfg.projects.map((p, i) => ({
    ...p,
    owner: p.owner || cfg.owner,
    label: p.name || p.repo,
    index: i,
    health: null,
    api: null,
    result: null,
  }));

  function buildCard(p) {
    const a = el("a", "card");
    a.href = `https://github.com/${p.owner}/${p.repo}`;
    a.target = "_blank";
    a.rel = "noopener";
    a.dataset.state = "loading";

    const rate = el("div", "rate");
    rate.append(el("b", "", "--"), el("small", "", "BPM"));
    const head = el("div", "head");
    head.append(el("span", "dot"), el("h3", "", p.label), el("span", "state", "…"), rate);

    const ecg = el("div", "ecg");
    const canvas = el("canvas");
    ecg.append(canvas);

    const bars = el("div", "bars");
    for (let i = 0; i < 30; i++) bars.append(el("i"));

    const stats = el("dl", "stats");
    for (const label of ["7 jours", "30 jours", "push", "issues"]) {
      const cell = el("div");
      cell.append(el("dt", "", label), el("dd", "", "–"));
      stats.append(cell);
    }

    a.append(head, el("p", "desc", " "), ecg, bars, stats, el("div", "pills"));
    $("#grid").append(a);

    p.card = a;
    p.monitor = new Ecg(canvas, { speed: 70, gap: 14, lineWidth: 1.4 });
    p.monitor.set(0, 0, FLAT);
    monitors.push(p.monitor);
  }

  function paint(p) {
    const d = p.result.data;
    const v = vitals(d);
    const card = p.card;
    card.dataset.state = v.key;
    $(".state", card).textContent = v.label;
    $(".rate b", card).textContent = v.bpm ? v.bpm : "—";
    p.monitor.set(v.bpm, v.amp, v.color);

    if (d.htmlUrl) card.href = d.htmlUrl;
    $(".desc", card).textContent = d.desc || (d.missing ? "Dépôt privé ou introuvable" : " ");

    const max = Math.max(1, ...(d.buckets || []));
    $$bars(card).forEach((bar, i) => {
      const n = d.buckets ? d.buckets[i] : 0;
      bar.style.setProperty("--h", n ? `${Math.max(22, (n / max) * 100)}%` : "12%");
      bar.style.setProperty("--o", n ? Math.min(1, n / max) : 0);
    });

    const cells = card.querySelectorAll(".stats dd");
    const known = !d.missing && !d.limit && !d.unavailable && !d.planned;
    cells[0].textContent = known ? d.c7 : "–";
    cells[1].textContent = known ? (d.c30 >= 100 ? "100+" : d.c30) : "–";
    cells[2].textContent = known && d.pushedAt ? ago(d.pushedAt).replace("il y a ", "") : "–";
    cells[3].textContent = known ? d.issues : "–";

    paintPills(p);
  }

  const $$bars = (card) => Array.from(card.querySelectorAll(".bars i"));

  function paintPills(p) {
    const box = $(".pills", p.card);
    box.replaceChildren();
    const d = p.result.data;
    const pill = (cls, text) => box.append(el("span", `pill ${cls}`, text));

    // Quand un serveur est aussi surveillé, on précise : "site" (le front) et "serveur" (l'API)
    const status = (name, r) =>
      pill(r.up ? "up" : "down", `${name}${r.up ? "en ligne" : "hors ligne"}${r.up ? ` · ${r.ms} ms` : ""}`);
    if (p.health) status(p.stats ? "site " : "", p.health);
    if (p.api) status(p.url ? "serveur " : "", p.api);
    if (d.deploy) {
      const bad = ["failure", "error"].includes(d.deploy.state);
      pill(bad ? "bad" : "neutral", `${bad ? "échec du déploiement" : "déployé"} ${ago(d.deploy.at)}`);
    }
    const live = p.api && p.api.up ? p.api.data : null;
    if (live && typeof live.requests === "number") pill("neutral", `${nf.format(live.requests)} requêtes / 24 h`);
    if (live && typeof live.sockets === "number") {
      pill("neutral", `${live.sockets} connecté${live.sockets > 1 ? "s" : ""}`);
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Rythme global                                                      */
  /* ------------------------------------------------------------------ */

  const hero = new Ecg($("#heroEcg"), { speed: 110, gap: 28, lineWidth: 2 });
  monitors.push(hero);

  function paintHero() {
    const ready = projects.filter((p) => p.result);
    const vs = ready.map((p) => vitals(p.result.data));
    const live = vs.filter((v) => v.bpm > 0);
    const bpm = live.length ? Math.round(live.reduce((s, v) => s + v.bpm, 0) / live.length) : 0;
    const commits = ready.reduce((s, p) => s + (p.result.data.c7 || 0), 0);
    // "en ligne" = tous les contrôles configurés (site et/ou serveur) répondent
    const watched = projects.filter((p) => p.url || p.stats);
    const online = watched.filter((p) => (!p.url || p.health?.up) && (!p.stats || p.api?.up)).length;
    const requests = projects.reduce((s, p) => s + (p.api?.up ? p.api.data.requests || 0 : 0), 0);
    const hasStats = projects.some((p) => p.stats);

    $("#bpm").textContent = ready.length ? (bpm || "—") : "--";
    $("#kActive").textContent = ready.length ? `${vs.filter((v) => v.key === "active").length}/${projects.length}` : "–";
    $("#kCommits").textContent = ready.length ? commits : "–";
    $("#kOnline").textContent = watched.length ? `${online}/${watched.length}` : "—";
    $("#kReqBox").hidden = !hasStats;
    $("#kReq").textContent = nf.format(requests);
    hero.set(bpm, bpm ? 1 : 0, bpm ? LIFE : FLAT);
  }

  /* ------------------------------------------------------------------ */
  /*  Actualisation                                                      */
  /* ------------------------------------------------------------------ */

  let updatedAt = 0;
  let refreshing = false;

  function stamp() {
    $("#stamp").textContent = updatedAt ? `mis à jour ${ago(new Date(updatedAt).toISOString())}` : "chargement…";
  }

  async function refresh(force = false) {
    if (refreshing) return;
    refreshing = true;
    $("#refresh").classList.add("busy");

    await Promise.all(
      projects.map(async (p) => {
        p.result = await loadProject(p, force);
        const extras = [];
        if (p.url) extras.push(ping(p.url).then((h) => (p.health = h)));
        if (p.stats) extras.push(fetchStats(p.stats).then((s) => (p.api = s)));
        await Promise.all(extras);
        paint(p);
      })
    );

    const limited = projects.find((p) => p.result.state !== "ok" && p.result.reset);
    const notice = $("#notice");
    if (limited) {
      const at = new Date(limited.result.reset).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
      notice.textContent = `Limite de l'API GitHub atteinte : les données seront actualisées vers ${at}.`;
      notice.hidden = false;
    } else {
      notice.hidden = true;
    }

    paintHero();
    updatedAt = Date.now();
    stamp();
    $("#refresh").classList.remove("busy");
    refreshing = false;
  }

  projects.forEach(buildCard);
  $("#count").textContent = `${projects.length} dépôts`;
  $("#refresh").addEventListener("click", () => refresh(true));
  setInterval(stamp, 15000);
  setInterval(() => refresh(false), AUTO_REFRESH);
  refresh(false);
})();
