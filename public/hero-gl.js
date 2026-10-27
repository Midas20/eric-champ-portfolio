/* ==================================================================
   Hero particles (WebGL2, no dependencies)
   On a first visit the particles first spell a big dotted word (the rest
   twinkle as stars), then flow from the word into the layer stack.
   A loose cloud of particles pulls together into the layer stack, the
   stack turns and follows the pointer, the layer in the caption glows,
   and on scroll the particles pour down into the pipeline line.
   heroParticles(opts) returns a controller, or null when WebGL2 is not
   available (the page then keeps the CSS stack).
   ================================================================== */
(function () {
  const VERT = `#version 300 es
  in vec3 aSphere; in vec3 aStack; in float aLineX; in vec4 aSeed;   // seed: random, layer 0..1, size, edge
  in vec3 aWord;                                                      // word phase: x, y (clip space), 1 = part of the word, 0 = a star
  uniform float uTime, uAssemble, uFlow, uRot, uActive, uLayers, uDpr, uLineY, uWord, uDot;
  uniform vec2 uCenter, uCloud, uK, uTilt;
  out float vAlpha; out float vHot; out float vWord; out float vX;
  vec3 rotY(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z); }
  vec3 rotX(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x, c * p.y - s * p.z, s * p.y + c * p.z); }
  void main() {
    float r = aSeed.x;
    float a = smoothstep(r * 0.4, r * 0.4 + 0.6, uAssemble);
    float layer = aSeed.y * (uLayers - 1.0);
    float hot = 1.0 - smoothstep(0.0, 0.6, abs(layer - uActive));
    float breathe = 1.0 + 0.04 * sin(uTime * 0.7 + r * 40.0);
    vec3 drift = vec3(sin(uTime * 0.3 + r * 17.0), cos(uTime * 0.25 + r * 23.0), sin(uTime * 0.2 + r * 31.0)) * 0.06;
    vec3 st = aStack; st.y += hot * 0.07;            // the layer in the caption lifts a little
    vec3 p = mix(aSphere * breathe + drift, st, a);
    p = rotY(p, uRot + uTilt.x * 0.22);
    p = rotX(p, 0.98 + uTilt.y * 0.08);              // the same top-down angle as the CSS plates
    float z = p.z + 5.0, persp = 5.0 / z;
    vec2 clip = mix(uCloud, uCenter, smoothstep(0.0, 1.0, uAssemble)) + p.xy * uK * persp * mix(1.35, 1.0, a);
    // scroll: each particle falls on a curve into the line at the bottom of the hero
    float f = smoothstep(r * 0.55, r * 0.55 + 0.45, uFlow);
    vec2 target = vec2(aLineX, uLineY);
    vec2 mid = vec2(mix(clip.x, target.x, 0.25), mix(clip.y, target.y, 0.9));
    vec2 q = mix(mix(clip, mid, f), mix(mid, target, f), f);
    vHot = hot * a * (1.0 - f);
    float size = (aSeed.z + vHot * 0.5) * uDpr * persp * mix(1.3, 1.0, a) * mix(1.0, 0.85, f);
    // edges crisp, surfaces soft; the active plate brighter, the rest calmer
    float surface = mix(0.38, 0.95, aSeed.w);
    float alpha = mix(0.55, surface * mix(0.6, 1.25, vHot), a) * mix(1.0, 0.85, f);
    // word phase: word particles sit on a dot grid, the others twinkle where they are put
    float w = smoothstep(r * 0.35, r * 0.35 + 0.65, uWord);
    float twinkle = 0.25 + 0.3 * (0.5 + 0.5 * sin(uTime * 2.2 + r * 60.0));
    gl_Position = vec4(mix(q, aWord.xy, w), 0.0, 1.0);
    gl_PointSize = mix(size, aWord.z > 0.5 ? uDot : 1.4 * uDpr, w);
    vAlpha = mix(alpha, aWord.z > 0.5 ? 0.95 : twinkle, w);
    vWord = w * aWord.z; vX = aWord.x * 0.5 + 0.5;
  }`;
  const FRAG = `#version 300 es
  precision mediump float;
  in float vAlpha; in float vHot; in float vWord; in float vX;
  uniform vec3 uColor, uHotColor, uColor2;
  out vec4 o;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float m = smoothstep(0.5, 0.08, d);
    vec3 c = mix(mix(uColor, uHotColor, vHot), mix(uColor, uColor2, vX), vWord);   // the word runs accent to sky
    o = vec4(c, m * vAlpha);
  }`;

  const hex = (h) => { const n = parseInt(h.replace("#", "").slice(0, 6), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };
  const ease = (t) => 1 - Math.pow(1 - t, 3);

  window.heroParticles = function heroParticles(opts) {
    const { canvas, anchor, layers = 5, getActive = () => 0, reduceMotion = false, waitFor = () => false, instant = false, word = "" } = opts;
    const gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: false, antialias: false, powerPreference: "high-performance" });
    if (!gl) return null;

    const compile = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const prog = gl.createProgram();
    try {
      gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    } catch (e) { console.warn("hero particles disabled:", e.message); return null; }
    gl.useProgram(prog);

    /* ---------- geometry ---------- */
    const small = Math.min(innerWidth, innerHeight) < 700;
    const N = small ? 5000 : 12000;
    const sphere = new Float32Array(N * 3), stack = new Float32Array(N * 3), lineX = new Float32Array(N), seed = new Float32Array(N * 4);
    const half = 0.8, gap = 0.4;   // plate half-size and spacing (world units)
    const plateY = (i) => ((layers - 1) / 2 - i) * gap;
    for (let k = 0; k < N; k++) {
      // cloud: a thick sphere shell
      const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, rad = 2.1 * Math.cbrt(0.55 + 0.45 * Math.random());
      const s = Math.sqrt(1 - u * u);
      sphere.set([rad * s * Math.cos(th), rad * u, rad * s * Math.sin(th)], k * 3);
      // stack: an even surface on every plate, with a denser, brighter outline
      const layer = Math.floor(Math.random() * layers);
      let x, zz, edge = 0;
      if (Math.random() < 0.3) {
        const side = Math.floor(Math.random() * 4), t = Math.random() * 2 - 1;
        x = side < 2 ? t * half : (side === 2 ? half : -half); zz = side < 2 ? (side ? half : -half) : t * half;
        edge = 1;
      } else {
        x = (Math.random() * 2 - 1) * half; zz = (Math.random() * 2 - 1) * half;
      }
      const y = plateY(layer);
      // rotate the square 45 degrees so it reads as a diamond, like the CSS plates
      const rx = (x - zz) * 0.7071, rz = (x + zz) * 0.7071;
      stack.set([rx, y, rz], k * 3);
      lineX[k] = Math.random() * 2.2 - 1.1;
      seed.set([Math.random(), layer / Math.max(1, layers - 1), edge ? 2.0 + Math.random() * 0.6 : 1.8 + Math.random() * 0.5, edge], k * 4);
    }
    const attr = (name, data, size) => {
      const loc = gl.getAttribLocation(prog, name), buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
      return buf;
    };
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    attr("aSphere", sphere, 3); attr("aStack", stack, 3); attr("aLineX", lineX, 1); attr("aSeed", seed, 4);
    const wordPts = new Float32Array(N * 3), wordBuf = attr("aWord", wordPts, 3);
    const U = Object.fromEntries(["uTime", "uAssemble", "uFlow", "uRot", "uActive", "uLayers", "uDpr", "uLineY", "uWord", "uDot", "uCenter", "uCloud", "uK", "uTilt", "uColor", "uHotColor", "uColor2"].map((n) => [n, gl.getUniformLocation(prog, n)]));

    /* ---------- the word: rendered once to a hidden canvas, read back as a grid of dots ---------- */
    const wordMode = !!word && !instant && !reduceMotion && waitFor();
    function buildWord() {
      if (!wordMode) return;
      const c2 = document.createElement("canvas"), ctx = c2.getContext("2d", { willReadFrequently: true });
      c2.width = Math.max(1, Math.round(W)); c2.height = Math.max(1, Math.round(H));
      const font = (px) => `700 ${px}px Geist, "Segoe UI", system-ui, sans-serif`;
      ctx.font = font(100);
      const fit = Math.min((Math.min(W * 0.9, 1240) / Math.max(1, ctx.measureText(word).width)) * 100, H * 0.3);
      ctx.font = font(fit); ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = ctx.strokeStyle = "#fff"; ctx.lineWidth = fit * 0.05;
      const wy = Math.min(H, innerHeight) * 0.43;   // middle of the first screen, above the name
      ctx.fillText(word, W / 2, wy); ctx.strokeText(word, W / 2, wy);   // a stroke thickens the letters so each stem is several dots wide
      const step = Math.max(4, Math.round(fit / 20)), img = ctx.getImageData(0, 0, c2.width, c2.height).data, pts = [];
      for (let y = step / 2; y < c2.height; y += step) for (let x = step / 2; x < c2.width; x += step) if (img[(Math.floor(y) * c2.width + Math.floor(x)) * 4 + 3] > 140) pts.push([x / W * 2 - 1, 1 - y / H * 2]);
      for (let k = 0; k < N; k++) {
        const pt = k < Math.min(pts.length, Math.floor(N * 0.85)) ? pts[k] : null;
        wordPts.set(pt ? [pt[0], pt[1], 1] : [Math.random() * 2 - 1, Math.random() * 2 - 1, 0], k * 3);
      }
      // more dots than particles: spread the particles over the whole word, not just its first letters
      if (pts.length > N * 0.85) for (let k = 0; k < Math.floor(N * 0.85); k++) { const pt = pts[Math.floor(k * pts.length / (N * 0.85))]; wordPts.set([pt[0], pt[1], 1], k * 3); }
      gl.bindBuffer(gl.ARRAY_BUFFER, wordBuf); gl.bufferData(gl.ARRAY_BUFFER, wordPts, gl.STATIC_DRAW);
      gl.uniform1f(U.uDot, step * 0.9 * dpr);
    }
    gl.uniform1f(U.uLayers, layers);

    /* ---------- colours follow the theme ---------- */
    let light = false;
    function recolor() {
      const css = getComputedStyle(document.documentElement);
      const acc = css.getPropertyValue("--accent").trim() || "#7b8cff";
      const bg = css.getPropertyValue("--bg").trim() || "#0e0f13";
      light = hex(bg).reduce((a, b) => a + b, 0) > 1.5;
      const c = hex(acc);
      gl.uniform3fv(U.uColor, c);
      gl.uniform3fv(U.uColor2, hex(css.getPropertyValue("--p2").trim() || "#38bdf8"));
      gl.uniform3fv(U.uHotColor, light ? c.map((v) => v * 0.55) : c.map((v) => v + (1 - v) * 0.6));
      if (light) gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); else gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      if (!running) frame(performance.now());
    }
    gl.enable(gl.BLEND); gl.disable(gl.DEPTH_TEST);

    /* ---------- layout: the stack sits where the CSS stack was ---------- */
    let W = 0, H = 0, dpr = 1;
    function resize() {
      dpr = Math.min(devicePixelRatio || 1, 2);
      W = canvas.clientWidth; H = canvas.clientHeight;
      canvas.width = Math.max(1, Math.floor(W * dpr)); canvas.height = Math.max(1, Math.floor(H * dpr));
      gl.viewport(0, 0, canvas.width, canvas.height);
      const cr = canvas.getBoundingClientRect(), ar = anchor.getBoundingClientRect();
      const cx = (ar.left + ar.width * 0.56 - cr.left) / W * 2 - 1, cy = 1 - (ar.top + ar.height * 0.4 - cr.top) / H * 2;
      const k = Math.max(120, ar.width) / 2.45;   // px per world unit
      gl.uniform2f(U.uCenter, cx, cy);
      gl.uniform2f(U.uCloud, cx * 0.45, cy * 0.6);   // the cloud starts nearer the middle, behind the headline
      gl.uniform2f(U.uK, k / (W / 2), k / (H / 2));
      gl.uniform1f(U.uDpr, dpr);
      gl.uniform1f(U.uLineY, -1 + 6 / H);
      buildWord();
      if (!running) frame(performance.now());
    }

    /* ---------- state ---------- */
    const t0 = performance.now();
    let assembleStart = null, running = false, raf = 0, visible = true, rot = 0, last = t0, active = 0, release = null;
    const tilt = { x: 0, y: 0, tx: 0, ty: 0 };
    function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (assembleStart === null && !waitFor()) { assembleStart = now + (wordMode ? 350 : 150); release = now; }
      const asm = reduceMotion || instant ? 1 : assembleStart === null ? 0 : ease(Math.min(1, Math.max(0, (now - assembleStart) / 2200)));
      // word: gathers while the intro runs, then lets go so the dots flow on into the stack
      const wd = !wordMode ? 0 : release === null ? ease(Math.min(1, (now - t0) / 1300)) : 1 - ease(Math.min(1, (now - release) / 1700));
      gl.uniform1f(U.uWord, wd);
      const hero = canvas.parentElement.getBoundingClientRect();
      const flow = reduceMotion ? 0 : Math.min(1, Math.max(0, -hero.top / (hero.height * 0.75)));
      rot = reduceMotion ? 0 : Math.sin((now - t0) / 1000 * 0.35) * 0.2;   // a slow sway, not a spin
      tilt.x += (tilt.tx - tilt.x) * 0.05; tilt.y += (tilt.ty - tilt.y) * 0.05;
      active += (getActive() - active) * 0.12;
      gl.uniform1f(U.uTime, (now - t0) / 1000);
      gl.uniform1f(U.uAssemble, asm);
      gl.uniform1f(U.uFlow, flow);
      gl.uniform1f(U.uRot, rot);
      gl.uniform1f(U.uActive, active);
      gl.uniform2f(U.uTilt, tilt.x, tilt.y);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.POINTS, 0, N);
    }
    function loop(now) { frame(now); raf = requestAnimationFrame(loop); }
    const play = () => { if (running || reduceMotion) return; running = true; last = performance.now(); raf = requestAnimationFrame(loop); };
    const pause = () => { running = false; cancelAnimationFrame(raf); };

    recolor(); resize();
    addEventListener("resize", resize);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(resize);
    if (wordMode && document.fonts && document.fonts.load) document.fonts.load("700 100px Geist").then(buildWord, () => {});
    addEventListener("pointermove", (e) => { tilt.tx = (e.clientX / innerWidth - 0.5) * 2; tilt.ty = (e.clientY / innerHeight - 0.5) * 2; }, { passive: true });
    new IntersectionObserver(([en]) => { visible = en.isIntersecting; visible && !document.hidden ? play() : pause(); }).observe(canvas);
    document.addEventListener("visibilitychange", () => { document.hidden || !visible ? pause() : play(); });
    if (reduceMotion) frame(performance.now()); else play();
    return { recolor, resize };
  };
})();

/* ==================================================================
   Page particles: a depth field behind the whole page.
   Scrolling moves near particles faster than far ones and stretches
   them into speed lines; they drift away from the pointer; at Contact
   they gather into a check mark that turns green.
   ================================================================== */
(function () {
  const VERT = `#version 300 es
  in vec3 aBase; in vec2 aShape; in vec2 aSeed;   // base: x (-1..1), y (0..1), depth; shape: check-mark point; seed: random, size
  uniform float uTime, uScroll, uVel, uGather, uFade, uDpr, uAspect;
  uniform vec2 uMouse, uTarget, uTargetK;
  out float vAlpha; out float vStretch; out float vGreen;
  void main() {
    float d = aBase.z, r = aSeed.x;
    float y = fract(aBase.y - uScroll * (0.15 + d * 0.85) + uTime * 0.004 * (0.3 + d));
    vec2 p = vec2(aBase.x + sin(uTime * 0.2 + r * 30.0) * 0.015, 1.0 - y * 2.0) * vec2(1.06, 1.12);
    vec2 m = p - uMouse; m.x *= uAspect;
    float dm = length(m);
    p += normalize(m + 1e-4) * vec2(1.0 / uAspect, 1.0) * 0.07 * d * smoothstep(0.3, 0.0, dm);
    float g = smoothstep(r * 0.5, r * 0.5 + 0.5, uGather);
    vec2 shape = uTarget + aShape * uTargetK;
    p = mix(p, shape, g);
    gl_Position = vec4(p, 0.0, 1.0);
    vStretch = 1.0 + min(abs(uVel) * 60.0 * d, 6.0) * (1.0 - g);
    vGreen = g;
    gl_PointSize = aSeed.y * (0.6 + d) * uDpr * mix(vStretch * 0.9, 1.4, g);
    vAlpha = (0.05 + d * 0.2) * uFade * mix(1.0, 3.2, g);
  }`;
  const FRAG = `#version 300 es
  precision mediump float;
  in float vAlpha; in float vStretch; in float vGreen;
  uniform vec3 uColor, uOk;
  out vec4 o;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float m = smoothstep(0.5, 0.1, length(vec2(c.x * vStretch, c.y)));
    o = vec4(mix(uColor, uOk, vGreen), m * vAlpha);
  }`;
  const hex = (h) => { const n = parseInt(String(h).replace("#", "").slice(0, 6), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };

  window.pageParticles = function pageParticles(opts) {
    const { canvas, goal, hero } = opts;
    const gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: false, antialias: false });
    if (!gl) return null;
    const sh = (t, src) => { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const prog = gl.createProgram();
    try { gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG)); gl.linkProgram(prog); if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog)); }
    catch (e) { console.warn("page particles disabled:", e.message); return null; }
    gl.useProgram(prog);

    const N = Math.min(innerWidth, innerHeight) < 700 ? 900 : 2000;
    const base = new Float32Array(N * 3), shape = new Float32Array(N * 2), seed = new Float32Array(N * 2);
    // the check mark (two strokes) inside a ring, in a unit box
    const strokes = [[[-0.42, 0.02], [-0.12, -0.3]], [[-0.12, -0.3], [0.48, 0.34]]];
    for (let k = 0; k < N; k++) {
      base.set([Math.random() * 2 - 1, Math.random(), Math.pow(Math.random(), 1.6)], k * 3);
      const role = Math.random();
      let x, y;
      if (role < 0.55) {
        const [a, b] = strokes[Math.random() < 0.35 ? 0 : 1], t = Math.random();
        x = a[0] + (b[0] - a[0]) * t + (Math.random() - 0.5) * 0.05; y = a[1] + (b[1] - a[1]) * t + (Math.random() - 0.5) * 0.05;
      } else {
        const th = Math.random() * Math.PI * 2, rr = 0.82 + (Math.random() - 0.5) * (role < 0.85 ? 0.03 : 0.5);
        x = Math.cos(th) * rr; y = Math.sin(th) * rr;
      }
      shape.set([x, y], k * 2);
      seed.set([Math.random(), 1.2 + Math.random() * 2.2], k * 2);
    }
    const attr = (name, data, size) => { const loc = gl.getAttribLocation(prog, name), buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0); };
    gl.bindVertexArray(gl.createVertexArray());
    attr("aBase", base, 3); attr("aShape", shape, 2); attr("aSeed", seed, 2);
    const U = Object.fromEntries(["uTime", "uScroll", "uVel", "uGather", "uFade", "uDpr", "uAspect", "uMouse", "uTarget", "uTargetK", "uColor", "uOk"].map((n) => [n, gl.getUniformLocation(prog, n)]));
    gl.enable(gl.BLEND);

    function recolor() {
      const css = getComputedStyle(document.documentElement);
      const light = hex(css.getPropertyValue("--bg").trim() || "#0e0f13").reduce((a, b) => a + b, 0) > 1.5;
      gl.uniform3fv(U.uColor, hex(css.getPropertyValue("--accent").trim() || "#7b8cff"));
      gl.uniform3fv(U.uOk, hex(css.getPropertyValue("--ok").trim() || "#3ddc97"));
      light ? gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA) : gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    }
    let W = 0, H = 0, dpr = 1;
    function resize() {
      dpr = Math.min(devicePixelRatio || 1, 2);
      W = innerWidth; H = innerHeight;
      canvas.width = Math.floor(W * dpr); canvas.height = Math.floor(H * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform1f(U.uDpr, dpr); gl.uniform1f(U.uAspect, W / H);
    }
    recolor(); resize();
    addEventListener("resize", resize);

    const mouse = { x: 9, y: 9, tx: 9, ty: 9 };
    addEventListener("pointermove", (e) => { mouse.tx = e.clientX / W * 2 - 1; mouse.ty = 1 - e.clientY / H * 2; }, { passive: true });
    let lastY = scrollY, vel = 0, gather = 0, raf = 0, running = false;
    const t0 = performance.now();
    function frame(now) {
      const y = scrollY, dy = (y - lastY) / Math.max(1, H); lastY = y;
      vel += (dy - vel) * 0.25;
      mouse.x += (mouse.tx - mouse.x) * 0.08; mouse.y += (mouse.ty - mouse.y) * 0.08;
      // gather into the check mark while the goal (contact title) is in the middle of the screen
      let want = 0, tx = 0, ty = 0, tk = 60;
      const el = typeof goal === "function" ? goal() : goal;
      if (el && el.isConnected) {
        const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        if (r.width) {
          want = Math.min(1, Math.max(0, 1 - Math.abs(cy - H * 0.5) / (H * 0.5)) * 1.6);
          tx = cx / W * 2 - 1; ty = 1 - cy / H * 2;
          tk = 46;
        }
      }
      gather += (want - gather) * 0.06;
      const heroH = hero ? hero.offsetHeight : H;
      gl.uniform1f(U.uTime, (now - t0) / 1000);
      gl.uniform1f(U.uScroll, y / (H * 2.2));
      gl.uniform1f(U.uVel, vel);
      gl.uniform1f(U.uGather, gather);
      gl.uniform1f(U.uFade, Math.min(1, Math.max(0.15, (y - heroH * 0.2) / (heroH * 0.6))));
      gl.uniform2f(U.uMouse, mouse.x, mouse.y);
      gl.uniform2f(U.uTarget, tx, ty);
      gl.uniform2f(U.uTargetK, tk / (W / 2), tk / (H / 2));
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.POINTS, 0, N);
      raf = requestAnimationFrame(frame);
    }
    const play = () => { if (!running) { running = true; raf = requestAnimationFrame(frame); } };
    const pause = () => { running = false; cancelAnimationFrame(raf); };
    document.addEventListener("visibilitychange", () => (document.hidden ? pause() : play()));
    play();
    return { recolor };
  };
})();
