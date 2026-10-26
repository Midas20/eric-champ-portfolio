// GET /robots.txt  →  keep the editor out of search engines, point crawlers at the sitemap
export function onRequestGet({ request }) {
  const origin = new URL(request.url).origin;
  const body = `User-agent: *\nDisallow: /edit/\nDisallow: /editor\nDisallow: /api/\n\nSitemap: ${origin}/sitemap.xml\n`;
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8" } });
}
