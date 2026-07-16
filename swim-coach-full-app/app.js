"use strict";
const { useState, useEffect, useRef, useMemo } = React;
// ---- Minimal inline icon set (replaces lucide-react for standalone use) ---
function svgIcon(paths, viewBox = "0 0 24 24") {
    return function IconCmp({ size = 16, className = "", ...rest }) {
        return (React.createElement("svg", { width: size, height: size, viewBox: viewBox, fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", className: className, ...rest }, paths));
    };
}
const Icon = {
    Waves: svgIcon(React.createElement(React.Fragment, null,
        React.createElement("path", { d: "M2 6c1.5-1.5 3.5-1.5 5 0s3.5 1.5 5 0 3.5-1.5 5 0 3.5 1.5 5 0" }),
        React.createElement("path", { d: "M2 12c1.5-1.5 3.5-1.5 5 0s3.5 1.5 5 0 3.5-1.5 5 0 3.5 1.5 5 0" }),
        React.createElement("path", { d: "M2 18c1.5-1.5 3.5-1.5 5 0s3.5 1.5 5 0 3.5-1.5 5 0 3.5 1.5 5 0" }))),
    Send: svgIcon(React.createElement("path", { d: "M22 2 11 13M22 2 15 22l-4-9-9-4 20-7Z" })),
    Plus: svgIcon(React.createElement("path", { d: "M12 5v14M5 12h14" })),
    Timer: svgIcon(React.createElement(React.Fragment, null,
        React.createElement("path", { d: "M10 2h4M12 14l3-3" }),
        React.createElement("circle", { cx: "12", cy: "14", r: "8" }))),
    X: svgIcon(React.createElement("path", { d: "M18 6 6 18M6 6l12 12" })),
    Loader2: svgIcon(React.createElement("path", { d: "M21 12a9 9 0 1 1-6.219-8.56" })),
    Anchor: svgIcon(React.createElement(React.Fragment, null,
        React.createElement("circle", { cx: "12", cy: "5", r: "3" }),
        React.createElement("path", { d: "M12 22V8M5 12H2a10 10 0 0 0 20 0h-3" }))),
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
// Zonas de ritmo, de más lenta a más rápida. Nota: interpreto la "AeL" repetida
// entre AeM y Vo2Max como "AnL" (anaeróbico láctico) — el nombre estándar de esa
// zona en esta progresión; dímelo si querías otra cosa.
const NOTATION_HELP = ["Cal", "AeL1", "AeL2", "AeL3", "AeM", "AnL", "Vo2Max"];
// Target pace range per 100m (seconds), slowest -> fastest. Used to flag sessions
// that ran meaningfully faster/slower than intended, and shown in the Natación panel.
// These are sensible defaults until calibrated against real Strava paces.
const DEFAULT_PACE_TARGETS = {
    Cal: [108, 120],
    AeL1: [102, 108],
    AeL2: [98, 102],
    AeL3: [94, 98],
    AeM: [90, 94],
    AnL: [82, 90],
    Vo2Max: [70, 82],
};
// ---- Calibrate pace zones from real Strava history -------------------------
// Splits the distribution of observed swim paces into 7 bands (one per zone),
// using the 4th/96th percentile as the outer bounds to avoid outliers.
function calibratePaceTargets(sessions) {
    const paces = sessions
        .filter((s) => s.type !== "seco")
        .map((s) => paceToSeconds(s.pace))
        .filter((v) => v && v > 40 && v < 240)
        .sort((a, b) => a - b);
    if (paces.length < 10)
        return null;
    const quantile = (q) => {
        const pos = q * (paces.length - 1);
        const lo = Math.floor(pos), hi = Math.ceil(pos);
        return paces[lo] + (paces[hi] - paces[lo]) * (pos - lo);
    };
    const fastest = quantile(0.04); // ~Vo2Max effort
    const slowest = quantile(0.96); // ~Cal effort
    const zones = NOTATION_HELP; // slowest -> fastest order
    const n = zones.length;
    const step = (slowest - fastest) / n;
    const targets = {};
    zones.forEach((z, i) => {
        // i=0 is slowest (Cal): upper bound = slowest, lower bound = slowest - step
        const hi = Math.round(slowest - i * step);
        const lo = Math.round(slowest - (i + 1) * step);
        targets[z] = [lo, hi];
    });
    return targets;
}
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
    if (!hr)
        return null;
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
    if (!pace)
        return null;
    const [m, s] = pace.split(":").map(Number);
    if (Number.isNaN(m) || Number.isNaN(s))
        return null;
    return m * 60 + s;
}
function secondsToPace(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.round(sec % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
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
        if (!groups[wk])
            groups[wk] = { weekStart: wk, items: [], meters: 0 };
        groups[wk].items.push(s);
        if (s.type !== "seco")
            groups[wk].meters += s.distance || 0;
    });
    return Object.values(groups).sort((a, b) => (a.weekStart < b.weekStart ? 1 : -1));
}
const MONTH_NAMES_ES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
function groupByYearMonth(sessions) {
    const years = {};
    sessions.forEach((s) => {
        const y = s.date.slice(0, 4);
        const m = Number(s.date.slice(5, 7)) - 1;
        if (!years[y])
            years[y] = { year: y, meters: 0, months: {} };
        if (!years[y].months[m])
            years[y].months[m] = { month: m, label: MONTH_NAMES_ES[m], items: [], meters: 0 };
        years[y].months[m].items.push(s);
        if (s.type !== "seco") {
            years[y].months[m].meters += s.distance || 0;
            years[y].meters += s.distance || 0;
        }
    });
    return Object.values(years)
        .sort((a, b) => (a.year < b.year ? 1 : -1))
        .map((y) => ({ ...y, months: Object.values(y.months).sort((a, b) => b.month - a.month) }));
}
// ---- Seed data pulled from Strava (swims, most recent first) --------------
// ---- Wave divider ---------------------------------------------------------
function WaveDivider({ color = "#4A8B8C", opacity = 0.5 }) {
    return (React.createElement("svg", { viewBox: "0 0 400 16", preserveAspectRatio: "none", className: "w-full h-4 wave-svg", style: { opacity } },
        React.createElement("path", { d: "M0,8 C 20,0 40,16 60,8 C 80,0 100,16 120,8 C140,0 160,16 180,8 C200,0 220,16 240,8 C260,0 280,16 300,8 C320,0 340,16 360,8 C380,0 400,16 400,8", fill: "none", stroke: color, strokeWidth: "1.5" })));
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
    return (React.createElement("div", { className: "w-full" },
        React.createElement("div", { className: "relative h-10 rounded-full bg-[#0E2634] overflow-hidden border border-[#1E3D4F]" },
            segments.map((s, i) => (React.createElement("div", { key: i, className: "absolute top-0 h-full", style: {
                    left: `${pct(s.from)}%`,
                    width: `${pct(s.to) - pct(s.from)}%`,
                    background: s.color,
                    opacity: 0.35,
                } }))),
            React.createElement("div", { className: "absolute top-0 h-full w-0.5 bg-[#EAF2F2]", style: { left: `${pct(TODAY.toISOString())}%` } }),
            RACES.map((r) => (React.createElement("div", { key: r.id, className: "absolute -top-1 flex flex-col items-center", style: { left: `${pct(r.date)}%`, transform: "translateX(-50%)" } },
                React.createElement(Icon.Anchor, { size: 12, className: "text-[#FF6B35]" }))))),
        React.createElement("div", { className: "flex justify-between mt-2 text-[10px] uppercase tracking-wider text-[#9FB8C4] font-mono" },
            React.createElement("span", null, fmtDate(SEASON_START)),
            React.createElement("span", { className: "text-[#EAF2F2]" }, "hoy"),
            React.createElement("span", null, fmtDate(SEASON_END)))));
}
// ---- Monthly volume bar chart ---------------------------------------------
function MonthlyVolumeChart({ sessions }) {
    const currentYear = String(TODAY.getFullYear());
    const monthly = useMemo(() => {
        const groups = {};
        sessions.forEach((s) => {
            if (s.type === "seco")
                return;
            if (!s.date.startsWith(currentYear))
                return;
            const ym = s.date.slice(0, 7);
            if (!groups[ym])
                groups[ym] = 0;
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
        return React.createElement("div", { className: "text-sm text-[#5A7A87] font-mono" }, "Sin datos de volumen todav\u00EDa.");
    }
    const max = Math.max(...monthly.map((m) => m.meters));
    const currentYm = `${TODAY.getFullYear()}-${String(TODAY.getMonth() + 1).padStart(2, "0")}`;
    return (React.createElement("div", { className: "w-full" },
        React.createElement("div", { className: "flex items-end gap-1.5 h-32" }, monthly.map((m) => {
            const isCurrent = m.ym === currentYm;
            const h = Math.max(4, (m.meters / max) * 100);
            return (React.createElement("div", { key: m.ym, className: "flex-1 flex flex-col items-center justify-end h-full group relative" },
                React.createElement("span", { className: "text-[9px] font-mono text-[#7FA9AA] mb-1 opacity-0 group-hover:opacity-100 transition-opacity absolute -top-4" },
                    (m.meters / 1000).toFixed(1),
                    "km"),
                React.createElement("div", { className: "w-full rounded-t-sm transition-colors", style: {
                        height: `${h}%`,
                        background: isCurrent ? "transparent" : "#4A8B8C",
                        border: isCurrent ? "1.5px dashed #FF6B35" : "none",
                        opacity: isCurrent ? 1 : 0.55,
                    } })));
        })),
        React.createElement("div", { className: "flex gap-1.5 mt-2" }, monthly.map((m) => (React.createElement("div", { key: m.ym, className: "flex-1 text-center text-[9px] font-mono text-[#7FA9AA] uppercase" }, m.label)))),
        React.createElement("div", { className: "text-[10px] font-mono text-[#5A7A87] mt-2" }, monthly.find((m) => m.ym === currentYm) && React.createElement("span", null, "\u00B7 mes en curso (borde naranja) \u2014 datos parciales"))));
}
// ---- Pace-by-month/phase chart ---------------------------------------------
function phaseForDate(dateStr) {
    if (dateStr < PROGRESSION_START)
        return { key: "base", label: "Base", color: "#3E5A68" };
    if (dateStr < TAPER_START)
        return { key: "prog", label: "Progresión", color: "#5C8A99" };
    return { key: "taper", label: "Taper", color: "#FF6B35" };
}
function PaceByPhaseChart({ sessions }) {
    const currentYear = String(TODAY.getFullYear());
    const monthly = useMemo(() => {
        const groups = {};
        sessions.forEach((s) => {
            const secs = paceToSeconds(s.pace);
            if (!secs)
                return;
            if (!s.date.startsWith(currentYear))
                return;
            const ym = s.date.slice(0, 7);
            if (!groups[ym])
                groups[ym] = { total: 0, count: 0, date: s.date };
            groups[ym].total += secs;
            groups[ym].count += 1;
        });
        return Object.entries(groups)
            .map(([ym, g]) => ({ ym, avgSec: g.total / g.count, date: g.date }))
            .sort((a, b) => (a.ym < b.ym ? -1 : 1));
    }, [sessions]);
    if (monthly.length === 0) {
        return React.createElement("div", { className: "text-sm text-[#5A7A87] font-mono" }, "Sin datos de ritmo suficientes todav\u00EDa este a\u00F1o.");
    }
    const fastest = Math.min(...monthly.map((m) => m.avgSec));
    const slowest = Math.max(...monthly.map((m) => m.avgSec));
    const range = slowest - fastest || 1;
    const W = 100, H = 100, padX = 4, padY = 14;
    const xFor = (i) => monthly.length === 1 ? W / 2 : padX + (i / (monthly.length - 1)) * (W - padX * 2);
    // faster pace (lower seconds) -> higher on the chart
    const yFor = (sec) => padY + ((sec - fastest) / range) * (H - padY * 2);
    const points = monthly.map((m, i) => ({ x: xFor(i), y: yFor(m.avgSec), m }));
    const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
    return (React.createElement("div", { className: "w-full" },
        React.createElement("svg", { viewBox: `0 0 ${W} ${H}`, className: "w-full h-32", preserveAspectRatio: "none" },
            React.createElement("path", { d: pathD, fill: "none", stroke: "#4A8B8C", strokeWidth: "1.2", vectorEffect: "non-scaling-stroke" }),
            points.map((p, i) => (React.createElement("circle", { key: i, cx: p.x, cy: p.y, r: "1.8", fill: phaseForDate(p.m.date).color, vectorEffect: "non-scaling-stroke" })))),
        React.createElement("div", { className: "flex gap-1.5 mt-1" }, monthly.map((m) => (React.createElement("div", { key: m.ym, className: "flex-1 text-center text-[9px] font-mono text-[#7FA9AA] uppercase" },
            m.ym.slice(5),
            "/",
            m.ym.slice(2, 4))))),
        React.createElement("div", { className: "text-[10px] font-mono text-[#5A7A87] mt-2" }, `${currentYear} \u00B7 punto m\u00E1s alto = ritmo m\u00E1s r\u00E1pido ese mes`)));
}
// ---- Pace sparkline (mini trend vs previous 3 sessions) -------------------
function Sparkline({ values }) {
    // values: array of seconds/100m, oldest first, last item = current session
    if (values.length < 2)
        return null;
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
    return (React.createElement("svg", { width: w, height: h, className: "shrink-0" },
        React.createElement("polyline", { points: pts.join(" "), fill: "none", stroke: improving ? "#4A8B8C" : "#FF6B35", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round" })));
}
// ---- Single session row (used by the year/month accordion) ----------------
function SessionCard({ s, sessions, paceTargets }) {
    const zone = hrZone(s.hr);
    const paceSec = paceToSeconds(s.pace);
    const primaryNotation = s.notation ? s.notation.split(/[\/,]/)[0].trim() : null;
    const target = primaryNotation ? (paceTargets || DEFAULT_PACE_TARGETS)[primaryNotation] : null;
    let deviation = null;
    if (target && paceSec) {
        if (paceSec < target[0])
            deviation = "rápido";
        else if (paceSec > target[1])
            deviation = "lento";
    }
    const isDry = s.type === "seco";
    const idxInAll = sessions.indexOf(s);
    const priorSwims = sessions
        .slice(idxInAll + 1)
        .filter((x) => x.type !== "seco" && paceToSeconds(x.pace))
        .slice(0, 3)
        .reverse();
    const sparkValues = [...priorSwims.map((x) => paceToSeconds(x.pace)), paceSec].filter(Boolean);
    const isPlanned = !!s.planned;
    return React.createElement("div", { className: `flex items-center gap-4 rounded-xl px-4 py-3 text-sm flex-wrap border-l-2 ${isPlanned ? "bg-[#0E2634]/40 border-l-[#E8C547]" : isDry ? "bg-[#0E2634]/60 border-[#1E3D4F] border-l-[#5A7A87]" : "bg-[#0E2634] border-[#1E3D4F] border-l-[#4A8B8C]"}`, style: { borderTopColor: "#1E3D4F", borderRightColor: "#1E3D4F", borderBottomColor: "#1E3D4F", borderTopWidth: 1, borderRightWidth: 1, borderBottomWidth: 1, borderStyle: isPlanned ? "dashed" : "solid" } }, isPlanned && React.createElement("span", { className: "font-mono text-[9px] uppercase tracking-wide bg-[#E8C547]/15 text-[#E8C547] rounded-full px-2 py-0.5 shrink-0" }, "propuesta"), React.createElement("span", { className: "shrink-0", title: isDry ? "Sesión en seco" : "Sesión en agua" }, isDry ? React.createElement(Icon.Anchor, { size: 14, className: "text-[#5A7A87] opacity-50" }) : React.createElement(Icon.Waves, { size: 14, className: "text-[#4A8B8C]" })), React.createElement("span", { className: "font-mono text-[#7FA9AA] w-16 shrink-0" }, fmtDate(s.date)), React.createElement("span", { className: "font-mono font-medium w-20 shrink-0" }, isDry ? "—" : `${s.distance}m`), s.pace && (React.createElement("span", { className: "font-mono text-[#9FB8C4] w-24 shrink-0 flex items-center gap-1" }, React.createElement(Icon.Timer, { size: 12 }), s.pace, "/100")), sparkValues.length >= 2 && React.createElement(Sparkline, { values: sparkValues }), s.hr && (React.createElement("span", { className: "font-mono text-[#9FB8C4] shrink-0 flex items-center gap-1" }, React.createElement("span", { className: "w-2 h-2 rounded-full shrink-0", style: { background: zone?.color || "#5A7A87" } }), s.hr, " bpm", zone && React.createElement("span", { className: "text-[9px] text-[#5A7A87] ml-0.5" }, `\u00b7${zone.key}`))), s.notation && (React.createElement("span", { className: "font-mono text-xs bg-[#142F42] rounded-full px-2 py-0.5 text-[#FF6B35] shrink-0" }, s.notation)), deviation && (React.createElement("span", { className: `font-mono text-[10px] rounded-full px-2 py-0.5 shrink-0 ${deviation === "rápido" ? "bg-[#FF6B35]/15 text-[#FF6B35]" : "bg-[#4A8B8C]/15 text-[#7FA9AA]"}` }, "\u26A0 ", deviation, ` (obj. ${target[0]}-${target[1]}s)`)), s.notes && React.createElement("span", { className: "text-[#9FB8C4] truncate" }, s.notes));
}
// ---- Collapsible session log, grouped by year then month ------------------
function SessionAccordion({ sessions, paceTargets }) {
    const currentYear = String(TODAY.getFullYear());
    const currentMonth = TODAY.getMonth();
    const years = useMemo(() => groupByYearMonth(sessions), [sessions]);
    const [openYears, setOpenYears] = useState(() => new Set([currentYear]));
    const [openMonths, setOpenMonths] = useState(() => new Set([`${currentYear}-${currentMonth}`]));
    const toggleYear = (y) => setOpenYears((prev) => {
        const next = new Set(prev);
        next.has(y) ? next.delete(y) : next.add(y);
        return next;
    });
    const toggleMonth = (key) => setOpenMonths((prev) => {
        const next = new Set(prev);
        next.has(key) ? next.delete(key) : next.add(key);
        return next;
    });
    if (years.length === 0) {
        return React.createElement("div", { className: "text-sm text-[#5A7A87] font-mono py-6 text-center border border-dashed border-[#1E3D4F] rounded-2xl" }, "Todav\u00EDa no hay sesiones \u2014 a\u00F1ade la primera.");
    }
    return React.createElement("div", { className: "space-y-3" }, years.map((y) => {
        const yearOpen = openYears.has(y.year);
        return React.createElement("div", { key: y.year, className: "rounded-xl border border-[#1E3D4F] overflow-hidden" },
            React.createElement("button", { onClick: () => toggleYear(y.year), className: "tap-target w-full flex items-center justify-between bg-[#142F42] hover:bg-[#1B3B52] px-4 py-3 font-display uppercase text-base tracking-wide transition-colors" },
                React.createElement("span", { className: "flex items-center gap-2.5" },
                    React.createElement("span", { className: "inline-block text-[#FF6B35] transition-transform", style: { transform: yearOpen ? "rotate(90deg)" : "rotate(0deg)" } }, "\u25B8"),
                    y.year),
                React.createElement("span", { className: "font-mono text-[11px] text-[#7FA9AA] normal-case tracking-normal" }, (y.meters / 1000).toFixed(1), "km \u00B7 ", y.months.reduce((n, mo) => n + mo.items.length, 0), " sesiones")),
            yearOpen && React.createElement("div", { className: "bg-[#0B1F2E] p-3 space-y-2" }, y.months.map((mo) => {
                const key = `${y.year}-${mo.month}`;
                const monthOpen = openMonths.has(key);
                return React.createElement("div", { key: key, className: "rounded-lg border border-[#1E3D4F] overflow-hidden ml-2 sm:ml-4" },
                    React.createElement("button", { onClick: () => toggleMonth(key), className: "tap-target w-full flex items-center justify-between bg-[#0E2634] hover:bg-[#142F42] px-3 py-2.5 text-sm capitalize transition-colors" },
                        React.createElement("span", { className: "flex items-center gap-2" },
                            React.createElement("span", { className: "inline-block text-[#4A8B8C] text-xs transition-transform", style: { transform: monthOpen ? "rotate(90deg)" : "rotate(0deg)" } }, "\u25B8"),
                            mo.label),
                        React.createElement("span", { className: "font-mono text-[10px] text-[#5A7A87]" }, (mo.meters / 1000).toFixed(1), "km \u00B7 ", mo.items.length, " sesiones")),
                    monthOpen && React.createElement("div", { className: "p-2.5 space-y-2 bg-[#0B1F2E]" }, mo.items.map((s) => React.createElement(SessionCard, { key: s.id, s: s, sessions: sessions, paceTargets: paceTargets }))));
            })));
    }));
}

// Simplified fitness/fatigue/form model (Coggan PMC-style), using distance
// as a load proxy since we don't have a power/pace-based TSS from Strava
// for open-water swims. Not medically precise — a personal training aid.
function buildLoadSeries(sessions) {
    const byDate = {};
    sessions.forEach((s) => {
        if (s.type === "seco")
            return;
        if (!byDate[s.date])
            byDate[s.date] = 0;
        byDate[s.date] += (s.distance || 0) / 50; // arbitrary but consistent scaling
    });
    return byDate;
}
function computeFitnessForm(sessions) {
    if (sessions.length === 0)
        return null;
    const byDate = buildLoadSeries(sessions);
    const dates = Object.keys(byDate).sort();
    if (dates.length === 0)
        return null;
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
    if (tsb > 25)
        return { label: "Forma máxima", color: "#4A8B8C", note: "riesgo de estar perdiendo forma si dura mucho" };
    if (tsb > 5)
        return { label: "Fresco", color: "#7FA9AA", note: "buen momento para exigir o competir" };
    if (tsb > -10)
        return { label: "Neutral", color: "#E8C547", note: "manteniendo carga" };
    if (tsb > -30)
        return { label: "Cansado", color: "#FF6B35", note: "construyendo fitness, fatiga acumulada normal" };
    return { label: "Riesgo de sobreentrenamiento", color: "#E8453C", note: "considera bajar carga" };
}
function FitnessForm({ sessions }) {
    const series = useMemo(() => computeFitnessForm(sessions), [sessions]);
    if (!series || series.length === 0) {
        return React.createElement("div", { className: "text-sm text-[#5A7A87] font-mono" }, "Sin datos suficientes todav\u00EDa.");
    }
    const last = series[series.length - 1];
    const form = formLabel(last.tsb);
    const recent = series.slice(-42); // last 6 weeks
    // gauge: clamp TSB to a fixed, readable range
    const GAUGE_MIN = -30, GAUGE_MAX = 25;
    const clamped = Math.max(GAUGE_MIN, Math.min(GAUGE_MAX, last.tsb));
    const gaugePct = ((clamped - GAUGE_MIN) / (GAUGE_MAX - GAUGE_MIN)) * 100;
    // simple single-line trend (not two-directional bars) for the last 6 weeks
    const W = 100, H = 40, pad = 3;
    const tsbVals = recent.map((p) => p.tsb);
    const tMin = Math.min(...tsbVals, 0), tMax = Math.max(...tsbVals, 0);
    const tRange = tMax - tMin || 1;
    const xFor = (i) => pad + (i / (recent.length - 1 || 1)) * (W - pad * 2);
    const yFor = (v) => pad + (1 - (v - tMin) / tRange) * (H - pad * 2);
    const zeroY = yFor(0);
    const lineD = recent.map((p, i) => `${i === 0 ? "M" : "L"}${xFor(i).toFixed(1)},${yFor(p.tsb).toFixed(1)}`).join(" ");
    return (React.createElement("div", { className: "w-full" },
        React.createElement("div", { className: "flex flex-wrap items-center gap-4 mb-4" },
            React.createElement("div", { className: "font-display text-4xl", style: { color: form.color } },
                last.tsb > 0 ? "+" : "",
                last.tsb.toFixed(0)),
            React.createElement("div", null,
                React.createElement("span", { className: "font-mono text-[11px] rounded-full px-3 py-1 inline-block", style: { background: `${form.color}22`, color: form.color } }, form.label),
                React.createElement("div", { className: "text-[10px] text-[#5A7A87] mt-1" }, form.note))),
        React.createElement("div", { className: "relative h-2 rounded-full mb-1", style: { background: "linear-gradient(90deg, #FF6B35 0%, #E8C547 40%, #7FA9AA 65%, #4A8B8C 100%)" } },
            React.createElement("div", { className: "absolute top-1/2 w-3 h-3 rounded-full bg-white border-2 shadow", style: { left: `${gaugePct}%`, transform: "translate(-50%, -50%)", borderColor: form.color } })),
        React.createElement("div", { className: "flex justify-between text-[9px] font-mono text-[#5A7A87] mb-4" },
            React.createElement("span", null, "cansado"),
            React.createElement("span", null, "fresco")),
        React.createElement("svg", { viewBox: `0 0 ${W} ${H}`, className: "w-full h-10", preserveAspectRatio: "none" },
            React.createElement("line", { x1: 0, x2: W, y1: zeroY, y2: zeroY, stroke: "#1E3D4F", strokeWidth: "1", vectorEffect: "non-scaling-stroke" }),
            React.createElement("path", { d: lineD, fill: "none", stroke: "#4A8B8C", strokeWidth: "1.3", vectorEffect: "non-scaling-stroke" })),
        React.createElement("div", { className: "text-[10px] font-mono text-[#5A7A87] mt-1" }, "tendencia \u00FAltimas 6 semanas \u00B7 l\u00EDnea por encima = mejor forma")));
}
// ---- Training heatmap (GitHub-style, last 26 weeks) ------------------
function TrainingHeatmap({ sessions }) {
    const scrollRef = useRef(null);
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
        }
    }, [sessions]);
    const byDate = useMemo(() => {
        const map = {};
        sessions.forEach((s) => {
            if (s.type === "seco")
                return;
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
        if (m === 0)
            return "#142F42";
        if (m < 1500)
            return "#1E3D4F";
        if (m < 2500)
            return "#2E6470";
        if (m < 3500)
            return "#4A8B8C";
        return "#7FA9AA";
    };
    const grid = React.createElement("div", { className: "flex gap-[3px] w-max" }, columns.map((week, wi) => React.createElement("div", { key: wi, className: "flex flex-col gap-[3px]" }, week.map((day) => React.createElement("div", { key: day.date, className: "w-[11px] h-[11px] rounded-sm", style: { background: bucket(day.meters) }, title: `${day.date}: ${day.meters ? day.meters + "m" : "descanso"}` })))));
    const scrollBox = React.createElement("div", { ref: scrollRef, className: "w-full overflow-x-auto scroll-fade" }, grid);
    const legend = React.createElement("div", { className: "flex items-center justify-between mt-2" }, React.createElement("span", { className: "text-[9px] font-mono text-[#5A7A87] sm:hidden" }, "\u2190 desliza para ver el historial"), React.createElement("div", { className: "flex items-center gap-1.5 text-[9px] font-mono text-[#5A7A87]" }, React.createElement("span", null, "menos"), ["#142F42", "#1E3D4F", "#2E6470", "#4A8B8C", "#7FA9AA"].map((c) => React.createElement("span", { key: c, className: "w-[10px] h-[10px] rounded-sm", style: { background: c } })), React.createElement("span", null, "m\u00E1s")));
    return React.createElement("div", { className: "w-full" }, scrollBox, legend);
}
// ---- Main app ---------------------------------------------------------
function SwimCoach() {
    const [sessions, setSessions] = useState([]);
    const [loaded, setLoaded] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({ type: "agua", description: "", series: 1, meters: 100, ritmo: "AeM", material: "ninguno" });
    const [syncing, setSyncing] = useState(false);
    const [syncMsg, setSyncMsg] = useState("");
    const [paceTargets, setPaceTargets] = useState(() => {
        try {
            const saved = localStorage.getItem("swimcoach_pace_targets");
            return saved ? JSON.parse(saved) : DEFAULT_PACE_TARGETS;
        }
        catch (e) {
            return DEFAULT_PACE_TARGETS;
        }
    });
    const [calibrating, setCalibrating] = useState(false);
    const [calibrateMsg, setCalibrateMsg] = useState("");
    const runCalibration = () => {
        setCalibrating(true);
        const result = calibratePaceTargets(sessions);
        if (result) {
            setPaceTargets(result);
            try {
                localStorage.setItem("swimcoach_pace_targets", JSON.stringify(result));
            }
            catch (e) { }
            setCalibrateMsg(`✓ ritmos actualizados con ${sessions.filter((s) => s.type !== "seco").length} sesiones`);
        }
        else {
            setCalibrateMsg("Necesito al menos 10 sesiones de piscina con ritmo registrado.");
        }
        setCalibrating(false);
    };
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
            let list = Array.isArray(data) ? data : [];
            // Reconcile: if a "planned" proposal's date now has a real (non-planned) agua
            // session from Strava, the plan has been fulfilled — drop the placeholder.
            const fulfilled = list.filter((s) => s.planned && list.some((r) => !r.planned && r.type === "agua" && r.date === s.date));
            if (fulfilled.length > 0) {
                list = list.filter((s) => !fulfilled.includes(s));
                fulfilled.forEach((s) => {
                    fetch("/api/sessions", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: s.id }) }).catch(() => { });
                });
            }
            setSessions(list);
            try {
                localStorage.setItem("swimcoach_sessions_cache", JSON.stringify(list));
            }
            catch (e) { }
        }
        catch (e) {
            // offline fallback: use last cached copy from localStorage
            try {
                const cached = localStorage.getItem("swimcoach_sessions_cache");
                if (cached)
                    setSessions(JSON.parse(cached));
            }
            catch (e2) { }
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
            }
            else {
                setSyncMsg(`Error: ${data.error}`);
            }
        }
        catch (e) {
            setSyncMsg("No se pudo conectar con el servidor.");
        }
        setSyncing(false);
    };
    const totalMeters = form.type === "agua" ? (Number(form.series) || 0) * (Number(form.meters) || 0) : 0;
    const addSession = async () => {
        if (form.type === "agua" && totalMeters <= 0)
            return;
        const range = paceTargets[form.ritmo] || DEFAULT_PACE_TARGETS[form.ritmo];
        const materialNote = form.material && form.material !== "ninguno" ? ` · ${form.material}` : "";
        const newSession = {
            id: uid(),
            type: form.type,
            date: new Date().toISOString().slice(0, 10),
            distance: form.type === "agua" ? totalMeters : 0,
            pace: form.type === "agua" && range ? secondsToPace((range[0] + range[1]) / 2) : "",
            hr: "",
            notation: form.type === "agua" ? form.ritmo : "",
            notes: form.type === "agua"
                ? `Propuesta: ${form.series}x${form.meters}m${materialNote}${form.description ? " · " + form.description : ""}`
                : (form.description || ""),
            planned: true,
        };
        // optimistic update
        setSessions((prev) => [newSession, ...prev]);
        setForm({ type: "agua", description: "", series: 1, meters: 100, ritmo: "AeM", material: "ninguno" });
        setShowForm(false);
        try {
            await fetch("/api/sessions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(newSession),
            });
        }
        catch (e) {
            // will show up again next successful loadSessions() from the KV copy if this failed silently
        }
    };
    const recentSummary = useMemo(() => {
        if (sessions.length === 0)
            return "Sin sesiones registradas todavía.";
        return sessions
            .slice(0, 6)
            .map((s) => `${s.date}: ${s.distance}m${s.pace ? `, ritmo ${s.pace}/100m` : ""}${s.hr ? `, FC media ${s.hr}` : ""}${s.notation ? `, [${s.notation}]` : ""}`)
            .join("\n");
    }, [sessions]);
    const send = async () => {
        if (!input.trim() || sending)
            return;
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
            }
            else {
                setMessages((prev) => [...prev, { role: "assistant", text: data.text || "No he podido generar respuesta." }]);
            }
        }
        catch (e) {
            setMessages((prev) => [...prev, { role: "assistant", text: "Ha fallado la conexión con el entrenador. Inténtalo de nuevo." }]);
        }
        finally {
            setSending(false);
        }
    };
    return (React.createElement("div", { className: "min-h-screen w-full bg-[#0B1F2E] text-[#EAF2F2]", style: { fontFamily: "'Inter', system-ui, sans-serif", minHeight: "100dvh" } },
        React.createElement("style", null, `
        @import url('https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');
        .font-display { font-family: 'Oswald', sans-serif; }
        .font-mono { font-family: 'IBM Plex Mono', monospace; }
        @keyframes waveSway {
          0%, 100% { transform: translateX(0); }
          50% { transform: translateX(-6px); }
        }
        .wave-svg { animation: waveSway 6s ease-in-out infinite; }
        * { -webkit-tap-highlight-color: transparent; }
        button, a { touch-action: manipulation; }
        .safe-top { padding-top: max(env(safe-area-inset-top), 1.5rem); }
        .safe-bottom { padding-bottom: max(env(safe-area-inset-bottom), 1.5rem); }
        .tap-target { min-height: 44px; min-width: 44px; }
        .scroll-fade { -webkit-overflow-scrolling: touch; }
      `),
        React.createElement("div", { className: "max-w-4xl mx-auto px-5 py-8 safe-top safe-bottom" },
            React.createElement("div", { className: "flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 text-[#7FA9AA]" },
                React.createElement("div", { className: "flex items-center gap-2" },
                    React.createElement(Icon.Waves, { size: 18 }),
                    React.createElement("span", { className: "font-mono text-[11px] tracking-[0.2em] uppercase" }, "Cuaderno de entrenamiento \u2014 Anton")),
                React.createElement("div", { className: "flex flex-col items-start sm:items-end gap-1.5" },
                    React.createElement("button", { onClick: runSync, disabled: syncing, className: "tap-target flex items-center justify-center gap-1.5 text-[11px] font-mono uppercase tracking-wide bg-[#142F42] hover:bg-[#1B3B52] disabled:opacity-50 border border-[#1E3D4F] rounded-full px-4 py-2.5 transition-colors w-full sm:w-auto" },
                        React.createElement(Icon.Loader2, { size: 12, className: syncing ? "animate-spin" : "" }),
                        syncing ? "sincronizando..." : "sincronizar Strava"),
                    syncMsg && React.createElement("span", { className: "text-[10px] font-mono text-[#5A7A87]" }, syncMsg))),
            React.createElement("div", { className: "mb-8" },
                React.createElement("div", { className: "flex items-end gap-4 flex-wrap" },
                    React.createElement("div", { className: "font-display text-[88px] leading-none font-semibold tabular-nums transition-colors duration-700", style: { color: daysLeft <= 3 ? "#E8453C" : daysLeft <= 10 ? "#FF6B35" : "#4A8B8C" } }, daysLeft),
                    React.createElement("div", { className: "pb-3" },
                        React.createElement("div", { className: "font-display text-xl uppercase tracking-wide" },
                            "d\u00EDas hasta ",
                            nextRace.name),
                        React.createElement("div", { className: "text-[#9FB8C4] text-sm font-mono mt-1" },
                            fmtDate(nextRace.date),
                            " \u00B7 ",
                            nextRace.distance.toLocaleString("es-ES"),
                            "m \u00B7 fase ",
                            nextRace.phase))),
                React.createElement("div", { className: "mt-2 text-sm text-[#9FB8C4] max-w-xl" }, "\u00DAltima semana de puesta a punto. Volumen bajo, intensidad mantenida, prioridad al descanso.")),
            React.createElement(WaveDivider, null),
            React.createElement("div", { className: "my-8" },
                React.createElement("div", { className: "font-display uppercase text-sm tracking-wider text-[#9FB8C4] mb-3" }, "Entrenador"),
                React.createElement("div", { className: "bg-[#0E2634] border border-[#1E3D4F] rounded-2xl flex flex-col h-[420px]" },
                    React.createElement("div", { className: "flex-1 overflow-y-auto p-4 space-y-3" },
                        messages.map((m, i) => (React.createElement("div", { key: i, className: `flex ${m.role === "user" ? "justify-end" : "justify-start"}` },
                            React.createElement("div", { className: `max-w-[80%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${m.role === "user"
                                    ? "bg-[#FF6B35] text-[#0B1F2E] font-medium rounded-br-sm"
                                    : "bg-[#142F42] text-[#EAF2F2] rounded-bl-sm border border-[#1E3D4F]"}` }, m.text)))),
                        sending && (React.createElement("div", { className: "flex justify-start" },
                            React.createElement("div", { className: "bg-[#142F42] border border-[#1E3D4F] rounded-2xl rounded-bl-sm px-4 py-2.5" },
                                React.createElement(Icon.Loader2, { size: 14, className: "animate-spin text-[#7FA9AA]" })))),
                        React.createElement("div", { ref: chatEndRef })),
                    React.createElement("div", { className: "border-t border-[#1E3D4F] p-3 flex gap-2 safe-bottom" },
                        React.createElement("input", { value: input, onChange: (e) => setInput(e.target.value), onFocus: (e) => setTimeout(() => e.target.scrollIntoView({ behavior: "smooth", block: "center" }), 300), onKeyDown: (e) => e.key === "Enter" && send(), placeholder: "Pregunta o pide una sesi\u00F3n...", style: { fontSize: 16 }, className: "flex-1 bg-[#0B1F2E] border border-[#1E3D4F] rounded-full px-4 py-2.5 placeholder-[#5A7A87] focus:outline-none focus:border-[#4A8B8C]" }),
                        React.createElement("button", { onClick: send, disabled: sending, className: "tap-target bg-[#FF6B35] hover:bg-[#E85A28] disabled:opacity-50 text-[#0B1F2E] rounded-full flex items-center justify-center shrink-0 transition-colors" },
                            React.createElement(Icon.Send, { size: 15 }))))),
            React.createElement(WaveDivider, { color: "#1E3D4F", opacity: 1 }),
            React.createElement("div", { className: "my-8" },
                React.createElement("div", { className: "font-display uppercase text-sm tracking-wider text-[#9FB8C4] mb-3" }, "Temporada \u2014 sep 25 a oct 26"),
                React.createElement(TideTimeline, null),
                React.createElement("div", { className: "flex gap-3 mt-3 flex-wrap text-[11px] font-mono text-[#9FB8C4]" },
                    React.createElement("span", { className: "flex items-center gap-1" },
                        React.createElement("span", { className: "w-2 h-2 rounded-full", style: { background: "#3E5A68" } }),
                        "Base"),
                    React.createElement("span", { className: "flex items-center gap-1" },
                        React.createElement("span", { className: "w-2 h-2 rounded-full", style: { background: "#5C8A99" } }),
                        "Progresi\u00F3n"),
                    React.createElement("span", { className: "flex items-center gap-1" },
                        React.createElement("span", { className: "w-2 h-2 rounded-full", style: { background: "#FF6B35" } }),
                        "Taper"),
                    React.createElement("span", { className: "flex items-center gap-1" },
                        React.createElement("span", { className: "w-2 h-2 rounded-full", style: { background: "#4A8B8C" } }),
                        "Build"),
                    React.createElement("span", { className: "flex items-center gap-1" },
                        React.createElement("span", { className: "w-2 h-2 rounded-full", style: { background: "#7FA9AA" } }),
                        "Recuperaci\u00F3n (Torrevieja)")),
                React.createElement("div", { className: "mt-6" },
                    React.createElement("div", { className: "font-display uppercase text-xs tracking-wider text-[#9FB8C4] mb-2" }, "Volumen mensual"),
                    React.createElement(MonthlyVolumeChart, { sessions: sessions })),
                React.createElement("div", { className: "mt-6" },
                    React.createElement("div", { className: "font-display uppercase text-xs tracking-wider text-[#9FB8C4] mb-2" }, "Ritmo medio por mes"),
                    React.createElement(PaceByPhaseChart, { sessions: sessions }))),
            React.createElement(WaveDivider, { color: "#1E3D4F", opacity: 1 }),
            React.createElement("div", { className: "my-8" },
                React.createElement("div", { className: "font-display uppercase text-sm tracking-wider text-[#9FB8C4] mb-1" }, "Forma (fitness / fatiga)"),
                React.createElement("div", { className: "text-[11px] text-[#5A7A87] font-mono mb-3" }, "modelo simplificado CTL/ATL/TSB basado en volumen \u2014 orientativo, no un TSS real"),
                React.createElement(FitnessForm, { sessions: sessions })),
            React.createElement(WaveDivider, { color: "#1E3D4F", opacity: 1 }),
            React.createElement("div", { className: "my-8" },
                React.createElement("div", { className: "font-display uppercase text-sm tracking-wider text-[#9FB8C4] mb-3" }, "Calendario de entrenamiento \u2014 \u00FAltimas 26 semanas"),
                React.createElement(TrainingHeatmap, { sessions: sessions })),
            React.createElement(WaveDivider, { color: "#1E3D4F", opacity: 1 }),
            React.createElement("div", { className: "my-8" },
                React.createElement("div", { className: "flex items-center justify-between mb-3" },
                    React.createElement("div", { className: "font-display uppercase text-sm tracking-wider text-[#9FB8C4]" }, "Sesiones registradas"),
                    React.createElement("button", { onClick: () => setShowForm((s) => !s), className: "tap-target flex items-center gap-1 text-xs font-mono uppercase tracking-wide bg-[#142F42] hover:bg-[#1B3B52] border border-[#1E3D4F] rounded-full px-4 py-2.5 transition-colors" },
                        showForm ? React.createElement(Icon.X, { size: 13 }) : React.createElement(Icon.Plus, { size: 13 }),
                        showForm ? "cerrar" : "proponer sesión")),
                showForm && (React.createElement("div", { className: "bg-[#0E2634] border border-[#1E3D4F] rounded-2xl p-4 mb-4" },
                    React.createElement("div", { className: "text-[11px] text-[#5A7A87] font-mono mb-3" }, "Propuesta de entrenamiento \u2014 al sincronizar con Strava, se sustituye sola por los datos reales del d\u00EDa."),
                    React.createElement("div", { className: "flex rounded-lg overflow-hidden border border-[#1E3D4F] mb-3" },
                        React.createElement("button", { onClick: () => setForm({ ...form, type: "agua" }), className: `tap-target flex-1 text-xs font-mono uppercase py-2.5 transition-colors ${form.type === "agua" ? "bg-[#4A8B8C] text-[#0B1F2E] font-semibold" : "bg-[#0B1F2E] text-[#7FA9AA]"}` }, "agua"),
                        React.createElement("button", { onClick: () => setForm({ ...form, type: "seco" }), className: `tap-target flex-1 text-xs font-mono uppercase py-2.5 transition-colors ${form.type === "seco" ? "bg-[#FF6B35] text-[#0B1F2E] font-semibold" : "bg-[#0B1F2E] text-[#7FA9AA]"}` }, "seco")),
                    React.createElement("div", { className: "grid grid-cols-2 sm:grid-cols-4 gap-3" },
                        React.createElement("input", { placeholder: "Descripci\u00F3n", value: form.description, onChange: (e) => setForm({ ...form, description: e.target.value }), style: { fontSize: 16 }, className: "col-span-2 sm:col-span-4 bg-[#0B1F2E] border border-[#1E3D4F] rounded-lg px-3 py-2.5 placeholder-[#5A7A87] focus:outline-none focus:border-[#4A8B8C]" }),
                        form.type === "agua" && (React.createElement(React.Fragment, null,
                            React.createElement("div", null,
                                React.createElement("label", { className: "block text-[9px] font-mono uppercase text-[#5A7A87] mb-1" }, "Series"),
                                React.createElement("input", { type: "number", min: 1, max: 10, value: form.series, onChange: (e) => setForm({ ...form, series: Math.max(1, Math.min(10, Number(e.target.value) || 1)) }), style: { fontSize: 16 }, className: "w-full bg-[#0B1F2E] border border-[#1E3D4F] rounded-lg px-3 py-2.5 font-mono focus:outline-none focus:border-[#4A8B8C]" })),
                            React.createElement("div", null,
                                React.createElement("label", { className: "block text-[9px] font-mono uppercase text-[#5A7A87] mb-1" }, "Metros"),
                                React.createElement("input", { type: "number", min: 25, max: 5000, step: 25, value: form.meters, onChange: (e) => setForm({ ...form, meters: Math.max(25, Math.min(5000, Number(e.target.value) || 25)) }), style: { fontSize: 16 }, className: "w-full bg-[#0B1F2E] border border-[#1E3D4F] rounded-lg px-3 py-2.5 font-mono focus:outline-none focus:border-[#4A8B8C]" })),
                            React.createElement("div", null,
                                React.createElement("label", { className: "block text-[9px] font-mono uppercase text-[#5A7A87] mb-1" }, "Ritmo"),
                                React.createElement("select", { value: form.ritmo, onChange: (e) => setForm({ ...form, ritmo: e.target.value }), style: { fontSize: 16 }, className: "w-full bg-[#0B1F2E] border border-[#1E3D4F] rounded-lg px-3 py-2.5 font-mono focus:outline-none focus:border-[#4A8B8C]" }, NOTATION_HELP.map((z) => React.createElement("option", { key: z, value: z }, z)))),
                            React.createElement("div", null,
                                React.createElement("label", { className: "block text-[9px] font-mono uppercase text-[#5A7A87] mb-1" }, "Material"),
                                React.createElement("select", { value: form.material, onChange: (e) => setForm({ ...form, material: e.target.value }), style: { fontSize: 16 }, className: "w-full bg-[#0B1F2E] border border-[#1E3D4F] rounded-lg px-3 py-2.5 focus:outline-none focus:border-[#4A8B8C]" }, ["ninguno", "palas", "aletas", "pullboy"].map((mtl) => React.createElement("option", { key: mtl, value: mtl }, mtl))))))),
                    form.type === "agua" && React.createElement("div", { className: "font-mono text-[11px] text-[#7FA9AA] mt-3" }, "Total: ", React.createElement("span", { className: "text-[#FF6B35] font-medium" }, totalMeters, "m"), ` \u00B7 ${form.series} \u00D7 ${form.meters}m`),
                    React.createElement("button", { onClick: addSession, className: "tap-target bg-[#FF6B35] hover:bg-[#E85A28] text-[#0B1F2E] font-semibold rounded-lg px-3 py-2.5 text-sm transition-colors mt-3 w-full sm:w-auto" }, "Guardar propuesta"))),
                React.createElement(SessionAccordion, { sessions: sessions, paceTargets: paceTargets })),
            React.createElement(WaveDivider, { color: "#1E3D4F", opacity: 1 }),
            React.createElement("div", { className: "my-8" },
                React.createElement("div", { className: "flex items-center justify-between flex-wrap gap-2 mb-1" },
                    React.createElement("div", { className: "font-display uppercase text-sm tracking-wider text-[#9FB8C4]" }, "Nataci\u00F3n"),
                    React.createElement("button", { onClick: runCalibration, disabled: calibrating, className: "tap-target flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wide bg-[#142F42] hover:bg-[#1B3B52] disabled:opacity-50 border border-[#1E3D4F] rounded-full px-4 py-2.5 transition-colors" },
                        React.createElement(Icon.Loader2, { size: 12, className: calibrating ? "animate-spin" : "" }),
                        "actualizar ritmos con Strava")),
                calibrateMsg && React.createElement("div", { className: "text-[10px] font-mono text-[#5A7A87] mb-3" }, calibrateMsg),
                React.createElement("div", { className: "text-[11px] text-[#5A7A87] font-mono mb-3" }, "de m\u00E1s lento a m\u00E1s r\u00E1pido \u00B7 ritmo por 100m"),
                React.createElement("div", { className: "grid grid-cols-2 sm:grid-cols-4 gap-2" }, NOTATION_HELP.map((zone) => {
                    const range = paceTargets[zone] || DEFAULT_PACE_TARGETS[zone];
                    return React.createElement("div", { key: zone, className: "bg-[#0E2634] border border-[#1E3D4F] rounded-lg px-3 py-2" },
                        React.createElement("div", { className: "font-mono text-[#FF6B35] text-sm font-medium" }, zone),
                        range && React.createElement("div", { className: "text-[11px] text-[#9FB8C4] font-mono" }, secondsToPace(range[0]), "\u2013", secondsToPace(range[1])));
                })),
                React.createElement("div", { className: "font-display uppercase text-xs tracking-wider text-[#9FB8C4] mt-5 mb-2" },
                    "Zonas de FC (estimadas, m\u00E1x. ",
                    MAX_HR,
                    " bpm)"),
                React.createElement("div", { className: "flex flex-wrap gap-3" }, HR_ZONES.map((z) => (React.createElement("span", { key: z.key, className: "flex items-center gap-1.5 text-[11px] font-mono text-[#9FB8C4]" },
                    React.createElement("span", { className: "w-2 h-2 rounded-full", style: { background: z.color } }),
                    z.key,
                    " \u00B7 ",
                    z.label))))),
            React.createElement(WaveDivider, { color: "#1E3D4F", opacity: 1 }),
            React.createElement("div", { className: "my-8" },
                React.createElement("div", { className: "font-display uppercase text-sm tracking-wider text-[#9FB8C4] mb-1" }, "Semana de Getaria\u2013Zarautz"),
                React.createElement("div", { className: "text-[11px] text-[#5A7A87] font-mono mb-3" }, "taper \u00B7 3 sesiones de agua + trabajo en seco"),
                React.createElement("div", { className: "space-y-2" }, RACE_WEEK_PLAN.map((s, i) => {
                    const done = s.type === "agua" ? sessions.find((sess) => sess.date === s.date) : null;
                    const isPast = s.date < TODAY.toISOString().slice(0, 10);
                    return (React.createElement("div", { key: i, className: `flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 rounded-xl px-4 py-3 border ${s.type === "race"
                            ? "bg-[#FF6B35]/10 border-[#FF6B35]"
                            : "bg-[#0E2634] border-[#1E3D4F]"}` },
                        React.createElement("span", { className: "font-mono text-[11px] uppercase tracking-wide text-[#7FA9AA] w-24 shrink-0" }, s.day),
                        React.createElement("span", { className: `font-mono text-[10px] uppercase tracking-wide rounded-full px-2 py-0.5 w-14 text-center shrink-0 ${s.type === "agua"
                                ? "bg-[#4A8B8C]/20 text-[#7FA9AA]"
                                : s.type === "race"
                                    ? "bg-[#FF6B35] text-[#0B1F2E] font-semibold"
                                    : "bg-[#1E3D4F] text-[#9FB8C4]"}` }, s.type === "agua" ? "agua" : s.type === "race" ? "carrera" : "seco"),
                        React.createElement("div", { className: "min-w-0 flex-1" },
                            React.createElement("div", { className: "text-sm font-medium" }, s.title),
                            s.detail && React.createElement("div", { className: "text-[11px] text-[#9FB8C4] truncate sm:whitespace-normal" }, s.detail)),
                        s.type === "agua" && (React.createElement("span", { className: `font-mono text-[10px] rounded-full px-2 py-0.5 shrink-0 ${done ? "bg-[#4A8B8C]/20 text-[#7FA9AA]" : isPast ? "bg-[#E8453C]/15 text-[#E8453C]" : "bg-[#1E3D4F] text-[#5A7A87]"}` }, done ? `✓ hecho · ${done.distance}m` : isPast ? "✗ sin registrar" : "pendiente"))));
                }))),
            React.createElement(WaveDivider, { color: "#1E3D4F", opacity: 1 }),
            React.createElement("div", { className: "my-8" },
                React.createElement("div", { className: "font-display uppercase text-sm tracking-wider text-[#9FB8C4] mb-1" }, "Alimentaci\u00F3n \u00B7 d\u00EDa de carrera"),
                React.createElement("div", { className: "text-[11px] text-[#5A7A87] font-mono mb-3" }, "domingo 19 \u00B7 salida 11:00h \u00B7 agua a ~25\u00B0C, ola de calor prevista"),
                React.createElement("div", { className: "space-y-2" }, RACE_DAY_NUTRITION.map((n, i) => (React.createElement("div", { key: i, className: "flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-4 bg-[#0E2634] border border-[#1E3D4F] rounded-xl px-4 py-3" },
                    React.createElement("span", { className: "font-mono text-[11px] text-[#FF6B35] w-24 shrink-0" }, n.time),
                    React.createElement("div", { className: "min-w-0" },
                        React.createElement("div", { className: "text-sm font-medium" }, n.label),
                        n.detail && React.createElement("div", { className: "text-[11px] text-[#9FB8C4]" }, n.detail))))))),
            React.createElement(WaveDivider, { color: "#1E3D4F", opacity: 1 }),
            React.createElement("div", { className: "my-8" },
                React.createElement("div", { className: "font-display uppercase text-sm tracking-wider text-[#9FB8C4] mb-1" }, "Despu\u00E9s de Getaria \u2014 hacia Salom\u00E9 Campos"),
                React.createElement("div", { className: "text-[11px] text-[#5A7A87] font-mono mb-3" }, "5.000m \u00B7 5 de septiembre \u00B7 bloque de construcci\u00F3n"),
                React.createElement("div", { className: "space-y-2" }, BUILD_PLAN.map((b, i) => (React.createElement("div", { key: i, className: `flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-4 rounded-xl px-4 py-3 border ${b.title.includes("Salomé") ? "bg-[#4A8B8C]/10 border-[#4A8B8C]" : "bg-[#0E2634] border-[#1E3D4F]"}` },
                    React.createElement("span", { className: "font-mono text-[11px] text-[#7FA9AA] w-40 shrink-0" }, b.block),
                    React.createElement("div", { className: "min-w-0" },
                        React.createElement("div", { className: "text-sm font-medium" }, b.title),
                        b.detail && React.createElement("div", { className: "text-[11px] text-[#9FB8C4]" }, b.detail))))))),
            React.createElement(WaveDivider, { color: "#1E3D4F", opacity: 1 }),
            React.createElement("div", { className: "text-center text-[10px] font-mono text-[#3E5A68] pt-4 pb-2 uppercase tracking-widest" }, "Getaria\u2013Zarautz \u00B7 Salom\u00E9 Campos \u00B7 Torrevieja"))));
}
// ---- Mount --------------------------------------------------------------
ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(SwimCoach, null));
