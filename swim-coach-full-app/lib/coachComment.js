import { SYSTEM_CONTEXT } from "./context.js";

// ---- Automatic coach comment for newly synced sessions ---------------------
// Every time a genuinely new session lands from Strava (manual "sincronizar"
// or the real-time webhook), this asks Claude for a short, personal take on
// that specific swim -- reusing the same coach voice/context as the chat --
// and the caller stores the result alongside the session so it shows up in
// the training log without Anton having to ask for it.
//
// Deliberately scoped to brand-new sessions only (see the callers in
// api/strava/sync.js and api/strava/webhook.js) -- generating this
// retroactively for the whole history would mean one paid Anthropic API call
// per past session, which nobody asked for.
//
// Never throws: any failure (missing key, network, bad response) just means
// no comment gets attached, and the session still saves normally.
export async function generateCoachComment(session, recentSessions = []) {
  if (!process.env.ANTHROPIC_API_KEY) return null;

  try {
    const recentSummary = recentSessions
      .filter((s) => s.id !== session.id)
      .slice(0, 5)
      .map((s) => `${s.date}: ${s.distance}m${s.pace ? `, ritmo ${s.pace}/100m` : ""}`)
      .join("\n") || "Sin sesiones previas registradas.";

    const sessionLine = `${session.date}: ${session.distance}m en ${session.location === "abiertas" ? "aguas abiertas" : "piscina"}${session.pace ? `, ritmo medio ${session.pace}/100m` : ""}${session.hr ? `, FC media ${session.hr}` : ""}${session.notes ? ` — "${session.notes}"` : ""}`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 200,
        system: `${SYSTEM_CONTEXT}\n\nAcaba de sincronizarse esta sesión nueva desde Strava. Escribe un comentario breve (2-3 frases como mucho) sobre ella, como una nota de entrenador al margen de un cuaderno: directo, cercano, sin repetir literalmente los números que ya se ven en la app (fecha, distancia, ritmo). Si detectas algo destacable (progreso, señal de fatiga, ritmo fuera de lo normal) coméntalo; si es una sesión normal, un apunte breve de ánimo o contexto de temporada basta. No hagas preguntas ni pidas más datos — es una nota unidireccional, nadie va a responder.`,
        messages: [
          {
            role: "user",
            content: `Sesiones recientes previas:\n${recentSummary}\n\nSesión nueva a comentar:\n${sessionLine}`,
          },
        ],
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    if (data.error) return null;
    const text = data.content
      ?.filter((c) => c.type === "text")
      .map((c) => c.text)
      .join("\n")
      .trim();
    return text || null;
  } catch (e) {
    return null;
  }
}
