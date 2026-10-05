(function () {
  "use strict";

  const $ = (s) => document.querySelector(s);

  // true si la personne préfère éviter les animations : toute boucle d'animation doit le respecter
  const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const F = window.FRANCE;
  const KEY = "devtober-chaos-5";
  // Les données sont collectées toutes les heures par l'Action GitHub (.github/workflows/chaos-data.yml).
  // La copie du dossier sert tant que la branche chaos-data n'existe pas, ou si elle est hors service.
  const URLS = [
    "https://raw.githubusercontent.com/Bebbou/devtober-2026/chaos-data/events.json",
    "events.json",
  ];

  // Une forme par catégorie : le rose est réservé à ce qui vient de se passer.
  const CATS = {
    feu: { label: "incendies", g: '<path class="g" d="M0 -7L6.5 5L-6.5 5Z"/>' },
    meteo: { label: "intempéries", g: '<path class="g" d="M0 -7L7 0L0 7L-7 0Z"/>' },
    accident: { label: "accidents", g: '<path class="g" d="M-5 -5H5V5H-5Z"/>' },
    manif: { label: "mobilisations", g: '<circle class="o" r="5.5"/>' },
    violence: { label: "violences", g: '<path class="o" d="M-5 -5L5 5M5 -5L-5 5"/>' },
    panne: { label: "pannes", g: '<path class="o" d="M-6 0L-3 -5.2H3L6 0L3 5.2H-3Z"/>' },
  };
  const NOPHOTO = new Set(["violence", "accident"]); // pas de photo : on ne montre pas de victimes
  const HOUR = 3600e3;
  const DAY = 24 * HOUR;
  const LIST_MAX = 120;
  const MAX_PTS = 500; // pastilles dessinées : les plus récentes. Le reste compte dans la liste et les totaux.

  const svg = $("#map");
  const gDeps = $("#deps");
  const gPts = $("#pts");
  const wrap = $(".mapwrap");
  const card = $("#card");
  const list = $("#list");

  let events = [];
  let generated = 0;
  let days = 7;
  let active = new Set(Object.keys(CATS));
  let sel = null;
  let shown = [];
  let tidy = matchMedia("(max-width: 820px)").matches; // en désordre sur grand écran, rangé sur téléphone
  let drawn = [];
  let shownAll = []; // sans le filtre département : la teinte de la carte s'appuie dessus
  let q = "";
  let depSel = "";
  let loaded = false;
  let hashEvent = "";
  let showDep = true;
  const nodes = new Map(); // id -> { g, row, e }
  const vb = { x: 0, y: 0, w: F.w, h: F.h };

  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "{}");
    if ([1, 7, 30].includes(saved.days)) days = saved.days;
    // on retient ce que la personne a masqué : une catégorie ajoutée plus tard reste visible
    if (Array.isArray(saved.off)) saved.off.forEach((c) => active.delete(c));
    if (saved.shapes) document.body.classList.add("shapes");
    if (typeof saved.tidy === "boolean") tidy = saved.tidy;
    if (saved.nodep) showDep = false;
  } catch (e) {
    /* on s'en passe */
  }
  // l'adresse prime sur la mémoire du navigateur : elle sert à partager une vue
  const hash = new URLSearchParams(location.hash.slice(1));
  if ([1, 7, 30].includes(+hash.get("p"))) days = +hash.get("p");
  if (hash.has("off")) {
    active = new Set(Object.keys(CATS));
    hash.get("off").split(",").forEach((c) => active.delete(c));
  }
  if (hash.has("t")) tidy = hash.get("t") === "1";
  if (hash.has("x")) showDep = hash.get("x") !== "1";
  document.body.classList.toggle("tidy", tidy);
  q = hash.get("q") || "";
  depSel = hash.get("d") || "";
  hashEvent = hash.get("e") || "";

  function syncHash() {
    const p = new URLSearchParams();
    p.set("p", days);
    const off = Object.keys(CATS).filter((c) => !active.has(c));
    if (off.length) p.set("off", off.join(","));
    p.set("t", tidy ? "1" : "0");
    if (!showDep) p.set("x", "1");
    if (q) p.set("q", q);
    if (depSel) p.set("d", depSel);
    if (sel) p.set("e", sel);
    try {
      history.replaceState(null, "", "#" + p.toString());
    } catch (e) {
      /* aperçu sans adresse modifiable */
    }
  }
  const save = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ days, off: Object.keys(CATS).filter((c) => !active.has(c)), shapes: document.body.classList.contains("shapes"), tidy, nodep: !showDep }));
    } catch (e) {
      /* on s'en passe */
    }
    syncHash();
  };

  /* ---------- Le fond de carte ---------- */
  const key = (s) => String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  gDeps.innerHTML = F.deps.map((d) => `<path d="${d.d}" data-k="${key(d.n)}"><title>${d.n}</title></path>`).join("");
  const depBox = new Map(
    F.deps.map((d) => {
      const n = d.d.match(/-?\d+\.?\d*/g).map(Number);
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (let i = 0; i < n.length; i += 2) {
        x0 = Math.min(x0, n[i]); x1 = Math.max(x1, n[i]);
        y0 = Math.min(y0, n[i + 1]); y1 = Math.max(y1, n[i + 1]);
      }
      return [key(d.n), { x0, y0, x1, y1 }];
    }),
  );
  const depEls = new Map(F.deps.map((d, i) => [key(d.n), { el: gDeps.children[i], name: d.n }]));
  const gDc = $("#dc");
  gDc.innerHTML = F.deps
    .map((d) => {
      const b = depBox.get(key(d.n));
      return `<text x="${((b.x0 + b.x1) / 2).toFixed(1)}" y="${((b.y0 + b.y1) / 2).toFixed(1)}"></text>`;
    })
    .join("");
  F.deps.forEach((d, i) => { depEls.get(key(d.n)).lb = gDc.children[i]; });

  const heat = (list = shownAll) => {
    const count = (l) => {
      const m = new Map();
      const add = (d) => m.set(key(d), (m.get(key(d)) || 0) + 1);
      l.forEach((e) => { add(e.dep); (e.also || []).forEach(add); });
      return m;
    };
    const n = count(list);
    // la référence est toujours la période entière : pendant le rejeu, la teinte monte vers elle
    const max = Math.max(1, ...count(shownAll).values());
    depEls.forEach((d, k) => {
      const c = n.get(k) || 0;
      // échelle en racine : quelques événements se voient déjà, le plus touché est franchement rose
      d.el.style.fill = c ? "rgba(255, 0, 85, " + (0.09 + 0.4 * Math.sqrt(c / max)).toFixed(3) + ")" : "";
      d.el.firstChild.textContent = d.name + (c ? " : " + c : "");
      d.lb.textContent = c || "";
    });
  };

  // une barre par heure (24 h), par tranche de 6 h (7 jours) ou par jour (30 jours)
  const histo = () => {
    const now = Date.now();
    const step = days === 1 ? HOUR : days === 7 ? 6 * HOUR : DAY;
    const nb = (days * DAY) / step;
    const b = new Array(nb).fill(0), live = new Array(nb).fill(false);
    shown.forEach((e) => {
      const i = nb - 1 - Math.floor((now - e.ms) / step);
      if (i < 0 || i >= nb) return;
      b[i]++;
      if (now - e.ms < 3 * HOUR) live[i] = true;
    });
    const max = Math.max(1, ...b), w = 300 / nb;
    $("#hist").innerHTML =
      '<line x1="0" x2="300" y1="55.5" y2="55.5"/>' +
      b
        .map((c, i) => {
          const h = c ? Math.max(2, (c / max) * 52) : 0;
          return c ? `<rect class="${live[i] ? "live" : "on"}" x="${(i * w + 0.5).toFixed(1)}" y="${(55 - h).toFixed(1)}" width="${Math.max(1, w - 1).toFixed(1)}" height="${h.toFixed(1)}"><title>${c} événement${c > 1 ? "s" : ""}</title></rect>` : "";
        })
        .join("");
    const oldest = events.length ? Math.min(...events.map((e) => e.ms)) : now;
    $("#hFrom").textContent =
      oldest > now - days * DAY + 3 * HOUR
        ? "depuis le " + new Date(oldest).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })
        : days === 1 ? "il y a 24 h" : "il y a " + days + " j";
    $("#hMax").textContent = "pic : " + max;
  };

  const proj = (lon, lat) => [(lon - F.lon0) * F.cos * F.k, (F.lat1 - lat) * F.k];
  let rectCache = null;
  const box = () => rectCache || (rectCache = svg.getBoundingClientRect());
  const scale = () => {
    const r = box();
    return Math.min(r.width / vb.w, r.height / vb.h) || 1;
  };
  // pixels de l'écran -> coordonnées de la carte (le fond est centré dans la boîte)
  const toUser = (cx, cy) => {
    const r = box(), s = scale();
    return [vb.x + (cx - r.left - (r.width - vb.w * s) / 2) / s, vb.y + (cy - r.top - (r.height - vb.h * s) / 2) / s];
  };
  const toWrap = (ux, uy) => {
    const r = box(), w = wrap.getBoundingClientRect(), s = scale();
    return [r.left - w.left + (r.width - vb.w * s) / 2 + (ux - vb.x) * s, r.top - w.top + (r.height - vb.h * s) / 2 + (uy - vb.y) * s];
  };
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  let queued = 0, lastW = 0, movT = 0;
  const setView = () => {
    vb.w = clamp(vb.w, 90, F.w);
    vb.h = (vb.w * F.h) / F.w;
    vb.x = clamp(vb.x, -60, F.w - vb.w + 60);
    vb.y = clamp(vb.y, -60, F.h - vb.h + 60);
    svg.setAttribute("viewBox", [vb.x, vb.y, vb.w, vb.h].map((n) => +n.toFixed(2)).join(" "));
    svg.classList.add("moving");
    clearTimeout(movT);
    movT = setTimeout(() => svg.classList.remove("moving"), 180);
    if (vb.w !== lastW) {
      lastW = vb.w;
      if (!queued) queued = requestAnimationFrame(() => { queued = 0; place(); });
    } else {
      loadPhotos();
      if (sel && !card.hidden) putCard();
    }
  };

  const zoomAt = (cx, cy, k) => {
    const before = toUser(cx, cy);
    vb.w = clamp(vb.w / k, 90, F.w);
    vb.h = (vb.w * F.h) / F.w;
    const after = toUser(cx, cy);
    vb.x += before[0] - after[0];
    vb.y += before[1] - after[1];
    setView();
  };

  let tween = 0;
  const flyTo = (x, y, w) => {
    cancelAnimationFrame(tween);
    w = clamp(w, 90, F.w);
    const h = (w * F.h) / F.w;
    const to = { x: x - w / 2, y: y - h / 2, w };
    if (calm) {
      Object.assign(vb, to);
      return setView();
    }
    const from = { x: vb.x, y: vb.y, w: vb.w }, t0 = performance.now();
    const step = (t) => {
      const p = Math.min(1, (t - t0) / 260), e = 1 - Math.pow(1 - p, 3);
      vb.x = from.x + (to.x - from.x) * e;
      vb.y = from.y + (to.y - from.y) * e;
      vb.w = from.w + (to.w - from.w) * e;
      setView();
      if (p < 1) tween = requestAnimationFrame(step);
    };
    tween = requestAnimationFrame(step);
  };

  /* ---------- Les données ---------- */
  const ago = (ms) => {
    const m = Math.round(ms / 60000);
    if (m < 1) return "à l'instant";
    if (m < 60) return "il y a " + m + " min";
    if (ms < DAY) return "il y a " + Math.round(ms / HOUR) + " h";
    return "il y a " + Math.round(ms / DAY) + " j";
  };
  const level = (ms) => (ms < 3 * HOUR ? 0 : ms < DAY ? 1 : ms < 7 * DAY ? 2 : 3);

  const prepare = () => {
    const slots = new Map();
    events.forEach((e) => {
      const p = proj(e.lon, e.lat);
      e.ux = p[0];
      e.uy = p[1];
      e.ms = new Date(e.t).getTime();
      e.inside = e.ux > 0 && e.ux < F.w && e.uy > 0 && e.uy < F.h;
      e.pic = NOPHOTO.has(e.cat) ? "" : e.img || "";
      e.hay = key([e.place, e.dep, ...(e.also || []), ...e.items.map((i) => i.title)].join(" "));
      const k = e.lat + "|" + e.lon;
      e.slot = slots.get(k) || 0;
      slots.set(k, e.slot + 1);
    });
  };

  /* ---------- Les points et la liste ---------- */
  const glyph = (c) => '<svg viewBox="-8 -8 16 16" aria-hidden="true" class="gl">' + CATS[c].g.replace(/ class="(g|o)"/, ' class="$1"') + "</svg>";

  const render = () => {
    const now = Date.now();
    const shapesOn = document.body.classList.contains("shapes");
    const nq = key(q);
    const base = events.filter((e) => e.inside && now - e.ms <= days * DAY && (!nq || e.hay.includes(nq)));
    const inPeriod = showDep ? base : base.filter((e) => e.prec !== "dep");
    const depOk = (e) => !depSel || key(e.dep) === depSel || (e.also || []).some((d) => key(d) === depSel);
    const dt = $("#depToggle");
    if (dt) {
      dt.setAttribute("aria-pressed", showDep);
      dt.querySelector(".n").textContent = base.filter((e) => e.prec === "dep").length;
    }
    const counts = {};
    inPeriod.filter(depOk).forEach((e) => (counts[e.cat] = (counts[e.cat] || 0) + 1));
    document.querySelectorAll(".cat[data-cat]").forEach((b) => {
      // une catégorie sans événement disparaît, sauf si elle est masquée : on doit pouvoir la rallumer
      b.hidden = !counts[b.dataset.cat] && active.has(b.dataset.cat);
      b.setAttribute("aria-pressed", active.has(b.dataset.cat));
      b.querySelector(".n").textContent = counts[b.dataset.cat] || 0;
      b.style.setProperty("--p", Math.round(((counts[b.dataset.cat] || 0) / Math.max(1, ...Object.values(counts))) * 100) + "%");
    });
    document.querySelectorAll("#periods button").forEach((b) => b.setAttribute("aria-pressed", +b.dataset.days === days));

    shownAll = inPeriod.filter((e) => active.has(e.cat)).sort((a, b) => b.ms - a.ms);
    shown = shownAll.filter(depOk);
    depEls.forEach((d, k) => d.el.classList.toggle("on", k === depSel));
    $("#depbar").hidden = !depSel;
    if (depSel && depEls.has(depSel)) $("#depName").textContent = depEls.get(depSel).name + " : " + shown.length;
    $("#total").textContent = shown.length;
    $("#unit").textContent = (shown.length === 1 ? "événement" : "événements") + " sur " + (days === 1 ? "24 h" : days + " jours") + (shown.length > MAX_PTS ? " (" + MAX_PTS + " sur la carte)" : "");

    nodes.clear();
    // les plus anciens d'abord : les récents restent au-dessus
    drawn = shown.slice(0, MAX_PTS);
    gPts.innerHTML = [...drawn]
      .reverse()
      .map((e, i, arr) => {
        const n = Math.min(e.items.length - 1, 6);
        const r = arr.length - 1 - i;
        const live = level(now - e.ms) === 0 && r < 8;
        // un tremblement différent pour chacun : ils ne battent pas en même temps
        const sh = `--sd:${(0.38 + (e.slot % 5) * 0.07 + (e.ms % 7) * 0.02).toFixed(2)}s;--dl:-${((e.ms % 11) * 0.09).toFixed(2)}s`;
        const g = CATS[e.cat].g;
        return (
          `<g class="pt${e.prec === "dep" ? " dp" : ""}" data-id="${e.id}" data-c="${e.cat}" data-age="${level(now - e.ms)}" data-live="${live ? 1 : 0}" data-n="${n}" data-prec="${e.prec || ""}" aria-hidden="true">` +
          '<circle class="hit" r="16"/>' + (live ? '<circle class="pulse" r="14"/>' : "") + '<circle class="ring" r="17"/>' +
          `<g class="sh" style="${sh}"><g class="sym">` + g + "</g></g>" +
          "</g>"
        );
      })
      .join("");
    const byId = new Map(drawn.map((e) => [e.id, e]));
    const rank = new Map(shown.map((e, i) => [e.id, i]));
    gPts.querySelectorAll(".pt").forEach((g) =>
      nodes.set(g.dataset.id, { g, e: byId.get(g.dataset.id), n: +g.dataset.n, rank: rank.get(g.dataset.id), hide: false, inCl: false }),
    );

    const sig = [days, nq, depSel, [...active].join(), showDep].join("|");
    if (sig !== lastSig) listN = 30;
    lastSig = sig;
    renderList(now);

    const empty = $("#empty");
    empty.hidden = shown.length > 0;
    if (!shown.length) {
      empty.textContent = !loaded
        ? "Chargement des événements…"
        : events.length ? "Rien avec ces filtres." : "Les données ne sont pas encore publiées.";
    }

    if (sel && !nodes.has(sel)) closeCard();
    else if (sel) mark(sel, true);
    heat();
    histo();
    place();
    clearTimeout(growT);
    loadLimit = 40;
    growT = setTimeout(growPhotos, 1100);
  };

  let listN = 30, lastSig = "";
  const renderList = (now) => {
    list.innerHTML = shown
      .slice(0, listN)
      .map((e) => {
        const age = now - e.ms;
        const where = e.sat ? "Détection satellite" : e.place + (e.prec === "dep" ? " · département" : "") + (e.also ? " +" + e.also.length : "");
        return (
          `<li><button class="row" type="button" data-id="${e.id}">` +
          (e.pic ? `<img class="thumb" src="${esc(e.pic)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : glyph(e.cat)) +
          `<span class="place">${esc(where)}</span>` +
          `<span class="age${age < 3 * HOUR ? " live" : ""}">${ago(age)}</span>` +
          `<span class="title">${esc(e.items[0].title)}</span></button></li>`
        );
      })
      .join("");
    if (shown.length > listN) {
      const rest = shown.length - listN;
      list.insertAdjacentHTML(
        "beforeend",
        listN < LIST_MAX
          ? `<li class="more"><button type="button" id="moreRows">voir plus (${Math.min(30, rest)} de ${rest})</button></li>`
          : `<li class="more">et ${rest} autres : affine avec la recherche ou les filtres</li>`,
      );
    }
    list.querySelectorAll(".row").forEach((r) => {
      const n = nodes.get(r.dataset.id);
      if (n) n.row = r;
    });
  };

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

  // La photo est ajoutée à la pastille au moment de la charger : 40 d'abord, puis 20 de plus toutes
  // les 1,1 s jusqu'à 150, les autres seulement quand on zoome dessus. Sans photo, la forme reste.
  let loadLimit = 40, growT = 0;
  const ensurePhoto = (n) => {
    n.g.querySelector(".sh").insertAdjacentHTML(
      "afterbegin",
      '<g class="photo"><circle class="bgc" r="13"/>' +
        `<image class="im" href="${esc(n.e.pic)}" x="-13" y="-13" width="26" height="26" preserveAspectRatio="xMidYMid slice" clip-path="url(#cp)"/>` +
        '<circle class="rim" r="13"/><g class="badge" transform="translate(10 10)"><circle r="7.5"/><g transform="scale(.6)">' + CATS[n.e.cat].g + "</g></g></g>",
    );
    n.g.classList.add("has");
  };
  const loadPhotos = () => {
    if (document.body.classList.contains("shapes")) return;
    const zoomed = vb.w < 520;
    nodes.forEach((n) => {
      if (n.loaded || !n.e || !n.e.pic || n.inCl) return;
      if (n.rank >= loadLimit && !zoomed) return;
      if (n.e.ux < vb.x - 30 || n.e.ux > vb.x + vb.w + 30 || n.e.uy < vb.y - 30 || n.e.uy > vb.y + vb.h + 30) return;
      n.loaded = true;
      ensurePhoto(n);
    });
  };
  const growPhotos = () => {
    if (loadLimit >= 150) return;
    loadLimit += 20;
    loadPhotos();
    growT = setTimeout(growPhotos, 1100);
  };
  // une image en panne (adresse expirée) : la pastille retombe sur sa forme
  gPts.addEventListener(
    "error",
    (ev) => {
      const g = ev.target.closest && ev.target.closest(".pt");
      if (g) g.classList.add("noimg");
    },
    true,
  );

  // taille constante à l'écran : on convertit les pixels en unités de la carte
  const SPREAD = 15;
  const CELL = 30; // en pixels : sous cette distance, deux pastilles se regroupent
  const MAX_ZOOM_W = 150; // au zoom maximal on ne regroupe plus : on écarte en spirale
  let groups = [];
  const gCl = $("#cl");
  const clEls = [];
  const clAt = (i) => {
    while (clEls.length <= i) {
      gCl.insertAdjacentHTML("beforeend", '<g class="cl" aria-hidden="true"><circle class="pulse" r="18"/><circle class="disc" r="16"/><text class="num" y="5" text-anchor="middle"></text><title></title></g>');
      clEls.push(gCl.lastElementChild);
    }
    return clEls[i];
  };

  const place = () => {
    const u = 1 / scale();
    const now = Date.now();
    groups = [];
    svg.style.setProperty("--sw", u.toFixed(4));
    svg.style.setProperty("--u", u.toFixed(4));    nodes.forEach((n) => { n.inCl = false; });
    if (tidy && vb.w > MAX_ZOOM_W) {
      const reach = CELL * u;
      for (const e of drawn) {
        const n = nodes.get(e.id);
        // l'événement ouvert et ceux du rejeu pas encore apparus ne comptent pas
        if (!n || n.hide || e.id === sel) continue;
        const g = groups.find((c) => Math.abs(c.ax - e.ux) < reach && Math.hypot(c.ax - e.ux, c.ay - e.uy) < reach);
        if (g) g.m.push(e);
        else groups.push({ ax: e.ux, ay: e.uy, m: [e] });
      }
      groups = groups.filter((g) => g.m.length > 1);
      groups.forEach((g) => g.m.forEach((e) => { nodes.get(e.id).inCl = true; }));
    }

    nodes.forEach((n) => {
      if (n.wasIn !== n.inCl) {
        n.g.classList.toggle("in", n.inCl);
        n.wasIn = n.inCl;
      }
      const e = n.e;
      if (!e || n.inCl) return;
      // plusieurs faits dans la même commune : on les écarte en spirale
      const a = e.slot * 2.4, r = e.slot ? SPREAD * Math.sqrt(e.slot) : 0;
      const s = u * (1 + 0.2 * n.n) * (e.prec === "dep" ? 0.82 : 1);
      const tr = `translate(${(e.ux + Math.cos(a) * r * u).toFixed(2)} ${(e.uy + Math.sin(a) * r * u).toFixed(2)}) scale(${s.toFixed(4)})`;
      if (n.tr !== tr) {
        n.g.setAttribute("transform", tr);
        n.tr = tr;
      }
    });

    groups.forEach((g, i) => {
      const el = clAt(i), c = el.children, n = g.m.length;
      const cx = g.m.reduce((s, e) => s + e.ux, 0) / n, cy = g.m.reduce((s, e) => s + e.uy, 0) / n;
      const r = Math.min(36, 15 + 3.2 * Math.sqrt(n));
      el.setAttribute("transform", `translate(${cx.toFixed(2)} ${cy.toFixed(2)}) scale(${u.toFixed(4)})`);
      el.dataset.i = i;
      el.dataset.live = g.m.some((e) => now - e.ms < 3 * HOUR) ? "1" : "0";
      el.style.display = "";
      c[0].setAttribute("r", r + 3);
      c[1].setAttribute("r", r);
      c[2].textContent = n;
      c[3].textContent = n + " événements : cliquer pour zoomer";
    });
    for (let i = groups.length; i < clEls.length; i++) clEls[i].style.display = "none";

    loadPhotos();
    if (sel && !card.hidden) putCard();
  };

  const mark = (id, on) => {
    const n = nodes.get(id);
    if (!n) return;
    n.g.classList.toggle("sel", on);
    if (n.row) {
      if (on) n.row.setAttribute("aria-current", "true");
      else n.row.removeAttribute("aria-current");
    }
  };

  /* ---------- Le papier ---------- */
  const find = (id) => (nodes.get(id) || {}).e;

  const putCard = () => {
    const e = find(sel);
    if (!e) return;
    const a = e.slot * 2.4, r = e.slot ? SPREAD * Math.sqrt(e.slot) : 0, u = 1 / scale();
    const p = toWrap(e.ux + Math.cos(a) * r * u, e.uy + Math.sin(a) * r * u);
    const W = wrap.clientWidth, H = wrap.clientHeight, cw = card.offsetWidth, ch = card.offsetHeight;
    let left = p[0] + 20;
    if (left + cw > W - 12) left = p[0] - 20 - cw;
    card.style.left = clamp(left, 12, Math.max(12, W - cw - 12)) + "px";
    card.style.top = clamp(p[1] - 24, 12, Math.max(12, H - ch - 12)) + "px";
  };

  const posOf = (e, u) => {
    const a = e.slot * 2.4, r = e.slot ? SPREAD * Math.sqrt(e.slot) : 0;
    return [e.ux + Math.cos(a) * r * u, e.uy + Math.sin(a) * r * u];
  };
  // les pastilles posées à moins de 16 px de celle-ci
  const neighbours = (e) => {
    const u = 1 / scale(), p = posOf(e, u), reach = 16 * u, out = [];
    nodes.forEach((n) => {
      if (!n.e || n.inCl || n.hide) return;
      const q = posOf(n.e, u);
      if (Math.hypot(q[0] - p[0], q[1] - p[1]) < reach) out.push(n.e);
    });
    return out.sort((a, b) => b.ms - a.ms);
  };

  const openCard = (id, fly) => {
    if (sel && sel !== id) mark(sel, false);
    sel = id;
    const e = find(id);
    mark(id, true);
    $("#cCat").innerHTML = glyph(e.cat) + CATS[e.cat].label;
    $("#cPlace").textContent = e.sat
      ? "Chaleur détectée par satellite"
      : e.prec === "dep"
        ? e.place + " (département)"
        : e.place + (e.dep ? " (" + e.dep + ")" : "");
    $("#cWhen").textContent =
      new Date(e.ms).toLocaleString("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) +
      " · " + ago(Date.now() - e.ms) +
      (e.items.length > 1 ? " · " + e.items.length + " articles" : "");
    $("#cItems").innerHTML = e.items
      .slice(0, 6)
      .map((i) => `<li><a href="${esc(i.link)}" target="_blank" rel="noopener">${esc(i.title)}</a><span>${esc(i.source)}</span></li>`)
      .join("");
    const also = e.also && e.also.length ? "Aussi dans : " + e.also.slice(0, 12).join(", ") + (e.also.length > 12 ? " et " + (e.also.length - 12) + " autres" : "") : "";
    $("#cAlso").textContent = also;
    $("#cAlso").hidden = !also;
    const near = neighbours(e);
    $("#cPileBox").hidden = near.length < 2;
    $("#cPile").innerHTML = near
      .slice(0, 10)
      .map((x) => `<li><button type="button" data-id="${x.id}"${x.id === e.id ? ' aria-current="true"' : ""}>${esc(x.sat ? "satellite" : x.place)} · ${esc(x.items[0].title)}</button></li>`)
      .join("");
    const shot = $("#cShot");
    const first = e.items.find((i) => i.img === e.pic) || e.items[0];
    shot.hidden = !e.pic;
    if (e.pic) {
      $("#cImg").src = e.pic;
      shot.href = first.link;
    }
    card.hidden = false;
    if (fly) {
      const a = e.slot * 2.4, r = e.slot ? SPREAD * Math.sqrt(e.slot) : 0, u = 1 / scale();
      flyTo(e.ux + Math.cos(a) * r * u, e.uy + Math.sin(a) * r * u, Math.min(vb.w, 380));
      if (matchMedia("(max-width: 820px)").matches) wrap.scrollIntoView({ block: "nearest", behavior: calm ? "auto" : "smooth" });
    }
    syncHash();
    place();
  };

  function closeCard() {
    const had = sel;
    if (sel) mark(sel, false);
    sel = null;
    card.hidden = true;
    if (had) { syncHash(); place(); }
  }

  // un clic sur une bulle : la carte s'approche de ce qu'elle contient
  const expand = (i) => {
    const g = groups[i];
    if (!g) return;
    const xs = g.m.map((e) => e.ux), ys = g.m.map((e) => e.uy);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const w = Math.min(vb.w * 0.55, Math.max(110, (x1 - x0) * 2.4, (y1 - y0) * 2.4 * (F.w / F.h)));
    flyTo((x0 + x1) / 2, (y0 + y1) / 2, w);
  };

  // un clic sur un département : la liste et la carte ne gardent que lui. Un second clic le relâche.
  const pickDep = (k) => {
    stopReplay();
    depSel = depSel === k ? "" : k;
    render();
    syncHash();
    if (depSel) {
      const b = depBox.get(k);
      flyTo((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, Math.max(b.x1 - b.x0, (b.y1 - b.y0) * (F.w / F.h)) * 1.35);
    } else flyTo(F.w / 2, F.h / 2, F.w);
  };

  /* ---------- Les gestes sur la carte ---------- */
  const ptrs = new Map();
  let moved = false, downPt = null, downCl = -1, downDep = "", pinch = 0;

  svg.addEventListener("pointerdown", (e) => {
    svg.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 1) {
      moved = false;
      const t = e.target.closest(".pt");
      downPt = t ? t.dataset.id : null;
      const c = e.target.closest(".cl");
      downCl = c ? +c.dataset.i : -1;
      const d = e.target.closest("#deps path");
      downDep = d ? d.dataset.k : "";
    }
    if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      pinch = Math.hypot(a.x - b.x, a.y - b.y);
    }
  });

  svg.addEventListener("pointermove", (e) => {
    const p = ptrs.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (ptrs.size === 1) {
      if (!moved && Math.hypot(dx, dy) < 3) return;
      moved = true;
      svg.classList.add("drag");
      const s = scale();
      vb.x -= dx / s;
      vb.y -= dy / s;
      setView();
    } else if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch) zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / pinch);
      pinch = d;
      moved = true;
    }
  });

  const up = (e) => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.delete(e.pointerId);
    svg.classList.remove("drag");
    pinch = 0;
    if (!ptrs.size && !moved && e.type === "pointerup") {
      if (downPt) openCard(downPt, false);
      else if (downCl >= 0) expand(downCl);
      else if (downDep) { closeCard(); pickDep(downDep); }
      else closeCard();
    }
  };
  svg.addEventListener("pointerup", up);
  svg.addEventListener("pointercancel", up);

  svg.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015));
    },
    { passive: false },
  );

  const legend = $("#legend");
  const LEGEND = legend.textContent;
  const info = (text) => {
    legend.textContent = text || LEGEND;
    legend.classList.toggle("hov", !!text);
  };
  const describe = (e) =>
    (e.sat ? "satellite" : e.place + (e.prec === "dep" ? " (département)" : "")) + " · " + CATS[e.cat].label + " · " + ago(Date.now() - e.ms) + " · " + e.items[0].title.slice(0, 120);
  const hot = (id, on) => {
    const n = nodes.get(id);
    if (!n) return;
    n.g.classList.toggle("hot", on);
    if (n.row) n.row.classList.toggle("hot", on);
    info(on ? describe(n.e) : "");
  };
  svg.addEventListener("pointerover", (e) => {
    const t = e.target.closest(".pt");
    if (t && !ptrs.size) hot(t.dataset.id, true);
    const c = e.target.closest(".cl");
    if (c && !ptrs.size && groups[+c.dataset.i]) {
      const m = groups[+c.dataset.i].m, by = {};
      m.forEach((x) => (by[x.cat] = (by[x.cat] || 0) + 1));
      info(m.length + " événements : " + Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, v]) => v + " " + CATS[k].label).join(", ") + " · cliquer pour zoomer");
    }
  });
  svg.addEventListener("pointerout", (e) => {
    const t = e.target.closest(".pt");
    if (t) hot(t.dataset.id, false);
    if (e.target.closest(".cl")) info("");
  });
  list.addEventListener("pointerover", (e) => {
    const r = e.target.closest(".row");
    if (r) hot(r.dataset.id, true);
  });
  list.addEventListener("pointerout", (e) => {
    const r = e.target.closest(".row");
    if (r) hot(r.dataset.id, false);
  });
  list.addEventListener("focusin", (e) => {
    const r = e.target.closest(".row");
    if (r) hot(r.dataset.id, true);
  });
  list.addEventListener("focusout", (e) => {
    const r = e.target.closest(".row");
    if (r) hot(r.dataset.id, false);
  });
  list.addEventListener(
    "error",
    (ev) => {
      if (ev.target.classList && ev.target.classList.contains("thumb")) ev.target.style.visibility = "hidden";
    },
    true,
  );
  list.addEventListener("click", (e) => {
    if (e.target.closest("#moreRows")) {
      const before = listN;
      listN = Math.min(LIST_MAX, listN + 30);
      renderList(Date.now());
      const next = list.querySelectorAll(".row")[before];
      if (next) next.focus();
      return;
    }
    const r = e.target.closest(".row");
    if (r) openCard(r.dataset.id, true);
  });
  // liens d'évitement : la carte, sans passer par toute la liste
  ["#skipMap", "#skipList"].forEach((s) =>
    $(s).addEventListener("click", (e) => {
      e.preventDefault();
      $("#zin").focus();
    }),
  );

  $("#cClose").addEventListener("click", closeCard);
  $("#cPile").addEventListener("click", (ev) => {
    const b = ev.target.closest("button");
    if (b && b.dataset.id !== sel) openCard(b.dataset.id, false);
  });
  $("#cImg").addEventListener("error", () => { $("#cShot").hidden = true; putCard(); });
  $("#cImg").addEventListener("load", putCard);
  const tb = $("#tidy");
  const showTidy = () => {
    tb.setAttribute("aria-pressed", tidy);
    tb.textContent = tidy ? "désordre" : "ranger";
    document.body.classList.toggle("tidy", tidy);
  };
  showTidy();
  tb.addEventListener("click", () => {
    tidy = !tidy;
    showTidy();
    save();
    place();
  });
  const zimg = $("#zimg");
  zimg.setAttribute("aria-pressed", !document.body.classList.contains("shapes"));
  zimg.addEventListener("click", () => {
    const on = document.body.classList.toggle("shapes");
    zimg.setAttribute("aria-pressed", !on);
    save();
    stopReplay();
    render();
  });
  const zfull = $("#zfull");
  const setFull = (on) => {
    document.body.classList.toggle("mapfull", on);
    zfull.setAttribute("aria-pressed", on);
    zfull.textContent = on ? "×" : "⤢";
    zfull.setAttribute("aria-label", on ? "Quitter le plein écran" : "Carte en plein écran");
    setTimeout(place, 60);
  };
  zfull.addEventListener("click", () => setFull(!document.body.classList.contains("mapfull")));
  addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!card.hidden) closeCard();
    else if (document.body.classList.contains("mapfull")) setFull(false);
  });

  // la recherche, le département, la fenêtre « i » et le lien
  const qi = $("#q");
  qi.value = q;
  qi.addEventListener("input", () => {
    stopReplay();
    q = qi.value.trim();
    render();
    syncHash();
  });
  $("#depClear").addEventListener("click", () => pickDep(depSel));
  const about = $("#about");
  $("#info").addEventListener("click", () => (about.showModal ? about.showModal() : about.setAttribute("open", "")));
  $("#aClose").addEventListener("click", () => (about.close ? about.close() : about.removeAttribute("open")));
  about.addEventListener("click", (e) => { if (e.target === about && about.close) about.close(); });
  $("#share").addEventListener("click", async () => {
    const b = $("#share");
    try {
      await navigator.clipboard.writeText(location.href);
      b.textContent = "copié";
    } catch (e) {
      b.textContent = "dans la barre";
    }
    setTimeout(() => (b.textContent = "lien"), 1800);
  });
  const mid = () => {
    const r = box();
    return [r.left + r.width / 2, r.top + r.height / 2];
  };
  $("#zin").addEventListener("click", () => zoomAt(...mid(), 1.7));
  $("#zout").addEventListener("click", () => zoomAt(...mid(), 1 / 1.7));
  $("#zreset").addEventListener("click", () => flyTo(F.w / 2, F.h / 2, F.w));
  // la taille de la carte change : on relit son rectangle et on replace tout
  if (window.ResizeObserver) {
    new ResizeObserver(() => { rectCache = null; place(); }).observe(svg);
  } else {
    addEventListener("resize", () => { rectCache = null; place(); });
  }

  /* ---------- Le rejeu ---------- */
  let replaying = 0;
  const stopReplay = () => {
    if (!replaying) return;
    cancelAnimationFrame(replaying);
    replaying = 0;
    nodes.forEach((n) => { n.g.style.visibility = ""; n.g.classList.remove("pop"); n.hide = false; });
    $("#replay").setAttribute("aria-pressed", "false");
    $("#replay").textContent = "▶ rejouer";
    render();
  };
  const replay = () => {
    if (replaying) return stopReplay();
    if (!shown.length) return;
    closeCard();
    const seq = [...shown].sort((a, b) => a.ms - b.ms);
    const from = seq[0].ms, span = Math.max(1, Date.now() - from);
    const dur = calm ? 1 : clamp(3500 + seq.length * 90, 5000, 16000);
    let shownN = 0;
    nodes.forEach((n) => { n.g.style.visibility = "hidden"; n.hide = true; });
    heat([]);
    place();
    $("#replay").setAttribute("aria-pressed", "true");
    $("#replay").textContent = "■ stop";
    const t0 = performance.now();
    const step = (t) => {
      const p = Math.min(1, (t - t0) / dur), virtual = from + p * span, before = shownN;
      while (shownN < seq.length && seq[shownN].ms <= virtual) {
        const n = nodes.get(seq[shownN].id);
        if (n) {
          n.g.style.visibility = "";
          n.hide = false;
          if (!calm) {
            n.g.classList.add("pop");
            n.g.insertAdjacentHTML("beforeend", '<circle class="shock" r="14"/>');
            setTimeout(() => {
              n.g.classList.remove("pop");
              const s = n.g.querySelector(".shock");
              if (s) s.remove();
            }, 1300);
          }
        }
        shownN++;
      }
      if (shownN !== before) { heat(seq.slice(0, shownN)); place(); }
      $("#total").textContent = shownN;
      $("#unit").textContent = new Date(virtual).toLocaleString("fr-FR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
      if (p < 1) replaying = requestAnimationFrame(step);
      else setTimeout(stopReplay, 1400);
    };
    replaying = requestAnimationFrame(step);
  };
  $("#replay").addEventListener("click", replay);

  /* ---------- Les filtres ---------- */
  $("#cats").innerHTML = Object.keys(CATS)
    .map((c) => `<button class="cat" type="button" data-cat="${c}" aria-pressed="true">${glyph(c)}${CATS[c].label} <span class="n">0</span></button>`)
    .join("") + '<button class="cat" type="button" id="depToggle" data-x="dep" aria-pressed="true" title="Les points placés au centre d\'un département, quand le titre ne cite pas de commune">≈ au département <span class="n">0</span></button>';
  $("#cats").addEventListener("click", (e) => {
    const b = e.target.closest(".cat");
    if (!b) return;
    if (b.dataset.x) {
      stopReplay();
      showDep = !showDep;
      save();
      render();
      return;
    }
    const c = b.dataset.cat;
    stopReplay();
    if (active.has(c)) active.delete(c);
    else active.add(c);
    save();
    render();
  });
  $("#periods").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    stopReplay();
    days = +b.dataset.days;
    save();
    render();
  });

  /* ---------- Démarrage ---------- */
  const stamp = () => {
    const el = $("#stamp");
    if (!generated) {
      el.textContent = "";
      $("#fresh").textContent = "";
      return;
    }
    const age = Date.now() - generated;
    el.textContent = "données " + ago(age) + (age > 6 * HOUR ? " (pas de mise à jour récente)" : "");
    $("#fresh").textContent = "· " + ago(age) + (age > 6 * HOUR ? " : pas de mise à jour récente" : "");
  };

  const load = async () => {
    const got = await Promise.allSettled(URLS.map((u) => fetch(u, { cache: "no-cache" }).then((r) => (r.ok ? r.json() : Promise.reject()))));
    const best = got
      .filter((g) => g.status === "fulfilled" && g.value && Array.isArray(g.value.events))
      .map((g) => g.value)
      .sort((a, b) => new Date(b.generated) - new Date(a.generated))[0];
    const first = !loaded;
    loaded = true;
    if (best && new Date(best.generated).getTime() !== generated) {
      events = best.events;
      generated = new Date(best.generated).getTime();
      stopReplay();
      prepare();
      render();
      setView();
      if (hashEvent) {
        const id = hashEvent;
        hashEvent = "";
        if (nodes.has(id)) openCard(id, true);
      }
    } else if (first) render();
    stamp();
  };

  /* ---------- La visite guidée ----------
     Trois bulles à la première visite : les formes, la période, puis un événement de la liste. */

  const tour = $("#tour"), tText = $("#tText"), tStep = $("#tStep"), tFx = $("#tourfx"), tRing = $("#tRing"), tArrow = $("#tArrow");
  const SEEN = KEY + "-vu";
  let tourStep = -1, tourLoopOn = false;
  const TOUR = [
    { text: "Chaque forme est un type d'événement rapporté par la presse : incendie, intempérie, accident, mobilisation, violence, panne. Un contour rose date de moins de 3 h.", el: () => $("#cats") },
    { text: "Choisis la période : les dernières 24 h, 7 jours ou 30 jours.", el: () => $("#periods") },
    { text: "Clique une pastille ou une ligne pour lire l'article, une bulle pour zoomer, un département pour ne voir que lui. « ranger » regroupe tout en bulles.", el: () => $(".row") || $("#list") },
  ];
  const tourShow = () => {
    tour.hidden = tourStep < 0;
    tFx.toggleAttribute("hidden", tourStep < 0);
    if (tourStep < 0) return;
    closeCard();
    tStep.textContent = "visite " + (tourStep + 1) + " / " + TOUR.length;
    tText.textContent = TOUR[tourStep].text;
    $("#tNext").textContent = tourStep === TOUR.length - 1 ? "compris" : "suivant";
    if (!calm) tour.animate([{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], { duration: 320, easing: "ease-out" });
    if (!tourLoopOn) { tourLoopOn = true; requestAnimationFrame(tourLoop); }
  };
  const tourEnd = () => {
    tourStep = -1;
    try { localStorage.setItem(SEEN, "1"); } catch (e) { /* on s'en passe */ }
    tourShow();
  };
  const tourGo = (n) => { if (tourStep < 0) return; if (n >= TOUR.length) { tourEnd(); return; } tourStep = n; tourShow(); };
  // la bulle, le cadre et la flèche suivent la cible (la liste défile, la fenêtre change de taille)
  const tourTick = () => {
    const target = TOUR[tourStep].el();
    if (!target) return;
    const T = target.getBoundingClientRect(), W = innerWidth, H = innerHeight, pad = 8;
    const bw = tour.offsetWidth, bh = tour.offsetHeight, cx = (T.left + T.right) / 2, cy = (T.top + T.bottom) / 2;
    // à droite de la cible quand il y a la place, sinon dessous ou dessus
    let left, top;
    if (T.right + pad + 56 + bw < W - 12) { left = T.right + pad + 56; top = clamp(cy - bh / 2, 12, H - bh - 12); }
    else { left = clamp(cx - bw / 2, 12, W - bw - 12); top = clamp(cy < H / 2 ? T.bottom + pad + 48 : T.top - pad - 48 - bh, 12, H - bh - 12); }
    tour.style.left = left + "px";
    tour.style.top = top + "px";
    tFx.setAttribute("viewBox", "0 0 " + W + " " + H);
    tRing.setAttribute("x", T.left - pad); tRing.setAttribute("y", T.top - pad);
    tRing.setAttribute("width", T.width + pad * 2); tRing.setAttribute("height", T.height + pad * 2);
    const sx = clamp(cx, left, left + bw), sy = clamp(cy, top, top + bh);
    const ex = clamp(sx, T.left - pad, T.right + pad), ey = clamp(sy, T.top - pad, T.bottom + pad);
    const a = Math.atan2(ey - sy, ex - sx);
    tArrow.setAttribute("d", "M" + sx + " " + sy + "L" + ex + " " + ey +
      "L" + (ex - Math.cos(a - 0.45) * 13) + " " + (ey - Math.sin(a - 0.45) * 13) +
      "L" + (ex - Math.cos(a + 0.45) * 13) + " " + (ey - Math.sin(a + 0.45) * 13) + "L" + ex + " " + ey);
  };
  function tourLoop() {
    if (tourStep < 0) { tourLoopOn = false; return; }
    tourTick();
    requestAnimationFrame(tourLoop);
  }
  $("#tNext").addEventListener("click", () => tourGo(tourStep + 1));
  $("#tSkip").addEventListener("click", tourEnd);
  $("#help").addEventListener("click", () => { tourStep = 0; tourShow(); });
  let seenTour = false;
  try { seenTour = localStorage.getItem(SEEN) === "1"; } catch (e) { /* on s'en passe */ }

  render();
  setView();
  load();
  if (!seenTour) { tourStep = 0; tourShow(); }
  // les couleurs d'âge se rafraîchissent toutes les 5 min, les données toutes les 15 min
  setInterval(() => {
    stamp();
    if (!replaying) render();
  }, 5 * 60 * 1000);
  setInterval(load, 15 * 60 * 1000);
})();
