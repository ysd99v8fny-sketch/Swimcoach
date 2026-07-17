// Shared-secret gate for endpoints that read/write your training data or
// spend your Anthropic API credits.
//
// This repo is public on GitHub, so the real secret can never be committed
// here — it only compares against the APP_SECRET environment variable you
// set in Vercel (Project Settings → Environment Variables). The frontend
// asks you for it once and remembers it in this browser's localStorage.
export function requireAuth(req, res) {
  const expected = process.env.APP_SECRET;
  if (!expected) {
    // Fail closed: if the env var is missing, treat every request as
    // unauthorized instead of silently leaving the endpoint open.
    res.status(500).json({ error: "APP_SECRET no configurado en el servidor." });
    return false;
  }
  const provided = req.headers["x-app-secret"];
  if (provided !== expected) {
    res.status(401).json({ error: "No autorizado." });
    return false;
  }
  return true;
}
