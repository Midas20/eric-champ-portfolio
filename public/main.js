/* ==================================================================
   Portfolio runtime
   1. load the site document (server-injected, draft preview, /api/site, /site.json)
   2. render every text field and list into the page
   3. start the interactions and animations
   Stack routes: /stack (index of all stacks) and /stack/<slug> (projects using it).
   ================================================================== */

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const lerp = (a, b, k) => a + (b - a) * k;
const pad2 = (n) => String(n).padStart(2, "0");
const clip = (s, n) => { s = String(s || ""); return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s; };

/* ---------- safety: everything from the data is escaped ---------- */
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const safeUrl = (u) => {
  const s = String(u || "").trim();
  if (!s) return "#";
  if (/^(https?:|mailto:|\/|#)/i.test(s)) return s;
  return "#";
};
const get = (obj, path) => path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);

/* stack slugs: "Next.js" -> "next-js", "C++" -> "c-plus-plus" (kept identical in lib/site.js) */
const slugify = (s) => String(s).toLowerCase()
  .replace(/\+/g, "-plus").replace(/#/g, "-sharp")
  .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

function stackRoute() {
  if (typeof window.__STACK__ === "string") return { slug: window.__STACK__ };
  const m = location.pathname.match(/^\/stack(?:\/([^/]*))?\/?$/);
  return m ? { slug: decodeURIComponent(m[1] || "") } : null;
}

/* every stack name on the site, with the projects that use it */
function stackIndex(S) {
  const map = new Map();
  const add = (name, project) => {
    const slug = slugify(name);
    if (!slug) return;
    if (!map.has(slug)) map.set(slug, { slug, name, projects: [] });
    if (project) map.get(slug).projects.push(project);
  };
  (S.work.projects || []).forEach((p) => (p.tags || []).forEach((t) => add(t, p)));
  (S.skills.groups || []).forEach((g) => (g.items || []).forEach((t) => add(t)));
  return map;
}

/* numbers the page calculates instead of storing them.
   Write {repos}, {projects}, {stacks}, {years} or {layers} in any text or stat value. */
const COUNT_TOKEN = /\{(repos|projects|stacks|years|layers)\}/g;

async function githubRepos(S) {
  const m = String((S.config && S.config.github) || "").match(/github\.com\/([A-Za-z0-9-]+)\/?$/);
  if (!m) return null;
  try {
    let n = 0;
    for (let page = 1; page <= 10; page++) {
      const r = await fetch(`https://api.github.com/users/${m[1]}/repos?type=owner&per_page=100&page=${page}`);
      if (!r.ok) return null;
      const list = await r.json();
      n += list.filter((x) => !x.fork).length;
      if (list.length < 100) break;
    }
    return n;
  } catch (e) { return null; }
}

async function siteCounts(S) {
  const years = (S.experience.items || []).flatMap((it) => String(it.dates || "").match(/\b(?:19|20)\d{2}\b/g) || []).map(Number);
  const served = window.__COUNTS__ && window.__COUNTS__.repos;
  return {
    repos: served != null ? served : JSON.stringify(S).includes("{repos}") ? await githubRepos(S) : null,
    projects: (S.work.projects || []).length,
    stacks: stackIndex(S).size,
    years: years.length ? new Date().getFullYear() - Math.min(...years) : null,
    layers: (S.hero.layers || []).length,
  };
}

/* a token with no value (GitHub unreachable) is dropped, and its stat is hidden */
function fillCounts(v, counts) {
  if (typeof v === "string") {
    if (!v.match(COUNT_TOKEN)) return v;
    return v.replace(COUNT_TOKEN, (_, k) => (counts[k] == null ? "" : String(counts[k]))).replace(/ {2,}/g, " ").trim();
  }
  if (Array.isArray(v)) return v.map((x) => fillCounts(x, counts));
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fillCounts(x, counts)]));
  return v;
}

/* ---------- focus: tailored versions of the page at /for/<slug> (same rules as lib/site.js) ---------- */
const presetSlug = (p) => slugify(p.slug || p.name || "");
const findPreset = (S, slug) => (slug ? ((S.focus && S.focus.presets) || []).find((p) => presetSlug(p) === slug) || null : null);
function autoRole(S, cats) {
  const F = S.work.filters || [];
  const words = [...new Set((cats || []).map((k) => { const f = F.find((x) => x.key === k); return f ? (f.role || f.label) : ""; }).filter(Boolean))].slice(0, 2);
  if (!words.length) return S.meta.role;
  return `${words.length === 1 ? words[0] : `${words.slice(0, -1).join(", ")} & ${words[words.length - 1]}`} Engineer`;
}
const presetRole = (S, p) => (p.title && p.title.trim()) || autoRole(S, p.categories);

function focusRoute() {
  if (typeof window.__FOCUS__ === "string") return window.__FOCUS__;
  const m = location.pathname.match(/^\/for\/([^/]+)\/?$/);
  return m ? decodeURIComponent(m[1]) : null;
}

/* drops hidden projects, applies a preset, puts pinned projects first.
   S._paths maps a shown field back to where it is stored, for editing on the page. */
function applyFocus(S, slug) {
  S._paths = {};
  S.work.projects = (S.work.projects || []).map((p, i) => ({ ...p, _i: i })).filter((p) => !p.hidden);
  const preset = findPreset(S, slug);
  if (preset) {
    const pi = S.focus.presets.indexOf(preset);
    const cats = preset.categories || [], tags = (preset.stacks || []).map(slugify);
    if (cats.length || tags.length) S.work.projects = S.work.projects.filter((p) => cats.includes(p.category) || (p.tags || []).some((t) => tags.includes(slugify(t))));
    S.meta.role = presetRole(S, preset);
    S.meta.title = `${S.meta.name} — ${S.meta.role}`;
    S._paths["meta.role"] = `focus.presets.${pi}.title`;
    if (preset.eyebrow) { S.hero.eyebrow = preset.eyebrow; S._paths["hero.eyebrow"] = `focus.presets.${pi}.eyebrow`; }
    if (preset.lede) { S.hero.lede = preset.lede; S._paths["hero.lede"] = `focus.presets.${pi}.lede`; }
    S.work.filters = (S.work.filters || []).filter((f) => f.key === "all" || S.work.projects.some((p) => p.category === f.key));
  }
  S.work.projects.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || a._i - b._i);
  return preset;
}

/* ---------- sections: order, hidden, custom ---------- */
const customId = (c) => `x-${slugify(c.id || c.title || "section")}`;

function customHTML(c, i) {
  const P = (k) => `data-path="customSections.${i}.${k}"`;
  const paras = (c.paragraphs || []).filter(Boolean).map((t, j) => `<p data-path="customSections.${i}.paragraphs.${j}">${esc(t)}</p>`).join("");
  const items = (c.items || []).filter((x) => x && (x.k || x.v)).map((x, j) => `
    <li class="cl-row reveal" style="--i:${j % 6}">
      <span class="cl-k" data-path="customSections.${i}.items.${j}.k">${esc(x.k)}</span>
      <span class="cl-v" data-path="customSections.${i}.items.${j}.v">${esc(x.v)}</span>
      ${x.link ? `<a class="cl-link" href="${esc(safeUrl(x.link))}" target="_blank" rel="noopener">Open ↗</a>` : "<span></span>"}
    </li>`).join("");
  return `<section id="${customId(c)}" class="section custom-sec" data-custom="${i}">
    <div class="wrap">
      <div class="section-head reveal">
        ${c.eyebrow ? `<p class="eyebrow" ${P("eyebrow")}>${esc(c.eyebrow)}</p>` : ""}
        <h2 ${P("title")}>${esc(c.title)}</h2>
        ${c.lede ? `<p class="lede" ${P("lede")}>${esc(c.lede)}</p>` : ""}
      </div>
      ${paras ? `<div class="custom-text reveal">${paras}</div>` : ""}
      ${items ? `<ul class="custom-list">${items}</ul>` : ""}
    </div>
  </section>`;
}

function layoutSections(S) {
  const main = $("main");
  (S.customSections || []).forEach((c, i) => { if (c && (c.title || c.id)) main.insertAdjacentHTML("beforeend", customHTML(c, i)); });
  const all = $$("main > section.section").map((s) => s.id).filter(Boolean);
  const L = S.sections || {};
  const order = [...(L.order || []).filter((id) => all.includes(id)), ...all.filter((id) => !(L.order || []).includes(id))];
  // contact closes the page unless it was placed explicitly
  if (!(L.order || []).includes("contact")) { order.splice(order.indexOf("contact"), 1); order.push("contact"); }
  order.forEach((id) => main.appendChild(document.getElementById(id)));
  (L.hidden || []).forEach((id) => { const s = document.getElementById(id); if (s) { s.hidden = true; s.dataset.off = "1"; } });
  if (!(S.gallery && (S.gallery.items || []).length)) $("#gallery").hidden = true;
  else if (!$("#gallery").dataset.off) $("#gallery").hidden = false;

  // the top menu follows the section order
  const label = (id) => {
    if (id.startsWith("x-")) { const i = (S.customSections || []).findIndex((c) => customId(c) === id); const c = S.customSections[i]; return c && c.nav ? [c.nav, `customSections.${i}.nav`] : null; }
    return S.nav[id] ? [S.nav[id], `nav.${id}`] : null;
  };
  $("#navLinks").innerHTML = order.map((id) => {
    const sec = document.getElementById(id), l = label(id);
    if (!l || sec.hidden) return "";
    return `<a href="/#${id}" data-path="${l[1]}">${esc(l[0])}</a>`;
  }).join("");
}

/* ---------- contact methods ---------- */
const METHOD_ICON = { email: "@", phone: "☏", github: "⌥", linkedin: "in", x: "𝕏", website: "↗", calendar: "◷", location: "⌖", telegram: "➤", whatsapp: "✆", other: "•" };
function methodHref(m) {
  const v = String(m.value || "").trim();
  if (m.href) return safeUrl(m.href);
  if (!v) return "";
  if (m.type === "email") return `mailto:${v}`;
  if (m.type === "phone" || m.type === "whatsapp") return m.type === "phone" ? `tel:${v.replace(/[^\d+]/g, "")}` : `https://wa.me/${v.replace(/\D/g, "")}`;
  if (m.type === "location") return "";
  if (/^https?:\/\//i.test(v)) return v;
  if (/^[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(v)) return `https://${v}`;
  return "";
}

function vcard(S) {
  const line = (k, v) => `${k}:${String(v).replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n")}`;
  const out = ["BEGIN:VCARD", "VERSION:3.0", line("FN", S.meta.name), line("TITLE", S.meta.role), line("URL", location.origin + "/")];
  const email = S.config && S.config.email;
  if (email) out.push(line("EMAIL;TYPE=INTERNET", email));
  (S.contact.methods || []).forEach((m) => {
    if (!m || !m.value) return;
    if (m.type === "email" && m.value !== email) out.push(line("EMAIL;TYPE=INTERNET", m.value));
    else if (m.type === "phone") out.push(line("TEL;TYPE=CELL", m.value));
    else if (m.type === "location") out.push(line("ADR", `;;${m.value};;;;`));
    else { const h = methodHref(m); if (/^https?:/.test(h)) out.push(line("URL", h)); }
  });
  if (S.config && S.config.github) out.push(line("URL", S.config.github));
  out.push("END:VCARD");
  return out.join("\r\n");
}

/* ---------- on-page editing (inside the editor's page view) ---------- */
const INLINE = new URLSearchParams(location.search).has("inline") && window.parent !== window;

function enableInline(raw, S) {
  document.documentElement.classList.add("inline-mode");
  const post = (msg) => window.parent.postMessage({ source: "portfolio-page", ...msg }, location.origin);
  const target = (el) => (el.dataset.t ? (S._paths[el.dataset.t] || el.dataset.t) : el.dataset.path);
  $$("[data-t], [data-path]").forEach((el) => {
    const path = target(el), v = get(raw, path);
    if (el.closest(".head-art, .lightbox, .intro-screen")) return;
    if (typeof v === "string" && /\{(repos|projects|stacks|years|layers)\}/.test(v)) { el.classList.add("ie-lock"); el.title = "Calculated for you. Change it in the form."; return; }
    if (v !== undefined && typeof v !== "string" && typeof v !== "number") return;
    el.classList.add("ie");
    el.setAttribute("contenteditable", "plaintext-only");
    if (el.contentEditable !== "plaintext-only") el.setAttribute("contenteditable", "true");
    el.spellcheck = true;
    el.dataset.edit = path;
  });
  document.addEventListener("input", (e) => {
    const el = e.target.closest && e.target.closest("[data-edit]");
    if (el) post({ type: "edit", path: el.dataset.edit, value: el.textContent });
  });
  document.addEventListener("keydown", (e) => {
    const el = e.target.closest && e.target.closest("[data-edit]");
    if (!el) return;
    if (e.key === "Escape" || (e.key === "Enter" && !e.shiftKey)) { e.preventDefault(); el.blur(); }
  });
  document.addEventListener("focusin", (e) => { const el = e.target.closest && e.target.closest("[data-edit]"); if (el) post({ type: "select", path: el.dataset.edit }); });
  // links do not navigate while editing; Ctrl/Cmd+click still follows them
  document.addEventListener("click", (e) => { const a = e.target.closest("a"); if (a && !(e.ctrlKey || e.metaKey) && !a.getAttribute("href").startsWith("#") && !a.getAttribute("href").startsWith("/#")) e.preventDefault(); }, true);
  addEventListener("message", (e) => {
    if (e.origin !== location.origin || !e.data || e.data.source !== "portfolio-editor") return;
    if (e.data.type === "reveal") {
      const el = $$("[data-edit]").find((x) => x.dataset.edit === e.data.path);
      if (!el) return;
      el.scrollIntoView({ block: "center", behavior: reduceMotion ? "auto" : "smooth" });
      el.classList.remove("ie-flash"); void el.offsetWidth; el.classList.add("ie-flash");
    }
  });
  // keep the scroll position across reloads triggered by form edits
  try { const y = +sessionStorage.getItem("inline-scroll"); if (y) requestAnimationFrame(() => scrollTo(0, y)); } catch (e) {}
  addEventListener("scroll", () => { try { sessionStorage.setItem("inline-scroll", String(scrollY)); } catch (e) {} }, { passive: true });
  post({ type: "ready" });
}

/* ---------- owner shortcut: only on a device that has opened the editor ---------- */
function ownerShortcut() {
  let url = "";
  try { url = localStorage.getItem("editor-url") || ""; } catch (e) {}
  if (!(url === "/admin" || /^\/edit\/[A-Za-z0-9_-]{16,}$/.test(url)) || window.parent !== window) return;
  const a = document.createElement("a");
  a.className = "owner-edit"; a.href = url; a.textContent = "Edit"; a.title = "Open the editor (Ctrl+Shift+E). Only shown on this device.";
  document.body.appendChild(a);
  addEventListener("keydown", (e) => { if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "e") { e.preventDefault(); location.href = url; } });
}

async function loadSite() {
  const params = new URLSearchParams(location.search);
  if (params.has("draft")) {
    try { const d = localStorage.getItem("site-draft"); if (d) { document.documentElement.classList.add("is-draft"); return JSON.parse(d); } } catch (e) {}
  }
  if (window.__SITE__ && typeof window.__SITE__ === "object") return window.__SITE__;
  for (const url of ["/api/site", "/site.json"]) {
    try { const r = await fetch(url, { cache: "no-store" }); if (r.ok) return await r.json(); } catch (e) {}
  }
  return null;
}

/* ================================================================== */
/* first visit: a change runs the pipeline to shipped, then the page opens */
/* ================================================================== */
function intro(S, role) {
  const root = document.documentElement;
  if (!root.classList.contains("intro")) return;
  try { sessionStorage.setItem("intro", "1"); } catch (e) {}
  const stages = (S.pipeline.stages || []).slice(0, 7);
  if (!stages.length) { root.classList.remove("intro"); return; }
  const el = document.createElement("div");
  el.className = "intro-screen"; el.setAttribute("aria-hidden", "true");
  el.innerHTML = `<div class="i-wrap">
    <ol class="i-track" style="--n:${stages.length}">${stages.map((s, i) => `<li style="--i:${i}"><i></i><span>${esc(s)}</span></li>`).join("")}<b class="i-fill"></b></ol>
    <p class="i-name"><strong>${esc(S.meta.name)}</strong><span>${esc(role || S.meta.role)}</span></p></div>`;
  document.body.appendChild(el);
  const skip = ["click", "keydown", "wheel", "touchstart"];
  let done = false;
  const finish = () => {
    if (done) return; done = true;
    skip.forEach((e) => removeEventListener(e, finish));
    el.classList.add("out");
    root.classList.remove("intro");
    setTimeout(() => el.remove(), 800);
  };
  skip.forEach((e) => addEventListener(e, finish, { passive: true }));
  setTimeout(finish, 1100 + stages.length * 240);
}

/* ================================================================== */
/* render                                                              */
/* ================================================================== */
function render(S, route, stacks) {
  // plain text bindings
  $$("[data-t]").forEach((el) => { const v = get(S, el.dataset.t); if (v != null) el.textContent = v; });
  layoutSections(S);

  // title and description (functions also set these server-side for link previews)
  let title = S.meta.title, desc = S.meta.description;
  if (route) {
    const entry = route.slug ? stacks.get(route.slug) : null;
    const name = entry ? entry.name : route.slug;
    title = route.slug ? `${name} — ${S.meta.name}` : `Stacks — ${S.meta.name}`;
    desc = route.slug
      ? `${S.meta.name}: ${entry ? entry.projects.length : 0} project(s) built with ${name}.`
      : `Every stack ${S.meta.name} works with, and the projects behind each one.`;
  }
  document.title = title;
  const md = $('meta[name="description"]'); if (md) md.setAttribute("content", desc);

  // identity links
  const C = S.config || {};
  $$("[data-github]").forEach((a) => { if (C.github) { a.href = safeUrl(C.github); a.hidden = false; } else a.hidden = true; });
  $$("[data-linkedin]").forEach((a) => { if (C.linkedin) { a.href = safeUrl(C.linkedin); a.hidden = false; } else a.hidden = true; });
  const more = $("#moreLink");
  if (more) { if (C.allProjectsUrl) more.href = safeUrl(C.allProjectsUrl); else more.closest(".more").hidden = true; }

  // hero stats
  $("#heroStats").innerHTML = (S.hero.stats || []).map((s, i) => ({ ...s, i })).filter((s) => String(s.value).trim() !== "" && !isNaN(Number(s.value))).map((s) => {
    const inner = `<span class="num" data-count="${Number(s.value) || 0}" data-suffix="${esc(s.suffix || "")}">0</span><span class="num-label" data-path="hero.stats.${s.i}.label">${esc(s.label)}</span>`;
    return `<li>${s.linkToGithub && C.github ? `<a href="${esc(safeUrl(C.github))}" target="_blank" rel="noopener">${inner}</a>` : inner}</li>`;
  }).join("");

  // pipeline stages
  const stages = S.pipeline.stages || [];
  $("#pipe").innerHTML = stages.map((st, i) => `<li${i === stages.length - 1 ? ' class="pipe-ship"' : ""}><i></i><span data-path="pipeline.stages.${i}">${esc(st)}</span></li>`).join("");

  // experience
  const tl = $("#timeline");
  tl.insertAdjacentHTML("beforeend", (S.experience.items || []).map((it, i) => {
    const P = (k) => `data-path="experience.items.${i}.${k}"`;
    return `
    <article class="tl-item reveal">
      <div class="tl-dot"></div>
      <p class="tl-date" ${P("dates")}>${esc(it.dates)}</p>
      <h3 ${P("title")}>${esc(it.title)}</h3>
      <p class="tl-org" ${P("org")}>${esc(it.org)}</p>
      <p ${P("text")}>${esc(it.text)}</p>
    </article>`;
  }).join(""));
  $("#certs").innerHTML = (S.experience.certifications || []).map((c, i) => `<li data-path="experience.certifications.${i}">${esc(c)}</li>`).join("");

  // skills, each item links to its stack page
  const active = route && route.slug;
  $("#skillsGrid").innerHTML = (S.skills.groups || []).map((g, i) => `
    <div class="skill-group reveal" style="--i:${i}">
      <h3 data-path="skills.groups.${i}.name">${esc(g.name)}</h3>
      <ul>${(g.items || []).map((t) => { const s = slugify(t); return `<li><a class="stack-link${s === active ? " on" : ""}" href="/stack/${s}">${esc(t)}</a></li>`; }).join("")}</ul>
    </div>`).join("");

  // gallery
  const G = (S.gallery && S.gallery.items) || [];
  $("#galleryGrid").innerHTML = G.map((g, i) => `
    <figure class="g-item reveal" style="--i:${i % 6}">
      <button class="g-open" type="button" data-g="${i}" aria-label="Open image ${i + 1}${g.alt ? `: ${esc(g.alt)}` : ""}">
        <img src="${esc(safeUrl(g.src))}" alt="${esc(g.alt || "")}" loading="lazy" decoding="async"${g.w && g.h ? ` width="${+g.w}" height="${+g.h}"` : ""}>
      </button>
      ${g.caption ? `<figcaption data-path="gallery.items.${i}.caption">${esc(g.caption)}</figcaption>` : ""}
    </figure>`).join("");

  // about
  const photo = $("#aboutPhoto");
  if (S.about.photo) { photo.innerHTML = `<img src="${esc(safeUrl(S.about.photo))}" alt="${esc(S.meta.name)}" loading="lazy" decoding="async">`; photo.hidden = false; }
  $("#aboutParas").innerHTML = (S.about.paragraphs || []).map((p, i) => `<p data-path="about.paragraphs.${i}">${esc(p)}</p>`).join("");
  $("#values").innerHTML = (S.about.values || []).map((v, i) => `<li><strong data-path="about.values.${i}.title">${esc(v.title)}</strong> <span data-path="about.values.${i}.text">${esc(v.text)}</span></li>`).join("");

  // contact
  const pairs = (list, base) => (list || []).map((x, i) => `<div><dt data-path="${base}.${i}.k">${esc(x.k)}</dt><dd data-path="${base}.${i}.v">${esc(x.v)}</dd></div>`).join("");
  $("#lookingFor").innerHTML = pairs(S.contact.lookingFor, "contact.lookingFor");
  if (!(S.contact.lookingFor || []).length) $("#lookingFor").closest(".looking").hidden = true;
  $("#plan").innerHTML = (S.contact.plan || []).map((x, i) => `<li><span class="plan-when" data-path="contact.plan.${i}.when">${esc(x.when)}</span><span class="plan-what" data-path="contact.plan.${i}.what">${esc(x.what)}</span></li>`).join("");
  $("#facts").innerHTML = pairs(S.contact.facts, "contact.facts");
}

/* ================================================================== */
/* start: interactions and animations                                  */
/* ================================================================== */
function start(S, route, stacks) {
  const projects = S.work.projects || [];

  /* ---------- theme ---------- */
  let strata = { recolor() {} };
  (function theme() {
    const root = document.documentElement, btn = $("#themeToggle");
    const systemLight = window.matchMedia("(prefers-color-scheme: light)");
    const current = () => root.dataset.theme || (systemLight.matches ? "light" : "dark");
    btn.addEventListener("click", () => {
      const next = current() === "light" ? "dark" : "light";
      root.dataset.theme = next;
      try { localStorage.setItem("theme", next); } catch (e) {}
      strata.recolor();
    });
  })();

  /* ---------- strata: thin line field ---------- */
  strata = (function () {
    const canvas = $("#strata"), ctx = canvas.getContext("2d");
    let w = 0, h = 0, dpr = 1, t = 0, raf = 0, rgb = "123,140,255";
    const mouse = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 };
    const LAYERS = 9;
    const layers = Array.from({ length: LAYERS }, (_, i) => ({ amp: 14 + i * 7, freq: 0.0022 + i * 0.0003, speed: 0.22 + i * 0.05, phase: i * 1.7, y: 0.3 + i * 0.075 }));
    function recolor() { const v = getComputedStyle(document.documentElement).getPropertyValue("--strata").trim(); if (v) rgb = v; }
    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = Math.floor(w * dpr); canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (reduceMotion) draw();
    }
    const wave = (L, x, baseY, px, depth) => baseY
      + Math.sin((x + px * depth) * L.freq + t * L.speed + L.phase) * L.amp
      + Math.sin((x + px * depth) * L.freq * 2.3 + t * L.speed * 0.6) * L.amp * 0.35;
    function draw() {
      ctx.clearRect(0, 0, w, h);
      mouse.x = lerp(mouse.x, mouse.tx, 0.04); mouse.y = lerp(mouse.y, mouse.ty, 0.04);
      const px = (mouse.x - 0.5) * 60, py = (mouse.y - 0.5) * 36, sc = window.scrollY * 0.12;
      layers.forEach((L, i) => {
        const depth = (i + 1) / LAYERS, baseY = h * L.y + py * depth - sc * depth;
        ctx.strokeStyle = `rgba(${rgb},${0.06 + depth * 0.16})`; ctx.lineWidth = 1; ctx.beginPath();
        for (let x = 0; x <= w; x += 6) { const y = wave(L, x, baseY, px, depth); x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
        ctx.stroke();
      });
    }
    function loop() { t += 0.01; draw(); raf = requestAnimationFrame(loop); }
    recolor(); resize();
    addEventListener("resize", resize);
    if (finePointer) addEventListener("pointermove", (e) => { mouse.tx = e.clientX / innerWidth; mouse.ty = e.clientY / innerHeight; }, { passive: true });
    if (!reduceMotion) new IntersectionObserver(([en]) => { if (en.isIntersecting) { if (!raf) loop(); } else { cancelAnimationFrame(raf); raf = 0; } }).observe(canvas);
    return { recolor };
  })();

  /* ---------- the stack (hero) ---------- */
  const heroLayer = { cur: 0 };
  (function stack() {
    const scene = $("#stackScene"), data = S.hero.layers || [];
    if (!scene || !data.length) { const v = $(".hero-visual"); if (v) v.hidden = true; return; }
    const n = data.length;
    scene.innerHTML = data.map((s, i) => `<div class="plate" style="--z:${(n - 1 - i) * 34};--i:${n - 1 - i}" data-i="${i}"><span>${esc(s.label)}</span></div>`).join("");
    const plates = $$(".plate", scene);
    plates.forEach((p) => p.addEventListener("animationend", () => p.classList.add("placed"), { once: true }));
    const idx = $("#stackIdx"), label = $("#stackLabel"), note = $("#stackNote"), caption = $("#stackCaption"), box = $("#stack");
    let cur = -1, hover = false, lastHoverSwitch = 0;
    const set = (i) => {
      if (i === cur) return;
      cur = i; heroLayer.cur = i;
      plates.forEach((p, j) => { p.classList.toggle("active", j === i); p.classList.toggle("near", Math.abs(j - i) === 1); });
      idx.textContent = `${pad2(i + 1)} / ${pad2(n)}`;
      label.textContent = data[i].label; note.textContent = data[i].note || "";
      caption.classList.remove("swap"); void caption.offsetWidth; caption.classList.add("swap");
    };
    set(0);
    if (!reduceMotion) setInterval(() => { if (!hover) set((cur + 1) % n); }, 2600);
    if (finePointer && !reduceMotion) {
      const base = { x: 56, z: -38 }, target = { ...base }, now = { ...base };
      let raf = 0;
      const tick = () => {
        now.x = lerp(now.x, target.x, 0.08); now.z = lerp(now.z, target.z, 0.08);
        scene.style.transform = `rotateX(${now.x.toFixed(2)}deg) rotateZ(${now.z.toFixed(2)}deg)`;
        raf = (Math.abs(now.x - target.x) + Math.abs(now.z - target.z) > 0.02) ? requestAnimationFrame(tick) : 0;
      };
      const kick = () => { if (!raf) raf = requestAnimationFrame(tick); };
      box.addEventListener("pointerenter", () => { hover = true; });
      box.addEventListener("pointermove", (e) => {
        const r = box.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
        target.x = base.x - y * 10; target.z = base.z + x * 12; kick();
        const t = performance.now();
        if (t - lastHoverSwitch > 250) {
          const i = Math.min(n - 1, Math.max(0, Math.floor((y + 0.5 - 0.12) / 0.76 * n)));
          if (i !== cur) { lastHoverSwitch = t; set(i); }
        }
      });
      box.addEventListener("pointerleave", () => { hover = false; target.x = base.x; target.z = base.z; kick(); });
    }
  })();

  /* ---------- hero particles (WebGL): cloud → layer stack → poured into the pipeline on scroll ---------- */
  (function particles() {
    const canvas = $("#heroGL"), anchor = $("#stack");
    if (!canvas || !anchor || !window.heroParticles || $(".hero").hidden || INLINE) return;
    const ctl = window.heroParticles({
      canvas, anchor, layers: (S.hero.layers || []).length || 5, getActive: () => heroLayer.cur, reduceMotion,
      waitFor: () => document.documentElement.classList.contains("intro"),
    });
    if (!ctl) return;
    $(".hero").classList.add("gl-on");
    const prev = strata;
    strata = { recolor() { prev.recolor(); ctl.recolor(); } };
  })();

  /* ---------- page particles: depth field on scroll, gathering into a check mark at Contact ---------- */
  (function field() {
    const canvas = $("#pageGL");
    if (!canvas || !window.pageParticles || route || INLINE || reduceMotion) return;
    const ctl = window.pageParticles({ canvas, goal: () => $(".bg-graph .g-goal"), hero: $(".hero") });   // gathers at the shipped node
    if (!ctl) return;
    const prev = strata;
    strata = { recolor() { prev.recolor(); ctl.recolor(); } };
  })();

  /* ---------- pipeline band ---------- */
  (function pipeline() {
    const pipe = $("#pipe"), items = $$("li", pipe), count = $("#shipCount");
    if (!items.length) return;
    if (reduceMotion) { items.forEach((li) => li.classList.add("done")); count.textContent = "1"; return; }
    let i = 0, ships = 0, timer = 0, visible = false;
    const token = document.createElement("span"); token.className = "pipe-token"; pipe.appendChild(token);
    const moveToken = (j) => {
      const dot = items[Math.min(j, items.length - 1)].querySelector("i");
      const r = dot.getBoundingClientRect(), p = pipe.getBoundingClientRect();
      token.style.left = `${r.left - p.left + r.width / 2}px`;
    };
    const paint = () => items.forEach((li, j) => { li.classList.toggle("done", j < i); li.classList.toggle("active", j === i); });
    function step() {
      clearTimeout(timer);
      if (!visible) return;
      if (i < items.length - 1) { paint(); moveToken(i); token.classList.add("on"); i++; timer = setTimeout(step, 620); return; }
      i = items.length; paint(); moveToken(i); ships++; count.textContent = ships;
      timer = setTimeout(() => {
        token.classList.remove("on");
        i = 0; items.forEach((li) => li.classList.remove("done", "active"));
        timer = setTimeout(() => { moveToken(0); step(); }, 420);
      }, 1500);
    }
    new IntersectionObserver(([en]) => { visible = en.isIntersecting; if (visible) step(); else clearTimeout(timer); }, { threshold: 0.2 }).observe(pipe);
  })();

  /* ---------- team graph ---------- */
  (function teamGraph() {
    const box = $("#teamGraph"), names = S.about.team || [];
    if (!box || !names.length) { if (box) box.closest(".side-block").hidden = true; return; }
    const W = 320, H = 140, cx = W / 2, cy = H / 2, rx = 118, ry = 50, n = names.length;
    const nodes = names.map((name, i) => { const a = -Math.PI / 2 + (i / n) * Math.PI * 2; return { name, x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry }; });
    const edges = nodes.map((p, i) => {
      const len = Math.hypot(p.x - cx, p.y - cy).toFixed(1);
      return `<line class="edge" x1="${cx}" y1="${cy}" x2="${p.x}" y2="${p.y}"/><line class="edge edge-on" x1="${cx}" y1="${cy}" x2="${p.x}" y2="${p.y}" style="--len:${len};--d:${i}s"/>`;
    }).join("");
    const dots = nodes.map((p, i) => {
      const above = p.y < cy - 2, side = Math.abs(p.x - cx) > rx * 0.6;
      const anchor = side ? (p.x > cx ? "start" : "end") : "middle";
      const tx = side ? p.x + (p.x > cx ? 9 : -9) : p.x, ty = side ? p.y + 3 : (above ? p.y - 9 : p.y + 15);
      return `<circle class="node node-on" cx="${p.x}" cy="${p.y}" r="4" style="--d:${i}s"/><text x="${tx}" y="${ty}" text-anchor="${anchor}">${esc(p.name)}</text>`;
    }).join("");
    box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${edges}${dots}
      <circle class="me-ring" cx="${cx}" cy="${cy}" r="6"/><circle class="me" cx="${cx}" cy="${cy}" r="6"/>
      <text class="me-label" x="${cx}" y="${cy + 18}" text-anchor="middle">me</text></svg>`;
  })();

  /* ---------- nav ---------- */
  (function nav() {
    const navEl = $("#nav"), burger = $("#burger"), progress = $("#progress"), links = $$(".nav-links a");
    const onScroll = () => {
      navEl.classList.toggle("scrolled", scrollY > 24);
      const max = document.documentElement.scrollHeight - innerHeight;
      progress.style.transform = `scaleX(${max > 0 ? scrollY / max : 0})`;
    };
    addEventListener("scroll", onScroll, { passive: true }); onScroll();
    burger.addEventListener("click", () => {
      const open = navEl.classList.toggle("open");
      burger.setAttribute("aria-expanded", String(open));
      burger.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    });
    links.forEach((a) => a.addEventListener("click", () => { navEl.classList.remove("open"); burger.setAttribute("aria-expanded", "false"); }));
    const sections = links.map((a) => document.getElementById(a.getAttribute("href").split("#")[1])).filter(Boolean);
    const navBox = $("#navLinks"), ink = document.createElement("span");
    ink.className = "nav-ink"; ink.setAttribute("aria-hidden", "true"); navBox.appendChild(ink);
    const moveInk = () => {
      const a = $(".nav-links a.active");
      if (!a) { ink.style.opacity = "0"; return; }
      ink.style.opacity = "1"; ink.style.width = `${a.offsetWidth}px`; ink.style.transform = `translateX(${a.offsetLeft}px)`;
    };
    addEventListener("resize", moveInk);
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) links.forEach((a) => a.classList.toggle("active", a.getAttribute("href").endsWith(`#${en.target.id}`))); });
      moveInk();
    }, { rootMargin: "-40% 0px -55% 0px" });
    sections.forEach((s) => io.observe(s));
  })();

  /* ---------- reveal on scroll ---------- */
  const revealIO = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      en.target.classList.add("in"); revealIO.unobserve(en.target);
      if (en.target.classList.contains("contact-side")) $$(".plan li", en.target).forEach((li, i) => { li.style.setProperty("--i", i); li.classList.add("on"); });
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
  $$(".reveal").forEach((el) => revealIO.observe(el));
  $$(".skill-group ul, .cred-list").forEach((ul) => $$("li", ul).forEach((li, j) => li.style.setProperty("--j", j)));

  /* ---------- counters ---------- */
  (function counters() {
    const ease = (x) => 1 - Math.pow(1 - x, 3);
    const run = (el) => {
      const target = Number(el.dataset.count), suffix = el.dataset.suffix || "";
      if (reduceMotion) { el.textContent = target + suffix; return; }
      const t0 = performance.now(), dur = 1400;
      const tick = () => {
        const p = Math.min(1, Math.max(0, (performance.now() - t0) / dur));
        el.textContent = Math.round(target * ease(p)) + suffix;
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };
    const io = new IntersectionObserver((entries) => entries.forEach((en) => { if (en.isIntersecting) { run(en.target); io.unobserve(en.target); } }), { threshold: 0.6 });
    $$(".num[data-count]").forEach((el) => io.observe(el));
  })();

  /* ---------- timeline fill ---------- */
  (function timeline() {
    const tl = $("#timeline"), fill = $("#timelineFill");
    if (!tl) return;
    const update = () => { const r = tl.getBoundingClientRect(); fill.style.transform = `scaleY(${Math.min(1, Math.max(0, (innerHeight * 0.75 - r.top) / r.height))})`; };
    addEventListener("scroll", update, { passive: true }); addEventListener("resize", update); update();
  })();

  /* ---------- featured case study ---------- */
  (function caseStudy() {
    const sec = $("#case"), p = projects.find((x) => x.caseStudy);
    if (!sec || sec.dataset.off || !p || route) return;   // stack pages lead with the filtered work
    const c = p.caseStudy;
    $("#caseTitle").textContent = p.title;
    $("#caseContext").textContent = c.context || "";
    $("#caseProblem").textContent = c.problem || "";
    $("#caseApproach").textContent = c.approach || "";
    $("#caseResult").textContent = c.result || "";
    $("#caseMetric").textContent = p.metric ? p.metric.value : "";
    $("#caseMetricLabel").textContent = p.metric ? p.metric.label : "";
    $("#caseLinks").innerHTML = `<a href="${esc(safeUrl(p.link))}" target="_blank" rel="noopener">Live ↗</a><a href="${esc(safeUrl(p.repo))}" target="_blank" rel="noopener">Source ↗</a>`;
    $("#caseSample").hidden = !p.sample;
    const base = `work.projects.${p._i}`;
    [["#caseTitle", "title"], ["#caseContext", "caseStudy.context"], ["#caseProblem", "caseStudy.problem"], ["#caseApproach", "caseStudy.approach"],
      ["#caseResult", "caseStudy.result"], ["#caseMetric", "metric.value"], ["#caseMetricLabel", "metric.label"]].forEach(([sel, k]) => { $(sel).dataset.path = `${base}.${k}`; });
    sec.hidden = false;
  })();

  /* ---------- references ---------- */
  (function references() {
    const sec = $("#references"), box = $("#refs"), refs = S.references.items || [];
    if (!sec || sec.dataset.off || !box || !refs.length) return;
    box.innerHTML = refs.map((r, i) => `
      <figure class="ref reveal" style="--i:${i}">
        <blockquote data-path="references.items.${i}.quote">${esc(r.quote)}</blockquote>
        <figcaption><strong data-path="references.items.${i}.name">${esc(r.name)}</strong><span class="muted" data-path="references.items.${i}.role">${esc(r.role)}</span>${r.sample ? '<span class="sample-tag">Example, replace with a real reference</span>' : ""}</figcaption>
      </figure>`).join("");
    sec.hidden = false;
    $$(".ref", box).forEach((el) => revealIO.observe(el));
  })();

  /* ---------- projects: rows, filters, stack routes ---------- */
  (function projectRows() {
    const list = $("#projectGrid"), filters = $("#filters"), empty = $("#emptyState"), banner = $("#stackBanner");
    const F = S.work.filters || [];
    const labelOf = Object.fromEntries(F.map((f) => [f.key, f.label]));
    const activeSlug = route && route.slug;
    const meta = (p) => {
      const parts = [];
      if (p.ci) parts.push(`<span class="ok">CI ${esc(p.ci)}</span>`);
      if (p.tests) parts.push(`<span>${esc(p.tests)} tests</span>`);
      if (p.coverage) parts.push(`<span>${esc(p.coverage)} coverage</span>`);
      return parts.length ? `<p class="row-meta">${parts.join("")}</p>` : "";
    };
    const rowIO = new IntersectionObserver((entries) => entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("in"); rowIO.unobserve(en.target); } }), { threshold: 0.1, rootMargin: "0px 0px -4% 0px" });
    const rowHTML = (p, i) => `
      <article class="row" style="--i:${i % 6}">
        <div class="row-main">
          <div class="row-head"><h3 data-path="work.projects.${p._i}.title">${esc(p.title)}</h3><span class="row-year">${esc(p.year)}</span>${p.sample ? '<span class="sample-tag">Example</span>' : ""}</div>
          <p class="row-blurb" data-path="work.projects.${p._i}.blurb">${esc(p.blurb)}</p>
          ${p.outcome ? `<p class="row-outcome"><span class="k">Outcome</span><span data-path="work.projects.${p._i}.outcome">${esc(p.outcome)}</span></p>` : ""}
          ${meta(p)}
        </div>
        <div class="row-side">
          ${p.metric ? `<p class="row-metric"><b data-path="work.projects.${p._i}.metric.value">${esc(p.metric.value)}</b><span data-path="work.projects.${p._i}.metric.label">${esc(p.metric.label)}</span></p>` : ""}
          <span class="row-cat">${esc(labelOf[p.category] || p.category || "")}</span>
          <ul class="row-tags">${(p.tags || []).map((t) => { const s = slugify(t); return `<li><a class="stack-link${s === activeSlug ? " on" : ""}" href="/stack/${s}">${esc(t)}</a></li>`; }).join("")}</ul>
          <div class="row-links">
            ${p.link && p.link !== "#" ? `<a href="${esc(safeUrl(p.link))}" target="_blank" rel="noopener">Live ↗</a>` : ""}
            ${p.repo && p.repo !== "#" ? `<a href="${esc(safeUrl(p.repo))}" target="_blank" rel="noopener">Source ↗</a>` : ""}
          </div>
        </div>
      </article>`;
    function draw(items) {
      list.innerHTML = items.map(rowHTML).join("");
      empty.hidden = items.length > 0;
      $$(".row", list).forEach((r) => rowIO.observe(r));
    }

    if (route) {
      filters.hidden = true;
      const all = [...stacks.values()].sort((a, b) => b.projects.length - a.projects.length || a.name.localeCompare(b.name));
      const chips = all.map((s) => `<a class="stack-chip${s.slug === activeSlug ? " on" : ""}${s.projects.length ? "" : " skill-only"}" href="/stack/${s.slug}">${esc(s.name)}${s.projects.length ? `<span>${s.projects.length}</span>` : ""}</a>`).join("");
      if (activeSlug) {
        const entry = stacks.get(activeSlug);
        const name = entry ? entry.name : activeSlug;
        const items = entry ? entry.projects : [];
        $("#workTitle").textContent = `Built with ${name}`;
        $("#workLede").textContent = items.length
          ? `${items.length === 1 ? "1 project here uses" : `${items.length} projects here use`} ${name}. Each is a real repository with tests, and states the outcome it was built for.`
          : `${name} is part of the toolkit, but none of the projects listed here use it yet.`;
        banner.innerHTML = `<div class="stack-nav"><a href="/">← All work</a><a href="/stack">All stacks</a></div><div class="stack-chips">${chips}</div>`;
        empty.textContent = `No listed projects use ${name} yet.`;
        draw(items);
      } else {
        $("#workTitle").textContent = "Every stack, and the work behind it";
        $("#workLede").textContent = `${all.length} technologies across ${projects.length} projects. Pick one to see the projects that use it.`;
        banner.innerHTML = `<div class="stack-nav"><a href="/">← All work</a></div><div class="stack-chips">${chips}</div>`;
        draw(projects);
      }
      banner.hidden = false;
      return;
    }

    filters.innerHTML = F.map((f) => `<button class="filter" type="button" data-key="${esc(f.key)}" aria-pressed="${f.key === "all"}">${esc(f.label)}</button>`).join("");
    const byKey = (key) => (key === "all" ? projects : projects.filter((p) => p.category === key));
    filters.addEventListener("click", (e) => {
      const btn = e.target.closest(".filter");
      if (!btn || btn.getAttribute("aria-pressed") === "true") return;
      $$(".filter", filters).forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
      const rows = $$(".row", list);
      if (reduceMotion || !rows.length) return draw(byKey(btn.dataset.key));
      rows.forEach((r) => r.classList.add("is-leaving"));
      setTimeout(() => draw(byKey(btn.dataset.key)), 220);
    });
    draw(projects);
  })();

  /* ---------- section art: a live panel beside each heading, built from the data ---------- */
  (function sectionArt() {
    const svg = (w, h, inner) => `<svg viewBox="0 0 ${w} ${h}" role="presentation" focusable="false">${inner}</svg>`;
    const T = (x, y, s, cls = "", anchor = "start", d = 0) => `<text x="${x}" y="${y}" class="${cls}" text-anchor="${anchor}" style="--d:${d}s">${esc(s)}</text>`;
    const panel = (title, meta, body, foot) => `<div class="panel"><div class="panel-bar"><span class="panel-title">${title}</span><span class="panel-meta">${meta}</span></div>
      <div class="panel-body">${body}</div>${foot != null ? `<div class="panel-foot">${foot}</div>` : ""}</div>`;
    const norm = (s) => String(s).toLowerCase().replace(/\s+\d+(\.\d+)*$/, "").trim();
    const thisYear = new Date().getFullYear();
    const wait = (timers) => (fn, ms) => timers.push(setTimeout(fn, ms));

    const builders = {
      /* control vs. with-the-change, ending on the case study's real metric */
      case(el) {
        const p = projects.find((x) => x.caseStudy) || {};
        const val = p.metric ? String(p.metric.value) : "";
        const m = /^-(\d+(?:\.\d+)?)%$/.exec(val);
        const pct = Math.min(55, m ? +m[1] : 35);
        const W = 440, H = 190, L = 30, R = 424, top = 30, bot = 158;
        const X = (i) => L + i * ((R - L) / 7), Y = (v) => bot - (v - 40) * ((bot - top) / 70);
        const ctl = [96, 98, 95, 97, 96, 98, 95, 97];
        const trt = [97, 96, 96 - pct * 0.35, 96 - pct * 0.7, 98 - pct * 0.95, 100 - pct, 101 - pct, 100 - pct];
        const pts = (a, from = 0) => a.slice(from).map((v, j) => [X(from + j), Y(v)]);
        const line = (a) => "M" + pts(a).map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(" L");
        const gap = "M" + [...pts(ctl, 1), ...pts(trt, 1).reverse()].map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(" L") + " Z";
        const xs = (X(1) + X(2)) / 2;
        const grid = [50, 70, 90, 110].map((v) => `<path class="grid" d="M${L} ${Y(v).toFixed(1)} H${R}"/>`).join("");
        const weeks = ctl.map((_, i) => `<path class="tick" d="M${X(i)} ${bot} V${bot + 4}"/>${T(X(i), bot + 16, `wk ${i + 1}`, "fade", "middle", 0.1 + i * 0.04)}`).join("");
        const body = svg(W, H, `${grid}<path class="axis" d="M${L} ${bot} H${R}"/>${weeks}
          <path class="gap fade" style="--d:.9s" d="${gap}"/>
          <path class="guide fade" style="--d:.2s" d="M${xs} ${top - 8} V${bot}"/>
          <g class="fade" style="--d:.3s"><rect class="flag" x="${xs + 6}" y="${top - 18}" width="62" height="16" rx="3"/>${T(xs + 37, top - 7, "flag on", "flag-t", "middle")}</g>
          <path class="ln draw" pathLength="1" style="--d:.2s" d="${line(ctl)}"/>
          <path class="ln acc draw" pathLength="1" style="--d:.5s" d="${line(trt)}"/>
          ${trt.map((v, i) => `<circle class="pt fade" style="--d:${(0.6 + i * 0.13).toFixed(2)}s" cx="${X(i)}" cy="${Y(v).toFixed(1)}" r="2.2"/>`).join("")}
          <circle class="dot fade" style="--d:1.2s" cx="${X(7)}" cy="${Y(trt[7]).toFixed(1)}" r="4"/><circle class="pulse fade" style="--d:1.2s" cx="${X(7)}" cy="${Y(trt[7]).toFixed(1)}" r="4"/>
          ${T(R, Y(ctl[7]) - 9, "control", "fade", "end", 1.4)}${T(R - 10, Y(trt[7]) - 10, "with the change", "fade accent", "end", 1.3)}`);
        el.innerHTML = panel(`${esc(slugify(p.title || "case"))} · experiment`, `<span class="live ok">${esc(val || "measured")}</span>`, body,
          `<span><i class="sw"></i>control</span><span><i class="sw acc"></i>with the change</span><span class="push">${esc(p.metric ? p.metric.label : "")}</span>`);
      },

      /* a CI run for each project in turn: jobs, tests, coverage, then the outcome */
      work(el) {
        const pool = (route && route.slug && stacks.get(route.slug) ? stacks.get(route.slug).projects : projects).filter((p) => p.tests);
        if (!pool.length) return null;
        const jobs = ["lint", "test", "build", "deploy"];
        const files = [["core/", "algorithm"], ["schema.sql", "schema"], ["tests/", ""], ["web/", "interface"]];
        el.innerHTML = panel(`<span class="w-repo">repo/</span>`, `<span class="live w-ci">queued</span>`,
          `<div class="w-grid">
            <ul class="w-tree">${files.map(([f, note], i) => `<li><span>${i === files.length - 1 ? "└─" : "├─"} ${f}</span><em${f === "tests/" ? ' class="w-tn"' : ""}>${note}</em></li>`).join("")}</ul>
            <ul class="w-jobs">${jobs.map((j) => `<li><span class="w-st"></span><span class="w-name">${j}</span><span class="w-bar"><i></i></span><span class="w-val"></span></li>`).join("")}</ul>
          </div>
          <div class="w-out"><div class="w-covrow"><span>coverage</span><span class="w-cov"><i></i></span><span class="w-covv">–</span></div>
            <div class="w-metric"><strong class="w-mv"></strong><span class="w-ml"></span></div></div>`,
          `<span class="w-tags"></span><span class="push w-idx"></span>`);
        const $e = (s) => $(s, el), lis = $$(".w-jobs li", el);
        let k = 0, timers = [], running = false, gen = 0;
        const later = wait(timers);
        function show(p, animate) {
          const run = ++gen;
          const covPct = parseFloat(p.coverage) || 0;
          $e(".w-repo").textContent = `${slugify(p.title)}/`;
          $e(".w-tags").textContent = (p.tags || []).slice(0, 4).join(" · ");
          $e(".w-idx").textContent = `${(k % pool.length) + 1} / ${pool.length}${p.year ? ` · ${p.year}` : ""}`;
          $e(".w-mv").textContent = p.metric ? p.metric.value : "";
          $e(".w-ml").textContent = p.metric ? p.metric.label : "";
          const ci = $e(".w-ci"), metric = $e(".w-metric"), cov = $e(".w-cov i"), covv = $e(".w-covv"), tn = $e(".w-tn");
          const vals = ["clean", `${p.tests} passing`, "ok", p.link && p.link !== "#" ? "live" : "ok"];
          const finish = () => {
            lis.forEach((li, i) => { li.className = "done"; $(".w-bar i", li).style.width = "100%"; $(".w-val", li).textContent = vals[i]; });
            ci.textContent = p.ci || "passing"; ci.classList.add("ok");
            cov.style.width = `${covPct}%`; covv.textContent = p.coverage || "–"; tn.textContent = `${p.tests} tests`;
            metric.classList.add("show");
          };
          if (!animate) return finish();
          lis.forEach((li) => { li.className = ""; $(".w-bar i", li).style.width = "0"; $(".w-val", li).textContent = ""; });
          ci.textContent = "running"; ci.classList.remove("ok"); metric.classList.remove("show");
          cov.style.width = "0"; covv.textContent = "–"; tn.textContent = "";
          lis.forEach((li, i) => {
            const t0 = 250 + i * 650;
            later(() => { li.className = "run"; $(".w-bar i", li).style.width = "100%"; }, t0);
            if (i === 1) later(() => {
              const begin = performance.now(), dur = 560, val = $(".w-val", li);
              (function tick() {
                const f = Math.min(1, Math.max(0, (performance.now() - begin) / dur));
                val.textContent = `${Math.round(p.tests * (1 - Math.pow(1 - f, 3)))}`;
                tn.textContent = `${Math.round(p.tests * f)} tests`;
                if (f < 1 && running && run === gen) requestAnimationFrame(tick);
              })();
            }, t0);
            later(() => { li.className = "done"; $(".w-val", li).textContent = vals[i]; }, t0 + 600);
          });
          const end = 250 + jobs.length * 650;
          later(() => { ci.textContent = p.ci || "passing"; ci.classList.add("ok"); cov.style.width = `${covPct}%`; covv.textContent = p.coverage || "–"; }, end);
          later(() => metric.classList.add("show"), end + 300);
          later(() => { if (running) { k++; show(pool[k % pool.length], true); } }, end + 3600);
        }
        return {
          start() { if (running) return; running = true; show(pool[k % pool.length], !reduceMotion); },
          stop() { running = false; timers.forEach(clearTimeout); timers = []; },
        };
      },

      /* the references as a review thread that ends approved */
      references(el) {
        const refs = (S.references.items || []).filter((r) => r.quote).slice(0, 3);
        if (!refs.length) return null;
        const initials = (r) => (String(r.role || r.name || "").match(/[A-Za-z]+/g) || ["?"]).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
        el.innerHTML = panel("review thread", `<span class="live">${refs.length} reviewer${refs.length > 1 ? "s" : ""}</span>`,
          `<div class="r-list">${refs.map((r) => `<div class="r-row"><span class="r-av">${esc(initials(r))}</span><div>
            <div class="r-meta"><span class="r-who">${esc(r.role || r.name)}</span><span class="r-ok">✓ approved</span></div>
            <p class="r-q"></p></div></div>`).join("")}</div>`,
          `<span class="r-merge">awaiting review</span><span class="push">${refs.some((r) => r.sample) ? "example references" : "references on request"}</span>`);
        const rows = $$(".r-row", el), merge = $(".r-merge", el);
        let timers = [], running = false;
        const later = wait(timers);
        const text = refs.map((r) => `“${clip(r.quote, 118)}”`);
        function finish() {
          rows.forEach((row, i) => { row.classList.add("show"); $(".r-q", row).textContent = text[i]; $(".r-ok", row).classList.add("show"); });
          merge.textContent = `✓ approved by ${refs.length} · merged`; merge.classList.add("ok");
        }
        function play() {
          rows.forEach((row) => { row.classList.remove("show"); $(".r-q", row).textContent = ""; $(".r-ok", row).classList.remove("show"); });
          merge.textContent = "awaiting review"; merge.classList.remove("ok");
          let t = 200;
          rows.forEach((row, i) => {
            later(() => row.classList.add("show"), t);
            const q = $(".r-q", row), s = text[i];
            for (let c = 1; c <= s.length; c += 2) later(() => { q.textContent = s.slice(0, c); }, t + 250 + c * 9);
            later(() => { q.textContent = s; $(".r-ok", row).classList.add("show"); }, t + 300 + s.length * 9);
            t += 600 + s.length * 9;
          });
          later(() => { merge.textContent = `✓ approved by ${refs.length} · merged`; merge.classList.add("ok"); }, t);
          later(() => { if (running) play(); }, t + 4200);
        }
        return {
          start() { if (running) return; running = true; reduceMotion ? finish() : play(); },
          stop() { running = false; timers.forEach(clearTimeout); timers = []; },
        };
      },

      /* every role on a real time axis, with the tools named in it; a cursor replays the career */
      experience(el) {
        const roles = (S.experience.items || []).map((it) => {
          const ys = (String(it.dates || "").match(/\b(?:19|20)\d{2}\b/g) || []).map(Number);
          const to = /present|now|current/i.test(it.dates || "") ? thisYear : ys[1] || ys[0];
          return { from: ys[0], to, title: String(it.title || ""), org: String(it.org || ""), text: `${it.title || ""} ${it.text || ""}` };
        }).filter((r) => r.from).sort((a, b) => a.from - b.from);
        if (!roles.length) return null;
        const tools = [];
        (S.skills.groups || []).forEach((g) => (g.items || []).forEach((it) => String(it).split("/").forEach((s) => {
          const n = s.trim().replace(/\s+\d+(\.\d+)*$/, "");
          if (n && !tools.some((x) => x.toLowerCase() === n.toLowerCase())) tools.push(n);
        })));
        const reOf = (s) => new RegExp("(^|[^a-z0-9])" + s.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "([^a-z0-9]|$)");
        roles.forEach((r) => { r.tools = tools.filter((t) => reOf(t).test(r.text.toLowerCase())); });
        const used = new Set(roles.flatMap((r) => r.tools));
        const y0 = roles[0].from, y1 = Math.max(thisYear, ...roles.map((r) => r.to)), span = Math.max(1, y1 - y0);
        const W = 440, L = 12, R = 428, lane = 46, top = 26, H = top + roles.length * lane + 28;
        const X = (y) => L + ((y - y0) / span) * (R - L);
        const step = span > 8 ? 2 : 1;
        let years = "";
        for (let y = y0; y <= y1; y++) {
          years += `<path class="yr" d="M${X(y).toFixed(1)} ${top - 6} V${H - 24}"/>`;
          if ((y - y0) % step === 0 || y === y1) years += T(X(y), H - 10, y === y1 ? "now" : String(y), "fade", y === y0 ? "start" : y === y1 ? "end" : "middle", 0.1);
        }
        const lanes = roles.map((r, i) => {
          const yy = top + i * lane, x = X(r.from), w = Math.max(18, X(r.to) - x);
          const label = `${r.title}${r.org ? ` · ${r.org}` : ""}`;
          const anchorEnd = x + label.length * 5.4 > R;
          return `<g class="lane" data-from="${r.from}" data-to="${r.to}">
            ${T(anchorEnd ? R : x, yy + 2, clip(label, 70), "rt fade", anchorEnd ? "end" : "start", 0.3 + i * 0.15)}
            <rect class="bar" x="${x.toFixed(1)}" y="${yy + 8}" width="${w.toFixed(1)}" height="8" rx="2" style="--o:${(0.35 + (0.6 * (i + 1)) / roles.length).toFixed(2)};--d:${(0.2 + i * 0.18).toFixed(2)}s"/>
            ${T(anchorEnd ? R : x, yy + 30, r.tools.slice(0, 6).join(" · ").toLowerCase(), "tech fade", anchorEnd ? "end" : "start", 0.6 + i * 0.15)}</g>`;
        }).join("");
        el.innerHTML = panel("career.log", `<span class="live">now · ${esc(clip(roles[roles.length - 1].title, 28))}</span>`,
          svg(W, H, `${years}${lanes}<g class="cursor fade" style="--d:1.2s"><path d="M0 ${top - 10} V${H - 24}"/><rect class="cursor-tag" x="-17" y="${top - 22}" width="34" height="13" rx="3"/><text class="cursor-t" x="0" y="${top - 12.5}" text-anchor="middle">${y1}</text></g>`),
          `<span>${roles.length} roles</span><span>${y1 - y0} years</span><span>${used.size} tools named in the work</span>`);
        const cursor = $(".cursor", el), label = $(".cursor-t", el), gs = $$(".lane", el);
        let raf = 0, running = false, timer = 0;
        const place = (y) => {
          cursor.setAttribute("transform", `translate(${X(Math.min(y1, y)).toFixed(1)} 0)`);
          label.textContent = Math.floor(Math.min(y1, y));
          gs.forEach((g) => { const on = y >= +g.dataset.from && y <= +g.dataset.to + 0.999; g.classList.toggle("cur", on); g.classList.toggle("dim", !on); });
        };
        function sweep() {
          const begin = performance.now(), dur = 900 * span;
          (function tick() {
            if (!running) return;
            const f = Math.min(1, Math.max(0, (performance.now() - begin) / dur));
            place(y0 + f * span);
            if (f < 1) raf = requestAnimationFrame(tick);
            else timer = setTimeout(() => { if (running) sweep(); }, 3200);
          })();
        }
        place(y1);
        return {
          start() { if (running) return; running = true; if (reduceMotion) return place(y1); timer = setTimeout(sweep, 1400); },
          stop() { running = false; cancelAnimationFrame(raf); clearTimeout(timer); },
        };
      },

      /* every skill as a node; each project lights the tools it was built with */
      skills(el) {
        const groups = (S.skills.groups || []).filter((g) => (g.items || []).length).slice(0, 6);
        const pool = projects.filter((p) => (p.tags || []).length);
        if (!groups.length || !pool.length) return null;
        const W = 440, colW = W / groups.length, rowH = 17, top = 40;
        const rows = Math.min(8, Math.max(...groups.map((g) => g.items.length)));
        const H = top + rows * rowH;
        const nodes = [];
        groups.forEach((g, gi) => g.items.slice(0, rows).forEach((it, ri) => nodes.push({
          gi, x: gi * colW + 6, y: top + ri * rowH, keys: String(it).split("/").map(norm), label: String(it),
        })));
        const heads = groups.map((g, gi) => T(gi * colW + 2, 16, clip(g.name.split("/")[0].trim(), 10), "gh fade", "start", 0.1 + gi * 0.06)).join("");
        const dots = nodes.map((n, i) => `<circle class="sn fade" style="--d:${(0.2 + n.gi * 0.08).toFixed(2)}s" data-i="${i}" cx="${n.x}" cy="${n.y}" r="2.6"/>
          <text class="nl fade" style="--d:${(0.25 + n.gi * 0.08).toFixed(2)}s" data-i="${i}" x="${n.x + 7}" y="${n.y + 3}">${esc(clip(n.label, 11))}</text>`).join("");
        el.innerHTML = panel(`pick --for <span class="s-name"></span>`, `<span class="live s-count"></span>`,
          svg(W, H, `<path class="axis" d="M0 24 H${W}"/>${heads}<path class="sm-path" pathLength="1" d=""/>${dots}`),
          `<span class="s-out"></span><span class="push s-extra"></span>`);
        const path = $(".sm-path", el), circles = $$(".sn", el), labels = $$(".nl", el);
        let k = 0, timer = 0, running = false;
        function show(p) {
          const tags = (p.tags || []).map(norm);
          const lit = nodes.map((n, i) => (n.keys.some((key) => tags.includes(key)) ? i : -1)).filter((i) => i >= 0);
          const hit = new Set(lit.flatMap((i) => nodes[i].keys));
          circles.forEach((c, i) => c.classList.toggle("lit", lit.includes(i)));
          labels.forEach((t, i) => t.classList.toggle("lit", lit.includes(i)));
          const pts = lit.map((i) => nodes[i]).sort((a, b) => a.gi - b.gi || a.y - b.y);
          let d = pts.length ? `M${pts[0].x} ${pts[0].y}` : "";
          for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i], mx = (a.x + b.x) / 2; d += ` C${mx} ${a.y} ${mx} ${b.y} ${b.x} ${b.y}`; }
          path.setAttribute("d", d);
          path.classList.remove("go"); void path.getBoundingClientRect(); path.classList.add("go");
          $(".s-name", el).textContent = slugify(p.title);
          $(".s-count", el).textContent = `${lit.length} of ${nodes.length} tools`;
          $(".s-out", el).textContent = clip(p.outcome || p.blurb, 64);
          const extra = (p.tags || []).filter((t) => !hit.has(norm(t)));
          $(".s-extra", el).textContent = extra.length ? `+ ${extra.slice(0, 2).join(", ")}` : "";
        }
        function next() { if (!running) return; show(pool[k++ % pool.length]); timer = setTimeout(next, 3400); }
        return {
          start() { if (running) return; running = true; if (reduceMotion) return show(pool[0]); next(); },
          stop() { running = false; clearTimeout(timer); },
        };
      },

      /* the team as a hub: work comes in from one function and goes out, shipped, to another */
      about(el) {
        const team = (S.about.team || []).slice(0, 8);
        if (!team.length) return null;
        const W = 440, H = 214, cx = 220, cy = 104, rx = 170, ry = 76;
        const pts = team.map((t, i) => {
          const a = -Math.PI / 2 + (i * 2 * Math.PI) / team.length;
          return { t, x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) };
        });
        const pills = pts.map((p, i) => {
          const w = Math.max(44, String(p.t).length * 6.2 + 18);
          return `<g class="pill fade" style="--d:${(0.4 + i * 0.08).toFixed(2)}s" data-i="${i}"><rect x="${(p.x - w / 2).toFixed(1)}" y="${(p.y - 10).toFixed(1)}" width="${w.toFixed(1)}" height="20" rx="10"/>${T(p.x.toFixed(1), (p.y + 3.5).toFixed(1), p.t, "", "middle")}</g>`;
        }).join("");
        const spokes = pts.map((p, i) => `<path class="spoke draw" pathLength="1" style="--d:${(0.1 + i * 0.06).toFixed(2)}s" data-i="${i}" d="M${cx} ${cy} L${p.x.toFixed(1)} ${p.y.toFixed(1)}"/>`).join("");
        el.innerHTML = panel("team.graph", `<span class="live">${team.length} functions</span>`,
          svg(W, H, `<ellipse class="orbit" cx="${cx}" cy="${cy}" rx="${rx + 16}" ry="${ry + 16}"/><ellipse class="orbit in" cx="${cx}" cy="${cy}" rx="${rx * 0.55}" ry="${ry * 0.55}"/>
            ${spokes}${pills}
            <circle class="pulse" cx="${cx}" cy="${cy}" r="24"/><circle class="hub" cx="${cx}" cy="${cy}" r="24"/>${T(cx, cy + 4.5, S.meta.initials || "me", "hub-t", "middle")}
            <circle class="packet" r="3.2" cx="${cx}" cy="${cy}" opacity="0"/>`),
          `<span class="a-flow">request → build → ship</span><span class="push">the team ships</span>`);
        const packet = $(".packet", el), flow = $(".a-flow", el), spokeEls = $$(".spoke", el), pillEls = $$(".pill", el);
        let raf = 0, timer = 0, running = false, k = 0;
        const move = (a, b, dur, done) => {
          const begin = performance.now();
          (function tick() {
            if (!running) return;
            const f = Math.min(1, (performance.now() - begin) / dur), e = f < 0.5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2;
            packet.setAttribute("cx", (a.x + (b.x - a.x) * e).toFixed(1)); packet.setAttribute("cy", (a.y + (b.y - a.y) * e).toFixed(1));
            if (f < 1) raf = requestAnimationFrame(tick); else done();
          })();
        };
        const mark = (i, cls, on) => { spokeEls[i].classList.toggle("lit", on); pillEls[i].classList.toggle(cls, on); };
        function exchange() {
          if (!running) return;
          const from = k % pts.length, to = (k + 1 + Math.floor(pts.length / 2)) % pts.length; k++;
          const hub = { x: cx, y: cy };
          packet.setAttribute("opacity", "1"); packet.classList.remove("ok");
          mark(from, "lit", true); flow.textContent = `${pts[from].t} → ${S.meta.initials || "me"} → ${pts[to].t}`;
          move(pts[from], hub, 900, () => {
            mark(from, "lit", false);
            packet.classList.add("ok"); spokeEls[to].classList.add("lit");
            move(hub, pts[to], 900, () => {
              mark(to, "ok", true); spokeEls[to].classList.remove("lit"); packet.setAttribute("opacity", "0");
              timer = setTimeout(() => { pillEls[to].classList.remove("ok"); exchange(); }, 900);
            });
          });
        }
        return {
          start() { if (running) return; running = true; if (!reduceMotion) timer = setTimeout(exchange, 900); },
          stop() { running = false; cancelAnimationFrame(raf); clearTimeout(timer); packet.setAttribute("opacity", "0"); },
        };
      },

      /* a contact sheet of the uploaded images, with a viewfinder moving across it */
      gallery(el) {
        const items = ((S.gallery && S.gallery.items) || []).slice(0, 6);
        if (!items.length) return null;
        el.innerHTML = panel("contact-sheet", `<span class="live">${S.gallery.items.length} image${S.gallery.items.length > 1 ? "s" : ""}</span>`,
          `<div class="cs-grid" style="--n:${Math.min(3, items.length)}">${items.map((g, i) => `<span class="cs-cell" data-i="${i}"><img src="${esc(safeUrl(g.src))}" alt="" loading="lazy" decoding="async"><b>${String(i + 1).padStart(2, "0")}</b></span>`).join("")}</div>`,
          `<span class="cs-cap"></span><span class="push">click any image to open it</span>`);
        const cells = $$(".cs-cell", el), capEl = $(".cs-cap", el);
        let k = 0, timer = 0, running = false;
        const show = (i) => { cells.forEach((c, j) => c.classList.toggle("on", j === i)); capEl.textContent = items[i].caption || items[i].alt || `image ${i + 1}`; };
        function next() { if (!running) return; show(k++ % items.length); timer = setTimeout(next, 2000); }
        return {
          start() { if (running) return; running = true; if (reduceMotion) return show(0); next(); },
          stop() { running = false; clearTimeout(timer); },
        };
      },

      /* a custom list section: its entries tick off one by one */
      custom(el, sec) {
        const c = (S.customSections || [])[+sec.dataset.custom];
        const items = ((c && c.items) || []).filter((x) => x && (x.k || x.v)).slice(0, 6);
        if (!items.length) return null;
        el.innerHTML = panel(`${esc(customId(c).slice(2))}.log`, `<span class="live">${c.items.length} entr${c.items.length > 1 ? "ies" : "y"}</span>`,
          `<ul class="ck-list">${items.map((x) => `<li><span class="ck-box"></span><span class="ck-k">${esc(clip(x.k || x.v, 40))}</span><span class="ck-v">${esc(clip(x.k ? x.v : "", 34))}</span></li>`).join("")}</ul>`,
          `<span class="ck-done">0 / ${items.length}</span><span class="push">${items.some((x) => x.link) ? "with links" : ""}</span>`);
        const lis = $$(".ck-list li", el), done = $(".ck-done", el);
        let timers = [], running = false;
        const later = wait(timers);
        function play() {
          lis.forEach((li) => li.classList.remove("on")); done.textContent = `0 / ${items.length}`;
          lis.forEach((li, i) => later(() => { li.classList.add("on"); done.textContent = `${i + 1} / ${items.length}`; }, 400 + i * 550));
          later(() => { if (running) play(); }, 400 + items.length * 550 + 3600);
        }
        return {
          start() { if (running) return; running = true; if (reduceMotion) { lis.forEach((li) => li.classList.add("on")); done.textContent = `${items.length} / ${items.length}`; return; } play(); },
          stop() { running = false; timers.forEach(clearTimeout); timers = []; },
        };
      },
    };
    const loops = new Map();
    const artIO = new IntersectionObserver((entries) => entries.forEach((en) => {
      const ctl = loops.get(en.target);
      if (en.isIntersecting) { en.target.classList.add("on"); if (ctl) ctl.start(); } else if (ctl) ctl.stop();
    }), { threshold: 0.25 });
    const targets = [...Object.keys(builders).map((id) => [id, builders[id]]), ...$$("section.custom-sec").map((s) => [s.id, builders.custom])];
    targets.forEach(([id, build]) => {
      const sec = document.getElementById(id), head = sec && $(".section-head", sec);
      if (!head || sec.hidden) return;
      const art = document.createElement("div");
      art.className = "head-art"; art.setAttribute("aria-hidden", "true");
      const rows = head.children.length;
      head.classList.add("has-art"); head.appendChild(art);
      art.style.gridRow = `1 / span ${Math.max(rows, 1)}`;
      const ctl = build(art, sec);
      if (ctl === null && !art.innerHTML) { art.remove(); head.classList.remove("has-art"); return; }
      if (ctl) loops.set(art, ctl);
      artIO.observe(art);
    });
  })();

  /* ---------- background: the page as one main branch; each section merges in, ending at shipped ---------- */
  (function pathToSuccess() {
    if (route) return;
    const main = $("main"), host = document.createElement("div");
    host.className = "bg-graph"; host.setAttribute("aria-hidden", "true");
    document.body.insertBefore(host, main);
    let state = null, queued = false;
    const docY = (el) => el.getBoundingClientRect().top + window.scrollY;
    function build() {
      const wrap = $(".section .wrap") || $(".wrap");
      const gutter = wrap.getBoundingClientRect().left;
      if (gutter < 72) { host.hidden = true; state = null; return; }
      host.hidden = false;
      const x = Math.round(gutter > 220 ? gutter - 96 : gutter - 46), bx = x + 22;
      const band = $(".pipeline-band"), contact = $("#contact");
      const yStart = band ? docY(band) + band.offsetHeight + 24 : 120;
      const yGoal = contact ? docY(contact) + 120 : main.offsetHeight - 200;
      const height = docY(main) + main.offsetHeight;
      const showLabels = x > 90;
      const secs = $$("main > section.section:not([hidden])").filter((s) => s.id && s.id !== "contact");
      let out = "", nodes = [];
      secs.forEach((s, i) => {
        const t = docY(s), b = t + s.offsetHeight, f = t + 36, m = b - 36;
        if (m - f < 160) return;
        const d = `M${x} ${f} C${x} ${f + 22} ${bx} ${f + 12} ${bx} ${f + 34} V${m - 34} C${bx} ${m - 12} ${x} ${m - 22} ${x} ${m}`;
        out += `<path class="g-br" data-y="${m}" d="${d}"/>`;
        const n = Math.min(6, Math.max(1, Math.floor((m - f - 120) / 130)));
        for (let j = 1; j <= n; j++) {
          const cy = f + 40 + ((m - f - 80) * j) / (n + 1);
          out += `<circle class="g-c" data-y="${cy.toFixed(0)}" cx="${bx}" cy="${cy.toFixed(0)}" r="2.6"/>`;
        }
        out += `<circle class="g-m" data-y="${m}" cx="${x}" cy="${m}" r="4"/>`;
        const name = ($(".eyebrow", s) || {}).textContent || s.id;
        if (showLabels) out += `<text class="g-t" data-y="${m}" x="${x - 12}" y="${m + 3}" text-anchor="end">${esc(clip(name.trim(), 16))}</text>`;
        if (!reduceMotion) out += `<circle class="g-p" r="2"><animateMotion dur="${(5 + i * 0.7).toFixed(1)}s" repeatCount="indefinite" path="${d}"/></circle>`;
        nodes.push(m);
      });
      const goal = `<circle class="g-goal" cx="${x}" cy="${yGoal}" r="8"/><path class="g-check" d="M${x - 3.5} ${yGoal} l2.5 2.6 l4.6 -5"/>
        ${showLabels ? `<text class="g-goal-t" x="${x - 16}" y="${yGoal + 3}" text-anchor="end">shipped</text>` : ""}`;
      host.innerHTML = `<svg width="${x + 40}" height="${height}" viewBox="0 0 ${x + 40} ${height}">
        <path class="g-main" d="M${x} ${yStart} V${yGoal}"/><line class="g-fill" x1="${x}" y1="${yStart}" x2="${x}" y2="${yStart}"/>
        <circle class="g-m on" cx="${x}" cy="${yStart}" r="4"/>${showLabels ? `<text class="g-t on" x="${x - 12}" y="${yStart + 3}" text-anchor="end">first commit</text>` : ""}
        ${out}${goal}<circle class="g-ring" cx="${x}" cy="${yStart}" r="4"/><circle class="g-head" cx="${x}" cy="${yStart}" r="3.5"/></svg>`;
      state = {
        yStart, yGoal,
        fill: $(".g-fill", host), head: $(".g-head", host), ring: $(".g-ring", host),
        marks: $$("[data-y]", host), goal: [$(".g-goal", host), $(".g-check", host), $(".g-goal-t", host)].filter(Boolean),
      };
      update();
    }
    function update() {
      queued = false;
      if (!state) return;
      const atEnd = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4;
      const y = atEnd ? state.yGoal : Math.min(state.yGoal, Math.max(state.yStart, window.scrollY + window.innerHeight * 0.55));
      state.fill.setAttribute("y2", y.toFixed(0));
      state.head.setAttribute("cy", y.toFixed(0)); state.ring.setAttribute("cy", y.toFixed(0));
      state.marks.forEach((m) => m.classList.toggle("on", +m.dataset.y <= y));
      state.goal.forEach((g) => g.classList.toggle("on", y >= state.yGoal - 1));
    }
    let rt = 0;
    const rebuild = () => { clearTimeout(rt); rt = setTimeout(build, 150); };
    addEventListener("scroll", () => { if (!queued) { queued = true; requestAnimationFrame(update); } }, { passive: true });
    addEventListener("resize", rebuild);
    if ("ResizeObserver" in window) new ResizeObserver(rebuild).observe(main);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(rebuild);
    build();
  })();

  /* ---------- headings rise in word by word ---------- */
  (function splitHeadings() {
    if (INLINE || reduceMotion) return;
    $$(".section-head h2, .contact-title").forEach((h) => {
      const text = h.textContent.trim();
      if (!text || h.dataset.split) return;
      h.dataset.split = "1"; h.setAttribute("aria-label", text);
      h.innerHTML = text.split(/(\s+)/).map((w, i) => /^\s+$/.test(w) ? w : `<span class="w" aria-hidden="true"><span style="--wi:${i >> 1}">${esc(w)}</span></span>`).join("");
    });
  })();

  /* ---------- results count up when they come into view ---------- */
  (function countMetrics() {
    if (reduceMotion) return;
    const io = new IntersectionObserver((entries) => entries.forEach((en) => {
      if (!en.isIntersecting) return;
      io.unobserve(en.target);
      const el = en.target, m = /^([-+−]?)(\d+(?:\.\d+)?)(\D*)$/.exec(el.textContent.trim());
      if (!m) return;
      const [, sign, num, suffix] = m, end = parseFloat(num), dec = (num.split(".")[1] || "").length, begin = performance.now();
      (function tick() {
        const f = Math.min(1, (performance.now() - begin) / 1100), v = end * (1 - Math.pow(1 - f, 3));
        el.textContent = `${sign}${v.toFixed(dec)}${suffix}`;
        if (f < 1) requestAnimationFrame(tick);
      })();
    }), { threshold: 0.6 });
    $$(".row-metric b, #caseMetric").forEach((el) => io.observe(el));
  })();

  /* ---------- contact ---------- */
  (function contact() {
    const link = $("#emailLink"), copy = $("#copyEmail"), email = (S.config && S.config.email) || "";
    if (!email) { $(".email-row").hidden = true; return; }
    link.textContent = email; link.href = `mailto:${email}`;
    copy.addEventListener("click", async () => {
      const label = $("span", copy);
      try { await navigator.clipboard.writeText(email); label.textContent = "Copied"; }
      catch (e) { const range = document.createRange(); range.selectNodeContents(link); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range); label.textContent = "Selected"; }
      setTimeout(() => { label.textContent = "Copy"; }, 1600);
    });
  })();

  /* ---------- contact methods: one row each, with copy, plus a contact card to save ---------- */
  (function methods() {
    const box = $("#methods"), list = (S.contact.methods || []).filter((m) => m && m.value);
    if (!box || !list.length) return;
    box.innerHTML = list.map((m) => {
      const i = S.contact.methods.indexOf(m), href = methodHref(m), type = METHOD_ICON[m.type] ? m.type : "other";
      const value = href
        ? `<a class="m-val" href="${esc(href)}"${/^https?:/.test(href) ? ' target="_blank" rel="noopener"' : ""} data-path="contact.methods.${i}.value">${esc(m.value)}</a>`
        : `<span class="m-val" data-path="contact.methods.${i}.value">${esc(m.value)}</span>`;
      return `<li class="m-row"><span class="m-ico" data-type="${type}" aria-hidden="true">${METHOD_ICON[type]}</span>
        <span class="m-label" data-path="contact.methods.${i}.label">${esc(m.label || m.type)}</span>${value}
        <button class="m-copy" type="button" data-copy="${esc(m.value)}" aria-label="Copy ${esc(m.label || m.type)}">Copy</button></li>`;
    }).join("") + `<li class="m-row m-card"><span class="m-ico" aria-hidden="true">⇩</span><span class="m-label">Contact card</span>
      <button class="m-val m-vcf" type="button">Save ${esc(S.meta.name)} to contacts (.vcf)</button><span></span></li>`;
    box.hidden = false;
    $(".socials").hidden = true;
    box.addEventListener("click", async (e) => {
      const c = e.target.closest(".m-copy");
      if (c) {
        try { await navigator.clipboard.writeText(c.dataset.copy); c.textContent = "Copied"; } catch (err) { c.textContent = "Press Ctrl+C"; }
        setTimeout(() => { c.textContent = "Copy"; }, 1500);
        return;
      }
      if (e.target.closest(".m-vcf")) {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([vcard(S)], { type: "text/vcard" }));
        a.download = `${slugify(S.meta.name) || "contact"}.vcf`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      }
    });
  })();

  /* ---------- gallery viewer: arrows, Esc, swipe ---------- */
  (function lightbox() {
    const items = (S.gallery && S.gallery.items) || [], dlg = $("#lightbox");
    if (!items.length || !dlg || typeof dlg.showModal !== "function") return;
    const img = $("#lbImg"), cap = $("#lbCap"), count = $("#lbCount");
    let k = 0;
    const show = (i) => {
      k = (i + items.length) % items.length;
      const g = items[k];
      img.src = safeUrl(g.src); img.alt = g.alt || "";
      cap.textContent = g.caption || ""; count.textContent = `${k + 1} / ${items.length}`;
      $("#lbPrev").hidden = $("#lbNext").hidden = items.length < 2;
    };
    $("#galleryGrid").addEventListener("click", (e) => { const b = e.target.closest(".g-open"); if (b) { show(+b.dataset.g); dlg.showModal(); } });
    $("#lbPrev").addEventListener("click", () => show(k - 1));
    $("#lbNext").addEventListener("click", () => show(k + 1));
    $("#lbClose").addEventListener("click", () => dlg.close());
    dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
    dlg.addEventListener("keydown", (e) => { if (e.key === "ArrowLeft") show(k - 1); if (e.key === "ArrowRight") show(k + 1); });
    let x0 = null;
    dlg.addEventListener("touchstart", (e) => { x0 = e.touches[0].clientX; }, { passive: true });
    dlg.addEventListener("touchend", (e) => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 50) show(k + (dx < 0 ? 1 : -1)); x0 = null; });
  })();
}

/* ================================================================== */
(async function boot() {
  const raw = await loadSite();
  if (!raw) { document.body.insertAdjacentHTML("afterbegin", '<p style="padding:2rem">Could not load site data.</p>'); return; }
  const route = stackRoute();
  const focus = route ? "" : (focusRoute() ?? ((raw.focus && raw.focus.home) || ""));
  const preset = findPreset(raw, focus);
  intro(raw, preset ? presetRole(raw, preset) : "");
  // let the intro paint its first frame before the page is built underneath it
  if (document.documentElement.classList.contains("intro")) await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const S = fillCounts(raw, await siteCounts(raw));
  applyFocus(S, focus);
  const stacks = stackIndex(S);
  // stack pages open on the filtered work, so the hero and pipeline step aside
  if (route) { document.documentElement.classList.add("stack-page"); $(".hero").hidden = true; $(".pipeline-band").hidden = true; }
  render(S, route, stacks);
  start(S, route, stacks);
  if (INLINE) enableInline(raw, S); else ownerShortcut();
})();
