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
  return {
    id: String(a.id),
    type: "agua",
    date: (a.start_date_local || a.start_date || "").slice(0, 10),
    distance,
    pace,
    hr: a.average_heartrate ? String(Math.round(a.average_heartrate)) : "",
    notation: "",
    notes: a.name && !/^(Morning|Afternoon|Evening|Lunch|Night) Swim$/.test(a.name) ? a.name : "Strava",
  };
}

export const SWIM_TYPES = new Set(["Swim"]);
