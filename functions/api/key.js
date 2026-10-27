// POST /api/key  (current key required)  →  replaces the edit key with a new random one.
// The old link stops working at once. Returns the new key so the editor can show the new link.
import { json, authorized, rotateKey } from "../../lib/site.js";

export async function onRequestPost({ request, env }) {
  if (!(await authorized(request, env))) return json({ error: "The edit key was rejected." }, 401);
  if (!env.PORTFOLIO) return json({ error: "Storage is not connected." }, 503);
  return json({ key: await rotateKey(env) });
}
