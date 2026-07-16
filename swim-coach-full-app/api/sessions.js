import { getSessions, addManualSession, deleteSession } from "../lib/sessions.js";

// GET    /api/sessions        — list all stored sessions (newest first)
// POST   /api/sessions        — add/update a session manually (e.g. planned workout, dry-land work)
// DELETE /api/sessions        — remove a session by id (e.g. a fulfilled "planned" proposal)
export default async function handler(req, res) {
  if (req.method === "GET") {
    const sessions = await getSessions();
    res.status(200).json(sessions);
    return;
  }

  if (req.method === "POST") {
    const body = req.body || {};
    if (!body.date) {
      res.status(400).json({ error: "Falta 'date'." });
      return;
    }
    const session = {
      id: body.id || `manual-${Date.now()}`,
      type: body.type || "agua",
      date: body.date,
      distance: Number(body.distance) || 0,
      pace: body.pace || "",
      hr: body.hr || "",
      notation: body.notation || "",
      notes: body.notes || "",
      planned: !!body.planned,
    };
    const sessions = await addManualSession(session);
    res.status(200).json(sessions);
    return;
  }

  if (req.method === "DELETE") {
    const id = req.body?.id || req.query?.id;
    if (!id) {
      res.status(400).json({ error: "Falta 'id'." });
      return;
    }
    const sessions = await deleteSession(id);
    res.status(200).json(sessions);
    return;
  }

  res.status(405).send("Method not allowed");
}
