(function () {
  "use strict";

  const $ = (s) => document.querySelector(s);

  // true si la personne préfère éviter les animations : l'eau ne dérive plus toute seule
  const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const stage = $("#stage");
  const cv = $("#cv");
  const hint = $("#hint");

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
      uniform sampler2D uVel, uSrc; uniform vec2 uTexel, uST; uniform float uDt, uDiss, uSharp;
      void main() {
        vec2 back = vUv - uDt * texture(uVel, vUv).xy * uTexel;
        vec4 c = texture(uSrc, back);
        if (uSharp > 0.0) {
          // l'interpolation étale l'encre un peu à chaque image : on la raffermit pour que les lignes tiennent
          vec4 avg = 0.25 * (texture(uSrc, back + vec2(uST.x, 0.0)) + texture(uSrc, back - vec2(uST.x, 0.0))
                           + texture(uSrc, back + vec2(0.0, uST.y)) + texture(uSrc, back - vec2(0.0, uST.y)));
          // sur l'intensité seulement : sinon chaque canal déborde de son côté et la teinte change
          float mc = max(c.r, c.g), ma = max(avg.r, avg.g);
          float target = clamp(mc + uSharp * (mc - ma), 0.0, 3.2);
          c.rgb *= mc > 0.001 ? target / mc : 0.0;
        }
        o = uDiss * c;
      }`,
    // une goutte de force (ou d'encre) qui s'étale en douceur
    splat: HEAD + `
      uniform sampler2D uTarget; uniform float uAspect, uRadius; uniform vec3 uColor; uniform vec2 uPoint;
      void main() {
        vec2 p = vUv - uPoint; p.x *= uAspect;
        o = vec4(texture(uTarget, vUv).rgb + exp(-dot(p, p) / uRadius) * uColor, 1.0);
      }`,
    // une goutte de suminagashi : des anneaux concentriques d'encres qui alternent, séparés par de l'eau
    ring: HEAD + `
      uniform sampler2D uTarget; uniform float uAspect, uR; uniform vec3 uA, uB; uniform vec2 uPoint;
      void main() {
        vec2 p = vUv - uPoint; p.x *= uAspect;
        float k = length(p) / uR;
        vec3 base = texture(uTarget, vUv).rgb;
        if (k >= 1.0) { o = vec4(base, 1.0); return; }
        // une ligne fine par anneau : deux blanches, puis une rose
        float s = k * 7.0, band = floor(s), f = fract(s);
        float w = smoothstep(0.05, 0.22, f) * (1.0 - smoothstep(0.38, 0.55, f));
        o = vec4(mix(base, mod(band, 3.0) < 2.0 ? uA : uB, w), 1.0);
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
        vec3 col = ink / max(m, 0.001);
        o = vec4(mix(water, col * 0.92, a), 1.0);
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
    gl.clearColor(0, 0, 0, 1);
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
    const simH = 128, simW = Math.round(simH * aspect);
    const dyeH = Math.min(640, cv.height), dyeW = Math.round(dyeH * aspect);
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
    for (let i = 0; i < 18; i++) {
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
    gl.uniform2f(u.uST, 0, 0);
    bind(vel.write); draw(); vel.swap();
    tex(1, dye.read, u.uSrc);
    gl.uniform1f(u.uDiss, Math.pow(0.985, dt));
    gl.uniform1f(u.uSharp, 0.4);
    gl.uniform2f(u.uST, dye.read.texel[0], dye.read.texel[1]);
    bind(dye.write); draw(); dye.swap();

    u = use("display");
    gl.uniform2f(u.uRes, cv.width, cv.height);
    tex(0, dye.read, u.uDye);
    bind(null); draw();
  };

  /* ---------- Le pointeur ---------- */

  let down = false, last = null, lastInput = 0;
  const pos = (e) => {
    const r = cv.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: 1 - (e.clientY - r.top) / r.height };
  };
  cv.addEventListener("pointerdown", (e) => {
    down = true;
    last = pos(e);
    lastInput = performance.now();
    drop(last.x, last.y, 0.14, Math.random() < 0.3);
    hint.classList.add("off");
    try { cv.setPointerCapture(e.pointerId); } catch (err) { /* pas grave */ }
    e.preventDefault();
  });
  cv.addEventListener("pointermove", (e) => {
    if (!down) return;
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
      nextDrop = t + (nextDrop === 0 ? 0.3 : 5 + Math.random() * 6);
    }
    step(dt, t - t0);
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
  requestAnimationFrame(frame);
})();
