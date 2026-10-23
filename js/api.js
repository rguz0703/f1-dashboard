// Cliente mínimo para la API pública de Jolpica (sucesora de Ergast). Sin clave, sin pago.
const API_BASE = "https://api.jolpi.ca/ergast/f1";
const CACHE_TTL = 10 * 60 * 1000; // 10 minutos

const TEAM_COLORS = {
  mercedes: "#00a19c",
  ferrari: "#e8002d",
  mclaren: "#ff8000",
  red_bull: "#3671c6",
  rb: "#6692ff",
  alpine: "#ff87bc",
  haas: "#9c9fa2",
  audi: "#bb0a30",
  sauber: "#52e252",
  williams: "#1868db",
  aston_martin: "#229971",
  cadillac: "#c9a227",
};

function teamColor(id) {
  return TEAM_COLORS[id] || "#888888";
}

function readCache(key) {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const { t, data } = JSON.parse(raw);
    return Date.now() - t < CACHE_TTL ? data : null;
  } catch {
    return null;
  }
}

function writeCache(key, data) {
  try {
    sessionStorage.setItem(key, JSON.stringify({ t: Date.now(), data }));
  } catch {
    /* almacenamiento lleno o bloqueado: seguimos sin caché */
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// La API limita a ~4 peticiones/segundo, así que las peticiones se encadenan.
let queue = Promise.resolve();
function enqueue(fn) {
  const run = queue.then(fn, fn);
  queue = run.then(() => sleep(260), () => sleep(260));
  return run;
}

async function api(path) {
  const key = "f1:" + path;
  const cached = readCache(key);
  if (cached) return cached;
  return enqueue(async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await fetch(`${API_BASE}/${path}`);
      if (res.status === 429) { await sleep(1200 * (attempt + 1)); continue; }
      if (!res.ok) throw new Error(`Error ${res.status} al pedir ${path}`);
      const json = await res.json();
      writeCache(key, json.MRData);
      return json.MRData;
    }
    throw new Error("La API está limitando peticiones. Intenta de nuevo en un minuto.");
  });
}

// Descarga todas las páginas de un endpoint de carreras y une los resultados por ronda.
async function apiAllRaces(path, field) {
  const limit = 100;
  const first = await api(`${path}.json?limit=${limit}&offset=0`);
  const total = Number(first.total);
  const pages = [first];
  for (let offset = limit; offset < total; offset += limit) {
    pages.push(await api(`${path}.json?limit=${limit}&offset=${offset}`));
  }
  const byRound = new Map();
  for (const page of pages) {
    for (const race of page.RaceTable.Races) {
      const existing = byRound.get(race.round);
      if (existing) existing[field].push(...race[field]);
      else byRound.set(race.round, { ...race, [field]: [...race[field]] });
    }
  }
  return [...byRound.values()].sort((a, b) => a.round - b.round);
}

const F1 = {
  schedule: (season) => api(`${season}.json`).then((d) => d.RaceTable.Races),
  driverStandings: (season) =>
    api(`${season}/driverStandings.json`).then((d) => d.StandingsTable.StandingsLists[0] || null),
  constructorStandings: (season) =>
    api(`${season}/constructorStandings.json`).then((d) => d.StandingsTable.StandingsLists[0] || null),
  lastResults: (season) =>
    api(`${season}/last/results.json`).then((d) => d.RaceTable.Races[0] || null),
  allResults: (season) => apiAllRaces(`${season}/results`, "Results"),
  allSprints: (season) => apiAllRaces(`${season}/sprint`, "SprintResults"),
};

function raceDate(race) {
  return new Date(`${race.date}T${race.time || "12:00:00Z"}`);
}

function sessionDate(s) {
  return s ? new Date(`${s.date}T${s.time || "00:00:00Z"}`) : null;
}

function nextRace(races, now = new Date()) {
  // Una carrera sigue siendo "la próxima" hasta 3 h después de la salida.
  return races.find((r) => raceDate(r).getTime() + 3 * 3600e3 > now.getTime()) || null;
}

function fmtDate(d, opts = { day: "numeric", month: "short" }) {
  return d.toLocaleDateString("es", opts);
}

function fmtTime(d) {
  return d.toLocaleString("es", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
