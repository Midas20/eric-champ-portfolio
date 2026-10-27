// Shared helpers for the Pages Functions.
// KV binding: PORTFOLIO   keys: "site" (current), "rev:<id>" (previous versions), "revs" (index),
//                         "auth" (hash of a rotated edit key), "img:<id>" (uploaded images), "repos:<user>"
// Secret:     ADMIN_KEY   the first edit key, used until you change it from the editor

export const MAX_BYTES = 1_000_000;
export const MAX_REVISIONS = 30;
export const IMG_MAX_BYTES = 5_000_000;
export const IMG_TYPES = ["image/webp", "image/jpeg", "image/png", "image/gif", "image/avif"];
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

const visibleProjects = (S) => ((S.work && S.work.projects) || []).filter((p) => p && !p.hidden);

export function stackIndex(S) {
  const map = new Map();
  const add = (name, project) => {
    const slug = slugify(name);
    if (!slug) return;
    if (!map.has(slug)) map.set(slug, { slug, name, projects: [] });
    if (project) map.get(slug).projects.push(project.title);
  };
  visibleProjects(S).forEach((p) => (p.tags || []).forEach((t) => add(t, p)));
  ((S.skills && S.skills.groups) || []).forEach((g) => (g.items || []).forEach((t) => add(t)));
  return map;
}

/* ---------- focus: tailored versions of the page at /for/<slug> (same rules as public/main.js) ---------- */
export const presetSlug = (p) => slugify(p.slug || p.name || "");
export const findPreset = (S, slug) => (slug ? ((S.focus && S.focus.presets) || []).find((p) => presetSlug(p) === slug) || null : null);
export function autoRole(S, cats) {
  const F = (S.work && S.work.filters) || [];
  const words = [...new Set((cats || []).map((k) => { const f = F.find((x) => x.key === k); return f ? (f.role || f.label) : ""; }).filter(Boolean))].slice(0, 2);
  if (!words.length) return S.meta.role;
  const list = words.length === 1 ? words[0] : `${words.slice(0, -1).join(", ")} & ${words[words.length - 1]}`;
  return `${list} Engineer`;
}
export const presetRole = (S, p) => (p.title && p.title.trim()) || autoRole(S, p.categories);

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

/* index.html with the data and the right title/description injected server-side.
   opts: { stack: "" | "<slug>" (stack pages), focus: "<slug>" (/for/<slug>), waitUntil } */
export async function renderPage(env, request, opts = {}) {
  const { stack, focus, project, waitUntil } = opts;
  const S = await loadSite(env, request);
  const page = await env.ASSETS.fetch(new URL("/", request.url));
  let html = await page.text();
  if (!S) return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });

  let title = S.meta.title, desc = S.meta.description, status = 200, noindex = false;
  if (project !== undefined) {
    const p = visibleProjects(S).find((x) => slugify(x.slug || x.title) === project);
    if (!p) status = 404;
    title = p ? `${p.title} — ${S.meta.name}` : `Project not found — ${S.meta.name}`;
    desc = p ? (p.blurb || desc) : desc;
  } else if (stack !== undefined) {
    const stacks = stackIndex(S);
    if (stack) {
      const e = stacks.get(stack);
      if (!e) status = 404;
      const name = e ? e.name : stack;
      title = `${name} — ${S.meta.name}`;
      desc = e && e.projects.length
        ? `${S.meta.name}: ${e.projects.length} project(s) built with ${name}: ${e.projects.join(", ")}.`
        : `${S.meta.name} works with ${name}.`;
    } else {
      title = `Stacks — ${S.meta.name}`;
      desc = `Every stack ${S.meta.name} works with, and the projects behind each one.`;
    }
  } else {
    const slug = focus !== undefined ? focus : (S.focus && S.focus.home) || "";
    const preset = findPreset(S, slug);
    if (focus !== undefined) { noindex = true; if (!preset) status = 404; }
    if (preset) {
      title = `${S.meta.name} — ${presetRole(S, preset)}`;
      if (preset.lede) desc = preset.lede;
    }
  }
  const boot = [`window.__SITE__=${safeJson(S)}`, `window.__COUNTS__=${safeJson({ repos: await githubRepoCount(env, S, waitUntil) })}`];
  if (stack !== undefined) boot.push(`window.__STACK__=${JSON.stringify(stack)}`);
  if (focus !== undefined) boot.push(`window.__FOCUS__=${safeJson(focus)}`);
  if (project !== undefined) boot.push(`window.__PROJECT__=${safeJson(project)}`);
  html = html
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${escHtml(title)}</title>`)
    .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${escHtml(desc)}">`)
    .replace(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${escHtml(title)}">`)
    .replace(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${escHtml(desc)}">`)
    .replace("<!--SITE_DATA-->", `${noindex ? '<meta name="robots" content="noindex">' : ""}<script>${boot.join(";")};</script>`);
  const headers = { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" };
  if (noindex) headers["x-robots-tag"] = "noindex";
  return new Response(html, { status, headers });
}

/* ---------- edit key ----------
   Until the key is changed from the editor, the ADMIN_KEY secret is the key.
   Changing it stores a salted SHA-256 of a new random 192-bit key in KV ("auth"); from then on only the new key works.
   The key is random, not a password a person chose, so a fast hash is enough and keeps every request
   inside the free plan's 10 ms CPU limit (a slow password hash would not). */
const enc = new TextEncoder();
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const digest = async (key, salt) => b64u(await crypto.subtle.digest("SHA-256", enc.encode(`${salt}:${key}`)));
const same = (a, b) => {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
};

export async function keyValid(env, given) {
  if (!given || given.length > 200) return false;
  if (given.startsWith("s.")) return sessionValid(env, given);
  const rec = env.PORTFOLIO ? await env.PORTFOLIO.get("auth", "json") : null;
  if (rec && rec.hash) return same(await digest(given, rec.salt), rec.hash);
  const key = env.ADMIN_KEY || "";
  return key.length > 0 && same(given, key);
}

export async function authorized(request, env) {
  const h = request.headers.get("authorization") || "";
  return keyValid(env, h.startsWith("Bearer ") ? h.slice(7) : "");
}

export async function rotateKey(env) {
  const key = b64u(crypto.getRandomValues(new Uint8Array(24)));
  const salt = b64u(crypto.getRandomValues(new Uint8Array(16)));
  await env.PORTFOLIO.put("auth", JSON.stringify({ salt, hash: await digest(key, salt), at: new Date().toISOString() }));
  return key;
}

/* ---------- password sign-in at /admin ----------
   A password you choose (set from the editor) trades for a session token that lasts 7 days.
   PBKDF2 runs only at sign-in, so normal requests stay fast; failed sign-ins are limited per IP. */
const PW_ITER = 20_000;
const SESSION_TTL = 7 * 86400;
const LOGIN_LIMIT = 8;          // failed attempts per IP
const LOGIN_WINDOW = 15 * 60;   // seconds
export const PW_MIN = 10;

async function pbkdf2(pw, salt, iterations) {
  const k = await crypto.subtle.importKey("raw", enc.encode(pw), "PBKDF2", false, ["deriveBits"]);
  return b64u(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: enc.encode(salt), iterations }, k, 256));
}
export const passwordSet = async (env) => !!(env.PORTFOLIO && (await env.PORTFOLIO.get("pw")));
export async function setPassword(env, pw) {
  const salt = b64u(crypto.getRandomValues(new Uint8Array(16)));
  await env.PORTFOLIO.put("pw", JSON.stringify({ salt, iter: PW_ITER, hash: await pbkdf2(pw, salt, PW_ITER), at: new Date().toISOString() }));
}
export const clearPassword = (env) => env.PORTFOLIO.delete("pw");

const ipOf = (request) => request.headers.get("cf-connecting-ip") || "local";
export async function loginBlocked(env, request) {
  const n = Number(await env.PORTFOLIO.get(`login:${ipOf(request)}`)) || 0;
  return n >= LOGIN_LIMIT;
}
async function loginFailed(env, request) {
  const k = `login:${ipOf(request)}`;
  const n = (Number(await env.PORTFOLIO.get(k)) || 0) + 1;
  await env.PORTFOLIO.put(k, String(n), { expirationTtl: LOGIN_WINDOW });
}
export async function signIn(env, request, pw) {
  const rec = await env.PORTFOLIO.get("pw", "json");
  if (!rec || typeof pw !== "string" || pw.length > 200 || !same(await pbkdf2(pw, rec.salt, rec.iter || PW_ITER), rec.hash)) {
    await loginFailed(env, request);
    return null;
  }
  const token = `s.${b64u(crypto.getRandomValues(new Uint8Array(32)))}`;
  await env.PORTFOLIO.put(`sess:${await digest(token, "session")}`, JSON.stringify({ at: new Date().toISOString() }), { expirationTtl: SESSION_TTL });
  return token;
}
async function sessionValid(env, token) {
  return !!(env.PORTFOLIO && (await env.PORTFOLIO.get(`sess:${await digest(token, "session")}`)));
}
export async function signOut(env, token) {
  if (env.PORTFOLIO && typeof token === "string" && token.startsWith("s.")) await env.PORTFOLIO.delete(`sess:${await digest(token, "session")}`);
}

/* ---------- validation ---------- */
const isArr = Array.isArray;
const okSrc = (s) => typeof s === "string" && (/^\/img\/[a-f0-9]{16,64}$/.test(s) || /^\/samples\/[a-z0-9-]+\.(svg|png|jpe?g|webp)$/.test(s) || /^https:\/\//.test(s));

export function validate(S) {
  if (!S || typeof S !== "object" || isArr(S)) return "The document must be a JSON object.";
  const missing = REQUIRED.filter((k) => !S[k] || typeof S[k] !== "object");
  if (missing.length) return `Missing sections: ${missing.join(", ")}.`;
  if (!isArr(S.work.projects)) return "work.projects must be a list.";
  for (const [i, p] of S.work.projects.entries()) {
    if (!p || typeof p.title !== "string" || !p.title.trim()) return `Project ${i + 1} needs a title.`;
    if (p.tags && !isArr(p.tags)) return `Project "${p.title}": tags must be a list.`;
    if (p.image && !okSrc(p.image)) return `Project "${p.title}": the image must be an uploaded image or an https:// link.`;
  }
  if (!isArr(S.skills.groups)) return "skills.groups must be a list.";
  if (S.abilities && S.abilities.items && !isArr(S.abilities.items)) return "abilities.items must be a list.";
  for (const [i, a] of ((S.abilities && S.abilities.items) || []).entries()) if (!a || typeof a.title !== "string" || !a.title.trim()) return `Ability ${i + 1} needs a title.`;
  if (S.intro && S.intro.lines && !isArr(S.intro.lines)) return "intro.lines must be a list.";
  if (S.focus) {
    if (!isArr(S.focus.presets || [])) return "focus.presets must be a list.";
    const seen = new Set();
    for (const [i, p] of (S.focus.presets || []).entries()) {
      const slug = p && presetSlug(p);
      if (!slug) return `Focus preset ${i + 1} needs a name.`;
      if (seen.has(slug)) return `Two focus presets share the link /for/${slug}.`;
      seen.add(slug);
      if (p.categories && !isArr(p.categories)) return `Focus preset "${p.name}": categories must be a list.`;
    }
  }
  if (S.sections && (!isArr(S.sections.order || []) || !isArr(S.sections.hidden || []))) return "sections.order and sections.hidden must be lists.";
  if (S.customSections) {
    if (!isArr(S.customSections)) return "customSections must be a list.";
    for (const [i, c] of S.customSections.entries()) if (!c || !slugify(c.id || c.title || "")) return `Custom section ${i + 1} needs a title.`;
  }
  if (S.gallery && S.gallery.items) {
    if (!isArr(S.gallery.items)) return "gallery.items must be a list.";
    for (const [i, g] of S.gallery.items.entries()) if (!g || !okSrc(g.src)) return `Gallery image ${i + 1} must be an uploaded image or an https:// link.`;
  }
  if (S.about.photo && !okSrc(S.about.photo)) return "about.photo must be an uploaded image or an https:// link.";
  if (S.contact.methods && !isArr(S.contact.methods)) return "contact.methods must be a list.";
  return null;
}

/* after a password change every device signs in again; the device that changed it gets a fresh session */
export async function endAllSessions(env) {
  let cursor;
  do {
    const page = await env.PORTFOLIO.list({ prefix: "sess:", cursor });
    await Promise.all(page.keys.map((k) => env.PORTFOLIO.delete(k.name)));
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
}
export async function newSession(env) {
  const token = `s.${b64u(crypto.getRandomValues(new Uint8Array(32)))}`;
  await env.PORTFOLIO.put(`sess:${await digest(token, "session")}`, JSON.stringify({ at: new Date().toISOString() }), { expirationTtl: 7 * 86400 });
  return token;
}
