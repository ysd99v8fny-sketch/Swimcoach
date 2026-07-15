// GET /api/strava/auth
// Redirects Anton to Strava's consent screen. Visit this URL once, in a
// browser, to connect (or reconnect) the app to your Strava account.
export default function handler(req, res) {
  const redirectUri = `https://${req.headers.host}/api/strava/callback`;
  const params = new URLSearchParams({
    client_id: process.env.STRAVA_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    approval_prompt: "auto",
    scope: "read,activity:read_all",
  });
  res.writeHead(302, { Location: `https://www.strava.com/oauth/authorize?${params.toString()}` });
  res.end();
}
