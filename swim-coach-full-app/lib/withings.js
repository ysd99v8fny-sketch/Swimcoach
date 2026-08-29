import { Redis } from "@upstash/redis";

const kv = Redis.fromEnv();

const TOKEN_KEY = "withings:tokens";
const METRICS_KEY = "withings:metrics";

const MEASTYPE = {
  WEIGHT: 1,
  HEIGHT: 4,
  FAT_RATIO: 6,
  MUSCLE_MASS: 76,
  HYDRATION: 77,
};
const REQUESTED_TYPES = Object.values(MEASTYPE).join(",");

export async function getValidAccessToken() {
  const tokens = await kv.get(TOKEN_KEY);
  if (!tokens) {
    throw new Error("No hay tokens de Withings guardados. Completa /api/withings/auth primero.");
  }

  const now = Math.floor(Date.now() / 1000);
  if (tokens.expires_at && tokens.expires_at > now + 60) {
    return tokens.access_token;
  }

  const res = await fetch("https://wbsapi.withings.net/v2/oauth2", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      action: "requesttoken",
      client_id: process.env.WITHINGS_CLIENT_ID,
      client_secret: process.env.WITHINGS_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token,
    }),
  });

  const data = await res.json();
  if (!res.ok || data.status !== 0) {
    throw new Error(`Fallo al refrescar token de Withings: ${JSON.stringify(data)}`);
  }

  await saveInitialTokens(data.body);
  return data.body.access_token;
}

export async function saveInitialTokens(body) {
  const now = Math.floor(Date.now() / 1000);
  await kv.set(TOKEN_KEY, {
    access_token: body.access_token,
    refresh_token: body.refresh_token,
    expires_at: now + Number(body.expires_in || 10800),
    userid: body.userid,
  });
}

export async function fetchLatestBodyMetrics() {
  const accessToken = await getValidAccessToken();

  const res = await fetch("https://wbsapi.withings.net/measure", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Bearer ${accessToken}`,
    },
    body: new URLSearchParams({
      action: "getmeas",
      meastypes: REQUESTED_TYPES,
      category: "1",
    }),
  });

  const data = await res.json();
  if (!res.ok || data.status !== 0) {
    throw new Error(`Fallo al leer medidas de Withings: ${JSON.stringify(data)}`);
  }

  const groups = data.body?.measuregrps || [];
  if (groups.length === 0) return null;

  const latest = groups.reduce((a, b) => (a.date > b.date ? a : b));

  const raw = {};
  for (const m of latest.measures) {
    raw[m.type] = m.value * Math.pow(10, m.unit);
  }

  const weightKg = raw[MEASTYPE.WEIGHT] ?? null;
  const heightM = raw[MEASTYPE.HEIGHT] ?? null;
  const fatRatioPct = raw[MEASTYPE.FAT_RATIO] ?? null;
  const muscleMassKg = raw[MEASTYPE.MUSCLE_MASS] ?? null;
  const hydrationKg = raw[MEASTYPE.HYDRATION] ?? null;

  const metrics = {
    date: new Date(latest.date * 1000).toISOString().slice(0, 10),
    weightKg: weightKg != null ? round1(weightKg) : null,
    heightCm: heightM != null ? round1(heightM * 100) : null,
    fatPct: fatRatioPct != null ? round1(fatRatioPct) : null,
    musclePct: muscleMassKg != null && weightKg ? round1((muscleMassKg / weightKg) * 100) : null,
    waterPct: hydrationKg != null && weightKg ? round1((hydrationKg / weightKg) * 100) : null,
  };

  await kv.set(METRICS_KEY, metrics);
  return metrics;
}

export async function getStoredBodyMetrics() {
  return (await kv.get(METRICS_KEY)) || null;
}

function round1(n) {
  return Math.round(n * 10) / 10;
}
