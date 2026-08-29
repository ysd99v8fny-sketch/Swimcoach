import { fetchLatestBodyMetrics } from "../../lib/withings.js";

// GET /api/withings/sync
// Pide a Withings el pesaje más reciente (peso, altura, % grasa, % músculo,
// % agua) y lo guarda en Redis. Visítala cuando quieras forzar una
// actualización manual — también puedes llamarla desde un botón en la app,
// igual que "sincronizar Strava".
export default async function handler(req, res) {
  try {
    const metrics = await fetchLatestBodyMetrics();
    if (!metrics) {
      res.status(200).json({ ok: true, message: "Sin mediciones nuevas en Withings.", metrics: null });
      return;
    }
    res.status(200).json({ ok: true, metrics });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
}
