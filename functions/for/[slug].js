// GET /for/<slug>  →  a tailored version of the page from a Focus preset, e.g. /for/ai
// Meant for sharing with one company, so it is kept out of search results (noindex).
import { renderPage, slugify } from "../../lib/site.js";

export async function onRequestGet(ctx) {
  const { request, env, params } = ctx;
  const raw = decodeURIComponent(String(params.slug || ""));
  const slug = slugify(raw);
  if (slug !== raw) return Response.redirect(new URL(`/for/${slug}`, request.url).toString(), 301);
  return renderPage(env, request, { focus: slug, waitUntil: ctx.waitUntil.bind(ctx) });
}
