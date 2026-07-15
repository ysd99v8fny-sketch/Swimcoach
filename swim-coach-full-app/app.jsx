const { useState, useEffect, useRef, useMemo } = React;

// ---- Minimal inline icon set (replaces lucide-react for standalone use) ---
function svgIcon(paths, viewBox = "0 0 24 24") {
  return function IconCmp({ size = 16, className = "", ...rest }) {
    return (
      <svg
        width={size}
        height={size}
        viewBox={viewBox}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        {...rest}
      >
        {paths}
      </svg>
    );
  };
}

const Icon = {
  Waves: svgIcon(
    <>
      <path d="M2 6c1.5-1.5 3.5-1.5 5 0s3.5 1.5 5 0 3.5-1.5 5 0 3.5 1.5 5 0" />
      <path d="M2 12c1.5-1.5 3.5-1.5 5 0s3.5 1.5 5 0 3.5-1.5 5 0 3.5 1.5 5 0" />
      <path d="M2 18c1.5-1.5 3.5-1.5 5 0s3.5 1.5 5 0 3.5-1.5 5 0 3.5 1.5 5 0" />
    </>
  ),
  Send: svgIcon(<path d="M22 2 11 13M22 2 15 22l-4-9-9-4 20-7Z" />),
  Plus: svgIcon(<path d="M12 5v14M5 12h14" />),
  Timer: svgIcon(
    <>
      <path d="M10 2h4M12 14l3-3" />
      <circle cx="12" cy="14" r="8" />
    </>
  ),
  X: svgIcon(<path d="M18 6 6 18M6 6l12 12" />),
  Loader2: svgIcon(<path d="M21 12a9 9 0 1 1-6.219-8.56" />),
  Anchor: svgIcon(
    <>
      <circle cx="12" cy="5" r="3" />
      <path d="M12 22V8M5 12H2a10 10 0 0 0 20 0h-3" />
    </>
  ),
};

// ---- Fixed reference data -----------------------------------------------
const TODAY = new Date("2026-07-14T09:00:00");

const RACES = [
  { id: "gz", name: "Getaria–Zarautz", date: "2026-07-19", distance: 2850, phase: "Tapering" },
  { id: "sc", name: "Salomé Campos", date: "2026-09-05", distance: 5000, phase: "Build" },
];

const RECOVERY = { start: "2026-09-15", end: "2026-10-05", label: "Torrevieja — recovery swimming" };

const TAPER_START = "2026-07-10";
const PROGRESSION_START = "2026-01-01";

const SEASON_START = "2025-09-01";
const SEASON_END = "2026-10-05";

const NOTATION_HELP = [
  ["AeL", "Aeróbico ligero"],
  ["AeM", "Aeróbico medio"],
  ["A1", "Umbral aeróbico"],
  ["A2", "Umbral anaeróbico"],
  ["pns", "Pull + buoy sin paletas"],
  ["pull", "Pull buoy"],
  ["palas", "Paletas"],
  ["aletas", "Aletas"],
];

// Target pace range per 100m (seconds) for each notation — used to flag sessions
// that ran meaningfully faster/slower than intended.
const PACE_TARGETS = {
  AeL: [102, 110],
  AeM: [100, 104],
  A1: [93, 98],
  A2: [82, 92],
  pns: [98, 108],
  pull: [95, 105],
  palas: [88, 98],
  aletas: [80, 92],
};

// Rough HR zones based on observed max HR in the training log (~172 bpm ceiling).
const MAX_HR = 172;
const HR_ZONES = [
  { key: "Z1", max: 0.6, color: "#4A8B8C", label: "Recuperación" },
  { key: "Z2", max: 0.7, color: "#7FA9AA", label: "Aeróbico ligero" },
  { key: "Z3", max: 0.8, color: "#E8C547", label: "Aeróbico medio" },
  { key: "Z4", max: 0.9, color: "#FF6B35", label: "Umbral" },
  { key: "Z5", max: 1.01, color: "#E8453C", label: "Máximo" },
];
function hrZone(hr) {
  if (!hr) return null;
  const pct = Number(hr) / MAX_HR;
  return HR_ZONES.find((z) => pct <= z.max) || HR_ZONES[HR_ZONES.length - 1];
}

const RACE_WEEK_PLAN = [
  { date: "2026-07-12", day: "Domingo 12", type: "seco", title: "Activación", detail: "20 min · movilidad de hombro y cadera + core suave, sin carga" },
  { date: "2026-07-13", day: "Lunes 13", type: "agua", title: "Piscina · 2.200m", detail: "400m AeL calentamiento · 6x150m AeM (20\") · 4x50m A2 (15\") · 300m pns vuelta a la calma" },
  { date: "2026-07-14", day: "Martes 14", type: "seco", title: "Movilidad", detail: "15-20 min · goma elástica en hombros (rotadores) + estiramientos, cero carga" },
  { date: "2026-07-15", day: "Miércoles 15", type: "agua", title: "Piscina · 1.800m", detail: "300m AeL + 4x50m progresivos · 5x200m AeM salida cada 3:30 (ritmo travesía) · 6x25m sprint técnica · 200m suave" },
  { date: "2026-07-16", day: "Jueves 16", type: "seco", title: "Descanso activo", detail: "15 min · activación ligera + estiramientos, sin running" },
  { date: "2026-07-17", day: "Viernes 17", type: "agua", title: "Piscina · 1.300m", detail: "300m AeL · 8x50m cómodo/fuerte (15\") · 4x25m sprint corto · 200m suave" },
  { date: "2026-07-18", day: "Sábado 18", type: "seco", title: "Logística + reposo", detail: "10 min movilidad muy suave · preparar neopreno y gafas · hidratación y carbohidratos · dormir bien" },
  { date: "2026-07-19", day: "Domingo 19", type: "race", title: "Getaria–Zarautz · 2.850m", detail: "Salida 11:00h" },
];

const RACE_DAY_NUTRITION = [
  { time: "07:30–08:00", label: "Desayuno principal (~3-3.5h antes)", detail: "2 tostadas de pan blanco con miel/mermelada · 1 plátano · zumo o café si es rutina · 400-500ml agua" },
  { time: "09:00", label: "Salida hacia Getaria (autobús)", detail: "Botella de agua a sorbos durante el trayecto y la espera" },
  { time: "10:15–10:30", label: "Snack + hidratación (30-45 min antes)", detail: "Medio plátano o dátiles · últimos sorbos de agua o isotónica, no en exceso" },
  { time: "10:50", label: "Últimos minutos", detail: "Nada de comida, solo colocarse tranquilo" },
  { time: "11:00", label: "Salida 🏁", detail: "" },
  { time: "~11:50", label: "Meta — primeros 30-60 min", detail: "Agua + electrolitos inmediatos · bocadillo o fruta + frutos secos · buscar sombra rápido (ola de calor prevista)" },
];

const BUILD_PLAN = [
  { block: "Semana post-Getaria (20–26 jul)", title: "Recuperación activa", detail: "2 sesiones muy suaves, 1.500-2.000m AeL/pns. Sin series, solo soltar piernas y brazos." },
  { block: "Semanas 2–4 (27 jul – 16 ago)", title: "Retoma de volumen", detail: "Vuelta a 2.800-3.100m, 3 sesiones/semana. Reintroducir A1 progresivamente; AeM como base del volumen." },
  { block: "Semanas 5–6 (17–30 ago)", title: "Bloque específico 5.000m", detail: "Series largas AeM/A1 (400-800m), 1 sesión semanal por encima de 3.200m para habituar el cuerpo a la distancia de Salomé." },
  { block: "Última semana (31 ago – 4 sep)", title: "Taper corto", detail: "Igual que Getaria pero más breve — 4-5 días, bajando volumen y manteniendo algo de intensidad (A2 corto)." },
  { block: "5 sep", title: "Salomé Campos · 5.000m", detail: "" },
];

const SYSTEM_CONTEXT = `Eres el entrenador personal de natación de Anton, nadador de aguas abiertas afincado en Vitoria-Gasteiz.
Contexto fijo que debes respetar siempre:
- Próxima travesía: Getaria–Zarautz, 2850m, 19 de julio de 2026 (está en fase de puesta a punto / taper).
- Siguiente objetivo: Salomé Campos, 5000m, 5 de septiembre de 2026 (fase de construcción tras Getaria).
- Bloque de recuperación en Torrevieja del 15 sept al 5 oct (nado suave, sin objetivos de rendimiento).
- Volumen habitual: 2–3 sesiones de piscina por semana, tope de 90 minutos de agua por sesión, 2800–3100m por sesión salvo semanas de descarga.
- Notación española: AeL (aeróbico ligero), AeM (aeróbico medio), A1 (umbral aeróbico), A2 (umbral anaeróbico), pns (pull sin paletas), pull, palas, aletas.
- Ritmo en aguas abiertas ≈ 1:45–1:50/100m; ritmo en piscina ≈ 1:35/100m. Son cosas distintas, no las compares directamente.
- El sensor óptico de FC de su Garmin no es fiable nadando en piscina: los picos de FC en los virajes son artefactos del sensor, no esfuerzo real. No saques conclusiones fisiológicas de esos picos.
- Responde siempre en español, tono cercano de entrenador, directo y breve salvo que pidan detalle. Si propones un entrenamiento, estructúralo por bloques (calentamiento, cuerpo, vuelta a la calma) con distancias y notación.`;

function daysBetween(a, b) {
  return Math.ceil((new Date(b) - new Date(a)) / 86400000);
}
function fmtDate(d) {
  return new Date(d).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
}
function uid() {
  return Math.random().toString(36).slice(2, 10);
}
function paceToSeconds(pace) {
  if (!pace) return null;
  const [m, s] = pace.split(":").map(Number);
  if (Number.isNaN(m) || Number.isNaN(s)) return null;
  return m * 60 + s;
}
function getWeekStart(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay(); // 0=Sun..6=Sat
  const diff = (day === 0 ? -6 : 1) - day; // move to Monday
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}
function groupByWeek(sessions) {
  const groups = {};
  sessions.forEach((s) => {
    const wk = getWeekStart(s.date);
    if (!groups[wk]) groups[wk] = { weekStart: wk, items: [], meters: 0 };
    groups[wk].items.push(s);
    if (s.type !== "seco") groups[wk].meters += s.distance || 0;
  });
  return Object.values(groups).sort((a, b) => (a.weekStart < b.weekStart ? 1 : -1));
}

// ---- Seed data pulled from Strava (swims, most recent first) --------------
// ---- Wave divider ---------------------------------------------------------
function WaveDivider({ color = "#4A8B8C", opacity = 0.5 }) {
  return (
    <svg viewBox="0 0 400 16" preserveAspectRatio="none" className="w-full h-4 wave-svg" style={{ opacity }}>
      <path
        d="M0,8 C 20,0 40,16 60,8 C 80,0 100,16 120,8 C140,0 160,16 180,8 C200,0 220,16 240,8 C260,0 280,16 300,8 C320,0 340,16 360,8 C380,0 400,16 400,8"
        fill="none"
        stroke={color}
        strokeWidth="1.5"
      />
    </svg>
  );
}

// ---- Tide-chart timeline ---------------------------------------------------
function TideTimeline() {
  const start = new Date(SEASON_START).getTime();
  const end = new Date(SEASON_END).getTime();
  const total = end - start;
  const pct = (d) => ((new Date(d).getTime() - start) / total) * 100;

  const segments = [
    { from: SEASON_START, to: PROGRESSION_START, label: "Base", color: "#3E5A68" },
    { from: PROGRESSION_START, to: TAPER_START, label: "Progresión", color: "#5C8A99" },
    { from: TAPER_START, to: RACES[0].date, label: "Taper", color: "#FF6B35" },
    { from: RACES[0].date, to: RACES[1].date, label: "Build", color: "#4A8B8C" },
    { from: RECOVERY.start, to: RECOVERY.end, label: "Recuperación", color: "#7FA9AA" },
  ];

  return (
    <div className="w-full">
      <div className="relative h-10 rounded-full bg-[#0E2634] overflow-hidden border border-[#1E3D4F]">
        {segments.map((s, i) => (
          <div
            key={i}
            className="absolute top-0 h-full"
            style={{
              left: `${pct(s.from)}%`,
              width: `${pct(s.to) - pct(s.from)}%`,
              background: s.color,
              opacity: 0.35,
            }}
          />
        ))}
        {/* today marker */}
        <div
          className="absolute top-0 h-full w-0.5 bg-[#EAF2F2]"
          style={{ left: `${pct(TODAY.toISOString())}%` }}
        />
        {RACES.map((r) => (
          <div
            key={r.id}
            className="absolute -top-1 flex flex-col items-center"
            style={{ left: `${pct(r.date)}%`, transform: "translateX(-50%)" }}
          >
            <Icon.Anchor size={12} className="text-[#FF6B35]" />
          </div>
        ))}
      </div>
      <div className="flex justify-between mt-2 text-[10px] uppercase tracking-wider text-[#9FB8C4] font-mono">
        <span>{fmtDate(SEASON_START)}</span>
        <span className="text-[#EAF2F2]">hoy</span>
        <span>{fmtDate(SEASON_END)}</span>
      </div>
    </div>
  );
}

// ---- Monthly volume bar chart ---------------------------------------------
function MonthlyVolumeChart({ sessions }) {
  const monthly = useMemo(() => {
    const groups = {};
    sessions.forEach((s) => {
      if (s.type === "seco") return;
      const ym = s.date.slice(0, 7);
      if (!groups[ym]) groups[ym] = 0;
      groups[ym] += s.distance || 0;
    });
    return Object.entries(groups)
      .map(([ym, meters]) => ({
        ym,
        meters,
        label: new Date(ym + "-01").toLocaleDateString("es-ES", { month: "short", year: "2-digit" }),
      }))
      .sort((a, b) => (a.ym < b.ym ? -1 : 1));
  }, [sessions]);

  if (monthly.length === 0) {
    return <div className="text-sm text-[#5A7A87] font-mono">Sin datos de volumen todavía.</div>;
  }

  const max = Math.max(...monthly.map((m) => m.meters));
  const currentYm = `${TODAY.getFullYear()}-${String(TODAY.getMonth() + 1).padStart(2, "0")}`;

  return (
    <div className="w-full">
      <div className="flex items-end gap-1.5 h-32">
        {monthly.map((m) => {
          const isCurrent = m.ym === currentYm;
          const h = Math.max(4, (m.meters / max) * 100);
          return (
            <div key={m.ym} className="flex-1 flex flex-col items-center justify-end h-full group relative">
              <span className="text-[9px] font-mono text-[#7FA9AA] mb-1 opacity-0 group-hover:opacity-100 transition-opacity absolute -top-4">
                {(m.meters / 1000).toFixed(1)}km
              </span>
              <div
                className="w-full rounded-t-sm transition-colors"
                style={{
                  height: `${h}%`,
                  background: isCurrent ? "transparent" : "#4A8B8C",
                  border: isCurrent ? "1.5px dashed #FF6B35" : "none",
                  opacity: isCurrent ? 1 : 0.55,
                }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex gap-1.5 mt-2">
        {monthly.map((m) => (
          <div key={m.ym} className="flex-1 text-center text-[9px] font-mono text-[#7FA9AA] uppercase">
            {m.label}
          </div>
        ))}
      </div>
      <div className="text-[10px] font-mono text-[#5A7A87] mt-2">
        {monthly.find((m) => m.ym === currentYm) && <span>· mes en curso (borde naranja) — datos parciales</span>}
      </div>
    </div>
  );
}


// ---- Pace-by-month/phase chart ---------------------------------------------
function phaseForDate(dateStr) {
  if (dateStr < PROGRESSION_START) return { key: "base", label: "Base", color: "#3E5A68" };
  if (dateStr < TAPER_START) return { key: "prog", label: "Progresión", color: "#5C8A99" };
  return { key: "taper", label: "Taper", color: "#FF6B35" };
}

function PaceByPhaseChart({ sessions }) {
  const [showAll, setShowAll] = useState(false);
  const monthlyAll = useMemo(() => {
    const groups = {};
    sessions.forEach((s) => {
      const secs = paceToSeconds(s.pace);
      if (!secs) return;
      const ym = s.date.slice(0, 7);
      if (!groups[ym]) groups[ym] = { total: 0, count: 0, date: s.date };
      groups[ym].total += secs;
      groups[ym].count += 1;
    });
    return Object.entries(groups)
      .map(([ym, g]) => ({ ym, avgSec: g.total / g.count, date: g.date }))
      .sort((a, b) => (a.ym < b.ym ? -1 : 1));
  }, [sessions]);

  if (monthlyAll.length === 0) {
    return <div className="text-sm text-[#5A7A87] font-mono">Sin datos de ritmo suficientes todavía.</div>;
  }

  const monthly = showAll ? monthlyAll : monthlyAll.slice(-6);
  const fastest = Math.min(...monthly.map((m) => m.avgSec));
  const slowest = Math.max(...monthly.map((m) => m.avgSec));
  const range = slowest - fastest || 1;

  return (
    <div className="w-full">
      <div className="flex items-end gap-1.5 h-28">
        {monthly.map((m) => {
          // faster pace (lower seconds) -> taller bar, visually "better"
          const h = 20 + ((slowest - m.avgSec) / range) * 80;
          const phase = phaseForDate(m.date);
          const mm = Math.floor(m.avgSec / 60);
          const ss = Math.round(m.avgSec % 60);
          return (
            <div key={m.ym} className="flex-1 flex flex-col items-center justify-end h-full group relative">
              <span className="text-[9px] font-mono text-[#7FA9AA] mb-1 opacity-0 group-hover:opacity-100 transition-opacity absolute -top-4 whitespace-nowrap">
                {mm}:{String(ss).padStart(2, "0")}/100m
              </span>
              <div
                className="w-full rounded-t-sm"
                style={{ height: `${h}%`, background: phase.color, opacity: 0.8 }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex gap-1.5 mt-2">
        {monthly.map((m) => (
          <div key={m.ym} className="flex-1 text-center text-[9px] font-mono text-[#7FA9AA] uppercase">
            {m.ym.slice(5)}/{m.ym.slice(2, 4)}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between mt-2">
        <span className="text-[10px] font-mono text-[#5A7A87]">barras más altas = ritmo más rápido ese mes</span>
        {monthlyAll.length > 6 && (
          <button
            onClick={() => setShowAll((v) => !v)}
            className="text-[10px] font-mono text-[#4A8B8C] hover:text-[#7FA9AA] transition-colors underline underline-offset-2"
          >
            {showAll ? "ver últimos 6 meses" : `ver todo (${monthlyAll.length} meses)`}
          </button>
        )}
      </div>
    </div>
  );
}


// ---- Pace sparkline (mini trend vs previous 3 sessions) -------------------
function Sparkline({ values }) {
  // values: array of seconds/100m, oldest first, last item = current session
  if (values.length < 2) return null;
  const w = 40, h = 16, pad = 2;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (w - pad * 2);
    // faster (lower seconds) -> higher on the sparkline
    const y = pad + ((v - min) / range) * (h - pad * 2);
    return `${x},${y}`;
  });
  const last = values[values.length - 1];
  const prevAvg = values.slice(0, -1).reduce((a, b) => a + b, 0) / (values.length - 1);
  const improving = last < prevAvg;
  return (
    <svg width={w} height={h} className="shrink-0">
      <polyline points={pts.join(" ")} fill="none" stroke={improving ? "#4A8B8C" : "#FF6B35"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}


// ---- Training load model (CTL/ATL/TSB) -------------------------------
// Simplified fitness/fatigue/form model (Coggan PMC-style), using distance
// as a load proxy since we don't have a power/pace-based TSS from Strava
// for open-water swims. Not medically precise — a personal training aid.
function buildLoadSeries(sessions) {
  const byDate = {};
  sessions.forEach((s) => {
    if (s.type === "seco") return;
    if (!byDate[s.date]) byDate[s.date] = 0;
    byDate[s.date] += (s.distance || 0) / 50; // arbitrary but consistent scaling
  });
  return byDate;
}

function computeFitnessForm(sessions) {
  if (sessions.length === 0) return null;
  const byDate = buildLoadSeries(sessions);
  const dates = Object.keys(byDate).sort();
  if (dates.length === 0) return null;

  const start = new Date(dates[0] + "T00:00:00");
  const end = TODAY;
  const days = Math.max(1, Math.round((end - start) / 86400000) + 1);

  let ctl = 0, atl = 0;
  const series = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const ds = d.toISOString().slice(0, 10);
    const load = byDate[ds] || 0;
    ctl = ctl + (load - ctl) / 42;
    atl = atl + (load - atl) / 7;
    series.push({ date: ds, ctl, atl, tsb: ctl - atl });
  }
  return series;
}

function formLabel(tsb) {
  if (tsb > 25) return { label: "Forma máxima", color: "#4A8B8C", note: "riesgo de estar perdiendo forma si dura mucho" };
  if (tsb > 5) return { label: "Fresco", color: "#7FA9AA", note: "buen momento para exigir o competir" };
  if (tsb > -10) return { label: "Neutral", color: "#E8C547", note: "manteniendo carga" };
  if (tsb > -30) return { label: "Cansado", color: "#FF6B35", note: "construyendo fitness, fatiga acumulada normal" };
  return { label: "Riesgo de sobreentrenamiento", color: "#E8453C", note: "considera bajar carga" };
}

function FitnessForm({ sessions }) {
  const series = useMemo(() => computeFitnessForm(sessions), [sessions]);
  if (!series || series.length === 0) {
    return <div className="text-sm text-[#5A7A87] font-mono">Sin datos suficientes todavía.</div>;
  }
  const last = series[series.length - 1];
  const form = formLabel(last.tsb);
  const recent = series.slice(-42); // last 6 weeks for the sparkline

  const maxAbs = Math.max(...recent.map((p) => Math.abs(p.tsb)), 10);

  return (
    <div className="w-full">
      <div className="flex flex-wrap items-end gap-6 mb-4">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-wider text-[#5A7A87]">CTL · fitness</div>
          <div className="font-display text-2xl text-[#4A8B8C]">{last.ctl.toFixed(0)}</div>
        </div>
        <div>
          <div className="font-mono text-[10px] uppercase tracking-wider text-[#5A7A87]">ATL · fatiga</div>
          <div className="font-display text-2xl text-[#FF6B35]">{last.atl.toFixed(0)}</div>
        </div>
        <div>
          <div className="font-mono text-[10px] uppercase tracking-wider text-[#5A7A87]">TSB · forma</div>
          <div className="font-display text-2xl" style={{ color: form.color }}>
            {last.tsb > 0 ? "+" : ""}
            {last.tsb.toFixed(0)}
          </div>
        </div>
        <div className="flex-1 min-w-[140px]">
          <span
            className="font-mono text-[11px] rounded-full px-3 py-1 inline-block"
            style={{ background: `${form.color}22`, color: form.color }}
          >
            {form.label}
          </span>
          <div className="text-[10px] text-[#5A7A87] mt-1">{form.note}</div>
        </div>
      </div>

      <div className="h-16 flex items-end gap-[1px]">
        {recent.map((p, i) => {
          const h = 4 + (Math.abs(p.tsb) / maxAbs) * 56;
          const isPositive = p.tsb >= 0;
          return (
            <div
              key={p.date}
              className="flex-1"
              style={{
                height: `${h}px`,
                alignSelf: isPositive ? "flex-end" : "flex-start",
                background: isPositive ? "#7FA9AA" : "#FF6B35",
                opacity: 0.7,
              }}
              title={`${p.date}: TSB ${p.tsb.toFixed(1)}`}
            />
          );
        })}
      </div>
      <div className="text-[10px] font-mono text-[#5A7A87] mt-1">últimas 6 semanas · barras hacia arriba = forma positiva</div>
    </div>
  );
}

// ---- Training heatmap (GitHub-style, last 26 weeks) ------------------
function TrainingHeatmap({ sessions }) {
  const byDate = useMemo(() => {
    const map = {};
    sessions.forEach((s) => {
      if (s.type === "seco") return;
      map[s.date] = (map[s.date] || 0) + (s.distance || 0);
    });
    return map;
  }, [sessions]);

  const weeks = 26;
  const end = getWeekStart(TODAY.toISOString().slice(0, 10));
  const endDate = new Date(end + "T00:00:00");
  endDate.setDate(endDate.getDate() + 6);
  const start = new Date(endDate);
  start.setDate(start.getDate() - weeks * 7 + 1);

  const columns = [];
  for (let w = 0; w < weeks; w++) {
    const days = [];
    for (let d = 0; d < 7; d++) {
      const dt = new Date(start);
      dt.setDate(dt.getDate() + w * 7 + d);
      const ds = dt.toISOString().slice(0, 10);
      days.push({ date: ds, meters: byDate[ds] || 0 });
    }
    columns.push(days);
  }

  const bucket = (m) => {
    if (m === 0) return "#142F42";
    if (m < 1500) return "#1E3D4F";
    if (m < 2500) return "#2E6470";
    if (m < 3500) return "#4A8B8C";
    return "#7FA9AA";
  };

  return (
    <div className="w-full overflow-x-auto">
      <div className="flex gap-[3px] w-max">
        {columns.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-[3px]">
            {week.map((day) => (
              <div
                key={day.date}
                className="w-[10px] h-[10px] rounded-sm"
                style={{ background: bucket(day.meters) }}
                title={`${day.date}: ${day.meters ? day.meters + "m" : "descanso"}`}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-1.5 mt-2 text-[9px] font-mono text-[#5A7A87]">
        <span>menos</span>
        {["#142F42", "#1E3D4F", "#2E6470", "#4A8B8C", "#7FA9AA"].map((c) => (
          <span key={c} className="w-[10px] h-[10px] rounded-sm" style={{ background: c }} />
        ))}
        <span>más</span>
      </div>
    </div>
  );
}

// ---- Main app ---------------------------------------------------------
function SwimCoach() {
  const [sessions, setSessions] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ type: "agua", distance: "", pace: "", hr: "", notation: "", notes: "" });
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");

  const [messages, setMessages] = useState([
    {
      role: "assistant",
      text: "Hola Anton. Quedan pocos días para Getaria–Zarautz — estamos en fase de puesta a punto. Pregúntame lo que quieras sobre tu próxima sesión, o pídeme que te la genere.",
    },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const chatEndRef = useRef(null);

  const nextRace = RACES.find((r) => new Date(r.date) >= TODAY) || RACES[RACES.length - 1];
  const daysLeft = daysBetween(TODAY, nextRace.date);

  const loadSessions = async () => {
    try {
      const res = await fetch("/api/sessions");
      const data = await res.json();
      setSessions(Array.isArray(data) ? data : []);
      try {
        localStorage.setItem("swimcoach_sessions_cache", JSON.stringify(data));
      } catch (e) {}
    } catch (e) {
      // offline fallback: use last cached copy from localStorage
      try {
        const cached = localStorage.getItem("swimcoach_sessions_cache");
        if (cached) setSessions(JSON.parse(cached));
      } catch (e2) {}
    }
    setLoaded(true);
  };

  useEffect(() => {
    loadSessions();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  const runSync = async () => {
    setSyncing(true);
    setSyncMsg("");
    try {
      const res = await fetch("/api/strava/sync");
      const data = await res.json();
      if (data.ok) {
        setSyncMsg(`✓ ${data.swims_found} nados encontrados, ${data.total_stored} en total`);
        await loadSessions();
      } else {
        setSyncMsg(`Error: ${data.error}`);
      }
    } catch (e) {
      setSyncMsg("No se pudo conectar con el servidor.");
    }
    setSyncing(false);
  };

  const addSession = async () => {
    if (!form.distance && form.type === "agua") return;
    const newSession = {
      id: uid(),
      type: form.type,
      date: new Date().toISOString().slice(0, 10),
      distance: Number(form.distance) || 0,
      pace: form.pace,
      hr: form.hr,
      notation: form.notation,
      notes: form.notes,
    };
    // optimistic update
    setSessions((prev) => [newSession, ...prev]);
    setForm({ type: "agua", distance: "", pace: "", hr: "", notation: "", notes: "" });
    setShowForm(false);
    try {
      await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newSession),
      });
    } catch (e) {
      // will show up again next successful loadSessions() from the KV copy if this failed silently
    }
  };

  const recentSummary = useMemo(() => {
    if (sessions.length === 0) return "Sin sesiones registradas todavía.";
    return sessions
      .slice(0, 6)
      .map((s) => `${s.date}: ${s.distance}m${s.pace ? `, ritmo ${s.pace}/100m` : ""}${s.hr ? `, FC media ${s.hr}` : ""}${s.notation ? `, [${s.notation}]` : ""}`)
      .join("\n");
  }, [sessions]);

  const send = async () => {
    if (!input.trim() || sending) return;
    const userMsg = { role: "user", text: input.trim() };
    const history = [...messages, userMsg];
    setMessages(history);
    setInput("");
    setSending(true);

    try {
      const apiMessages = history
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({ role: m.role, content: m.text }));

      const response = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages }),
      });
      const data = await response.json();
      if (data.error) {
        setMessages((prev) => [...prev, { role: "assistant", text: `Error: ${data.error}` }]);
      } else {
        setMessages((prev) => [...prev, { role: "assistant", text: data.text || "No he podido generar respuesta." }]);
      }
    } catch (e) {
      setMessages((prev) => [...prev, { role: "assistant", text: "Ha fallado la conexión con el entrenador. Inténtalo de nuevo." }]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#0B1F2E] text-[#EAF2F2]" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');
        .font-display { font-family: 'Oswald', sans-serif; }
        .font-mono { font-family: 'IBM Plex Mono', monospace; }
        @keyframes waveSway {
          0%, 100% { transform: translateX(0); }
          50% { transform: translateX(-6px); }
        }
        .wave-svg { animation: waveSway 6s ease-in-out infinite; }
      `}</style>

      <div className="max-w-4xl mx-auto px-5 py-8">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 mb-6 text-[#7FA9AA] flex-wrap">
          <div className="flex items-center gap-2">
            <Icon.Waves size={18} />
            <span className="font-mono text-[11px] tracking-[0.2em] uppercase">Cuaderno de entrenamiento — Anton</span>
          </div>
          <div className="flex items-center gap-2">
            {syncMsg && <span className="text-[10px] font-mono text-[#5A7A87]">{syncMsg}</span>}
            <button
              onClick={runSync}
              disabled={syncing}
              className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wide bg-[#142F42] hover:bg-[#1B3B52] disabled:opacity-50 border border-[#1E3D4F] rounded-full px-3 py-1.5 transition-colors"
            >
              <Icon.Loader2 size={12} className={syncing ? "animate-spin" : ""} />
              {syncing ? "sincronizando..." : "sincronizar Strava"}
            </button>
          </div>
        </div>

        {/* Hero */}
        <div className="mb-8">
          <div className="flex items-end gap-4 flex-wrap">
            <div
              className="font-display text-[88px] leading-none font-semibold tabular-nums transition-colors duration-700"
              style={{ color: daysLeft <= 3 ? "#E8453C" : daysLeft <= 10 ? "#FF6B35" : "#4A8B8C" }}
            >
              {daysLeft}
            </div>
            <div className="pb-3">
              <div className="font-display text-xl uppercase tracking-wide">días hasta {nextRace.name}</div>
              <div className="text-[#9FB8C4] text-sm font-mono mt-1">
                {fmtDate(nextRace.date)} · {nextRace.distance.toLocaleString("es-ES")}m · fase {nextRace.phase}
              </div>
            </div>
          </div>
          <div className="mt-2 text-sm text-[#9FB8C4] max-w-xl">
            Última semana de puesta a punto. Volumen bajo, intensidad mantenida, prioridad al descanso.
          </div>
        </div>

        <WaveDivider />

        {/* Timeline */}
        <div className="my-8">
          <div className="font-display uppercase text-sm tracking-wider text-[#9FB8C4] mb-3">Temporada — sep 25 a oct 26</div>
          <TideTimeline />
          <div className="flex gap-3 mt-3 flex-wrap text-[11px] font-mono text-[#9FB8C4]">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: "#3E5A68" }} />Base</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: "#5C8A99" }} />Progresión</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: "#FF6B35" }} />Taper</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: "#4A8B8C" }} />Build</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: "#7FA9AA" }} />Recuperación (Torrevieja)</span>
          </div>

          <div className="mt-6">
            <div className="font-display uppercase text-xs tracking-wider text-[#9FB8C4] mb-2">Volumen mensual</div>
            <MonthlyVolumeChart sessions={sessions} />
          </div>

          <div className="mt-6">
            <div className="font-display uppercase text-xs tracking-wider text-[#9FB8C4] mb-2">Ritmo medio por mes</div>
            <PaceByPhaseChart sessions={sessions} />
          </div>
        </div>

        <WaveDivider color="#1E3D4F" opacity={1} />

        {/* Fitness / Fatigue / Form */}
        <div className="my-8">
          <div className="font-display uppercase text-sm tracking-wider text-[#9FB8C4] mb-1">Forma (fitness / fatiga)</div>
          <div className="text-[11px] text-[#5A7A87] font-mono mb-3">
            modelo simplificado CTL/ATL/TSB basado en volumen — orientativo, no un TSS real
          </div>
          <FitnessForm sessions={sessions} />
        </div>

        <WaveDivider color="#1E3D4F" opacity={1} />

        {/* Training heatmap */}
        <div className="my-8">
          <div className="font-display uppercase text-sm tracking-wider text-[#9FB8C4] mb-3">Calendario de entrenamiento — últimas 26 semanas</div>
          <TrainingHeatmap sessions={sessions} />
        </div>

        <WaveDivider color="#1E3D4F" opacity={1} />

        {/* Session log */}
        <div className="my-8">
          <div className="flex items-center justify-between mb-3">
            <div className="font-display uppercase text-sm tracking-wider text-[#9FB8C4]">Sesiones registradas</div>
            <button
              onClick={() => setShowForm((s) => !s)}
              className="flex items-center gap-1 text-xs font-mono uppercase tracking-wide bg-[#142F42] hover:bg-[#1B3B52] border border-[#1E3D4F] rounded-full px-3 py-1.5 transition-colors"
            >
              {showForm ? <Icon.X size={13} /> : <Icon.Plus size={13} />}
              {showForm ? "cerrar" : "añadir sesión"}
            </button>
          </div>

          {showForm && (
            <div className="bg-[#0E2634] border border-[#1E3D4F] rounded-2xl p-4 mb-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="flex rounded-lg overflow-hidden border border-[#1E3D4F] col-span-2 sm:col-span-1">
                <button
                  onClick={() => setForm({ ...form, type: "agua" })}
                  className={`flex-1 text-xs font-mono uppercase py-2 transition-colors ${form.type === "agua" ? "bg-[#4A8B8C] text-[#0B1F2E] font-semibold" : "bg-[#0B1F2E] text-[#7FA9AA]"}`}
                >
                  agua
                </button>
                <button
                  onClick={() => setForm({ ...form, type: "seco" })}
                  className={`flex-1 text-xs font-mono uppercase py-2 transition-colors ${form.type === "seco" ? "bg-[#FF6B35] text-[#0B1F2E] font-semibold" : "bg-[#0B1F2E] text-[#7FA9AA]"}`}
                >
                  seco
                </button>
              </div>
              <input
                placeholder="metros"
                value={form.distance}
                onChange={(e) => setForm({ ...form, distance: e.target.value })}
                className="bg-[#0B1F2E] border border-[#1E3D4F] rounded-lg px-3 py-2 text-sm font-mono placeholder-[#5A7A87] focus:outline-none focus:border-[#4A8B8C]"
              />
              <input
                placeholder="ritmo /100m"
                value={form.pace}
                onChange={(e) => setForm({ ...form, pace: e.target.value })}
                className="bg-[#0B1F2E] border border-[#1E3D4F] rounded-lg px-3 py-2 text-sm font-mono placeholder-[#5A7A87] focus:outline-none focus:border-[#4A8B8C]"
              />
              <input
                placeholder="FC media"
                value={form.hr}
                onChange={(e) => setForm({ ...form, hr: e.target.value })}
                className="bg-[#0B1F2E] border border-[#1E3D4F] rounded-lg px-3 py-2 text-sm font-mono placeholder-[#5A7A87] focus:outline-none focus:border-[#4A8B8C]"
              />
              <input
                placeholder="notación (AeM, A1...)"
                value={form.notation}
                onChange={(e) => setForm({ ...form, notation: e.target.value })}
                className="bg-[#0B1F2E] border border-[#1E3D4F] rounded-lg px-3 py-2 text-sm font-mono placeholder-[#5A7A87] focus:outline-none focus:border-[#4A8B8C]"
              />
              <input
                placeholder="notas (opcional)"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="col-span-2 sm:col-span-3 bg-[#0B1F2E] border border-[#1E3D4F] rounded-lg px-3 py-2 text-sm placeholder-[#5A7A87] focus:outline-none focus:border-[#4A8B8C]"
              />
              <button
                onClick={addSession}
                className="bg-[#FF6B35] hover:bg-[#E85A28] text-[#0B1F2E] font-semibold rounded-lg px-3 py-2 text-sm transition-colors"
              >
                Guardar
              </button>
            </div>
          )}

          {sessions.length === 0 ? (
            <div className="text-sm text-[#5A7A87] font-mono py-6 text-center border border-dashed border-[#1E3D4F] rounded-2xl">
              Todavía no hay sesiones — añade la primera.
            </div>
          ) : (
            <div className="space-y-5">
              {groupByWeek(sessions).map((wk) => {
                const wkEnd = new Date(wk.weekStart + "T00:00:00");
                wkEnd.setDate(wkEnd.getDate() + 6);
                return (
                  <div key={wk.weekStart}>
                    <div className="flex items-baseline justify-between mb-2 px-1">
                      <span className="font-mono text-[10px] uppercase tracking-wider text-[#5A7A87]">
                        Semana del {fmtDate(wk.weekStart)} al {fmtDate(wkEnd.toISOString().slice(0, 10))}
                      </span>
                      <span className="font-mono text-[10px] text-[#5A7A87]">{(wk.meters / 1000).toFixed(1)}km</span>
                    </div>
                    <div className="space-y-2">
                      {wk.items.map((s) => {
                        const zone = hrZone(s.hr);
                        const paceSec = paceToSeconds(s.pace);
                        const primaryNotation = s.notation ? s.notation.split(/[\/,]/)[0].trim() : null;
                        const target = primaryNotation ? PACE_TARGETS[primaryNotation] : null;
                        let deviation = null;
                        if (target && paceSec) {
                          if (paceSec < target[0]) deviation = "rápido";
                          else if (paceSec > target[1]) deviation = "lento";
                        }
                        const isDry = s.type === "seco";
                        // sparkline: this session + up to 3 prior swim sessions (oldest first)
                        const idxInAll = sessions.indexOf(s);
                        const priorSwims = sessions
                          .slice(idxInAll + 1)
                          .filter((x) => x.type !== "seco" && paceToSeconds(x.pace))
                          .slice(0, 3)
                          .reverse();
                        const sparkValues = [...priorSwims.map((x) => paceToSeconds(x.pace)), paceSec].filter(Boolean);

                        return (
                          <div
                            key={s.id}
                            className={`flex items-center gap-4 rounded-xl px-4 py-3 text-sm flex-wrap border-l-2 ${
                              isDry ? "bg-[#0E2634]/60 border-[#1E3D4F] border-l-[#5A7A87]" : "bg-[#0E2634] border-[#1E3D4F] border-l-[#4A8B8C]"
                            }`}
                            style={{ borderTopColor: "#1E3D4F", borderRightColor: "#1E3D4F", borderBottomColor: "#1E3D4F", borderTopWidth: 1, borderRightWidth: 1, borderBottomWidth: 1, borderStyle: "solid" }}
                          >
                            <span className="shrink-0" title={isDry ? "Sesión en seco" : "Sesión en agua"}>
                              {isDry ? <Icon.Anchor size={14} className="text-[#5A7A87] opacity-50" /> : <Icon.Waves size={14} className="text-[#4A8B8C]" />}
                            </span>
                            <span className="font-mono text-[#7FA9AA] w-16 shrink-0">{fmtDate(s.date)}</span>
                            <span className="font-mono font-medium w-20 shrink-0">{isDry ? "—" : `${s.distance}m`}</span>
                            {s.pace && (
                              <span className="font-mono text-[#9FB8C4] w-24 shrink-0 flex items-center gap-1">
                                <Icon.Timer size={12} />
                                {s.pace}/100
                              </span>
                            )}
                            {sparkValues.length >= 2 && <Sparkline values={sparkValues} />}
                            {s.hr && (
                              <span className="font-mono text-[#9FB8C4] w-24 shrink-0 flex items-center gap-1">
                                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: zone?.color || "#5A7A87" }} title={zone?.label} />
                                {s.hr} bpm
                              </span>
                            )}
                            {s.notation && (
                              <span className="font-mono text-xs bg-[#142F42] rounded-full px-2 py-0.5 text-[#FF6B35] shrink-0">{s.notation}</span>
                            )}
                            {deviation && (
                              <span
                                className={`font-mono text-[10px] rounded-full px-2 py-0.5 shrink-0 ${
                                  deviation === "rápido" ? "bg-[#FF6B35]/15 text-[#FF6B35]" : "bg-[#4A8B8C]/15 text-[#7FA9AA]"
                                }`}
                                title={`Objetivo ${primaryNotation}: ${target[0]}-${target[1]}s/100m`}
                              >
                                ⚠ {deviation}
                              </span>
                            )}
                            {s.notes && <span className="text-[#9FB8C4] truncate">{s.notes}</span>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <WaveDivider color="#1E3D4F" opacity={1} />

        {/* Notation reference */}
        <div className="my-8">
          <div className="font-display uppercase text-sm tracking-wider text-[#9FB8C4] mb-3">Notación</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {NOTATION_HELP.map(([abbr, desc]) => (
              <div key={abbr} className="bg-[#0E2634] border border-[#1E3D4F] rounded-lg px-3 py-2">
                <div className="font-mono text-[#FF6B35] text-sm font-medium">{abbr}</div>
                <div className="text-[11px] text-[#9FB8C4]">{desc}</div>
              </div>
            ))}
          </div>

          <div className="font-display uppercase text-xs tracking-wider text-[#9FB8C4] mt-5 mb-2">Zonas de FC (estimadas, máx. {MAX_HR} bpm)</div>
          <div className="flex flex-wrap gap-3">
            {HR_ZONES.map((z) => (
              <span key={z.key} className="flex items-center gap-1.5 text-[11px] font-mono text-[#9FB8C4]">
                <span className="w-2 h-2 rounded-full" style={{ background: z.color }} />
                {z.key} · {z.label}
              </span>
            ))}
          </div>
        </div>

        <WaveDivider color="#1E3D4F" opacity={1} />

        {/* Race week plan */}
        <div className="my-8">
          <div className="font-display uppercase text-sm tracking-wider text-[#9FB8C4] mb-1">Semana de Getaria–Zarautz</div>
          <div className="text-[11px] text-[#5A7A87] font-mono mb-3">taper · 3 sesiones de agua + trabajo en seco</div>
          <div className="space-y-2">
            {RACE_WEEK_PLAN.map((s, i) => {
              const done = s.type === "agua" ? sessions.find((sess) => sess.date === s.date) : null;
              const isPast = s.date < TODAY.toISOString().slice(0, 10);
              return (
                <div
                  key={i}
                  className={`flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 rounded-xl px-4 py-3 border ${
                    s.type === "race"
                      ? "bg-[#FF6B35]/10 border-[#FF6B35]"
                      : "bg-[#0E2634] border-[#1E3D4F]"
                  }`}
                >
                  <span className="font-mono text-[11px] uppercase tracking-wide text-[#7FA9AA] w-24 shrink-0">{s.day}</span>
                  <span
                    className={`font-mono text-[10px] uppercase tracking-wide rounded-full px-2 py-0.5 w-14 text-center shrink-0 ${
                      s.type === "agua"
                        ? "bg-[#4A8B8C]/20 text-[#7FA9AA]"
                        : s.type === "race"
                        ? "bg-[#FF6B35] text-[#0B1F2E] font-semibold"
                        : "bg-[#1E3D4F] text-[#9FB8C4]"
                    }`}
                  >
                    {s.type === "agua" ? "agua" : s.type === "race" ? "carrera" : "seco"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{s.title}</div>
                    {s.detail && <div className="text-[11px] text-[#9FB8C4] truncate sm:whitespace-normal">{s.detail}</div>}
                  </div>
                  {s.type === "agua" && (
                    <span
                      className={`font-mono text-[10px] rounded-full px-2 py-0.5 shrink-0 ${
                        done ? "bg-[#4A8B8C]/20 text-[#7FA9AA]" : isPast ? "bg-[#E8453C]/15 text-[#E8453C]" : "bg-[#1E3D4F] text-[#5A7A87]"
                      }`}
                    >
                      {done ? `✓ hecho · ${done.distance}m` : isPast ? "✗ sin registrar" : "pendiente"}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <WaveDivider color="#1E3D4F" opacity={1} />

        {/* Race-day nutrition */}
        <div className="my-8">
          <div className="font-display uppercase text-sm tracking-wider text-[#9FB8C4] mb-1">Alimentación · día de carrera</div>
          <div className="text-[11px] text-[#5A7A87] font-mono mb-3">domingo 19 · salida 11:00h · agua a ~25°C, ola de calor prevista</div>
          <div className="space-y-2">
            {RACE_DAY_NUTRITION.map((n, i) => (
              <div key={i} className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-4 bg-[#0E2634] border border-[#1E3D4F] rounded-xl px-4 py-3">
                <span className="font-mono text-[11px] text-[#FF6B35] w-24 shrink-0">{n.time}</span>
                <div className="min-w-0">
                  <div className="text-sm font-medium">{n.label}</div>
                  {n.detail && <div className="text-[11px] text-[#9FB8C4]">{n.detail}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>

        <WaveDivider color="#1E3D4F" opacity={1} />

        {/* Build plan toward Salomé Campos */}
        <div className="my-8">
          <div className="font-display uppercase text-sm tracking-wider text-[#9FB8C4] mb-1">Después de Getaria — hacia Salomé Campos</div>
          <div className="text-[11px] text-[#5A7A87] font-mono mb-3">5.000m · 5 de septiembre · bloque de construcción</div>
          <div className="space-y-2">
            {BUILD_PLAN.map((b, i) => (
              <div
                key={i}
                className={`flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-4 rounded-xl px-4 py-3 border ${
                  b.title.includes("Salomé") ? "bg-[#4A8B8C]/10 border-[#4A8B8C]" : "bg-[#0E2634] border-[#1E3D4F]"
                }`}
              >
                <span className="font-mono text-[11px] text-[#7FA9AA] w-40 shrink-0">{b.block}</span>
                <div className="min-w-0">
                  <div className="text-sm font-medium">{b.title}</div>
                  {b.detail && <div className="text-[11px] text-[#9FB8C4]">{b.detail}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>

        <WaveDivider color="#1E3D4F" opacity={1} />

        {/* Coach chat */}
        <div className="my-8">
          <div className="font-display uppercase text-sm tracking-wider text-[#9FB8C4] mb-3">Entrenador</div>
          <div className="bg-[#0E2634] border border-[#1E3D4F] rounded-2xl flex flex-col h-[420px]">
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
                      m.role === "user"
                        ? "bg-[#FF6B35] text-[#0B1F2E] font-medium rounded-br-sm"
                        : "bg-[#142F42] text-[#EAF2F2] rounded-bl-sm border border-[#1E3D4F]"
                    }`}
                  >
                    {m.text}
                  </div>
                </div>
              ))}
              {sending && (
                <div className="flex justify-start">
                  <div className="bg-[#142F42] border border-[#1E3D4F] rounded-2xl rounded-bl-sm px-4 py-2.5">
                    <Icon.Loader2 size={14} className="animate-spin text-[#7FA9AA]" />
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
            <div className="border-t border-[#1E3D4F] p-3 flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                placeholder="Pregunta o pide una sesión..."
                className="flex-1 bg-[#0B1F2E] border border-[#1E3D4F] rounded-full px-4 py-2 text-sm placeholder-[#5A7A87] focus:outline-none focus:border-[#4A8B8C]"
              />
              <button
                onClick={send}
                disabled={sending}
                className="bg-[#FF6B35] hover:bg-[#E85A28] disabled:opacity-50 text-[#0B1F2E] rounded-full w-9 h-9 flex items-center justify-center shrink-0 transition-colors"
              >
                <Icon.Send size={15} />
              </button>
            </div>
          </div>
        </div>

        <div className="text-center text-[10px] font-mono text-[#3E5A68] pt-4 pb-2 uppercase tracking-widest">
          Getaria–Zarautz · Salomé Campos · Torrevieja
        </div>
      </div>
    </div>
  );
}

// ---- Mount --------------------------------------------------------------
ReactDOM.createRoot(document.getElementById("root")).render(<SwimCoach />);
