import {
  WebGLRenderer, Scene, PerspectiveCamera, SphereGeometry, WireframeGeometry, BufferGeometry,
  Float32BufferAttribute, BufferAttribute, Mesh, MeshBasicMaterial, MeshLambertMaterial,
  InstancedMesh, LineSegments, LineBasicMaterial, Points, PointsMaterial, AmbientLight, PointLight,
  Matrix4, Quaternion, Vector3, Vector2, Raycaster, Plane, Color, DoubleSide,
} from "./vendor/three.module.min.js";
import { SUN_R, R_MIN, R_MAX, STEP, state, step, energy, randomBoat, makeBoat, setMass } from "./physics.js";

const $ = (s) => document.querySelector(s);

// true si la personne préfère éviter les animations : le temps s'écoule plus lentement
const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const test = /test/.test(location.hash);

const cv = $("#cv");
const stage = $("#stage");
const hint = $("#hint");
const statEl = $("#stat");
const massEl = $("#mass");
const pauseEl = $("#pause");

const GM0 = 400;
const START = 48; // bateaux au départ
const MAX = 120; // au-delà, le plus ancien disparaît
const TRAIL = 48; // points gardés par traînée
const EVERY = 6; // un point de traînée tous les 6 pas de calcul (0,05 s)

// petit générateur à graine : même ciel à chaque visite
let seed = 9;
const rnd = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/* ---------- Scène ---------- */
const renderer = new WebGLRenderer({ canvas: cv, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setClearColor(0x0d0d0d);
const scene = new Scene();
const camera = new PerspectiveCamera(50, 1, 1, 1200);

// la sphère : un remplissage sombre et un maillage de traits de 1 px
scene.add(new Mesh(new SphereGeometry(SUN_R * 0.995, 24, 16), new MeshBasicMaterial({ color: 0x111111 })));
scene.add(new LineSegments(new WireframeGeometry(new SphereGeometry(SUN_R, 16, 10)), new LineBasicMaterial({ color: 0x333333 })));

// étoiles
{
  const p = new Float32Array(500 * 3);
  for (let i = 0; i < 500; i++) {
    const u = rnd() * 2 - 1, a = rnd() * Math.PI * 2, s = Math.sqrt(1 - u * u);
    p.set([Math.cos(a) * s * 600, u * 600, Math.sin(a) * s * 600], i * 3);
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(p, 3));
  scene.add(new Points(g, new PointsMaterial({ color: 0x5a5a5a, size: 1, sizeAttenuation: false })));
}

// la lumière vient de la sphère : les bateaux sont éclairés du côté qui la regarde
scene.add(new AmbientLight(0xffffff, 0.55));
const sun = new PointLight(0xffffff, 3, 0, 0);
scene.add(sun);

/* ---------- Le bateau, en low-poly (un seul maillage dupliqué) ---------- */
function boatGeometry() {
  const T = [], C = [];
  const hull = [0.55, 0.55, 0.55], sail = [0.88, 0.88, 0.88];
  const tri = (a, b, c, col) => { T.push(...a, ...b, ...c); for (let i = 0; i < 3; i++) C.push(...col); };
  const bow = [0, 0, 1.8], sl = [-0.7, 0, -1.4], sr = [0.7, 0, -1.4], keel = [0, -0.55, -0.9];
  tri(bow, sl, sr, hull);
  tri(bow, keel, sl, hull);
  tri(bow, sr, keel, hull);
  tri(sl, keel, sr, hull);
  tri([0, 0.1, 1.0], [0, 3.1, -0.2], [0, 0.1, -1.0], sail);
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(T, 3));
  g.setAttribute("color", new Float32BufferAttribute(C, 3));
  g.computeVertexNormals(); // sans index : une normale par face, donc ombrage plat
  return g;
}
const boatMesh = new InstancedMesh(
  boatGeometry(), new MeshLambertMaterial({ vertexColors: true, side: DoubleSide }), MAX);
boatMesh.frustumCulled = false;
scene.add(boatMesh);

/* ---------- Les traînées : des traits de 1 px, rose pour le dernier bateau lancé ---------- */
const trailGeo = new BufferGeometry();
const tPos = new Float32BufferAttribute(new Float32Array(MAX * (TRAIL - 1) * 6), 3);
const tCol = new Float32BufferAttribute(new Float32Array(MAX * (TRAIL - 1) * 6), 3);
tPos.setUsage(35048); tCol.setUsage(35048); // DynamicDrawUsage
trailGeo.setAttribute("position", tPos);
trailGeo.setAttribute("color", tCol);
const trails = new LineSegments(trailGeo, new LineBasicMaterial({ vertexColors: true }));
trails.frustumCulled = false;
scene.add(trails);

/* ---------- Les bateaux ---------- */
let boats = [];
let active = null; // le dernier bateau lancé à la main

function addBoat(b) {
  b.trail = new Float32Array(TRAIL * 3);
  b.head = 0;
  b.n = 0;
  mark(b);
  boats.push(b);
  if (boats.length > MAX) {
    const old = boats.shift();
    if (old === active) active = null;
  }
  return b;
}

function mark(b) {
  b.trail[b.head * 3] = b.x; b.trail[b.head * 3 + 1] = b.y; b.trail[b.head * 3 + 2] = b.z;
  b.head = (b.head + 1) % TRAIL;
  if (b.n < TRAIL) b.n++;
}

for (let i = 0; i < START; i++) addBoat(randomBoat(rnd));

/* ---------- Caméra : on tourne autour de la sphère ---------- */
let yaw = 0.6, pitch = 0.55, dist = 150;
function placeCamera() {
  pitch = Math.max(-1.4, Math.min(1.4, pitch));
  dist = Math.max(40, Math.min(420, dist));
  camera.position.set(
    Math.sin(yaw) * Math.cos(pitch) * dist, Math.sin(pitch) * dist, Math.cos(yaw) * Math.cos(pitch) * dist);
  camera.lookAt(0, 0, 0);
}

function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(stage);

/* ---------- Lancer un bateau ---------- */
const ray = new Raycaster();
const ground = new Plane(new Vector3(0, 1, 0), 0);
const hit = new Vector3();

// Le clic vise le plan de l'orbite. Le bateau part en vitesse circulaire (facteur 1),
// donc il tourne autour de la sphère quel que soit l'endroit visé.
function launchAt(cx, cy) {
  const r = cv.getBoundingClientRect();
  ray.setFromCamera(new Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), camera);
  if (!ray.ray.intersectPlane(ground, hit)) return;
  if (Math.hypot(hit.x, hit.z) < 1e-3) hit.x = 1; // clic pile au centre : direction par défaut
  const d = Math.hypot(hit.x, hit.z);
  const k = Math.min(Math.max(d, R_MIN), R_MAX * 1.3) / d;
  launch(hit.x * k, 0, hit.z * k);
}

function launch(x, y, z) {
  active = addBoat(makeBoat(x, y, z, rnd, 1));
  hint.style.visibility = "hidden";
  try { localStorage.setItem(KEY, "1"); } catch (e) { /* stockage refusé : sans importance */ }
}

const KEY = "devtober-gravity-9";
try { if (localStorage.getItem(KEY)) hint.style.visibility = "hidden"; } catch (e) { /* idem */ }

/* ---------- Commandes ---------- */
let drag = null;
cv.addEventListener("pointerdown", (e) => {
  if (!e.isPrimary || e.button !== 0) return; // pas de clic droit ni de second doigt
  cv.setPointerCapture(e.pointerId);
  drag = { x: e.clientX, y: e.clientY, moved: 0 };
});
cv.addEventListener("pointermove", (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  drag.x = e.clientX; drag.y = e.clientY;
  drag.moved += Math.abs(dx) + Math.abs(dy);
  yaw -= dx * 0.006;
  pitch += dy * 0.006;
  placeCamera();
});
cv.addEventListener("pointerup", (e) => {
  if (drag && drag.moved < 5) launchAt(e.clientX, e.clientY);
  drag = null;
});
cv.addEventListener("pointercancel", () => { drag = null; });
cv.addEventListener("wheel", (e) => {
  e.preventDefault();
  dist *= Math.exp(e.deltaY * (e.deltaMode === 1 ? 0.03 : 0.001)); // Firefox compte en lignes
  placeCamera();
}, { passive: false });
cv.addEventListener("keydown", (e) => {
  const keys = { ArrowLeft: () => yaw -= 0.08, ArrowRight: () => yaw += 0.08, ArrowUp: () => pitch += 0.06,
    ArrowDown: () => pitch -= 0.06, "+": () => dist *= 0.9, "=": () => dist *= 0.9, "-": () => dist *= 1.1 };
  if (keys[e.key]) { keys[e.key](); placeCamera(); e.preventDefault(); }
  else if (e.key === "Enter") { launchRandom(); e.preventDefault(); }
});

// au clavier ou sans pointeur précis : un bateau au hasard, lancé de la même façon
function launchRandom() {
  const a = rnd() * Math.PI * 2, r = R_MIN + rnd() * (R_MAX - R_MIN);
  launch(Math.cos(a) * r, 0, Math.sin(a) * r);
}
$("#launch").addEventListener("click", launchRandom);

massEl.addEventListener("input", () => setMass((GM0 * massEl.value) / 100, boats));

let paused = false;
pauseEl.addEventListener("click", () => {
  paused = !paused;
  pauseEl.setAttribute("aria-pressed", paused);
  pauseEl.textContent = paused ? "reprendre" : "pause";
});

/* ---------- Boucle ---------- */
const m = new Matrix4(), q = new Quaternion(), pos = new Vector3(), scl = new Vector3(1.1, 1.1, 1.1);
const fwd = new Vector3(0, 0, 1), dir = new Vector3();
const grey = new Color(0x333333), bg = new Color(0x0d0d0d), pink = new Color(0xff0055), col = new Color();
let acc = 0, tick = 0, last = 0, statAt = 0;

function simulate(seconds) {
  acc += seconds;
  let n = 0;
  while (acc >= STEP && n++ < 20) {
    for (const b of boats) step(b);
    acc -= STEP;
    if (++tick % EVERY === 0) for (const b of boats) mark(b);
  }
  if (acc > STEP) acc = 0; // retard trop grand (onglet masqué) : on ne rattrape pas
}

function draw() {
  boatMesh.count = boats.length;
  for (let i = 0; i < boats.length; i++) {
    const b = boats[i];
    pos.set(b.x, b.y, b.z);
    dir.set(b.vx, b.vy, b.vz).normalize();
    q.setFromUnitVectors(fwd, dir);
    m.compose(pos, q, scl);
    boatMesh.setMatrixAt(i, m);
  }
  boatMesh.instanceMatrix.needsUpdate = true;

  let v = 0;
  const P = tPos.array, C = tCol.array;
  for (const b of boats) {
    col.copy(b === active ? pink : grey);
    // le point le plus ancien est à `head` quand la traînée est pleine
    const start = b.n < TRAIL ? 0 : b.head;
    for (let k = 0; k < b.n - 1; k++) {
      const i0 = ((start + k) % TRAIL) * 3, i1 = ((start + k + 1) % TRAIL) * 3;
      for (let e = 0; e < 2; e++) {
        const i = e ? i1 : i0;
        P[v] = b.trail[i]; P[v + 1] = b.trail[i + 1]; P[v + 2] = b.trail[i + 2];
        // la traînée s'éteint vers le fond du côté le plus ancien
        const f = (k + e) / (TRAIL - 1);
        C[v] = bg.r + (col.r - bg.r) * f; C[v + 1] = bg.g + (col.g - bg.g) * f; C[v + 2] = bg.b + (col.b - bg.b) * f;
        v += 3;
      }
    }
  }
  trailGeo.setDrawRange(0, v / 3);
  tPos.needsUpdate = true; tCol.needsUpdate = true;
  renderer.render(scene, camera);
}

function frame(ts) {
  const dt = Math.min((ts - last) / 1000, 0.1);
  last = ts;
  if (!paused) simulate(dt * (calm ? 0.3 : 1));
  draw();
  if (ts - statAt > 500) {
    statAt = ts;
    statEl.textContent = boats.length + " bateaux · masse " + massEl.value + " %";
  }
}

resize();
placeCamera();
if (test) {
  // le panneau intégré masqué ne reçoit pas requestAnimationFrame : on pilote à la main
  window.__gravity = { boats: () => boats, simulate, draw, energy, state, R_MIN, R_MAX, SUN_R };
  simulate(0);
  draw();
} else {
  const loop = (ts) => { frame(ts); requestAnimationFrame(loop); };
  requestAnimationFrame((ts) => { last = ts; loop(ts); });
}
