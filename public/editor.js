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
  try { return sessionStorage.getItem("edit-key") || ""; } catch (e) { return ""; }
})();
const api = (path, opts = {}) => fetch(path, { cache: "no-store", ...opts, headers: { "content-type": "application/json", authorization: `Bearer ${KEY}`, ...(opts.headers || {}) } });

/* ---------- state ---------- */
let draft = null, saved = "", section = "hero", jsonMode = false, versions = [], online = true;
const open = new Set();          // open item paths survive re-renders
const isDirty = () => JSON.stringify(draft) !== saved;

/* ---------- copy for the UI ---------- */
const SECTIONS = {
  meta: ["Name & search", "Your name, initials and the title and description search engines and link previews show."],
  config: ["Links & email", "Email, GitHub and LinkedIn are used everywhere on the page. Leave LinkedIn empty to hide it."],
  nav: ["Navigation", "Labels in the top bar."],
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
};
const LABELS = {
  k: "Label", v: "Value", ci: "CI status", repo: "Source URL", link: "Live URL", linkToGithub: "Links to GitHub",
  sample: "Example data (shows an “example” tag on the page)", titleLine1: "Headline, line 1", titleLine2: "Headline, line 2",
  ctaPrimary: "Main button", ctaSecondary: "Second button", allProjectsUrl: "“See all projects” URL", lede: "Intro paragraph",
  moreLabel: "“See all” link text", certificationsLabel: "Certifications heading", lookingFor: "What I’m looking for",
};
const LONG = /^(lede|text|blurb|quote|description|outcome|context|problem|approach|result|status|now|what)$/;
const INLINE_LISTS = [/^work\.projects\.\d+\.tags$/, /^skills\.groups\.\d+\.items$/, /^about\.team$/, /^pipeline\.stages$/];
const TEMPLATES = {
  "hero.stats": { value: "", suffix: "", label: "", linkToGithub: false },
  "hero.layers": { label: "", note: "" },
  "work.filters": { key: "", label: "" },
  "work.projects": { title: "", blurb: "", outcome: "", metric: { value: "", label: "" }, tags: [], category: "fullstack", year: new Date().getFullYear(), link: "", repo: "", ci: "passing", tests: 0, coverage: "", sample: false },
  "references.items": { quote: "", name: "", role: "", sample: false },
  "experience.items": { dates: "", title: "", org: "", text: "" },
  "experience.certifications": "",
  "skills.groups": { name: "", items: [] },
  "about.paragraphs": "",
  "about.values": { title: "", text: "" },
  "contact.lookingFor": { k: "", v: "" },
  "contact.plan": { when: "", what: "" },
  "contact.facts": { k: "", v: "" },
};
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
  if (key === "category" && /^work\.projects\.\d+$/.test(path.split(".").slice(0, -1).join("."))) {
    const opts = (draft.work.filters || []).filter((f) => f.key !== "all").map((f) => `<option value="${esc(f.key)}"${f.key === v ? " selected" : ""}>${esc(f.label)}</option>`).join("");
    return `<div class="fld">${label}<select id="${id}" data-path="${path}" data-type="str">${opts}</select></div>`;
  }
  const long = LONG.test(key) || String(v || "").length > 90;
  const type = /url|link|repo|github|linkedin/i.test(key) ? "url" : "text";
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
  if (INLINE_LISTS.some((re) => re.test(path))) return inlineList(path, key, arr);
  const objects = arr.length ? typeof arr[0] === "object" : typeof TEMPLATES[pattern(path)] === "object";
  const head = `<div class="list-h"><span class="lbl">${esc(human(key))} · ${arr.length}</span></div>`;
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
    return `<details class="item" data-open="${p}"${open.has(p) ? " open" : ""}>
      <summary><span class="sum-n">${String(i + 1).padStart(2, "0")}</span><span class="sum-t">${esc(itemTitle(it, i))}</span>${it && it.sample ? '<span class="badge">example</span>' : ""}${ctl(path, i, arr.length)}</summary>
      <div class="item-body">${obj(p, it, true)}</div></details>`;
  }).join("")}${add}</div>`;
}

function obj(path, o, bare = false) {
  const entries = Object.entries(o || {}).filter(([k]) => !k.startsWith("_"));
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
  panel.innerHTML = `<h1>${esc(title)}</h1>${lead ? `<p class="lead">${esc(lead)}</p>` : ""}${
    Array.isArray(value) ? list(section, section, value) : obj(section, value)}`;
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
  const el = e.target, path = el.dataset.path;
  if (!path) return;
  const t = el.dataset.type;
  const v = t === "bool" ? el.checked : t === "num" ? (el.value === "" ? 0 : Number(el.value)) : t === "csv" ? el.value.split(",").map((s) => s.trim()).filter(Boolean) : el.value;
  setAt(path, v);
  // keep the item's summary title in step with its fields
  const item = el.closest("details.item");
  if (item) { const it = getAt(item.dataset.open); const s = $(".sum-t", item); if (s) s.textContent = itemTitle(it, 0); }
  renderSidebar();
});
$("#panel").addEventListener("change", (e) => { if (e.target.type === "checkbox" || e.target.tagName === "SELECT") renderSidebar(); });
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
  else return;
  renderAll();
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
  draft = JSON.parse(saved); delete b.dataset.confirm; b.textContent = "Discard unpublished changes"; renderAll(); toast("Changes discarded.");
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
  $("#gateKey").focus();
}
$("#gateForm").addEventListener("submit", (e) => {
  e.preventDefault();
  KEY = $("#gateKey").value.trim();
  try { sessionStorage.setItem("edit-key", KEY); } catch (err) {}
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
  if (access === "denied") { try { sessionStorage.removeItem("edit-key"); } catch (e) {} return gate("That key was rejected. Check the link or paste the key again."); }
  draft = doc; saved = JSON.stringify(doc);
  if (!draft[section]) section = Object.keys(draft).find((k) => !k.startsWith("_"));
  renderAll();
  if (access === "offline") toast("Local mode: you can edit and preview, but publishing needs the Cloudflare server.", true);
}
boot();
