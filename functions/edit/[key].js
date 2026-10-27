// GET /edit/<key>  →  the online editor. Any other key gets a plain 404.
// The editor reads the key from its own URL and sends it as a bearer token when saving.
import { keyValid } from "../../lib/site.js";

export async function onRequestGet({ request, env, params }) {
  if (!(await keyValid(env, String(params.key || "")))) {
    return new Response("Not found", { status: 404, headers: { "content-type": "text/plain" } });
  }
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
