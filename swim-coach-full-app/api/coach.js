import { getSessions } from "../lib/sessions.js";
import { SYSTEM_CONTEXT, nextRace, daysBetween } from "../lib/context.js";

// POST /api/coach   body: { messages: [{role, content}, ...] }
// Keeps the Anthropic API key server-side — the frontend never sees it.
export default async function handler(req, res) {
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

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        system: `${SYSTEM_CONTEXT}\n\nÚltimas sesiones registradas:\n${recentSummary}\n\nHoy es ${today.toLocaleDateString("es-ES")}. Quedan ${daysLeft} días para ${race.name} (${race.distance}m).`,
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
