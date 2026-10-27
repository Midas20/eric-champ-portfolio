// DELETE /api/img/<id>  (key required)  →  removes an uploaded image
import { json, authorized } from "../../../lib/site.js";

export async function onRequestDelete({ request, env, params }) {
  if (!(await authorized(request, env))) return json({ error: "The edit key was rejected." }, 401);
  const id = String(params.id || "");
  if (!/^[a-f0-9]{16,64}$/.test(id)) return json({ error: "Unknown image." }, 404);
  if (env.PORTFOLIO) await env.PORTFOLIO.delete(`img:${id}`);
  return json({ ok: true });
}
