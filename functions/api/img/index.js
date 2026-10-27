// POST /api/img  (key required)  body: the image bytes  →  { id, url }   stored in KV as img:<id>
// GET  /api/img  (key required)  →  every uploaded image, so the editor can clean up unused ones
import { json, authorized, IMG_MAX_BYTES, IMG_TYPES } from "../../../lib/site.js";

export async function onRequestPost({ request, env }) {
  if (!(await authorized(request, env))) return json({ error: "The edit key was rejected." }, 401);
  if (!env.PORTFOLIO) return json({ error: "Storage is not connected." }, 503);
  const type = (request.headers.get("content-type") || "").split(";")[0].trim();
  if (!IMG_TYPES.includes(type)) return json({ error: "Upload a WebP, JPEG, PNG, GIF or AVIF image." }, 415);
  const body = await request.arrayBuffer();
  if (!body.byteLength) return json({ error: "The image is empty." }, 400);
  if (body.byteLength > IMG_MAX_BYTES) return json({ error: `Images must be under ${IMG_MAX_BYTES / 1e6} MB.` }, 413);
  const id = [...crypto.getRandomValues(new Uint8Array(12))].map((b) => b.toString(16).padStart(2, "0")).join("");
  await env.PORTFOLIO.put(`img:${id}`, body, { metadata: { type, size: body.byteLength, at: new Date().toISOString() } });
  return json({ id, url: `/img/${id}` });
}

export async function onRequestGet({ request, env }) {
  if (!(await authorized(request, env))) return json({ error: "The edit key was rejected." }, 401);
  if (!env.PORTFOLIO) return json([]);
  const out = [];
  let cursor;
  do {
    const page = await env.PORTFOLIO.list({ prefix: "img:", cursor });
    page.keys.forEach((k) => out.push({ id: k.name.slice(4), url: `/img/${k.name.slice(4)}`, ...(k.metadata || {}) }));
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return json(out);
}
