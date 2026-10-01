// Collecte les données GitHub des projets de 01-Pulse/projects.js et écrit status.json.
// Lancé par .github/workflows/pulse-data.yml avec le jeton de l'Action (5 000 appels/h),
// ce qui évite au dashboard d'appeler l'API GitHub depuis le navigateur des visiteurs (60 appels/h).
//
// Usage : node .github/scripts/pulse-status.mjs [fichier de sortie]
//
// La forme des données doit rester identique à celle que produit fetchRepo() dans
// 01-Pulse/script.js : le dashboard utilise indifféremment l'un ou l'autre.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import vm from "node:vm";

const API = process.env.GITHUB_API_URL || "https://api.github.com";
const TOKEN = process.env.GITHUB_TOKEN;
const OUT = process.argv[2] || "out/status.json";
const DAY = 86400000;

// La liste des projets est lue dans projects.js (qui définit window.PULSE) : une seule source
const sandbox = { window: {} };
vm.runInNewContext(readFileSync("01-Pulse/projects.js", "utf8"), sandbox);
const cfg = sandbox.window.PULSE;
if (!cfg || !Array.isArray(cfg.projects)) throw new Error("window.PULSE.projects introuvable dans projects.js");

async function gh(path) {
  const res = await fetch(API + path, {
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
    },
  });
  if (res.status === 404 || res.status === 409) return null; // privé, introuvable ou vide
  if (!res.ok) throw new Error(`GitHub ${res.status} sur ${path}`);
  return res.json();
}

async function collect(owner, repo) {
  const base = `/repos/${owner}/${repo}`;
  const info = await gh(base);
  if (!info) return { missing: true };

  // Pas de push depuis 30 jours : aucun commit récent possible, inutile de les demander
  const recent = Date.now() - new Date(info.pushed_at).getTime() < 31 * DAY;
  const since = new Date(Date.now() - 30 * DAY).toISOString();
  const [commits, deployments] = await Promise.all([
    recent ? gh(`${base}/commits?since=${since}&per_page=100`) : null,
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
    pushedAt: info.pushed_at,
    desc: info.description || "",
    issues: info.open_issues_count,
    htmlUrl: info.html_url,
    deploy,
  };
}

const projects = {};
let failures = 0;
for (const p of cfg.projects) {
  if (p.planned) continue; // projet à venir : rien à collecter
  const owner = p.owner || cfg.owner;
  try {
    projects[`${owner}/${p.repo}`] = await collect(owner, p.repo);
    console.log(`ok       ${owner}/${p.repo}`);
  } catch (err) {
    // On n'écrit rien pour ce projet : le dashboard le demandera lui-même à l'API
    failures++;
    console.error(`échec    ${owner}/${p.repo} : ${err.message}`);
  }
}

if (!Object.keys(projects).length) {
  console.error("Aucune donnée collectée : le fichier n'est pas écrit.");
  process.exit(1);
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), projects }, null, 2) + "\n");
console.log(`\n${Object.keys(projects).length} projet(s) écrit(s) dans ${OUT}${failures ? `, ${failures} en échec` : ""}`);
