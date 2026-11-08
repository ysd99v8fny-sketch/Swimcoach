import { getWellness, upsertWellness } from "../lib/wellness.js";
import { requireAuth } from "../lib/auth.js";

// GET  /api/wellness — días de recuperación guardados (VFC, sueño, FC reposo,
//                      Body Battery, disposición), más recientes primero.
// POST /api/wellness — { days: [...] } desde scripts/garmin_sync.py.
//
// Ambos métodos exigen la cabecera x-app-secret (ver lib/auth.js).
export default async function handler(req, res) {
  if (!requireAuth(req, res)) return;
  try {
    if (req.method === "GET") {
      res.status(200).json(await getWellness());
      return;
    }
    if (req.method === "POST") {
      const days = req.body?.days;
      if (!Array.isArray(days)) {
        res.status(400).json({ error: "Falta 'days' (array)." });
        return;
      }
      const stored = await upsertWellness(days);
      res.status(200).json({ ok: true, received: days.length, stored });
      return;
    }
    res.status(405).send("Method not allowed");
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
}
