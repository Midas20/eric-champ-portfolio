// GET /sitemap.xml  →  home, every project page, /stack, and one URL per stack, generated from the live data
import { loadSite, stackIndex, slugify } from "../lib/site.js";

export async function onRequestGet({ request, env }) {
  const S = await loadSite(env, request);
  const origin = new URL(request.url).origin;
  const work = S ? ((S.work && S.work.projects) || []).filter((p) => p && !p.hidden).map((p) => `/work/${slugify(p.slug || p.title)}`) : [];
  const urls = ["/", ...work, "/stack", ...(S ? [...stackIndex(S).keys()].sort().map((s) => `/stack/${s}`) : [])];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${origin}${u}</loc></url>`).join("\n")}\n</urlset>\n`;
  return new Response(xml, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=300" } });
}
