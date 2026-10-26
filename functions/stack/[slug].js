// GET /stack/<slug>  →  projects built with that stack, e.g. /stack/rust, /stack/next-js
// Unknown slugs still render the page (with a 404 status) so the visitor can pick another stack.
import { renderPage, slugify } from "../../lib/site.js";

export async function onRequestGet({ request, env, params }) {
  const raw = decodeURIComponent(String(params.slug || ""));
  const slug = slugify(raw);
  if (slug !== raw) {
    // normalise /stack/Next.js → /stack/next-js
    return Response.redirect(new URL(`/stack/${slug}`, request.url).toString(), 301);
  }
  return renderPage(env, request, slug);
}
