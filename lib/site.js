// Shared helpers for the Pages Functions.
// KV binding: PORTFOLIO   keys: "site" (current), "rev:<id>" (previous versions), "revs" (index)
// Secret:     ADMIN_KEY   the key in your private edit URL, /edit/<ADMIN_KEY>

export const MAX_BYTES = 1_000_000;
export const MAX_REVISIONS = 30;
const REQUIRED = ["meta", "config", "nav", "hero", "pipeline", "work", "references", "experience", "skills", "about", "contact", "footer"];

/* identical to slugify() in public/main.js */
export const slugify = (s) => String(s).toLowerCase()
  .replace(/\+/g, "-plus").replace(/#/g, "-sharp")
  .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra } });

const escHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const LS = String.fromCharCode(0x2028), PS = String.fromCharCode(0x2029);
const safeJson = (o) => JSON.stringify(o).replace(/</g, "\\u003c").split(LS).join("\\u2028").split(PS).join("\\u2029");

/* the bundled public/site.json is the fallback until the first save */
export async function loadSite(env, request) {
  if (env.PORTFOLIO) {
    const s = await env.PORTFOLIO.get("site", "json");
    if (s) return s;
  }
  const r = await env.ASSETS.fetch(new URL("/site.json", request.url));
  return r.ok ? r.json() : null;
}

export function stackIndex(S) {
  const map = new Map();
  const add = (name, project) => {
    const slug = slugify(name);
    if (!slug) return;
    if (!map.has(slug)) map.set(slug, { slug, name, projects: [] });
    if (project) map.get(slug).projects.push(project.title);
  };
  ((S.work && S.work.projects) || []).forEach((p) => (p.tags || []).forEach((t) => add(t, p)));
  ((S.skills && S.skills.groups) || []).forEach((g) => (g.items || []).forEach((t) => add(t)));
  return map;
}

/* repositories you own on GitHub (forks excluded), counted from the GitHub API.
   Pages answer from the count kept in KV; when it is over an hour old it is refreshed in the background,
   so no page view waits on GitHub after the first one. */
const COUNT_TTL_MS = 3600 * 1000;

async function fetchRepoCount(user) {
  let n = 0;
  for (let page = 1; page <= 10; page++) {
    const r = await fetch(`https://api.github.com/users/${user}/repos?type=owner&per_page=100&page=${page}`, {
      headers: { "user-agent": "portfolio-site", accept: "application/vnd.github+json" },
      cf: { cacheTtl: 3600, cacheEverything: true },
    });
    if (!r.ok) throw new Error(`GitHub ${r.status}`);
    const list = await r.json();
    n += list.filter((x) => !x.fork).length;
    if (list.length < 100) break;
  }
  return n;
}

export async function githubRepoCount(env, S, waitUntil) {
  const m = String((S.config && S.config.github) || "").match(/github\.com\/([A-Za-z0-9-]+)\/?$/);
  if (!m) return null;
  const key = `repos:${m[1]}`;
  const cached = env.PORTFOLIO ? await env.PORTFOLIO.get(key, "json").catch(() => null) : null;
  const refresh = async () => {
    const n = await fetchRepoCount(m[1]);
    if (env.PORTFOLIO) await env.PORTFOLIO.put(key, JSON.stringify({ n, t: Date.now() }));
    return n;
  };
  if (cached && typeof cached.n === "number") {
    if (Date.now() - (cached.t || 0) > COUNT_TTL_MS && waitUntil) waitUntil(refresh().catch(() => {}));
    return cached.n;
  }
  try { return await refresh(); } catch (e) { return null; }
}

/* index.html with the data and the right title/description injected server-side */
export async function renderPage(env, request, stackSlug, waitUntil) {
  const S = await loadSite(env, request);
  const page = await env.ASSETS.fetch(new URL("/", request.url));
  let html = await page.text();
  if (!S) return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });

  let title = S.meta.title, desc = S.meta.description, status = 200;
  if (stackSlug !== undefined) {
    const stacks = stackIndex(S);
    if (stackSlug) {
      const e = stacks.get(stackSlug);
      if (!e) status = 404;
      const name = e ? e.name : stackSlug;
      title = `${name} — ${S.meta.name}`;
      desc = e && e.projects.length
        ? `${S.meta.name}: ${e.projects.length} project(s) built with ${name}: ${e.projects.join(", ")}.`
        : `${S.meta.name} works with ${name}.`;
    } else {
      title = `Stacks — ${S.meta.name}`;
      desc = `Every stack ${S.meta.name} works with, and the projects behind each one.`;
    }
  }
  html = html
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${escHtml(title)}</title>`)
    .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${escHtml(desc)}">`)
    .replace(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${escHtml(title)}">`)
    .replace(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${escHtml(desc)}">`)
    .replace("<!--SITE_DATA-->", `<script>window.__SITE__=${safeJson(S)};window.__COUNTS__=${safeJson({ repos: await githubRepoCount(env, S, waitUntil) })};${stackSlug !== undefined ? `window.__STACK__=${JSON.stringify(stackSlug)};` : ""}</script>`);
  return new Response(html, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" } });
}

/* constant-time comparison of the bearer token with ADMIN_KEY */
export function authorized(request, env) {
  const key = env.ADMIN_KEY || "";
  const h = request.headers.get("authorization") || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!key || token.length !== key.length) return false;
  let diff = 0;
  for (let i = 0; i < key.length; i++) diff |= key.charCodeAt(i) ^ token.charCodeAt(i);
  return diff === 0;
}

export function validate(S) {
  if (!S || typeof S !== "object" || Array.isArray(S)) return "The document must be a JSON object.";
  const missing = REQUIRED.filter((k) => !S[k] || typeof S[k] !== "object");
  if (missing.length) return `Missing sections: ${missing.join(", ")}.`;
  if (!Array.isArray(S.work.projects)) return "work.projects must be a list.";
  for (const [i, p] of S.work.projects.entries()) {
    if (!p || typeof p.title !== "string" || !p.title.trim()) return `Project ${i + 1} needs a title.`;
    if (p.tags && !Array.isArray(p.tags)) return `Project "${p.title}": tags must be a list.`;
  }
  if (!Array.isArray(S.skills.groups)) return "skills.groups must be a list.";
  return null;
}
