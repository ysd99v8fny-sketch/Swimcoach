import { getValidAccessToken, activityToSession, getLapPaces, SWIM_TYPES } from "../../lib/strava.js";
import { upsertSessions } from "../../lib/sessions.js";

// GET  /api/strava/webhook  — Strava's one-time subscription handshake.
// POST /api/strava/webhook  — fired every time an activity is created/updated.
export default async function handler(req, res) {
  if (req.method === "GET") {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === process.env.STRAVA_WEBHOOK_VERIFY_TOKEN) {
      res.status(200).json({ "hub.challenge": challenge });
    } else {
      res.status(403).send("Verify token inválido.");
    }
    return;
  }

  if (req.method === "POST") {
    // Acknowledge immediately — Strava expects a fast 200, process after.
    res.status(200).json({ received: true });

    try {
      const event = req.body;
      if (event.object_type !== "activity") return;
      if (event.aspect_type === "delete") return; // not handling deletions here

      const accessToken = await getValidAccessToken();
      const detailRes = await fetch(`https://www.strava.com/api/v3/activities/${event.object_id}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!detailRes.ok) return;

      const activity = await detailRes.json();
      if (!SWIM_TYPES.has(activity.type || activity.sport_type)) return;

      const session = activityToSession(activity);
      // Per-lap paces, not just the whole-session average — see the comment
      // on getLapPaces for why this matters for calibratePaceTargets. One
      // activity per webhook call, so rate limiting here is a non-issue —
      // just fall back to no lap data if anything goes wrong.
      try {
        const { paces } = await getLapPaces(event.object_id, accessToken);
        session.lapPaces = paces;
      } catch (e) {
        session.lapPaces = [];
      }

      await upsertSessions([session]);
    } catch (e) {
      // Already responded 200 to Strava; just log for the Vercel function logs.
      console.error("Webhook processing error:", e);
    }
    return;
  }

  res.status(405).send("Method not allowed");
}
