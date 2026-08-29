// GET /api/withings/auth
// Redirige a Anton a la pantalla de consentimiento de Withings. Visita esta
// URL una vez, en un navegador, para conectar (o reconectar) la app a tu
// cuenta de Withings.
export default function handler(req, res) {
  const redirectUri = `https://${req.headers.host}/api/withings/callback`;
  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.WITHINGS_CLIENT_ID,
    redirect_uri: redirectUri,
    scope: "user.metrics",
    state: "swimcoach", // Withings lo exige, no necesitamos validarlo al no haber multi-usuario
  });
  res.writeHead(302, {
    Location: `https://account.withings.com/oauth2_user/authorize2?${params.toString()}`,
  });
  res.end();
}
