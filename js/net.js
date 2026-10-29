/* =============================================================================
 * GUNR.DEV — net.js
 * Fixed background canvas: a drifting neural mesh with signal pulses that flow
 * "forward" (downward) from node to node. Tint and pulse rate follow the layer
 * the visitor is in.
 *
 * window.GUNR_NET = {
 *   setLayer(index)   0..5, called by journey.js when the current layer changes
 *   burst(n)          fire n extra pulses
 *   pause(), resume() manual control (e.g. while an overlay covers the page)
 *   refreshColors()   re-read --accent* (also automatic on data-theme change)
 * }
 * Performance: DPR capped (2 desktop / 1.5 phone), ~34 nodes on phones and
 * 30fps there, stops when the tab is hidden, and draws a single static frame
 * under prefers-reduced-motion.
 * ========================================================================== */
(function () {
  "use strict";

  var noop = function () {};
  var canvas = document.getElementById("net");
  var ctx = canvas && canvas.getContext ? canvas.getContext("2d") : null;
  if (!ctx) {
    window.GUNR_NET = { setLayer: noop, burst: noop, pause: noop, resume: noop, refreshColors: noop };
    return;
  }

  var mqReduce = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
  var finePointer = window.matchMedia ? window.matchMedia("(hover: hover) and (pointer: fine)").matches : false;
  var coarsePointer = window.matchMedia ? window.matchMedia("(pointer: coarse)").matches : false;
  // Data saver: draw one static frame instead of animating.
  var saveData = !!(navigator.connection && navigator.connection.saveData);

  // Which palette slot tints each layer: input, embedding, attention, hidden, weights, output.
  var LAYER_TINT = ["accent", "accent2", "accent2", "accent3", "accent", "accent"];

  var W = 0, H = 0, DPR = 1, small = false;
  var nodes = [], edges = [], adj = [], pulses = [];
  var palette = { accent: [57, 255, 156], accent2: [0, 212, 255], accent3: [255, 181, 71] };
  var color = palette.accent.slice();
  var target = palette.accent.slice();
  var layer = 0;
  var raf = 0, running = false, manualPause = false, last = 0, clock = 0, spawnAcc = 0, frameSkip = false;
  var pointer = { x: -9999, y: -9999, on: false };

  /* ---- colors --------------------------------------------------------------- */
  function parseColor(str, fallback) {
    str = (str || "").trim();
    var m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(str);
    if (m) {
      var h = m[1];
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    }
    m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i.exec(str);
    if (m) return [+m[1], +m[2], +m[3]];
    return fallback;
  }

  function refreshColors() {
    var cs = getComputedStyle(document.documentElement);
    palette.accent = parseColor(cs.getPropertyValue("--accent"), palette.accent);
    palette.accent2 = parseColor(cs.getPropertyValue("--accent-2"), palette.accent2);
    palette.accent3 = parseColor(cs.getPropertyValue("--accent-3"), palette.accent3);
    target = palette[LAYER_TINT[layer]] || palette.accent;
    if (!running) { color = target.slice(); draw(0); }
  }

  function rgba(c, a) {
    return "rgba(" + (c[0] | 0) + "," + (c[1] | 0) + "," + (c[2] | 0) + "," + a + ")";
  }

  /* ---- build ---------------------------------------------------------------- */
  // Small deterministic PRNG so the mesh looks the same on every visit.
  var seed = 1337;
  function rand() {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  }

  function size() {
    var r = canvas.getBoundingClientRect();
    W = Math.max(1, Math.round(r.width));
    H = Math.max(1, Math.round(r.height));
    small = W < 720 || coarsePointer; // landscape phones count as small too
    DPR = Math.min(window.devicePixelRatio || 1, small ? 1.5 : 2);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
  }

  function build() {
    seed = 1337;
    var count = small ? 34 : (W < 1200 ? 64 : 84);
    // Jittered grid gives even coverage without clumps.
    var cols = Math.max(3, Math.round(Math.sqrt(count * W / H)));
    var rows = Math.ceil(count / cols);
    var cw = W / cols, ch = H / rows;
    nodes = [];
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols && nodes.length < count; c++) {
        nodes.push({
          hx: (c + 0.15 + rand() * 0.7) * cw,
          hy: (r + 0.15 + rand() * 0.7) * ch,
          amp: 4 + rand() * 10,
          ph: rand() * Math.PI * 2,
          sp: 0.15 + rand() * 0.35,
          r: 0.8 + rand() * 1.2,
          flash: 0,
          x: 0, y: 0
        });
      }
    }
    // Connect each node to its 3 nearest neighbours.
    edges = [];
    adj = nodes.map(function () { return []; });
    var seen = {};
    var maxD = Math.max(cw, ch) * 2.2;
    for (var i = 0; i < nodes.length; i++) {
      var near = [];
      for (var j = 0; j < nodes.length; j++) {
        if (i === j) continue;
        var dx = nodes[i].hx - nodes[j].hx, dy = nodes[i].hy - nodes[j].hy;
        near.push({ j: j, d: dx * dx + dy * dy });
      }
      near.sort(function (a, b) { return a.d - b.d; });
      for (var k = 0; k < 3 && k < near.length; k++) {
        var a = Math.min(i, near[k].j), b = Math.max(i, near[k].j);
        var key = a + "_" + b;
        if (seen[key] || Math.sqrt(near[k].d) > maxD) continue;
        seen[key] = 1;
        adj[a].push(edges.length);
        adj[b].push(edges.length);
        edges.push({ a: a, b: b });
      }
    }
    pulses = [];
    place(0);
  }

  function place(t) {
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      n.x = n.hx + Math.sin(t * n.sp + n.ph) * n.amp;
      n.y = n.hy + Math.cos(t * n.sp * 0.8 + n.ph) * n.amp;
    }
  }

  /* ---- pulses --------------------------------------------------------------- */
  function maxPulses() { return small ? 10 : 22; }

  function spawn(fromTop) {
    if (!edges.length || pulses.length >= maxPulses()) return;
    // Prefer starting near the top so signals visibly travel "forward".
    var idx = 0, tries = 0;
    do {
      idx = (rand() * nodes.length) | 0;
      tries++;
    } while (fromTop && nodes[idx].hy > H * 0.45 && tries < 6);
    var list = adj[idx];
    if (!list.length) return;
    launch(idx, pickEdge(idx, -1), 0);
  }

  // Pick an outgoing edge, weighting downward edges 3:1.
  function pickEdge(nodeIdx, cameFrom) {
    var list = adj[nodeIdx], total = 0, weights = [];
    for (var i = 0; i < list.length; i++) {
      var e = edges[list[i]];
      if (list[i] === cameFrom) { weights.push(0); continue; }
      var other = e.a === nodeIdx ? e.b : e.a;
      var w = nodes[other].hy > nodes[nodeIdx].hy ? 3 : 1;
      weights.push(w);
      total += w;
    }
    if (!total) return list[0];
    var pick = rand() * total;
    for (i = 0; i < list.length; i++) {
      pick -= weights[i];
      if (pick <= 0) return list[i];
    }
    return list[list.length - 1];
  }

  function launch(fromNode, edgeIdx, hops) {
    var e = edges[edgeIdx];
    pulses.push({
      e: edgeIdx,
      from: fromNode,
      to: e.a === fromNode ? e.b : e.a,
      t: 0,
      speed: 110 + rand() * 90, // px per second
      hops: hops
    });
  }

  /* ---- frame ---------------------------------------------------------------- */
  function step(dt) {
    clock += dt;
    place(clock);

    for (var c = 0; c < 3; c++) color[c] += (target[c] - color[c]) * Math.min(1, dt * 2.5);

    spawnAcc += dt * (1.1 + layer * 0.3);
    while (spawnAcc >= 1) { spawnAcc -= 1; spawn(true); }

    for (var i = pulses.length - 1; i >= 0; i--) {
      var p = pulses[i];
      var A = nodes[p.from], B = nodes[p.to];
      var len = Math.max(8, Math.hypot(B.x - A.x, B.y - A.y));
      p.t += (dt * p.speed) / len;
      if (p.t >= 1) {
        B.flash = 1;
        pulses.splice(i, 1);
        if (p.hops < 7 && rand() < 0.78 && pulses.length < maxPulses()) {
          launch(p.to, pickEdge(p.to, p.e), p.hops + 1);
        }
      }
    }
    for (i = 0; i < nodes.length; i++) if (nodes[i].flash > 0) nodes[i].flash = Math.max(0, nodes[i].flash - dt * 1.6);
  }

  function draw() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    var i, n, e;

    // Edges in a single path.
    ctx.lineWidth = 1;
    ctx.strokeStyle = rgba(color, 0.07 + layer * 0.012);
    ctx.beginPath();
    for (i = 0; i < edges.length; i++) {
      e = edges[i];
      ctx.moveTo(nodes[e.a].x, nodes[e.a].y);
      ctx.lineTo(nodes[e.b].x, nodes[e.b].y);
    }
    ctx.stroke();

    // Pointer "probe" lines (desktop only).
    if (pointer.on) {
      ctx.strokeStyle = rgba(color, 0.18);
      ctx.beginPath();
      for (i = 0; i < nodes.length; i++) {
        n = nodes[i];
        var dx = n.x - pointer.x, dy = n.y - pointer.y;
        if (dx * dx + dy * dy < 140 * 140) { ctx.moveTo(pointer.x, pointer.y); ctx.lineTo(n.x, n.y); }
      }
      ctx.stroke();
    }

    // Nodes as tiny squares in one path.
    ctx.fillStyle = rgba(color, 0.45);
    ctx.beginPath();
    for (i = 0; i < nodes.length; i++) {
      n = nodes[i];
      ctx.rect(n.x - n.r, n.y - n.r, n.r * 2, n.r * 2);
    }
    ctx.fill();

    ctx.globalCompositeOperation = "lighter";

    // Nodes that just received a signal.
    for (i = 0; i < nodes.length; i++) {
      n = nodes[i];
      if (n.flash <= 0) continue;
      ctx.fillStyle = rgba(color, 0.22 * n.flash);
      ctx.beginPath();
      ctx.arc(n.x, n.y, 3 + 7 * n.flash, 0, Math.PI * 2);
      ctx.fill();
    }

    // Pulses: tail + head + halo.
    for (i = 0; i < pulses.length; i++) {
      var p = pulses[i];
      var A = nodes[p.from], B = nodes[p.to];
      var x = A.x + (B.x - A.x) * p.t, y = A.y + (B.y - A.y) * p.t;
      var tt = Math.max(0, p.t - 0.22);
      var tx = A.x + (B.x - A.x) * tt, ty = A.y + (B.y - A.y) * tt;
      ctx.strokeStyle = rgba(color, 0.35);
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(x, y); ctx.stroke();
      ctx.fillStyle = rgba(color, 0.14);
      ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = rgba(color, 0.95);
      ctx.beginPath(); ctx.arc(x, y, 1.8, 0, Math.PI * 2); ctx.fill();
    }

    ctx.globalCompositeOperation = "source-over";
  }

  function loop(now) {
    raf = requestAnimationFrame(loop);
    var dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
    // Phones: render every other frame (~30fps) to save battery.
    if (small) {
      frameSkip = !frameSkip;
      if (frameSkip) return;
    }
    last = now;
    step(dt);
    draw();
  }

  function shouldRun() {
    return !mqReduce.matches && !saveData && !document.hidden && !manualPause && nodes.length > 0;
  }

  function start() {
    if (running || !shouldRun()) return;
    running = true;
    last = 0;
    raf = requestAnimationFrame(loop);
  }

  function stop() {
    if (!running) return;
    running = false;
    cancelAnimationFrame(raf);
  }

  function sync() {
    if (shouldRun()) start();
    else {
      stop();
      pulses = [];
      color = target.slice();
      draw();
    }
  }

  /* ---- events --------------------------------------------------------------- */
  var resizeTimer = 0;
  function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      var oldW = W, oldH = H;
      var r = canvas.getBoundingClientRect();
      // Ignore small height changes from mobile URL bars showing/hiding.
      if (Math.round(r.width) === oldW && Math.abs(Math.round(r.height) - oldH) < 120) return;
      size();
      build();
      if (!running) draw();
    }, 160);
  }

  window.addEventListener("resize", onResize, { passive: true });
  document.addEventListener("visibilitychange", sync);
  if (mqReduce.addEventListener) mqReduce.addEventListener("change", sync);
  else if (mqReduce.addListener) mqReduce.addListener(sync);

  if (finePointer) {
    window.addEventListener("pointermove", function (e) {
      pointer.x = e.clientX; pointer.y = e.clientY; pointer.on = true;
    }, { passive: true });
    document.addEventListener("mouseout", function (e) { if (!e.relatedTarget) pointer.on = false; });
    window.addEventListener("blur", function () { pointer.on = false; });
  }

  // Theme switches (data-theme on <html>) change --accent.
  if (window.MutationObserver) {
    new MutationObserver(refreshColors).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"]
    });
  }

  /* ---- API ------------------------------------------------------------------ */
  function burst(n) {
    if (!running) return;
    for (var k = 0; k < (n || 4); k++) spawn(false);
  }

  window.GUNR_NET = {
    setLayer: function (i) {
      i = Math.max(0, Math.min(LAYER_TINT.length - 1, i | 0));
      if (i === layer) return;
      layer = i;
      target = palette[LAYER_TINT[i]] || palette.accent;
      if (running) burst(3 + i);
      else { color = target.slice(); draw(); }
    },
    burst: burst,
    pause: function () { manualPause = true; sync(); },
    resume: function () { manualPause = false; sync(); },
    refreshColors: refreshColors
  };

  size();
  build();
  refreshColors();
  sync();
})();
