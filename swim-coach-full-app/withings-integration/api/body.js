import { getStoredBodyMetrics } from "../lib/withings.js";

// GET /api/body
// Devuelve el último snapshot de composición corporal guardado (sin volver
// a llamar a Withings). La app lo usa para pintar peso/altura/%grasa/
// %músculo/%agua en la interfaz. Para forzar una actualización real desde
// la báscula, usa /api/withings/sync.
export default async function handler(req, res) {
  try {
    const metrics = await getStoredBodyMetrics();
    res.status(200).json({ ok: true, metrics });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
}
