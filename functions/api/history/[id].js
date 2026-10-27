// GET /api/history/<id>  (key required)  →  one previous version, to load back into the editor
import { json, authorized } from "../../../lib/site.js";

export async function onRequestGet({ request, env, params }) {
  if (!(await authorized(request, env))) return json({ error: "The edit key was rejected." }, 401);
  if (!env.PORTFOLIO) return json({ error: "Storage is not connected." }, 503);
  const id = String(params.id || "");
  if (!/^[0-9TZ-]+$/.test(id)) return json({ error: "Unknown version." }, 404);
  const doc = await env.PORTFOLIO.get(`rev:${id}`, "json");
  return doc ? json(doc) : json({ error: "That version no longer exists." }, 404);
}
