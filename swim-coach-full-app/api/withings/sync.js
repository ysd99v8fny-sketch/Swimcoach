import { getValidAccessToken } from "../../lib/withings.js";

// GET /api/withings/sync — debug ampliado
export default async function handler(req, res) {
  try {
    const accessToken = await getValidAccessToken();
    const now = Math.floor(Date.now() / 1000);

    const wRes = await fetch("https://wbsapi.withings.net/measure", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Bearer ${accessToken}`,
      },
      body: new URLSearchParams({
        action: "getmeas",
        category: "1",
        startdate: String(now - 86400),
        enddate: String(now + 3600),
      }),
    });

    const data = await wRes.json();
    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
}
