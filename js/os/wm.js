/* =============================================================================
 * GUNR//OS — wm.js  (tiling window manager / mobile bottom sheets)
 * -----------------------------------------------------------------------------
 * Hyprland-flavoured dwindle tiling inside #wm on desktop: 1 window = full,
 * 2 = main 60% / side 40%, 3+ = main left with sides stacked right (splits
 * vertically when the area is taller than wide). Layout changes animate with
 * GSAP Flip; new windows spring out of the element that launched them.
 * At <= 760px the terminal fills the screen and every other window becomes a
 * draggable bottom sheet (one visible at a time). Exposes GOS.wm.
 * ========================================================================== */
(function () {
  "use strict";

  var GOS = window.GOS;
  if (!GOS || GOS.wm) return;

  var doc = document;
  var FULL = !!(GOS.motion && GOS.motion.full);
  var MAX_SIDES = 2;

  var wins = {}, order = [], z = 20, seq = 0;
  var focusedId = null, sheetId = null, mode = null;
  var root = null, scrim = null, flipTl = null, flipReg = false, rafLayout = 0;

  /* ---- helpers ------------------------------------------------------------------ */
  function small() { return GOS.device && GOS.device.small ? GOS.device.small() : window.innerWidth <= 760; }
  function num(v, d) { var n = parseFloat(v); return isFinite(n) ? n : d; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function rectOf(o) {
    if (!o) return null;
    try {
      var r = o.getBoundingClientRect ? o.getBoundingClientRect() : o;
      if (r && r.width > 0 && r.height > 0) return r;
    } catch (e) { /* detached */ }
    return null;
  }
  function getFlip() {
    var F = window.Flip;
    if (!F || !window.gsap) return null;
    if (!flipReg) { try { window.gsap.registerPlugin(F); } catch (e) { /* already */ } flipReg = true; }
    return F;
  }
  function paletteOpen() { return !!(GOS.palette && GOS.palette.isOpen && GOS.palette.isOpen()); }

  var EASE = {
    "expo.out": "cubic-bezier(.16,1,.3,1)", "power2.out": "cubic-bezier(.33,1,.68,1)",
    "power2.in": "cubic-bezier(.32,0,.67,0)", "back.out": "cubic-bezier(.34,1.56,.64,1)"
  };
  function cssEase(e) { e = String(e || "expo.out"); return EASE[e] || EASE[e.replace(/\(.*\)$/, "")] || EASE["expo.out"]; }
  var TKEYS = ["x", "y", "scale", "scaleX", "scaleY"];
  function hasT(v) { for (var i = 0; i < TKEYS.length; i++) if (TKEYS[i] in v) return true; return false; }
  function tf(v) {
    var sx = v.scaleX != null ? v.scaleX : (v.scale != null ? v.scale : 1);
    var sy = v.scaleY != null ? v.scaleY : (v.scale != null ? v.scale : 1);
    return "translate(" + (v.x || 0) + "px," + (v.y || 0) + "px) scale(" + sx + "," + sy + ")";
  }
  // gsap when present, WAAPI otherwise. Durations in seconds.
  function tween(el, from, to, o) {
    o = o || {};
    if (!el) { if (o.onComplete) o.onComplete(); return null; }
    var dur = o.duration == null ? 0.5 : o.duration;
    if (window.gsap) {
      var v = {}, k;
      for (k in to) v[k] = to[k];
      v.duration = dur; v.delay = o.delay || 0; v.ease = o.ease || "expo.out"; v.overwrite = "auto";
      if (o.clear !== false) v.clearProps = "transform,opacity";
      if (o.onComplete) v.onComplete = o.onComplete;
      return window.gsap.fromTo(el, from, v);
    }
    if (el.animate) {
      var a = {}, b = {};
      if (hasT(from) || hasT(to)) { a.transform = tf(from); b.transform = tf(to); }
      if ("opacity" in from || "opacity" in to) {
        a.opacity = from.opacity == null ? 1 : from.opacity;
        b.opacity = to.opacity == null ? 1 : to.opacity;
      }
      if (from.transformOrigin) el.style.transformOrigin = from.transformOrigin;
      var an = el.animate([a, b], { duration: dur * 1000, delay: (o.delay || 0) * 1000, easing: cssEase(o.ease), fill: "both" });
      an.onfinish = function () { if (o.onComplete) o.onComplete(); if (o.clear !== false) an.cancel(); };
      return an;
    }
    if (o.onComplete) o.onComplete();
    return null;
  }
  function killAnims(el) {
    if (window.gsap) window.gsap.killTweensOf(el);
    else if (el.getAnimations) el.getAnimations().forEach(function (a) { a.cancel(); });
  }
  function setY(el, y) {
    if (window.gsap) window.gsap.set(el, { y: y });
    else el.style.transform = "translate3d(0," + y + "px,0)";
  }
  function pulse(el, frames, ms) {
    if (!FULL || !el || !el.animate) return;
    try { el.animate(frames, { duration: ms, easing: "cubic-bezier(.2,.9,.3,1)" }); } catch (e) { /* ignore */ }
  }

  /* ---- structural CSS (zero specificity; css/os.css styles the look) ------------ */
  var BASE_CSS = [
    ":where(.wm){position:relative}",
    ":where(.wm .win){position:absolute;display:flex;flex-direction:column;box-sizing:border-box;min-width:0;min-height:0}",
    ":where(.win[hidden]){display:none!important}",
    ":where(.win-bar){display:flex;align-items:center;flex:none;user-select:none;-webkit-user-select:none}",
    ":where(.win-title,.win-path){min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    ":where(.win-ctrls){display:flex;margin-left:auto}",
    ":where(.win-body){flex:1;min-height:0;overflow:auto}",
    ":where(.win--term .win-body){overflow:hidden}",
    ":where(.sheet-handle){display:none}",
    ":where(.wm .win.is-sheet){position:fixed;left:0;right:0;bottom:0;top:auto;width:auto;height:92vh;height:92dvh}",
    ":where(.win.is-sheet .sheet-handle){display:block;touch-action:none;cursor:grab}",
    ":where(.win.is-sheet .win-bar){touch-action:none}",
    ":where(.wm-scrim){position:fixed;inset:0;background:rgba(0,0,0,.45);opacity:0;pointer-events:none;transition:opacity .3s ease}",
    ":where(.wm-scrim.is-on){opacity:1;pointer-events:auto}"
  ].join("\n");
  function injectBase() {
    if (doc.getElementById("gos-wm-base")) return;
    var s = doc.createElement("style");
    s.id = "gos-wm-base";
    s.textContent = BASE_CSS;
    doc.head.insertBefore(s, doc.head.firstChild);
  }

  function rootEl() {
    if (root && root.isConnected) return root;
    root = doc.getElementById("wm");
    if (!root) {
      root = doc.createElement("main");
      root.id = "wm";
      root.className = "wm";
      root.setAttribute("aria-label", "Terminal desktop");
      (doc.getElementById("desktop") || doc.body).appendChild(root);
    }
    if (!root.__bound) {
      root.__bound = true;
      root.addEventListener("pointerdown", function (e) {
        var el = e.target.closest && e.target.closest(".win");
        if (el && root.contains(el)) focus(el.getAttribute("data-win"));
      }, true);
      root.addEventListener("focusin", function (e) {
        var el = e.target.closest && e.target.closest(".win");
        if (el) focus(el.getAttribute("data-win"));
      });
      if (window.ResizeObserver) new ResizeObserver(scheduleLayout).observe(root);
    }
    return root;
  }
  function scrimEl() {
    if (scrim && scrim.isConnected) return scrim;
    scrim = doc.createElement("div");
    scrim.className = "wm-scrim";
    scrim.setAttribute("aria-hidden", "true");
    scrim.addEventListener("click", function () { if (sheetId) close(sheetId); });
    rootEl().appendChild(scrim);
    return scrim;
  }
  function scrimSet(on) {
    var s = scrimEl();
    s.style.opacity = "";
    if (on) s.style.zIndex = String(++z);
    s.classList.toggle("is-on", !!on);
  }

  /* ---- window chrome ------------------------------------------------------------ */
  var ICON_MAX = '<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" focusable="false"><rect x="2.2" y="2.2" width="7.6" height="7.6" rx="1.8" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>';
  var ICON_CLOSE = '<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" focusable="false"><path d="M3 3l6 6M9 3L3 9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';

  function isMainKind(w) { return w.kind === "term"; }
  function isSheet(w) { return mode === "mobile" && !isMainKind(w); }

  function build(id, o, kind, size) {
    var el = doc.createElement("section");
    el.className = "win win--" + kind + " win--" + size;
    el.setAttribute("data-win", id);
    el.tabIndex = -1;
    el.setAttribute("role", "region");
    var tid = "win-title-" + String(id).replace(/[^A-Za-z0-9_-]/g, "-");
    el.setAttribute("aria-labelledby", tid);
    el.innerHTML =
      '<div class="sheet-handle" aria-hidden="true"><span class="sheet-grip"></span></div>' +
      '<header class="win-bar">' +
        '<span class="win-icon" aria-hidden="true"></span>' +
        '<span class="win-title" id="' + tid + '"></span>' +
        '<span class="win-path"></span>' +
        '<span class="win-ctrls">' +
          '<button type="button" class="win-ctrl win-ctrl--max" aria-label="Maximize window" aria-pressed="false" title="Maximize (Ctrl+Shift+F)">' + ICON_MAX + "</button>" +
          (o.closable !== false ? '<button type="button" class="win-ctrl win-ctrl--close" aria-label="Close window" title="Close (Esc)">' + ICON_CLOSE + "</button>" : "") +
        "</span>" +
      "</header>" +
      '<div class="win-body"></div>';
    return el;
  }
  function setIcon(el, icon) {
    var s = el.querySelector(".win-icon");
    icon = icon == null ? "" : String(icon);
    if (/^\s*</.test(icon)) s.innerHTML = icon; else s.textContent = icon;
  }
  function setBody(w, body) {
    w.body.innerHTML = "";
    if (body == null) return;
    if (body.nodeType) w.body.appendChild(body);
    else w.body.innerHTML = String(body);
  }

  /* ---- geometry --------------------------------------------------------------- */
  // Usable tiling area in #wm coordinates, minus anything the bar or dock overlap.
  function area() {
    var host = rootEl(), r = host.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    var cs = getComputedStyle(doc.documentElement), mob = mode === "mobile";
    var m = num(cs.getPropertyValue(mob ? "--wm-margin-sm" : "--wm-margin"), mob ? 8 : 12);
    var g = num(cs.getPropertyValue("--wm-gap"), 12);
    var top = 0, bottom = r.height;
    var bar = doc.getElementById("bar");
    if (bar) {
      var br = bar.getBoundingClientRect();
      if (br.height && br.bottom > r.top && br.top <= r.top + 4) top = Math.max(top, br.bottom - r.top);
    }
    var dock = doc.getElementById("dock");
    if (dock && getComputedStyle(dock).display !== "none") {
      var dr = dock.getBoundingClientRect();
      if (dr.height && dr.top < r.bottom && dr.top > r.top) bottom = Math.min(bottom, dr.top - r.top);
    }
    var w = r.width - 2 * m, hgt = bottom - top - 2 * m;
    if (w < 40 || hgt < 40) return null;
    return { x: m, y: top + m, w: w, h: hgt, g: g };
  }
  function rects(a, vis) {
    var R = {};
    var tiles = vis.filter(function (w) { return w.size !== "float"; });
    var floats = vis.filter(function (w) { return w.size === "float"; });
    var main = null, i;
    for (i = 0; i < tiles.length; i++) if (tiles[i].size === "main") { main = tiles[i]; break; }
    if (!main) main = tiles[0];
    var sides = tiles.filter(function (w) { return w !== main; });
    if (main) {
      if (!sides.length) R[main.id] = [a.x, a.y, a.w, a.h];
      else if (a.w / a.h >= 1.05) {
        var mw = Math.round((a.w - a.g) * 0.6), sx = a.x + mw + a.g, sw = a.w - mw - a.g;
        var sh = (a.h - a.g * (sides.length - 1)) / sides.length;
        R[main.id] = [a.x, a.y, mw, a.h];
        sides.forEach(function (w, k) { R[w.id] = [sx, Math.round(a.y + k * (sh + a.g)), sw, Math.round(sh)]; });
      } else {
        var mh = Math.round((a.h - a.g) * 0.58), sy = a.y + mh + a.g, shh = a.h - mh - a.g;
        var sww = (a.w - a.g * (sides.length - 1)) / sides.length;
        R[main.id] = [a.x, a.y, a.w, mh];
        sides.forEach(function (w, k) { R[w.id] = [Math.round(a.x + k * (sww + a.g)), sy, Math.round(sww), shh]; });
      }
    }
    floats.forEach(function (w, k) {
      var fw = Math.min(w.opts.width || 640, a.w), fh = Math.min(w.opts.height || Math.round(a.h * 0.8), a.h);
      var fx = a.x + (a.w - fw) / 2 + k * 26, fy = a.y + (a.h - fh) / 2 + k * 26;
      R[w.id] = [Math.round(clamp(fx, a.x, a.x + a.w - fw)), Math.round(clamp(fy, a.y, a.y + a.h - fh)), fw, fh];
    });
    vis.forEach(function (w) { if (w.max) R[w.id] = [a.x, a.y, a.w, a.h]; });
    return R;
  }
  function place(w, r) {
    if (!r) return;
    var s = w.el.style;
    s.left = r[0] + "px"; s.top = r[1] + "px"; s.width = r[2] + "px"; s.height = r[3] + "px";
    w.rect = r;
    w.placed = true;
  }
  function clearGeom(w) {
    var s = w.el.style;
    s.left = s.top = s.width = s.height = "";
    w.rect = null;
    w.placed = false;
  }
  function changed(w, r) {
    if (!r || !w.rect) return false;
    for (var i = 0; i < 4; i++) if (Math.abs(w.rect[i] - r[i]) > 0.5) return true;
    return false;
  }

  /* ---- mode switching (desktop tiles <-> mobile sheets) ---------------------- */
  function topApp() {
    var best = null;
    order.forEach(function (id) {
      var w = wins[id];
      if (w && !w.closing && !isMainKind(w) && (!best || (w.z || 0) > (best.z || 0))) best = w;
    });
    return best;
  }
  function updateMode() {
    var m = small() ? "mobile" : "desktop";
    if (m === mode) return;
    mode = m;
    rootEl().classList.toggle("is-mobile", m === "mobile");
    var keep = m === "mobile" ? topApp() : null;
    order.forEach(function (id) {
      var w = wins[id];
      if (!w) return;
      killAnims(w.el);
      w.el.style.transform = "";
      w.el.style.opacity = "";
      if (m === "mobile" && !isMainKind(w)) {
        w.el.classList.add("is-sheet");
        w.el.setAttribute("role", "dialog");
        w.el.setAttribute("aria-modal", "false");
        clearGeom(w);
        w.el.hidden = w !== keep;
      } else {
        w.el.classList.remove("is-sheet");
        w.el.setAttribute("role", "region");
        w.el.removeAttribute("aria-modal");
        w.el.hidden = false;
      }
    });
    sheetId = keep ? keep.id : null;
    scrimSet(!!keep);
    if (keep) { keep.z = ++z; keep.el.style.zIndex = String(keep.z); }
  }

  /* ---- layout -------------------------------------------------------------------- */
  function layout(animate) {
    rootEl();
    updateMode();
    var a = area();
    if (!a) return;
    var vis = order.map(function (id) { return wins[id]; }).filter(function (w) {
      return w && !w.closing && !w.el.hidden && !isSheet(w);
    });
    var R = rects(a, vis);
    var movers = vis.filter(function (w) { return !w.spawning && w.placed && changed(w, R[w.id]); });
    var els = movers.map(function (w) { return w.el; });
    var F = animate && FULL ? getFlip() : null;
    var state = F && els.length ? F.getState(els) : null;
    if (flipTl) {
      flipTl.kill();
      flipTl = null;
      // A killed Flip leaves its inline min/max size locks behind; clear them too.
      if (window.gsap) vis.forEach(function (w) { if (!w.spawning) window.gsap.set(w.el, { clearProps: "transform,minWidth,maxWidth,minHeight,maxHeight" }); });
    }
    var before = !state && animate && els.length ? els.map(function (el) { return el.getBoundingClientRect(); }) : null;
    vis.forEach(function (w) { place(w, R[w.id]); });
    if (state) {
      flipTl = F.from(state, { duration: 0.62, ease: "back.out(1.15)", simple: true, onComplete: function () { flipTl = null; } });
    } else if (before) {
      movers.forEach(function (w, i) {
        var b = before[i], r = w.el.getBoundingClientRect();
        if (!r.width || !r.height) return;
        if (FULL) {
          tween(w.el, { x: b.left - r.left, y: b.top - r.top, scaleX: b.width / r.width, scaleY: b.height / r.height, transformOrigin: "0 0" },
            { x: 0, y: 0, scaleX: 1, scaleY: 1 }, { duration: 0.5, ease: "expo.out" });
        } else tween(w.el, { opacity: 0.55 }, { opacity: 1 }, { duration: 0.22, ease: "power2.out" });
      });
    }
  }
  function scheduleLayout() {
    if (rafLayout) return;
    rafLayout = requestAnimationFrame(function () { rafLayout = 0; layout(false); });
  }

  /* ---- spawn / sheets / close --------------------------------------------------- */
  function spawn(w, origin) {
    var el = w.el, r = el.getBoundingClientRect(), o = rectOf(origin);
    w.spawning = true;
    el.classList.add("is-spawning");
    function done() { w.spawning = false; el.classList.remove("is-spawning"); }
    if (!FULL) { tween(el, { opacity: 0 }, { opacity: 1 }, { duration: 0.22, ease: "power2.out", onComplete: done }); return; }
    if (o && r.width && r.height) {
      tween(el,
        { x: o.left - r.left, y: o.top - r.top, scaleX: clamp(o.width / r.width, 0.05, 1), scaleY: clamp(o.height / r.height, 0.05, 1), opacity: 0, transformOrigin: "0 0" },
        { x: 0, y: 0, scaleX: 1, scaleY: 1, opacity: 1 },
        { duration: 0.75, ease: "back.out(1.3)", onComplete: done });
    } else {
      tween(el, { scale: 0.9, y: 24, opacity: 0, transformOrigin: "50% 60%" }, { scale: 1, y: 0, opacity: 1 }, { duration: 0.6, ease: "back.out(1.3)", onComplete: done });
    }
    tween(w.body, { opacity: 0, y: 10 }, { opacity: 1, y: 0 }, { duration: 0.5, delay: 0.16 });
  }
  function showSheet(w) {
    if (sheetId && sheetId !== w.id && wins[sheetId]) hideSheet(wins[sheetId], { quick: true });
    sheetId = w.id;
    w.el.hidden = false;
    w.el.classList.add("is-sheet");
    clearGeom(w);
    scrimSet(true);
    w.z = ++z;
    w.el.style.zIndex = String(w.z);
    var hgt = w.el.offsetHeight || Math.round(window.innerHeight * 0.92);
    if (FULL) {
      tween(w.el, { y: hgt }, { y: 0 }, { duration: 0.62, ease: "expo.out" });
      tween(w.body, { opacity: 0, y: 16 }, { opacity: 1, y: 0 }, { duration: 0.5, delay: 0.12 });
    } else tween(w.el, { opacity: 0 }, { opacity: 1 }, { duration: 0.2, ease: "power2.out" });
  }
  function hideSheet(w, o) {
    o = o || {};
    if (sheetId === w.id) { sheetId = null; scrimSet(false); }
    var from = w.dragY || 0, hgt = w.el.offsetHeight || window.innerHeight;
    w.dragY = 0;
    if (!window.gsap) w.el.style.transform = "";
    function done() { w.el.hidden = true; if (o.cb) o.cb(); }
    if (!FULL) { tween(w.el, { opacity: 1 }, { opacity: 0 }, { duration: 0.15, ease: "power2.out", onComplete: done }); return; }
    tween(w.el, { y: from }, { y: hgt }, { duration: o.quick ? 0.24 : 0.34, ease: "power2.in", onComplete: done });
  }
  function dismissSheets() {
    if (!sheetId || !wins[sheetId]) return false;
    var had = wins[sheetId].el.contains(doc.activeElement);
    hideSheet(wins[sheetId]);
    var main = mainWin();
    if (main) focus(main.id);
    // Don't strand keyboard / switch-access focus inside a now-hidden sheet.
    // term.focus is a no-op on touch (no surprise keyboard), so fall back to the window itself.
    if (had) {
      try { if (GOS.term && GOS.term.focus) GOS.term.focus(); } catch (e) { /* ignore */ }
      if (main && !main.el.contains(doc.activeElement)) { try { main.el.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
    }
    return true;
  }
  function mainWin() {
    for (var i = 0; i < order.length; i++) { var w = wins[order[i]]; if (w && isMainKind(w)) return w; }
    return null;
  }
  function topWin() {
    var best = null;
    order.forEach(function (id) {
      var w = wins[id];
      if (w && !w.closing && !w.el.hidden && (!best || (w.z || 0) > (best.z || 0))) best = w;
    });
    return best;
  }
  function nudge(w) {
    pulse(w.el, [
      { transform: "translateX(0)" }, { transform: "translateX(-6px)" }, { transform: "translateX(5px)" },
      { transform: "translateX(-3px)" }, { transform: "translateX(0)" }
    ], 380);
  }
  function bump(w) {
    w.el.classList.add("is-pinged");
    setTimeout(function () { w.el.classList.remove("is-pinged"); }, 700);
    pulse(w.el, [{ transform: "scale(1)" }, { transform: "scale(1.012)", offset: 0.35 }, { transform: "scale(1)" }], 420);
  }

  function close(id) {
    var w = wins[id];
    if (!w || w.closing) return false;
    if (w.opts.closable === false) { nudge(w); return false; }
    w.closing = true;
    w.el.classList.add("is-closing");
    var hadFocus = w.el.contains(doc.activeElement);
    function finish() {
      if (w.el.parentNode) w.el.parentNode.removeChild(w.el);
      delete wins[id];
      order = order.filter(function (x) { return x !== id; });
      try { if (typeof w.opts.onClose === "function") w.opts.onClose(w); } catch (e) { if (window.console) console.error("[wm] onClose", e); }
      GOS.emit("wm:close", { id: id });
    }
    if (focusedId === id) {
      focusedId = null;
      w.el.classList.remove("is-focused");
      var next = topWin() || mainWin();
      if (next && next !== w) focus(next.id);
    }
    if (hadFocus && GOS.term && GOS.term.focus) GOS.term.focus();
    if (isSheet(w) && !w.el.hidden) { hideSheet(w, { cb: finish }); return true; }
    if (w.el.hidden) { finish(); return true; }
    layout(true); // neighbours flow into the space while this one shrinks away
    if (FULL) tween(w.el, { opacity: 1, scale: 1, y: 0 }, { opacity: 0, scale: 0.94, y: 10 }, { duration: 0.24, ease: "power2.in", onComplete: finish });
    else tween(w.el, { opacity: 1 }, { opacity: 0 }, { duration: 0.16, ease: "power2.out", onComplete: finish });
    return true;
  }

  /* ---- focus / maximize ----------------------------------------------------------- */
  function focus(id, o) {
    var w = wins[id];
    if (!w || w.closing) return null;
    o = o || {};
    if (focusedId !== id) {
      var p = wins[focusedId];
      if (p) p.el.classList.remove("is-focused");
      focusedId = id;
      w.el.classList.add("is-focused");
      GOS.emit("wm:focus", { id: id, title: w.opts.title || "" });
    }
    if (isSheet(w)) {
      if (w.el.hidden || sheetId !== id) showSheet(w);
    } else if ((!w.z || w.z < z) && !(mode === "mobile" && isMainKind(w))) { // on phones the terminal stays the base layer
      w.z = ++z;
      w.el.style.zIndex = String(w.z);
    }
    if (o.dom && !w.el.contains(doc.activeElement)) {
      try { w.el.focus({ preventScroll: true }); } catch (e) { w.el.focus(); }
    }
    return w;
  }
  function setMax(w, on) {
    w.max = on;
    w.el.classList.toggle("is-max", on);
    var b = w.el.querySelector(".win-ctrl--max");
    if (b) {
      b.setAttribute("aria-pressed", String(on));
      b.setAttribute("aria-label", on ? "Restore window" : "Maximize window");
      b.title = on ? "Restore (Ctrl+Shift+F)" : "Maximize (Ctrl+Shift+F)";
    }
  }
  function maximize(id, on) {
    var w = wins[id];
    if (!w) return null;
    var next = on == null ? !w.max : !!on;
    if (next) order.forEach(function (x) { var o = wins[x]; if (o && o !== w && o.max) setMax(o, false); });
    setMax(w, next);
    focus(id);
    if (!isSheet(w)) layout(true);
    GOS.emit("wm:max", { id: id, max: next });
    return w;
  }

  /* ---- sheet drag-to-close ------------------------------------------------------- */
  function bindDrag(w) {
    var active = false, pid = null, cap = null, startY = 0, lastY = 0, lastT = 0, vel = 0, hgt = 0;
    function down(e) {
      if (!isSheet(w) || w.closing || (e.pointerType === "mouse" && e.button !== 0)) return;
      if (e.target.closest("button, a, input, textarea, select")) return;
      active = true;
      pid = e.pointerId;
      cap = e.currentTarget;
      startY = lastY = e.clientY;
      lastT = e.timeStamp;
      vel = 0;
      hgt = w.el.offsetHeight || window.innerHeight;
      try { cap.setPointerCapture(pid); } catch (x) { /* ignore */ }
      killAnims(w.el);
      w.el.classList.add("is-dragging");
    }
    function move(e) {
      if (!active || e.pointerId !== pid) return;
      var dy = e.clientY - startY, dt = Math.max(1, e.timeStamp - lastT);
      vel = 0.8 * ((e.clientY - lastY) / dt) + 0.2 * vel;
      lastY = e.clientY;
      lastT = e.timeStamp;
      var y = dy < 0 ? -Math.pow(-dy, 0.7) : dy; // rubber-band upwards
      w.dragY = y;
      setY(w.el, y);
      if (scrim) scrim.style.opacity = String(clamp(1 - y / hgt, 0, 1));
    }
    function up(e) {
      if (!active || e.pointerId !== pid) return;
      active = false;
      w.el.classList.remove("is-dragging");
      try { cap.releasePointerCapture(pid); } catch (x) { /* ignore */ }
      var y = w.dragY || 0;
      if (y > hgt * 0.22 || (vel > 0.55 && y > 12)) { close(w.id); return; }
      if (scrim) scrim.style.opacity = "";
      w.dragY = 0;
      if (!window.gsap) w.el.style.transform = "";
      if (Math.abs(y) > 0.5) tween(w.el, { y: y }, { y: 0 }, { duration: 0.5, ease: FULL ? "back.out(1.6)" : "power2.out" });
    }
    [w.el.querySelector(".sheet-handle"), w.el.querySelector(".win-bar")].forEach(function (t) {
      if (!t) return;
      t.addEventListener("pointerdown", down);
      t.addEventListener("pointermove", move);
      t.addEventListener("pointerup", up);
      t.addEventListener("pointercancel", up);
    });
  }

  /* ---- open ------------------------------------------------------------------------ */
  function open(opts) {
    opts = opts || {};
    injectBase();
    rootEl();
    updateMode();
    var id = String(opts.id || "win-" + (++seq));
    var w = wins[id];
    if (w && !w.closing) {
      if (opts.title != null) w.setTitle(opts.title);
      if (opts.label != null) w.setPath(opts.label);
      if (opts.icon != null) setIcon(w.el, opts.icon);
      if (opts.body != null) setBody(w, opts.body);
      if (opts.onClose) w.opts.onClose = opts.onClose;
      var wasHidden = w.el.hidden;
      focus(id, { dom: opts.focus !== false && !isMainKind(w) });
      if (!wasHidden || !isSheet(w)) bump(w);
      GOS.emit("wm:open", { id: id, kind: w.kind, existing: true });
      return w;
    }
    if (w && w.closing) { if (w.el.parentNode) w.el.parentNode.removeChild(w.el); delete wins[id]; order = order.filter(function (x) { return x !== id; }); }

    var kind = opts.kind === "term" ? "term" : "app";
    var size = opts.size === "main" || opts.size === "float" ? opts.size : "side";
    var o = {};
    for (var k in opts) o[k] = opts[k];
    var el = build(id, o, kind, size);
    var titleEl = el.querySelector(".win-title"), pathEl = el.querySelector(".win-path");
    w = {
      id: id, el: el, body: el.querySelector(".win-body"), opts: o, kind: kind, size: size, max: false, z: 0,
      setTitle: function (t) {
        o.title = t == null ? "" : String(t);
        titleEl.textContent = o.title;
        if (focusedId === id) GOS.emit("wm:title", { id: id, title: o.title });
        return w;
      },
      setPath: function (p) { pathEl.textContent = p == null ? "" : String(p); pathEl.hidden = !p; return w; },
      setIcon: function (i) { setIcon(el, i); return w; },
      close: function () { return close(id); },
      focus: function () { return focus(id, { dom: true }); },
      maximize: function (on) { return maximize(id, on); }
    };
    w.setTitle(opts.title || id);
    w.setPath(opts.label || "");
    setIcon(el, opts.icon || (kind === "term" ? "❯" : "◇"));
    setBody(w, opts.body);
    if (opts.label) el.setAttribute("aria-label", (opts.title || id) + " — " + opts.label);

    var maxBtn = el.querySelector(".win-ctrl--max"), closeBtn = el.querySelector(".win-ctrl--close");
    maxBtn.addEventListener("click", function () { maximize(id); });
    if (closeBtn) closeBtn.addEventListener("click", function () { close(id); });
    el.querySelector(".win-bar").addEventListener("dblclick", function (e) {
      if (mode !== "mobile" && !e.target.closest(".win-ctrl")) maximize(id);
    });
    bindDrag(w);

    wins[id] = w;
    order.push(id);
    if (isSheet(w)) {
      el.classList.add("is-sheet");
      el.setAttribute("role", "dialog");
      el.setAttribute("aria-modal", "false");
      el.hidden = true;
      rootEl().appendChild(el);
      focus(id, { dom: opts.focus !== false });
    } else {
      // Keep tiles readable: at most MAX_SIDES side windows; the least recently
      // focused one makes room for the newcomer.
      if (size === "side") {
        var sides = order.map(function (x) { return wins[x]; }).filter(function (s) {
          return s && s !== w && !s.closing && s.size === "side" && !isSheet(s) && !isMainKind(s);
        });
        sides.sort(function (a, b) { return (a.z || 0) - (b.z || 0); });
        while (sides.length >= MAX_SIDES) close(sides.shift().id);
      }
      rootEl().appendChild(el);
      layout(true);
      spawn(w, opts.origin);
      focus(id, { dom: opts.focus !== false && kind !== "term" });
    }
    GOS.emit("wm:open", { id: id, kind: kind });
    return w;
  }

  /* ---- global keys & resize ------------------------------------------------------- */
  doc.addEventListener("keydown", function (e) {
    if (e.defaultPrevented || paletteOpen()) return;
    var k = e.key || "";
    // Ctrl+Shift+W is reserved by browsers (closes the whole window), so close is Alt+Shift+W.
    var lk = k.toLowerCase();
    if (e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey && (lk === "w" || e.code === "KeyW")) {
      var cw = focusedId && wins[focusedId];
      if (cw && cw.opts.closable !== false) { e.preventDefault(); close(cw.id); }
      return;
    }
    if (e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey) {
      if (lk === "f" && focusedId) { e.preventDefault(); maximize(focusedId); }
      return;
    }
    if (k !== "Escape" || e.ctrlKey || e.altKey || e.metaKey) return;
    var w = wins[mode === "mobile" && sheetId ? sheetId : focusedId];
    if (!w || isMainKind(w)) return;
    // Esc inside a field that still has text belongs to the field (clear first, close next).
    var t = e.target;
    if (t && /^(INPUT|TEXTAREA)$/.test(t.tagName) && t.value) return;
    if (w.max && !isSheet(w)) { e.preventDefault(); maximize(w.id, false); }
    else if (w.opts.closable !== false) { e.preventDefault(); close(w.id); }
  });
  window.addEventListener("resize", scheduleLayout);
  window.addEventListener("orientationchange", scheduleLayout);

  GOS.wm = {
    open: open,
    get: function (id) { return wins[id] || null; },
    // Raises + marks focused; pass {dom:true} to also move keyboard focus into it.
    focus: function (id, o) { return focus(id, o); },
    close: close,
    list: function () { return order.map(function (id) { return wins[id]; }).filter(Boolean); },
    layout: function (animate) { layout(animate !== false); },
    maximize: maximize,
    focused: function () { return focusedId; },
    mode: function () { return mode || (small() ? "mobile" : "desktop"); },
    isSheet: function (id) { var w = wins[id]; return !!(w && isSheet(w)); },
    dismissSheets: dismissSheets,
    setPath: function (id, p) { var w = wins[id]; if (w) w.setPath(p); return w || null; }
  };
})();
