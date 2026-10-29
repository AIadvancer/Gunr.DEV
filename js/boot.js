/* =============================================================================
 * GUNR.DEV — boot.js
 * The loader: a 000 -> 100 counter while "loading weights", then the digits
 * collapse, a curtain wipes up and the particle field bursts outward.
 *
 * window.GUNR_BOOT = { done: boolean, skip() }
 * Fires on document:
 *   gunr:boot-opening  as the curtain starts to lift (start the hero entrance)
 *   gunr:boot-done     once the overlay is gone and the page is interactive
 * Skipped entirely (done === true synchronously) when <html> has .no-boot,
 * which the head script sets for repeat visits and reduced motion.
 * ========================================================================== */
(function () {
  "use strict";

  var doc = document;
  var root = doc.documentElement;
  var overlay = doc.getElementById("boot");
  var app = doc.getElementById("app");
  var api = { done: false, skip: function () {} };
  window.GUNR_BOOT = api;

  var motion = window.GUNR_MOTION ? !!window.GUNR_MOTION.full : true;

  function markSeen() {
    try { sessionStorage.setItem("gunr.booted", "1"); } catch (e) { /* private mode */ }
  }

  function emit(name) {
    var ev;
    try { ev = new CustomEvent(name); }
    catch (e) { ev = doc.createEvent("Event"); ev.initEvent(name, false, false); }
    doc.dispatchEvent(ev);
  }

  function scene(fn) {
    var S = window.GUNR_SCENE;
    if (S && S.ready) { try { fn(S); } catch (e) { /* decorative only */ } }
  }

  var opened = false;
  function open() {
    if (opened) return;
    opened = true;
    emit("gunr:boot-opening");
    scene(function (S) { S.resume && S.resume(); S.burst && S.burst(); });
  }

  function finish() {
    if (api.done) return;
    api.done = true;
    markSeen();
    root.classList.add("no-boot");
    root.classList.remove("is-booting");
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    if (app) { app.removeAttribute("inert"); app.removeAttribute("aria-hidden"); }
    open();
    emit("gunr:boot-done");
  }

  if (!overlay || root.classList.contains("no-boot") || !motion) {
    finish();
    return;
  }

  /* ---- Loader is running --------------------------------------------------- */
  var P = window.PROFILE || {};
  var U = window.GUNR_UTIL || { fullName: function () { return ""; } };
  var gsap = window.gsap;
  var digits = Array.prototype.slice.call(overlay.querySelectorAll(".boot-digit i"));
  var bar = doc.getElementById("boot-bar");
  var file = doc.getElementById("boot-file");
  var skipBtn = doc.getElementById("boot-skip");
  var leaving = false;
  var raf = 0;

  if (app) { app.setAttribute("inert", ""); app.setAttribute("aria-hidden", "true"); }

  if (file) {
    file.textContent = (U.fullName(P) || P.handle || "model").toLowerCase().replace(/[^a-z0-9]+/g, "_") + ".safetensors";
  }

  /* Progress is a function of time with a couple of believable hesitations.
     Up to 300ms already spent loading counts, so slow networks don't wait twice. */
  var DUR = 1900;
  var KEYS = [[0, 0], [0.22, 0.31], [0.4, 0.38], [0.62, 0.74], [0.78, 0.81], [1, 1]];
  function shape(k) {
    for (var i = 1; i < KEYS.length; i++) {
      if (k <= KEYS[i][0]) {
        var a = KEYS[i - 1], b = KEYS[i];
        var u = (k - a[0]) / (b[0] - a[0]);
        u = u * u * (3 - 2 * u);
        return a[1] + (b[1] - a[1]) * u;
      }
    }
    return 1;
  }

  // Hold at 99 until webfonts are in, so the hero never reflows mid-reveal (max +1.2s).
  var fontsIn = !(doc.fonts && doc.fonts.ready);
  if (!fontsIn) doc.fonts.ready.then(function () { fontsIn = true; }, function () { fontsIn = true; });
  var hardStop = 0;

  var t0 = performance.now() - Math.min(performance.now(), 300);
  var shown = -1;
  function paint(n) {
    if (n === shown) return;
    shown = n;
    var s = ("00" + n).slice(-3);
    for (var i = 0; i < digits.length; i++) digits[i].textContent = s.charAt(i);
    if (bar) bar.style.transform = "scaleX(" + (n / 100) + ")";
  }

  function tick(now) {
    if (leaving) return;
    var k = Math.min(1, (now - t0) / DUR);
    var n = Math.floor(shape(k) * 100);
    if (k >= 1) {
      if (!hardStop) hardStop = now + 1200;
      if (!fontsIn && now < hardStop) { paint(99); raf = requestAnimationFrame(tick); return; }
      paint(100);
      leave(false);
      return;
    }
    paint(Math.min(99, n));
    raf = requestAnimationFrame(tick);
  }

  function leave(fast) {
    if (leaving || api.done) return;
    leaving = true;
    cancelAnimationFrame(raf);
    unbind();
    markSeen();
    if (fast) paint(100);
    overlay.classList.add("is-leaving");

    if (gsap) {
      var tl = gsap.timeline({ onComplete: finish });
      tl.to(digits, { yPercent: -110, duration: fast ? 0.35 : 0.6, ease: "expo.in", stagger: 0.05 })
        .to(".boot-label, .boot-top", { autoAlpha: 0, y: -8, duration: 0.4, ease: "power3.in" }, 0)
        .to(bar, { scaleX: 0, transformOrigin: "100% 50%", duration: 0.5, ease: "power3.inOut" }, fast ? 0.05 : 0.2)
        .add(open, fast ? 0.3 : 0.55)
        .fromTo(overlay, { clipPath: "inset(0% 0% 0% 0%)" },
          { clipPath: "inset(0% 0% 100% 0%)", duration: fast ? 0.7 : 1.05, ease: "power3.inOut" }, fast ? 0.3 : 0.55);
    } else {
      // CSS fallback (see .boot.is-leaving / .is-lifting in style.css).
      setTimeout(function () { overlay.classList.add("is-lifting"); open(); }, fast ? 150 : 400);
      setTimeout(finish, fast ? 800 : 1300);
    }
  }
  api.skip = function () { leave(true); };

  var IGNORE = { Tab: 1, Shift: 1, Control: 1, Alt: 1, Meta: 1, CapsLock: 1 };
  function onKey(e) {
    if (IGNORE[e.key] || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "Enter" && e.target === skipBtn) return; // the button's own click handles it
    e.preventDefault(); // space/arrows would scroll the page underneath
    leave(true);
  }
  function onPointer(e) {
    if (e.button && e.button !== 0) return;
    leave(true);
  }
  function onSkip(e) { e.preventDefault(); leave(true); }

  function unbind() {
    window.removeEventListener("keydown", onKey, true);
    overlay.removeEventListener("pointerdown", onPointer);
    if (skipBtn) skipBtn.removeEventListener("click", onSkip);
  }

  window.addEventListener("keydown", onKey, true);
  overlay.addEventListener("pointerdown", onPointer);
  if (skipBtn) {
    skipBtn.addEventListener("click", onSkip);
    try { skipBtn.focus({ preventScroll: true }); } catch (e) { /* noop */ }
  }

  // The scene stays parked behind the opaque overlay until the curtain lifts.
  scene(function (S) { S.pause && S.pause(); });
  doc.addEventListener("gunr:scene-ready", function () {
    if (!opened) scene(function (S) { S.pause && S.pause(); });
  }, { once: true });

  raf = requestAnimationFrame(tick);
})();
