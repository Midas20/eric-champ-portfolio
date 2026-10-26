// GET /edit/<ADMIN_KEY>  →  the online editor. Any other key gets a plain 404.
// The editor reads the key from its own URL and sends it as a bearer token when saving.
export async function onRequestGet({ request, env, params }) {
  const key = env.ADMIN_KEY || "";
  const given = String(params.key || "");
  let ok = key.length > 0 && given.length === key.length;
  if (ok) { let d = 0; for (let i = 0; i < key.length; i++) d |= key.charCodeAt(i) ^ given.charCodeAt(i); ok = d === 0; }
  if (!ok) return new Response("Not found", { status: 404, headers: { "content-type": "text/plain" } });

  const page = await env.ASSETS.fetch(new URL("/editor", request.url));
  return new Response(page.body, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow",
      "referrer-policy": "no-referrer",
    },
  });
}
