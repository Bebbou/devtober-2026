import {
  WebGLRenderer, Scene, OrthographicCamera, BufferGeometry, BufferAttribute,
  InstancedBufferGeometry, InstancedBufferAttribute, Mesh, Points, ShaderMaterial, DoubleSide,
} from "./vendor/three.module.min.js";

const $ = (s) => document.querySelector(s);

// true si la personne préfère éviter les animations : les fleurs s'ouvrent d'un coup, rien ne tremble, ne tombe ni ne vole
const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const stage = $("#stage");
const cv = $("#cv");
const pctEl = $("#pct");
const statusEl = $("#status");
const hint = $("#hint");
const hanko = $("#hanko");
const crowsEl = $("#crows");
const top = $(".top");

const KEY = "devtober-bloom-3"; // les cercles dessinés, gardés d'une visite à l'autre
const TAU = Math.PI * 2;
const FAR = 1e9; // « pas encore vivant »

const now = () => performance.now() / 1000;

// petit générateur à graine : le monde est toujours le même pour une taille d'écran donnée
const rng = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/* ---------- Les shaders ----------
   Tout se dessine sur le GPU : les arbres, les fleurs et les tournesols sont construits une fois,
   puis le temps (uTime) fait pousser ce qui a été allumé. */

const NOISE = `
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
// un trait de largeur w : 1 au centre, 0 à w
float edge(float d, float w) { return 1.0 - smoothstep(w * 0.25, w, d); }
`;

// une fleur de cerisier : cinq pétales, chacun échancré au bout. p est en rayons de fleur.
const SAKURA = `
float sakura(vec2 p) {
  float r = length(p), a = atan(p.y, p.x);
  float sector = 6.2831853 / 5.0;
  float b = mod(a + sector * 0.5, sector) - sector * 0.5;
  float prof = pow(max(cos(b * 1.5707963 / (sector * 0.5) * 0.98), 0.0), 0.5);
  float notch = 1.0 - 0.3 * exp(-pow(b / 0.1, 2.0));
  return prof * notch - r;
}
vec4 sakuraPaint(vec2 p, float rpx) {
  float aa = 1.3 / max(rpx, 1.0);
  float cov = smoothstep(-aa, aa, sakura(p));
  float r = length(p);
  vec3 col = mix(vec3(1.0, 0.0, 0.333), vec3(0.55, 0.0, 0.18), (1.0 - smoothstep(0.0, 0.45, r)) * 0.7);
  col = mix(col, vec3(0.05), (1.0 - smoothstep(0.12, 0.2, r)) * step(4.0, rpx));
  return vec4(col, cov);
}
`;

const U = {
  uTime: { value: 0 },
  uCalm: { value: calm ? 1 : 0 },
  uRes: { value: [1, 1] },
  uProg: { value: 0 },
  uGround: { value: 0 },
  uMoon: { value: [0, 0, 1] },
  uPR: { value: 1 },
  uDawn: { value: 0 },
};

const material = (vertexShader, fragmentShader, uniforms) =>
  new ShaderMaterial({ vertexShader, fragmentShader, uniforms, transparent: true, depthTest: false, depthWrite: false, side: DoubleSide });

// le fond : papier, étoiles, lune, relief
const bgMat = material(`
  varying vec2 vPx;
  uniform vec2 uRes;
  void main() {
    vPx = uv * uRes;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`, `
  uniform vec2 uRes;
  uniform float uTime, uProg, uGround, uCalm, uDawn;
  uniform vec3 uMoon;
  varying vec2 vPx;
  ${NOISE}
  float ridgeY(float x, float base, float amp, float s) {
    float u = x / uRes.x;
    return base - amp * (0.5 + 0.32 * sin(u * 5.2 + s) + 0.22 * sin(u * 12.7 + s * 1.7) + 0.08 * vnoise(vec2(x / 12.0, s)));
  }
  void main() {
    vec2 p = vPx;
    float tq = uCalm > 0.5 ? 0.0 : floor(uTime * 12.0);
    // le papier : de longues fibres et un grain fin
    vec3 paper = vec3(0.051) + (vnoise(p * vec2(0.8, 0.035)) - 0.5) * 0.02 + (hash(p + tq) - 0.5) * 0.016;
    // l'aube : un lavis rose à l'horizon, qui monte
    float hz = clamp(p.y / uGround, 0.0, 1.0);
    vec3 col = paper + vec3(0.34, 0.02, 0.14) * pow(hz, 1.8) * uDawn;
    if (p.y < uGround * 0.72) {
      vec2 cell = floor(p / 26.0);
      float hs = hash(cell);
      if (hs > 0.9) {
        vec2 sp = (cell + vec2(hash(cell + 1.7), hash(cell + 3.1))) * 26.0;
        float tw = uCalm > 0.5 ? 1.0 : 0.7 + 0.3 * sin(uTime * 0.6 + hs * 50.0);
        col += (1.0 - smoothstep(0.2, 1.4, length(p - sp))) * (0.25 + 0.25 * hash(cell + 9.0)) * tw * (1.0 - uDawn);
      }
    }
    // la lune : un cercle d'encre, plus épais par endroits, qui rosit avec le monde
    vec2 mp = p - uMoon.xy;
    float d = length(mp), ang = atan(mp.y, mp.x);
    float rr = uMoon.z * (1.0 + 0.03 * (vnoise(vec2(ang * 2.0, 4.0)) - 0.5));
    float lw = 0.7 + 1.6 * vnoise(vec2(ang * 1.5 + 7.0, 1.0));
    vec3 pink = vec3(1.0, 0.0, 0.333);
    float moon = 1.0 - uDawn;
    col = mix(col, pink, step(d, rr) * clamp(uProg, 0.0, 1.0) * 0.16 * moon);
    col = mix(col, mix(vec3(0.23), pink, clamp(uProg, 0.0, 1.0)), edge(abs(d - rr), lw) * moon);
    // le soleil se lève derrière le relief
    vec2 sc = vec2(uRes.x * 0.5, uGround - uRes.y * 0.36 + (1.0 - uDawn) * uRes.y * 0.55);
    float sr = min(uRes.x, uRes.y) * 0.1;
    float sa = atan(p.y - sc.y, p.x - sc.x);
    float sd = length(p - sc) - sr * (1.0 + 0.03 * (vnoise(vec2(sa * 2.0, 9.0)) - 0.5));
    col = mix(col, pink * 0.9, step(sd, 0.0) * uDawn);
    // le relief : il cache ce qui est derrière lui
    float y1 = ridgeY(p.x, uGround - uRes.y * 0.16, uRes.y * 0.12, 2.0);
    float y2 = ridgeY(p.x, uGround - uRes.y * 0.05, uRes.y * 0.07, 5.0);
    float w1 = (vnoise(vec2(p.x * 0.04, 3.0)) - 0.5) * 1.6;
    float w2 = (vnoise(vec2(p.x * 0.04, 8.0)) - 0.5) * 1.6;
    if (p.y > y1) col = paper;
    col = mix(col, vec3(0.15), edge(abs(p.y - y1 + w1), 1.3));
    if (p.y > y2) col = paper;
    col = mix(col, vec3(0.19), edge(abs(p.y - y2 + w2), 1.3));
    if (p.y > uGround) col = paper;
    col = mix(col, vec3(0.2), edge(abs(p.y - uGround), 1.2));
    gl_FragColor = vec4(col, 1.0);
  }`, U);

// les traits : branches, herbes, marques d'encre au sol
const strokeMat = material(`
  uniform float uTime, uCalm;
  attribute float aSide, aAlong, aHW, aAlive, aSeed, aRow;
  varying float vSide, vAlong, vHW, vAlive, vSeed, vRow;
  ${NOISE}
  void main() {
    vec3 p = position;
    // le tracé tremble un peu, comme un dessin refait à la main plusieurs fois par seconde
    float q = uCalm > 0.5 ? 0.0 : floor(uTime * 7.0);
    vec2 n = vec2(vnoise(p.xy * 0.035 + q * 3.17), vnoise(p.xy * 0.035 + 41.0 + q * 5.31)) - 0.5;
    p.xy += n * 1.8 * (abs(aRow - 3.0) > 0.5 ? 1.0 : 0.0);
    vSide = aSide; vAlong = aAlong; vHW = aHW; vAlive = aAlive; vSeed = aSeed; vRow = aRow;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }`, `
  uniform float uTime, uCalm;
  varying float vSide, vAlong, vHW, vAlive, vSeed, vRow;
  ${NOISE}
  // rangées : 0 arbre devant, 1 arbre derrière, 2 herbe, 3 encre du sol (ne change pas), 4 torii, 5 pierre des lanternes, 6 flamme
  vec3 deadCol(float r) {
    if (r < 0.5) return vec3(0.263);
    if (r < 1.5) return vec3(0.169);
    if (r < 2.5) return vec3(0.165);
    if (r < 3.5) return vec3(0.1);
    if (r < 4.5) return vec3(0.22);
    if (r < 5.5) return vec3(0.23);
    return vec3(0.07);
  }
  vec3 litCol(float r) {
    if (r < 0.5) return vec3(0.77);
    if (r < 1.5) return vec3(0.5);
    if (r < 2.5) return vec3(0.478);
    if (r < 3.5) return vec3(0.1);
    if (r < 4.5) return vec3(0.92, 0.0, 0.31);
    if (r < 5.5) return vec3(0.6);
    return vec3(1.0, 0.0, 0.333);
  }
  void main() {
    // des bords irréguliers, et des poils de pinceau dans les grosses branches
    float e = (1.0 - abs(vSide)) * vHW;
    float rough = (vnoise(vec2(vAlong * 0.25, vSeed * 53.0)) - 0.35) * min(vHW, 3.0) * 0.9;
    float a = smoothstep(0.0, 1.0, e + rough + 0.4);
    float st = vnoise(vec2(vSide * vHW * 0.9 + vSeed * 37.0, vAlong * 0.05));
    a *= 1.0 - smoothstep(2.5, 7.0, vHW) * 0.5 * (1.0 - smoothstep(0.1, 0.5, st));
    float dt = uTime - vAlive;
    vec3 col = mix(deadCol(vRow), litCol(vRow), clamp(dt / 0.5, 0.0, 1.0));
    // un éclair rose passe quand la vie arrive
    float flash = (dt > 0.0 && dt < 1.4 && (vRow < 1.5 || abs(vRow - 4.0) < 0.5) && uCalm < 0.5) ? 1.0 - dt / 1.4 : 0.0;
    col = mix(col, vec3(1.0, 0.0, 0.333), flash * 0.75);
    // la flamme des lanternes vacille
    if (vRow > 5.5 && dt > 0.5 && uCalm < 0.5) col *= 0.82 + 0.18 * sin(uTime * 6.0 + vSeed * 50.0);
    gl_FragColor = vec4(col, a);
  }`, U);

// les fleurs des branches : une par instance, qui s'ouvre quand son heure arrive
const bloomMat = material(`
  uniform float uTime, uCalm;
  attribute vec2 aPos;
  attribute float aSize, aRot, aPh, aT0, aA;
  varying vec2 vUv;
  varying float vRot, vA, vR, vOpen;
  void main() {
    // d'abord un bourgeon qui apparaît, puis la fleur qui s'ouvre
    float t = uCalm > 0.5 ? step(aT0, uTime) : clamp((uTime - aT0) / 1.1, 0.0, 1.0);
    float pop = smoothstep(0.0, 0.25, t);
    float open = 1.0 - pow(1.0 - clamp((t - 0.3) / 0.7, 0.0, 1.0), 3.0);
    float live = uCalm > 0.5 ? 0.0 : 1.0;
    float r = aSize * pop * (0.4 + 0.6 * open) * (1.0 + live * 0.07 * sin(uTime * 1.5 + aPh));
    vUv = position.xy * 2.0 * 1.3;
    vRot = aRot + live * sin(uTime * 0.6 + aPh) * 0.1;
    vA = aA; vR = r; vOpen = open;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(aPos + position.xy * r * 2.6, 0.0, 1.0);
  }`, `
  varying vec2 vUv;
  varying float vRot, vA, vR, vOpen;
  ${SAKURA}
  void main() {
    float c = cos(vRot), s = sin(vRot);
    vec2 p = vec2(c * vUv.x + s * vUv.y, -s * vUv.x + c * vUv.y);
    vec4 f = sakuraPaint(p / mix(0.55, 1.0, vOpen), vR);
    float bud = 1.0 - smoothstep(0.38, 0.5, length(p * vec2(0.9, 1.5)));
    vec3 col = mix(vec3(0.6, 0.0, 0.2), f.rgb, smoothstep(0.1, 0.5, vOpen));
    float a = max(f.a * smoothstep(0.0, 0.3, vOpen), bud * (1.0 - smoothstep(0.15, 0.5, vOpen))) * vA;
    if (a < 0.01) discard;
    gl_FragColor = vec4(col, a);
  }`, U);

// les plantes du sol : tige, feuilles et tête de tournesol (ou petite fleur), dessinées en pixels
const plantMat = material(`
  attribute vec2 aPos;
  attribute float aH, aR, aRot, aPh, aT0, aBig;
  varying vec2 vP;
  varying float vH, vR, vRot, vPh, vT0, vBig;
  void main() {
    vec2 l = position.xy + 0.5;
    float qw = aR * 3.8 + 12.0, qh = aH + aR * 2.6 + 8.0;
    vP = vec2((l.x * 2.0 - 1.0) * qw, l.y * (qh + 3.0) - 3.0);
    vH = aH; vR = aR; vRot = aRot; vPh = aPh; vT0 = aT0; vBig = aBig;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(aPos.x + vP.x, aPos.y - vP.y, 0.0, 1.0);
  }`, `
  uniform float uTime, uCalm;
  varying vec2 vP;
  varying float vH, vR, vRot, vPh, vT0, vBig;
  ${NOISE}
  ${SAKURA}
  float ease(float x) { return 1.0 - pow(1.0 - clamp(x, 0.0, 1.0), 3.0); }
  void main() {
    float age = uTime - vT0;
    if (age < 0.0) discard;
    float big = step(0.5, vBig);
    float k = uCalm > 0.5 ? 1.0 : clamp(age / mix(1.4, 2.2, big), 0.0, 1.0);
    float ks = ease(k / 0.55), kh = ease((k - 0.5) / 0.5);
    float sway = uCalm > 0.5 ? 0.0 : sin(uTime * 0.7 + vPh) * mix(1.6, 2.5, big) * ks;
    float hgt = vH * ks;
    float t = clamp(vP.y / max(vH, 1.0), 0.0, 1.0);
    float sx = sway * t * t;
    vec3 col = vec3(0.72);
    // la tige, un peu irrégulière
    float sw = 0.55 + 0.35 * vnoise(vec2(vP.y * 0.15, vPh * 9.0));
    float al = (vP.y > -1.5 && vP.y < hgt) ? edge(abs(vP.x - sx), sw + 0.35) : 0.0;
    if (big > 0.5 && ks > 0.6) {
      for (int i = 0; i < 2; i++) {
        float s = float(i) * 2.0 - 1.0;
        float ly = vH * ks * mix(0.35, 0.55, float(i));
        float lt = ly / max(vH, 1.0);
        vec2 q = vP - vec2(s * vR * 0.9 + sway * lt * lt, ly);
        float c = cos(s * 0.5), sn = sin(s * 0.5);
        q = vec2(c * q.x + sn * q.y, -sn * q.x + c * q.y);
        float ln = edge(abs(length(q / vec2(vR * 0.9, vR * 0.3)) - 1.0) * vR * 0.3, 0.9);
        al = max(al, ln);
      }
    }
    vec2 q = vP - vec2(sway, hgt);
    if (kh > 0.0) {
      float r = vR * kh;
      if (big > 0.5) {
        // tournesol : treize pétales au trait, et des graines sur la spirale d'or
        float sec = 6.2831853 / 13.0;
        float ang = floor((atan(q.y, q.x) - vRot) / sec + 0.5) * sec + vRot;
        vec2 lq = vec2(cos(ang) * q.x + sin(ang) * q.y, -sin(ang) * q.x + cos(ang) * q.y);
        float f = length((lq - vec2(1.35 * r, 0.0)) / vec2(0.62 * r, 0.22 * r));
        float pl = edge(abs(f - 1.0) * 0.22 * r, 0.9);
        float rho = length(q);
        float disc = 1.0 - smoothstep(r * 0.95, r, rho);
        float bs = 0.0, bp = 0.0;
        if (rho < r * 1.06) {
          float est = 30.0 * (rho / r) * (rho / r);
          for (int i = -3; i <= 3; i++) {
            float idx = clamp(floor(est) + float(i), 0.0, 29.0);
            vec2 sp = r * sqrt(idx / 30.0) * vec2(cos(idx * 2.399963 + vRot), sin(idx * 2.399963 + vRot));
            float sd = 1.0 - smoothstep(0.4, 1.5, length(q - sp));
            if (sd > bs) { bs = sd; bp = step(24.5, idx); }
          }
        }
        vec3 pink = vec3(1.0, 0.0, 0.333);
        col = mix(col, vec3(0.05), disc * 0.85);
        al = max(al, disc * 0.85);
        col = mix(col, mix(vec3(0.88), pink, bp), bs * 0.9);
        al = max(al, bs * 0.9);
        col = mix(col, pink, pl);
        al = max(al, pl);
      } else {
        float c = cos(vRot), s = sin(vRot);
        vec4 f = sakuraPaint(vec2(c * q.x + s * q.y, -s * q.x + c * q.y) / max(r, 0.5), r);
        col = mix(col, f.rgb, f.a);
        al = max(al, f.a);
      }
    }
    if (al < 0.01) discard;
    gl_FragColor = vec4(col, al);
  }`, U);

// les pétales qui tombent, ceux qui se sont posés
const petalMat = material(`
  uniform float uPR;
  attribute float aRot, aSize, aA;
  varying float vRot, vA;
  void main() {
    vRot = aRot; vA = aA;
    gl_PointSize = aSize * uPR;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`, `
  varying float vRot, vA;
  void main() {
    vec2 q = (gl_PointCoord - 0.5) * 2.0;
    float c = cos(vRot), s = sin(vRot);
    q = vec2(c * q.x + s * q.y, -s * q.x + c * q.y);
    float f = q.x * q.x + q.y * q.y / 0.3;
    f += 0.35 * exp(-pow(q.y / 0.14, 2.0)) * smoothstep(0.5, 1.0, q.x);
    float a = 1.0 - smoothstep(0.82, 1.0, f);
    if (a < 0.02) discard;
    gl_FragColor = vec4(1.0, 0.0, 0.333, a * vA);
  }`, U);

// les gouttes d'encre blanche, quand le pinceau se pose
const dotMat = material(`
  uniform float uPR;
  attribute float aSize, aA;
  attribute vec3 aCol;
  varying float vA;
  varying vec3 vCol;
  void main() {
    vA = aA; vCol = aCol;
    gl_PointSize = aSize * uPR;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`, `
  varying float vA;
  varying vec3 vCol;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float a = 1.0 - smoothstep(0.55, 1.0, d);
    if (a < 0.02) discard;
    gl_FragColor = vec4(vCol, a * vA);
  }`, U);

// le trait du pinceau : de l'encre claire, des poils qui se détachent quand on va vite
const brushMat = material(`
  attribute float aSide, aAlong, aHW, aA;
  varying float vSide, vAlong, vHW, vA;
  void main() {
    vSide = aSide; vAlong = aAlong; vHW = aHW; vA = aA;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`, `
  varying float vSide, vAlong, vHW, vA;
  ${NOISE}
  void main() {
    // le ruban est plus large que le trait : le trait occupe le centre (55 %), le reste est de l'encre qui bave
    float core = vHW * 0.55;
    float e = (0.55 - abs(vSide)) * vHW;
    float rough = (vnoise(vec2(vAlong * 0.3, 3.7)) - 0.4) * min(core, 5.0) * 0.9;
    float a = smoothstep(0.0, 1.0, e + rough + 0.3);
    // plus le trait est fin (donc rapide), plus il y a de poils sans encre
    float dry = 1.0 - smoothstep(2.5, 7.5, core * 2.0);
    float st = vnoise(vec2(vSide * vHW * 0.7 + 11.0, vAlong * 0.045)) * 0.7 + vnoise(vec2(vSide * vHW * 2.3, vAlong * 0.2)) * 0.3;
    a *= 1.0 - dry * 0.85 * smoothstep(0.38, 0.62, st);
    // le halo : de l'encre qui s'étale dans le papier, par plaques
    float bleed = (1.0 - abs(vSide)) * (0.55 + 0.9 * vnoise(vec2(vAlong * 0.12, vSide * 3.0 + 2.0)));
    float halo = 0.2 * smoothstep(0.1, 0.9, bleed) * (1.0 - dry * 0.6);
    // l'encre s'efface par plaques
    float fade = smoothstep(0.0, 0.3, vA - 0.4 * vnoise(vec2(vAlong * 0.08, 5.0)));
    // l'encre s'amasse sur les bords du trait
    float rim = smoothstep(0.2, 0.55, abs(vSide));
    gl_FragColor = vec4(vec3(mix(0.96, 0.78, rim)), max(a * 0.95, halo) * fade);
  }`, U);

/* ---------- Le rendu ---------- */

let renderer;
try {
  renderer = new WebGLRenderer({ canvas: cv, antialias: true, alpha: false });
} catch (e) {
  hint.textContent = "ton navigateur n'affiche pas WebGL, le jour 03 ne peut pas s'afficher";
  throw e;
}
renderer.setClearColor(0x0d0d0d);

const scene = new Scene();
const camera = new OrthographicCamera(0, 1, 0, 1, -10, 10); // en pixels, l'axe y vers le bas

const pool = (cap, attrs, mat) => {
  const g = new BufferGeometry();
  const pos = new Float32Array(cap * 3);
  g.setAttribute("position", new BufferAttribute(pos, 3));
  const arrs = {};
  Object.keys(attrs).forEach((k) => { arrs[k] = new Float32Array(cap * attrs[k]); g.setAttribute(k, new BufferAttribute(arrs[k], attrs[k])); });
  g.setDrawRange(0, 0);
  const mesh = new Points(g, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  return {
    g, mesh, pos, arrs, cap, n: 0,
    flush() {
      g.setDrawRange(0, this.n);
      g.attributes.position.needsUpdate = true;
      Object.keys(arrs).forEach((k) => { g.attributes[k].needsUpdate = true; });
    },
  };
};

const fallingP = pool(260, { aRot: 1, aSize: 1, aA: 1 }, petalMat);
const landedP = pool(900, { aRot: 1, aSize: 1, aA: 1 }, petalMat);
const dotsP = pool(140, { aSize: 1, aA: 1, aCol: 3 }, dotMat);
landedP.mesh.renderOrder = 4;
dotsP.mesh.renderOrder = 6;
scene.add(landedP.mesh, fallingP.mesh, dotsP.mesh);

// le pinceau : un ruban reconstruit à chaque image à partir des points
const MAXP = 800;
const brushGeo = new BufferGeometry();
const bPos = new Float32Array(MAXP * 2 * 3);
const bSide = new Float32Array(MAXP * 2), bAlong = new Float32Array(MAXP * 2), bHW = new Float32Array(MAXP * 2), bA = new Float32Array(MAXP * 2);
const bIdx = new Uint16Array((MAXP - 1) * 6);
for (let i = 0; i < MAXP - 1; i++) bIdx.set([2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 1, 2 * i + 3, 2 * i + 2], i * 6);
brushGeo.setAttribute("position", new BufferAttribute(bPos, 3));
brushGeo.setAttribute("aSide", new BufferAttribute(bSide, 1));
brushGeo.setAttribute("aAlong", new BufferAttribute(bAlong, 1));
brushGeo.setAttribute("aHW", new BufferAttribute(bHW, 1));
brushGeo.setAttribute("aA", new BufferAttribute(bA, 1));
brushGeo.setIndex(new BufferAttribute(bIdx, 1));
brushGeo.setDrawRange(0, 0);
const brushMesh = new Mesh(brushGeo, brushMat);
brushMesh.frustumCulled = false;
brushMesh.renderOrder = 7;
scene.add(brushMesh);

/* ---------- Le monde ---------- */

let W = 0, H = 0, U0 = 0, ground = 0;
let world = []; // les maillages reconstruits à chaque taille d'écran
let trees = [], branches = [], tufts = [], plants = [], props = [], strokes = [], crows = [];
let dawn = 0, stamped = false; // le lever du jour après la dernière fleur, puis le sceau
let alive = null, bloomT0 = null, plantT0 = null; // les tampons que region() modifie
let bloomPos = [], active = []; // les fleurs : toutes, et celles qui sont déjà allumées
let petals = [], motes = [];
let circles = []; // en coordonnées relatives, pour recharger et pour redimensionner
let pts = [], drawing = false;
let progress = 0, shown = 0, wTree = 0, wPlant = 0, wProp = 0, finished = false;

const quad = (w, h) => {
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array([0, 0, 0, w, 0, 0, w, h, 0, 0, h, 0]), 3));
  g.setAttribute("uv", new BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
};

const instances = (count, attrs) => {
  const g = new InstancedBufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]), 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.instanceCount = count;
  const arrs = {};
  Object.keys(attrs).forEach((k) => { arrs[k] = new Float32Array(count * attrs[k]); g.setAttribute(k, new InstancedBufferAttribute(arrs[k], attrs[k])); });
  return { g, arrs };
};

const addWorld = (geo, mat, order) => {
  const m = new Mesh(geo, mat);
  m.frustumCulled = false;
  m.renderOrder = order;
  scene.add(m);
  world.push(m);
  return m;
};

// quatre ports d'arbre : ouvert, élancé, noueux et penché, pin aux branches presque horizontales
const KINDS = [
  { spread: 0.95, lf: 0.74, bend: 0.4, maxD: 7, horiz: 0, thick: 1, tall: 1, lean: 0.2 },
  { spread: 0.55, lf: 0.8, bend: 0.4, maxD: 7, horiz: 0, thick: 1, tall: 1.25, lean: 0.2 },
  { spread: 0.9, lf: 0.78, bend: 1.0, maxD: 6, horiz: 0, thick: 1.5, tall: 0.9, lean: 0.55 },
  { spread: 0.8, lf: 0.76, bend: 0.5, maxD: 7, horiz: 0.3, thick: 1.15, tall: 0.95, lean: 0.25 },
];
const KIND_ORDER = [0, 3, 1, 2, 0, 2, 3]; // l'ordre où les arbres reçoivent leur forme, de gauche à droite

const grow = (tree, k, rand, x, y, a, len, w, d) => {
  const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
  const bend = (rand() - 0.5) * len * k.bend;
  const b = {
    t: tree.i, row: tree.row, d, w, alive: FAR,
    x1: x, y1: y, x2, y2,
    cx: (x + x2) / 2 - Math.sin(a) * bend, cy: (y + y2) / 2 + Math.cos(a) * bend,
  };
  branches.push(b);
  tree.minx = Math.min(tree.minx, x2); tree.maxx = Math.max(tree.maxx, x2);
  tree.miny = Math.min(tree.miny, y2); tree.maxy = Math.max(tree.maxy, y);
  if (d >= k.maxD) return;
  const n = d < 1 || rand() > 0.2 ? 2 : 3;
  for (let i = 0; i < n; i++) {
    let da = (rand() - 0.5) * k.spread * 0.8 + (n === 2 ? (i ? 1 : -1) * k.spread * 0.42 : (i - 1) * k.spread * 0.5);
    if (k.horiz && d >= 1) { // le pin : la branche se couche vers l'horizontale
      const target = Math.cos(a) >= 0 ? 0 : Math.PI;
      da += k.horiz * Math.atan2(Math.sin(target - a), Math.cos(target - a));
    }
    grow(tree, k, rand, x2, y2, a + da, len * (k.lf + rand() * 0.1), w * 0.7, d + 1);
  }
};

const clearWorld = () => {
  world.forEach((m) => { scene.remove(m); m.geometry.dispose(); });
  world = [];
  crowsEl.textContent = "";
};

const buildStrokes = () => {
  // un trait = une courbe de Bézier épaissie en ruban, découpée en tronçons
  let verts = 0;
  strokes.forEach((s) => {
    s.len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1) * 1.05;
    s.S = Math.max(2, Math.min(7, Math.ceil(s.len / 12)));
    s.v0 = verts;
    verts += (s.S + 1) * 2;
    s.v1 = verts;
  });
  const pos = new Float32Array(verts * 3);
  const side = new Float32Array(verts), along = new Float32Array(verts), hw = new Float32Array(verts);
  const seed = new Float32Array(verts), row = new Float32Array(verts);
  alive = new Float32Array(verts).fill(FAR);
  const index = [];
  strokes.forEach((s, si) => {
    let dist = 0, px = s.x1, py = s.y1;
    const sd = ((si * 2654435761) % 1000) / 1000;
    for (let j = 0; j <= s.S; j++) {
      const t = j / s.S, u = 1 - t;
      const x = u * u * s.x1 + 2 * u * t * s.cx + t * t * s.x2, y = u * u * s.y1 + 2 * u * t * s.cy + t * t * s.y2;
      let tx = 2 * u * (s.cx - s.x1) + 2 * t * (s.x2 - s.cx), ty = 2 * u * (s.cy - s.y1) + 2 * t * (s.y2 - s.cy);
      const tl = Math.hypot(tx, ty) || 1;
      tx /= tl; ty /= tl;
      dist += Math.hypot(x - px, y - py); px = x; py = y;
      const h = Math.max(0.5, (s.w0 + (s.w1 - s.w0) * t) / 2);
      for (let k = 0; k < 2; k++) {
        const v = s.v0 + j * 2 + k, sg = k ? 1 : -1;
        pos[v * 3] = x - ty * h * sg; pos[v * 3 + 1] = y + tx * h * sg;
        side[v] = sg; along[v] = dist + sd * 300; hw[v] = h; seed[v] = sd; row[v] = s.row;
      }
      if (j < s.S) { const v = s.v0 + j * 2; index.push(v, v + 1, v + 2, v + 1, v + 3, v + 2); }
    }
  });
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(pos, 3));
  g.setAttribute("aSide", new BufferAttribute(side, 1));
  g.setAttribute("aAlong", new BufferAttribute(along, 1));
  g.setAttribute("aHW", new BufferAttribute(hw, 1));
  g.setAttribute("aAlive", new BufferAttribute(alive, 1));
  g.setAttribute("aSeed", new BufferAttribute(seed, 1));
  g.setAttribute("aRow", new BufferAttribute(row, 1));
  g.setIndex(index);
  addWorld(g, strokeMat, 1);
};

const buildBlooms = () => {
  // toutes les fleurs possibles existent déjà, cachées : region() leur donne une heure
  const list = [];
  branches.forEach((b, idx) => {
    b.bl0 = list.length;
    const r = rng(idx * 7919 + 13), p = b.d === 4 ? 0.3 : b.d === 5 ? 0.55 : 0.85;
    if (b.d >= 4 && r() <= p) {
      const n = b.d >= 6 ? 1 + Math.floor(r() * 2) : 1;
      for (let k = 0; k < n; k++) {
        const f = 0.35 + r() * 0.65;
        list.push({
          x: b.x1 + (b.x2 - b.x1) * f + (r() - 0.5) * 6, y: b.y1 + (b.y2 - b.y1) * f + (r() - 0.5) * 6,
          r: (b.d >= 6 ? 3 + r() * 2.5 : 4.5 + r() * 2.5) * Math.min(1.25, U0 / 700) * (b.row ? 0.75 : 1),
          rot: r() * TAU, ph: r() * TAU, a: 0.72 + r() * 0.22,
        });
      }
    }
    b.bl1 = list.length;
  });
  bloomPos = list;
  const { g, arrs } = instances(list.length, { aPos: 2, aSize: 1, aRot: 1, aPh: 1, aT0: 1, aA: 1 });
  list.forEach((f, i) => {
    arrs.aPos[i * 2] = f.x; arrs.aPos[i * 2 + 1] = f.y;
    arrs.aSize[i] = f.r; arrs.aRot[i] = f.rot; arrs.aPh[i] = f.ph; arrs.aA[i] = f.a;
  });
  arrs.aT0.fill(FAR);
  bloomT0 = g.attributes.aT0;
  addWorld(g, bloomMat, 3);
};

const buildPlants = () => {
  const { g, arrs } = instances(plants.length, { aPos: 2, aH: 1, aR: 1, aRot: 1, aPh: 1, aT0: 1, aBig: 1 });
  plants.forEach((p, i) => {
    arrs.aPos[i * 2] = p.x; arrs.aPos[i * 2 + 1] = ground;
    arrs.aH[i] = p.h; arrs.aR[i] = p.r; arrs.aRot[i] = p.rot; arrs.aPh[i] = p.ph; arrs.aBig[i] = p.big ? 1 : 0;
  });
  arrs.aT0.fill(FAR);
  plantT0 = g.attributes.aT0;
  addWorld(g, plantMat, 2);
};

// les corbeaux : perchés au bout d'une branche, ils s'envolent quand l'arbre revit
const SIT = '<svg class="sit" width="26" height="16" viewBox="0 0 26 16"><path d="M1 13L8 9C8 5 12 3 15 5L19 3L25 6L19 7C19 11 15 13 10 13.5Z"/><path class="pattes" d="M10 13.5L9 16M13 13.5L13 16"/></svg>';
const FLY = '<svg class="fly" width="22" height="12" viewBox="0 0 22 12"><path class="haut" d="M1 6L6 1L11 7L16 1L21 6"/><path class="bas" d="M1 8L6 8L11 10L16 8L21 8"/></svg>';

const buildCrows = (rand) => {
  crows = [];
  const near = trees.filter((t) => !t.row).sort((a, b) => (b.maxy - b.miny) - (a.maxy - a.miny));
  // un corbeau sur le torii, un autre sur un arbre (pas sur un petit écran)
  const torii = props.find((p) => p.kind === "torii");
  if (torii) {
    const el = document.createElement("div");
    el.className = "crow";
    el.innerHTML = SIT + FLY;
    const x = torii.x + torii.w * 0.2 - 13, y = torii.topY - 13;
    el.style.transform = "translate(" + x + "px," + y + "px)";
    crowsEl.appendChild(el);
    crows.push({ el, prop: torii, x, y, gone: false });
  }
  const pick = [];
  while (pick.length < (W < 500 ? 0 : 1) && near.length) pick.push(near.splice(Math.floor(rand() * near.length), 1)[0]);
  pick.forEach((tr) => {
    let perch = null;
    // le bout de branche le plus haut, mais assez bas pour que le corbeau reste dans l'écran
    branches.forEach((b) => { if (b.t === tr.i && b.d >= 5 && b.y2 > 44 && (!perch || b.y2 < perch.y2)) perch = b; });
    if (!perch) return;
    const el = document.createElement("div");
    el.className = "crow";
    el.innerHTML = SIT + FLY;
    el.style.transform = "translate(" + (perch.x2 - 13) + "px," + (perch.y2 - 14) + "px)";
    crowsEl.appendChild(el);
    crows.push({ el, tree: tr.i, x: perch.x2 - 13, y: perch.y2 - 14, gone: false });
  });
};

const flyAway = (c, delay, instant) => {
  if (c.gone) return;
  c.gone = true;
  if (instant || calm) { c.el.style.display = "none"; return; }
  setTimeout(() => {
    c.el.classList.add("flying");
    const dir = c.x < W / 2 ? -1 : 1;
    const to = (k, dy) => "translate(" + (c.x + dir * W * k) + "px," + (c.y + dy) + "px)";
    c.el.animate(
      [
        { transform: "translate(" + c.x + "px," + c.y + "px)", opacity: 1 },
        { transform: to(0.12, -H * 0.12), opacity: 1, offset: 0.3 },
        { transform: to(0.5, -H * 0.62), opacity: 0 },
      ],
      { duration: 3400, easing: "ease-in", fill: "forwards" }
    );
  }, Math.max(0, delay) * 1000 + 250);
};

const build = () => {
  const r = stage.getBoundingClientRect();
  W = Math.max(320, Math.floor(r.width));
  H = Math.max(240, Math.floor(r.height));
  U0 = Math.min(H, W); // l'unité de taille : la hauteur, sans dépasser ce que la largeur permet
  ground = Math.round(H - Math.max(40, H * 0.1));
  const pr = Math.min(2, window.devicePixelRatio || 1);
  renderer.setPixelRatio(pr);
  renderer.setSize(W, H, false);
  camera.right = W; camera.bottom = H;
  camera.updateProjectionMatrix();
  U.uRes.value = [W, H]; U.uGround.value = ground; U.uPR.value = pr;
  U.uMoon.value = [W * 0.78, H * 0.2, Math.min(W, H) * 0.07];

  clearWorld();
  trees = []; branches = []; tufts = []; plants = []; props = []; strokes = [];
  petals = []; motes = []; active = [];
  dawn = 0; stamped = false;
  fallingP.n = 0; landedP.n = 0; dotsP.n = 0;
  fallingP.flush(); landedP.flush(); dotsP.flush();
  progress = 0; shown = 0; finished = false;
  top.classList.remove("done");
  hanko.classList.remove("show", "now");

  const rand = rng(3);
  addWorld(quad(W, H), bgMat, 0);

  // des traits d'encre sous la ligne du sol
  for (let i = 0; i < 16; i++) {
    const my = ground + 6 + rand() * Math.max(4, H - ground - 12), mx = rand() * W, l = 20 + rand() * 90;
    strokes.push({ x1: mx, y1: my, cx: mx + l / 2, cy: my, x2: mx + l, y2: my, w0: 1, w1: 1, row: 3 });
  }
  // l'herbe morte : une touffe = un à trois brins
  for (let px = 6; px < W; px += 7 + rand() * 11) {
    const t = { x: px, h: 6 + rand() * 16, lean: (rand() - 0.5) * 10, n: 1 + Math.floor(rand() * 3), alive: FAR, s: [] };
    for (let k = 0; k < t.n; k++) {
      const bx = t.x + (k - (t.n - 1) / 2) * 2.5;
      t.s.push(strokes.length);
      strokes.push({ x1: bx, y1: ground, cx: bx, cy: ground - t.h * 0.6, x2: bx + t.lean * (0.6 + k * 0.3), y2: ground - t.h * (1 - k * 0.15), w0: 1, w1: 0.4, row: 2 });
    }
    tufts.push(t);
  }

  // les arbres : une rangée devant, une plus petite derrière
  const count = Math.max(3, Math.min(7, Math.round(W / 230)));
  const specs = [];
  for (let i = 0; i < count; i++) {
    const row = i % 2;
    specs.push({ fx: (i + 0.5) / count + (rand() - 0.5) * 0.5 / count, row, sc: row ? 0.58 + rand() * 0.14 : 0.95 + rand() * 0.3, kind: KINDS[KIND_ORDER[i % KIND_ORDER.length]] });
  }
  specs.sort((a, b) => b.row - a.row); // le fond d'abord
  specs.forEach((s, ti) => {
    const tree = { i: ti, row: s.row, x: s.fx * W, minx: 1e9, maxx: -1e9, miny: 1e9, maxy: -1e9 };
    trees.push(tree);
    const lean = (rand() < 0.5 ? -1 : 1) * s.kind.lean * (0.4 + rand() * 0.6);
    grow(tree, s.kind, rand, tree.x, ground - (s.row ? 14 : 0), -Math.PI / 2 + lean * 0.5, U0 * 0.13 * s.sc * s.kind.tall, 13 * s.sc * s.kind.thick, 0);
  });

  // le torii au loin, derrière les arbres, et deux lanternes devant : de la pierre éteinte, qui revit en rose
  const line = (x1, y1, x2, y2, w0, w1, row) => { strokes.push({ x1, y1, cx: (x1 + x2) / 2, cy: (y1 + y2) / 2, x2, y2, w0, w1, row }); return strokes.length - 1; };
  const gap = (taken, margin) => { // l'endroit le plus loin des troncs et des autres éléments, sans sortir de l'écran
    let best = W / 2, score = -1;
    for (let x = margin; x < W - margin; x += W * 0.02) {
      const sc = Math.min(...trees.map((t) => Math.abs(t.x - x)), ...taken.map((t) => Math.abs(t - x) * 0.8));
      if (sc > score) { score = sc; best = x; }
    }
    return best;
  };
  const th = U0 * 0.24, tw = th * 0.9, tx = gap([], tw * 0.7 + 8), gy = ground - 10, tt = gy - th;
  const torii = { kind: "torii", x: tx, cy: gy - th / 2, w: tw, topY: tt - th * 0.03, alive: FAR, s: [] };
  torii.s.push(
    line(tx - tw / 2, gy, tx - tw * 0.48, tt, th * 0.055, th * 0.045, 4),
    line(tx + tw / 2, gy, tx + tw * 0.48, tt, th * 0.055, th * 0.045, 4),
    line(tx - tw * 0.56, gy - th * 0.74, tx + tw * 0.56, gy - th * 0.74, th * 0.04, th * 0.04, 4)
  );
  // le chapeau du torii : une courbe dont les bouts se relèvent
  strokes.push({ x1: tx - tw * 0.64, y1: tt - th * 0.02, cx: tx, cy: tt + th * 0.1, x2: tx + tw * 0.64, y2: tt - th * 0.02, w0: th * 0.07, w1: th * 0.07, row: 4 });
  torii.s.push(strokes.length - 1);
  props.push(torii);

  branches.forEach((b) => {
    b.si = strokes.length;
    strokes.push({ x1: b.x1, y1: b.y1, cx: b.cx, cy: b.cy, x2: b.x2, y2: b.y2, w0: Math.max(1, b.w), w1: Math.max(1, b.w * 0.7), row: b.row });
  });

  [0, 1].forEach((i) => {
    const ls = U0 * 0.1, lx = gap(props.map((p) => p.x), ls * 0.8 + 8), g = ground;
    const lamp = { kind: "lanterne", x: lx, cy: g - ls * 0.5, alive: FAR, s: [] };
    lamp.s.push(
      line(lx - ls * 0.3, g - ls * 0.03, lx + ls * 0.3, g - ls * 0.03, ls * 0.1, ls * 0.1, 5), // le socle
      line(lx, g, lx, g - ls * 0.42, ls * 0.14, ls * 0.14, 5), // le pied
      line(lx - ls * 0.34, g - ls * 0.44, lx + ls * 0.34, g - ls * 0.44, ls * 0.1, ls * 0.1, 5),
      line(lx, g - ls * 0.46, lx, g - ls * 0.8, ls * 0.4, ls * 0.4, 5), // la loge de la flamme
      line(lx, g - ls * 0.54, lx, g - ls * 0.72, ls * 0.18, ls * 0.18, 6), // la flamme
      line(lx, g - ls * 0.98, lx, g - ls * 1.08, ls * 0.1, ls * 0.1, 5) // le joyau
    );
    strokes.push({ x1: lx - ls * 0.52, y1: g - ls * 0.82, cx: lx, cy: g - ls * 1.02, x2: lx + ls * 0.52, y2: g - ls * 0.82, w0: ls * 0.14, w1: ls * 0.14, row: 5 }); // le toit
    lamp.s.push(strokes.length - 1);
    props.push(lamp);
  });

  // les plantes du sol, invisibles tant que rien n'a fleuri
  for (let gx = 24 + rand() * 20; gx < W - 16; gx += 36 + rand() * 34) {
    const big = rand() < 0.4;
    plants.push({
      x: gx, big, alive: FAR, rot: rand() * TAU, ph: rand() * TAU,
      h: big ? U0 * (0.16 + rand() * 0.16) : 12 + rand() * 26,
      r: big ? (14 + rand() * 9) * Math.min(1.3, U0 / 650) : 3.5 + rand() * 3,
    });
  }

  buildStrokes();
  buildBlooms();
  buildPlants();
  buildCrows(rand);

  trees.forEach((tr) => { tr.lit = 0; tr.total = branches.filter((b) => b.t === tr.i && b.d >= 4).length; });

  // la progression : 55 % les arbres, 30 % le sol, 15 % le torii et les lanternes
  wTree = 0.55 / Math.max(1, branches.filter((b) => b.d >= 4).length);
  wPlant = 0.3 / Math.max(1, plants.length);
  wProp = 0.15 / Math.max(1, props.length);
};

/* ---------- Faire fleurir ---------- */

const setAlive = (si, t) => {
  const s = strokes[si];
  alive.fill(t, s.v0, s.v1);
};

// allume tout ce qui est dans l'ellipse (centre, rayons) : branches, fleurs, plantes, herbe
const region = (cx, cy, rx, ry, instant) => {
  const t0 = instant ? -1000 : now();
  const slow = instant || calm ? 0 : 1;
  let hit = 0;
  const norm = (x, y) => { const u = (x - cx) / (rx * 1.1), v = (y - cy) / (ry * 1.1); return u * u + v * v; };
  branches.forEach((b) => {
    if (b.alive !== FAR) return;
    const e = norm((b.x1 + b.x2) / 2, (b.y1 + b.y2) / 2);
    if (e > 1) return;
    b.alive = t0 + slow * (Math.sqrt(e) * 0.8 + b.d * 0.045); // la vie monte du centre vers les bouts
    setAlive(b.si, b.alive);
    for (let i = b.bl0; i < b.bl1; i++) {
      const t = b.alive + (bloomPos[i].ph / TAU) * 0.4 * slow;
      bloomT0.array[i] = t;
      active.push({ x: bloomPos[i].x, y: bloomPos[i].y, t0: t });
    }
    if (b.d >= 4) { progress += wTree; hit++; trees[b.t].lit++; }
  });
  props.forEach((pr) => {
    if (pr.alive !== FAR) return;
    const e = norm(pr.x, pr.cy);
    if (e > 1) return;
    pr.alive = t0 + slow * Math.sqrt(e) * 0.6;
    pr.s.forEach((si) => setAlive(si, pr.alive));
    progress += wProp; hit++;
  });
  // un corbeau part quand son torii s'allume, ou quand le tiers de son arbre a refleuri
  crows.forEach((c) => {
    const lit = c.prop ? c.prop.alive !== FAR : trees[c.tree].lit > trees[c.tree].total / 3;
    if (lit) flyAway(c, 0.2, instant);
  });
  plants.forEach((p, i) => {
    if (p.alive !== FAR) return;
    const e = norm(p.x, ground - 4);
    if (e > 1) return;
    p.alive = t0 + slow * (Math.sqrt(e) * 0.7 + Math.random() * 0.25);
    plantT0.array[i] = p.alive;
    progress += wPlant; hit++;
  });
  tufts.forEach((tf) => {
    if (tf.alive !== FAR) return;
    const e = norm(tf.x, ground);
    if (e > 1) return;
    tf.alive = t0 + slow * Math.sqrt(e) * 0.7;
    tf.s.forEach((si) => setAlive(si, tf.alive));
  });
  progress = Math.min(1, progress);
  world.forEach((m) => {
    ["aAlive", "aT0"].forEach((n) => { if (m.geometry.attributes[n]) m.geometry.attributes[n].needsUpdate = true; });
  });
  return hit;
};

const save = () => {
  try { localStorage.setItem(KEY, JSON.stringify(circles.slice(-80))); } catch (e) { /* stockage indisponible : on s'en passe */ }
};

const load = () => {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || "[]");
    if (Array.isArray(s)) circles = s.filter((c) => c && isFinite(c.x + c.y + c.rx + c.ry)).slice(-80);
  } catch (e) { circles = []; }
};

const replay = () => {
  circles.forEach((c) => region(c.x * W, c.y * H, c.rx * H, c.ry * H, true));
  shown = progress;
};

const hintText = () =>
  window.matchMedia("(pointer: coarse)").matches
    ? "dessine un cercle avec ton doigt autour d'un arbre, ou du sol"
    : "dessine un cercle autour d'un arbre, ou autour du sol";

const report = (instant) => {
  const p = Math.round(progress * 100);
  statusEl.textContent = p >= 100 ? "Tout a refleuri." : "Fleuri à " + p + " %.";
  if (!finished && progress > 0.985) {
    finished = true;
    top.classList.add("done");
    if (instant || calm) dawn = 1; // sinon, frame() lève le jour peu à peu
    if (instant) { stamped = true; hanko.classList.add("show", "now"); }
  }
};

const ring = (cx, cy, rx, ry, hit) => {
  const el = document.createElement("div");
  el.className = "ring" + (hit ? " hit" : "");
  el.style.cssText = "left:" + (cx - rx) + "px;top:" + (cy - ry) + "px;width:" + rx * 2 + "px;height:" + ry * 2 + "px";
  stage.appendChild(el);
  const a = el.animate([{ transform: "scale(1)", opacity: 1 }, { transform: "scale(1.18)", opacity: 0 }], { duration: calm ? 400 : 900, easing: "ease-out" });
  a.onfinish = () => el.remove();
};

let tourEvent = () => {}; // remplacée plus bas par la visite guidée
const bloomAt = (cx, cy, rx, ry) => {
  const hit = region(cx, cy, rx, ry, false);
  ring(cx, cy, rx, ry, hit > 0);
  if (!hit) return;
  circles.push({ x: cx / W, y: cy / H, rx: rx / H, ry: ry / H });
  save();
  report(false);
  tourEvent("bloom");
  if (!finished) hint.classList.add("off");
};

// au clavier (et pour ceux qui ne dessinent pas) : l'arbre suivant, de gauche à droite, puis le sol
const bloomNext = () => {
  const order = trees.slice().sort((a, b) => a.minx + a.maxx - b.minx - b.maxx);
  for (const tr of order) {
    if (!branches.some((b) => b.t === tr.i && b.d >= 4 && b.alive === FAR)) continue;
    bloomAt((tr.minx + tr.maxx) / 2, (tr.miny + tr.maxy) / 2, (tr.maxx - tr.minx) / 2 * 1.5, (tr.maxy - tr.miny) / 2 * 1.5);
    return;
  }
  const p = plants.find((q) => q.alive === FAR);
  if (p) { bloomAt(p.x, ground - H * 0.03, W / 6, H * 0.1); return; }
  const pr = props.find((q) => q.alive === FAR);
  if (pr) bloomAt(pr.x, pr.cy, U0 * 0.2, U0 * 0.2);
};

const reset = () => {
  circles = [];
  save();
  build();
  hint.textContent = hintText();
  hint.classList.remove("off");
  statusEl.textContent = "Tout est mort à nouveau.";
  pctEl.textContent = "0 %";
};

/* ---------- Le pinceau ---------- */

// un cercle (même ouvert, même écrasé) : assez grand, qui tourne presque d'un tour
const evaluate = () => {
  if (pts.length < 14) return;
  let len = 0, minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
  pts.forEach((p, i) => {
    if (i) len += Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y);
    minx = Math.min(minx, p.x); maxx = Math.max(maxx, p.x);
    miny = Math.min(miny, p.y); maxy = Math.max(maxy, p.y);
  });
  const w = maxx - minx, h = maxy - miny, cx = (minx + maxx) / 2, cy = (miny + maxy) / 2;
  const gap = Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y);
  let prev = Math.atan2(pts[0].y - cy, pts[0].x - cx), turn = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = Math.atan2(pts[i].y - cy, pts[i].x - cx);
    let d = a - prev;
    if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU;
    turn += d; prev = a;
  }
  const ratio = len / (w + h || 1);
  if (w > 48 && h > 36 && gap < len * 0.34 && ratio > 1.2 && ratio < 2.7 && Math.abs(turn) > 5.2) bloomAt(cx, cy, w / 2, h / 2);
};

const at = (e) => {
  const r = cv.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top, t: now(), w: 8 };
};

// quelques gouttes d'encre quand le pinceau se pose
const splash = (x, y) => {
  if (calm) return;
  for (let i = 0; i < 5; i++) {
    const a = Math.random() * TAU, v = 20 + Math.random() * 50;
    motes.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, size: 1.5 + Math.random() * 2.5, col: [0.92, 0.92, 0.92], t0: now(), life: 0.7 + Math.random() * 0.6, ink: true });
  }
};

cv.addEventListener("pointerdown", (e) => {
  if (e.button > 0) return;
  drawing = true;
  pts = [at(e)];
  splash(pts[0].x, pts[0].y);
  try { cv.setPointerCapture(e.pointerId); } catch (err) { /* pas grave */ }
  e.preventDefault();
});
cv.addEventListener("pointermove", (e) => {
  if (!drawing) return;
  const p = at(e), q = pts[pts.length - 1], d = Math.hypot(p.x - q.x, p.y - q.y);
  if (d < 2) return;
  // l'encre s'épaissit quand on va doucement
  const speed = d / Math.max(0.008, p.t - q.t);
  p.w = q.w * 0.78 + Math.max(5, Math.min(20, 20 - speed * 0.009)) * 0.22;
  pts.push(p);
  if (pts.length > MAXP) pts.shift();
});
const lift = (e) => { if (!drawing) return; drawing = false; if (e.type === "pointerup") evaluate(); };
cv.addEventListener("pointerup", lift);
cv.addEventListener("pointercancel", lift);

const updateBrush = (t) => {
  if (!drawing) while (pts.length && t - pts[0].t > 1.7) pts.shift();
  const n = pts.length;
  if (n < 2) { brushGeo.setDrawRange(0, 0); return; }
  let along = 0;
  for (let i = 0; i < n; i++) {
    const p = pts[i], a0 = pts[Math.max(i - 1, 0)], a1 = pts[Math.min(i + 1, n - 1)];
    let tx = a1.x - a0.x, ty = a1.y - a0.y;
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl; ty /= tl;
    if (i) along += Math.hypot(p.x - a0.x, p.y - a0.y);
    const a = Math.max(0, 1 - (t - p.t) / 1.7);
    const hw = (p.w / 2) * 1.8 * (1 + Math.max(0, 5 - i) * 0.2) * (0.6 + 0.4 * Math.sqrt(a)); // l'encre s'amasse au départ
    for (let k = 0; k < 2; k++) {
      const v = i * 2 + k, sg = k ? 1 : -1;
      bPos[v * 3] = p.x - ty * hw * sg; bPos[v * 3 + 1] = p.y + tx * hw * sg;
      bSide[v] = sg; bAlong[v] = along; bHW[v] = hw; bA[v] = a;
    }
  }
  ["position", "aSide", "aAlong", "aHW", "aA"].forEach((k) => { brushGeo.attributes[k].needsUpdate = true; });
  brushGeo.setDrawRange(0, (n - 1) * 6);
};

/* ---------- Ce qui tombe et ce qui flotte ---------- */

let accPetal = 0, last = now();

const simulate = (t, dt) => {
  if (!calm && active.length) {
    // des pétales tombent des fleurs (et du ciel quand tout a refleuri)
    accPetal += (Math.min(14, active.length * 0.006) + (finished ? 6 : 0)) * dt;
    while (accPetal >= 1) {
      accPetal--;
      if (petals.length >= fallingP.cap) break;
      let x, y;
      if (finished && Math.random() < 0.5) { x = Math.random() * W; y = -4; } else {
        const src = active[(Math.random() * active.length) | 0];
        if (t - src.t0 < 1) continue;
        x = src.x; y = src.y;
      }
      petals.push({ x, y, vy: 16 + Math.random() * 18, ph: Math.random() * TAU, rot: Math.random() * TAU, size: 7 + Math.random() * 3 });
    }
  }

  let n = 0;
  petals = petals.filter((p) => {
    p.y += p.vy * dt;
    p.x += Math.sin(t * 1.4 + p.ph) * 16 * dt;
    if (p.y >= ground + Math.random() * Math.max(4, (H - ground) * 0.6)) {
      if (landedP.n < landedP.cap) { // le pétale reste posé au sol
        const i = landedP.n++;
        landedP.pos[i * 3] = p.x; landedP.pos[i * 3 + 1] = p.y;
        landedP.arrs.aRot[i] = p.rot; landedP.arrs.aSize[i] = p.size * 0.6; landedP.arrs.aA[i] = 0.7;
        landedP.flush();
      }
      return false;
    }
    fallingP.pos[n * 3] = p.x; fallingP.pos[n * 3 + 1] = p.y;
    fallingP.arrs.aRot[n] = p.rot + t * 2; fallingP.arrs.aSize[n] = p.size; fallingP.arrs.aA[n] = 0.85;
    n++;
    return true;
  });
  fallingP.n = n;
  fallingP.flush();

  let m = 0;
  motes = motes.filter((p) => {
    const life = (t - p.t0) / p.life;
    if (life >= 1) return false;
    if (p.ink) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.9; p.vy *= 0.9; } else { p.y += p.vy * dt; p.x += Math.sin(t + p.ph) * 6 * dt; }
    dotsP.pos[m * 3] = p.x; dotsP.pos[m * 3 + 1] = p.y;
    dotsP.arrs.aSize[m] = p.size; dotsP.arrs.aA[m] = (p.ink ? 0.9 : 0.8) * (1 - life);
    dotsP.arrs.aCol[m * 3] = p.col[0]; dotsP.arrs.aCol[m * 3 + 1] = p.col[1]; dotsP.arrs.aCol[m * 3 + 2] = p.col[2];
    m++;
    return true;
  });
  dotsP.n = m;
  dotsP.flush();
};

const frame = () => {
  const t = now(), dt = Math.min(0.05, t - last);
  last = t;
  U.uTime.value = t;
  shown += (progress - shown) * Math.min(1, dt * 1.6);
  U.uProg.value = Math.min(1, shown * 1.05);
  // quand tout a refleuri, le jour se lève en 22 secondes, puis le sceau est tamponné
  if (finished) dawn = calm ? 1 : Math.min(1, dawn + dt / 22);
  U.uDawn.value = dawn * dawn * (3 - 2 * dawn);
  if (finished && !stamped && dawn >= 0.6) { stamped = true; hanko.classList.add("show"); }
  const pct = Math.round(shown * 100) + " %";
  if (pctEl.textContent !== pct) pctEl.textContent = pct;
  simulate(t, dt);
  updateBrush(t);
  tourTick();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
};

/* ---------- Démarrage ---------- */

/* ---------- La visite guidée ----------
   Trois bulles à la première visite : dessiner un cercle autour d'un arbre, entourer le reste, puis le bouton clavier. */

const tour = $("#tour"), tText = $("#tText"), tStep = $("#tStep"), tNextBtn = $("#tNext"), tFx = $("#tourfx"), tRing = $("#tRing"), tArrow = $("#tArrow"), nextBtn = $("#next");
const SEEN = KEY + "-vu";
let tourStep = -1;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const bigTree = () => trees.filter((t) => !t.row).sort((a, b) => (b.maxy - b.miny) - (a.maxy - a.miny))[0] || trees[0];
const TOUR = [
  { text: "Dessine un cercle au pinceau, à la souris ou au doigt, autour d'un arbre : il refleurit.", at: () => { const t = bigTree(); return { x: (t.minx + t.maxx) / 2, y: (t.miny + t.maxy) / 2, rx: (t.maxx - t.minx) / 2 * 0.95, ry: (t.maxy - t.miny) / 2 * 0.95 }; } },
  { text: "Entoure aussi le torii, les lanternes et le sol. Quand tout a refleuri, le jour se lève.", at: () => { const p = props.find((q) => q.kind === "torii") || props[0]; return { x: p.x, y: p.cy, rx: p.w * 0.75, ry: U0 * 0.17 }; } },
  { text: "Pas de souris ? « faire fleurir » fait refleurir l'élément suivant.", at: () => { const r = nextBtn.getBoundingClientRect(), s = stage.getBoundingClientRect(); return { x: r.left + r.width / 2 - s.left, y: 0, top: true }; } },
];
const tourShow = () => {
  nextBtn.classList.toggle("pulse", tourStep === 2);
  tour.hidden = tourStep < 0;
  tFx.toggleAttribute("hidden", tourStep < 0); // un SVG n'a pas de propriété hidden : c'est l'attribut qui compte
  if (tourStep < 0) return;
  tStep.textContent = "visite " + (tourStep + 1) + " / " + TOUR.length;
  tText.textContent = TOUR[tourStep].text;
  tNextBtn.textContent = tourStep === TOUR.length - 1 ? "compris" : "suivant";
  hint.classList.add("off");
  if (!calm) tour.animate([{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], { duration: 320, easing: "ease-out" });
};
const tourEnd = () => {
  tourStep = -1;
  try { localStorage.setItem(SEEN, "1"); } catch (e) { /* on s'en passe */ }
  tourShow();
};
const tourGo = (n) => { if (tourStep < 0) return; if (n >= TOUR.length) { tourEnd(); return; } tourStep = n; tourShow(); };
tourEvent = (name) => {
  if (tourStep < 0) return;
  if (name === "bloom" && tourStep < 2) { const at = tourStep; setTimeout(() => { if (tourStep === at) tourGo(at + 1); }, 1400); }
  else if (name === "next" && tourStep === 2) tourEnd();
};
// la bulle, le cercle en pointillé et la flèche suivent ce qu'ils montrent (l'écran peut changer de taille)
const tourTick = () => {
  if (tourStep < 0) return;
  const T = TOUR[tourStep].at(), bw = tour.offsetWidth, bh = tour.offsetHeight;
  const left = clamp(T.x - bw / 2, 12, W - bw - 12);
  const top = clamp(T.top ? 12 : T.y < H / 2 ? T.y + T.ry + 46 : T.y - T.ry - 46 - bh, 12, H - bh - 12);
  tour.style.left = left + "px";
  tour.style.top = top + "px";
  tFx.setAttribute("viewBox", "0 0 " + W + " " + H);
  let ex = T.x, ey = T.top ? 0 : T.y;
  if (T.rx) {
    tRing.style.display = "";
    tRing.setAttribute("cx", T.x); tRing.setAttribute("cy", T.y); tRing.setAttribute("rx", T.rx); tRing.setAttribute("ry", T.ry);
  } else tRing.style.display = "none";
  const sx = clamp(ex, left, left + bw), sy = clamp(ey, top, top + bh);
  const dx = ex - sx, dy = ey - sy, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
  const stop = T.rx ? 1 / Math.hypot(ux / T.rx, uy / T.ry) + 6 : 0; // jusqu'au bord de l'ellipse
  const ax = ex - ux * stop, ay = ey - uy * stop, a = Math.atan2(ay - sy, ax - sx);
  const h1 = [ax - Math.cos(a - 0.45) * 13, ay - Math.sin(a - 0.45) * 13], h2 = [ax - Math.cos(a + 0.45) * 13, ay - Math.sin(a + 0.45) * 13];
  tArrow.setAttribute("d", "M" + sx + " " + sy + "L" + ax + " " + ay + "L" + h1[0] + " " + h1[1] + "L" + h2[0] + " " + h2[1] + "L" + ax + " " + ay);
};
tNextBtn.addEventListener("click", () => tourGo(tourStep + 1));
$("#tSkip").addEventListener("click", tourEnd);
nextBtn.addEventListener("click", () => tourEvent("next"));
$("#help").addEventListener("click", () => { tourStep = 0; tourShow(); });

$("#next").addEventListener("click", bloomNext);
$("#reset").addEventListener("click", reset);

// la scène est reconstruite quand sa taille change (fenêtre redimensionnée, téléphone tourné, page intégrée qui s'affiche)
let timer = 0;
new ResizeObserver(() => {
  const r = stage.getBoundingClientRect();
  if (Math.floor(r.width) === W && Math.floor(r.height) === H) return;
  clearTimeout(timer);
  timer = setTimeout(() => { build(); replay(); report(true); renderer.render(scene, camera); }, 150);
}).observe(stage);

hint.textContent = hintText();
load();
build();
replay();
if (circles.length) { report(true); if (!finished) hint.classList.add("off"); }
let seenTour = false;
try { seenTour = localStorage.getItem(SEEN) === "1"; } catch (e) { /* on s'en passe */ }
if (!circles.length && !seenTour) { tourStep = 0; tourShow(); }
requestAnimationFrame(frame);
