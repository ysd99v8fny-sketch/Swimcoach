import { getValidAccessToken, activityToSession, getLapPaces, StravaRateLimitError, isRateLimitClose, SWIM_TYPES } from "../../lib/strava.js";
import { getSessions, upsertSessions } from "../../lib/sessions.js";
import { requireAuth } from "../../lib/auth.js";

// Give this function more room than Vercel's 10s default — fetching lap
// splits means one extra Strava call per swim, and a full-history backfill
// can be 100+ activities. 60s is the ceiling Vercel allows on the Hobby
// plan; bump the "maxDuration" number here if you're on Pro and still hit
// timeouts on a very large history.
export const config = { maxDuration: 60 };

// How many lap-detail requests to run at once. Kept modest — Strava's
// 15-minute rate limit is shared with the activity-list calls in this same
// run, and a big backfill can easily be 100+ swims, so we'd rather finish
// one batch safely and stop early than blow through the limit in a burst.
const LAP_FETCH_CONCURRENCY = 5;

async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  let stop = false;
  async function worker() {
    while (!stop && next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i, () => { stop = true; });
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results.filter(Boolean);
}

// GET /api/strava/sync
// Pulls the athlete's full activity history from Strava (paginated),
// filters to swims, and stores them. Safe to re-run any time — it's an
// upsert keyed by activity id, so nothing gets duplicated.
//
// For each swim it also fetches per-lap splits and stores them as `laps`
// ({ distance, pace } per lap) — see lib/strava.js getLapPaces for why this
// matters more than the whole-session average pace. That's one extra
// Strava call per swim, which on a big history can hit Strava's 15-minute
// rate limit in a single run. This is handled by:
//   - Skipping the lap fetch for any swim that already has laps stored
//     from a previous sync, so re-running only costs requests for genuinely
//     new activities.
//   - Watching Strava's rate-limit response headers and stopping cleanly
//     (not throwing) once usage gets close to the cap, or if a 429 slips
//     through anyway.
//   - Upserting whatever was processed before stopping, so a run that gets
//     cut short by the rate limit still keeps its progress — just run
//     "sincronizar" again in a few minutes to pick up where it left off.
//
// Requires the x-app-secret header (see lib/auth.js). This means you can no
// longer trigger a sync by just visiting the URL in a browser tab — use the
// "Sincronizar" button in the app (it now sends the header automatically),
// or call it manually with:
//   curl -H "x-app-secret: <tu secreto>" https://swimcoach-two.vercel.app/api/strava/sync
export default async function handler(req, res) {
  if (!requireAuth(req, res)) return;

  try {
    const token = await getValidAccessToken();

    // Activities that already have real lap data don't need to be re-fetched.
    const existing = await getSessions();
    const idsWithLaps = new Set(
      existing.filter((s) => Array.isArray(s.laps) && s.laps.length > 0).map((s) => s.id)
    );

    let page = 1;
    const perPage = 200;
    let totalSwimsFound = 0;
    let lapsFetched = 0;
    let fetched = 0;
    let lastMerged = existing;
    let rateLimited = false;

    outer: while (true) {
      const resp = await fetch(
        `https://www.strava.com/api/v3/athlete/activities?per_page=${perPage}&page=${page}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (resp.status === 429) {
        rateLimited = true;
        break;
      }
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Strava API ${resp.status}: ${text}`);
      }
      const batch = await resp.json();
      if (batch.length === 0) break;

      fetched += batch.length;
      const swims = batch.filter((a) => SWIM_TYPES.has(a.type || a.sport_type));

      const pageSessions = await mapWithConcurrency(swims, LAP_FETCH_CONCURRENCY, async (a, _i, stop) => {
        const session = activityToSession(a);
        if (idsWithLaps.has(session.id)) {
          // Already have laps for this one — keep them, don't spend a request.
          const prior = existing.find((s) => s.id === session.id);
          session.laps = prior?.laps || [];
          return session;
        }
        try {
          const { laps, rateLimitClose } = await getLapPaces(a.id, token);
          session.laps = laps;
          lapsFetched += 1;
          if (rateLimitClose) {
            rateLimited = true;
            stop();
          }
        } catch (e) {
          if (e instanceof StravaRateLimitError) {
            rateLimited = true;
            stop();
            return null; // drop this one, retry on the next run
          }
          session.laps = [];
        }
        return session;
      });
      totalSwimsFound += pageSessions.length;

      // Upsert whatever this batch produced — even if we're about to stop
      // for rate limiting, this much progress is saved.
      lastMerged = await upsertSessions(pageSessions);
      existing.push(...pageSessions.filter((s) => !existing.some((e) => e.id === s.id)));

      if (rateLimited) break outer;
      if (batch.length < perPage) break;
      page += 1;
      if (page > 30) break; // safety cap (~6000 activities)
    }

    res.status(200).json({
      ok: true,
      activities_scanned: fetched,
      swims_found: totalSwimsFound,
      laps_fetched: lapsFetched,
      total_stored: lastMerged.length,
      rate_limited: rateLimited,
      message: rateLimited
        ? "Límite de peticiones de Strava alcanzado — se guardó el progreso. Vuelve a pulsar sincronizar en unos minutos para completar el resto."
        : undefined,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
}
