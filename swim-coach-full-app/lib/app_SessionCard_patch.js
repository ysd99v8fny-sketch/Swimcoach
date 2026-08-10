// PARCHE — reemplaza la función SessionCard existente en app.js (líneas ~372-407)
// por esta versión. No toca nada más del archivo: mismo nombre, misma firma,
// mismo estilo (colores, font-mono, tap-target) que el resto de la app.

// ---- Single session row (used by the year/month accordion) ----------------
function SessionCard({ s, sessions, paceTargets, onDelete }) {
    const [seriesOpen, setSeriesOpen] = useState(false);
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
    const locationEl = !isDry && s.location && React.createElement("span", { className: `font-mono text-[9px] uppercase tracking-wide rounded-full px-2 py-0.5 shrink-0 ${s.location === "abiertas" ? "bg-[#4A8B8C]/15 text-[#7FA9AA]" : "bg-[#1E3D4F] text-[#5A7A87]"}` }, s.location === "abiertas" ? "aguas abiertas" : "piscina");
    const dateEl = React.createElement("span", { className: "font-mono text-[#7FA9AA] w-16 shrink-0" }, fmtDate(s.date));
    const distEl = React.createElement("span", { className: "font-mono font-medium w-20 shrink-0" }, isDry ? "—" : `${s.distance}m`);
    const paceEl = s.pace && React.createElement("span", { className: "font-mono text-[#9FB8C4] w-24 shrink-0 flex items-center gap-1" }, React.createElement(Icon.Timer, { size: 12 }), s.pace, "/100");
    const sparkEl = sparkValues.length >= 2 && React.createElement(Sparkline, { values: sparkValues });
    const hrEl = s.hr && React.createElement("span", { className: "font-mono text-[#9FB8C4] shrink-0 flex items-center gap-1" }, React.createElement("span", { className: "w-2 h-2 rounded-full shrink-0", style: { background: zone?.color || "#5A7A87" } }), s.hr, " bpm", zone && React.createElement("span", { className: "text-[9px] text-[#5A7A87] ml-0.5" }, `·${zone.key}`));
    const notationEl = s.notation && React.createElement("span", { className: "font-mono text-xs bg-[#142F42] rounded-full px-2 py-0.5 text-[#FF6B35] shrink-0" }, s.notation);
    const deviationEl = deviation && React.createElement("span", { className: `font-mono text-[10px] rounded-full px-2 py-0.5 shrink-0 ${deviation === "rápido" ? "bg-[#FF6B35]/15 text-[#FF6B35]" : "bg-[#4A8B8C]/15 text-[#7FA9AA]"}` }, "⚠ ", deviation, ` (obj. ${target[0]}-${target[1]}s)`);
    const notesEl = s.notes && React.createElement("span", { className: "text-[#9FB8C4] truncate" }, s.notes);
    const deleteBtn = isPlanned && onDelete && React.createElement("button", { onClick: () => onDelete(s.id), title: "Borrar propuesta", className: "tap-target ml-auto shrink-0 text-[#5A7A87] hover:text-[#E8453C] transition-colors" }, React.createElement(Icon.X, { size: 14 }));

    const hasSeries = Array.isArray(s.series) && s.series.length > 0;
    const seriesToggle = hasSeries && React.createElement("button", {
        onClick: () => setSeriesOpen((v) => !v),
        title: "Ver series",
        className: "tap-target shrink-0 flex items-center gap-1 font-mono text-[10px] text-[#4A8B8C] hover:text-[#7FA9AA] transition-colors",
    },
        React.createElement("span", { className: "inline-block transition-transform", style: { transform: seriesOpen ? "rotate(90deg)" : "rotate(0deg)" } }, "▸"),
        `${s.series.length} serie${s.series.length === 1 ? "" : "s"}`);

    const row = React.createElement("div", { className: `flex items-center gap-4 rounded-xl px-4 py-3 text-sm flex-wrap border-l-2 ${isPlanned ? "bg-[#0E2634]/40 border-l-[#E8C547]" : isDry ? "bg-[#0E2634]/60 border-[#1E3D4F] border-l-[#5A7A87]" : "bg-[#0E2634] border-[#1E3D4F] border-l-[#4A8B8C]"}`, style: { borderTopColor: "#1E3D4F", borderRightColor: "#1E3D4F", borderBottomColor: "#1E3D4F", borderTopWidth: 1, borderRightWidth: 1, borderBottomWidth: 1, borderStyle: isPlanned ? "dashed" : "solid" } }, badge, typeIcon, dateEl, distEl, locationEl, paceEl, sparkEl, hrEl, notationEl, deviationEl, notesEl, seriesToggle, deleteBtn);

    const seriesPanel = hasSeries && seriesOpen && React.createElement("div", { className: "ml-4 mt-1.5 mb-1 space-y-1 border-l border-[#1E3D4F] pl-4" },
        s.series.map((set, i) => React.createElement("div", { key: i, className: "flex items-center gap-3 font-mono text-[11px] text-[#9FB8C4]" },
            React.createElement("span", { className: "text-[#FF6B35] w-16 shrink-0" }, `${set.reps}×${set.distance}m`),
            React.createElement("span", { className: "flex items-center gap-1 w-20 shrink-0" }, React.createElement(Icon.Timer, { size: 11 }), set.avgPace, "/100"),
            set.avgRestSec > 0 && React.createElement("span", { className: "text-[#5A7A87] w-24 shrink-0" }, `desc. ${set.avgRestSec}s`),
            set.avgHr && React.createElement("span", { className: "text-[#5A7A87]" }, `${set.avgHr} bpm`))));

    return React.createElement("div", null, row, seriesPanel);
}
