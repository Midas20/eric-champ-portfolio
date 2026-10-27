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
/* render                                                              */
/* ================================================================== */
function render(S, route, stacks) {
  // plain text bindings
  $$("[data-t]").forEach((el) => { const v = get(S, el.dataset.t); if (v != null) el.textContent = v; });

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
  $("#heroStats").innerHTML = (S.hero.stats || []).filter((s) => String(s.value).trim() !== "" && !isNaN(Number(s.value))).map((s) => {
    const inner = `<span class="num" data-count="${Number(s.value) || 0}" data-suffix="${esc(s.suffix || "")}">0</span><span class="num-label">${esc(s.label)}</span>`;
    return `<li>${s.linkToGithub && C.github ? `<a href="${esc(safeUrl(C.github))}" target="_blank" rel="noopener">${inner}</a>` : inner}</li>`;
  }).join("");

  // pipeline stages
  const stages = S.pipeline.stages || [];
  $("#pipe").innerHTML = stages.map((st, i) => `<li${i === stages.length - 1 ? ' class="pipe-ship"' : ""}><i></i><span>${esc(st)}</span></li>`).join("");

  // experience
  const tl = $("#timeline");
  tl.insertAdjacentHTML("beforeend", (S.experience.items || []).map((it) => `
    <article class="tl-item reveal">
      <div class="tl-dot"></div>
      <p class="tl-date">${esc(it.dates)}</p>
      <h3>${esc(it.title)}</h3>
      <p class="tl-org">${esc(it.org)}</p>
      <p>${esc(it.text)}</p>
    </article>`).join(""));
  $("#certs").innerHTML = (S.experience.certifications || []).map((c) => `<li>${esc(c)}</li>`).join("");

  // skills, each item links to its stack page
  const active = route && route.slug;
  $("#skillsGrid").innerHTML = (S.skills.groups || []).map((g, i) => `
    <div class="skill-group reveal" style="--i:${i}">
      <h3>${esc(g.name)}</h3>
      <ul>${(g.items || []).map((t) => { const s = slugify(t); return `<li><a class="stack-link${s === active ? " on" : ""}" href="/stack/${s}">${esc(t)}</a></li>`; }).join("")}</ul>
    </div>`).join("");

  // about
  $("#aboutParas").innerHTML = (S.about.paragraphs || []).map((p) => `<p>${esc(p)}</p>`).join("");
  $("#values").innerHTML = (S.about.values || []).map((v) => `<li><strong>${esc(v.title)}</strong> ${esc(v.text)}</li>`).join("");

  // contact
  const pairs = (list) => (list || []).map((x) => `<div><dt>${esc(x.k)}</dt><dd>${esc(x.v)}</dd></div>`).join("");
  $("#lookingFor").innerHTML = pairs(S.contact.lookingFor);
  if (!(S.contact.lookingFor || []).length) $("#lookingFor").closest(".looking").hidden = true;
  $("#plan").innerHTML = (S.contact.plan || []).map((x) => `<li><span class="plan-when">${esc(x.when)}</span><span class="plan-what">${esc(x.what)}</span></li>`).join("");
  $("#facts").innerHTML = pairs(S.contact.facts);
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
      cur = i;
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
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) links.forEach((a) => a.classList.toggle("active", a.getAttribute("href").endsWith(`#${en.target.id}`))); });
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
    if (!sec || !p || route) return;   // stack pages lead with the filtered work
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
    sec.hidden = false;
  })();

  /* ---------- references ---------- */
  (function references() {
    const sec = $("#references"), box = $("#refs"), refs = S.references.items || [];
    if (!sec || !box || !refs.length) return;
    box.innerHTML = refs.map((r, i) => `
      <figure class="ref reveal" style="--i:${i}">
        <blockquote>${esc(r.quote)}</blockquote>
        <figcaption><strong>${esc(r.name)}</strong><span class="muted">${esc(r.role)}</span>${r.sample ? '<span class="sample-tag">Example, replace with a real reference</span>' : ""}</figcaption>
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
          <div class="row-head"><h3>${esc(p.title)}</h3><span class="row-year">${esc(p.year)}</span>${p.sample ? '<span class="sample-tag">Example</span>' : ""}</div>
          <p class="row-blurb">${esc(p.blurb)}</p>
          ${p.outcome ? `<p class="row-outcome"><span class="k">Outcome</span>${esc(p.outcome)}</p>` : ""}
          ${meta(p)}
        </div>
        <div class="row-side">
          ${p.metric ? `<p class="row-metric"><b>${esc(p.metric.value)}</b><span>${esc(p.metric.label)}</span></p>` : ""}
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

  /* ---------- section art beside each heading ---------- */
  (function sectionArt() {
    const svg = (inner, h = 170) => `<svg viewBox="0 0 360 ${h}" role="presentation" focusable="false">${inner}</svg>`;
    const T = (x, y, s, cls = "", anchor = "start", d = 0) => `<text x="${x}" y="${y}" class="${cls}" text-anchor="${anchor}" style="--d:${d}s">${esc(s)}</text>`;
    const builders = {
      case(el) {
        const p = projects.find((x) => x.caseStudy) || {};
        const val = p.metric ? String(p.metric.value) : "";
        const m = /^-(\d+(?:\.\d+)?)%$/.exec(val);
        const pct = m ? +m[1] : 35;
        const X = (i) => 30 + i * (300 / 7), Y = (v) => 150 - v * 1.05;
        const ctl = [96, 98, 95, 97, 96, 98, 95, 97];
        const trt = [97, 96, 96 - pct * 0.35, 96 - pct * 0.7, 98 - pct * 0.95, 100 - pct, 101 - pct, 100 - pct];
        const path = (arr) => arr.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(" ");
        const xs = (X(1) + X(2)) / 2;
        el.innerHTML = svg(`<path class="axis" d="M30 154 H330"/>
          <path class="guide fade" style="--d:.2s" d="M${xs} 34 V154"/>${T(xs + 5, 40, "ship", "fade", "start", 0.3)}
          <path class="ln draw" pathLength="1" style="--d:.2s" d="${path(ctl)}"/>
          <path class="ln acc draw" pathLength="1" style="--d:.5s" d="${path(trt)}"/>
          <circle class="dot fade" style="--d:1.8s" cx="${X(7)}" cy="${Y(trt[7])}" r="3.5"/>
          ${T(330, Y(ctl[7]) - 9, "control", "fade", "end", 1.4)}${T(330, Y(trt[7]) + 22, val || `-${pct}%`, "fade big accent", "end", 1.9)}
          ${T(30, 168, "wk 1", "fade", "start", 0.2)}${T(330, 168, "wk 8", "fade", "end", 0.2)}`, 172);
      },
      work(el) {
        el.innerHTML = `<div class="tree"><div class="tree-head"><span class="tree-name">repo/</span><span class="tree-ci">CI</span></div>
          <ul class="tree-list"><li><span>├─ core/</span><span class="muted">algorithm</span></li><li><span>├─ schema.sql</span><span class="muted">schema</span></li>
          <li><span>├─ tests/</span><span class="tree-tests">0 passing</span></li><li><span>└─ web/</span><span class="muted">interface</span></li></ul></div>`;
        const name = $(".tree-name", el), ci = $(".tree-ci", el), lis = $$(".tree-list li", el), tests = $(".tree-tests", el);
        const pool = (route && route.slug && stacks.get(route.slug) ? stacks.get(route.slug).projects : projects).filter((p) => p.tests);
        let k = 0, timers = [], running = false;
        const later = (fn, ms) => timers.push(setTimeout(fn, ms));
        function show(p, animate) {
          name.textContent = `${slugify(p.title)}/`; ci.textContent = "CI"; ci.classList.remove("ok");
          if (!animate) { lis.forEach((li) => li.classList.add("show")); tests.textContent = `${p.tests} passing`; ci.textContent = "CI passing"; ci.classList.add("ok"); return; }
          lis.forEach((li) => li.classList.remove("show")); tests.textContent = "0 passing";
          lis.forEach((li, i) => later(() => li.classList.add("show"), 200 + i * 180));
          const t0 = 200 + 2 * 180;
          later(() => {
            const begin = performance.now(), dur = 800;
            (function tick() {
              const f = Math.min(1, Math.max(0, (performance.now() - begin) / dur));
              tests.textContent = `${Math.round(p.tests * (1 - Math.pow(1 - f, 3)))} passing`;
              if (f < 1 && running) requestAnimationFrame(tick);
            })();
          }, t0);
          later(() => { ci.textContent = "CI passing"; ci.classList.add("ok"); }, t0 + 1100);
          later(() => { if (running) show(pool[++k % pool.length], true); }, t0 + 3400);
        }
        if (!pool.length) { el.innerHTML = ""; return null; }
        return {
          start() { if (running) return; running = true; if (reduceMotion) return show(pool[0], false); show(pool[k % pool.length], true); },
          stop() { running = false; timers.forEach(clearTimeout); timers = []; },
        };
      },
      references(el) {
        const bub = (x, y, w, h, cls, lines, d) => `<g class="bubble ${cls}" style="--d:${d}s"><rect class="bb" x="${x}" y="${y}" width="${w}" height="${h}" rx="9"/>
          ${lines.map((lw, i) => `<rect class="sk" x="${x + 13}" y="${y + 13 + i * 10}" width="${lw}" height="4" rx="2"/>`).join("")}</g>`;
        el.innerHTML = svg(`${bub(16, 12, 230, 46, "", [190, 130], 0)}${bub(116, 68, 228, 46, "mine", [180, 100], 1.2)}
          <g class="bubble" style="--d:2.4s"><rect class="bb" x="16" y="124" width="86" height="34" rx="9"/>
          <circle class="tdot" cx="40" cy="141" r="3" style="--d:0s"/><circle class="tdot" cx="56" cy="141" r="3" style="--d:.2s"/><circle class="tdot" cx="72" cy="141" r="3" style="--d:.4s"/></g>`);
      },
      experience(el) {
        const items = (S.experience.items || []).map((it) => ({ year: (String(it.dates || "").match(/\d{4}/) || [""])[0], label: String(it.title || "").trim().split(/\s+/)[0] })).reverse();
        if (!items.length) return null;
        const n = items.length, x0 = 24, x1 = 336, w = (x1 - x0) / n, yTop = 44, yBot = 132, dy = n > 1 ? (yBot - yTop) / (n - 1) : 0;
        let d = `M${x0} ${yBot}`;
        items.forEach((_, i) => { const y = yBot - i * dy; if (i) d += ` V${y}`; d += ` H${x0 + (i + 1) * w}`; });
        const labels = items.map((it, i) => T(x0 + i * w + 4, yBot - i * dy - 9, it.label, i === n - 1 ? "fade accent" : "fade", "start", 0.5 + i * 0.25)).join("");
        const ticks = items.map((it, i) => `<path class="tick" d="M${x0 + i * w} 147 V153"/>${T(x0 + i * w, 167, it.year, "fade", "start", 0.2)}`).join("");
        el.innerHTML = svg(`<path class="axis" d="M${x0} 150 H${x1}"/>${ticks}<path class="ln acc draw" pathLength="1" style="--d:.2s" d="${d}"/>${labels}
          <circle class="dot fade" style="--d:1.6s" cx="${x1}" cy="${yTop}" r="3.5"/><circle class="pulse fade" style="--d:1.6s" cx="${x1}" cy="${yTop}" r="3.5"/>${T(x1, 167, "now", "fade", "end", 0.2)}`, 172);
      },
      skills(el) {
        el.innerHTML = `<div class="term"><div class="term-bar"><i></i><i></i><i></i><span>pick-stack</span></div><div class="term-body"></div></div>`;
        const body = $(".term-body", el), pool = projects.filter((p) => p.tags && p.tags.length);
        if (!pool.length) return null;
        const out = (p) => "→ " + p.tags.slice(0, 3).join(" · ").toLowerCase();
        let k = 0, timer = 0, running = false;
        const entry = (typed) => {
          const line = document.createElement("div"); line.className = "t-line";
          line.innerHTML = `<span class="t-prompt">$</span> <span class="t-cmd"></span>${typed ? '<span class="t-caret"></span>' : ""}`;
          body.appendChild(line);
          while (body.children.length > 7) body.firstElementChild.remove();
          return line;
        };
        const addOut = (p) => { const o = document.createElement("div"); o.className = "t-out"; o.textContent = out(p); body.appendChild(o); };
        function next() {
          if (!running) return;
          const p = pool[k++ % pool.length], cmd = `pick --for ${slugify(p.title)}`;
          const line = entry(true), cmdEl = $(".t-cmd", line);
          let i = 0;
          (function type() {
            if (!running) return;
            cmdEl.textContent = cmd.slice(0, ++i);
            if (i < cmd.length) { timer = setTimeout(type, 26 + Math.random() * 44); return; }
            const c = $(".t-caret", line); if (c) c.remove();
            timer = setTimeout(() => { addOut(p); timer = setTimeout(next, 1500); }, 260);
          })();
        }
        return {
          start() {
            if (running) return; running = true;
            if (reduceMotion) { pool.slice(0, 3).forEach((p) => { $(".t-cmd", entry(false)).textContent = `pick --for ${slugify(p.title)}`; addOut(p); }); return; }
            next();
          },
          stop() { running = false; clearTimeout(timer); },
        };
      },
      about(el) {
        const team = S.about.team || [];
        const lanes = [team[0] || "product", "me", team[2] || team[1] || "data"];
        const me = "M70 146 C90 146 90 72 110 72 H244 C264 72 264 146 284 146";
        el.innerHTML = svg(`<path class="ln draw" pathLength="1" style="--d:0s" d="M16 146 H292"/>
          <path class="ln draw" pathLength="1" style="--d:.3s" d="M40 146 C60 146 60 36 80 36 H196 C216 36 216 146 236 146"/>
          <path class="ln acc draw" pathLength="1" style="--d:.5s" d="${me}"/>
          <path class="ln draw" pathLength="1" style="--d:.7s" d="M100 146 C120 146 120 108 140 108 H212 C230 108 230 146 250 146"/>
          <circle class="node fade" style="--d:1.0s" cx="128" cy="36" r="4"/><circle class="node fade" style="--d:1.1s" cx="168" cy="36" r="4"/>
          <circle class="node acc fade" style="--d:1.2s" cx="146" cy="72" r="4"/><circle class="node acc fade" style="--d:1.3s" cx="186" cy="72" r="4"/><circle class="node acc fade" style="--d:1.4s" cx="222" cy="72" r="4"/>
          <circle class="node fade" style="--d:1.25s" cx="176" cy="108" r="4"/>
          <circle class="node fade" style="--d:1.5s" cx="236" cy="146" r="4"/><circle class="node fade" style="--d:1.55s" cx="250" cy="146" r="4"/><circle class="node acc fade" style="--d:1.6s" cx="284" cy="146" r="4"/>
          ${T(84, 28, lanes[0], "fade", "start", 0.6)}${T(114, 64, lanes[1], "fade accent", "start", 0.7)}${T(144, 100, lanes[2], "fade", "start", 0.8)}${T(16, 166, "main", "fade", "start", 0.2)}
          <g class="tag fade" style="--d:1.9s"><rect x="296" y="136" width="56" height="20" rx="4"/>${T(324, 150, "shipped", "tag-t", "middle")}</g>
          <circle class="flow" r="3"><animateMotion dur="4.5s" repeatCount="indefinite" path="${me}"/></circle>`, 172);
      },
    };
    const loops = new Map();
    const artIO = new IntersectionObserver((entries) => entries.forEach((en) => {
      const ctl = loops.get(en.target);
      if (en.isIntersecting) { en.target.classList.add("on"); if (ctl) ctl.start(); } else if (ctl) ctl.stop();
    }), { threshold: 0.25 });
    Object.keys(builders).forEach((id) => {
      const sec = document.getElementById(id), head = sec && $(".section-head", sec);
      if (!head || sec.hidden) return;
      const art = document.createElement("div");
      art.className = "head-art"; art.setAttribute("aria-hidden", "true");
      const rows = head.children.length;
      head.classList.add("has-art"); head.appendChild(art);
      art.style.gridRow = `1 / span ${Math.max(rows, 1)}`;
      const ctl = builders[id](art);
      if (ctl) loops.set(art, ctl);
      artIO.observe(art);
    });
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
}

/* ================================================================== */
(async function boot() {
  const raw = await loadSite();
  if (!raw) { document.body.insertAdjacentHTML("afterbegin", '<p style="padding:2rem">Could not load site data.</p>'); return; }
  const S = fillCounts(raw, await siteCounts(raw));
  const route = stackRoute();
  const stacks = stackIndex(S);
  // stack pages open on the filtered work, so the hero and pipeline step aside
  if (route) { document.documentElement.classList.add("stack-page"); $(".hero").hidden = true; $(".pipeline-band").hidden = true; }
  render(S, route, stacks);
  start(S, route, stacks);
})();
