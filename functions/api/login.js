// POST /api/login  { password }  →  { token } for 7 days. Failed attempts are limited per IP.
import { json, signIn, loginBlocked, passwordSet } from "../../lib/site.js";

export async function onRequestPost({ request, env }) {
  if (!env.PORTFOLIO) return json({ error: "Storage is not connected." }, 503);
  if (await loginBlocked(env, request)) return json({ error: "Too many attempts. Wait 15 minutes and try again." }, 429);
  if (!(await passwordSet(env))) return json({ error: "No password is set yet.", noPassword: true }, 409);
  const body = await request.json().catch(() => ({}));
  const token = await signIn(env, request, body.password);
  return token ? json({ token }) : json({ error: "Wrong password." }, 401);
}
