// POST /api/logout  (session token)  →  ends that session
import { json, signOut } from "../../lib/site.js";

export async function onRequestPost({ request, env }) {
  const h = request.headers.get("authorization") || "";
  await signOut(env, h.startsWith("Bearer ") ? h.slice(7) : "");
  return json({ ok: true });
}
