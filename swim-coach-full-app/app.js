"use strict";
const { useState, useEffect, useMemo } = React;
// ---- Shared-secret auth for the /api endpoints -----------------------------
// This repo is public, so the real secret can never live in this file — it
// lives only in the APP_SECRET env var on Vercel. The first time the app
// needs it, it asks once and remembers it in this browser's localStorage.
function getAppSecret() {
    let secret = "";
    try {
        secret = localStorage.getItem("swimcoach_app_secret") || "";
    }
    catch (e) { }
    if (!secret) {
        secret = window.prompt("Código de acceso de SwimCoach:") || "";
        if (secret) {
            try {
                localStorage.setItem("swimcoach_app_secret", secret);
            }
            catch (e) { }
        }
    }
    return secret;
}
function authHeaders() {
    return { "Content-Type": "application/json", "x-app-secret": getAppSecret() };
}
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
    Thermometer: svgIcon(React.createElement("path", { d: "M14 4a2 2 0 0 0-4 0v10.5a4 4 0 1 0 4 0Z" })),
    Wind: svgIcon(React.createElement(React.Fragment, null,
        React.createElement("path", { d: "M9.5 4.5a2.5 2.5 0 1 1 2.5 2.5H2" }),
        React.createElement("path", { d: "M12.5 19.5a2.5 2.5 0 1 0 2.5-2.5H2" }),
        React.createElement("path", { d: "M17 8a3 3 0 1 1 3 3H2" }))),
    Wave: svgIcon(React.createElement("path", { d: "M2 12c1.5-1.5 3.5-1.5 5 0s3.5 1.5 5 0 3.5-1.5 5 0 3.5 1.5 5 0" })),
    Sky: svgIcon(React.createElement(React.Fragment, null,
        React.createElement("circle", { cx: "9", cy: "9", r: "4" }),
        React.createElement("path", { d: "M14 15h4a3 3 0 0 0 0-6 5 5 0 0 0-9-2" }))),
    Zap: svgIcon(React.createElement("path", { d: "M13 2 4 14h6l-1 8 9-12h-6l1-8Z" })),
    ArrowUp: svgIcon(React.createElement("path", { d: "M12 19V5M5 12l7-7 7 7" })),
    Share: svgIcon(React.createElement(React.Fragment, null,
        React.createElement("path", { d: "M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" }),
        React.createElement("polyline", { points: "16 6 12 2 8 6" }),
        React.createElement("line", { x1: "12", y1: "2", x2: "12", y2: "15" }))),
};
// ---- Fixed reference data -----------------------------------------------
// `let`, not `const` — SwimCoach refreshes this on a timer (see the
// "TODAY ticker" effect) so the current block and every date-based chart move
// forward on their own instead of freezing at whatever date the page
// happened to load on.
let TODAY = new Date();
function todayStr() {
    const d = TODAY;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
// ---- Temporada 2026–27 -----------------------------------------------------
// Periodización por bloques (Issurin) + variación ondulante dentro de cada
// semana. Fechas = semanas ISO del boceto (bloque 0 = semana 41). La carrera
// objetivo es finales de julio / principios de agosto 2027, fecha por
// confirmar: cuando se sepa, basta con ajustar `to` de los bloques 6–7 y
// SEASON.end. `break: true` = parón planificado (no cuenta como pérdida de
// forma en las gráficas).
const SEASON = {
    label: "Temporada 2026–27",
    start: "2026-10-05",
    end: "2027-08-01",
    goal: "Travesía objetivo · jul/ago 2027 (fecha por confirmar)",
};
const SEASON_BLOCKS = [
    { id: "b0", n: 0, name: "Recalibración", from: "2026-10-05", to: "2026-10-11", color: "#7FA9AA", focus: "Test de velocidad crítica (400 + 200) para fijar las zonas antes de cargar." },
    { id: "b1", n: 1, name: "Base aeróbica general", from: "2026-10-12", to: "2026-11-15", color: "#3E7A8C", focus: "Volumen aeróbico cómodo (AeL1–AeL2) y técnica. Construir antes del parón." },
    { id: "pa", n: null, name: "Parón planificado", from: "2026-11-16", to: "2026-12-13", color: "#5A7A87", focus: "Sin carga. La forma bajará y es lo esperado — está previsto en la fase de base.", break: true },
    { id: "b2", n: 2, name: "Reentrada progresiva", from: "2026-12-14", to: "2027-01-24", color: "#4A8B8C", focus: "Recuperar volumen poco a poco e introducir AeL2." },
    { id: "b3", n: 3, name: "Núcleo de umbral", from: "2027-01-25", to: "2027-03-07", color: "#5FA3A4", focus: "AeL2 / AeL3 — el bloque principal: VLT1 es el mejor predictor en larga distancia." },
    { id: "b4", n: 4, name: "Umbral avanzado", from: "2027-03-08", to: "2027-04-18", color: "#E8C547", focus: "Umbral más exigente e introducción de AeM / ritmo de carrera." },
    { id: "b5", n: 5, name: "Específico de carrera", from: "2027-04-19", to: "2027-05-30", color: "#F2994A", focus: "AeM en series largas rotas (p. ej. 6×700m) y AnL para el final." },
    { id: "b6", n: 6, name: "Simulación", from: "2027-05-31", to: "2027-07-11", color: "#FF6B35", focus: "Aguas abiertas, corrientes y simulación de carrera. Puesta a punto." },
    { id: "b7", n: 7, name: "Taper", from: "2027-07-12", to: "2027-07-25", color: "#E8453C", focus: "Volumen −40–50 %, intensidad mantenida, prioridad al descanso." },
];
const PREVIOUS_SEASON_PHASE = { id: "prev", n: null, name: "Temporada 25–26", color: "#2E4A5A" };
function blockForDate(dateStr) {
    return SEASON_BLOCKS.find((b) => dateStr >= b.from && dateStr <= b.to) || null;
}
function blockLabel(b) {
    return b.n === null ? b.name : `Bloque ${b.n} · ${b.name}`;
}
function isPlannedBreak(dateStr) {
    const b = blockForDate(dateStr);
    return !!(b && b.break);
}
// Distancias de referencia para la predicción mientras no haya carrera
// confirmada — cuando la haya, se puede añadir aquí con su distancia real.
const PREDICTION_TARGETS = [
    { id: "3k", name: "3.000 m aguas abiertas", distance: 3000 },
    { id: "5k", name: "5.000 m aguas abiertas", distance: 5000 },
];
// Piscina por día de la semana (0=domingo): L–J 25m, V–S 50m, D 25m.
// Las sesiones de grupo del club son siempre en 50m.
const POOL_BY_WEEKDAY = [25, 25, 25, 25, 25, 50, 50];
function poolForDate(dateStr, clubDay) {
    if (clubDay === "d3")
        return 50;
    const d = new Date(dateStr + "T12:00:00");
    return Number.isNaN(d.getTime()) ? 25 : POOL_BY_WEEKDAY[d.getDay()];
}
const CLUB_DAY_OPTIONS = [
    { id: "", label: "propia" },
    { id: "d1", label: "club · día 1" },
    { id: "d2", label: "club · día 2" },
    { id: "d3", label: "club · día 3 (grupo)" },
];
// Zonas de ritmo, de más lenta a más rápida. Nota: interpreto la "AeL" repetida
// entre AeM y Vo2Max como "AnL" (anaeróbico láctico) — el nombre estándar de esa
// zona en esta progresión; dímelo si querías otra cosa.
// "Cal" (calentamiento) lived here too, but a warm-up doesn't have a single
// target pace either — same reasoning as the set-shape categories below —
// so it moved out, next to them.
const NOTATION_HELP = ["AeL1", "AeL2", "AeL3", "AeM", "AnL", "Vo2Max"];
// Extra set-shape categories, only selectable in the "proponer sesión" form —
// these describe how a set is swum (warm-up, cool-down, or a build
// within/across reps) rather than a single target pace, so they're kept out
// of NOTATION_HELP (which drives the calibrated pace-zone grid, deviation
// flags and calibratePaceTargets — none of which have a single number to
// compare this kind of set against).
const RITMO_FORM_OPTIONS = ["Cal", ...NOTATION_HELP, "Calm", "ProgD", "Prog"];
// Rough pace estimate for those set-shape categories, used only to estimate
// the summary pace of a proposal — never for calibration or deviation checks.
const STRUCTURAL_PACE_ESTIMATE = {
    Cal: [105, 120], // calentamiento — easy pace, no fixed target
    Calm: [105, 120], // vuelta a la calma — same, easy pace
    ProgD: [88, 98], // progresivo dentro de la serie — starts ~AeL2/3, ends ~AnL
    Prog: [86, 96], // progresivo cada serie — same spread, across reps instead of within one
};
// Target pace range per 100m (seconds), slowest -> fastest. Used to flag sessions
// that ran meaningfully faster/slower than intended, and shown in the Natación panel.
// These are sensible defaults until calibrated against real Strava paces.
const DEFAULT_PACE_TARGETS = {
    // Marcas reales de Anton (aprox. AeL1 1:40, AeL2 1:35, AeL3 1:32, AeM
    // 1:30, AnL 1:28, Vo2Max 1:20). Cada rango es el punto medio con la zona
    // adyacente, no una medición directa — pulsa "actualizar ritmos con
    // Strava" en cuanto tengas 10+ sesiones de piscina reales para que se
    // recalculen a partir de tus datos en vez de este punto de partida.
    AeL1: [98, 105],
    AeL2: [94, 98],
    AeL3: [91, 94],
    AeM: [89, 91],
    AnL: [84, 89],
    Vo2Max: [70, 84],
};
// ---- Calibrate pace zones from real Strava history -------------------------
// Splits the distribution of observed swim paces into 7 bands (one per zone),
// using the 4th/96th percentile as the outer bounds to avoid outliers.
function calibratePaceTargets(sessions) {
    // Prefer per-lap data (laps: [{distance, pace}], populated by the backend
    // from Strava's laps endpoint — see lib/strava.js getLapData) over a
    // session's single whole-activity average. The average blends warm-up +
    // main set + cool-down into one number that doesn't represent any real
    // zone — checked against Anton's actual Strava data: a session that
    // averaged 1:39/100m had laps ranging from 1:26 (fast reps) to 1:46
    // (warm-up/cool-down), which is the spread this calibration actually
    // needs. Sessions synced before laps existed, or manual entries, fall
    // back to their one average pace so they still contribute, just less
    // precisely.
    const paces = sessions
        // Exclude "seco" (no pace) and "planned" proposals — a proposal's pace
        // field is synthetic (derived from the *current* zone targets when you
        // saved it), so feeding it back into calibration would just reinforce
        // whatever zones already existed instead of reflecting real swims.
        .filter((s) => s.type !== "seco" && !s.planned)
        .flatMap((s) => {
            // Normalize to pool-equivalent pace before mixing. Open-water
            // paces run ~10s/100m slower than pool paces for the same effort
            // (wetsuit drag, sighting, no wall push-offs — see
            // POOL_TO_OPENWATER_OFFSET_SEC). These zones are a pool training
            // framework, so blending raw open-water times in unadjusted was
            // dragging every zone slower than your actual pool pace.
            const offset = s.location === "abiertas" ? POOL_TO_OPENWATER_OFFSET_SEC : 0;
            if (Array.isArray(s.laps) && s.laps.length > 0) {
                return s.laps.map((lap) => lap.pace - offset);
            }
            const sec = paceToSeconds(s.pace);
            return sec ? [sec - offset] : [];
        })
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
// HR zones from Anton's real max HR (184 bpm).
const MAX_HR = 184;
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
// ---- Collapsible section wrapper (for less-frequently-checked panels) -----
function CollapsibleSection({ id, title, subtitle, defaultOpen, card, children }) {
    const [open, setOpen] = useState(!!defaultOpen);
    return React.createElement("div", { id: id, className: card ? "bg-[#0E2634] border border-[#1E3D4F] rounded-2xl p-4 scroll-mt-20 h-fit shadow-[0_8px_28px_-6px_rgba(0,0,0,0.45)]" : "my-12 scroll-mt-20" },
        React.createElement("button", { onClick: () => setOpen((v) => !v), className: "tap-target w-full flex items-center justify-between gap-2 mb-1 text-left" },
            React.createElement("div", null,
                React.createElement("div", { className: "font-display uppercase text-[15px] tracking-[0.08em] text-[#EAF2F2]" }, title),
                subtitle && React.createElement("div", { className: "text-[11px] text-[#7FA9AA] font-mono mt-0.5" }, subtitle)),
            React.createElement("span", { className: "inline-block text-[#4A8B8C] transition-transform shrink-0", style: { transform: open ? "rotate(90deg)" : "rotate(0deg)" } }, "▸")),
        open && React.createElement("div", { className: "mt-3" }, children));
}
function WaveDivider({ color = "#4A8B8C", opacity = 0.5 }) {
    return (React.createElement("svg", { viewBox: "0 0 400 16", preserveAspectRatio: "none", className: "w-full h-4 wave-svg", style: { opacity } },
        React.createElement("path", { d: "M0,8 C 20,0 40,16 60,8 C 80,0 100,16 120,8 C140,0 160,16 180,8 C200,0 220,16 240,8 C260,0 280,16 300,8 C320,0 340,16 360,8 C380,0 400,16 400,8", fill: "none", stroke: color, strokeWidth: "1.5" })));
}
// ---- Season timeline (bloques 2026–27) -------------------------------------
function dayIndex(dateStr) {
    return Math.round(new Date(dateStr + "T12:00:00").getTime() / 86400000);
}
function fmtRange(from, to) {
    return `${fmtDate(from)} – ${fmtDate(to)}`;
}
function SeasonTimeline() {
    const start = dayIndex(SEASON.start);
    const end = dayIndex(SEASON.end);
    const total = end - start;
    const pct = (d) => Math.max(0, Math.min(100, ((dayIndex(d) - start) / total) * 100));
    const today = todayStr();
    const current = blockForDate(today);
    const inSeason = today >= SEASON.start && today <= SEASON.end;
    return (React.createElement("div", { className: "w-full" },
        React.createElement("div", { className: "relative h-10 rounded-full bg-[#0E2634] overflow-hidden border border-[#1E3D4F]" },
            SEASON_BLOCKS.map((b) => {
                const isCur = current && current.id === b.id;
                const isPast = b.to < today;
                return React.createElement("div", {
                    key: b.id,
                    title: `${blockLabel(b)} · ${fmtRange(b.from, b.to)}`,
                    className: "absolute top-0 h-full flex items-center justify-center font-mono text-[10px] text-[#EAF2F2] border-r border-[#0B1F2E]",
                    style: {
                        left: `${pct(b.from)}%`,
                        width: `${pct(b.to) - pct(b.from) + (100 / total)}%`,
                        background: b.break
                            ? `repeating-linear-gradient(135deg, ${b.color}55 0 4px, transparent 4px 8px)`
                            : b.color,
                        opacity: b.break ? 1 : isCur ? 0.95 : isPast ? 0.3 : 0.5,
                    },
                }, b.n === null ? "—" : b.n);
            }),
            inSeason && React.createElement("div", { className: "absolute top-0 h-full w-0.5 bg-[#EAF2F2] shadow-[0_0_8px_#EAF2F2]", style: { left: `${pct(today)}%` } })),
        React.createElement("div", { className: "flex justify-between mt-2 text-[10px] uppercase tracking-wider text-[#9FB8C4] font-mono" },
            React.createElement("span", null, fmtDate(SEASON.start)),
            React.createElement("span", { className: "text-[#EAF2F2]" }, "▲ hoy"),
            React.createElement("span", null, "jul/ago 27")),
        React.createElement("div", { className: "mt-4 space-y-1.5" }, SEASON_BLOCKS.map((b) => {
            const isCur = current && current.id === b.id;
            const isPast = b.to < today;
            return React.createElement("div", { key: b.id, className: `flex items-center gap-2.5 text-[11px] font-mono rounded-lg px-2.5 py-1.5 ${isCur ? "bg-[#142F42] text-[#EAF2F2]" : isPast ? "text-[#5A7A87]" : "text-[#9FB8C4]"}` },
                React.createElement("span", { className: "w-2.5 h-2.5 rounded-full shrink-0", style: { background: b.color, opacity: b.break ? 0.6 : 1 } }),
                React.createElement("span", { className: "flex-1 truncate" }, blockLabel(b)),
                React.createElement("span", { className: "shrink-0 text-[10px]" }, fmtRange(b.from, b.to)),
                isCur && React.createElement("span", { className: "shrink-0 text-[9px] uppercase text-[#FF6B35]" }, "ahora"));
        })),
        React.createElement("div", { className: "text-[10px] font-mono text-[#5A7A87] mt-3" }, SEASON.goal, " — al confirmarla se reajustan los bloques 6–7 hacia atrás desde la fecha real.")));
}
// ---- Hero: bloque actual (sustituye a la antigua cuenta atrás) -------------
function CurrentBlockHero() {
    const today = todayStr();
    const b = blockForDate(today);
    const seasonWeek = Math.floor((dayIndex(today) - dayIndex(SEASON.start)) / 7) + 1;
    const seasonWeeks = Math.ceil((dayIndex(SEASON.end) - dayIndex(SEASON.start)) / 7);
    if (!b) {
        const before = today < SEASON.start;
        return React.createElement("div", { className: "mb-8" },
            React.createElement("div", { className: "font-mono text-[11px] uppercase tracking-[0.2em] text-[#7FA9AA] mb-2" }, SEASON.label),
            React.createElement("div", { className: "font-display text-4xl uppercase tracking-wide" }, before ? "Transición" : "Fin de temporada"),
            React.createElement("div", { className: "mt-2 text-sm text-[#9FB8C4] max-w-xl" }, before ? `La temporada arranca el ${fmtDate(SEASON.start)}.` : "Actualiza los bloques de la próxima temporada."));
    }
    const blockWeeks = Math.round((dayIndex(b.to) - dayIndex(b.from) + 1) / 7);
    const weekInBlock = Math.floor((dayIndex(today) - dayIndex(b.from)) / 7) + 1;
    const progress = Math.min(100, ((dayIndex(today) - dayIndex(b.from) + 1) / (dayIndex(b.to) - dayIndex(b.from) + 1)) * 100);
    const idx = SEASON_BLOCKS.indexOf(b);
    const next = SEASON_BLOCKS[idx + 1];
    return React.createElement("div", { className: "mb-8" },
        React.createElement("div", { className: "font-mono text-[11px] uppercase tracking-[0.2em] text-[#7FA9AA] mb-3" }, SEASON.label, " · semana ", seasonWeek, " de ", seasonWeeks),
        React.createElement("div", { className: "flex items-end gap-4 flex-wrap" },
            React.createElement("div", { className: "font-display text-[88px] leading-none font-semibold tabular-nums", style: { color: b.color, textShadow: `0 0 60px ${b.color}55` } }, b.n === null ? "—" : b.n),
            React.createElement("div", { className: "pb-3" },
                React.createElement("div", { className: "font-display text-xl uppercase tracking-wide" }, b.n === null ? b.name : `Bloque ${b.n} · ${b.name}`),
                React.createElement("div", { className: "text-[#9FB8C4] text-sm font-mono mt-1" }, "semana ", weekInBlock, " de ", blockWeeks, " · ", fmtRange(b.from, b.to)))),
        React.createElement("div", { className: "mt-3 h-1.5 rounded-full bg-[#142F42] overflow-hidden max-w-xl" },
            React.createElement("div", { className: "h-full rounded-full", style: { width: `${progress}%`, background: b.color } })),
        React.createElement("div", { className: "mt-3 text-sm text-[#9FB8C4] max-w-xl" }, b.focus),
        next && React.createElement("div", { className: "mt-3 flex items-center gap-2 flex-wrap" },
            React.createElement("span", { className: "font-mono text-[10px] uppercase tracking-wider text-[#5A7A87]" }, "después"),
            React.createElement("span", { className: "font-mono text-xs text-[#7FA9AA] bg-[#0E2634] border border-[#1E3D4F] rounded-full px-3 py-1" }, blockLabel(next), " · desde ", fmtDate(next.from))));
}
// Primer día del mes de hace 11 meses — ventana móvil de 12 meses, para que
// las gráficas no se queden vacías al cruzar de año ni al empezar temporada.
function rollingSince() {
    const d = new Date(TODAY.getFullYear(), TODAY.getMonth() - 11, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
// ---- Monthly volume bar chart ---------------------------------------------
function MonthlyVolumeChart({ sessions }) {
    const since = rollingSince();
    const monthly = useMemo(() => {
        const groups = {};
        sessions.forEach((s) => {
            if (s.type === "seco" || s.planned)
                return;
            if (s.date < since)
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
            label: new Date(ym + "-01T12:00:00").toLocaleDateString("es-ES", { month: "narrow" }),
        }))
            .sort((a, b) => (a.ym < b.ym ? -1 : 1));
    }, [sessions, since]);
    if (monthly.length === 0) {
        return React.createElement("div", { className: "text-sm text-[#5A7A87] font-mono" }, "Sin datos de volumen todavía.");
    }
    const max = Math.max(...monthly.map((m) => m.meters));
    const currentYm = `${TODAY.getFullYear()}-${String(TODAY.getMonth() + 1).padStart(2, "0")}`;
    return (React.createElement("div", { className: "w-full" },
        React.createElement("div", { className: "flex items-end gap-1.5 h-32" }, monthly.map((m) => {
            const isCurrent = m.ym === currentYm;
            const h = Math.max(4, (m.meters / max) * 100);
            return (React.createElement("div", { key: m.ym, className: "flex-1 min-w-0 flex flex-col items-center justify-end h-full group relative" },
                React.createElement("span", { className: "text-[9px] font-mono text-[#7FA9AA] mb-1 opacity-0 group-hover:opacity-100 transition-opacity absolute -top-4" },
                    (m.meters / 1000).toFixed(1),
                    "km"),
                React.createElement("div", { className: "w-full rounded-t-sm transition-colors", style: {
                        height: `${h}%`,
                        background: isCurrent ? "transparent" : phaseForDate(`${m.ym}-15`).color,
                        border: isCurrent ? "1.5px dashed #FF6B35" : "none",
                        opacity: isCurrent ? 1 : 0.75,
                    } })));
        })),
        React.createElement("div", { className: "flex gap-1.5 mt-2" }, monthly.map((m) => (React.createElement("div", { key: m.ym, title: m.ym, className: "flex-1 min-w-0 text-center text-[9px] font-mono text-[#7FA9AA] uppercase" }, m.label)))),
        React.createElement("div", { className: "text-[10px] font-mono text-[#5A7A87] mt-2" }, monthly.find((m) => m.ym === currentYm) && React.createElement("span", null, "últimos 12 meses · color = bloque · mes en curso (borde naranja) — datos parciales"))));
}
// ---- Pace-by-month/phase chart ---------------------------------------------
function phaseForDate(dateStr) {
    const b = blockForDate(dateStr);
    if (b)
        return { key: b.id, label: b.n === null ? b.name : `B${b.n} ${b.name}`, color: b.color };
    if (dateStr < SEASON.start)
        return { key: PREVIOUS_SEASON_PHASE.id, label: PREVIOUS_SEASON_PHASE.name, color: PREVIOUS_SEASON_PHASE.color };
    const last = SEASON_BLOCKS[SEASON_BLOCKS.length - 1];
    return { key: last.id, label: last.name, color: last.color };
}
function PaceByPhaseChart({ sessions }) {
    const since = rollingSince();
    const monthly = useMemo(() => {
        const groups = {};
        sessions.forEach((s) => {
            if (s.planned || s.type === "seco")
                return;
            const secs = paceToSeconds(s.pace);
            if (!secs)
                return;
            if (s.date < since)
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
    }, [sessions, since]);
    if (monthly.length === 0) {
        return React.createElement("div", { className: "text-sm text-[#5A7A87] font-mono" }, "Sin datos de ritmo suficientes en los últimos 12 meses.");
    }
    const phasesPresent = [];
    monthly.forEach((m) => {
        const ph = phaseForDate(m.date);
        if (!phasesPresent.some((x) => x.key === ph.key))
            phasesPresent.push(ph);
    });
    const fastest = Math.min(...monthly.map((m) => m.avgSec));
    const slowest = Math.max(...monthly.map((m) => m.avgSec));
    const range = slowest - fastest || 1;
    const W = 100, H = 100, padX = 6, padY = 22;
    const xFor = (i) => monthly.length === 1 ? W / 2 : padX + (i / (monthly.length - 1)) * (W - padX * 2);
    // faster pace (lower seconds) -> higher on the chart
    const yFor = (sec) => padY + ((sec - fastest) / range) * (H - padY * 2);
    const points = monthly.map((m, i) => ({ xPct: xFor(i), yPct: yFor(m.avgSec), m }));
    // Dots and value labels are plain HTML positioned with left/top percentages
    // rather than SVG <circle> elements — the chart stretches to fill its
    // container (preserveAspectRatio "none"), which would otherwise squash
    // circles into ellipses. Only the connecting line + area stay as SVG.
    const lineD = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.xPct.toFixed(1)},${p.yPct.toFixed(1)}`).join(" ");
    const areaD = `${lineD} L${points[points.length - 1].xPct.toFixed(1)},${H} L${points[0].xPct.toFixed(1)},${H} Z`;
    return (React.createElement("div", { className: "w-full" },
        React.createElement("div", { className: "relative w-full h-44" },
            React.createElement("svg", { viewBox: `0 0 ${W} ${H}`, className: "absolute inset-0 w-full h-full", preserveAspectRatio: "none" },
                React.createElement("defs", null,
                    React.createElement("linearGradient", { id: "paceAreaFill", x1: "0", y1: "0", x2: "0", y2: "1" },
                        React.createElement("stop", { offset: "0%", stopColor: "#4A8B8C", stopOpacity: "0.25" }),
                        React.createElement("stop", { offset: "100%", stopColor: "#4A8B8C", stopOpacity: "0" }))),
                React.createElement("path", { d: areaD, fill: "url(#paceAreaFill)", stroke: "none" }),
                React.createElement("path", { d: lineD, fill: "none", stroke: "#4A8B8C", strokeWidth: "1.4", strokeLinecap: "round", strokeLinejoin: "round", vectorEffect: "non-scaling-stroke" })),
            points.map((p) => {
                const phase = phaseForDate(p.m.date);
                return React.createElement("div", { key: p.m.ym, className: "absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1", style: { left: `${p.xPct}%`, top: `${p.yPct}%` } },
                    React.createElement("span", { className: "text-[9px] font-mono font-medium text-[#EAF2F2] whitespace-nowrap bg-[#0B1F2E]/90 px-1 rounded-sm" }, secondsToPace(Math.round(p.m.avgSec))),
                    React.createElement("span", { className: "w-2.5 h-2.5 rounded-full border-2 border-[#0B1F2E]", style: { background: phase.color } }));
            })),
        React.createElement("div", { className: "flex gap-1.5 mt-2" }, monthly.map((m) => (React.createElement("div", { key: m.ym, className: "flex-1 min-w-0 overflow-hidden text-center text-[9px] font-mono text-[#7FA9AA] uppercase" },
            m.ym.slice(5))))),
        React.createElement("div", { className: "flex flex-wrap items-center justify-between gap-2 mt-2" },
            React.createElement("div", { className: "flex flex-wrap items-center gap-3 text-[9px] font-mono text-[#7FA9AA]" }, phasesPresent.map((ph) => React.createElement("span", { key: ph.key, className: "flex items-center gap-1" }, React.createElement("span", { className: "w-2 h-2 rounded-full", style: { background: ph.color } }), ph.label))),
            React.createElement("span", { className: "text-[9px] font-mono text-[#7FA9AA]" }, "más arriba = más rápido"))));
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
// ---- Shareable Instagram Story image (1080x1920) per session --------------
// Draws a vertical "story" card with the session's key numbers using plain
// Canvas 2D, in the same visual language as the app (navy background, orange
// accent, teal secondary, Oswald/Inter/IBM Plex Mono) — no server round-trip,
// no extra dependency. Triggered per session from the "compartir" button in
// SessionCard.
const STORY_W = 1080, STORY_H = 1920;
function roundRectPath(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
}
function drawStoryWaves(ctx, baseY) {
    // Three layered sine-ish bands, echoing the app's WaveDivider motif.
    const layers = [
        { color: "#142F42", amp: 26, freq: 0.9, yOff: 40, alpha: 1 },
        { color: "#1E3D4F", amp: 34, freq: 1.3, yOff: 90, alpha: 0.9 },
        { color: "#4A8B8C", amp: 18, freq: 1.7, yOff: 130, alpha: 0.35 },
    ];
    layers.forEach(({ color, amp, freq, yOff, alpha }) => {
        ctx.globalAlpha = alpha;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(0, baseY + yOff);
        for (let x = 0; x <= STORY_W; x += 20) {
            const y = baseY + yOff + Math.sin((x / STORY_W) * Math.PI * 2 * freq) * amp;
            ctx.lineTo(x, y);
        }
        ctx.lineTo(STORY_W, STORY_H);
        ctx.lineTo(0, STORY_H);
        ctx.closePath();
        ctx.fill();
    });
    ctx.globalAlpha = 1;
}
async function ensureStoryFontsLoaded() {
    try {
        await Promise.all([
            document.fonts.load("700 260px Oswald"),
            document.fonts.load("600 46px Oswald"),
            document.fonts.load("600 96px Oswald"),
            document.fonts.load("500 30px 'IBM Plex Mono'"),
            document.fonts.load("600 44px 'IBM Plex Mono'"),
            document.fonts.load("italic 400 38px Inter"),
            document.fonts.load("400 40px Inter"),
        ]);
        await document.fonts.ready;
    }
    catch (e) {
        // best effort — canvas falls back to the system font if this fails
    }
}
function wrapText(ctx, text, maxWidth) {
    const words = text.split(/\s+/);
    const lines = [];
    let line = "";
    words.forEach((word) => {
        const test = line ? `${line} ${word}` : word;
        if (ctx.measureText(test).width > maxWidth && line) {
            lines.push(line);
            line = word;
        }
        else {
            line = test;
        }
    });
    if (line)
        lines.push(line);
    return lines;
}
async function buildStoryCanvas(session) {
    await ensureStoryFontsLoaded();
    const canvas = document.createElement("canvas");
    canvas.width = STORY_W;
    canvas.height = STORY_H;
    const ctx = canvas.getContext("2d");
    ctx.textBaseline = "alphabetic";
    // Background
    const bg = ctx.createLinearGradient(0, 0, 0, STORY_H);
    bg.addColorStop(0, "#0B1F2E");
    bg.addColorStop(1, "#0E2634");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, STORY_W, STORY_H);
    const marginX = 90;
    // Brand mark + date/location
    ctx.fillStyle = "#7FA9AA";
    ctx.font = "500 30px 'IBM Plex Mono'";
    ctx.fillText("SWIMCOACH · CUADERNO DE ANTON", marginX, 150);
    const isDry = session.type === "seco";
    const locationLabel = isDry ? "sesión en seco" : (session.location === "abiertas" ? "aguas abiertas" : "piscina");
    ctx.fillStyle = "#9FB8C4";
    ctx.font = "400 40px Inter";
    ctx.fillText(`${fmtDate(session.date)} · ${locationLabel}`, marginX, 220);
    let afterY;
    if (isDry) {
        // Dry-land session: no distance/pace numbers, just the title/notes.
        ctx.fillStyle = "#FF6B35";
        ctx.font = "600 96px Oswald";
        const title = (session.notes || "Sesión en seco").toUpperCase();
        const lines = wrapText(ctx, title, STORY_W - marginX * 2).slice(0, 4);
        lines.forEach((line, i) => ctx.fillText(line, marginX, 420 + i * 110));
        afterY = 420 + lines.length * 110 + 40;
    }
    else {
        // Big headline number: distance. Font size steps down for longer
        // digit strings so it never overflows the canvas width.
        const distStr = (session.distance || 0).toLocaleString("es-ES");
        const distPx = distStr.length > 5 ? 160 : distStr.length > 4 ? 200 : 260;
        ctx.fillStyle = "#FF6B35";
        ctx.font = `700 ${distPx}px Oswald`;
        ctx.fillText(distStr, marginX, 620);
        ctx.fillStyle = "#7FA9AA";
        ctx.font = "500 44px 'IBM Plex Mono'";
        ctx.fillText("METROS", marginX, 680);
        // Stat cards row: ritmo / FC / zona (only the ones this session has)
        const stats = [];
        if (session.pace)
            stats.push({ label: "RITMO", value: `${session.pace}/100m` });
        if (session.hr)
            stats.push({ label: "FC MEDIA", value: `${session.hr} bpm` });
        if (session.notation)
            stats.push({ label: "ZONA", value: session.notation.split(/[\/,]/)[0].trim() });
        const cardY = 760, cardH = 190, gap = 24;
        if (stats.length > 0) {
            const cardW = (STORY_W - marginX * 2 - gap * (stats.length - 1)) / stats.length;
            stats.forEach((stat, i) => {
                const x = marginX + i * (cardW + gap);
                ctx.fillStyle = "#142F42";
                roundRectPath(ctx, x, cardY, cardW, cardH, 24);
                ctx.fill();
                ctx.fillStyle = "#5A7A87";
                ctx.font = "500 24px 'IBM Plex Mono'";
                ctx.fillText(stat.label, x + 28, cardY + 56);
                ctx.fillStyle = "#EAF2F2";
                ctx.font = "600 46px Oswald";
                wrapText(ctx, stat.value, cardW - 56).slice(0, 2).forEach((line, li) => ctx.fillText(line, x + 28, cardY + 110 + li * 52));
            });
        }
        afterY = cardY + cardH + 100;
    }
    // Waves + season footer — fixed position regardless of how much content
    // is above, so the bottom of the card always looks the same.
    const waveBaseY = STORY_H - 420;
    drawStoryWaves(ctx, waveBaseY);
    ctx.fillStyle = "#EAF2F2";
    ctx.font = "600 44px 'IBM Plex Mono'";
    ctx.fillText("PRETEMPORADA 2026–27", marginX, STORY_H - 120);
    ctx.fillStyle = "#7FA9AA";
    ctx.font = "400 32px Inter";
    ctx.fillText("Cuaderno de entrenamiento — Anton", marginX, STORY_H - 70);
    return canvas;
}
// Builds the story image and either opens the native share sheet (mobile,
// where Instagram shows up as a share target directly) or falls back to
// downloading the PNG so it can be shared manually.
async function shareSessionStory(session) {
    const canvas = await buildStoryCanvas(session);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png", 0.95));
    if (!blob)
        throw new Error("No se pudo generar la imagen.");
    const fileName = `swimcoach-${session.date}.png`;
    const file = new File([blob], fileName, { type: "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: "SwimCoach", text: "Mi entrenamiento" });
        return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
}
// ---- Single session row (used by the year/month accordion) ----------------
function SessionCard({ s, sessions, paceTargets, onDelete }) {
    const zone = hrZone(s.hr);
    const paceSec = paceToSeconds(s.pace);
    const isMultiZone = s.notation && s.notation.includes(",");
    const primaryNotation = s.notation && !isMultiZone ? s.notation.split(/[\/,]/)[0].trim() : null;
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
    const badge = isPlanned && React.createElement("span", { className: "font-mono text-[9px] uppercase tracking-wide bg-[#E8C547]/15 text-[#E8C547] rounded-full px-2 py-0.5 shrink-0" }, "propuesta");
    const typeIcon = React.createElement("span", { className: "shrink-0", title: isDry ? "Sesión en seco" : "Sesión en agua" }, isDry ? React.createElement(Icon.Anchor, { size: 14, className: "text-[#5A7A87] opacity-50" }) : React.createElement(Icon.Waves, { size: 14, className: "text-[#4A8B8C]" }));
    const clubEl = s.clubLabel && React.createElement("span", { className: `font-mono text-[9px] uppercase tracking-wide rounded-full px-2 py-0.5 shrink-0 ${s.clubFixed ? "bg-[#E8C547]/15 text-[#E8C547]" : "bg-[#4A8B8C]/15 text-[#7FA9AA]"}` }, s.clubLabel, s.clubFixed ? " · fijo" : "");
    const poolEl = !isDry && s.pool && React.createElement("span", { className: "font-mono text-[9px] uppercase tracking-wide rounded-full px-2 py-0.5 shrink-0 bg-[#1E3D4F] text-[#9FB8C4]" }, s.pool, "m");
    const durationEl = isDry && Number(s.durationMin) > 0 && React.createElement("span", { className: "font-mono text-[#9FB8C4] shrink-0 flex items-center gap-1" }, React.createElement(Icon.Timer, { size: 12 }), Math.round(s.durationMin), " min");
    const locationEl = !isDry && s.location && React.createElement("span", { className: `font-mono text-[9px] uppercase tracking-wide rounded-full px-2 py-0.5 shrink-0 ${s.location === "abiertas" ? "bg-[#4A8B8C]/15 text-[#7FA9AA]" : "bg-[#1E3D4F] text-[#5A7A87]"}` }, s.location === "abiertas" ? "aguas abiertas" : "piscina");
    const dateEl = React.createElement("span", { className: "font-mono text-[#7FA9AA] w-16 shrink-0" }, fmtDate(s.date));
    const distEl = React.createElement("span", { className: "font-mono font-medium w-20 shrink-0" }, isDry ? "—" : `${s.distance}m`);
    const paceEl = s.pace && React.createElement("span", { className: "font-mono text-[#9FB8C4] w-24 shrink-0 flex items-center gap-1" }, React.createElement(Icon.Timer, { size: 12 }), s.pace, "/100");
    const sparkEl = sparkValues.length >= 2 && React.createElement(Sparkline, { values: sparkValues });
    const hrEl = s.hr && React.createElement("span", { className: "font-mono text-[#9FB8C4] shrink-0 flex items-center gap-1" }, React.createElement("span", { className: "w-2 h-2 rounded-full shrink-0", style: { background: zone?.color || "#5A7A87" } }), s.hr, " bpm", zone && React.createElement("span", { className: "text-[9px] text-[#5A7A87] ml-0.5" }, `·${zone.key}`));
    const notationEl = s.notation && React.createElement("span", { className: "font-mono text-xs bg-[#142F42] rounded-full px-2 py-0.5 text-[#FF6B35] shrink-0" }, s.notation);
    const deviationEl = deviation && React.createElement("span", { className: `font-mono text-[10px] rounded-full px-2 py-0.5 shrink-0 ${deviation === "rápido" ? "bg-[#FF6B35]/15 text-[#FF6B35]" : "bg-[#4A8B8C]/15 text-[#7FA9AA]"}` }, "⚠ ", deviation, ` (obj. ${target[0]}-${target[1]}s)`);
    const notesEl = s.notes && React.createElement("span", { className: "text-[#9FB8C4] truncate" }, s.notes);
    const sufferEl = typeof s.sufferScore === "number" && React.createElement("span", { title: "Esfuerzo relativo (Strava)", className: "font-mono text-[10px] flex items-center gap-1 bg-[#FF6B35]/10 text-[#FF6B35] rounded-full px-2 py-0.5 shrink-0" }, React.createElement(Icon.Zap, { size: 10 }), s.sufferScore);
    const deleteBtn = isPlanned && onDelete && React.createElement("button", { onClick: () => onDelete(s.id), title: "Borrar propuesta", className: "tap-target ml-auto shrink-0 text-[#5A7A87] hover:text-[#E8453C] transition-colors" }, React.createElement(Icon.X, { size: 14 }));
    // Generates a 1080x1920 Instagram Story image for this completed session
    // (see buildStoryCanvas / shareSessionStory above) and opens the native
    // share sheet on mobile, or downloads the PNG as a fallback. Only shown
    // for real (non-planned) sessions — a proposal isn't a workout yet.
    const [sharing, setSharing] = useState(false);
    const handleShare = async () => {
        if (sharing)
            return;
        setSharing(true);
        try {
            await shareSessionStory(s);
        }
        catch (e) {
            if (e && e.name !== "AbortError") {
                window.alert("No se pudo generar la imagen. Inténtalo de nuevo.");
            }
        }
        finally {
            setSharing(false);
        }
    };
    const shareBtn = !isPlanned && React.createElement("button", { onClick: handleShare, disabled: sharing, title: "Compartir como historia de Instagram", className: "tap-target ml-auto shrink-0 text-[#5A7A87] hover:text-[#FF6B35] disabled:opacity-50 transition-colors" }, sharing ? React.createElement(Icon.Loader2, { size: 14, className: "animate-spin" }) : React.createElement(Icon.Share, { size: 14 }));
    // Full lap-by-lap breakdown (every individual rep, in order, with the
    // rest before it), built server-side from Strava's real lap data — see
    // lib/strava.js lapsToDetail. Only present for pool swims recorded on a
    // device that does automatic length/turn detection (Garmin etc.); open
    // water and manual entries just won't have `detail`.
    const hasDetail = Array.isArray(s.detail) && s.detail.length > 0;
    const [detailOpen, setDetailOpen] = useState(false);
    const detailToggle = hasDetail && React.createElement("button", {
        onClick: () => setDetailOpen((v) => !v),
        title: "Ver todos los parciales, metros, ritmo y descansos",
        className: "tap-target shrink-0 flex items-center gap-1 font-mono text-[10px] text-[#4A8B8C] hover:text-[#7FA9AA] transition-colors",
    },
        React.createElement("span", { className: "inline-block transition-transform", style: { transform: detailOpen ? "rotate(90deg)" : "rotate(0deg)" } }, "▸"),
        `${s.detail.length} parcial${s.detail.length === 1 ? "" : "es"}`);
    const mainRow = React.createElement("div", { className: "flex items-center gap-4 text-sm flex-wrap" }, badge, typeIcon, dateEl, distEl, durationEl, locationEl, poolEl, clubEl, paceEl, sparkEl, hrEl, sufferEl, notationEl, deviationEl, notesEl, detailToggle, deleteBtn, shareBtn);
    const detailPanel = hasDetail && detailOpen && React.createElement("div", { className: "mt-2 pt-2 border-t border-[#1E3D4F]" },
        React.createElement("div", { className: "space-y-1 max-h-64 overflow-y-auto pr-1" }, s.detail.map((lap, i) => React.createElement("div", { key: i, className: "flex items-center gap-3 font-mono text-[11px] text-[#9FB8C4]" },
            React.createElement("span", { className: "text-[#5A7A87] w-6 shrink-0 text-right" }, i + 1),
            React.createElement("span", { className: "text-[#FF6B35] w-16 shrink-0" }, `${lap.distance}m`),
            React.createElement("span", { className: "flex items-center gap-1 w-20 shrink-0" }, React.createElement(Icon.Timer, { size: 11 }), lap.pace, "/100"),
            lap.restBeforeSec > 0 && React.createElement("span", { className: "text-[#5A7A87] w-24 shrink-0" }, `desc. ${lap.restBeforeSec}s`),
            lap.avgHr && React.createElement("span", { className: "text-[#5A7A87]" }, `${lap.avgHr} bpm`)))));
    return React.createElement("div", { className: `rounded-xl px-4 py-3 border-l-2 ${isPlanned ? "bg-[#0E2634]/40 border-l-[#E8C547]" : isDry ? "bg-[#0E2634]/60 border-[#1E3D4F] border-l-[#5A7A87] shadow-[0_4px_16px_-6px_rgba(0,0,0,0.35)]" : "bg-[#0E2634] border-[#1E3D4F] border-l-[#4A8B8C] shadow-[0_4px_16px_-6px_rgba(0,0,0,0.35)]"}`, style: { borderTopColor: "#1E3D4F", borderRightColor: "#1E3D4F", borderBottomColor: "#1E3D4F", borderTopWidth: 1, borderRightWidth: 1, borderBottomWidth: 1, borderStyle: isPlanned ? "dashed" : "solid" } }, mainRow, detailPanel);
}
// ---- Collapsible session log, grouped by year then month ------------------
function SessionAccordion({ sessions, paceTargets, onDelete }) {
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
        return React.createElement("div", { className: "text-sm text-[#5A7A87] font-mono py-6 text-center border border-dashed border-[#1E3D4F] rounded-2xl" }, "Todavía no hay sesiones — añade la primera.");
    }
    return React.createElement("div", { className: "space-y-3" }, years.map((y) => {
        const yearOpen = openYears.has(y.year);
        return React.createElement("div", { key: y.year, className: "rounded-xl border border-[#1E3D4F] overflow-hidden" },
            React.createElement("button", { onClick: () => toggleYear(y.year), className: "tap-target w-full flex items-center justify-between bg-[#142F42] hover:bg-[#1B3B52] px-4 py-3 font-display uppercase text-base tracking-wide transition-colors" },
                React.createElement("span", { className: "flex items-center gap-2.5" },
                    React.createElement("span", { className: "inline-block text-[#FF6B35] transition-transform", style: { transform: yearOpen ? "rotate(90deg)" : "rotate(0deg)" } }, "▸"),
                    y.year),
                React.createElement("span", { className: "font-mono text-[11px] text-[#7FA9AA] normal-case tracking-normal" }, (y.meters / 1000).toFixed(1), "km · ", y.months.reduce((n, mo) => n + mo.items.length, 0), " sesiones")),
            yearOpen && React.createElement("div", { className: "bg-[#0B1F2E] p-3 space-y-2" }, y.months.map((mo) => {
                const key = `${y.year}-${mo.month}`;
                const monthOpen = openMonths.has(key);
                return React.createElement("div", { key: key, className: "rounded-lg border border-[#1E3D4F] overflow-hidden ml-2 sm:ml-4" },
                    React.createElement("button", { onClick: () => toggleMonth(key), className: "tap-target w-full flex items-center justify-between bg-[#0E2634] hover:bg-[#142F42] px-3 py-2.5 text-sm capitalize transition-colors" },
                        React.createElement("span", { className: "flex items-center gap-2" },
                            React.createElement("span", { className: "inline-block text-[#4A8B8C] text-xs transition-transform", style: { transform: monthOpen ? "rotate(90deg)" : "rotate(0deg)" } }, "▸"),
                            mo.label),
                        React.createElement("span", { className: "font-mono text-[10px] text-[#5A7A87]" }, (mo.meters / 1000).toFixed(1), "km · ", mo.items.length, " sesiones")),
                    monthOpen && React.createElement("div", { className: "p-2.5 space-y-2 bg-[#0B1F2E]" }, mo.items.map((s) => React.createElement(SessionCard, { key: s.id, s: s, sessions: sessions, paceTargets: paceTargets, onDelete: onDelete }))));
            })));
    }));
}

// ---- Critical velocity test (velocidad crítica) ------------------------
// Regresión lineal distancia = CV · tiempo + D' sobre 2–4 pruebas máximas
// (p. ej. 400 + 200, o 800/400/200/100). Con 3–4 distancias predice mejor que
// un CSS de 2 puntos. El ritmo CV pasa a ser el ancla de todas las zonas y de
// la carga de entrenamiento en Forma.
// Desplazamientos (s/100m) de cada zona respecto al ritmo CV — calibrados
// para que con CV ≈ 1:36 salgan AeL2 ~1:42–1:44, AeL3 ~1:40, AeM ~1:37,
// AnL ~1:35, Vo2Max ~1:32.
const CV_ZONE_OFFSETS = {
    AeL1: [9, 15],
    AeL2: [5, 9],
    AeL3: [2, 5],
    AeM: [-1, 2],
    AnL: [-4, -1],
    Vo2Max: [-12, -4],
};
function parseDurationInput(str) {
    if (!str)
        return null;
    const parts = String(str).trim().split(":").map(Number);
    if (parts.some((n) => Number.isNaN(n)))
        return null;
    if (parts.length === 1)
        return parts[0] > 0 ? parts[0] : null;
    if (parts.length === 2)
        return parts[0] * 60 + parts[1];
    if (parts.length === 3)
        return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return null;
}
function computeCriticalVelocity(rows) {
    const pts = rows
        .map((r) => ({ d: Number(r.distance), t: parseDurationInput(r.time) }))
        .filter((p) => p.d > 0 && p.t > 0);
    if (pts.length < 2)
        return null;
    const n = pts.length;
    const mt = pts.reduce((a, p) => a + p.t, 0) / n;
    const md = pts.reduce((a, p) => a + p.d, 0) / n;
    const sxx = pts.reduce((a, p) => a + (p.t - mt) ** 2, 0);
    if (sxx <= 0)
        return null;
    const sxy = pts.reduce((a, p) => a + (p.t - mt) * (p.d - md), 0);
    const cv = sxy / sxx; // m/s
    const dPrime = md - cv * mt; // m
    if (!(cv > 0.5 && cv < 2.5))
        return null;
    let r2 = null;
    if (n > 2) {
        const ssTot = pts.reduce((a, p) => a + (p.d - md) ** 2, 0);
        const ssRes = pts.reduce((a, p) => a + (p.d - (cv * p.t + dPrime)) ** 2, 0);
        r2 = ssTot > 0 ? 1 - ssRes / ssTot : null;
    }
    return { cvPace: 100 / cv, dPrime, r2, points: n };
}
function zonesFromCV(cvPace) {
    const z = {};
    Object.entries(CV_ZONE_OFFSETS).forEach(([k, [a, b]]) => {
        z[k] = [Math.round(cvPace + a), Math.round(cvPace + b)];
    });
    return z;
}
function getStoredCVTest() {
    try {
        const raw = localStorage.getItem("swimcoach_cv_test");
        const t = raw ? JSON.parse(raw) : null;
        return t && t.cvPace > 40 && t.cvPace < 240 ? t : null;
    }
    catch (e) {
        return null;
    }
}
function CriticalVelocityTest({ onApply }) {
    const stored = getStoredCVTest();
    const [rows, setRows] = useState(() => stored?.rows || [{ distance: 400, time: "" }, { distance: 200, time: "" }]);
    const [date, setDate] = useState(() => stored?.date || todayStr());
    const [msg, setMsg] = useState("");
    const result = computeCriticalVelocity(rows);
    const update = (i, field, value) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [field]: value } : r)));
    const inputCls = "w-full bg-[#142F42] border border-[#1E3D4F] rounded-lg px-3 py-2.5 font-mono focus:outline-none focus:border-[#4A8B8C]";
    const apply = () => {
        if (!result)
            return;
        const test = { date, rows, cvPace: result.cvPace, dPrime: result.dPrime };
        try {
            localStorage.setItem("swimcoach_cv_test", JSON.stringify(test));
        }
        catch (e) { }
        onApply(zonesFromCV(result.cvPace), test);
        setMsg(`✓ zonas recalculadas desde CV ${secondsToPace(result.cvPace)}/100m`);
    };
    return React.createElement("div", { className: "bg-[#0E2634] border border-[#1E3D4F] rounded-xl p-4 mb-4 shadow-[0_8px_28px_-6px_rgba(0,0,0,0.45)]" },
        React.createElement("div", { className: "font-display uppercase text-xs tracking-wider text-[#9FB8C4] mb-1" }, "Test de velocidad crítica"),
        React.createElement("div", { className: "text-[11px] font-mono text-[#5A7A87] mb-3" }, "2–4 pruebas a tope (p. ej. 400 + 200). Tiempo en m:ss. Con 3–4 distancias el cálculo es más fiable."),
        React.createElement("div", { className: "space-y-2" }, rows.map((r, i) => React.createElement("div", { key: i, className: "grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2 items-end" },
            React.createElement("div", null,
                React.createElement("label", { className: "block text-[9px] font-mono uppercase text-[#5A7A87] mb-1" }, "Metros"),
                React.createElement("input", { type: "number", min: 50, step: 50, value: r.distance, onChange: (e) => update(i, "distance", e.target.value), style: { fontSize: 16 }, className: inputCls })),
            React.createElement("div", null,
                React.createElement("label", { className: "block text-[9px] font-mono uppercase text-[#5A7A87] mb-1" }, "Tiempo"),
                React.createElement("input", { type: "text", inputMode: "numeric", placeholder: "5:52", value: r.time, onChange: (e) => update(i, "time", e.target.value), style: { fontSize: 16 }, className: inputCls })),
            React.createElement("button", { onClick: () => setRows((rs) => (rs.length > 2 ? rs.filter((_, j) => j !== i) : rs)), disabled: rows.length <= 2, className: "tap-target text-[#5A7A87] hover:text-[#E8453C] disabled:opacity-30 transition-colors flex items-center justify-center" }, React.createElement(Icon.X, { size: 14 }))))),
        rows.length < 4 && React.createElement("button", { onClick: () => setRows((rs) => [...rs, { distance: 100, time: "" }]), className: "tap-target flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wide text-[#4A8B8C] hover:text-[#7FA9AA] transition-colors mt-1" }, React.createElement(Icon.Plus, { size: 12 }), "añadir distancia"),
        React.createElement("div", { className: "mt-2" },
            React.createElement("label", { className: "block text-[9px] font-mono uppercase text-[#5A7A87] mb-1" }, "Fecha del test"),
            React.createElement("input", { type: "date", value: date, onChange: (e) => setDate(e.target.value), style: { fontSize: 16 }, className: inputCls + " sm:w-56" })),
        result
            ? React.createElement("div", { className: "mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-[11px] text-[#9FB8C4]" },
                React.createElement("span", null, "CV ", React.createElement("span", { className: "text-[#FF6B35] font-display text-2xl align-middle" }, secondsToPace(result.cvPace)), "/100m"),
                React.createElement("span", null, "D′ ", Math.round(result.dPrime), "m"),
                result.r2 != null && React.createElement("span", null, "R² ", result.r2.toFixed(3)))
            : React.createElement("div", { className: "mt-3 font-mono text-[11px] text-[#5A7A87]" }, "Introduce al menos dos tiempos válidos."),
        result && React.createElement("div", { className: "mt-3 grid grid-cols-3 sm:grid-cols-6 gap-1.5" }, Object.entries(zonesFromCV(result.cvPace)).map(([k, [a, b]]) => React.createElement("div", { key: k, className: "bg-[#0B1F2E] rounded-md px-2 py-1.5 text-center" },
            React.createElement("div", { className: "font-mono text-[10px] text-[#FF6B35]" }, k),
            React.createElement("div", { className: "font-mono text-[10px] text-[#9FB8C4]" }, secondsToPace(a), "–", secondsToPace(b))))),
        React.createElement("button", { onClick: apply, disabled: !result, className: "tap-target bg-[#FF6B35] hover:bg-[#E85A28] disabled:opacity-40 text-[#0B1F2E] font-semibold rounded-lg px-4 py-2.5 text-sm transition-colors mt-3 w-full sm:w-auto" }, "Aplicar a mis zonas"),
        msg && React.createElement("div", { className: "text-[10px] font-mono text-[#7FA9AA] mt-2" }, msg),
        stored && React.createElement("div", { className: "text-[10px] font-mono text-[#5A7A87] mt-2" }, "último test aplicado: ", fmtDate(stored.date), " · CV ", secondsToPace(stored.cvPace), "/100m"));
}
// ---- Critical Swim Speed (CSS) & real training load (TSS-like) -----------
// CSS is swim's analog to cycling FTP / running threshold pace: the pace you
// could sustain indefinitely, used as the 100%-intensity reference for a
// proper training-load number instead of a raw distance count. The classic
// protocol swims two dedicated time trials (typically 400m + 100m) and takes
//   CSS = (400m - 100m) / (T400m - T100m)
// We don't have dedicated time trials, but real per-lap data (see
// lib/strava.js getLapData) gives the same shape for free: the fastest real
// lap at a short distance vs. the fastest real lap at a long distance, taken
// from actual training instead of a lab test.
// POOL_TO_OPENWATER_OFFSET_SEC is defined further below, alongside the race
// prediction code that introduced it — referenced here only inside function
// bodies (estimateCSS, sessionLoad), which run after the whole module has
// loaded, so the declaration order is not a problem.
const CSS_SHORT_RANGE = [25, 100]; // "sprint" reference rep length, meters
const CSS_LONG_RANGE = [250, 1000]; // "sustained" reference rep length, meters
function estimateCSS(sessions) {
    const laps = sessions
        .filter((s) => s.type !== "seco" && !s.planned)
        .flatMap((s) => {
            if (!Array.isArray(s.laps) || s.laps.length === 0)
                return [];
            const offset = s.location === "abiertas" ? POOL_TO_OPENWATER_OFFSET_SEC : 0;
            return s.laps.map((l) => ({ distance: l.distance, pace: l.pace - offset }));
        })
        .filter((l) => l.pace > 40 && l.pace < 240 && l.distance > 0);
    if (laps.length < 15)
        return null; // not enough real lap data yet to trust a CSS estimate
    const shortLaps = laps.filter((l) => l.distance >= CSS_SHORT_RANGE[0] && l.distance <= CSS_SHORT_RANGE[1]);
    const longLaps = laps.filter((l) => l.distance >= CSS_LONG_RANGE[0] && l.distance <= CSS_LONG_RANGE[1]);
    if (shortLaps.length < 3 || longLaps.length < 3)
        return null; // need a real spread of rep lengths, not just one kind of set
    // "Best" = fastest real pace at each rep length — the closest available
    // proxy for a maximal effort at that distance without a dedicated time trial.
    const bestShort = shortLaps.reduce((a, b) => (b.pace < a.pace ? b : a));
    const bestLong = longLaps.reduce((a, b) => (b.pace < a.pace ? b : a));
    const tShort = bestShort.pace * (bestShort.distance / 100); // total seconds
    const tLong = bestLong.pace * (bestLong.distance / 100);
    const dDelta = bestLong.distance - bestShort.distance;
    const tDelta = tLong - tShort;
    if (dDelta <= 0 || tDelta <= 0)
        return null; // bad/inconsistent data — the "long" rep wasn't actually slower overall
    const cssPace = tDelta / (dDelta / 100); // seconds/100m
    if (cssPace < 40 || cssPace > 240)
        return null; // sanity check
    return { cssPace, refShort: bestShort, refLong: bestLong };
}
// Real per-session training load, rTSS-style: intensity relative to CSS,
// squared, applied to duration — same shape as TrainingPeaks' running/cycling
// TSS, scaled so ~1 hour exactly at CSS pace ≈ 100 load points.
//   IF = ritmo CSS / ritmo real   (más rápido que CSS => IF > 1)
//   carga = duración_seg · IF² / 36
function sessionLoad(s, cssPace) {
    const distance = s.distance || 0;
    if (distance <= 0)
        return 0;
    const offset = s.location === "abiertas" ? POOL_TO_OPENWATER_OFFSET_SEC : 0;
    let avgPace = null;
    if (Array.isArray(s.laps) && s.laps.length > 0) {
        const totalSec = s.laps.reduce((sum, l) => sum + l.pace * (l.distance / 100), 0);
        const totalDist = s.laps.reduce((sum, l) => sum + l.distance, 0);
        avgPace = totalDist > 0 ? (totalSec / totalDist) * 100 : null;
    }
    else {
        avgPace = paceToSeconds(s.pace);
    }
    if (!avgPace)
        return distance / 50; // no pace data at all — fall back to the old proxy
    avgPace -= offset;
    if (avgPace <= 0)
        return distance / 50;
    const durationSec = avgPace * (distance / 100);
    const intensityFactor = cssPace / avgPace;
    return (durationSec * intensityFactor * intensityFactor) / 36;
}
// ---- Personal bests by distance ("mejores marcas") -----------------------
// Best (fastest) real effort at a handful of common distances, pulled from
// both whole-session paces (for a straight continuous swim of that exact
// distance) and individual lap distances (for reps within a structured set)
// — whichever is faster wins for a given target. Not normalized between
// pool and open water (the two aren't directly comparable, ~10s/100m apart),
// so each mark shows where it happened instead
// of pretending they're on the same scale.
const PR_DISTANCES = [50, 100, 200, 400, 800, 1000, 1500];
function computePersonalBests(sessions) {
    const candidates = [];
    sessions
        .filter((s) => s.type !== "seco" && !s.planned)
        .forEach((s) => {
        const sessionPace = paceToSeconds(s.pace);
        if (sessionPace && s.distance) {
            candidates.push({ distance: s.distance, pace: sessionPace, date: s.date, location: s.location, source: "session" });
        }
        if (Array.isArray(s.laps)) {
            s.laps.forEach((l) => {
                if (l.pace > 40 && l.pace < 240 && l.distance > 0) {
                    candidates.push({ distance: l.distance, pace: l.pace, date: s.date, location: s.location, source: "lap" });
                }
            });
        }
    });
    const bests = {};
    PR_DISTANCES.forEach((target) => {
        // A little slack for GPS/lap-detection rounding (e.g. a 400m rep
        // logged as 396m) without letting a 100m match bleed into a 200m PR.
        const tolerance = Math.max(2, target * 0.03);
        const matches = candidates.filter((c) => Math.abs(c.distance - target) <= tolerance);
        bests[target] = matches.length > 0 ? matches.reduce((a, b) => (b.pace < a.pace ? b : a)) : null;
    });
    return bests;
}
// Daily load series feeding the CTL/ATL/TSB form model below. Uses the real
// CSS-based load whenever there's enough lap data to estimate CSS; otherwise
// degrades gracefully to the old arbitrary distance/50 proxy so the form
// chart never goes empty just because Strava hasn't synced enough laps yet.
function loadAnchorPace(sessions) {
    const test = getStoredCVTest();
    if (test)
        return { cssPace: test.cvPace, source: "cv", date: test.date };
    const css = estimateCSS(sessions);
    return css ? { cssPace: css.cssPace, source: "laps" } : null;
}
// Fuerza / sesiones en seco (Baigene, los lunes): no hay metros ni ritmo,
// así que la carga se estima por duración — ~0,75 puntos por minuto, es
// decir, una hora de fuerza ≈ 45, algo menos de la mitad que una hora
// nadando a ritmo umbral (100). Orientativo, pero así la fatiga de la
// fuerza aparece en Forma en vez de ser invisible.
const STRENGTH_LOAD_PER_MIN = 0.75;
const STRENGTH_DEFAULT_MIN = 45;
function strengthLoad(s) {
    const min = Number(s.durationMin) > 0 ? Number(s.durationMin) : STRENGTH_DEFAULT_MIN;
    return min * STRENGTH_LOAD_PER_MIN;
}
function buildLoadSeries(sessions) {
    const css = loadAnchorPace(sessions);
    const byDate = {};
    sessions.forEach((s) => {
        if (s.planned)
            return; // una propuesta todavía no es carga real
        if (!byDate[s.date])
            byDate[s.date] = 0;
        if (s.type === "seco") {
            byDate[s.date] += strengthLoad(s);
            return;
        }
        byDate[s.date] += css ? sessionLoad(s, css.cssPace) : (s.distance || 0) / 50;
    });
    return byDate;
}
// ---- Race time prediction (Riegel model) -----------------------------
// Uses your best recent sustained pace (from sessions of 1500m+) as a
// reference effort, then extrapolates to the race distance with Riegel's
// endurance formula: T2 = T1 · (D2/D1)^1.06. Pool paces get a fixed
// open-water conversion offset since the two aren't directly comparable.
const POOL_TO_OPENWATER_OFFSET_SEC = 10; // seconds/100m, pool tends to run faster
function predictRaceTime(sessions, raceDistance, asOf = TODAY) {
    const cutoff = new Date(asOf);
    cutoff.setDate(cutoff.getDate() - 180);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    const candidates = sessions
        .filter((s) => s.type !== "seco" && !s.planned && s.distance >= 1500 && s.date >= cutoffStr)
        .map((s) => ({ s, sec: paceToSeconds(s.pace) }))
        .filter((x) => x.sec);
    if (candidates.length === 0)
        return null;
    const best = candidates.reduce((a, b) => (b.sec < a.sec ? b : a));
    const refPaceSec = best.s.location === "abiertas" ? best.sec : best.sec + POOL_TO_OPENWATER_OFFSET_SEC;
    const refDistance = best.s.distance;
    const refTotalSec = refPaceSec * (refDistance / 100);
    const predictedTotalSec = refTotalSec * Math.pow(raceDistance / refDistance, 1.06);
    return { totalSec: predictedTotalSec, refDistance, refDate: best.s.date, refWasPool: best.s.location !== "abiertas" };
}
function fmtDuration(totalSec) {
    const m = Math.floor(totalSec / 60);
    const s = Math.round(totalSec % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
}
function RacePrediction({ sessions, race }) {
    const pred = useMemo(() => predictRaceTime(sessions, race.distance), [sessions, race.distance]);
    if (!pred) {
        return React.createElement("div", { className: "text-sm text-[#5A7A87] font-mono" }, "Necesito alguna sesión de 1500m+ en los últimos 6 meses para estimarlo.");
    }
    return React.createElement("div", { className: "flex flex-wrap items-center gap-4" },
        React.createElement("div", null,
            React.createElement("div", { className: "font-mono text-[10px] uppercase tracking-wider text-[#7FA9AA]" }, "Tiempo estimado"),
            React.createElement("div", { className: "font-display text-5xl text-[#FF6B35]" }, fmtDuration(pred.totalSec))),
        React.createElement("div", { className: "text-[11px] text-[#5A7A87] font-mono max-w-xs" },
            "basado en tu mejor ritmo reciente (", fmtDate(pred.refDate), ", ", pred.refDistance, "m", pred.refWasPool ? ", piscina +conversión" : "", ") · modelo Riegel, orientativo"));
}

// ---- Race prediction trend (how the estimate has moved over ~26 weeks) ----
// Re-runs predictRaceTime as of each weekly checkpoint in the past, using
// only the sessions that existed by that date. Shows whether the estimate
// is actually improving or just holding steady in place.
function computePredictionTrend(sessions, raceDistance, weeks = 26) {
    const points = [];
    const endStr = getWeekStart(TODAY.toISOString().slice(0, 10));
    for (let w = weeks - 1; w >= 0; w--) {
        const checkpoint = new Date(endStr + "T00:00:00");
        checkpoint.setDate(checkpoint.getDate() - w * 7);
        const checkpointStr = checkpoint.toISOString().slice(0, 10);
        const known = sessions.filter((s) => s.date <= checkpointStr);
        const pred = predictRaceTime(known, raceDistance, checkpoint);
        if (pred)
            points.push({ date: checkpointStr, totalSec: pred.totalSec });
    }
    return points;
}
function PredictionTrend({ sessions, race }) {
    const points = useMemo(() => computePredictionTrend(sessions, race.distance), [sessions, race.distance]);
    if (points.length < 3) {
        return null; // not enough weekly history yet to draw a meaningful trend
    }
    const W = 100, H = 32, pad = 3;
    const secs = points.map((p) => p.totalSec);
    const fastest = Math.min(...secs);
    const slowest = Math.max(...secs);
    const range = slowest - fastest || 1;
    const xFor = (i) => pad + (i / (points.length - 1 || 1)) * (W - pad * 2);
    // faster (lower seconds) -> higher on the chart
    const yFor = (sec) => pad + ((sec - fastest) / range) * (H - pad * 2);
    const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"}${xFor(i).toFixed(1)},${yFor(p.totalSec).toFixed(1)}`).join(" ");
    const first = points[0].totalSec;
    const last = points[points.length - 1].totalSec;
    const deltaSec = first - last; // positive = getting faster over the window
    const improving = deltaSec > 0;
    return (React.createElement("div", { className: "mt-3 pt-3 border-t border-[#1E3D4F]" },
        React.createElement("div", { className: "flex items-center justify-between mb-1" },
            React.createElement("span", { className: "font-mono text-[10px] uppercase tracking-wider text-[#7FA9AA]" }, "Evolución (26 semanas)"),
            React.createElement("span", { className: `font-mono text-[10px] ${improving ? "text-[#4A8B8C]" : "text-[#FF6B35]"}` },
                improving ? "▼ " : "▲ ",
                fmtDuration(Math.abs(deltaSec)))),
        React.createElement("svg", { viewBox: `0 0 ${W} ${H}`, className: "w-full h-8", preserveAspectRatio: "none" },
            React.createElement("path", { d: pathD, fill: "none", stroke: improving ? "#4A8B8C" : "#FF6B35", strokeWidth: "1.3", vectorEffect: "non-scaling-stroke" })),
        React.createElement("div", { className: "flex justify-between text-[9px] font-mono text-[#7FA9AA] mt-1" },
            React.createElement("span", null, fmtDate(points[0].date)),
            React.createElement("span", null, fmtDate(points[points.length - 1].date)))));
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
    const cssBasis = useMemo(() => loadAnchorPace(sessions), [sessions]);
    const strengthCount = useMemo(() => sessions.filter((s) => s.type === "seco" && !s.planned && s.date >= rollingSince()).length, [sessions]);
    if (!series || series.length === 0) {
        return React.createElement("div", { className: "text-sm text-[#5A7A87] font-mono" }, "Sin datos suficientes todavía.");
    }
    const last = series[series.length - 1];
    const onBreak = isPlannedBreak(last.date);
    const breakBlock = SEASON_BLOCKS.find((b) => b.break);
    const form = onBreak
        ? { label: "Parón planificado", color: "#7FA9AA", note: "la forma baja durante el parón — es lo esperado, no una señal de alarma" }
        : formLabel(last.tsb);
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
    // Franja sombreada para los días del parón planificado dentro de la ventana
    const breakIdx = recent.map((p, i) => (isPlannedBreak(p.date) ? i : -1)).filter((i) => i >= 0);
    const breakRect = breakIdx.length > 0 && React.createElement("rect", {
        x: xFor(breakIdx[0]), y: 0, width: Math.max(0.5, xFor(breakIdx[breakIdx.length - 1]) - xFor(breakIdx[0])), height: H,
        fill: "#5A7A87", opacity: 0.18,
    });
    return (React.createElement("div", { className: "w-full" },
        React.createElement("div", { className: "flex flex-wrap items-center gap-4 mb-4" },
            React.createElement("div", { className: "font-display text-5xl", style: { color: form.color } },
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
            breakRect,
            React.createElement("line", { x1: 0, x2: W, y1: zeroY, y2: zeroY, stroke: "#1E3D4F", strokeWidth: "1", vectorEffect: "non-scaling-stroke" }),
            React.createElement("path", { d: lineD, fill: "none", stroke: "#4A8B8C", strokeWidth: "1.3", vectorEffect: "non-scaling-stroke" })),
        React.createElement("div", { className: "text-[10px] font-mono text-[#7FA9AA] mt-1" }, "tendencia últimas 6 semanas · línea por encima = mejor forma", breakIdx.length > 0 ? " · franja gris = parón planificado" : ""),
        React.createElement("div", { className: "text-[9px] font-mono text-[#5A7A87] mt-2" }, cssBasis
            ? (cssBasis.source === "cv"
                ? `carga de natación calculada sobre tu velocidad crítica (${secondsToPace(cssBasis.cssPace)}/100m, test del ${fmtDate(cssBasis.date)})`
                : "carga de natación calculada a partir de tu CSS estimado (ver apartado Natación)")
            : "carga estimada por distancia — haz el test de velocidad crítica en Natación para afinarla", " · fuerza: estimada por duración", strengthCount > 0 ? ` (${strengthCount} sesiones en 12 meses)` : " — aparecerá en cuanto Strava sincronice alguna"),
        breakBlock && !onBreak && todayStr() < breakBlock.from && React.createElement("div", { className: "text-[9px] font-mono text-[#5A7A87] mt-1" }, "parón planificado del ", fmtDate(breakBlock.from), " al ", fmtDate(breakBlock.to), " — la bajada de forma esas semanas está prevista")));
}
// ---- Training heatmap (GitHub-style, last 26 weeks) ------------------
function MonthlyMetersLineChart({ sessions }) {
    const monthly = useMemo(() => {
        const groups = {};
        sessions.forEach((s) => {
            if (s.type === "seco")
                return;
            if (s.date < "2024-01-01")
                return;
            const ym = s.date.slice(0, 7);
            groups[ym] = (groups[ym] || 0) + (s.distance || 0);
        });
        const result = [];
        const cursor = new Date(2024, 0, 1);
        const end = new Date(TODAY.getFullYear(), TODAY.getMonth(), 1);
        while (cursor <= end) {
            const ym = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
            result.push({
                ym,
                meters: groups[ym] || 0,
                label: cursor.toLocaleDateString("es-ES", { month: "short", year: "2-digit" }),
                isJan: cursor.getMonth() === 0,
            });
            cursor.setMonth(cursor.getMonth() + 1);
        }
        return result;
    }, [sessions]);
    const hasData = monthly.some((m) => m.meters > 0);
    if (!hasData) {
        return React.createElement("div", { className: "text-sm text-[#5A7A87] font-mono" }, "Sin datos de volumen todavía.");
    }
    const max = Math.max(...monthly.map((m) => m.meters), 1);
    const currentYm = `${TODAY.getFullYear()}-${String(TODAY.getMonth() + 1).padStart(2, "0")}`;
    const W = 100, H = 100, padX = 2, padTop = 8, padBottom = 20;
    const xFor = (i) => monthly.length === 1 ? W / 2 : padX + (i / (monthly.length - 1)) * (W - padX * 2);
    const yFor = (m) => padTop + (1 - m / max) * (H - padTop - padBottom);
    const points = monthly.map((m, i) => ({ xPct: xFor(i), yPct: yFor(m.meters), m }));
    const lineD = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.xPct.toFixed(1)},${p.yPct.toFixed(1)}`).join(" ");
    const areaD = `${lineD} L${points[points.length - 1].xPct.toFixed(1)},${H} L${points[0].xPct.toFixed(1)},${H} Z`;
    const breakBlk = SEASON_BLOCKS.find((b) => b.break);
    const breakMonths = breakBlk ? monthly.map((m, i) => (m.ym >= breakBlk.from.slice(0, 7) && m.ym <= breakBlk.to.slice(0, 7) ? i : -1)).filter((i) => i >= 0) : [];
    const breakBand = breakMonths.length > 0 && React.createElement("div", {
        key: "break-band",
        title: `Parón planificado · ${fmtRange(breakBlk.from, breakBlk.to)}`,
        className: "absolute top-0 bottom-0 rounded-sm",
        style: {
            left: `${xFor(breakMonths[0]) - (breakMonths.length === 1 ? 1.5 : 0)}%`,
            width: `${Math.max(3, xFor(breakMonths[breakMonths.length - 1]) - xFor(breakMonths[0]))}%`,
            background: "repeating-linear-gradient(135deg, #5A7A8733 0 4px, transparent 4px 8px)",
        },
    });
    const yearDividers = monthly.map((m, i) => m.isJan && i > 0
        ? React.createElement("div", { key: `yr-${m.ym}`, className: "absolute top-0 bottom-0 border-l border-dashed border-[#1E3D4F]", style: { left: `${xFor(i)}%` } })
        : null);
    return (React.createElement("div", { className: "w-full" },
        React.createElement("div", { className: "relative w-full h-40" },
            breakBand,
            yearDividers,
            React.createElement("svg", { viewBox: `0 0 ${W} ${H}`, className: "absolute inset-0 w-full h-full", preserveAspectRatio: "none" },
                React.createElement("defs", null,
                    React.createElement("linearGradient", { id: "metersAreaFill", x1: "0", y1: "0", x2: "0", y2: "1" },
                        React.createElement("stop", { offset: "0%", stopColor: "#4A8B8C", stopOpacity: "0.3" }),
                        React.createElement("stop", { offset: "100%", stopColor: "#4A8B8C", stopOpacity: "0" }))),
                React.createElement("path", { d: areaD, fill: "url(#metersAreaFill)", stroke: "none" }),
                React.createElement("path", { d: lineD, fill: "none", stroke: "#4A8B8C", strokeWidth: "1.2", strokeLinecap: "round", strokeLinejoin: "round", vectorEffect: "non-scaling-stroke" })),
            points.map((p) => {
                const isCurrent = p.m.ym === currentYm;
                return React.createElement("div", {
                    key: p.m.ym,
                    className: "absolute -translate-x-1/2 -translate-y-1/2",
                    style: { left: `${p.xPct}%`, top: `${p.yPct}%` },
                    title: `${p.m.label}: ${p.m.meters.toLocaleString("es-ES")}m${isCurrent ? " (mes en curso)" : ""}`,
                }, React.createElement("span", {
                    className: "block rounded-full border-2 border-[#0B1F2E]",
                    style: {
                        width: isCurrent ? "9px" : "6px",
                        height: isCurrent ? "9px" : "6px",
                        background: isCurrent ? "#FF6B35" : "#4A8B8C",
                    },
                }));
            })),
        React.createElement("div", { className: "flex mt-2" }, monthly.map((m) => React.createElement("div", { key: m.ym, className: "flex-1 text-center text-[9px] font-mono text-[#7FA9AA] uppercase" }, (m.isJan || m.ym === currentYm) ? m.label : ""))),
        React.createElement("div", { className: "flex items-center justify-between mt-2 text-[9px] font-mono text-[#5A7A87]" },
            React.createElement("span", null, "metros totales por mes, desde enero 2024", breakMonths.length > 0 ? " · rayado = parón planificado" : ""),
            React.createElement("span", null, "punto naranja = mes en curso (parcial)"))));
}
// ---- Main app ---------------------------------------------------------
function SwimCoach() {
    const [sessions, setSessions] = useState([]);
    const [loaded, setLoaded] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({ type: "agua", date: todayStr(), description: "", clubDay: "", pool: null, blocks: [{ id: uid(), series: 1, meters: 100, ritmo: "AeM", material: "ninguno" }] });
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
    const [showBackToTop, setShowBackToTop] = useState(false);
    useEffect(() => {
        const onScroll = () => setShowBackToTop(window.scrollY > 500);
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => window.removeEventListener("scroll", onScroll);
    }, []);
    // ---- TODAY ticker — reassigns the module-level TODAY to the real
    // current time and forces a re-render, so the countdown, race-week plan
    // and every chart that reads TODAY roll forward on their own if the app
    // is left open across midnight, instead of staying stuck at whatever
    // moment the page first loaded. Checks every minute; cheap, and catches
    // the day change promptly without needing a manual reload. -----------
    const [, tick] = useState(0);
    useEffect(() => {
        const id = setInterval(() => {
            TODAY = new Date();
            tick((t) => t + 1);
        }, 60000);
        return () => clearInterval(id);
    }, []);
    // ---- Scroll-spy for the section nav — highlights whichever section is
    // currently in view instead of a static list of links. ----------------
    const [activeSection, setActiveSection] = useState("temporada");
    useEffect(() => {
        const ids = ["temporada", "prediccion", "calendario", "registro", "natacion"];
        const els = ids.map((id) => document.getElementById(id)).filter(Boolean);
        if (els.length === 0)
            return;
        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting)
                    setActiveSection(entry.target.id);
            });
        }, { rootMargin: "-35% 0px -55% 0px" });
        els.forEach((el) => observer.observe(el));
        return () => observer.disconnect();
    }, [loaded]);
    const loadSessions = async () => {
        try {
            const res = await fetch("/api/sessions", { headers: authHeaders() });
            const data = await res.json();
            let list = Array.isArray(data) ? data : [];
            // Reconcile: if a "planned" proposal's date now has a real (non-planned)
            // session of the same type (agua / seco) from Strava, the plan has been
            // fulfilled — drop the placeholder.
            const fulfilled = list.filter((s) => s.planned && list.some((r) => !r.planned && r.type === (s.type || "agua") && r.date === s.date));
            if (fulfilled.length > 0) {
                list = list.filter((s) => !fulfilled.includes(s));
                fulfilled.forEach((s) => {
                    fetch("/api/sessions", { method: "DELETE", headers: authHeaders(), body: JSON.stringify({ id: s.id }) }).catch(() => { });
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
        // Auto-sync with Strava right after opening, so the race prediction
        // and everything else derived from sessions reflects your latest
        // swim without having to tap "sincronizar" first. Fire-and-forget:
        // loadSessions() above already shows whatever's already stored
        // immediately, this just tops it up a moment later in the
        // background. It's the exact same incremental sync as the button —
        // if there's nothing new since the last sync (or since the webhook
        // last fired), it finishes in about a second and changes nothing.
        runSync();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    const runSync = async () => {
        setSyncing(true);
        setSyncMsg("");
        try {
            const res = await fetch("/api/strava/sync", { headers: authHeaders() });
            const data = await res.json();
            if (data.ok) {
                setSyncMsg(`✓ ${data.swims_found} nados${data.strength_found ? ` + ${data.strength_found} fuerza` : ""}, ${data.total_stored} en total`);
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
    const emptyBlock = () => ({ id: uid(), series: 1, meters: 100, ritmo: "AeM", material: "ninguno", comment: "" });
    const addBlock = () => setForm((f) => ({ ...f, blocks: [...f.blocks, emptyBlock()] }));
    const removeBlock = (id) => setForm((f) => ({ ...f, blocks: f.blocks.length > 1 ? f.blocks.filter((b) => b.id !== id) : f.blocks }));
    const updateBlock = (id, field, value) => setForm((f) => ({ ...f, blocks: f.blocks.map((b) => (b.id === id ? { ...b, [field]: value } : b)) }));
    const blockMeters = (b) => (Number(b.series) || 0) * (Number(b.meters) || 0);
    const totalMeters = form.type === "agua" ? form.blocks.reduce((sum, b) => sum + blockMeters(b), 0) : 0;
    const addSession = async () => {
        if (form.type === "agua" && totalMeters <= 0)
            return;
        // distance-weighted average pace across all blocks, for the summary pace column
        let weightedSec = 0;
        form.blocks.forEach((b) => {
            const range = paceTargets[b.ritmo] || DEFAULT_PACE_TARGETS[b.ritmo] || STRUCTURAL_PACE_ESTIMATE[b.ritmo];
            if (range)
                weightedSec += ((range[0] + range[1]) / 2) * blockMeters(b);
        });
        const avgPaceSec = totalMeters > 0 ? weightedSec / totalMeters : 0;
        const zonesUsed = [...new Set(form.blocks.map((b) => b.ritmo))];
        const pool = form.type === "agua" ? (form.pool || poolForDate(form.date, form.clubDay)) : null;
        const clubOpt = CLUB_DAY_OPTIONS.find((o) => o.id === form.clubDay);
        const blockLines = form.blocks
            .map((b) => `${b.series}x${b.meters}m ${b.ritmo}${b.material !== "ninguno" ? ` (${b.material})` : ""}${b.comment ? ` — ${b.comment}` : ""}`)
            .join(" · ");
        const newSession = {
            id: uid(),
            type: form.type,
            date: form.date || new Date().toISOString().slice(0, 10),
            distance: form.type === "agua" ? totalMeters : 0,
            pace: form.type === "agua" && avgPaceSec ? secondsToPace(avgPaceSec) : "",
            hr: "",
            notation: form.type === "agua" ? zonesUsed.join(", ") : "",
            location: "piscina",
            notes: form.type === "agua"
                ? `Propuesta: ${blockLines}${form.description ? " · " + form.description : ""}`
                : (form.description || ""),
            planned: true,
            clubDay: form.clubDay || "",
            clubFixed: form.clubDay === "d3",
            pool,
            clubLabel: form.clubDay && clubOpt ? clubOpt.label : "",
        };
        // optimistic update
        setSessions((prev) => [newSession, ...prev]);
        setForm({ type: "agua", date: todayStr(), description: "", clubDay: "", pool: null, blocks: [emptyBlock()] });
        setShowForm(false);
        try {
            await fetch("/api/sessions", {
                method: "POST",
                headers: authHeaders(),
                body: JSON.stringify(newSession),
            });
        }
        catch (e) {
            // will show up again next successful loadSessions() from the KV copy if this failed silently
        }
    };
    const deleteSession = async (id) => {
        setSessions((prev) => prev.filter((s) => s.id !== id));
        try {
            await fetch("/api/sessions", {
                method: "DELETE",
                headers: authHeaders(),
                body: JSON.stringify({ id }),
            });
        }
        catch (e) {
            // will reappear on next successful loadSessions() if this failed silently
        }
    };
    const cssEstimate = useMemo(() => estimateCSS(sessions), [sessions]);
    const personalBests = useMemo(() => computePersonalBests(sessions), [sessions]);
    const mainContent = React.createElement("div", { className: "min-h-screen w-full bg-[#0B1F2E] text-[#EAF2F2]", style: { fontFamily: "'Inter', system-ui, sans-serif", minHeight: "100dvh" } },
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
                    React.createElement("span", { className: "font-mono text-[11px] tracking-[0.2em] uppercase" }, "Cuaderno de entrenamiento — Anton")),
                React.createElement("div", { className: "flex flex-col items-start sm:items-end gap-1.5" },
                    React.createElement("button", { onClick: runSync, disabled: syncing, className: "tap-target flex items-center justify-center gap-1.5 text-[11px] font-mono uppercase tracking-wide bg-[#142F42] hover:bg-[#1B3B52] disabled:opacity-50 border border-[#1E3D4F] rounded-full px-4 py-2.5 transition-colors w-full sm:w-auto" },
                        React.createElement(Icon.Loader2, { size: 12, className: syncing ? "animate-spin" : "" }),
                        syncing ? "sincronizando..." : "sincronizar Strava"),
                    syncMsg && React.createElement("span", { className: "text-[10px] font-mono text-[#7FA9AA]" }, syncMsg))),
            React.createElement("div", { className: "sticky top-0 z-30 flex gap-3 overflow-x-auto scroll-fade mb-6 py-3 -mx-5 px-5 backdrop-blur-md bg-[#0B1F2E]/85 border-b border-[#1E3D4F]/70" }, [
                ["#temporada", "Temporada", "temporada"],
                ["#prediccion", "Predicción", "prediccion"],
                ["#calendario", "Volumen", "calendario"],
                ["#registro", "Registro", "registro"],
                ["#natacion", "Natación", "natacion"],
            ].map(([href, label, id]) => React.createElement("a", { key: href, href: href, className: `shrink-0 font-mono text-[10px] uppercase tracking-wide transition-colors border-b pb-0.5 ${activeSection === id ? "text-[#FF6B35] border-[#FF6B35]" : "text-[#7FA9AA] hover:text-[#4A8B8C] border-transparent hover:border-[#4A8B8C]"}` }, label))),
            React.createElement(CurrentBlockHero, null),
            React.createElement(WaveDivider, null),
            React.createElement("div", { id: "temporada", className: "my-12 scroll-mt-20" },
                React.createElement("div", { className: "font-display uppercase text-[15px] tracking-[0.08em] text-[#EAF2F2] mb-3" }, "Temporada 2026–27 — bloques"),
                React.createElement(SeasonTimeline, null),
                React.createElement("div", { className: "mt-6" },
                    React.createElement("div", { className: "font-display uppercase text-xs tracking-wider text-[#9FB8C4] mb-2" }, "Volumen mensual"),
                    React.createElement(MonthlyVolumeChart, { sessions: sessions })),
                React.createElement("div", { className: "mt-6" },
                    React.createElement("div", { className: "font-display uppercase text-xs tracking-wider text-[#9FB8C4] mb-2" }, "Ritmo medio por mes"),
                    React.createElement(PaceByPhaseChart, { sessions: sessions }))),
            React.createElement("div", { className: "my-12" },
                React.createElement("div", { className: "font-display uppercase text-[15px] tracking-[0.08em] text-[#EAF2F2] mb-1" }, "Forma (fitness / fatiga)"),
                React.createElement("div", { className: "text-[11px] text-[#7FA9AA] font-mono mb-3" }, "modelo simplificado CTL/ATL/TSB — natación + fuerza, orientativo"),
                React.createElement(FitnessForm, { sessions: sessions })),
            React.createElement(CollapsibleSection, { id: "prediccion", title: "Predicción de tiempo", subtitle: "distancias de referencia hasta confirmar la travesía objetivo" },
                React.createElement("div", { className: "grid grid-cols-1 sm:grid-cols-2 gap-4" }, PREDICTION_TARGETS.map((race) => React.createElement("div", { key: race.id, className: "bg-[#0E2634] border border-[#1E3D4F] rounded-xl p-4 shadow-[0_8px_28px_-6px_rgba(0,0,0,0.45)]" },
                    React.createElement("div", { className: "font-mono text-[11px] text-[#7FA9AA] mb-2" }, race.name),
                    React.createElement(RacePrediction, { sessions: sessions, race: race }),
                    React.createElement(PredictionTrend, { sessions: sessions, race: race }))))),
            React.createElement(WaveDivider, { color: "#1E3D4F", opacity: 1 }),
            React.createElement("div", { id: "calendario", className: "my-12 scroll-mt-20" },
                React.createElement("div", { className: "font-display uppercase text-[15px] tracking-[0.08em] text-[#EAF2F2] mb-3" }, "Metros totales por mes — desde 2024"),
                React.createElement(MonthlyMetersLineChart, { sessions: sessions })),
            React.createElement("div", { id: "registro", className: "my-12 scroll-mt-20" },
                React.createElement("div", { className: "flex items-center justify-between mb-3" },
                    React.createElement("div", { className: "font-display uppercase text-[15px] tracking-[0.08em] text-[#EAF2F2]" }, "Sesiones registradas"),
                    React.createElement("button", { onClick: () => setShowForm((s) => !s), className: "tap-target flex items-center gap-1 text-xs font-mono uppercase tracking-wide bg-[#142F42] hover:bg-[#1B3B52] border border-[#1E3D4F] rounded-full px-4 py-2.5 transition-colors" },
                        showForm ? React.createElement(Icon.X, { size: 13 }) : React.createElement(Icon.Plus, { size: 13 }),
                        showForm ? "cerrar" : "proponer sesión")),
                showForm && (function () {
                    const typeToggle = React.createElement("div", { className: "flex rounded-lg overflow-hidden border border-[#1E3D4F] mb-3" }, React.createElement("button", { onClick: () => setForm({ ...form, type: "agua" }), className: `tap-target flex-1 text-xs font-mono uppercase py-2.5 transition-colors ${form.type === "agua" ? "bg-[#4A8B8C] text-[#0B1F2E] font-semibold" : "bg-[#0B1F2E] text-[#7FA9AA]"}` }, "agua"), React.createElement("button", { onClick: () => setForm({ ...form, type: "seco" }), className: `tap-target flex-1 text-xs font-mono uppercase py-2.5 transition-colors ${form.type === "seco" ? "bg-[#FF6B35] text-[#0B1F2E] font-semibold" : "bg-[#0B1F2E] text-[#7FA9AA]"}` }, "seco"));
                    const dateInput = React.createElement("div", { className: "mb-3" }, React.createElement("label", { className: "block text-[9px] font-mono uppercase text-[#5A7A87] mb-1" }, "Fecha"), React.createElement("input", { type: "date", value: form.date, onChange: (e) => setForm({ ...form, date: e.target.value, pool: null }), style: { fontSize: 16 }, className: "w-full bg-[#0B1F2E] border border-[#1E3D4F] rounded-lg px-3 py-2.5 font-mono focus:outline-none focus:border-[#4A8B8C]" }));
                    const autoPool = poolForDate(form.date, form.clubDay);
                    const effPool = form.pool || autoPool;
                    const chip = (active, onClick, label, key) => React.createElement("button", { key, onClick, className: `tap-target shrink-0 text-[11px] font-mono rounded-full px-3 py-2 border transition-colors ${active ? "bg-[#4A8B8C] border-[#4A8B8C] text-[#0B1F2E] font-semibold" : "bg-[#0B1F2E] border-[#1E3D4F] text-[#7FA9AA]"}` }, label);
                    const clubRow = form.type === "agua" && React.createElement("div", { className: "mb-3" },
                        React.createElement("label", { className: "block text-[9px] font-mono uppercase text-[#5A7A87] mb-1" }, "Origen"),
                        React.createElement("div", { className: "flex flex-wrap gap-2" }, CLUB_DAY_OPTIONS.map((o) => chip(form.clubDay === o.id, () => setForm({ ...form, clubDay: o.id, pool: null }), o.label, o.id || "own"))),
                        form.clubDay === "d3" && React.createElement("div", { className: "text-[10px] font-mono text-[#E8C547] mt-1.5" }, "sesión de grupo — se registra tal cual, no se modifica"),
                        (form.clubDay === "d1" || form.clubDay === "d2") && React.createElement("div", { className: "text-[10px] font-mono text-[#7FA9AA] mt-1.5" }, "sesión individual del club — editable / optimizable"));
                    const poolRow = form.type === "agua" && React.createElement("div", { className: "mb-3" },
                        React.createElement("label", { className: "block text-[9px] font-mono uppercase text-[#5A7A87] mb-1" }, "Piscina"),
                        React.createElement("div", { className: "flex items-center gap-2" },
                            chip(effPool === 25, () => setForm({ ...form, pool: 25 }), "25 m", "p25"),
                            chip(effPool === 50, () => setForm({ ...form, pool: 50 }), "50 m", "p50"),
                            React.createElement("span", { className: "text-[10px] font-mono text-[#5A7A87]" }, form.pool && form.pool !== autoPool ? "cambiada a mano" : form.clubDay === "d3" ? "grupo · siempre 50 m" : "según el día")));
                    const descInput = React.createElement("input", { placeholder: "Descripción (opcional)", value: form.description, onChange: (e) => setForm({ ...form, description: e.target.value }), style: { fontSize: 16 }, className: "w-full bg-[#0B1F2E] border border-[#1E3D4F] rounded-lg px-3 py-2.5 placeholder-[#5A7A87] focus:outline-none focus:border-[#4A8B8C] mb-3" });
                    const field = (label, inputEl) => React.createElement("div", null, React.createElement("label", { className: "block text-[9px] font-mono uppercase text-[#5A7A87] mb-1" }, label), inputEl);
                    const blockRows = form.blocks.map((b, i) => {
                        const header = React.createElement("div", { className: "flex items-center justify-between mb-2" }, React.createElement("span", { className: "font-mono text-[10px] uppercase text-[#5A7A87]" }, "Línea ", i + 1, " · ", blockMeters(b), "m"), form.blocks.length > 1 && React.createElement("button", { onClick: () => removeBlock(b.id), className: "tap-target text-[#5A7A87] hover:text-[#E8453C] transition-colors" }, React.createElement(Icon.X, { size: 14 })));
                        const seriesInput = field("Series", React.createElement("input", { type: "number", min: 1, max: 10, value: b.series, onChange: (e) => updateBlock(b.id, "series", Math.max(1, Math.min(10, Number(e.target.value) || 1))), style: { fontSize: 16 }, className: "w-full bg-[#142F42] border border-[#1E3D4F] rounded-lg px-3 py-2.5 font-mono focus:outline-none focus:border-[#4A8B8C]" }));
                        const metersInput = field("Metros", React.createElement("input", { type: "number", min: 25, max: 5000, step: 25, value: b.meters, onChange: (e) => updateBlock(b.id, "meters", Math.max(25, Math.min(5000, Number(e.target.value) || 25))), style: { fontSize: 16 }, className: "w-full bg-[#142F42] border border-[#1E3D4F] rounded-lg px-3 py-2.5 font-mono focus:outline-none focus:border-[#4A8B8C]" }));
                        const ritmoOptions = RITMO_FORM_OPTIONS.map((z) => React.createElement("option", { key: z, value: z }, z));
                        const ritmoInput = field("Ritmo", React.createElement("select", { value: b.ritmo, onChange: (e) => updateBlock(b.id, "ritmo", e.target.value), style: { fontSize: 16 }, className: "w-full bg-[#142F42] border border-[#1E3D4F] rounded-lg px-3 py-2.5 font-mono focus:outline-none focus:border-[#4A8B8C]" }, ritmoOptions));
                        const materialOptions = ["ninguno", "palas", "aletas", "pullboy"].map((mtl) => React.createElement("option", { key: mtl, value: mtl }, mtl));
                        const materialInput = field("Material", React.createElement("select", { value: b.material, onChange: (e) => updateBlock(b.id, "material", e.target.value), style: { fontSize: 16 }, className: "w-full bg-[#142F42] border border-[#1E3D4F] rounded-lg px-3 py-2.5 focus:outline-none focus:border-[#4A8B8C]" }, materialOptions));
                        const grid = React.createElement("div", { className: "grid grid-cols-2 sm:grid-cols-4 gap-2" }, seriesInput, metersInput, ritmoInput, materialInput);
                        const commentInput = React.createElement("input", { type: "text", placeholder: "Comentario (opcional)", value: b.comment || "", onChange: (e) => updateBlock(b.id, "comment", e.target.value), style: { fontSize: 16 }, className: "w-full bg-[#142F42] border border-[#1E3D4F] rounded-lg px-3 py-2.5 placeholder-[#5A7A87] focus:outline-none focus:border-[#4A8B8C] mt-2" });
                        return React.createElement("div", { key: b.id, className: "bg-[#0B1F2E] border border-[#1E3D4F] rounded-lg p-3" }, header, grid, commentInput);
                    });
                    const blocksList = React.createElement("div", { className: "space-y-2" }, blockRows);
                    const addLineBtn = React.createElement("button", { onClick: addBlock, className: "tap-target flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wide text-[#4A8B8C] hover:text-[#7FA9AA] transition-colors mt-2" }, React.createElement(Icon.Plus, { size: 12 }), "añadir línea");
                    const totalLine = React.createElement("div", { className: "font-mono text-[11px] text-[#7FA9AA] mt-3" }, "Total: ", React.createElement("span", { className: "text-[#FF6B35] font-medium" }, totalMeters, "m"), " · ", form.blocks.length, " línea", form.blocks.length > 1 ? "s" : "");
                    const aguaSection = form.type === "agua" && React.createElement(React.Fragment, null, blocksList, addLineBtn, totalLine);
                    const saveBtn = React.createElement("button", { onClick: addSession, className: "tap-target bg-[#FF6B35] hover:bg-[#E85A28] text-[#0B1F2E] font-semibold rounded-lg px-3 py-2.5 text-sm transition-colors mt-3 w-full sm:w-auto" }, "Guardar propuesta");
                    return React.createElement("div", { className: "bg-[#0E2634] border border-[#1E3D4F] rounded-2xl p-4 mb-4 shadow-[0_8px_28px_-6px_rgba(0,0,0,0.45)]" }, React.createElement("div", { className: "text-[11px] text-[#5A7A87] font-mono mb-3" }, "Propuesta de entrenamiento — al sincronizar con Strava, se sustituye sola por los datos reales del día."), typeToggle, dateInput, clubRow, poolRow, descInput, aguaSection, saveBtn);
                })(),
                React.createElement(SessionAccordion, { sessions: sessions, paceTargets: paceTargets, onDelete: deleteSession })),
            React.createElement("div", { id: "natacion", className: "my-12 scroll-mt-20" },
                React.createElement("div", { className: "flex items-center justify-between flex-wrap gap-2 mb-1" },
                    React.createElement("div", { className: "font-display uppercase text-[15px] tracking-[0.08em] text-[#EAF2F2]" }, "Natación"),
                    React.createElement("button", { onClick: runCalibration, disabled: calibrating, className: "tap-target flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wide bg-[#142F42] hover:bg-[#1B3B52] disabled:opacity-50 border border-[#1E3D4F] rounded-full px-4 py-2.5 transition-colors" },
                        React.createElement(Icon.Loader2, { size: 12, className: calibrating ? "animate-spin" : "" }),
                        "recalcular desde Strava")),
                calibrateMsg && React.createElement("div", { className: "text-[10px] font-mono text-[#7FA9AA] mb-3" }, calibrateMsg),
                cssEstimate && React.createElement("div", { className: "text-[11px] font-mono text-[#7FA9AA] mb-3" }, "CSS estimado (ritmo umbral, de tus datos reales): ", React.createElement("span", { className: "text-[#FF6B35] font-medium" }, secondsToPace(cssEstimate.cssPace)), "/100m — usado para calcular la carga real de entrenamiento en Forma"),
                React.createElement(CriticalVelocityTest, { onApply: (zones) => {
                        setPaceTargets(zones);
                        try {
                            localStorage.setItem("swimcoach_pace_targets", JSON.stringify(zones));
                        }
                        catch (e) { }
                        setCalibrateMsg("");
                        tick((t) => t + 1);
                    } }),
                React.createElement("div", { className: "text-[11px] text-[#7FA9AA] font-mono mb-3" }, "de más lento a más rápido · ritmo por 100m"),
                React.createElement("div", { className: "grid grid-cols-2 sm:grid-cols-4 gap-2" }, NOTATION_HELP.map((zone) => {
                    const range = paceTargets[zone] || DEFAULT_PACE_TARGETS[zone];
                    return React.createElement("div", { key: zone, className: "bg-[#0E2634] border border-[#1E3D4F] rounded-lg px-3 py-2 shadow-[0_4px_14px_-4px_rgba(0,0,0,0.4)]" },
                        React.createElement("div", { className: "font-mono text-[#FF6B35] text-sm font-medium" }, zone),
                        range && React.createElement("div", { className: "text-[11px] text-[#9FB8C4] font-mono" }, secondsToPace(range[0]), "–", secondsToPace(range[1])));
                })),
                React.createElement("div", { className: "font-display uppercase text-xs tracking-wider text-[#9FB8C4] mt-5 mb-2" }, "Mejores marcas"),
                React.createElement("div", { className: "grid grid-cols-2 sm:grid-cols-4 gap-2" }, PR_DISTANCES.map((dist) => {
                    const pr = personalBests[dist];
                    return React.createElement("div", { key: dist, className: "bg-[#0E2634] border border-[#1E3D4F] rounded-lg px-3 py-2 shadow-[0_4px_14px_-4px_rgba(0,0,0,0.4)]" },
                        React.createElement("div", { className: "font-mono text-[#5A7A87] text-[10px] uppercase" }, dist, "m"),
                        pr
                            ? React.createElement(React.Fragment, null,
                                React.createElement("div", { className: "font-display text-[#FF6B35] text-lg leading-tight" }, fmtDuration(pr.pace * (dist / 100))),
                                React.createElement("div", { className: "text-[10px] text-[#7FA9AA] font-mono" }, secondsToPace(pr.pace), "/100m · ", pr.location === "abiertas" ? "aguas abiertas" : "piscina"),
                                React.createElement("div", { className: "text-[9px] text-[#5A7A87] font-mono" }, fmtDate(pr.date)))
                            : React.createElement("div", { className: "text-[13px] text-[#5A7A87] font-mono" }, "—"));
                })),
                React.createElement("div", { className: "font-display uppercase text-xs tracking-wider text-[#9FB8C4] mt-5 mb-2" },
                    "Zonas de FC (estimadas, máx. ",
                    MAX_HR,
                    " bpm)"),
                React.createElement("div", { className: "flex flex-wrap gap-3" }, HR_ZONES.map((z) => (React.createElement("span", { key: z.key, className: "flex items-center gap-1.5 text-[11px] font-mono text-[#9FB8C4]" },
                    React.createElement("span", { className: "w-2 h-2 rounded-full", style: { background: z.color } }),
                    z.key,
                    " · ",
                    z.label))))),
            React.createElement(WaveDivider, { color: "#1E3D4F", opacity: 1 }),
            React.createElement("div", { className: "text-center text-[10px] font-mono text-[#3E5A68] pt-4 pb-2 uppercase tracking-widest" }, "Temporada 2026–27 · objetivo jul/ago 2027")));
    const backToTopBtn = showBackToTop && React.createElement("button", { onClick: () => window.scrollTo({ top: 0, behavior: "smooth" }), className: "tap-target fixed bottom-6 right-5 z-40 bg-[#FF6B35] hover:bg-[#E85A28] text-[#0B1F2E] rounded-full w-12 h-12 flex items-center justify-center shadow-lg transition-colors", style: { bottom: "max(1.5rem, env(safe-area-inset-bottom))" } }, React.createElement(Icon.ArrowUp, { size: 18 }));
    return React.createElement(React.Fragment, null, mainContent, backToTopBtn);
}
// ---- Mount --------------------------------------------------------------
ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(SwimCoach, null));
