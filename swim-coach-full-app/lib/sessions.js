import { Redis } from "@upstash/redis";

const kv = Redis.fromEnv();

const SESSIONS_KEY = "sessions:all";

export async function getSessions() {
  const sessions = await kv.get(SESSIONS_KEY);
  return sessions || [];
}

/** Merge new sessions into storage, de-duplicated by id, newest first. */
export async function upsertSessions(newSessions) {
  const existing = await getSessions();
  const byId = new Map(existing.map((s) => [s.id, s]));
  newSessions.forEach((s) => byId.set(s.id, { ...byId.get(s.id), ...s }));
  const merged = Array.from(byId.values()).sort((a, b) => (a.date < b.date ? 1 : -1));
  await kv.set(SESSIONS_KEY, merged);
  return merged;
}

/** For manually-logged dry-land sessions or corrections from the UI. */
export async function addManualSession(session) {
  return upsertSessions([session]);
}

/** Remove a session by id (used to clear a "planned" proposal once the real Strava data arrives). */
export async function deleteSession(id) {
  const existing = await getSessions();
  const filtered = existing.filter((s) => s.id !== id);
  await kv.set(SESSIONS_KEY, filtered);
  return filtered;
}
