// GET /api/history  (key required)  →  list of saved previous versions, newest first
import { json, authorized } from "../../../lib/site.js";

export async function onRequestGet({ request, env }) {
  if (!(await authorized(request, env))) return json({ error: "The edit key was rejected." }, 401);
  if (!env.PORTFOLIO) return json([]);
  return json((await env.PORTFOLIO.get("revs", "json")) || []);
}
