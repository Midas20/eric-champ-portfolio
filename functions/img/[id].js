// GET /img/<id>  →  an uploaded image. Ids are random and never reused, so it caches for a year.
export async function onRequestGet({ env, params }) {
  const id = String(params.id || "");
  const hit = /^[a-f0-9]{16,64}$/.test(id) && env.PORTFOLIO ? await env.PORTFOLIO.getWithMetadata(`img:${id}`, "arrayBuffer") : null;
  if (!hit || !hit.value) return new Response("Not found", { status: 404, headers: { "content-type": "text/plain" } });
  return new Response(hit.value, {
    headers: {
      "content-type": (hit.metadata && hit.metadata.type) || "application/octet-stream",
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
    },
  });
}
