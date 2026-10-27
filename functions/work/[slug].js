// GET /work/<slug>  →  one project's own page: the challenge, the approach, the architecture and the results
import { renderPage, slugify } from "../../lib/site.js";

export async function onRequestGet(ctx) {
  const { request, env, params } = ctx;
  const raw = decodeURIComponent(String(params.slug || ""));
  const slug = slugify(raw);
  if (slug !== raw) return Response.redirect(new URL(`/work/${slug}`, request.url).toString(), 301);
  return renderPage(env, request, { project: slug, waitUntil: ctx.waitUntil.bind(ctx) });
}
