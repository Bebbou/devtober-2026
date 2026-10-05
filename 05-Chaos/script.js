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
  };
  const HOUR = 3600e3;
  const DAY = 24 * HOUR;
  const LIST_MAX = 120;

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
  const nodes = new Map(); // id -> { g, row, e }
  const vb = { x: 0, y: 0, w: F.w, h: F.h };

  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "{}");
    if ([1, 7, 30].includes(saved.days)) days = saved.days;
    if (Array.isArray(saved.cats)) active = new Set(saved.cats.filter((c) => CATS[c]));
  } catch (e) {
    /* on s'en passe */
  }
  const save = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ days, cats: [...active] }));
    } catch (e) {
      /* on s'en passe */
    }
  };

  /* ---------- Le fond de carte ---------- */
  gDeps.innerHTML = F.deps.map((d) => `<path d="${d.d}"><title>${d.n}</title></path>`).join("");

  const proj = (lon, lat) => [(lon - F.lon0) * F.cos * F.k, (F.lat1 - lat) * F.k];
  const box = () => svg.getBoundingClientRect();
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

  const setView = () => {
    vb.w = clamp(vb.w, 90, F.w);
    vb.h = (vb.w * F.h) / F.w;
    vb.x = clamp(vb.x, -60, F.w - vb.w + 60);
    vb.y = clamp(vb.y, -60, F.h - vb.h + 60);
    svg.setAttribute("viewBox", [vb.x, vb.y, vb.w, vb.h].map((n) => +n.toFixed(2)).join(" "));
    place();
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
      const k = e.lat + "|" + e.lon;
      e.slot = slots.get(k) || 0;
      slots.set(k, e.slot + 1);
    });
  };

  /* ---------- Les points et la liste ---------- */
  const glyph = (c) => '<svg viewBox="-8 -8 16 16" aria-hidden="true" class="gl">' + CATS[c].g.replace(/ class="(g|o)"/, ' class="$1"') + "</svg>";

  const render = () => {
    const now = Date.now();
    const inPeriod = events.filter((e) => e.inside && now - e.ms <= days * DAY);
    const counts = {};
    inPeriod.forEach((e) => (counts[e.cat] = (counts[e.cat] || 0) + 1));
    document.querySelectorAll(".cat").forEach((b) => {
      b.setAttribute("aria-pressed", active.has(b.dataset.cat));
      b.querySelector(".n").textContent = counts[b.dataset.cat] || 0;
    });
    document.querySelectorAll("#periods button").forEach((b) => b.setAttribute("aria-pressed", +b.dataset.days === days));

    shown = inPeriod.filter((e) => active.has(e.cat)).sort((a, b) => b.ms - a.ms);
    $("#total").textContent = shown.length;
    $("#unit").textContent = (shown.length === 1 ? "événement" : "événements") + " sur " + (days === 1 ? "24 h" : days + " jours");

    nodes.clear();
    // les plus anciens d'abord : les récents restent au-dessus
    gPts.innerHTML = [...shown]
      .reverse()
      .map((e) => {
        const n = Math.min(e.items.length - 1, 6);
        return (
          `<g class="pt" data-id="${e.id}" data-age="${level(now - e.ms)}" data-n="${n}" aria-hidden="true">` +
          '<circle class="hit" r="13"/><circle class="pulse" r="8"/><circle class="ring" r="11"/>' +
          CATS[e.cat].g +
          "</g>"
        );
      })
      .join("");
    gPts.querySelectorAll(".pt").forEach((g) => nodes.set(g.dataset.id, { g }));

    list.innerHTML = shown
      .slice(0, LIST_MAX)
      .map((e) => {
        const age = now - e.ms;
        const where = e.place || "Détection satellite";
        return (
          `<li><button class="row" type="button" data-id="${e.id}">` +
          glyph(e.cat) +
          `<span class="place">${esc(where)}</span>` +
          `<span class="age${age < 3 * HOUR ? " live" : ""}">${ago(age)}</span>` +
          `<span class="title">${esc(e.items[0].title)}</span></button></li>`
        );
      })
      .join("");
    if (shown.length > LIST_MAX) list.insertAdjacentHTML("beforeend", `<li class="more">et ${shown.length - LIST_MAX} autres sur la carte</li>`);
    list.querySelectorAll(".row").forEach((r) => {
      const n = nodes.get(r.dataset.id);
      if (n) n.row = r;
    });

    const empty = $("#empty");
    empty.hidden = shown.length > 0;
    if (!shown.length) empty.textContent = events.length ? "Rien dans cette période avec ces catégories." : "Les données ne sont pas encore publiées.";

    if (sel && !nodes.has(sel)) closeCard();
    else if (sel) mark(sel, true);
    place();
  };

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

  // taille constante à l'écran : on convertit les pixels en unités de la carte
  const place = () => {
    const u = 1 / scale();
    const byId = new Map(shown.map((e) => [e.id, e]));
    nodes.forEach((n, id) => {
      const e = byId.get(id);
      if (!e) return;
      // plusieurs faits dans la même commune : on les écarte en spirale
      const a = e.slot * 2.4, r = e.slot ? 9 * Math.sqrt(e.slot) : 0;
      const s = u * (1 + 0.1 * +n.g.dataset.n);
      n.g.setAttribute("transform", `translate(${(e.ux + Math.cos(a) * r * u).toFixed(2)} ${(e.uy + Math.sin(a) * r * u).toFixed(2)}) scale(${s.toFixed(4)})`);
    });
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
  const find = (id) => events.find((e) => e.id === id);

  const putCard = () => {
    const e = find(sel);
    if (!e) return;
    const a = e.slot * 2.4, r = e.slot ? 9 * Math.sqrt(e.slot) : 0, u = 1 / scale();
    const p = toWrap(e.ux + Math.cos(a) * r * u, e.uy + Math.sin(a) * r * u);
    const W = wrap.clientWidth, H = wrap.clientHeight, cw = card.offsetWidth, ch = card.offsetHeight;
    let left = p[0] + 20;
    if (left + cw > W - 12) left = p[0] - 20 - cw;
    card.style.left = clamp(left, 12, Math.max(12, W - cw - 12)) + "px";
    card.style.top = clamp(p[1] - 24, 12, Math.max(12, H - ch - 12)) + "px";
  };

  const openCard = (id, fly) => {
    if (sel && sel !== id) mark(sel, false);
    sel = id;
    const e = find(id);
    mark(id, true);
    $("#cCat").textContent = CATS[e.cat].label;
    $("#cPlace").textContent = e.place ? e.place + (e.dep ? " (" + e.dep + ")" : "") : "Chaleur détectée par satellite";
    $("#cWhen").textContent =
      new Date(e.ms).toLocaleString("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) + " · " + ago(Date.now() - e.ms);
    $("#cItems").innerHTML = e.items
      .slice(0, 6)
      .map((i) => `<li><a href="${esc(i.link)}" target="_blank" rel="noopener">${esc(i.title)}</a><span>${esc(i.source)}</span></li>`)
      .join("");
    card.hidden = false;
    if (fly) {
      const a = e.slot * 2.4, r = e.slot ? 9 * Math.sqrt(e.slot) : 0, u = 1 / scale();
      flyTo(e.ux + Math.cos(a) * r * u, e.uy + Math.sin(a) * r * u, Math.min(vb.w, 380));
      if (matchMedia("(max-width: 820px)").matches) wrap.scrollIntoView({ block: "nearest", behavior: calm ? "auto" : "smooth" });
    }
    putCard();
  };

  function closeCard() {
    if (sel) mark(sel, false);
    sel = null;
    card.hidden = true;
  }

  /* ---------- Les gestes sur la carte ---------- */
  const ptrs = new Map();
  let moved = false, downPt = null, pinch = 0;

  svg.addEventListener("pointerdown", (e) => {
    svg.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 1) {
      moved = false;
      const t = e.target.closest(".pt");
      downPt = t ? t.dataset.id : null;
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

  const hot = (id, on) => {
    const n = nodes.get(id);
    if (!n) return;
    n.g.classList.toggle("hot", on);
    if (n.row) n.row.classList.toggle("hot", on);
  };
  svg.addEventListener("pointerover", (e) => {
    const t = e.target.closest(".pt");
    if (t && !ptrs.size) hot(t.dataset.id, true);
  });
  svg.addEventListener("pointerout", (e) => {
    const t = e.target.closest(".pt");
    if (t) hot(t.dataset.id, false);
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
  list.addEventListener("click", (e) => {
    const r = e.target.closest(".row");
    if (r) openCard(r.dataset.id, true);
  });

  $("#cClose").addEventListener("click", closeCard);
  addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeCard();
  });
  const mid = () => {
    const r = box();
    return [r.left + r.width / 2, r.top + r.height / 2];
  };
  $("#zin").addEventListener("click", () => zoomAt(...mid(), 1.7));
  $("#zout").addEventListener("click", () => zoomAt(...mid(), 1 / 1.7));
  $("#zreset").addEventListener("click", () => flyTo(F.w / 2, F.h / 2, F.w));
  addEventListener("resize", place);

  /* ---------- Les filtres ---------- */
  $("#cats").innerHTML = Object.keys(CATS)
    .map((c) => `<button class="cat" type="button" data-cat="${c}" aria-pressed="true">${glyph(c)}${CATS[c].label} <span class="n">0</span></button>`)
    .join("");
  $("#cats").addEventListener("click", (e) => {
    const b = e.target.closest(".cat");
    if (!b) return;
    const c = b.dataset.cat;
    if (active.has(c)) active.delete(c);
    else active.add(c);
    save();
    render();
  });
  $("#periods").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    days = +b.dataset.days;
    save();
    render();
  });

  /* ---------- Démarrage ---------- */
  const stamp = () => {
    const el = $("#stamp");
    if (!generated) return (el.textContent = "");
    const age = Date.now() - generated;
    el.textContent = "données " + ago(age) + (age > 6 * HOUR ? " (pas de mise à jour récente)" : "");
  };

  const load = async () => {
    const got = await Promise.allSettled(URLS.map((u) => fetch(u, { cache: "no-cache" }).then((r) => (r.ok ? r.json() : Promise.reject()))));
    const best = got
      .filter((g) => g.status === "fulfilled" && g.value && Array.isArray(g.value.events))
      .map((g) => g.value)
      .sort((a, b) => new Date(b.generated) - new Date(a.generated))[0];
    if (best) {
      events = best.events;
      generated = new Date(best.generated).getTime();
    }
    prepare();
    stamp();
    render();
    setView();
  };

  /* ---------- La visite guidée ----------
     Trois bulles à la première visite : les formes, la période, puis un événement de la liste. */

  const tour = $("#tour"), tText = $("#tText"), tStep = $("#tStep"), tFx = $("#tourfx"), tRing = $("#tRing"), tArrow = $("#tArrow");
  const SEEN = KEY + "-vu";
  let tourStep = -1, tourLoopOn = false;
  const TOUR = [
    { text: "Chaque forme est un type d'événement rapporté par la presse : incendie, intempérie, accident, mobilisation, violence. Un point rose date de moins de 3 h.", el: () => $("#cats") },
    { text: "Choisis la période : les dernières 24 h, 7 jours ou 30 jours.", el: () => $("#periods") },
    { text: "Clique une ligne de la liste ou un point : la carte s'approche et le titre s'ouvre, avec un lien vers l'article.", el: () => $(".row") || $("#list") },
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
  setInterval(() => {
    stamp();
    render();
  }, 5 * 60 * 1000);
})();
