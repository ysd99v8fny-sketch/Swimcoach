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

/**
 * Fetches the full DetailedActivity for a single activity. Unlike the
 * paginated /athlete/activities list (SummaryActivity — no laps), this
 * includes the `laps` array that Garmin's pool-swim algorithm records
 * (automatic length/turn detection, rest-lap gaps, per-lap HR).
 */
export async function getActivityDetail(token, activityId) {
  const res = await fetch(`https://www.strava.com/api/v3/activities/${activityId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Strava API ${res.status} (actividad ${activityId}): ${text}`);
  }
  return res.json();
}

/**
 * Groups a Strava `laps` array into swim "series" (e.g. "8x100m").
 *
 * Garmin/Strava represent a rest between reps as its own zero-distance
 * lap. Heuristic:
 *  - distance === 0            -> rest, accumulate its time
 *  - same distance as previous
 *    rep, without an unusually
 *    long rest before it        -> continues the current series
 *  - anything else              -> starts a new series
 *
 * "Unusually long rest" = more than 60s or 2.5x the average rest seen so
 * far in the current series — this is what separates e.g. two different
 * 4x100 sets (with a longer break between sets) from one 8x100. It's a
 * heuristic, not a perfect reconstruction of the workout — good enough to
 * display, not guaranteed to match exactly what was typed into the watch.
 */
export function lapsToSeries(laps) {
  if (!Array.isArray(laps) || laps.length === 0) return [];

  const series = [];
  let current = null;
  let pendingRestSec = 0;

  const closeCurrent = () => {
    if (current) series.push(finalizeSeries(current));
    current = null;
  };

  for (const lap of laps) {
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

function avg(arr) {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
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

  const session = {
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

  // `a.laps` only exists on the DetailedActivity payload (GET
  // /activities/{id}) — the bulk list endpoint used by the full sync never
  // includes it. When present, turn it into displayable series (8x100...).
  if (Array.isArray(a.laps) && a.laps.length > 1) {
    const series = lapsToSeries(a.laps);
    if (series.length) session.series = series;
  }

  return session;
}

export const SWIM_TYPES = new Set(["Swim"]);
