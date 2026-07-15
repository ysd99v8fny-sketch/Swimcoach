import { getValidAccessToken, activityToSession, SWIM_TYPES } from "../../lib/strava.js";
import { upsertSessions } from "../../lib/sessions.js";

// GET /api/strava/sync
// Pulls the athlete's full activity history from Strava (paginated),
// filters to swims, and stores them. Safe to re-run any time — it's an
// upsert keyed by activity id, so nothing gets duplicated.
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

    const merged = await upsertSessions(allSwims);

    res.status(200).json({
      ok: true,
      activities_scanned: fetched,
      swims_found: allSwims.length,
      total_stored: merged.length,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
}
