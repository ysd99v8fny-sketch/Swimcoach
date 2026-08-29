import { saveInitialTokens } from "../../lib/withings.js";

// GET /api/withings/callback?code=...
// Withings redirige aquí después de que Anton apruebe el acceso. Intercambia
// el código de un solo uso por un par access + refresh token y los guarda.
export default async function handler(req, res) {
  const { code, error } = req.query;

  if (error) {
    res.status(400).send(`Withings devolvió un error: ${error}`);
    return;
  }
  if (!code) {
    res.status(400).send("Falta el parámetro 'code'.");
    return;
  }

  try {
    const redirectUri = `https://${req.headers.host}/api/withings/callback`;
    const tokenRes = await fetch("https://wbsapi.withings.net/v2/oauth2", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        action: "requesttoken",
        client_id: process.env.WITHINGS_CLIENT_ID,
        client_secret: process.env.WITHINGS_CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || tokenData.status !== 0) {
      res.status(500).send(`Fallo al intercambiar el código: ${JSON.stringify(tokenData)}`);
      return;
    }

    await saveInitialTokens(tokenData.body);

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(`
      <html><body style="font-family: sans-serif; background:#0B1F2E; color:#EAF2F2; padding:40px;">
        <h2>✅ Withings conectado</h2>
        <p>Ya puedes cerrar esta pestaña. Ahora visita
        <code>/api/withings/sync</code> para traer tu último pesaje.</p>
      </body></html>
    `);
  } catch (e) {
    res.status(500).send(`Error inesperado: ${e.message}`);
  }
}
