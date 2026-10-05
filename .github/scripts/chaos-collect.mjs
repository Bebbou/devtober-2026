// Collecte les titres de presse régionale, garde ceux qui parlent d'un événement grave
// et les place sur la carte de France d'après la commune citée dans le titre.
//
// Usage : node chaos-collect.mjs sortie.json [precedent.json]
//
// Les flux ne gardent que quelques heures de titres : le fichier précédent est repris
// et complété, pour garder 30 jours d'historique.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const OUT = process.argv[2] || "out/events.json";
const PREV = process.argv[3];
const KEEP_DAYS = 30;
const UA = "devtober-chaos (https://github.com/Bebbou/devtober-2026)";

const FEEDS = [
  { id: "franceinfo", name: "franceinfo", url: "https://www.franceinfo.fr/titres.rss" },
  { id: "lemonde", name: "Le Monde", url: "https://www.lemonde.fr/rss/une.xml" },
  { id: "lefigaro", name: "Le Figaro", url: "https://www.lefigaro.fr/rss/figaro_actualites.xml" },
  { id: "ouestfrance", name: "Ouest-France", url: "https://www.ouest-france.fr/rss/une" },
  { id: "midilibre", name: "Midi Libre", url: "https://www.midilibre.fr/rss.xml" },
  { id: "ladepeche", name: "La Dépêche", url: "https://www.ladepeche.fr/rss.xml" },
  { id: "ici", name: "ICI", url: "https://www.francebleu.fr/rss/a-la-une.xml" },
  { id: "franceinfo-fd", name: "franceinfo", url: "https://www.franceinfo.fr/faits-divers.rss" },
  { id: "bfm", name: "BFM", url: "https://www.bfmtv.com/rss/news-24-7/" },
  { id: "liberation", name: "Libération", url: "https://www.liberation.fr/arc/outboundfeeds/rss-all/?outputType=xml" },
  { id: "lexpress", name: "L'Express", url: "https://www.lexpress.fr/rss/alaune.xml" },
  { id: "europe1", name: "Europe 1", url: "https://www.europe1.fr/rss.xml" },
  { id: "sudouest", name: "Sud Ouest", url: "https://www.sudouest.fr/rss.xml" },
  { id: "lindependant", name: "L'Indépendant", url: "https://www.lindependant.fr/rss.xml" },
  { id: "nicematin", name: "Nice-Matin", url: "https://www.nicematin.com/rss" },
  { id: "leprogres", name: "Le Progrès", url: "https://www.leprogres.fr/rss" },
  { id: "ledauphine", name: "Le Dauphiné libéré", url: "https://www.ledauphine.com/rss" },
  { id: "estrepublicain", name: "L'Est républicain", url: "https://www.estrepublicain.fr/rss" },
  { id: "dna", name: "DNA", url: "https://www.dna.fr/rss" },
  { id: "republicainlorrain", name: "Le Républicain lorrain", url: "https://www.republicain-lorrain.fr/rss" },
  ...[
    "occitanie",
    "auvergne-rhone-alpes",
    "bretagne",
    "nouvelle-aquitaine",
    "hauts-de-france",
    "grand-est",
    "pays-de-la-loire",
    "provence-alpes-cote-d-azur",
    "normandie",
    "ile-de-france",
    "bourgogne-franche-comte",
    "centre-val-de-loire",
    "corse",
  ].map((r) => ({
    id: "f3-" + r,
    name: "France 3 " + r.replace(/-/g, " "),
    url: "https://france3-regions.francetvinfo.fr/" + r + "/rss",
  })),
];

// Catégories reconnues dans le titre. La première qui correspond l'emporte.
// Chaque mot commence après une limite (pas au milieu d'un autre mot) : « orage » ne doit pas
// s'allumer dans « charançon ». Les mots trop larges (mort, brûle, explosion) sont écartés,
// ils attrapent des décès de célébrités et des expressions.
const CATS = [
  ["feu", /\b(incendi|feu de|feux de|flammes|depart de feu)/],
  ["meteo", /\b(vigilance (orange|rouge|jaune)|inondation|crue|tempete|orages?|glissement de terrain|seisme|secousse|avalanche|canicule|intemperies|submerg|fortes? (pluies?|averses)|pluies? (intenses|diluviennes)|chutes? de neige|verglas|rafales|montee des eaux)/],
  ["panne", /\b(panne|pannes|coupure d'(electricite|eau|courant)|coupure de courant|cyberattaque|penurie|fuite de gaz|effondrement|sans electricite|evacuation|confinement)/],
  ["accident", /\b(accident|collision|carambolage|deraill|naufrage|s'ecrase|choc frontal|grievement blesse|blesses? (graves?|legers?|dans)|explosion (de gaz|dans|d'un|d'une)|noyade|noye|percute)/],
  ["manif", /\b(manifestation|manifestant|blocus|blocage|greve|mobilis|emeute|barrage filtrant|heurts|affrontements|lacrymogene|interpellations?)/],
  ["violence", /\b(fusillade|coups? de feu|tue par balle|blesse par balle|attentat|attaque (au couteau|armee)|poignard|coups? de couteau|meurtre|homicide|prise d'otage|rixe|tabass|agression|braquage|reglement de comptes|narcotrafic|enlevement|kidnapp|cambriol|garde a vue|interpelle|vandal)/],
];

// Jamais sur la carte : violences sexuelles et suicides. Les rédactions s'en abstiennent
// ou anonymisent, et un point sur une carte pourrait désigner la victime ou sa famille.
const EXCLUS = /suicid|se donne la mort|se donner la mort|viol |violee|violeur|agression sexuelle|attouchement|pedocrimin|pedophil|abus sexuel|sexuel|harcelement sexuel|inceste/;
// Procès et affaires anciennes, tribunes, mises à jour sans fait : ce ne sont pas des événements
const PAS_UN_EVENEMENT = /(?:^|[^a-z])(proces|assises|tribunal|condamn\w*|requisitoire|verdict|affaire|calme|tribune|editorial|edito|chronique|mis en examen|mise en examen)(?![a-z])/;
const SIGNATURE = /,\s+par\s+\p{Lu}[\p{L}'-]+(?:\s+\p{Lu}[\p{L}'-]+)+\s*$/u;

// Départements : le centre est la moyenne des sommets du contour de 05-Chaos/france.js
const FR = JSON.parse(
  readFileSync(new URL("../../05-Chaos/france.js", import.meta.url), "utf8").match(/window\.FRANCE = (\{[\s\S]*\});/)[1],
);
const DEPS = FR.deps.map((d) => {
  const n = d.d.match(/-?\d+\.?\d*/g).map(Number);
  let sx = 0, sy = 0;
  for (let i = 0; i < n.length; i += 2) { sx += n[i]; sy += n[i + 1]; }
  const x = sx / (n.length / 2), y = sy / (n.length / 2);
  return { nom: d.n, lon: x / (FR.cos * FR.k) + FR.lon0, lat: FR.lat1 - y / FR.k };
});
// « dans l'Aude », « en Haute-Garonne » ; jamais « du Nord » (Corée du Nord) ni « Nord de la France »
const DEP_RE = new RegExp(
  "(?:dans (?:le |la |l'|l’|les )?|en )(" +
    DEPS.map((d) => d.nom).sort((a, b) => b.length - a.length).join("|") +
    ")(?![\\p{L}-])(?!\\s+(?:du|de|des)\\s)",
  "u",
);

const slug = (s) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/['’]/g, "-")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
const F3_DEPTS = "hauts-de-france/aisne auvergne-rhone-alpes/allier provence-alpes-cote-d-azur/alpes-de-haute-provence auvergne-rhone-alpes/ain provence-alpes-cote-d-azur/hautes-alpes provence-alpes-cote-d-azur/alpes-maritimes grand-est/ardennes occitanie/aude occitanie/ariege occitanie/aveyron auvergne-rhone-alpes/cantal normandie/calvados provence-alpes-cote-d-azur/bouches-du-rhone centre-val-de-loire/cher auvergne-rhone-alpes/ardeche grand-est/aube bourgogne-franche-comte/cote-d-or bretagne/cotes-d-armor nouvelle-aquitaine/charente bourgogne-franche-comte/doubs auvergne-rhone-alpes/drome nouvelle-aquitaine/charente-maritime nouvelle-aquitaine/correze normandie/eure centre-val-de-loire/eure-et-loir bretagne/finistere nouvelle-aquitaine/creuse occitanie/gard occitanie/haute-garonne occitanie/gers nouvelle-aquitaine/dordogne nouvelle-aquitaine/gironde occitanie/herault centre-val-de-loire/indre bretagne/ille-et-vilaine corse/corse-du-sud corse/haute-corse auvergne-rhone-alpes/isere bourgogne-franche-comte/jura auvergne-rhone-alpes/loire centre-val-de-loire/indre-et-loire auvergne-rhone-alpes/haute-loire pays-de-la-loire/loire-atlantique centre-val-de-loire/loir-et-cher centre-val-de-loire/loiret occitanie/lot occitanie/lozere normandie/manche grand-est/marne nouvelle-aquitaine/landes grand-est/haute-marne grand-est/meurthe-et-moselle grand-est/meuse bretagne/morbihan grand-est/moselle nouvelle-aquitaine/lot-et-garonne bourgogne-franche-comte/nievre pays-de-la-loire/maine-et-loire normandie/orne pays-de-la-loire/mayenne hauts-de-france/nord auvergne-rhone-alpes/puy-de-dome hauts-de-france/pas-de-calais occitanie/hautes-pyrenees occitanie/pyrenees-orientales grand-est/bas-rhin hauts-de-france/oise auvergne-rhone-alpes/rhone bourgogne-franche-comte/haute-saone pays-de-la-loire/sarthe auvergne-rhone-alpes/savoie nouvelle-aquitaine/pyrenees-atlantiques bourgogne-franche-comte/saone-et-loire auvergne-rhone-alpes/haute-savoie grand-est/haut-rhin normandie/seine-maritime occitanie/tarn ile-de-france/seine-et-marne ile-de-france/paris ile-de-france/yvelines occitanie/tarn-et-garonne provence-alpes-cote-d-azur/var nouvelle-aquitaine/deux-sevres provence-alpes-cote-d-azur/vaucluse hauts-de-france/somme grand-est/vosges pays-de-la-loire/vendee bourgogne-franche-comte/yonne bourgogne-franche-comte/territoire-de-belfort nouvelle-aquitaine/haute-vienne nouvelle-aquitaine/vienne ile-de-france/essonne ile-de-france/hauts-de-seine ile-de-france/val-d-oise ile-de-france/seine-saint-denis ile-de-france/val-de-marne".split(" ");
for (const path of F3_DEPTS) {
  const d = DEPS.find((x) => slug(x.nom) === path.split("/")[1]);
  if (d) FEEDS.push({ id: "f3d-" + path, name: "France 3 " + d.nom, url: "https://france3-regions.francetvinfo.fr/" + path + "/rss", dep: d.nom });
}

const norm = (s) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[-\s]+/g, " ")
    .trim();

const decode = (s) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

const tag = (block, name) => {
  const m = block.match(new RegExp("<" + name + "[^>]*>([\\s\\S]*?)</" + name + ">", "i"));
  return m ? decode(m[1]) : "";
};

// L'image de l'article quand le flux en donne une (enclosure ou media). On garde l'adresse,
// jamais le fichier : l'image reste chez le journal.
const image = (block) => {
  const enc = block.match(/<enclosure[^>]+url=["']([^"']+)["'][^>]*>/i);
  let url = enc && /image|[.](jpe?g|png|webp)/i.test(enc[0]) ? enc[1] : null;
  if (!url) {
    const m = block.match(/<media:(?:content|thumbnail)[^>]+url=["']([^"']+)["']/i);
    url = m ? m[1] : null;
  }
  if (!url) return "";
  url = url.replace(/&amp;/g, "&");
  return /^https:\/\//.test(url) ? url : "";
};

async function get(url, ms = 20000) {
  const r = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(ms), redirect: "follow" });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.text();
}

async function readFeed(feed) {
  const xml = await get(feed.url);
  const items = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || [];
  return items
    .map((b) => ({
      title: tag(b, "title"),
      desc: tag(b, "description"),
      link: tag(b, "link"),
      img: image(b),
      date: new Date(tag(b, "pubDate") || tag(b, "dc:date")),
      feed,
    }))
    .filter((i) => i.title && i.link && !isNaN(i.date) && i.date < Date.now() + 3600e3);
}

const category = (text) => {
  const n = norm(text) + " ";
  if (EXCLUS.test(n) || PAS_UN_EVENEMENT.test(n) || SIGNATURE.test(text)) return null;
  for (const [cat, re] of CATS) if (re.test(n)) return cat;
  return null;
};

// Lieux candidats : un mot à majuscule (ou plusieurs) après une préposition de lieu.
const NOM = "[A-ZÀ-Ý][\\p{L}'’]*(?:(?:-| )(?:[A-ZÀ-Ý][\\p{L}'’]*|sur|sous|en|les|le|la|de|du|des|lès|l'|d'|lez)){0,4}";
const FORT = new RegExp("(?:^|[\\s(«\"])(?:[àÀ]|au|aux|près d[eu']|près de|dans|vers|sur|à proximité d[eu'])\\s+(" + NOM + ")", "gu");

const candidates = (text) => {
  const out = [];
  for (const re of [FORT]) {
    for (const m of text.matchAll(re)) {
      let c = m[1].replace(/[’]/g, "'");
      // « à Béziers Une maison » : on coupe quand un mot court d'article suit sans nom propre
      c = c.replace(/(?:-| )(?:les|le|la|de|du|des|sur|sous|en|l'|d')$/u, "");
      if (!out.includes(c)) out.push(c);
    }
  }
  return out;
};

const communeCache = new Map();
async function commune(nom) {
  const k = norm(nom);
  if (communeCache.has(k)) return communeCache.get(k);
  let res = null;
  try {
    const url =
      "https://geo.api.gouv.fr/communes?nom=" +
      encodeURIComponent(nom) +
      "&boost=population&limit=3&fields=nom,centre,departement,population";
    const list = JSON.parse(await get(url, 10000));
    const exact = list.find((c) => norm(c.nom) === k);
    const debut = list.find((c) => norm(c.nom).startsWith(k + " ") && k.length > 3);
    const c = exact || debut;
    if (c && c.centre)
      res = { place: c.nom, dep: c.departement ? c.departement.nom : "", lon: c.centre.coordinates[0], lat: c.centre.coordinates[1] };
  } catch (e) {
    /* la commune reste inconnue, le titre est ignoré */
  }
  communeCache.set(k, res);
  return res;
}

// Les communes sont cherchées par lots, avant le tri : une requête par nom, pas une par titre
async function resolveAll(names, size = 8) {
  const queue = [...names];
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (queue.length) await commune(queue.shift());
    }),
  );
}

const locate = (item) => {
  for (const c of item.cands) {
    const r = communeCache.get(norm(c));
    if (r) return { ...r, prec: "commune" };
  }
  // pas de commune : le département cité, au centre de son contour
  const m = item.title.match(DEP_RE);
  const d = m && DEPS.find((x) => x.nom === m[1]);
  if (d) return { place: d.nom, dep: d.nom, lat: d.lat, lon: d.lon, prec: "dep" };
  const f = item.feed.dep && DEPS.find((x) => x.nom === item.feed.dep);
  if (f) return { place: f.nom, dep: f.nom, lat: f.lat, lon: f.lon, prec: "dep" };
  return null;
};

const hash = (s) => createHash("sha1").update(s).digest("hex").slice(0, 10);
const round = (n) => Math.round(n * 1e4) / 1e4;

// Même catégorie et même titre : un seul événement, placé là où la position est la plus précise.
// Les autres départements restent dans « also » : ils comptent dans la carte et dans la recherche.
function mergeStories(list) {
  const groups = new Map();
  for (const e of list) {
    const k = e.cat + "|" + norm(e.items[0].title).slice(0, 80);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(e);
  }
  const out = [];
  for (const g of groups.values()) {
    if (g.length === 1) { out.push(g[0]); continue; }
    g.sort((a, b) => (b.prec === "commune") - (a.prec === "commune") || b.items.length - a.items.length || (a.t < b.t ? 1 : -1));
    const main = g[0];
    const also = new Set(main.also || []);
    for (const o of g.slice(1)) {
      if (o.dep && o.dep !== main.dep) also.add(o.dep);
      (o.also || []).forEach((d) => { if (d !== main.dep) also.add(d); });
      for (const i of o.items) if (!main.items.some((x) => x.link === i.link)) main.items.push(i);
      if (!main.img && o.img) main.img = o.img;
      if (o.t > main.t) main.t = o.t;
    }
    if (also.size) main.also = [...also];
    out.push(main);
  }
  return out;
}

async function main() {
  let events = [];
  if (PREV) {
    try { events = (JSON.parse(readFileSync(PREV, "utf8")).events || []).filter((e) => !e.sat); } catch (e) { /* premier lancement */ }
  }
  const byId = new Map(events.map((e) => [e.id, e]));
  const stats = { lus: 0, tries: 0, places: 0, sansLieu: 0, flux: {} };

  const results = new Array(FEEDS.length);
  const queue = FEEDS.map((f, i) => i);
  await Promise.all(
    Array.from({ length: 12 }, async () => {
      while (queue.length) {
        const i = queue.shift();
        try {
          results[i] = { status: "fulfilled", value: await readFeed(FEEDS[i]) };
        } catch (e) {
          results[i] = { status: "rejected", reason: e };
        }
      }
    }),
  );
  const items = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") items.push(...r.value);
    else stats.flux[FEEDS[i].id] = "échec : " + r.reason.message;
  });
  stats.lus = items.length;

  const known = new Set(events.flatMap((e) => e.items.map((i) => i.link)));
  const todo = [];
  for (const it of items) {
    if (known.has(it.link)) continue;
    it.cat = category(it.title);
    if (!it.cat) continue;
    it.cands = [...candidates(it.title), ...candidates(it.desc)];
    todo.push(it);
  }
  await resolveAll(new Set(todo.flatMap((it) => it.cands)));

  for (const it of todo) {
    const cat = it.cat;
    stats.tries++;
    const lieu = locate(it);
    if (!lieu) { stats.sansLieu++; continue; }
    stats.places++;
    // un même fait repris par plusieurs titres : même catégorie, même commune, même jour
    const id = hash(cat + "|" + lieu.place + "|" + it.date.toISOString().slice(0, 10));
    const entry = { title: it.title, source: it.feed.name, link: it.link };
    if (it.img) entry.img = it.img;
    if (lieu.prec === "dep") stats.dep = (stats.dep || 0) + 1;
    const e = byId.get(id);
    if (e) {
      if (!e.items.some((x) => x.link === entry.link)) e.items.push(entry);
      if (!e.img && entry.img) e.img = entry.img;
    } else byId.set(id, { img: entry.img || "", id, t: it.date.toISOString(), cat, place: lieu.place, dep: lieu.dep, prec: lieu.prec, lat: round(lieu.lat), lon: round(lieu.lon), items: [entry] });
  }

  const limit = Date.now() - KEEP_DAYS * 864e5;
  const out = mergeStories([...byId.values()])
    .filter((e) => +new Date(e.t) > limit)
    .sort((a, b) => (a.t < b.t ? 1 : -1))
    .slice(0, 3000);
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify({ generated: new Date().toISOString(), events: out }));
  console.log(JSON.stringify({ ...stats, evenements: out.length }, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
