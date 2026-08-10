import { Redis } from "@upstash/redis";

const kv = Redis.fromEnv();

const TOKEN_KEY = "strava:tokens";

/**
 * Returns a valid Strava access token, refreshing it first if it's expired
 * or about to expire. Tokens are stored in Vercel KV so the refresh only
 * has to happen once per ~6h window, not on every request.
 */
export async function getValidAccessToken() {
  const tokens = await kv.get(TOKEN_KEY);
  if (!tokens) {
    throw new Error("No hay tokens de Strava guardados. Completa /api/strava/auth primero.");
  }

  const now = Math.floor(Date.now() / 1000);
  if (tokens.expires_at && tokens.expires_at > now + 60) {
    return tokens.access_token;
  }

  // Refresh
  const res = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Fallo al refrescar token de Strava: ${res.status} ${text}`);
  }

  const fresh = await res.json();
  await kv.set(TOKEN_KEY, {
    access_token: fresh.access_token,
    refresh_token: fresh.refresh_token,
    expires_at: fresh.expires_at,
  });

  return fresh.access_token;
}

export async function saveInitialTokens(tokenResponse) {
  await kv.set(TOKEN_KEY, {
    access_token: tokenResponse.access_token,
    refresh_token: tokenResponse.refresh_token,
    expires_at: tokenResponse.expires_at,
  });
}

/** Convert a raw Strava activity into the shape the app's session log uses. */
export function activityToSession(a) {
  const distance = Math.round(a.distance || 0);
  const movingTime = a.moving_time || 0;
  let pace = "";
  if (distance > 0 && movingTime > 0) {
    const secPer100 = movingTime / (distance / 100);
    const m = Math.floor(secPer100 / 60);
    const s = Math.round(secPer100 % 60);
    pace = `${m}:${String(s).padStart(2, "0")}`;
  }
  // Pool swims are almost always recorded indoors with no GPS fix; open-water
  // swims carry a real start_latlng. Not perfect (a poolside GPS blip could
  // fool it occasionally) but a solid, zero-extra-cost heuristic.
  const hasGps = Array.isArray(a.start_latlng) && a.start_latlng.length === 2;
  const location = hasGps ? "abiertas" : "piscina";
  return {
    id: String(a.id),
    type: "agua",
    date: (a.start_date_local || a.start_date || "").slice(0, 10),
    distance,
    pace,
    hr: a.average_heartrate ? String(Math.round(a.average_heartrate)) : "",
    notation: "",
    location,
    notes: a.name && !/^(Morning|Afternoon|Evening|Lunch|Night) Swim$/.test(a.name) ? a.name : "Strava",
  };
}

/**
 * Fetch per-lap splits for an activity and return the distance (metres) and
 * pace (seconds/100m) of each lap that looks like real swimming.
 *
 * Why this exists: a session's overall average pace (moving_time/distance)
 * blends warm-up, main set and cool-down into one number that doesn't
 * represent any single training zone — it's why calibratePaceTargets was
 * producing zones that didn't match Anton's real paces even after excluding
 * planned sessions and normalizing open-water pace. Checked against real
 * data (activity 19306703631, "Natación a la hora del almuerzo"): the
 * session averaged 1:39/100m, but its 16 laps actually ranged from 1:26/100m
 * (50m fast reps) to 1:46/100m (400m warm-up/cool-down) — that spread is
 * what the zone calibration actually needs.
 */
// Thrown when Strava responds 429 (rate limit hit) — distinguished from a
// generic failure so callers can stop the backfill gracefully instead of
// treating it as "no lap data for this one activity" or aborting everything.
export class StravaRateLimitError extends Error {}

/** True once usage is close enough to Strava's 15-minute cap that the next
 * batch of requests risks a 429 — read from the response headers Strava
 * sends on every call, so this adapts automatically if their limits change. */
export function isRateLimitClose(res) {
  const usage = res.headers.get("x-ratelimit-usage");
  const limit = res.headers.get("x-ratelimit-limit");
  if (!usage || !limit)
    return false;
  const shortUsage = Number(usage.split(",")[0]);
  const shortLimit = Number(limit.split(",")[0]);
  return shortLimit > 0 && shortUsage / shortLimit > 0.9;
}

export async function getLapPaces(activityId, accessToken) {
  const res = await fetch(`https://www.strava.com/api/v3/activities/${activityId}/laps`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 429) {
    throw new StravaRateLimitError("Strava rate limit alcanzado");
  }
  if (!res.ok)
    return { laps: [], rateLimitClose: false };
  const rawLaps = await res.json();
  // Distance + pace per lap, not just a flat pace number — app.js's
  // calibratePaceTargets/estimateCSS/computePersonalBests/sessionLoad all
  // read {distance, pace} pairs off session.laps (a 400m rep and a 50m rep
  // at the same pace mean very different things for CSS and training load).
  const laps = Array.isArray(rawLaps)
    ? rawLaps
        .filter((l) => l.distance >= 25 && l.moving_time > 0)
        .map((l) => ({ distance: l.distance, pace: l.moving_time / (l.distance / 100) }))
        .filter((l) => l.pace > 40 && l.pace < 240)
    : [];
  return { laps, rateLimitClose: isRateLimitClose(res) };
}

export const SWIM_TYPES = new Set(["Swim"]);
