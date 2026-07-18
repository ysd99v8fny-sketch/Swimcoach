import { getSessions } from "../lib/sessions.js";
import { SYSTEM_CONTEXT, nextRace, daysBetween, getRaceConditions } from "../lib/context.js";
import { requireAuth } from "../lib/auth.js";

// POST /api/coach   body: { messages: [{role, content}, ...] }
// Keeps the Anthropic API key server-side — the frontend never sees it.
//
// Requires the x-app-secret header (see lib/auth.js) — without it, this
// endpoint is an open proxy to your paid Anthropic API key.
export default async function handler(req, res) {
  if (!requireAuth(req, res)) return;

  if (req.method !== "POST") {
    res.status(405).send("Method not allowed");
    return;
  }

  const { messages } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "Falta 'messages'." });
    return;
  }

  try {
    const sessions = await getSessions();
    const recentSummary =
      sessions.length === 0
        ? "Sin sesiones registradas todavía."
        : sessions
            .slice(0, 6)
            .map(
              (s) =>
                `${s.date}: ${s.distance}m${s.pace ? `, ritmo ${s.pace}/100m` : ""}${s.hr ? `, FC media ${s.hr}` : ""}${s.notation ? `, [${s.notation}]` : ""}`
            )
            .join("\n");

    const today = new Date();
    const race = nextRace(today);
    const daysLeft = daysBetween(today, race.date);
    // Only Getaria has coordinates wired up (see lib/context.js), and
    // Open-Meteo only forecasts ~16 days out — getRaceConditions returns
    // null outside that window or if the fetch fails, so this is always
    // safe to just append (or omit) below.
    const conditions = race.id === "gz" ? await getRaceConditions(race.date, daysLeft) : null;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        // NOTE: the previous value here was "claude-sonnet-4-6", which is not
        // a real Anthropic model id — that alone may have been causing every
        // chat request to fail regardless of the billing issue. Current
        // model id as of mid-2026 is "claude-sonnet-5"; update this if
        // Anthropic ships a newer one you'd rather use.
        model: "claude-sonnet-5",
        max_tokens: 1000,
        system: `${SYSTEM_CONTEXT}\n\nÚltimas sesiones registradas:\n${recentSummary}\n\nHoy es ${today.toLocaleDateString("es-ES")}. Quedan ${daysLeft} días para ${race.name} (${race.distance}m).${conditions ? `\n\n${conditions}` : ""}`,
        messages,
      }),
    });

    const data = await response.json();
    if (data.error) {
      res.status(500).json({ error: data.error.message || "Error de la API de Anthropic." });
      return;
    }

    const text = data.content?.filter((c) => c.type === "text").map((c) => c.text).join("\n") || "";
    res.status(200).json({ text });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
