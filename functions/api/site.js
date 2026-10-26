// GET /api/site   public: the current document
// PUT /api/site   needs "Authorization: Bearer <ADMIN_KEY>": validates, keeps the previous version, saves
import { json, loadSite, authorized, validate, MAX_BYTES, MAX_REVISIONS } from "../../lib/site.js";

export async function onRequestGet({ request, env }) {
  const S = await loadSite(env, request);
  return S ? json(S, 200, { "cache-control": "no-cache" }) : json({ error: "No site data found." }, 500);
}

export async function onRequestPut({ request, env }) {
  if (!authorized(request, env)) return json({ error: "The edit key was rejected." }, 401);
  if (!env.PORTFOLIO) return json({ error: "Storage is not connected. Bind a KV namespace named PORTFOLIO to this Pages project." }, 503);

  const body = await request.text();
  if (body.length > MAX_BYTES) return json({ error: `The document is larger than ${MAX_BYTES / 1000} KB.` }, 413);
  let S;
  try { S = JSON.parse(body); } catch (e) { return json({ error: `Invalid JSON: ${e.message}` }, 400); }
  const problem = validate(S);
  if (problem) return json({ error: problem }, 422);

  // keep the version being replaced, newest first, capped
  const previous = await env.PORTFOLIO.get("site");
  const revs = (await env.PORTFOLIO.get("revs", "json")) || [];
  if (previous) {
    const id = new Date().toISOString().replace(/[:.]/g, "-");
    await env.PORTFOLIO.put(`rev:${id}`, previous);
    revs.unshift({ id, at: new Date().toISOString(), bytes: previous.length });
    for (const old of revs.splice(MAX_REVISIONS)) await env.PORTFOLIO.delete(`rev:${old.id}`);
    await env.PORTFOLIO.put("revs", JSON.stringify(revs));
  }
  await env.PORTFOLIO.put("site", JSON.stringify(S));
  return json({ ok: true, savedAt: new Date().toISOString(), revisions: revs.length });
}
