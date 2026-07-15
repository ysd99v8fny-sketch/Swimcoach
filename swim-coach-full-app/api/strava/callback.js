import { saveInitialTokens } from "../../lib/strava.js";

// GET /api/strava/callback?code=...
// Strava redirects here after Anton approves access. Exchanges the one-time
// code for an access + refresh token pair and stores them in KV.
export default async function handler(req, res) {
  const { code, error } = req.query;

  if (error) {
    res.status(400).send(`Strava devolvió un error: ${error}`);
    return;
  }
  if (!code) {
    res.status(400).send("Falta el parámetro 'code'.");
    return;
  }

  try {
    const tokenRes = await fetch("https://www.strava.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: process.env.STRAVA_CLIENT_ID,
        client_secret: process.env.STRAVA_CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      res.status(500).send(`Fallo al intercambiar el código: ${text}`);
      return;
    }

    const tokenData = await tokenRes.json();
    await saveInitialTokens(tokenData);

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(`
      <html><body style="font-family: sans-serif; background:#0B1F2E; color:#EAF2F2; padding:40px;">
        <h2>✅ Strava conectado</h2>
        <p>Cuenta: ${tokenData.athlete?.firstname || ""} ${tokenData.athlete?.lastname || ""}</p>
        <p>Ya puedes cerrar esta pestaña. Ahora ejecuta una sincronización inicial visitando
        <code>/api/strava/sync</code>, y registra el webhook siguiendo el README.</p>
      </body></html>
    `);
  } catch (e) {
    res.status(500).send(`Error inesperado: ${e.message}`);
  }
}
