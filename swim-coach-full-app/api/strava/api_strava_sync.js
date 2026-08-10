import { getValidAccessToken, activityToSession, getActivityDetail, SWIM_TYPES } from "../../lib/strava.js";
import { getSessions, upsertSessions } from "../../lib/sessions.js";

// GET /api/strava/sync
// Pulls the athlete's full activity history from Strava (paginated),
// filters to swims, and stores them. Safe to re-run any time — it's an
// upsert keyed by activity id, so nothing gets duplicated.
//
// The bulk list endpoint (/athlete/activities) only returns summary data —
// no laps — so pool-swim "series" (8x100 etc.) aren't available from it.
// To get those we need a second call per activity to the detail endpoint,
// which does include laps. To keep a routine re-sync cheap and stay under
// Strava's rate limit, that second call is only made for:
//   - pool swims (open water rarely has meaningful wall-turn laps)
//   - activities that don't already have series stored from a past sync
// and capped per run — run sync again to pick up any it didn't get to.
const MAX_LAP_FETCHES_PER_RUN = 90;

export default async function handler(req, res) {
  try {
    const token = await getValidAccessToken();
    let page = 1;
    const perPage = 200;
    let allSwims = [];
    let fetched = 0;

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
      allSwims.push(...swims.map(activityToSession));

      if (batch.length < perPage) break;
      page += 1;
      if (page > 30) break; // safety cap (~6000 activities)
    }

    const existing = await getSessions();
    const existingById = new Map(existing.map((s) => [s.id, s]));
    let seriesFetched = 0;

    for (const session of allSwims) {
      const prev = existingById.get(session.id);
      if (prev && prev.series) {
        session.series = prev.series; // already enriched from a previous sync
        continue;
      }
      if (session.location !== "piscina") continue; // no meaningful laps without wall turns
      if (seriesFetched >= MAX_LAP_FETCHES_PER_RUN) continue;

      try {
        const detail = await getActivityDetail(token, session.id);
        const enriched = activityToSession(detail);
        if (enriched.series) session.series = enriched.series;
        seriesFetched += 1;
      } catch (e) {
        console.error(`No se pudieron obtener las series de la actividad ${session.id}:`, e.message);
      }
    }

    const merged = await upsertSessions(allSwims);

    res.status(200).json({
      ok: true,
      activities_scanned: fetched,
      swims_found: allSwims.length,
      series_fetched_this_run: seriesFetched,
      total_stored: merged.length,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
}
