// Gravité d'un seul corps massif au centre. Pas de calcul entre les bateaux :
// avec un seul attracteur, chaque orbite est stable et ne dépend pas des autres.

export const SUN_R = 6; // rayon de la sphère
export const R_MIN = 20; // rayon de départ le plus proche
export const R_MAX = 62; // rayon de départ le plus lointain
export const R_OUT = 140; // au-delà, un bateau est remis en orbite (ne devrait pas arriver)
export const R_IN = SUN_R + 2; // en dessous, idem (le point le plus bas d'un départ normal est à 9,4)
export const STEP = 1 / 120; // pas fixe : le résultat ne dépend pas de la fréquence d'affichage

export const state = { gm: 400 };

// accélération vers le centre : a = -GM / r² dans la direction du centre
function accel(b, out) {
  const r2 = b.x * b.x + b.y * b.y + b.z * b.z;
  const k = -state.gm / (r2 * Math.sqrt(r2));
  out[0] = b.x * k;
  out[1] = b.y * k;
  out[2] = b.z * k;
}

const a = [0, 0, 0];

// leapfrog (vitesse-Verlet) : l'énergie oscille autour d'une valeur au lieu de dériver
// comme avec Euler, où les orbites s'ouvrent peu à peu ou tombent sur le centre
export function step(b, dt = STEP) {
  accel(b, a);
  b.vx += a[0] * dt * 0.5;
  b.vy += a[1] * dt * 0.5;
  b.vz += a[2] * dt * 0.5;
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.z += b.vz * dt;
  accel(b, a);
  b.vx += a[0] * dt * 0.5;
  b.vy += a[1] * dt * 0.5;
  b.vz += a[2] * dt * 0.5;
  const r = Math.hypot(b.x, b.y, b.z);
  if (r < R_IN || r > R_OUT) circularize(b, Math.min(Math.max(r, R_MIN), R_MAX));
}

// énergie par unité de masse : négative tant que le bateau est lié à la sphère
export function energy(b) {
  const r = Math.hypot(b.x, b.y, b.z);
  return 0.5 * (b.vx * b.vx + b.vy * b.vy + b.vz * b.vz) - state.gm / r;
}

// Remet le bateau sur une orbite circulaire au rayon r, dans son plan actuel
function circularize(b, r) {
  const p = Math.hypot(b.x, b.y, b.z) || 1;
  const v = Math.hypot(b.vx, b.vy, b.vz) || 1;
  const k = r / p;
  b.x *= k; b.y *= k; b.z *= k;
  const vc = Math.sqrt(state.gm / r);
  b.vx *= vc / v; b.vy *= vc / v; b.vz *= vc / v;
  // retire la part radiale pour que la vitesse soit bien tangente
  const d = (b.vx * b.x + b.vy * b.y + b.vz * b.z) / (r * r);
  b.vx -= d * b.x; b.vy -= d * b.y; b.vz -= d * b.z;
  const w = Math.hypot(b.vx, b.vy, b.vz) || 1;
  b.vx *= vc / w; b.vy *= vc / w; b.vz *= vc / w;
}

// Un bateau en (x, y, z). La vitesse est tangente, entre 0.8 et 1.1 fois la vitesse circulaire.
// La vitesse de libération vaut 1.41 fois la vitesse circulaire : on reste loin dessous, donc
// le bateau ne s'échappe jamais. Le point le plus bas de l'orbite vaut r*f²/(2-f²), soit 9 au
// pire pour r = 20, au-dessus de la sphère (6).
export function makeBoat(x, y, z, rnd, factor) {
  const r = Math.hypot(x, y, z);
  const f = factor !== undefined ? factor : 0.8 + rnd() * 0.3;
  // axe de l'orbite : proche de la verticale, un peu incliné
  let nx = (rnd() - 0.5) * 0.5, ny = 1, nz = (rnd() - 0.5) * 0.5;
  // vitesse = axe × position (perpendiculaire à la position)
  let vx = ny * z - nz * y, vy = nz * x - nx * z, vz = nx * y - ny * x;
  const l = Math.hypot(vx, vy, vz) || 1;
  const v = f * Math.sqrt(state.gm / r);
  vx = (vx / l) * v; vy = (vy / l) * v; vz = (vz / l) * v;
  return { x, y, z, vx, vy, vz };
}

// Position de départ au hasard dans un disque épais autour de la sphère
export function randomBoat(rnd) {
  const ang = rnd() * Math.PI * 2;
  const r = R_MIN + rnd() * (R_MAX - R_MIN);
  return makeBoat(Math.cos(ang) * r, (rnd() - 0.5) * r * 0.3, Math.sin(ang) * r, rnd);
}

// Quand la masse change, on garde la forme des orbites en changeant les vitesses dans le
// même rapport (une orbite liée le reste, même si la masse diminue)
export function setMass(gm, boats) {
  const k = Math.sqrt(gm / state.gm);
  for (const b of boats) { b.vx *= k; b.vy *= k; b.vz *= k; }
  state.gm = gm;
}
