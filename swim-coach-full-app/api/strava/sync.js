import { getValidAccessToken, activityToSession, getLapPaces, SWIM_TYPES } from "../../lib/strava.js";
import { upsertSessions } from "../../lib/sessions.js";
import { requireAuth } from "../../lib/auth.js";

// Give this function more room than Vercel's 10s default — fetching lap
// splits means one extra Strava call per swim, and a full-history backfill
// can be 100+ activities. 60s is the ceiling Vercel allows on the Hobby
// plan; bump the "maxDuration" number here if you're on Pro and still hit
// timeouts on a very large history.
export const config = { maxDuration: 60 };

// How many lap-detail requests to run at once. Strava's rate limit is
// generous (100 req/15min short-term as of 2026), so a small batch of
// concurrent requests is safe and cuts backfill time roughly 8x versus doing
// them one at a time.
const LAP_FETCH_CONCURRENCY = 8;

async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// GET /api/strava/sync
// Pulls the athlete's full activity history from Strava (paginated),
// filters to swims, and stores them. Safe to re-run any time — it's an
// upsert keyed by activity id, so nothing gets duplicated.
//
// For each swim it also fetches per-lap splits and stores them as
// `lapPaces` (seconds/100m per lap). A session's overall average pace
// blends warm-up + main set + cool-down into one number that doesn't match
// any real training zone; lap-level paces are what the zone calibration in
// the app (calibratePaceTargets) actually needs to be accurate. Sessions
// are upserted in small batches as they're processed (not just once at the
// very end) so a run that hits the time limit still keeps whatever it
// managed to process instead of losing everything.
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
    let page = 1;
    const perPage = 200;
    let totalSwimsFound = 0;
    let fetched = 0;
    let lastMerged = [];

    while (true) {
      const resp = await fetch(
        `https://www.strava.com/api/v3/athlete/activities?per_page=${perPage}&page=${page}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Strava API ${resp.status}: ${text}`);
      }
      const batch = await resp.json();
      if (batch.length === 0) break;

      fetched += batch.length;
      const swims = batch.filter((a) => SWIM_TYPES.has(a.type || a.sport_type));

      const pageSessions = await mapWithConcurrency(swims, LAP_FETCH_CONCURRENCY, async (a) => {
        const session = activityToSession(a);
        try {
          session.lapPaces = await getLapPaces(a.id, token);
        } catch (e) {
          session.lapPaces = [];
        }
        return session;
      });
      totalSwimsFound += pageSessions.length;

      // Upsert after every page (not just at the end) so partial progress
      // survives if a later page runs out of time.
      lastMerged = await upsertSessions(pageSessions);

      if (batch.length < perPage) break;
      page += 1;
      if (page > 30) break; // safety cap (~6000 activities)
    }

    res.status(200).json({
      ok: true,
      activities_scanned: fetched,
      swims_found: totalSwimsFound,
      total_stored: lastMerged.length,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
}
