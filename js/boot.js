/* =============================================================================
 * GUNR.DEV — boot.js
 * Layer -1: GUNR//OS power-on self test, "press any key", then a CRT power-on
 * transition into the page.
 *
 * window.GUNR_BOOT = { done: boolean, skip() }
 * Fires `gunr:boot-opening` on document as the shutters start to part (the
 * page should begin its entrance then), and `gunr:boot-done` once the page is
 * interactive.
 * Skipped entirely (done === true synchronously) when <html> has .no-boot,
 * which the inline head script sets for repeat visits and reduced motion.
 * ========================================================================== */
(function () {
  "use strict";

  var doc = document;
  var root = doc.documentElement;
  var overlay = doc.getElementById("boot");
  var app = doc.getElementById("app");
  var api = { done: false, skip: function () {} };
  window.GUNR_BOOT = api;

  function markSeen() {
    try { sessionStorage.setItem("gunr.booted", "1"); } catch (e) { /* private mode */ }
  }

  function emit(name) {
    var ev;
    try { ev = new CustomEvent(name); }
    catch (e) { ev = doc.createEvent("Event"); ev.initEvent(name, false, false); }
    doc.dispatchEvent(ev);
  }

  function netResume() {
    if (window.GUNR_NET) { try { window.GUNR_NET.resume(); } catch (e) { /* noop */ } }
  }

  function finish() {
    if (api.done) return;
    api.done = true;
    markSeen();
    root.classList.add("is-booted");
    root.classList.add("no-boot");
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    if (app) { app.removeAttribute("inert"); app.removeAttribute("aria-hidden"); }
    netResume(); // idempotent; covers the early-return path
    emit("gunr:boot-done");
  }

  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!overlay || root.classList.contains("no-boot") || reduced) {
    finish();
    return;
  }

  /* ---- Boot is running ------------------------------------------------------ */
  var P = window.PROFILE || {};
  var U = window.GUNR_UTIL || { isSet: function (v) { return !!v; }, fullName: function () { return ""; } };
  var log = doc.getElementById("boot-log");
  var prompt = doc.getElementById("boot-prompt");
  var promptText = doc.getElementById("boot-prompt-text");
  var skipBtn = doc.getElementById("boot-skip");
  var timers = [];
  var leaving = false;

  if (app) { app.setAttribute("inert", ""); app.setAttribute("aria-hidden", "true"); }
  // The mesh is hidden behind the opaque overlay: hold it (static frame) so it
  // does not compete with the typing, then ignite it as the shutters open.
  if (window.GUNR_NET) { try { window.GUNR_NET.pause(); } catch (e) { /* noop */ } }

  var coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
  if (coarse && promptText) promptText.textContent = "TAP TO BEGIN FORWARD PASS";

  // Weights filename derived from PROFILE, e.g. jake_patterson.safetensors
  var weightsName = (U.fullName(P) || P.handle || "model").toLowerCase().replace(/[^a-z0-9]+/g, "_") + ".safetensors";
  var handle = U.isSet(P.handle) ? String(P.handle).toUpperCase() : "GUNR";

  // Optional emblem: only shown once it actually loads.
  var logoSrc = P.assets && P.assets.bootLogo;
  if (U.isSet(logoSrc)) {
    var img = new Image();
    img.alt = "";
    img.decoding = "async";
    img.className = "boot-logo-img";
    img.onload = function () { img.classList.add("is-loaded"); overlay.classList.add("has-logo"); };
    img.onerror = function () { if (img.parentNode) img.parentNode.removeChild(img); };
    img.src = logoSrc;
    var holder = overlay.querySelector(".boot-logo");
    if (holder) holder.appendChild(img);
  }

  /* Script: each step types a line. `count` animates a number inside it,
     `ok` appends a status tag. Total ≈ 2.5s. */
  var steps = [
    { text: handle + "//OS v4.2  ·  power-on self test", cls: "hi", pause: 140 },
    { text: "cpu0: tensor co-processor ......... ", ok: "OK", pause: 90 },
    { text: "memory check: ", count: 24576, unit: " MB VRAM ... ", ok: "OK", pause: 110 },
    { text: "mount /dev/brain .................. ", ok: "OK", pause: 90 },
    { text: "loading weights: " + weightsName + " ", bar: true, pause: 120 },
    { text: "tokenizer: bpe-50257 .............. ", ok: "OK", pause: 90 },
    { text: "tokenizing visitor ... <visitor> -> id 1337", cls: "accent", token: true, pause: 140 },
    { text: "forward pass armed.", cls: "hi", pause: 0 }
  ];

  function later(fn, ms) { timers.push(setTimeout(fn, ms)); }

  function line(cls) {
    var el = doc.createElement("span");
    el.className = "boot-line" + (cls ? " " + cls : "");
    log.appendChild(el);
    return el;
  }

  function typeInto(el, text, cps, done) {
    var i = 0;
    var start = performance.now();
    (function tick(now) {
      if (leaving) return;
      var n = Math.min(text.length, Math.floor(((now - start) / 1000) * cps) + 1);
      if (n !== i) { i = n; el.textContent = text.slice(0, i); }
      if (i < text.length) requestAnimationFrame(tick);
      else done();
    })(start);
  }

  function animateCount(el, prefix, to, suffix, ms, done) {
    var start = performance.now();
    (function tick(now) {
      if (leaving) return;
      var k = Math.min(1, (now - start) / ms);
      el.textContent = prefix + Math.round(to * k * (2 - k)) + suffix;
      if (k < 1) requestAnimationFrame(tick);
      else done();
    })(start);
  }

  function animateBar(el, prefix, ms, done) {
    var start = performance.now();
    var W = 16;
    (function tick(now) {
      if (leaving) return;
      var k = Math.min(1, (now - start) / ms);
      var f = Math.round(W * k);
      el.textContent = prefix + "[" + new Array(f + 1).join("#") + new Array(W - f + 1).join(".") + "] " + Math.round(k * 100) + "%";
      if (k < 1) requestAnimationFrame(tick);
      else done();
    })(start);
  }

  var TOKEN = "<visitor>";
  function escText(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

  /* Wrap the visitor token so it can later fly into the hero's token pill. */
  function markToken(el, text) {
    var at = text.indexOf(TOKEN);
    if (at < 0) return;
    el.innerHTML = escText(text.slice(0, at)) + '<span id="boot-token">' + escText(TOKEN) + "</span>" +
      escText(text.slice(at + TOKEN.length));
  }

  function addOk(el, word) {
    var tag = doc.createElement("span");
    tag.className = "boot-ok";
    tag.textContent = "[ " + word + " ]";
    el.appendChild(tag);
  }

  function run(idx) {
    if (leaving) return;
    if (idx >= steps.length) { ready(); return; }
    var s = steps[idx];
    var el = line(s.cls);
    var next = function () {
      if (s.token) markToken(el, s.text);
      if (s.ok) addOk(el, s.ok);
      log.appendChild(doc.createTextNode("\n"));
      later(function () { run(idx + 1); }, s.pause);
    };
    if (s.count) {
      typeInto(el, s.text, 420, function () {
        animateCount(el, s.text, s.count, s.unit || "", 380, next);
      });
    } else if (s.bar) {
      typeInto(el, s.text, 420, function () { animateBar(el, s.text, 360, next); });
    } else {
      typeInto(el, s.text, 360, next);
    }
  }

  function ready() {
    overlay.classList.add("is-ready");
    if (prompt) {
      prompt.setAttribute("tabindex", "0");
      try { prompt.focus({ preventScroll: true }); } catch (e) { prompt.focus(); }
    }
  }

  /* The boot's <visitor> token flies into the hero's token pill, so the visitor
     sees their own token enter the network. Skipped on fast exits. */
  function flyToken(from) {
    var hero = doc.getElementById("hero-token");
    if (!from || !hero || !doc.body.animate) return;
    var b = hero.getBoundingClientRect();
    if (!b.width) return;
    // The hero line is still mid-reveal (translated down); aim at its resting spot.
    var lift = 0;
    var host = hero.closest ? hero.closest("[data-reveal]") : null;
    if (host && window.DOMMatrixReadOnly) {
      try { lift = new DOMMatrixReadOnly(getComputedStyle(host).transform).m42 || 0; } catch (e) { lift = 0; }
    }
    var fly = doc.createElement("span");
    fly.className = "token-pill token-fly";
    fly.setAttribute("aria-hidden", "true");
    fly.textContent = TOKEN;
    // Start with the pill's text over the boot text (pill padding is ~10px x 2px).
    var x0 = from.left - 10, y0 = from.top - 2;
    fly.style.left = x0 + "px";
    fly.style.top = y0 + "px";
    doc.body.appendChild(fly);
    var dx = b.left - x0, dy = b.top - lift - y0;
    var anim = fly.animate([
      { transform: "translate(0, 0)" },
      { transform: "translate(" + dx + "px, " + dy + "px)" }
    ], { duration: 560, easing: "cubic-bezier(.2, .8, .2, 1)", fill: "forwards" });
    anim.onfinish = function () {
      if (fly.parentNode) fly.parentNode.removeChild(fly);
      hero.classList.add("is-landed");
    };
  }

  /* CRT exit: screen collapses to a line, then shutters open from the seam. */
  function leave(fast) {
    if (leaving || api.done) return;
    leaving = true;
    timers.forEach(clearTimeout);
    markSeen();
    // Measure the boot token before the screen collapses.
    var tokEl = fast ? null : doc.getElementById("boot-token");
    var tokRect = tokEl ? tokEl.getBoundingClientRect() : null;
    overlay.classList.add("is-leaving");
    if (fast) overlay.classList.add("is-fast");
    var t1 = fast ? 160 : 420;
    var t2 = fast ? 360 : 720;
    setTimeout(function () {
      overlay.classList.add("is-opening");
      // #app stays inert until finish(): a long press that began on the overlay
      // must not release as a click on the hero (Call, Save Contact...).
      root.classList.add("is-powering");
      emit("gunr:boot-opening");
      if (window.GUNR_NET) {
        try { window.GUNR_NET.resume(); window.GUNR_NET.burst(12); } catch (e) { /* noop */ }
      }
      try { flyToken(tokRect); } catch (e) { /* decorative only */ }
    }, t1);
    setTimeout(function () {
      root.classList.remove("is-powering");
      unbind();
      finish();
    }, t1 + t2);
  }
  api.skip = function () { leave(true); };

  var IGNORE = { Tab: 1, Shift: 1, Control: 1, Alt: 1, Meta: 1, CapsLock: 1 };
  function onKey(e) {
    if (IGNORE[e.key] || e.ctrlKey || e.metaKey || e.altKey) return;
    // Space/arrows would scroll the page underneath; swallow them.
    e.preventDefault();
    leave(e.key === "Escape" || !overlay.classList.contains("is-ready"));
  }
  function onPointer(e) {
    if (e.button && e.button !== 0) return;
    // The skip button handles itself via click.
    if (skipBtn && (e.target === skipBtn || skipBtn.contains(e.target))) return;
    leave(!overlay.classList.contains("is-ready"));
  }
  function onSkip(e) { e.preventDefault(); leave(true); }
  function onPrompt(e) { e.preventDefault(); leave(false); }

  function unbind() {
    window.removeEventListener("keydown", onKey, true);
    overlay.removeEventListener("pointerdown", onPointer);
    if (skipBtn) skipBtn.removeEventListener("click", onSkip);
    if (prompt) prompt.removeEventListener("click", onPrompt);
  }

  window.addEventListener("keydown", onKey, true);
  overlay.addEventListener("pointerdown", onPointer);
  if (skipBtn) skipBtn.addEventListener("click", onSkip);
  if (prompt) prompt.addEventListener("click", onPrompt);

  // Keyboard users land on "skip intro" first.
  try { skipBtn.focus({ preventScroll: true }); } catch (e) { /* noop */ }

  later(function () { run(0); }, 180);
})();
