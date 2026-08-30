import { getValidAccessToken } from "../../lib/withings.js";

// GET /api/withings/sync?debug=1
// Versión temporal de depuración: muestra la respuesta cruda de Withings
// tal cual, sin procesar, para ver qué tipos de medida llegan de verdad.
export default async function handler(req, res) {
  try {
    const accessToken = await getValidAccessToken();

    const wRes = await fetch("https://wbsapi.withings.net/measure", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Bearer ${accessToken}`,
      },
      body: new URLSearchParams({
        action: "getmeas",
        meastypes: "1,4,6,76,77",
        category: "1",
      }),
    });

    const data = await wRes.json();
    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
}
