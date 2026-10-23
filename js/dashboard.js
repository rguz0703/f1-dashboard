const $ = (id) => document.getElementById(id);
const FIRST_SEASON = 1950;
let chart = null;
let countdownTimer = null;
let loadToken = 0;

function setKpi(id, value, sub) {
  const el = $(id);
  el.textContent = value;
  el.classList.remove("skeleton");
  $(id + "s").textContent = sub || " ";
}

function shortGp(name) {
  return name.replace(" Grand Prix", "");
}

/* ---------- Selector de temporada ---------- */
function initSeasonSelect() {
  const sel = $("season");
  const thisYear = new Date().getFullYear();
  sel.innerHTML = `<option value="current">${thisYear} (actual)</option>`;
  for (let y = thisYear - 1; y >= FIRST_SEASON; y--) sel.insertAdjacentHTML("beforeend", `<option value="${y}">${y}</option>`);
  const fromUrl = new URLSearchParams(location.search).get("season");
  if (fromUrl && [...sel.options].some((o) => o.value === fromUrl)) sel.value = fromUrl;
  sel.addEventListener("change", () => {
    const url = new URL(location.href);
    if (sel.value === "current") url.searchParams.delete("season");
    else url.searchParams.set("season", sel.value);
    history.replaceState(null, "", url);
    load(sel.value);
  });
}

/* ---------- Pilotos ---------- */
function renderDrivers(list) {
  const rows = list.DriverStandings;
  const leader = Number(rows[0].points);
  $("drivers-meta").textContent = `Tras ronda ${list.round}`;
  $("drivers-body").innerHTML = `
    <table>
      <thead><tr><th>#</th><th>Piloto</th><th class="num hide-sm">Vic.</th><th class="num hide-sm">Dif.</th><th class="num">Pts</th></tr></thead>
      <tbody>${rows.map((r) => {
        const team = r.Constructors[r.Constructors.length - 1] || {};
        const gap = leader - Number(r.points);
        return `<tr>
          <td class="pos">${esc(r.positionText)}</td>
          <td><div class="driver"><span class="team-bar" style="background:${teamColor(team.constructorId)}"></span>
            <div><b>${esc(r.Driver.givenName)} ${esc(r.Driver.familyName)}</b><div class="team">${esc(team.name || "")}</div></div></div></td>
          <td class="num hide-sm">${r.wins}</td>
          <td class="num hide-sm muted">${gap === 0 ? "—" : "-" + gap}</td>
          <td class="num"><b>${r.points}</b></td>
        </tr>`;
      }).join("")}</tbody>
    </table>`;
}

/* ---------- Constructores ---------- */
function renderTeams(list) {
  const rows = list.ConstructorStandings;
  const max = Math.max(1, ...rows.map((r) => Number(r.points)));
  $("teams-meta").textContent = `${rows.length} equipos`;
  $("teams-body").innerHTML = `<div class="bars">${rows.map((r) => `
    <div class="bar-row">
      <span class="name" title="${esc(r.Constructor.name)}">${esc(r.Constructor.name.replace(" F1 Team", ""))}</span>
      <div class="bar-track"><div class="bar-fill" style="width:0;background:${teamColor(r.Constructor.constructorId)}" data-w="${(Number(r.points) / max) * 100}"></div></div>
      <span class="pts">${r.points}</span>
    </div>`).join("")}</div>`;
  requestAnimationFrame(() => document.querySelectorAll(".bar-fill").forEach((b) => (b.style.width = b.dataset.w + "%")));
}

/* ---------- Último GP ---------- */
function renderLast(race) {
  if (!race) { $("last-body").innerHTML = `<p class="empty">Aún no se ha disputado ninguna carrera.</p>`; return; }
  $("last-title").textContent = race.raceName;
  $("last-meta").textContent = `Ronda ${race.round} · ${fmtDate(raceDate(race), { day: "numeric", month: "long" })}`;
  const res = race.Results;
  const pole = res.find((r) => r.grid === "1");
  const fl = res.find((r) => r.FastestLap && r.FastestLap.rank === "1");
  const dnf = res.filter((r) => !/^\d+$/.test(r.positionText)).length;
  const gainer = res.filter((r) => Number(r.grid) > 0 && /^\d+$/.test(r.positionText))
    .map((r) => ({ r, g: Number(r.grid) - Number(r.position) }))
    .sort((a, b) => b.g - a.g)[0];

  const name = (r) => `${esc(r.Driver.givenName.charAt(0))}. ${esc(r.Driver.familyName)}`;
  const podium = res.slice(0, 3).map((r) => `
    <div><div class="p">P${r.position}</div><div class="nm">${esc(r.Driver.familyName)}</div>
    <div class="tm">${esc(r.Constructor.name)} · ${r.points} pts</div></div>`).join("");

  const chips = [
    pole && `<span class="chip">Pole <b>${name(pole)}</b></span>`,
    fl && `<span class="chip">Vuelta rápida <b>${name(fl)}</b> ${esc(fl.FastestLap.Time?.time || "")}</span>`,
    gainer && gainer.g > 0 && `<span class="chip">Más remontó <b>${name(gainer.r)}</b> +${gainer.g}</span>`,
    `<span class="chip">Abandonos <b>${dnf}</b></span>`,
  ].filter(Boolean).join("");

  const rest = res.slice(3, 10).map((r) => `<tr>
      <td class="pos">${r.position}</td>
      <td><div class="driver"><span class="team-bar" style="background:${teamColor(r.Constructor.constructorId)}"></span><b>${esc(r.Driver.familyName)}</b> <span class="team hide-sm">${esc(r.Constructor.name)}</span></div></td>
      <td class="num muted hide-sm">${esc(r.Time?.time || r.status)}</td>
      <td class="num">${r.points}</td></tr>`).join("");

  $("last-body").innerHTML = `<div class="podium">${podium}</div><div class="chips" style="margin-bottom:14px">${chips}</div>
    <table><thead><tr><th>#</th><th>Piloto</th><th class="num hide-sm">Tiempo</th><th class="num">Pts</th></tr></thead><tbody>${rest}</tbody></table>`;
}

/* ---------- Próximo GP ---------- */
function renderNext(races, season, driverList) {
  clearInterval(countdownTimer);
  const next = season === "current" ? nextRace(races) : null;

  if (!next) {
    // Temporada terminada: mostramos al campeón.
    const champ = driverList?.DriverStandings[0];
    $("next-title").textContent = "Campeón";
    $("next-round").textContent = driverList ? `Temporada ${driverList.season}` : "";
    $("next-body").innerHTML = champ ? `
      <div class="value" style="font-size:28px">${esc(champ.Driver.givenName)} ${esc(champ.Driver.familyName)}</div>
      <div class="sub">${esc(champ.Constructors.at(-1)?.name || "")}</div>
      <ul class="sessions" style="margin-top:20px">
        <li><span>Puntos</span><span>${champ.points}</span></li>
        <li><span>Victorias</span><span>${champ.wins}</span></li>
        <li><span>Carreras</span><span>${races.length}</span></li>
      </ul>` : `<p class="empty">Sin datos.</p>`;
    return;
  }

  $("next-title").textContent = next.raceName;
  $("next-round").textContent = `Ronda ${next.round}`;
  const sessions = [
    ["Libres 1", next.FirstPractice], ["Libres 2", next.SecondPractice], ["Libres 3", next.ThirdPractice],
    ["Clasif. sprint", next.SprintQualifying || next.SprintShootout], ["Sprint", next.Sprint],
    ["Clasificación", next.Qualifying],
  ].filter(([, s]) => s).map(([n, s]) => [n, sessionDate(s)]).sort((a, b) => a[1] - b[1]);
  sessions.push(["Carrera", raceDate(next)]);

  $("next-body").innerHTML = `
    <div class="sub" style="margin-bottom:12px">${esc(next.Circuit.circuitName)} · ${esc(next.Circuit.Location.locality)}, ${esc(next.Circuit.Location.country)}</div>
    <div class="countdown" id="cd"></div>
    <ul class="sessions">${sessions.map(([n, d], i) =>
      `<li class="${i === sessions.length - 1 ? "race" : ""}"><span>${n}</span><span>${fmtTime(d)}</span></li>`).join("")}</ul>`;

  const target = raceDate(next);
  const tick = () => {
    const ms = Math.max(0, target - Date.now());
    const parts = [[Math.floor(ms / 864e5), "días"], [Math.floor(ms / 36e5) % 24, "horas"], [Math.floor(ms / 6e4) % 60, "min"], [Math.floor(ms / 1e3) % 60, "seg"]];
    const cd = $("cd");
    if (cd) cd.innerHTML = parts.map(([n, u]) => `<div><div class="n">${String(n).padStart(2, "0")}</div><div class="u">${u}</div></div>`).join("");
  };
  tick();
  countdownTimer = setInterval(tick, 1000);
}

/* ---------- KPIs ---------- */
function renderKpis(drivers, teams, races, results) {
  if (drivers) {
    const [a, b] = drivers.DriverStandings;
    setKpi("k1", a.Driver.familyName, b ? `${a.points} pts · +${a.points - b.points} sobre ${b.Driver.familyName}` : `${a.points} pts`);
  } else setKpi("k1", "—", "Sin datos");
  if (teams) {
    const [a, b] = teams.ConstructorStandings;
    setKpi("k2", a.Constructor.name, b ? `${a.points} pts · +${a.points - b.points} sobre ${b.Constructor.name.replace(" F1 Team", "")}` : `${a.points} pts`);
  } else setKpi("k2", "—", "Constructores desde 1958");
  const done = results.length;
  setKpi("k3", `${done}/${races.length}`, done < races.length ? `Quedan ${races.length - done} carreras` : "Temporada completa");
  const winners = new Map();
  results.forEach((r) => { const w = r.Results[0]; if (w) winners.set(w.Driver.driverId, (winners.get(w.Driver.driverId) || 0) + 1); });
  const top = [...winners.entries()].sort((a, b) => b[1] - a[1])[0];
  const topName = top && results.flatMap((r) => r.Results).find((x) => x.Driver.driverId === top[0])?.Driver.familyName;
  setKpi("k4", String(winners.size), top ? `Más victorias: ${topName} (${top[1]})` : "");
}

/* ---------- Calendario ---------- */
function renderCalendar(races, results, season) {
  const winners = new Map(results.map((r) => [r.round, r.Results[0]]));
  const next = season === "current" ? nextRace(races) : null;
  $("cal-meta").textContent = `${races.length} rondas`;
  $("calendar").innerHTML = races.map((r) => {
    const w = winners.get(r.round);
    const cls = w ? "done" : next && next.round === r.round ? "next" : "";
    const status = w ? "" : cls === "next" ? "Próxima" : "";
    return `<div class="round ${cls}">
      <div class="r"><span>R${String(r.round).padStart(2, "0")} · ${fmtDate(raceDate(r))}</span><span>${status}</span></div>
      <div class="gp">${esc(shortGp(r.raceName))}</div>
      <div class="w">${w ? `🏁 ${esc(w.Driver.familyName)} · ${esc(w.Constructor.name.replace(" F1 Team", ""))}` : esc(r.Circuit.Location.locality)}</div>
    </div>`;
  }).join("");
}

/* ---------- Evolución de puntos ---------- */
function renderChart(drivers, results, sprints) {
  const box = document.querySelector(".chart-box");
  if (!drivers || !results.length || typeof Chart === "undefined") {
    box.innerHTML = `<p class="empty">No hay datos suficientes para la gráfica.</p>`;
    $("legend").innerHTML = "";
    return;
  }
  if (!box.querySelector("canvas")) box.innerHTML = `<canvas id="chart"></canvas>`;

  const top = drivers.DriverStandings.slice(0, 5);
  const rounds = results.map((r) => r.round);
  const sprintByRound = new Map(sprints.map((s) => [s.round, s.SprintResults]));
  const css = getComputedStyle(document.documentElement);
  const muted = css.getPropertyValue("--muted").trim();
  const line = css.getPropertyValue("--line").trim();

  const seen = {};
  const datasets = top.map((d) => {
    const id = d.Driver.driverId;
    const teamId = d.Constructors.at(-1)?.constructorId;
    let color = teamColor(teamId);
    // Si dos pilotos son del mismo equipo, el segundo va con línea discontinua.
    const dashed = seen[teamId];
    seen[teamId] = true;
    let total = 0;
    const data = results.map((race) => {
      const r = race.Results.find((x) => x.Driver.driverId === id);
      const s = (sprintByRound.get(race.round) || []).find((x) => x.Driver.driverId === id);
      total += Number(r?.points || 0) + Number(s?.points || 0);
      return total;
    });
    return {
      label: d.Driver.code || d.Driver.familyName.slice(0, 3).toUpperCase(),
      fullName: `${d.Driver.givenName} ${d.Driver.familyName}`,
      data, borderColor: color, backgroundColor: color,
      borderWidth: 2, borderDash: dashed ? [6, 4] : [], pointRadius: 0, pointHoverRadius: 4, tension: 0.25,
    };
  });

  if (chart) chart.destroy();
  chart = new Chart($("chart"), {
    type: "line",
    data: { labels: rounds.map((r) => "R" + r), datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: css.getPropertyValue("--text").trim(),
          titleColor: css.getPropertyValue("--bg").trim(),
          bodyColor: css.getPropertyValue("--bg").trim(),
          padding: 10, cornerRadius: 8, boxPadding: 4,
          itemSort: (a, b) => b.parsed.y - a.parsed.y,
          callbacks: {
            title: (items) => { const r = results[items[0].dataIndex]; return `R${r.round} · ${shortGp(r.raceName)}`; },
            label: (ctx) => ` ${ctx.dataset.fullName}: ${ctx.parsed.y} pts`,
          },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: muted, font: { family: "JetBrains Mono", size: 11 }, maxRotation: 0, autoSkipPadding: 12 }, border: { color: line } },
        y: { grid: { color: line }, ticks: { color: muted, font: { family: "JetBrains Mono", size: 11 } }, border: { display: false }, beginAtZero: true },
      },
    },
  });

  $("legend").innerHTML = datasets.map((d) =>
    `<span><i style="background:${d.borderColor}${d.borderDash.length ? ";opacity:.6" : ""}"></i>${esc(d.fullName)}</span>`).join("");
}

/* ---------- Carga ---------- */
function resetSkeletons() {
  ["k1", "k2", "k3", "k4"].forEach((id) => { $(id).classList.add("skeleton"); $(id).textContent = "—"; });
  ["next-body", "last-body"].forEach((id) => ($(id).innerHTML = `<div class="skeleton" style="height:220px"></div>`));
  ["drivers-body", "teams-body"].forEach((id) => ($(id).innerHTML = `<div class="skeleton" style="height:400px"></div>`));
  $("calendar").innerHTML = "";
  $("error").innerHTML = "";
}

async function load(season) {
  const token = ++loadToken;
  const stale = () => token !== loadToken;
  resetSkeletons();
  $("status").textContent = "Cargando datos…";

  try {
    const [races, drivers, teams, last] = await Promise.all([
      F1.schedule(season), F1.driverStandings(season), F1.constructorStandings(season), F1.lastResults(season),
    ]);
    if (stale()) return;

    const year = races[0]?.season || season;
    $("title").textContent = `Temporada ${year}`;
    document.title = `${year} · Pitwall`;
    $("status").textContent = drivers ? `Actualizado tras la ronda ${drivers.round}` : "Sin carreras disputadas todavía";

    if (drivers) renderDrivers(drivers);
    else $("drivers-body").innerHTML = `<p class="empty">Sin clasificación todavía.</p>`;
    if (teams) renderTeams(teams);
    else $("teams-body").innerHTML = `<p class="empty">No hubo campeonato de constructores este año.</p>`;
    renderLast(last);
    renderNext(races, season, drivers);

    // Resultados completos de la temporada: para KPIs, calendario y la gráfica.
    const [results, sprints] = await Promise.all([F1.allResults(season), F1.allSprints(season)]);
    if (stale()) return;
    renderKpis(drivers, teams, races, results);
    renderCalendar(races, results, season);
    renderChart(drivers, results, sprints);
  } catch (e) {
    if (stale()) return;
    console.error(e);
    $("status").textContent = "Error al cargar";
    $("error").innerHTML = `<div class="error">No se pudieron cargar los datos: ${esc(e.message)}. <a href="#" onclick="load(document.getElementById('season').value);return false" style="text-decoration:underline">Reintentar</a></div>`;
  }
}

initSeasonSelect();
load($("season").value);
