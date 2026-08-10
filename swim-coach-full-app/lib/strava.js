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

/**
 * Groups Strava's raw lap array into swim "series" (e.g. "8x100m") with
 * real rest time between reps.
 *
 * Strava/Garmin represent a rest between reps as its own zero-distance lap
 * (moving but not going anywhere at the wall) — that's the only place rest
 * duration actually lives, the whole-session summary doesn't have it.
 * Heuristic:
 *  - distance === 0                    -> rest, accumulate its elapsed time
 *  - same distance as the previous rep,
 *    without an unusually long rest
 *    before it                          -> continues the current series
 *  - anything else                      -> starts a new series
 *
 * "Unusually long rest" = more than 60s or 2.5x the average rest seen so
 * far in the current series — separates e.g. two different 4x100 sets (with
 * a longer break between sets) from one 8x100. It's a heuristic, not a
 * guaranteed reconstruction of exactly what was swum.
 */
function avg(arr) {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

export function lapsToSeries(rawLaps) {
  if (!Array.isArray(rawLaps) || rawLaps.length === 0) return [];

  const series = [];
  let current = null;
  let pendingRestSec = 0;

  const closeCurrent = () => {
    if (current) series.push(finalizeSeries(current));
    current = null;
  };

  for (const lap of rawLaps) {
    const isRest = !lap.distance || lap.distance === 0;
    if (isRest) {
      pendingRestSec += lap.elapsed_time || 0;
      continue;
    }

    const longBreak =
      current &&
      current.restsSec.length > 0 &&
      pendingRestSec > Math.max(60, avg(current.restsSec) * 2.5);

    if (current && current.distance === lap.distance && !longBreak) {
      current.reps += 1;
      current.timesSec.push(lap.moving_time || lap.elapsed_time || 0);
      if (pendingRestSec) current.restsSec.push(pendingRestSec);
      if (lap.average_heartrate) current.hrs.push(lap.average_heartrate);
    } else {
      closeCurrent();
      current = {
        distance: lap.distance,
        reps: 1,
        timesSec: [lap.moving_time || lap.elapsed_time || 0],
        restsSec: [],
        hrs: lap.average_heartrate ? [lap.average_heartrate] : [],
      };
    }
    pendingRestSec = 0;
  }
  closeCurrent();
  return series;
}

function finalizeSeries(group) {
  const avgTimeSec = avg(group.timesSec);
  const avgRestSec = group.restsSec.length ? Math.round(avg(group.restsSec)) : 0;
  const avgHr = group.hrs.length ? Math.round(avg(group.hrs)) : null;
  const secPer100 = group.distance > 0 ? avgTimeSec / (group.distance / 100) : 0;
  const m = Math.floor(secPer100 / 60);
  const s = Math.round(secPer100 % 60);
  return {
    reps: group.reps,
    distance: group.distance,
    avgTimeSec: Math.round(avgTimeSec),
    avgPace: `${m}:${String(s).padStart(2, "0")}`,
    avgRestSec,
    avgHr,
  };
}

/**
 * Fetches an activity's laps once and returns both:
 *  - `laps`: flat {distance, pace} pairs for real swim reps — feeds
 *    calibratePaceTargets/estimateCSS/computePersonalBests/sessionLoad.
 *  - `series`: reps grouped into sets with rest time between them (see
 *    lapsToSeries above) — feeds the per-session splits/rest breakdown in
 *    the training log.
 */
export async function getLapData(activityId, accessToken) {
  const res = await fetch(`https://www.strava.com/api/v3/activities/${activityId}/laps`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 429) {
    throw new StravaRateLimitError("Strava rate limit alcanzado");
  }
  if (!res.ok)
    return { laps: [], series: [], rateLimitClose: false };
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
  const series = lapsToSeries(rawLaps);
  return { laps, series, rateLimitClose: isRateLimitClose(res) };
}

export const SWIM_TYPES = new Set(["Swim"]);
