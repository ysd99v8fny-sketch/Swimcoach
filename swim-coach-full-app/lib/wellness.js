import { Redis } from "@upstash/redis";

const kv = Redis.fromEnv();

// Datos diarios de recuperación que llegan desde Garmin a través del script
// local scripts/garmin_sync.py (Garmin no ofrece una API personal fiable
// desde la nube, así que el Mac de Anton hace de puente).
const DAYS_KEY = "wellness:days"; // { "YYYY-MM-DD": {...}, ... }
const META_KEY = "wellness:meta"; // { synced_at }
const KEEP_DAYS = 120;

const FIELDS = [
  "hrv_avg", "hrv_weekly", "hrv_low", "hrv_high", "hrv_status",
  "sleep_hours", "sleep_score", "deep_pct", "rem_pct",
  "rhr", "bb_high", "bb_low", "readiness",
];

function clean(day) {
  const out = { date: String(day.date).slice(0, 10) };
  for (const f of FIELDS) {
    const v = day[f];
    if (v === null || v === undefined || v === "") continue;
    out[f] = f === "hrv_status" ? String(v) : Number(v);
    if (f !== "hrv_status" && !Number.isFinite(out[f])) delete out[f];
  }
  return out;
}

export async function getWellness() {
  const [days, meta] = await Promise.all([kv.get(DAYS_KEY), kv.get(META_KEY)]);
  const list = Object.values(days || {}).sort((a, b) => (a.date < b.date ? 1 : -1));
  return { days: list, synced_at: meta?.synced_at || null };
}

/** Fusiona días nuevos (por fecha) y recorta a los últimos KEEP_DAYS. */
export async function upsertWellness(newDays) {
  const existing = (await kv.get(DAYS_KEY)) || {};
  for (const d of newDays) {
    if (!d || !/^\d{4}-\d{2}-\d{2}/.test(String(d.date))) continue;
    const c = clean(d);
    existing[c.date] = { ...existing[c.date], ...c };
  }
  const kept = Object.keys(existing).sort().slice(-KEEP_DAYS);
  const trimmed = Object.fromEntries(kept.map((k) => [k, existing[k]]));
  await kv.set(DAYS_KEY, trimmed);
  await kv.set(META_KEY, { synced_at: new Date().toISOString() });
  return kept.length;
}
