// GET    /api/password  (signed in)  →  { set }
// POST   /api/password  (signed in)  { password }  →  sets it, signs out every device, returns a fresh { token }
// DELETE /api/password  (signed in)  →  removes it; /admin then accepts only the edit key
import { json, authorized, passwordSet, setPassword, clearPassword, endAllSessions, newSession, PW_MIN } from "../../lib/site.js";

export async function onRequestGet({ request, env }) {
  if (!(await authorized(request, env))) return json({ error: "Not signed in." }, 401);
  return json({ set: await passwordSet(env), min: PW_MIN });
}

export async function onRequestPost({ request, env }) {
  if (!(await authorized(request, env))) return json({ error: "Not signed in." }, 401);
  if (!env.PORTFOLIO) return json({ error: "Storage is not connected." }, 503);
  const { password } = await request.json().catch(() => ({}));
  if (typeof password !== "string" || password.length < PW_MIN) return json({ error: `Use at least ${PW_MIN} characters.` }, 422);
  if (password.length > 200) return json({ error: "That password is too long." }, 422);
  await setPassword(env, password);
  await endAllSessions(env);
  return json({ ok: true, token: await newSession(env) });
}

export async function onRequestDelete({ request, env }) {
  if (!(await authorized(request, env))) return json({ error: "Not signed in." }, 401);
  await clearPassword(env);
  await endAllSessions(env);
  return json({ ok: true });
}
