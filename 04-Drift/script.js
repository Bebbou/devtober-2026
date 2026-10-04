(function () {
  "use strict";

  const $ = (s) => document.querySelector(s);

  // true si la personne préfère éviter les animations : l'eau ne dérive plus toute seule
  const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const stage = $("#stage");
  const cv = $("#cv");
  const hint = $("#hint");
  const over = $("#over");
  const og = over.getContext("2d");
  const statusEl = $("#status");
  let cssW = 1, cssH = 1; // la taille de la scène en pixels CSS

  const gl = cv.getContext("webgl2", { alpha: false, antialias: false });
  if (!gl || !gl.getExtension("EXT_color_buffer_float")) {
    hint.textContent = "ton navigateur n'affiche pas WebGL 2, le jour 04 ne peut pas s'afficher";
    return;
  }
  gl.getExtension("OES_texture_float_linear");

  /* ---------- L'eau : une simulation de fluide sur le GPU ----------
     Deux champs : la vitesse de l'eau (basse résolution) et l'encre qu'elle emporte (haute résolution).
     À chaque image : l'eau est remuée, on rend son champ sans divergence (l'eau ne se comprime pas),
     puis la vitesse et l'encre sont emportées par la vitesse elle-même. */

  const VERT = `#version 300 es
    in vec2 aPos;
    uniform vec2 uTexel;
    out vec2 vUv, vL, vR, vT, vB;
    void main() {
      vUv = aPos * 0.5 + 0.5;
      vL = vUv - vec2(uTexel.x, 0.0); vR = vUv + vec2(uTexel.x, 0.0);
      vT = vUv + vec2(0.0, uTexel.y); vB = vUv - vec2(0.0, uTexel.y);
      gl_Position = vec4(aPos, 0.0, 1.0);
    }`;
  const HEAD = `#version 300 es
    precision highp float;
    precision highp sampler2D;
    in vec2 vUv, vL, vR, vT, vB;
    out vec4 o;`;

  const FRAGS = {
    // emporte une grandeur (la vitesse ou l'encre) le long de la vitesse
    advect: HEAD + `
      uniform sampler2D uVel, uSrc; uniform vec2 uTexel, uST; uniform float uDt, uDiss, uDissA, uSharp;
      void main() {
        vec2 back = vUv - uDt * texture(uVel, vUv).xy * uTexel;
        vec4 c = texture(uSrc, back);
        if (uSharp > 0.0) {
          // l'interpolation étale l'encre un peu à chaque image : on la raffermit pour que les lignes tiennent
          vec4 n1 = texture(uSrc, back + vec2(uST.x, 0.0)), n2 = texture(uSrc, back - vec2(uST.x, 0.0));
          vec4 n3 = texture(uSrc, back + vec2(0.0, uST.y)), n4 = texture(uSrc, back - vec2(0.0, uST.y));
          // sur l'intensité seulement : sinon chaque canal déborde de son côté et la teinte change
          float mc = max(c.r, c.g);
          float m1 = max(n1.r, n1.g), m2 = max(n2.r, n2.g), m3 = max(n3.r, n3.g), m4 = max(n4.r, n4.g);
          float ma = 0.25 * (m1 + m2 + m3 + m4);
          // on ne dépasse jamais le plus fort des voisins : on raffermit les bords sans fabriquer d'encre
          float target = clamp(mc + uSharp * (mc - ma), 0.0, max(mc, max(max(m1, m2), max(m3, m4))));
          c.rgb *= mc > 0.001 ? target / mc : 0.0;
        }
        o = vec4(uDiss * c.rgb, uDissA * c.a);
      }`,
    // une goutte de force (ou d'encre) qui s'étale en douceur
    splat: HEAD + `
      uniform sampler2D uTarget; uniform float uAspect, uRadius; uniform vec3 uColor; uniform vec2 uPoint;
      void main() {
        vec2 p = vUv - uPoint; p.x *= uAspect;
        vec4 base = texture(uTarget, vUv);
        o = vec4(base.rgb + exp(-dot(p, p) / uRadius) * uColor, base.a);
      }`,
    // le sillage d'une bouteille : il va dans le canal alpha, qui s'efface bien plus vite que l'encre
    wake: HEAD + `
      uniform sampler2D uTarget; uniform float uAspect, uRadius, uAmt; uniform vec2 uPoint;
      void main() {
        vec2 p = vUv - uPoint; p.x *= uAspect;
        vec4 base = texture(uTarget, vUv);
        o = vec4(base.rgb, min(base.a + exp(-dot(p, p) / uRadius) * uAmt, 1.2));
      }`,
    // une goutte de suminagashi : des anneaux concentriques d'encres qui alternent, séparés par de l'eau
    ring: HEAD + `
      uniform sampler2D uTarget; uniform float uAspect, uR; uniform vec3 uA, uB; uniform vec2 uPoint;
      void main() {
        vec2 p = vUv - uPoint; p.x *= uAspect;
        float k = length(p) / uR;
        vec4 base = texture(uTarget, vUv);
        if (k >= 1.0) { o = base; return; }
        // une ligne fine par anneau : deux blanches, puis une rose
        float s = k * 7.0, band = floor(s), f = fract(s);
        float w = smoothstep(0.05, 0.22, f) * (1.0 - smoothstep(0.38, 0.55, f));
        o = vec4(mix(base.rgb, mod(band, 3.0) < 2.0 ? uA : uB, w), base.a);
      }`,
    // un courant lent, sans divergence, qui fait dériver l'eau toute seule
    drift: HEAD + `
      uniform sampler2D uVel; uniform float uT, uAmp, uDt;
      void main() {
        vec2 q = vUv * vec2(1.6, 1.0);
        float a = 3.1 * q.x + 0.13 * uT, b = 2.3 * q.y - 0.11 * uT;
        float c = 5.7 * q.x - 0.2 * uT + 1.3, d = 4.9 * q.y + 0.17 * uT;
        // la vitesse est le rotationnel d'une fonction de courant : (dpsi/dy, -dpsi/dx)
        vec2 v = vec2(-2.3 * sin(a) * sin(b) + 0.5 * 4.9 * sin(c) * cos(d),
                      -(3.1 * cos(a) * cos(b) + 0.5 * 5.7 * cos(c) * sin(d)));
        o = vec4(texture(uVel, vUv).xy + uAmp * uDt * v, 0.0, 1.0);
      }`,
    divergence: HEAD + `
      uniform sampler2D uVel;
      void main() {
        float L = texture(uVel, vL).x, R = texture(uVel, vR).x, T = texture(uVel, vT).y, B = texture(uVel, vB).y;
        vec2 C = texture(uVel, vUv).xy;
        if (vL.x < 0.0) L = -C.x; if (vR.x > 1.0) R = -C.x; if (vT.y > 1.0) T = -C.y; if (vB.y < 0.0) B = -C.y;
        o = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0);
      }`,
    pressure: HEAD + `
      uniform sampler2D uP, uDiv;
      void main() {
        o = vec4((texture(uP, vL).x + texture(uP, vR).x + texture(uP, vB).x + texture(uP, vT).x - texture(uDiv, vUv).x) * 0.25, 0.0, 0.0, 1.0);
      }`,
    gradient: HEAD + `
      uniform sampler2D uP, uVel;
      void main() {
        vec2 v = texture(uVel, vUv).xy - vec2(texture(uP, vR).x - texture(uP, vL).x, texture(uP, vT).x - texture(uP, vB).x);
        o = vec4(v, 0.0, 1.0);
      }`,
    // l'encre sur l'eau noire, avec un grain de papier qui ne bouge pas
    display: HEAD + `
      uniform sampler2D uDye; uniform vec2 uRes;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main() {
        vec3 ink = texture(uDye, vUv).rgb;
        vec3 water = vec3(0.051) + (hash(floor(vUv * uRes)) - 0.5) * 0.012;
        // l'encre a un bord net : au-dessous d'une certaine densité, il n'y a plus que de l'eau
        float m = max(ink.r, ink.g);
        float a = smoothstep(0.85, 1.15, m);
        vec3 col = mix(water, ink / max(m, 0.001) * 0.92, a);
        // le sillage des bouteilles, en rose, par-dessus
        col = mix(col, vec3(1.0, 0.0, 0.333), smoothstep(0.3, 0.75, texture(uDye, vUv).a) * 0.95);
        o = vec4(col, 1.0);
      }`,
  };

  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const programs = {};
  Object.keys(FRAGS).forEach((name) => {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, FRAGS[name]));
    gl.bindAttribLocation(p, 0, "aPos");
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {};
    for (let i = 0, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i < n; i++) {
      const info = gl.getActiveUniform(p, i);
      u[info.name] = gl.getUniformLocation(p, info.name);
    }
    programs[name] = { p, u };
  });

  // un grand triangle qui couvre l'écran
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const makeTarget = (w, h, filter) => {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return { tex, fbo, w, h, texel: [1 / w, 1 / h] };
  };
  // deux cibles qu'on échange : on lit l'une, on écrit dans l'autre
  const makePair = (w, h, filter) => {
    const a = makeTarget(w, h, filter), b = makeTarget(w, h, filter);
    return { read: a, write: b, swap() { const t = this.read; this.read = this.write; this.write = t; } };
  };

  let vel, dye, pressure, divergence;
  let aspect = 1;

  const bind = (target) => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fbo : null);
    gl.viewport(0, 0, target ? target.w : cv.width, target ? target.h : cv.height);
  };
  const use = (name) => { gl.useProgram(programs[name].p); return programs[name].u; };
  const tex = (unit, target, loc) => {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, target.tex);
    gl.uniform1i(loc, unit);
  };
  const draw = () => gl.drawArrays(gl.TRIANGLES, 0, 3);

  const build = () => {
    const r = stage.getBoundingClientRect();
    const pr = Math.min(1.5, window.devicePixelRatio || 1);
    cv.width = Math.max(2, Math.round(r.width * pr));
    cv.height = Math.max(2, Math.round(r.height * pr));
    aspect = cv.width / cv.height;
    over.width = cv.width; over.height = cv.height;
    cssW = r.width; cssH = r.height;
    velBuf = null;
    const simH = 128, simW = Math.round(simH * aspect);
    const dyeH = Math.min(512, cv.height), dyeW = Math.round(dyeH * aspect);
    vel = makePair(simW, simH, gl.LINEAR);
    dye = makePair(dyeW, dyeH, gl.LINEAR);
    pressure = makePair(simW, simH, gl.NEAREST);
    divergence = makeTarget(simW, simH, gl.NEAREST);
  };

  /* ---------- Poser de l'encre, remuer l'eau ---------- */

  // plus d'encre que le seuil d'affichage n'en demande : une ligne étirée par l'eau reste visible plus longtemps
  const INK = { blanc: [2.6, 2.6, 2.6], rose: [3.0, 0.0, 1.0] };

  const stir = (x, y, dx, dy, radius) => {
    const u = use("splat");
    gl.uniform1f(u.uAspect, aspect);
    gl.uniform2f(u.uPoint, x, y);
    gl.uniform3f(u.uColor, dx, dy, 0);
    gl.uniform1f(u.uRadius, radius);
    gl.uniform2f(u.uTexel, vel.read.texel[0], vel.read.texel[1]);
    tex(0, vel.read, u.uTarget);
    bind(vel.write); draw(); vel.swap();
  };

  const drop = (x, y, size, firstPink) => {
    const u = use("ring");
    gl.uniform1f(u.uAspect, aspect);
    gl.uniform2f(u.uPoint, x, y);
    gl.uniform1f(u.uR, size);
    gl.uniform3fv(u.uA, firstPink ? INK.rose : INK.blanc);
    gl.uniform3fv(u.uB, firstPink ? INK.blanc : INK.rose);
    gl.uniform2f(u.uTexel, dye.read.texel[0], dye.read.texel[1]);
    tex(0, dye.read, u.uTarget);
    bind(dye.write); draw(); dye.swap();
    // la goutte repousse un peu l'eau autour d'elle
    stir(x, y, 0, 0, 0.0001);
  };

  /* ---------- Une image ---------- */

  const step = (dt, t) => {
    gl.bindVertexArray(vao);
    let u;
    if (!calm) {
      u = use("drift");
      gl.uniform2f(u.uTexel, vel.read.texel[0], vel.read.texel[1]);
      gl.uniform1f(u.uT, t); gl.uniform1f(u.uAmp, 9); gl.uniform1f(u.uDt, dt);
      tex(0, vel.read, u.uVel);
      bind(vel.write); draw(); vel.swap();
    }
    u = use("divergence");
    gl.uniform2f(u.uTexel, vel.read.texel[0], vel.read.texel[1]);
    tex(0, vel.read, u.uVel);
    bind(divergence); draw();

    // la pression qui rend l'eau incompressible : on itère jusqu'à ce qu'elle se calme
    u = use("pressure");
    gl.uniform2f(u.uTexel, vel.read.texel[0], vel.read.texel[1]);
    tex(1, divergence, u.uDiv);
    for (let i = 0; i < 12; i++) {
      tex(0, pressure.read, u.uP);
      bind(pressure.write); draw(); pressure.swap();
    }
    u = use("gradient");
    gl.uniform2f(u.uTexel, vel.read.texel[0], vel.read.texel[1]);
    tex(0, pressure.read, u.uP);
    tex(1, vel.read, u.uVel);
    bind(vel.write); draw(); vel.swap();

    // la vitesse s'emporte elle-même et s'amortit ; l'encre est emportée et pâlit très lentement
    u = use("advect");
    gl.uniform2f(u.uTexel, vel.read.texel[0], vel.read.texel[1]);
    gl.uniform1f(u.uDt, dt);
    tex(0, vel.read, u.uVel);
    tex(1, vel.read, u.uSrc);
    gl.uniform1f(u.uDiss, 1 / (1 + dt * 0.6));
    gl.uniform1f(u.uSharp, 0);
    gl.uniform1f(u.uDissA, 1);
    gl.uniform2f(u.uST, 0, 0);
    bind(vel.write); draw(); vel.swap();
    tex(1, dye.read, u.uSrc);
    gl.uniform1f(u.uDiss, Math.pow(0.94, dt));
    gl.uniform1f(u.uSharp, 0.4);
    gl.uniform1f(u.uDissA, Math.pow(0.6, dt)); // le sillage disparaît en quelques secondes
    gl.uniform2f(u.uST, dye.read.texel[0], dye.read.texel[1]);
    bind(dye.write); draw(); dye.swap();

    u = use("display");
    gl.uniform2f(u.uRes, cv.width, cv.height);
    tex(0, dye.read, u.uDye);
    bind(null); draw();
  };

  /* ---------- Les bouteilles ----------
     Une bouteille suit le courant : on lit la vitesse de l'eau (une image sur quatre) et on la lui applique.
     Elle laisse derrière elle un sillage d'encre rose. Un clic l'ouvre : c'est un papier avec un message. */

  const STORE = "devtober-drift-4";
  const MAX_READS = 5; // une bouteille coule à sa cinquième lecture
  const SEA_MIN = 6; // la mer garde au moins six bouteilles des autres
  const SEEDS = (window.DRIFT_MESSAGES || []).slice();
  const bottles = [];
  let mine = [];
  try {
    // chaque bouteille a son texte et la date où elle est partie (les anciennes, sans date, partent d'aujourd'hui)
    mine = JSON.parse(localStorage.getItem(STORE) || "[]")
      .map((s) => (typeof s === "string" ? { text: s, t: Date.now() } : s))
      .filter((s) => s && typeof s.text === "string").slice(0, 5);
  } catch (e) { mine = []; }
  let seen = false; // la première visite : une bouteille bat comme un cœur jusqu'à ce qu'on l'ouvre
  try { seen = localStorage.getItem(STORE + "-vu") === "1"; } catch (e) { /* on s'en passe */ }
  let hintTimer = 0;
  const flashHint = (text) => {
    hint.textContent = text;
    hint.classList.remove("off");
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => hint.classList.add("off"), 3500);
  };
  const saveMine = () => { try { localStorage.setItem(STORE, JSON.stringify(mine)); } catch (e) { /* on s'en passe */ } };

  let velBuf = null, velFrame = 0, hovered = null, opened = null, nextRelease = 0, nextGust = 20, shownCount = -1;
  const countEl = $("#count");

  const readVelocity = () => {
    const v = vel.read;
    if (!velBuf || velBuf.length !== v.w * v.h * 4) velBuf = new Float32Array(v.w * v.h * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, v.fbo);
    gl.readPixels(0, 0, v.w, v.h, gl.RGBA, gl.FLOAT, velBuf);
  };
  // la vitesse de l'eau à cet endroit, en largeurs et hauteurs d'écran par seconde
  const flowAt = (x, y) => {
    const v = vel.read;
    if (!velBuf) return [0, 0];
    const i = (Math.min(v.h - 1, Math.max(0, Math.floor(y * v.h))) * v.w + Math.min(v.w - 1, Math.max(0, Math.floor(x * v.w)))) * 4;
    return [velBuf[i] / v.w, velBuf[i + 1] / v.h];
  };

  const addBottle = (text, isMine, x, y, since) => {
    const b = {
      text, mine: isMine, since, x, y, a: Math.random() * 6.28, vx: 0, vy: 0, reads: 0, held: false, sink: 0, id: Math.random() * 100, age: 0, flash: 0,
      size: isMine ? 1.55 : 1.15 + Math.random() * 0.4, // les bouteilles ne sont pas toutes de la même taille
    };
    bottles.push(b);
    return b;
  };
  // une bouteille d'un inconnu arrive : d'un bord, ou n'importe où au départ
  const release = (anywhere) => {
    const free = SEEDS.filter((s) => !bottles.some((b) => b.text === s));
    if (!free.length) return;
    const side = Math.floor(Math.random() * 4), r = Math.random();
    const x = anywhere ? 0.12 + r * 0.76 : side === 0 ? 0.04 : side === 1 ? 0.96 : 0.1 + r * 0.8;
    const y = anywhere ? 0.2 + Math.random() * 0.6 : side === 2 ? 0.06 : side === 3 ? 0.94 : 0.15 + r * 0.7;
    addBottle(free[(Math.random() * free.length) | 0], false, x, y);
  };

  // le sillage : un peu d'encre rose posée derrière la bouteille
  const wake = (b, strength) => {
    const dx = Math.cos(b.a) * 46 / cssW, dy = -Math.sin(b.a) * 46 / cssH;
    const u = use("wake");
    gl.uniform1f(u.uAspect, aspect);
    gl.uniform2f(u.uPoint, b.x - dx, b.y - dy);
    gl.uniform1f(u.uAmt, 0.22 * strength);
    gl.uniform1f(u.uRadius, 0.00002);
    gl.uniform2f(u.uTexel, dye.read.texel[0], dye.read.texel[1]);
    tex(0, dye.read, u.uTarget);
    bind(dye.write); draw(); dye.swap();
  };

  const bottlesStep = (dt, t) => {
    if (velFrame++ % 6 === 0) readVelocity();
    tourTick();
    for (let i = bottles.length - 1; i >= 0; i--) {
      const b = bottles[i];
      b.age += dt;
      if (b.flash > 0) b.flash -= dt;
      if (b.sink > 0) { b.sink += dt; if (b.sink > 1.5) bottles.splice(i, 1); continue; }
      if (b.held) continue;
      const f = flowAt(b.x, b.y), k = Math.min(1, dt * 3);
      b.vx += (f[0] * 0.8 - b.vx) * k;
      b.vy += (f[1] * 0.8 - b.vy) * k;
      // près des bords, l'eau repousse doucement la bouteille vers le large
      const m = 0.07;
      b.vx += (Math.max(0, m - b.x) - Math.max(0, b.x - (1 - m))) * dt * 1.2;
      b.vy += (Math.max(0, m - b.y) - Math.max(0, b.y - (1 - m))) * dt * 1.2;
      bottles.forEach((o) => {
        if (o === b || o.sink) return;
        const dxp = (b.x - o.x) * cssW, dyp = (b.y - o.y) * cssH, d = Math.hypot(dxp, dyp), min = 52 * (b.size + o.size) / 2;
        if (d > 0.1 && d < min) {
          const push = 70 * (1 - d / min);
          b.vx += (dxp / d) * push / cssW * dt * 8;
          b.vy += (dyp / d) * push / cssH * dt * 8;
        }
      });
      const slow = b === hovered ? 0.12 : b.welcome && tourStep >= 0 ? 0.12 : 1; // sous le pointeur, ou pendant la visite, elle ralentit
      b.x += b.vx * dt * slow; b.y += b.vy * dt * slow;
      if (Math.hypot(b.vx * aspect, b.vy) > 0.004) {
        let d = Math.atan2(-b.vy, b.vx * aspect) - b.a;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        b.a += d * Math.min(1, dt * 2.5);
      }
      const sp = Math.hypot(b.vx * aspect, b.vy);
      if (sp > 0.006) wake(b, Math.min(1, sp / 0.03)); // une bouteille à l'arrêt ne laisse rien
    }
    // de temps en temps, un coup de vent traverse la mer et pousse tout dans la même direction
    if (!calm && t > nextGust) {
      const a = Math.random() * 6.28, dx = Math.cos(a), dy = Math.sin(a), x0 = 0.5 - dx * 0.4, y0 = 0.5 - dy * 0.4;
      for (let i = 0; i < 7; i++) stir(x0 + dx * i * 0.13, y0 + dy * i * 0.13, dx * 260, dy * 260, 0.006);
      nextGust = t + 28 + Math.random() * 22;
    }
    const n = bottles.filter((b) => !b.sink).length;
    if (n !== shownCount) {
      shownCount = n;
      countEl.textContent = n + (n > 1 ? " bouteilles" : " bouteille") + " à l'eau";
    }
    const sea = bottles.filter((b) => !b.mine && !b.sink).length;
    if (sea < SEA_MIN && t > nextRelease) { release(false); nextRelease = t + 4 + Math.random() * 5; }
  };

  const drawBottles = (t) => {
    const s = over.width / cssW;
    og.setTransform(1, 0, 0, 1, 0, 0);
    og.clearRect(0, 0, over.width, over.height);
    if (tourStep >= 0 && !tour.hidden) {
      const T = TOUR[tourStep].at(), l = tour.offsetLeft, tp = tour.offsetTop, w = tour.offsetWidth, h = tour.offsetHeight;
      const pulse = calm ? 0.5 : (Math.sin(t * 4) + 1) / 2;
      const R = (tourStep === 1 ? 46 : 38) + pulse * 10;
      og.save();
      og.setTransform(s, 0, 0, s, 0, 0);
      og.strokeStyle = "#ff0055"; og.fillStyle = "#ff0055"; og.lineWidth = 2; og.lineCap = "round";
      let ex = T.x, ey = T.top ? 0 : T.y;
      if (T.ring) { og.globalAlpha = 0.95 - pulse * 0.5; og.beginPath(); og.arc(ex, ey, R, 0, 6.2832); og.stroke(); }
      // la flèche part du bord de la bulle le plus proche et s'arrête avant la cible
      const sx = Math.min(Math.max(ex, l), l + w), sy = Math.min(Math.max(ey, tp), tp + h);
      const dx = ex - sx, dy = ey - sy, d = Math.hypot(dx, dy) || 1;
      const stop = T.top ? 0 : (T.ring ? R : 44);
      const ax = ex - (dx / d) * stop, ay = ey - (dy / d) * stop;
      og.globalAlpha = 0.95;
      og.beginPath(); og.moveTo(sx, sy); og.lineTo(ax, ay); og.stroke();
      const ang = Math.atan2(ay - sy, ax - sx);
      og.beginPath(); og.moveTo(ax, ay);
      og.lineTo(ax - Math.cos(ang - 0.45) * 12, ay - Math.sin(ang - 0.45) * 12);
      og.lineTo(ax - Math.cos(ang + 0.45) * 12, ay - Math.sin(ang + 0.45) * 12);
      og.closePath(); og.fill();
      og.restore();
    }
    if (opened && !paper.hidden) {
      const b = opened, bx = b.x * cssW, by = (1 - b.y) * cssH;
      const l = paper.offsetLeft, tp = paper.offsetTop, w = paper.offsetWidth, h = paper.offsetHeight;
      og.save();
      og.setTransform(s, 0, 0, s, 0, 0);
      og.globalAlpha = Math.min(1, (performance.now() - openedAt) / 300) * 0.85;
      og.strokeStyle = "#ff0055"; og.lineWidth = 1;
      og.beginPath(); og.moveTo(bx, by); og.lineTo(Math.min(Math.max(bx, l), l + w), Math.min(Math.max(by, tp), tp + h)); og.stroke();
      og.restore();
    }
    bottles.forEach((b) => {
      const k = b.sink ? Math.max(0, 1 - b.sink / 1.3) : 1;
      if (k <= 0) return;
      og.save();
      og.setTransform(s, 0, 0, s, 0, 0);
      og.translate(b.x * cssW, (1 - b.y) * cssH);
      if ((b.welcome && tourStep === 1) || b.flash > 0) { // l'accueil : un anneau rose qui bat autour de la première bouteille
        const p = calm ? 0.5 : (Math.sin(t * 3) + 1) / 2;
        og.save(); og.strokeStyle = "#ff0055"; og.globalAlpha = 0.85 - p * 0.55; og.lineWidth = 1.2;
        og.beginPath(); og.arc(0, 0, 30 + p * 10, 0, 6.2832); og.stroke(); og.restore();
      }
      og.rotate(b.a + (calm ? 0 : Math.sin(t * 1.3 + b.id) * 0.12));
      const pop = Math.min(1, b.age / 0.6); // elle apparaît en grandissant
      og.scale(k * b.size * (0.4 + 0.6 * pop), k * b.size * (0.4 + 0.6 * pop));
      og.globalAlpha = k * pop;
      og.lineWidth = 1.4; og.lineJoin = "round"; og.lineCap = "round";
      og.strokeStyle = b.mine ? "#ff0055" : b === hovered ? "#ffffff" : "#c8c8c8";
      og.fillStyle = "#0d0d0d";
      // le corps, le goulot, le bouchon : la bouteille regarde vers la droite avant la rotation
      og.beginPath();
      og.moveTo(-17, -6); og.lineTo(4, -6); og.quadraticCurveTo(8, -6, 9, -2.5); og.lineTo(15, -2.5);
      og.lineTo(15, 2.5); og.lineTo(9, 2.5); og.quadraticCurveTo(8, 6, 4, 6); og.lineTo(-17, 6);
      og.quadraticCurveTo(-19, 6, -19, 4); og.lineTo(-19, -4); og.quadraticCurveTo(-19, -6, -17, -6);
      og.closePath(); og.fill(); og.stroke();
      og.beginPath(); og.moveTo(-13, 0); og.lineTo(1, 0); og.stroke(); // le papier roulé dedans
      og.strokeStyle = "#ff0055"; og.beginPath(); og.moveTo(15, -2); og.lineTo(19, -2); og.lineTo(19, 2); og.lineTo(15, 2); og.stroke(); // le bouchon
      og.restore();
    });
  };

  const bottleAt = (e) => {
    const r = cv.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
    let best = null, bd = 100;
    bottles.forEach((b) => {
      if (b.sink) return;
      const reach = (e.pointerType === "touch" ? 34 : 24) * b.size; // la zone de clic suit la taille de la bouteille
      const d = Math.hypot(px - b.x * r.width, py - (1 - b.y) * r.height) - reach;
      if (d < 0 && d < bd) { bd = d; best = b; }
    });
    return best;
  };

  /* le papier : lire, remettre à l'eau, jeter */
  const paper = $("#paper"), pText = $("#pText"), pMeta = $("#pMeta"), pDel = $("#pDel");
  const ago = (ms) => {
    const m = Math.round(ms / 60000);
    if (m < 2) return "un instant";
    if (m < 90) return m + " minutes";
    const h = Math.round(m / 60);
    if (h < 36) return h + " heures";
    return Math.round(h / 24) + " jours";
  };
  let lastFocus = null;
  const giveBackFocus = () => { if (lastFocus && document.body.contains(lastFocus)) lastFocus.focus(); lastFocus = null; };
  const closePaper = () => {
    if (!opened) return;
    giveBackFocus();
    const b = opened;
    opened = null; paper.hidden = true; b.held = false;
    if (!b.mine && b.reads >= MAX_READS) { b.sink = 0.001; drop(b.x, b.y, 0.05, true); statusEl.textContent = "Cette bouteille a coulé."; flashHint("cette bouteille a coulé"); return; }
    stir(b.x, b.y, (Math.random() - 0.5) * 90, (Math.random() - 0.5) * 90, 0.002); // un coup d'eau pour la relancer
  };
  let openedAt = 0;
  const placePaper = (b) => {
    paper.classList.add("anchored");
    const pw = paper.offsetWidth, ph = paper.offsetHeight;
    const bx = b.x * cssW, by = (1 - b.y) * cssH, gap = 30 * b.size;
    const left = Math.min(cssW - pw - 12, Math.max(12, bx - pw / 2));
    // sous la bouteille si elle est dans le haut de l'écran, au-dessus sinon
    let top = by < cssH / 2 ? by + gap : by - gap - ph;
    top = Math.min(cssH - ph - 12, Math.max(12, top));
    paper.style.left = left + "px";
    paper.style.top = top + "px";
    openedAt = performance.now();
    if (calm) return;
    const dx = bx - (left + pw / 2), dy = by - (top + ph / 2);
    paper.animate(
      [
        { transform: "translate(" + dx + "px," + dy + "px) scale(0.12) rotate(-9deg)", opacity: 0, clipPath: "inset(-12px 42% -12px 42%)" },
        { transform: "rotate(-1.2deg)", opacity: 1, clipPath: "inset(-12px -12px -12px -12px)" },
      ],
      { duration: 420, easing: "cubic-bezier(0.2, 1, 0.3, 1)" }
    );
  };
  const openBottle = (b) => {
    const from = document.activeElement;
    closePaper();
    closeWrite();
    lastFocus = from && from !== document.body ? from : null;
    opened = b; b.held = true; b.reads++;
    pText.textContent = b.text;
    paper.style.setProperty("--r", (Math.random() * 14 - 7).toFixed(1) + "deg"); // le sceau tombe un peu de travers
    pMeta.textContent = b.mine
      ? "Ta bouteille, à l'eau depuis " + ago(Date.now() - b.since) + "."
      : "Lue " + b.reads + " fois sur " + MAX_READS + ". Elle coule à la " + MAX_READS + "e lecture.";
    b.welcome = false;
    tourEvent("open");
    pDel.hidden = !b.mine;
    paper.hidden = false;
    placePaper(b);
    $("#pBack").focus();
    hint.classList.add("off");
  };
  $("#pBack").addEventListener("click", closePaper);
  $("#pClose").addEventListener("click", closePaper);
  $("#pNext").addEventListener("click", () => readOne(opened));
  pDel.addEventListener("click", () => {
    const b = opened;
    if (!b) return;
    opened = null; paper.hidden = true;
    bottles.splice(bottles.indexOf(b), 1);
    mine = mine.filter((s) => s.text !== b.text);
    saveMine();
    statusEl.textContent = "Bouteille supprimée.";
    flashHint("bouteille supprimée");
  });

  /* l'écriture : un message de 100 caractères au plus, sans lien ni adresse */
  const wr = $("#wr"), wText = $("#wText"), wCount = $("#wCount"), wErr = $("#wErr");
  const closeWrite = () => { if (!wr.hidden) giveBackFocus(); wr.hidden = true; };
  const openWrite = () => {
    const from = document.activeElement;
    closePaper();
    lastFocus = from && from !== document.body ? from : null;
    wText.value = "";
    refreshWrite();
    tourEvent("write");
    wr.hidden = false;
    wText.focus();
    hint.classList.add("off");
  };
  wText.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); $("#wSend").click(); } });
  const wSend = $("#wSend");
  const refreshWrite = () => {
    const n = wText.value.trim().length;
    wCount.textContent = wText.value.length + " / 100";
    wCount.style.color = wText.value.length >= 90 ? "#b0002f" : "";
    wSend.disabled = n < 2;
    wErr.textContent = "";
  };
  wText.addEventListener("input", refreshWrite);
  $("#wCancel").addEventListener("click", closeWrite);
  $("#wClose").addEventListener("click", closeWrite);
  $("#wSend").addEventListener("click", () => {
    const s = wText.value.replace(/\s+/g, " ").trim();
    if (s.length < 2 || s.length > 100 || /(https?:|www\.|@|\.com|\.fr|\.net)/i.test(s)) {
      wErr.textContent = "Entre 2 et 100 caractères, sans lien ni adresse.";
      return;
    }
    mine.unshift({ text: s, t: Date.now() });
    if (mine.length > 5) { // la plus ancienne de tes bouteilles s'en va
      const old = mine.pop().text, i = bottles.findIndex((b) => b.mine && b.text === old);
      if (i >= 0) bottles.splice(i, 1);
    }
    saveMine();
    const y = 0.3 + Math.random() * 0.4;
    addBottle(s, true, 0.07, y, Date.now()).flash = 4; // un anneau rose la suit un moment
    drop(0.07, y, 0.06, true);
    stir(0.07, y, 90, (Math.random() - 0.5) * 40, 0.003); // un coup d'eau vers le large
    closeWrite();
    statusEl.textContent = "Ta bouteille est à l'eau.";
    flashHint("ta bouteille est à l'eau, suis l'anneau rose");
  });

  $("#write").addEventListener("click", openWrite);
  // ouvre une autre bouteille au hasard (pas celle qu'on tient)
  const readOne = (except) => {
    const free = bottles.filter((b) => !b.sink && !b.held && b !== except);
    if (!free.length) return;
    const next = free[(Math.random() * free.length) | 0];
    closePaper();
    openBottle(next);
  };
  $("#read").addEventListener("click", () => readOne(null));
  window.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!wr.hidden) closeWrite(); else closePaper();
  });

  const tour = $("#tour"), tText = $("#tText"), tStep = $("#tStep"), tNext = $("#tNext"), writeBtn = $("#write");
  let tourStep = seen ? -1 : 0;
  const welcomeBottle = () => bottles.find((b) => b.welcome) || bottles.find((b) => !b.mine && !b.sink);
  const TOUR = [
    { text: "Clique dans l'eau pour poser une goutte d'encre. Glisse pour la remuer.", at: () => ({ x: cssW / 2, y: cssH * 0.62, ring: true }) },
    { text: "Les bouteilles dérivent avec l'eau. Clique sur celle qui est entourée de rose pour lire son message.", at: () => { const b = welcomeBottle(); return b ? { x: b.x * cssW, y: (1 - b.y) * cssH } : { x: cssW / 2, y: cssH / 2 }; } },
    { text: "Ici, tu écris la tienne : elle dérivera avec les autres.", at: () => { const r = writeBtn.getBoundingClientRect(), s = stage.getBoundingClientRect(); return { x: r.left + r.width / 2 - s.left, y: 0, top: true }; } },
  ];
  const tourShow = () => {
    writeBtn.classList.toggle("pulse", tourStep === 2);
    if (tourStep < 0) { tour.hidden = true; return; }
    tStep.textContent = "visite " + (tourStep + 1) + " / " + TOUR.length;
    tText.textContent = TOUR[tourStep].text;
    tNext.textContent = tourStep === TOUR.length - 1 ? "compris" : "suivant";
    tour.hidden = false;
    if (!calm) tour.animate([{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], { duration: 320, easing: "ease-out" });
  };
  const tourEnd = () => {
    tourStep = -1; seen = true;
    try { localStorage.setItem(STORE + "-vu", "1"); } catch (e) { /* on s'en passe */ }
    const w = bottles.find((b) => b.welcome); if (w) w.welcome = false;
    tourShow();
  };
  const tourGo = (n) => { if (tourStep < 0) return; if (n >= TOUR.length) { tourEnd(); return; } tourStep = n; tourShow(); };
  const startTour = () => { tourStep = 0; tourShow(); };
  // une action de la personne fait avancer la visite
  const tourEvent = (name) => {
    if (tourStep < 0) return;
    if (name === "ink" && tourStep === 0) setTimeout(() => { if (tourStep === 0) tourGo(1); }, 1600);
    else if (name === "open" && tourStep === 1) tourGo(2);
    else if (name === "write" && tourStep === 2) tourEnd();
  };
  // la bulle se place près de ce qu'elle montre, et se cache quand un papier est ouvert
  const tourTick = () => {
    if (tourStep < 0) return;
    const hide = !!opened || !wr.hidden;
    if (tour.hidden !== hide) tour.hidden = hide;
    if (hide) return;
    const p = TOUR[tourStep].at(), bw = tour.offsetWidth, bh = tour.offsetHeight;
    const left = Math.min(cssW - bw - 12, Math.max(12, p.x - bw / 2));
    let top = p.top ? 12 : p.y < cssH / 2 ? p.y + 78 : p.y - 78 - bh;
    top = Math.min(cssH - bh - 12, Math.max(12, top));
    tour.style.left = left + "px";
    tour.style.top = top + "px";
  };
  tNext.addEventListener("click", () => tourGo(tourStep + 1));
  $("#tSkip").addEventListener("click", tourEnd);
  $("#help").addEventListener("click", () => {
    closePaper(); closeWrite();
    const w = bottles.find((b) => !b.mine && !b.sink);
    if (w) w.welcome = true;
    startTour();
  });

  let wantShot = false;
  const savePicture = () => {
    const c = document.createElement("canvas");
    c.width = cv.width; c.height = cv.height;
    const g = c.getContext("2d"), pr = c.width / cssW;
    g.drawImage(cv, 0, 0);
    g.drawImage(over, 0, 0);
    g.font = 12 * pr + "px 'Courier New', monospace";
    g.fillStyle = "#8c8c8c";
    g.textBaseline = "bottom";
    g.fillText("drift · devtober 2026 · Lino Volle", 18 * pr, c.height - 14 * pr);
    c.toBlob((blob) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "drift-" + new Date().toISOString().slice(0, 10) + ".png";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }, "image/png");
  };
  $("#save").addEventListener("click", () => { wantShot = true; });

  const hover = (e) => {
    hovered = bottleAt(e);
    cv.style.cursor = hovered ? "pointer" : "";
  };

  if (window.matchMedia("(pointer: coarse)").matches) hint.textContent = "touche l'eau pour poser de l'encre · touche une bouteille pour la lire";

  const initBottles = () => {
    mine.forEach((s) => addBottle(s.text, true, 0.15 + Math.random() * 0.7, 0.25 + Math.random() * 0.5, s.t));
    for (let i = 0; i < SEA_MIN; i++) release(true);
    if (!seen) {
      const w = bottles.find((b) => !b.mine);
      if (w) { w.welcome = true; w.x = 0.5; w.y = 0.55; w.size = 1.7; }
      startTour();
    }
  };

  /* ---------- Le pointeur ---------- */

  let down = false, last = null, lastInput = 0;
  const pos = (e) => {
    const r = cv.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: 1 - (e.clientY - r.top) / r.height };
  };
  cv.addEventListener("pointerdown", (e) => {
    if (opened || !wr.hidden) { closePaper(); closeWrite(); e.preventDefault(); return; } // un clic dans l'eau referme le papier
    const b = bottleAt(e);
    if (b) { openBottle(b); e.preventDefault(); return; }
    down = true;
    last = pos(e);
    lastInput = performance.now();
    drop(last.x, last.y, 0.14, Math.random() < 0.3);
    tourEvent("ink");
    hint.classList.add("off");
    try { cv.setPointerCapture(e.pointerId); } catch (err) { /* pas grave */ }
    e.preventDefault();
  });
  cv.addEventListener("pointermove", (e) => {
    if (!down) { hover(e); return; }
    const p = pos(e);
    stir(p.x, p.y, (p.x - last.x) * 3500, (p.y - last.y) * 3500, 0.0007);
    last = p;
    lastInput = performance.now();
  });
  const lift = () => { down = false; };
  cv.addEventListener("pointerup", lift);
  cv.addEventListener("pointercancel", lift);

  /* ---------- Démarrage ---------- */

  let t0 = performance.now() / 1000, prev = t0, nextDrop = 0;
  const frame = () => {
    const t = performance.now() / 1000, dt = Math.min(0.033, t - prev);
    prev = t;
    // sans personne, l'eau reçoit une goutte de temps en temps : elle n'est jamais vide
    if (t >= nextDrop && performance.now() - lastInput > 4000) {
      drop(0.1 + Math.random() * 0.8, 0.2 + Math.random() * 0.6, 0.09 + Math.random() * 0.06, Math.random() < 0.3);
      nextDrop = t + (nextDrop === 0 ? 0.3 : 9 + Math.random() * 8);
    }
    bottlesStep(dt, t - t0);
    step(dt, t - t0);
    drawBottles(t - t0);
    if (wantShot) { wantShot = false; savePicture(); flashHint("image enregistrée"); }
    requestAnimationFrame(frame);
  };

  let timer = 0;
  new ResizeObserver(() => {
    const r = stage.getBoundingClientRect();
    if (Math.round(r.width * Math.min(1.5, window.devicePixelRatio || 1)) === cv.width && Math.round(r.height * Math.min(1.5, window.devicePixelRatio || 1)) === cv.height) return;
    clearTimeout(timer);
    timer = setTimeout(() => { build(); nextDrop = 0; }, 150);
  }).observe(stage);

  build();
  initBottles();
  requestAnimationFrame(frame);
})();
