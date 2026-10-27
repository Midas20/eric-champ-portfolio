/* ==================================================================
   Portfolio editor
   Opened at /edit/<key>. Loads /api/site, renders a form for every
   field, previews drafts on the real page, publishes with PUT.
   ================================================================== */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const slugify = (s) => String(s).toLowerCase().replace(/\+/g, "-plus").replace(/#/g, "-sharp").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/* ---------- key ---------- */
let KEY = (() => {
  const m = location.pathname.match(/^\/edit\/([^/]+)/);
  if (m) return decodeURIComponent(m[1]);
  try { return localStorage.getItem("editor-session") || sessionStorage.getItem("edit-key") || ""; } catch (e) { return ""; }
})();
const api = (path, opts = {}) => fetch(path, { cache: "no-store", ...opts, headers: { "content-type": "application/json", authorization: `Bearer ${KEY}`, ...(opts.headers || {}) } });

/* ---------- state ---------- */
let draft = null, saved = "", section = "hero", jsonMode = false, versions = [], online = true;
const filters = new Map();   // list filter text survives re-renders
const v_ = (path) => getAt(path);
const open = new Set();          // open item paths survive re-renders
const isDirty = () => JSON.stringify(draft) !== saved;

/* ---------- copy for the UI ---------- */
const SECTIONS = {
  meta: ["Name & search", "Your name, initials and the title and description search engines and link previews show."],
  config: ["Links & email", "Email, GitHub and LinkedIn are used everywhere on the page. Leave LinkedIn empty to hide it."],
  nav: ["Navigation", "Labels in the top bar."],
  intro: ["Intro", "The first-visit animation: a few short lines about you, each drawn as a symbol (ai, speed, migrate, scale, security, web, mobile, data, cloud, devops, api, fintech, games). The first line always shows, then two others, a different pair each visit."],
  abilities: ["Abilities", "What you can do, each with its proof: a plain sentence (I make slow systems fast), where you proved it, the before and after values (the change, like 10× faster, is worked out for you) and a few short steps. Each one can link to a project by its page name, for example crossmarket for /work/crossmarket."],
  hero: ["Hero", "The first screen: headline, intro, buttons, stats and the layer stack. Numbers can be calculated for you: write {repos} (your own GitHub repositories, live), {years} (from your experience dates), {projects}, {stacks} or {layers} in a stat value or any text."],
  pipeline: ["Pipeline band", "The commit-to-production strip under the hero."],
  caseStudy: ["Case study", "The featured project is the first project that has a case study. Add one under Projects."],
  work: ["Projects", "Every project row. Tags become stack pages automatically, for example /stack/rust."],
  references: ["References", "Quotes from people you worked with. Remove every item to hide the section."],
  experience: ["Experience", "Roles, education and certifications."],
  skills: ["Skills", "Each item links to its own stack page."],
  about: ["About", "Bio, values, status and the team graph."],
  contact: ["Contact", "What you are looking for, the 30-day plan and quick facts."],
  footer: ["Footer", ""],
  focus: ["Focus", "Tailored versions of the page for one kind of role. Each preset gets its own link to send with an application, like /for/ai: it shows the matching projects first and a title that fits. These links are kept out of search engines."],
  sections: ["Sections", "Put the sections in the order you want, hide any of them, and add your own. The top menu follows this order."],
  customSections: ["Your sections", "Sections you add yourself: awards, speaking, open source, publications. Use a list for entries with an optional link, or paragraphs for text. Place them under Sections."],
  gallery: ["Gallery", "Images of your work and your team. They are resized in your browser and stored with the site. The section appears once it has an image."],
};
const LABELS = {
  k: "Label", v: "Value", ci: "CI status", repo: "Source URL", link: "Live URL", linkToGithub: "Links to GitHub",
  sample: "Example data (shows an “example” tag on the page)", titleLine1: "Headline, line 1", titleLine2: "Headline, line 2",
  ctaPrimary: "Main button", ctaSecondary: "Second button", allProjectsUrl: "“See all projects” URL", lede: "Intro paragraph",
  moreLabel: "“See all” link text", certificationsLabel: "Certifications heading", lookingFor: "What I’m looking for",
  home: "Home page shows", categories: "Project categories", stacks: "Also include stacks", pinned: "Pinned (shown first)", hidden: "Hidden from the site",
  role: "Role word (for Focus titles)", photo: "Photo", src: "Image", caption: "Caption", alt: "Alt text (describes the image)", nav: "Menu label",
  href: "Link (optional, filled in for you)", before: "Before", after: "After", area: "Area (small label)", symbol: "Symbol", icon: "Icon (speed, migrate, ai, scale, security, data)", project: "Project page (e.g. crossmarket)", proof: "Proof (where you did it)", steps: "How (short steps)", claim: "Headline of the proof", challenge: "The challenge", architecture: "Architecture (in order)", results: "Results", duration: "Duration", team: "Team", detail: "Project page", markSamples: "Show “Example” tags on sample data", type: "Type", presets: "Presets", order: "Order", eyebrow: "Small label above the title",
};
const LONG = /^(lede|text|blurb|quote|description|outcome|context|problem|approach|result|status|now|what|challenge)$/;
const INLINE_LISTS = [/^abilities\.items\.\d+\.tags$/, /^work\.projects\.\d+\.detail\.architecture$/, /^focus\.presets\.\d+\.stacks$/, /^work\.projects\.\d+\.tags$/, /^skills\.groups\.\d+\.items$/, /^about\.team$/, /^pipeline\.stages$/];
const TEMPLATES = {
  "intro.lines": { symbol: "ai", text: "" },
  "abilities.items": { icon: "speed", area: "", title: "", proof: "", before: "", after: "", label: "", steps: [], tags: [], project: "" },
  "abilities.items.*.steps": "",
  "work.projects.*.detail.approach": "",
  "work.projects.*.detail.results": { label: "", before: "", after: "" },
  "hero.stats": { value: "", suffix: "", label: "", linkToGithub: false },
  "hero.layers": { label: "", note: "" },
  "work.filters": { key: "", label: "" },
  "work.projects": { title: "", blurb: "", image: "", outcome: "", metric: { value: "", label: "" }, tags: [], category: "fullstack", year: new Date().getFullYear(), link: "", repo: "", ci: "passing", tests: 0, coverage: "", sample: false, pinned: false, hidden: false, detail: { role: "", team: "", duration: "", challenge: "", approach: [], architecture: [], results: [] } },
  "references.items": { quote: "", name: "", role: "", sample: false },
  "experience.items": { dates: "", title: "", org: "", text: "" },
  "experience.certifications": "",
  "skills.groups": { name: "", items: [] },
  "about.paragraphs": "",
  "about.values": { title: "", text: "" },
  "contact.lookingFor": { k: "", v: "" },
  "contact.plan": { when: "", what: "" },
  "contact.facts": { k: "", v: "" },
  "contact.methods": { type: "email", label: "", value: "", href: "" },
  "focus.presets": { name: "", slug: "", categories: [], stacks: [], title: "", eyebrow: "", lede: "" },
  "customSections": { title: "", nav: "", eyebrow: "", lede: "", paragraphs: [], items: [] },
  "customSections.*.items": { k: "", v: "", link: "" },
  "customSections.*.paragraphs": "",
  "gallery.items": { src: "", alt: "", caption: "", w: 0, h: 0 },
};
const METHOD_TYPES = ["email", "phone", "website", "github", "linkedin", "x", "calendar", "telegram", "whatsapp", "location", "other"];
const OPTIONAL = {
  "work.projects.*": {
    caseStudy: { context: "", problem: "", approach: "", result: "" },
    metric: { value: "", label: "" },
  },
};

/* ---------- path helpers ---------- */
const parts = (p) => (p ? p.split(".") : []);
const getAt = (p) => parts(p).reduce((o, k) => (o == null ? undefined : o[k]), draft);
const setAt = (p, v) => { const ks = parts(p), last = ks.pop(); const parent = ks.reduce((o, k) => o[k], draft); parent[last] = v; };
const delAt = (p) => { const ks = parts(p), last = ks.pop(); const parent = ks.reduce((o, k) => o[k], draft); if (Array.isArray(parent)) parent.splice(+last, 1); else delete parent[last]; };
const pattern = (p) => p.replace(/\.\d+(?=\.|$)/g, ".*");
const human = (k) => LABELS[k] || String(k).replace(/([a-z])([A-Z0-9])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());
const blank = (v) => {
  if (Array.isArray(v)) return [];
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, blank(x)]));
  if (typeof v === "number") return 0;
  if (typeof v === "boolean") return false;
  return "";
};
const clone = (v) => JSON.parse(JSON.stringify(v));
const itemTitle = (it, i) => {
  if (typeof it !== "object" || !it) return String(it || `Item ${i + 1}`);
  const t = it.title || it.name || it.label || it.k || it.when || it.dates || (it.quote ? it.quote.slice(0, 60) + "…" : "");
  return t || `Item ${i + 1}`;
};

/* ---------- field rendering ---------- */
function prim(path, key, v) {
  const id = `f-${path.replace(/\./g, "-")}`;
  const label = `<label class="lbl" for="${id}">${esc(human(key))}</label>`;
  if (typeof v === "boolean") return `<label class="check"><input id="${id}" type="checkbox" data-path="${path}" data-type="bool"${v ? " checked" : ""}>${esc(human(key))}</label>`;
  if (typeof v === "number") return `<div class="fld">${label}<input id="${id}" type="number" data-path="${path}" data-type="num" value="${esc(v)}"></div>`;
  if (path === "focus.home") {
    const opts = [["", "Everything (no focus)"], ...((draft.focus && draft.focus.presets) || []).map((p) => [presetSlug(p), p.name || presetSlug(p)])];
    return `<div class="fld">${label}<select id="${id}" data-path="${path}" data-type="str">${opts.map(([v, t]) => `<option value="${esc(v)}"${v === v_(path) ? " selected" : ""}>${esc(t)}</option>`).join("")}</select><span class="hint">Applies a preset to your main address too.</span></div>`;
  }
  if (key === "type" && /^contact\.methods\.\d+\.type$/.test(path)) {
    return `<div class="fld">${label}<select id="${id}" data-path="${path}" data-type="str">${METHOD_TYPES.map((t) => `<option value="${t}"${t === v ? " selected" : ""}>${t}</option>`).join("")}</select></div>`;
  }
  if ((key === "src" && /^gallery\.items\.\d+\.src$/.test(path)) || path === "about.photo" || /^work\.projects\.\d+\.image$/.test(path)) {
    return `<div class="fld img-fld">${label}<div class="img-row">${v ? `<img src="${esc(v)}" alt="">` : '<span class="img-empty">No image</span>'}
      <input id="${id}" type="text" data-path="${path}" data-type="str" value="${esc(v)}" placeholder="/img/… or https://…">
      <label class="btn">Upload<input type="file" accept="image/*" data-upload="${path}" hidden></label></div></div>`;
  }
  if (key === "category" && /^work\.projects\.\d+$/.test(path.split(".").slice(0, -1).join("."))) {
    const opts = (draft.work.filters || []).filter((f) => f.key !== "all").map((f) => `<option value="${esc(f.key)}"${f.key === v ? " selected" : ""}>${esc(f.label)}</option>`).join("");
    return `<div class="fld">${label}<select id="${id}" data-path="${path}" data-type="str">${opts}</select></div>`;
  }
  const long = LONG.test(key) || String(v || "").length > 90;
  const type = /url|link|repo|github|linkedin/i.test(key) ? "url" : "text";
  if (/^(hero\.titleLine[12]|(work|references|experience|skills|gallery|about|contact)\.title|customSections\.\d+\.title)$/.test(path))
    return `<div class="fld">${label}<input id="${id}" type="text" data-path="${path}" data-type="str" value="${esc(v)}"><span class="hint">Wrap words in *stars* to colour them.</span></div>`;
  return long
    ? `<div class="fld">${label}<textarea id="${id}" data-path="${path}" data-type="str" rows="${Math.min(8, Math.max(2, Math.ceil(String(v || "").length / 90)))}">${esc(v)}</textarea></div>`
    : `<div class="fld">${label}<input id="${id}" type="${type}" data-path="${path}" data-type="str" value="${esc(v)}"></div>`;
}

function inlineList(path, key, arr) {
  const id = `f-${path.replace(/\./g, "-")}`;
  return `<div class="fld"><label class="lbl" for="${id}">${esc(human(key))}</label>
    <input id="${id}" type="text" data-path="${path}" data-type="csv" value="${esc(arr.join(", "))}">
    <span class="hint">Separate with commas.${/tags|items/.test(key) ? " Each one gets a page at /stack/…" : ""}</span></div>`;
}

const ctl = (path, i, n) => `<span class="ctl">
  <button type="button" data-act="up" data-path="${path}" data-i="${i}" title="Move up"${i === 0 ? " disabled" : ""}>↑</button>
  <button type="button" data-act="down" data-path="${path}" data-i="${i}" title="Move down"${i === n - 1 ? " disabled" : ""}>↓</button>
  <button type="button" data-act="dup" data-path="${path}" data-i="${i}" title="Duplicate">⧉</button>
  <button type="button" class="del" data-act="del" data-path="${path}" data-i="${i}" title="Remove">✕</button></span>`;

function list(path, key, arr) {
  if (/^focus\.presets\.\d+\.categories$/.test(path)) return catChecks(path, arr);
  if (INLINE_LISTS.some((re) => re.test(path))) return inlineList(path, key, arr);
  const objects = arr.length ? typeof arr[0] === "object" : typeof TEMPLATES[pattern(path)] === "object";
  const q = filters.get(path) || "";
  const head = `<div class="list-h"><span class="lbl">${esc(human(key))} · ${arr.length}</span>${objects && arr.length > 6 ? `<input class="list-search" type="search" data-filter="${path}" value="${esc(q)}" placeholder="Filter ${esc(human(key).toLowerCase())}…" aria-label="Filter">` : ""}</div>`;
  const add = `<button type="button" class="btn add" data-act="add" data-path="${path}">+ Add ${esc(human(key).replace(/s$/, "").toLowerCase())}</button>`;
  if (!objects) {
    return `<div class="list">${head}${arr.map((v, i) => `<div class="prim-row">${
      String(v).length > 70 || LONG.test(key) || key === "paragraphs"
        ? `<textarea data-path="${path}.${i}" data-type="str" rows="3" aria-label="${esc(human(key))} ${i + 1}">${esc(v)}</textarea>`
        : `<input type="text" data-path="${path}.${i}" data-type="str" value="${esc(v)}" aria-label="${esc(human(key))} ${i + 1}">`
    }${ctl(path, i, arr.length)}</div>`).join("")}${add}</div>`;
  }
  return `<div class="list">${head}${arr.map((it, i) => {
    const p = `${path}.${i}`;
    const hit = !q || JSON.stringify(it).toLowerCase().includes(q.toLowerCase());
    const thumb = it && it.src ? `<img class="sum-img" src="${esc(it.src)}" alt="">` : "";
    const badges = (it && it.sample ? '<span class="badge">example</span>' : "") + (it && it.pinned ? '<span class="badge acc">pinned</span>' : "") + (it && it.hidden ? '<span class="badge off">hidden</span>' : "");
    return `<details class="item" data-open="${p}"${open.has(p) ? " open" : ""}${hit ? "" : " hidden"}>
      <summary><span class="sum-n">${String(i + 1).padStart(2, "0")}</span>${thumb}<span class="sum-t">${esc(itemTitle(it, i))}</span>${badges}${ctl(path, i, arr.length)}</summary>
      <div class="item-body">${obj(p, it, true)}</div></details>`;
  }).join("")}${add}</div>`;
}

function obj(path, o, bare = false) {
  const gal = /^gallery\.items\.\d+$/.test(path);
  const entries = Object.entries(o || {}).filter(([k]) => !k.startsWith("_") && !(gal && (k === "w" || k === "h")));
  const primEntries = entries.filter(([, v]) => v === null || typeof v !== "object");
  const nested = entries.filter(([, v]) => v !== null && typeof v === "object");
  const shortPrims = primEntries.filter(([k, v]) => typeof v !== "string" || (!LONG.test(k) && String(v).length < 60));
  const longPrims = primEntries.filter((e) => !shortPrims.includes(e));
  let html = "";
  if (shortPrims.length) html += `<div class="two">${shortPrims.map(([k, v]) => prim(`${path}.${k}`, k, v ?? "")).join("")}</div>`;
  html += longPrims.map(([k, v]) => prim(`${path}.${k}`, k, v)).join("");
  html += nested.map(([k, v]) => Array.isArray(v)
    ? list(`${path}.${k}`, k, v)
    : `<fieldset class="obj"><legend>${esc(human(k))}</legend>${obj(`${path}.${k}`, v, true)}${optRemove(`${path}.${k}`, k)}</fieldset>`).join("");
  html += optAdd(path, o);
  if (/^focus\.presets\.\d+$/.test(path)) html += presetInfo(path, o);
  return bare ? html : `<div class="grid">${html}</div>`;
}

function optAdd(path, o) {
  const spec = OPTIONAL[pattern(path)];
  if (!spec) return "";
  const missing = Object.keys(spec).filter((k) => !(k in (o || {})));
  return missing.length ? `<div class="opt">${missing.map((k) => `<button type="button" class="btn" data-act="addopt" data-path="${path}" data-key="${k}">+ Add ${esc(human(k).toLowerCase())}</button>`).join("")}</div>` : "";
}
function optRemove(path, k) {
  const parent = path.split(".").slice(0, -1).join(".");
  const spec = OPTIONAL[pattern(parent)];
  return spec && k in spec ? `<button type="button" class="link danger" data-act="delopt" data-path="${path}">Remove ${esc(human(k).toLowerCase())}</button>` : "";
}

/* ---------- panel and sidebar ---------- */
function renderPanel() {
  const panel = $("#panel");
  if (jsonMode) {
    panel.innerHTML = `<h1>Edit as JSON</h1><p class="lead">The whole document. Use this for structural changes. Apply, then preview and publish.</p>
      <textarea class="json-area" id="jsonArea" spellcheck="false" aria-label="Site JSON">${esc(JSON.stringify(draft, null, 2))}</textarea>
      <p class="err" id="jsonErr"></p>
      <div class="opt"><button class="btn primary" type="button" data-act="applyjson">Apply JSON</button><button class="btn" type="button" data-act="closejson">Back to form</button></div>`;
    return;
  }
  const [title, lead] = SECTIONS[section] || [human(section), ""];
  const value = draft[section];
  const body = section === "sections" ? sectionsPanel()
    : (section === "gallery" ? galleryDrop() : "") + (Array.isArray(value) ? list(section, section, value) : obj(section, value));
  panel.innerHTML = `<h1>${esc(title)}</h1>${lead ? `<p class="lead">${esc(lead)}</p>` : ""}${body}`;
}

function renderSidebar() {
  const dirtyKeys = new Set(Object.keys(draft).filter((k) => { try { return JSON.stringify(draft[k]) !== JSON.stringify(JSON.parse(saved)[k]); } catch (e) { return false; } }));
  $("#sections").innerHTML = Object.keys(draft).filter((k) => !k.startsWith("_")).map((k) =>
    `<button type="button" data-sec="${k}" aria-current="${!jsonMode && k === section}"><span>${esc((SECTIONS[k] || [human(k)])[0])}</span>${dirtyKeys.has(k) ? '<span class="dot" title="Unpublished changes"></span>' : ""}</button>`).join("");

  // stack pages generated from tags and skills
  const map = new Map();
  (draft.work.projects || []).forEach((p) => (p.tags || []).forEach((t) => { const s = slugify(t); if (!s) return; const e = map.get(s) || { name: t, n: 0 }; e.n++; map.set(s, e); }));
  (draft.skills.groups || []).forEach((g) => (g.items || []).forEach((t) => { const s = slugify(t); if (s && !map.has(s)) map.set(s, { name: t, n: 0 }); }));
  const stacks = [...map.entries()].sort((a, b) => b[1].n - a[1].n || a[1].name.localeCompare(b[1].name));
  $("#stackCount").textContent = stacks.length;
  $("#stackList").innerHTML = `<a href="/stack" data-stack="">All stacks</a>` + stacks.map(([s, e]) => `<a href="/stack/${s}" data-stack="${s}" title="/stack/${s}">${esc(e.name)}<span>${e.n}</span></a>`).join("");

  $("#history").innerHTML = !online
    ? `<p class="side-note">Version history needs the Cloudflare server.</p>`
    : versions.length
      ? versions.map((v) => `<div class="rev"><span>${esc(new Date(v.at).toLocaleString())}</span><button class="link" type="button" data-rev="${esc(v.id)}">Load</button></div>`).join("")
      : `<p class="side-note">No earlier versions yet. Each publish keeps the one before it.</p>`;

  const st = $("#status"), dirty = isDirty();
  st.textContent = dirty ? "Unpublished changes" : "Published";
  st.className = `status ${dirty ? "dirty" : "ok"}`;
  $("#btnSave").disabled = !dirty;
}
const renderAll = () => { renderPanel(); renderSidebar(); };

/* ---------- toast ---------- */
let toastTimer = 0;
function toast(msg, bad = false) {
  const t = $("#toast"); t.textContent = msg; t.className = `toast on${bad ? " bad" : ""}`;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.className = "toast"; }, bad ? 6000 : 2600);
}

/* ---------- edits ---------- */
$("#panel").addEventListener("input", (e) => {
  const el = e.target;
  if (el.dataset.filter) {
    filters.set(el.dataset.filter, el.value);
    const q = el.value.toLowerCase(), arr = getAt(el.dataset.filter) || [];
    $$(`details.item[data-open^="${el.dataset.filter}."]`).forEach((d) => { const it = getAt(d.dataset.open); d.hidden = !!q && !JSON.stringify(it).toLowerCase().includes(q); });
    return;
  }
  const path = el.dataset.path;
  if (!path) return;
  pvReload();
  const t = el.dataset.type;
  if (t === "cat") { setAt(path, $$(`input[data-type="cat"][data-path="${path}"]`).filter((x) => x.checked).map((x) => x.value)); renderAll(); return; }
  const v = t === "bool" ? el.checked : t === "num" ? (el.value === "" ? 0 : Number(el.value)) : t === "csv" ? el.value.split(",").map((s) => s.trim()).filter(Boolean) : el.value;
  setAt(path, v);
  // keep the item's summary title in step with its fields
  const item = el.closest("details.item");
  if (item) { const it = getAt(item.dataset.open); const s = $(".sum-t", item); if (s) s.textContent = itemTitle(it, 0); }
  renderSidebar();
});
$("#panel").addEventListener("change", (e) => {
  const el = e.target;
  if (el.dataset.secShow) {
    sectionOrder();
    const h = new Set(draft.sections.hidden);
    el.checked ? h.delete(el.dataset.secShow) : h.add(el.dataset.secShow);
    draft.sections.hidden = [...h]; renderAll(); pvReload(); return;
  }
  if (el.type === "file" && el.files.length) {
    const files = [...el.files]; el.value = "";
    if (el.dataset.actFile === "gallery") {
      draft.gallery = draft.gallery || { items: [] }; draft.gallery.items = draft.gallery.items || [];
      return uploadMany(files, (img, f) => { draft.gallery.items.push({ src: img.src, alt: altFrom(f), caption: "", w: img.w, h: img.h }); pvReload(); });
    }
    if (el.dataset.upload) {
      const target = el.dataset.upload;
      return uploadMany(files.slice(0, 1), (img) => {
        setAt(target, img.src);
        const item = target.replace(/\.src$/, "");
        if (item !== target) { const o = getAt(item); o.w = img.w; o.h = img.h; }
        pvReload();
      });
    }
  }
  if (el.type === "checkbox" || el.tagName === "SELECT") { if (el.tagName === "SELECT") renderAll(); else renderSidebar(); }
});
$("#panel").addEventListener("dragover", (e) => { const d = e.target.closest(".drop"); if (d) { e.preventDefault(); d.classList.add("over"); } });
$("#panel").addEventListener("dragleave", (e) => { const d = e.target.closest(".drop"); if (d) d.classList.remove("over"); });
$("#panel").addEventListener("drop", (e) => {
  const d = e.target.closest(".drop"); if (!d) return;
  e.preventDefault(); d.classList.remove("over");
  const files = [...e.dataTransfer.files].filter((f) => /^image\//.test(f.type));
  draft.gallery = draft.gallery || { items: [] }; draft.gallery.items = draft.gallery.items || [];
  uploadMany(files, (img, f) => { draft.gallery.items.push({ src: img.src, alt: altFrom(f), caption: "", w: img.w, h: img.h }); pvReload(); });
});
$("#panel").addEventListener("toggle", (e) => { const d = e.target; if (d.matches && d.matches("details.item")) d.open ? open.add(d.dataset.open) : open.delete(d.dataset.open); }, true);

$("#panel").addEventListener("click", (e) => {
  const b = e.target.closest("[data-act]");
  if (!b) return;
  if (b.closest("summary")) e.preventDefault();      // controls in a summary must not toggle it
  const act = b.dataset.act, path = b.dataset.path, i = +b.dataset.i;
  const arr = path ? getAt(path) : null;
  if (act === "add") {
    const tpl = TEMPLATES[pattern(path)];
    const item = tpl !== undefined ? clone(tpl) : arr.length ? blank(arr[0]) : "";
    arr.push(item);
    if (typeof item === "object") open.add(`${path}.${arr.length - 1}`);
  } else if (act === "del") {
    const label = itemTitle(arr[i], i);
    if (!b.dataset.confirm) { b.dataset.confirm = "1"; b.textContent = "?"; b.title = `Click again to remove “${label}”`; setTimeout(() => { delete b.dataset.confirm; b.textContent = "✕"; }, 2500); return; }
    arr.splice(i, 1);
  } else if (act === "up" && i > 0) { [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]]; }
  else if (act === "down" && i < arr.length - 1) { [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]]; }
  else if (act === "dup") { arr.splice(i + 1, 0, clone(arr[i])); }
  else if (act === "addopt") { const o = getAt(path); o[b.dataset.key] = clone(OPTIONAL[pattern(path)][b.dataset.key]); }
  else if (act === "delopt") { delAt(path); }
  else if (act === "applyjson") {
    try { draft = JSON.parse($("#jsonArea").value); jsonMode = false; toast("JSON applied. Preview, then publish."); }
    catch (err) { $("#jsonErr").textContent = `Not valid JSON: ${err.message}`; return; }
  } else if (act === "closejson") { jsonMode = false; }
  else if (act === "copy") { navigator.clipboard.writeText(b.dataset.text).then(() => toast("Link copied."), () => toast(b.dataset.text)); return; }
  else if (act === "previewpath") { preview(b.dataset.to); return; }
  else if (act === "goto") { section = b.dataset.sec; }
  else if (act === "sec-move") {
    const order = sectionOrder(), k = order.indexOf(b.dataset.id), j = k + +b.dataset.d;
    if (j < 0 || j >= order.length) return;
    [order[k], order[j]] = [order[j], order[k]]; draft.sections.order = order;
  }
  else return;
  renderAll(); pvReload();
});

/* ---------- sidebar actions ---------- */
$("#sections").addEventListener("click", (e) => {
  const b = e.target.closest("[data-sec]"); if (!b) return;
  section = b.dataset.sec; jsonMode = false; renderAll(); $("#panel").focus(); scrollTo({ top: 0 });
});
$("#stackList").addEventListener("click", (e) => {
  const a = e.target.closest("a[data-stack]"); if (!a) return;
  e.preventDefault();
  preview(a.dataset.stack ? `/stack/${a.dataset.stack}` : "/stack");
});
$("#history").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-rev]"); if (!b) return;
  const r = await api(`/api/history/${encodeURIComponent(b.dataset.rev)}`);
  if (!r.ok) return toast("That version could not be loaded.", true);
  draft = await r.json(); jsonMode = false; renderAll();
  toast("Earlier version loaded. Preview it, then publish to restore it.");
});
$("#btnJson").addEventListener("click", () => { jsonMode = true; renderAll(); });
$("#btnDiscard").addEventListener("click", (e) => {
  if (!isDirty()) return toast("Nothing to discard.");
  const b = e.currentTarget;
  if (!b.dataset.confirm) { b.dataset.confirm = "1"; b.textContent = "Click again to discard"; setTimeout(() => { delete b.dataset.confirm; b.textContent = "Discard unpublished changes"; }, 3000); return; }
  draft = JSON.parse(saved); delete b.dataset.confirm; b.textContent = "Discard unpublished changes"; renderAll(); pvReload(true); toast("Changes discarded.");
});
$("#btnExport").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(draft, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = `portfolio-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
$("#fileImport").addEventListener("change", (e) => {
  const f = e.target.files[0]; if (!f) return;
  const rd = new FileReader();
  rd.onload = () => { try { draft = JSON.parse(rd.result); jsonMode = false; renderAll(); toast("Backup imported. Preview, then publish."); } catch (err) { toast(`That file is not valid JSON: ${err.message}`, true); } };
  rd.readAsText(f); e.target.value = "";
});

/* ---------- preview and publish ---------- */
function preview(path = "/") {
  try { localStorage.setItem("site-draft", JSON.stringify(draft)); }
  catch (e) { return toast("Preview needs browser storage, which is blocked here.", true); }
  window.open(`${path}?draft=1`, "_blank", "noopener");
}
$("#btnPreview").addEventListener("click", () => preview("/"));

async function publish() {
  if (!isDirty()) return;
  const btn = $("#btnSave"); btn.disabled = true; btn.textContent = "Publishing…";
  try {
    const r = await api("/api/site", { method: "PUT", body: JSON.stringify(draft) });
    const res = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(res.error || `The server answered ${r.status}.`);
    saved = JSON.stringify(draft);
    try { localStorage.removeItem("site-draft"); } catch (e) {}
    await loadVersions();
    toast("Published. The live site now shows these changes.");
  } catch (err) {
    toast(`Not published: ${err.message}`, true);
  } finally {
    btn.textContent = "Publish"; renderSidebar();
  }
}
$("#btnSave").addEventListener("click", publish);
addEventListener("keydown", (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); publish(); } });
addEventListener("beforeunload", (e) => { if (draft && isDirty()) { e.preventDefault(); e.returnValue = ""; } });

/* ==================================================================
   Focus, sections, images, page view, edit link, device
   ================================================================== */
const presetSlug = (p) => slugify(p.slug || p.name || "");
function autoRole(cats) {
  const F = draft.work.filters || [];
  const words = [...new Set((cats || []).map((k) => { const f = F.find((x) => x.key === k); return f ? (f.role || f.label) : ""; }).filter(Boolean))].slice(0, 2);
  if (!words.length) return draft.meta.role;
  return `${words.length === 1 ? words[0] : `${words.slice(0, -1).join(", ")} & ${words[words.length - 1]}`} Engineer`;
}
const presetMatches = (p) => {
  const cats = p.categories || [], tags = (p.stacks || []).map(slugify);
  return (draft.work.projects || []).filter((x) => !x.hidden && (!(cats.length || tags.length) || cats.includes(x.category) || (x.tags || []).some((t) => tags.includes(slugify(t)))));
};

function catChecks(path, arr) {
  const opts = (draft.work.filters || []).filter((f) => f.key !== "all");
  return `<div class="fld"><span class="lbl">${esc(human("categories"))}</span><div class="checks">${opts.map((f) =>
    `<label class="check"><input type="checkbox" data-path="${path}" data-type="cat" value="${esc(f.key)}"${arr.includes(f.key) ? " checked" : ""}>${esc(f.label)}</label>`).join("")}</div>
    <span class="hint">Projects in these categories are shown. Add stacks below to include more.</span></div>`;
}

function presetInfo(path, p) {
  const slug = presetSlug(p), url = `${location.origin}/for/${slug}`, n = presetMatches(p).length;
  return `<div class="preset-info">
    <div><span class="lbl">Link to send</span><code>${esc(url)}</code></div>
    <div><span class="lbl">Title shown</span><span>${esc((p.title && p.title.trim()) || autoRole(p.categories))}</span></div>
    <div><span class="lbl">Projects shown</span><span>${n}</span></div>
    <div class="opt"><button type="button" class="btn" data-act="copy" data-text="${esc(url)}">Copy link</button>
      <button type="button" class="btn" data-act="previewpath" data-to="/for/${esc(slug)}">Preview</button></div></div>`;
}

const BUILTIN_SECTIONS = { abilities: "Abilities", case: "Case study", work: "Work", references: "References", experience: "Experience", skills: "Skills", gallery: "Gallery", about: "About", contact: "Contact" };
const SECTION_NOTE = { case: "shows when a project has a case study", references: "shows when there are references", gallery: "shows when it has an image" };
const customKey = (c) => `x-${slugify(c.id || c.title || "section")}`;
function sectionOrder() {
  const L = draft.sections || (draft.sections = { order: [], hidden: [] });
  L.order = L.order || []; L.hidden = L.hidden || [];
  const all = [...Object.keys(BUILTIN_SECTIONS), ...(draft.customSections || []).filter((c) => c && (c.title || c.id)).map(customKey)];
  const order = [...L.order.filter((id) => all.includes(id)), ...all.filter((id) => !L.order.includes(id))];
  if (!L.order.includes("contact")) { order.splice(order.indexOf("contact"), 1); order.push("contact"); }
  return order;
}
function sectionsPanel() {
  const order = sectionOrder(), hidden = new Set(draft.sections.hidden);
  const name = (id) => BUILTIN_SECTIONS[id] || ((draft.customSections || []).find((c) => customKey(c) === id) || {}).title || id;
  return `<div class="sec-list">${order.map((id, i) => `
    <div class="sec-row${hidden.has(id) ? " off" : ""}">
      <span class="sum-n">${String(i + 1).padStart(2, "0")}</span>
      <span class="sec-name">${esc(name(id))}${id.startsWith("x-") ? ' <span class="badge">yours</span>' : ""}${SECTION_NOTE[id] ? `<span class="hint"> · ${SECTION_NOTE[id]}</span>` : ""}</span>
      <label class="check"><input type="checkbox" data-sec-show="${id}"${hidden.has(id) ? "" : " checked"}>Shown</label>
      <span class="ctl"><button type="button" data-act="sec-move" data-id="${id}" data-d="-1"${i === 0 ? " disabled" : ""} title="Move up">↑</button><button type="button" data-act="sec-move" data-id="${id}" data-d="1"${i === order.length - 1 ? " disabled" : ""} title="Move down">↓</button></span>
    </div>`).join("")}</div>
    <p class="hint">The hero and the pipeline band always open the page. Menu labels are under Navigation, and for your own sections under Your sections.</p>
    <div class="opt"><button type="button" class="btn" data-act="goto" data-sec="customSections">+ Add your own section</button></div>`;
}

/* images are resized in the browser (longest side 1600 px, WebP) before upload */
async function uploadImage(file) {
  if (!/^image\//.test(file.type)) throw new Error(`${file.name} is not an image.`);
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  c.getContext("2d").drawImage(bmp, 0, 0, w, h);
  let blob = await new Promise((r) => c.toBlob(r, "image/webp", 0.85));
  if (!blob || blob.type !== "image/webp") blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.86));
  const r = await fetch("/api/img", { method: "POST", headers: { "content-type": blob.type, authorization: `Bearer ${KEY}` }, body: blob });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Upload failed (${r.status}).`);
  return { src: j.url, w, h };
}
async function uploadMany(files, onEach) {
  let n = 0;
  for (const f of files) {
    try { toast(`Uploading ${f.name}…`); onEach(await uploadImage(f), f); n++; }
    catch (err) { toast(err.message, true); }
  }
  if (n) { renderAll(); toast(`${n} image${n > 1 ? "s" : ""} uploaded. Publish to show ${n > 1 ? "them" : "it"} on the site.`); }
}
const altFrom = (f) => f.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim();
function galleryDrop() {
  return `<label class="drop" id="galleryDrop"><input type="file" accept="image/*" multiple data-act-file="gallery" hidden>
    <strong>Drop images here, or click to choose</strong><span class="hint">Resized to 1600 px and stored with the site. Add a caption and alt text after upload.</span></label>`;
}

/* ---------- page view: the real page, editable in place, beside the form ---------- */
let pageView = false, pvTimer = 0;
const frame = () => $("#pvFrame");
const pvSrc = () => { const f = $("#pvFocus").value; return `${f ? `/for/${encodeURIComponent(f)}` : "/"}?draft=1&inline=1`; };
function writeDraft() { try { localStorage.setItem("site-draft", JSON.stringify(draft)); return true; } catch (e) { return false; } }
function pvFill() {
  const sel = $("#pvFocus"), cur = sel.value;
  sel.innerHTML = `<option value="">Home page</option>` + ((draft.focus && draft.focus.presets) || []).map((p) => `<option value="${esc(presetSlug(p))}">For: ${esc(p.name || presetSlug(p))}</option>`).join("");
  sel.value = [...sel.options].some((o) => o.value === cur) ? cur : "";
}
function pvReload(now = false) {
  if (!pageView) return;
  clearTimeout(pvTimer);
  pvTimer = setTimeout(() => { if (!writeDraft()) return toast("The page view needs browser storage, which is blocked here.", true); frame().src = pvSrc(); }, now ? 0 : 700);
}
function setPageView(on) {
  pageView = on;
  document.body.classList.toggle("split", on);
  $("#pageView").hidden = !on;
  $("#btnPage").setAttribute("aria-pressed", String(on));
  if (on) { pvFill(); pvReload(true); }
}
$("#btnPage").addEventListener("click", () => setPageView(!pageView));
$("#pvFocus").addEventListener("change", () => pvReload(true));
$("#pvReload").addEventListener("click", () => pvReload(true));
$("#pvOpen").addEventListener("click", () => { writeDraft(); window.open(pvSrc().replace("&inline=1", ""), "_blank", "noopener"); });

function revealField(path) {
  // open the right section and the items above the field, then point at it
  const top = path.split(".")[0];
  if (top !== section || jsonMode) { section = top; jsonMode = false; }
  const parts = path.split(".");
  for (let i = 1; i < parts.length; i++) if (/^\d+$/.test(parts[i])) open.add(parts.slice(0, i + 1).join("."));
  renderAll();
  const el = $(`#panel [data-path="${CSS.escape(path)}"]`);
  if (!el) return;
  el.scrollIntoView({ block: "center", behavior: "smooth" });
  el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash");
}
addEventListener("message", (e) => {
  if (e.origin !== location.origin || !e.data || e.data.source !== "portfolio-page") return;
  const { type, path, value } = e.data;
  if (type === "edit" && typeof path === "string" && getAt(path.split(".").slice(0, -1).join(".")) != null) {
    setAt(path, value);
    const el = $(`#panel [data-path="${CSS.escape(path)}"]`);
    if (el && document.activeElement !== el) el.value = value;
    writeDraft(); renderSidebar();
  } else if (type === "select" && typeof path === "string") {
    revealField(path);
  }
});
$("#panel").addEventListener("focusin", (e) => {
  const path = e.target.dataset && e.target.dataset.path;
  if (pageView && path && frame().contentWindow) frame().contentWindow.postMessage({ source: "portfolio-editor", type: "reveal", path }, location.origin);
});

/* ---------- edit link: change it, and remember this device ---------- */
function showLink(url) {
  const d = document.createElement("dialog");
  d.className = "linkbox";
  d.innerHTML = `<h2>Your new edit link</h2><p class="side-note">The old link stopped working just now. Save this one somewhere safe, like a password manager. It is the only way into the editor.</p>
    <code>${esc(url)}</code><div class="opt"><button class="btn primary" type="button" data-copy>Copy link</button><button class="btn" type="button" data-close>Done</button></div>`;
  document.body.appendChild(d);
  d.addEventListener("click", async (e) => {
    if (e.target.closest("[data-copy]")) { try { await navigator.clipboard.writeText(url); e.target.textContent = "Copied"; } catch (err) { e.target.textContent = "Select and copy"; } }
    if (e.target.closest("[data-close]")) { d.close(); d.remove(); }
  });
  d.showModal();
}
$("#btnKey").addEventListener("click", async (e) => {
  const b = e.currentTarget;
  if (!online) return toast("Changing the link needs the Cloudflare server.", true);
  if (!b.dataset.confirm) { b.dataset.confirm = "1"; b.textContent = "Click again: the current link stops working"; setTimeout(() => { delete b.dataset.confirm; b.textContent = "Change edit link"; }, 4000); return; }
  delete b.dataset.confirm; b.textContent = "Change edit link";
  const r = await api("/api/key", { method: "POST" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.key) return toast(j.error || "The link could not be changed.", true);
  KEY = j.key;
  try { sessionStorage.setItem("edit-key", KEY); } catch (err) {}
  if (location.pathname.startsWith("/edit/")) history.replaceState(null, "", `/edit/${KEY}`);
  rememberDevice();
  showLink(`${location.origin}/edit/${KEY}`);
});

function rememberDevice() {
  try { if (localStorage.getItem("editor-remember") !== "0") localStorage.setItem("editor-url", KEY.startsWith("s.") ? "/admin" : `/edit/${KEY}`); } catch (e) {}
  renderDevice();
}
function renderDevice() {
  let on = false;
  try { on = !!localStorage.getItem("editor-url"); } catch (e) {}
  $("#device").innerHTML = on
    ? `<p class="side-note">This device shows a small Edit button on your site, and Ctrl+Shift+E opens the editor. Visitors never see it.</p><button class="link" type="button" data-device="forget">Forget this device</button>`
    : `<p class="side-note">This device does not show the Edit shortcut on your site.</p><button class="link" type="button" data-device="remember">Remember this device</button>`;
}
$("#device").addEventListener("click", (e) => {
  const b = e.target.closest("[data-device]"); if (!b) return;
  try {
    if (b.dataset.device === "forget") { localStorage.removeItem("editor-url"); localStorage.setItem("editor-remember", "0"); }
    else { localStorage.removeItem("editor-remember"); localStorage.setItem("editor-url", KEY.startsWith("s.") ? "/admin" : `/edit/${KEY}`); }
  } catch (err) {}
  renderDevice();
});

/* ---------- unused images ---------- */
$("#btnImages").addEventListener("click", async (e) => {
  const b = e.currentTarget;
  if (!online) return toast("Image clean-up needs the Cloudflare server.", true);
  const r = await api("/api/img");
  if (!r.ok) return toast("The image list could not be loaded.", true);
  const imgs = await r.json();
  const used = new Set([...`${JSON.stringify(draft)}${saved}`.matchAll(/\/img\/([a-f0-9]{16,64})/g)].map((m) => m[1]));
  const unused = imgs.filter((x) => !used.has(x.id));
  if (!unused.length) return toast(`${imgs.length} image${imgs.length === 1 ? "" : "s"} stored, all in use.`);
  if (!b.dataset.confirm) { b.dataset.confirm = "1"; b.textContent = `Click again to delete ${unused.length} unused`; setTimeout(() => { delete b.dataset.confirm; b.textContent = "Clean up unused images"; }, 4000); return; }
  delete b.dataset.confirm; b.textContent = "Clean up unused images";
  for (const x of unused) await api(`/api/img/${x.id}`, { method: "DELETE" });
  toast(`Deleted ${unused.length} unused image${unused.length > 1 ? "s" : ""}. Older versions that used them will show them missing.`);
});

/* ---------- sign-in: a short address and a password ---------- */
async function renderSignin() {
  const box = $("#signin"), url = `${location.origin}/admin`;
  if (!online) { box.innerHTML = `<p class="side-note">Password sign-in needs the Cloudflare server.</p>`; return; }
  const r = await api("/api/password").catch(() => null);
  const st = r && r.ok ? await r.json() : { set: false, min: 10 };
  box.innerHTML = `<p class="side-note">Open <a href="/admin" target="_blank" rel="noopener"><code>${esc(url)}</code></a> on any device and sign in with ${st.set ? "your password" : "a password you set here"}.</p>
    <div class="pw-row"><input id="pwNew" type="password" autocomplete="new-password" placeholder="${st.set ? "New password" : `Password, ${st.min}+ characters`}" aria-label="Password">
    <button class="btn" type="button" id="pwSet">${st.set ? "Change" : "Set"}</button></div>
    <div class="pw-links"><button class="link" type="button" data-copy-url="${esc(url)}">Copy address</button>
    ${st.set ? '<button class="link danger" type="button" id="pwClear">Remove password</button>' : ""}
    ${KEY.startsWith("s.") ? '<button class="link" type="button" id="pwOut">Sign out</button>' : ""}</div>`;
}
$("#signin").addEventListener("click", async (e) => {
  const t = e.target;
  if (t.dataset.copyUrl) { navigator.clipboard.writeText(t.dataset.copyUrl).then(() => toast("Address copied."), () => toast(t.dataset.copyUrl)); return; }
  if (t.id === "pwSet") {
    const pw = $("#pwNew").value;
    const r = await api("/api/password", { method: "POST", body: JSON.stringify({ password: pw }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return toast(j.error || "The password could not be saved.", true);
    // every other device is signed out; this one continues with a fresh session if it was using one
    if (KEY.startsWith("s.")) { KEY = j.token; try { localStorage.getItem("editor-session") ? localStorage.setItem("editor-session", KEY) : sessionStorage.setItem("edit-key", KEY); } catch (err) {} }
    toast("Password saved. Sign in at /admin with it from now on.");
    renderSignin();
  }
  if (t.id === "pwClear") {
    if (!t.dataset.confirm) { t.dataset.confirm = "1"; t.textContent = "Click again to remove"; setTimeout(() => { delete t.dataset.confirm; t.textContent = "Remove password"; }, 3000); return; }
    const r = await api("/api/password", { method: "DELETE" });
    if (!r.ok) return toast("The password could not be removed.", true);
    toast("Password removed. /admin now accepts only the edit key.");
    if (KEY.startsWith("s.")) { try { localStorage.removeItem("editor-session"); sessionStorage.removeItem("edit-key"); } catch (err) {} location.reload(); return; }
    renderSignin();
  }
  if (t.id === "pwOut") {
    await api("/api/logout", { method: "POST" }).catch(() => {});
    try { localStorage.removeItem("editor-session"); sessionStorage.removeItem("edit-key"); localStorage.removeItem("editor-url"); } catch (err) {}
    location.href = "/admin";
  }
});

/* ---------- boot ---------- */
async function loadVersions() {
  try {
    const r = await api("/api/history");
    if (r.status === 401) return "denied";
    if (!r.ok) { online = false; return "offline"; }
    versions = await r.json(); online = true; return "ok";
  } catch (e) { online = false; return "offline"; }
}

function gate(msg) {
  $("#gate").hidden = false;
  if (msg) $("#gateMsg").textContent = msg;
  else fetch("/api/login", { cache: "no-store" }).then((r) => r.json()).then((j) => {
    if (j.passwordSet) return;
    $("#gateMsg").textContent = "No password is set yet. Paste your edit key (the part after /edit/ in EDIT-LINK.txt) to open the editor, then set a password under Sign-in.";
    $("label[for=gateKey]").textContent = "Edit key";
  }).catch(() => {});
  $("#gateKey").focus();
}
/* the sign-in screen takes a password (set from the editor) or the edit key */
const looksLikeKey = (v) => /^[A-Za-z0-9_-]{30,}$/.test(v);
async function tryPassword(v, keep) {
  const r = await fetch("/api/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: v }) }).catch(() => null);
  if (!r) return "offline";
  if (r.status === 429) return "blocked";
  if (!r.ok) return r.status === 409 ? "nopassword" : "wrong";
  KEY = (await r.json()).token;
  try { (keep ? localStorage : sessionStorage).setItem(keep ? "editor-session" : "edit-key", KEY); } catch (e) {}
  return "ok";
}
async function keyWorks(v) {
  const r = await fetch("/api/history", { cache: "no-store", headers: { authorization: `Bearer ${v}` } }).catch(() => null);
  return !r || r.ok;   // offline (static preview): let boot() decide
}
$("#gateForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const v = $("#gateKey").value.trim(), keep = $("#gateKeep").checked, btn = $("#gateForm button");
  btn.disabled = true; btn.textContent = "Checking…";
  let ok = false, msg = "Wrong password or key.";
  if (looksLikeKey(v) && (await keyWorks(v))) { KEY = v; try { sessionStorage.setItem("edit-key", v); } catch (err) {} ok = true; }
  else {
    const res = await tryPassword(v, keep);
    if (res === "ok") ok = true;
    else if (res === "blocked") msg = "Too many attempts. Wait 15 minutes and try again.";
    else if (res === "nopassword") msg = "No password is set yet. Open your private edit link once and set one under Sign-in.";
    else if (res === "offline") { KEY = v; ok = true; }
  }
  btn.disabled = false; btn.textContent = "Open editor";
  if (!ok) { $("#gateMsg").textContent = msg; $("#gateKey").select(); return; }
  $("#gate").hidden = true; boot();
});

async function boot() {
  if (!KEY) return gate();
  let doc = null;
  for (const url of ["/api/site", "/site.json"]) {
    try { const r = await fetch(url, { cache: "no-store" }); if (r.ok) { doc = await r.json(); break; } } catch (e) {}
  }
  if (!doc) { $("#panel").innerHTML = `<p class="err">The site data could not be loaded.</p>`; return; }
  const access = await loadVersions();
  if (access === "denied") {
    try { sessionStorage.removeItem("edit-key"); localStorage.removeItem("editor-session"); } catch (e) {}
    return gate(KEY.startsWith("s.") ? "Your sign-in has expired. Sign in again." : "That key was rejected. Check the link, or sign in with your password.");
  }
  draft = doc; saved = JSON.stringify(doc);
  if (!draft[section]) section = Object.keys(draft).find((k) => !k.startsWith("_"));
  renderAll();
  if (access === "ok") rememberDevice(); else renderDevice();
  renderSignin();
  if (access === "offline") toast("Local mode: you can edit and preview, but publishing needs the Cloudflare server.", true);
}
boot();
