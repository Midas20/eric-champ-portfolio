// GET /admin  →  the editor, behind its sign-in screen (password, or the edit key).
export async function onRequestGet({ request, env }) {
  const page = await env.ASSETS.fetch(new URL("/editor", request.url));
  return new Response(page.body, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow",
      "referrer-policy": "no-referrer",
    },
  });
}
