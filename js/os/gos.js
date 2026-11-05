/* =============================================================================
 * GUNR//OS — gos.js (the "kernel")
 * -----------------------------------------------------------------------------
 * Tiny shared core loaded synchronously in <head>, before every other OS script.
 * It owns the global namespace, the event bus, the command registry, the motion
 * preference and a few helpers. Every other module attaches itself to GOS:
 *
 *   GOS.term      js/os/term.js      prompt, input, blocks, output builder, chips
 *   GOS.wm        js/os/wm.js        tiling window manager / mobile sheets
 *   GOS.palette   js/os/palette.js   Ctrl+K command palette
 *   GOS.gpt       js/os/assistant.js local "gunr-gpt" assistant over PROFILE
 *   GOS.desktop   js/os/desktop.js   boot/login, status bar, workspaces, themes
 *   (commands)    js/os/commands.js  registers every command via GOS.commands
 * ========================================================================== */
(function () {
  "use strict";

  var root = document.documentElement;

  /* ---- storage (private mode safe) --------------------------------------- */
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* blocked */ } },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) { /* blocked */ } },
    sget: function (k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    sset: function (k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* blocked */ } }
  };

  /* ---- motion: ?motion= wins, then the visitor's saved choice, then the OS - */
  var param = (/[?&]motion=(full|reduced)\b/.exec(location.search) || [])[1];
  var saved = store.get("gunr.motion");
  var osReduced = !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
  var full, source;
  if (param) { full = param === "full"; source = "url"; }
  else if (saved === "full" || saved === "reduced") { full = saved === "full"; source = "stored"; }
  else { full = !osReduced; source = "system"; }
  // scene.js (particle wallpaper) reads window.GUNR_MOTION.
  window.GUNR_MOTION = { full: full, source: source };
  root.classList.add("js", full ? "motion-full" : "motion-reduced");
  root.classList.remove("no-js");

  /* ---- theme restored before first paint --------------------------------- */
  var THEMES = ["gunr", "tokyo-night", "catppuccin", "gruvbox", "nord", "rose-pine", "matrix"];
  var theme = store.get("gos.theme");
  root.dataset.theme = THEMES.indexOf(theme) >= 0 ? theme : "gunr";

  /* ---- event bus ---------------------------------------------------------- */
  var handlers = {};
  function on(name, fn) { (handlers[name] = handlers[name] || []).push(fn); return function () { off(name, fn); }; }
  function off(name, fn) { var h = handlers[name]; if (h) handlers[name] = h.filter(function (f) { return f !== fn; }); }
  function emit(name, detail) {
    (handlers[name] || []).slice().forEach(function (fn) {
      try { fn(detail); } catch (e) { if (window.console) console.error("[GOS] " + name + " handler failed", e); }
    });
  }

  /* ---- command registry --------------------------------------------------- */
  // spec: { name, aliases?, summary, usage?, group?, hidden?, icon?, complete?(argv), run(ctx) }
  var cmds = {}, aliases = {};
  var commands = {
    register: function (spec) {
      if (!spec || !spec.name || typeof spec.run !== "function") throw new Error("bad command spec");
      cmds[spec.name] = spec;
      (spec.aliases || []).forEach(function (a) { aliases[a] = spec.name; });
      return spec;
    },
    get: function (name) {
      if (!name) return null;
      name = String(name).toLowerCase();
      return cmds[name] || cmds[aliases[name]] || null;
    },
    list: function (opts) {
      var all = Object.keys(cmds).map(function (k) { return cmds[k]; });
      return opts && opts.all ? all : all.filter(function (c) { return !c.hidden; });
    },
    names: function () { return Object.keys(cmds).concat(Object.keys(aliases)); }
  };

  /* ---- helpers ------------------------------------------------------------ */
  var ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  function esc(v) { return v == null ? "" : String(v).replace(/[&<>"']/g, function (c) { return ESC[c]; }); }
  function isSet(v) {
    if (window.GUNR_UTIL && GUNR_UTIL.isSet) return GUNR_UTIL.isSet(v);
    return v != null && String(v).trim() !== "" && String(v).indexOf("[[") === -1;
  }
  function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  // Levenshtein distance, used for "did you mean".
  function distance(a, b) {
    a = String(a); b = String(b);
    var m = a.length, n = b.length, d = [], i, j;
    for (i = 0; i <= m; i++) d[i] = [i];
    for (j = 0; j <= n; j++) d[0][j] = j;
    for (i = 1; i <= m; i++) for (j = 1; j <= n; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[m][n];
  }
  var mq = function (q) { return !!(window.matchMedia && matchMedia(q).matches); };

  window.GOS = {
    version: "3.0",
    on: on, off: off, emit: emit,
    commands: commands,
    store: store,
    themes: THEMES,
    motion: {
      full: full,
      source: source,
      // Persist a choice and reload into it (the motion system initialises once).
      set: function (wantFull) {
        store.set("gunr.motion", wantFull ? "full" : "reduced");
        store.sset("gos.booted", "1");
        var url = location.pathname + location.search.replace(/([?&])motion=(full|reduced)&?/, "$1").replace(/[?&]$/, "") + location.hash;
        root.classList.add("is-leaving");
        // Same URL (e.g. with a #hash) would only be a fragment navigation: reload instead.
        setTimeout(function () {
          if (url === location.pathname + location.search + location.hash) location.reload();
          else location.replace(url);
        }, full ? 250 : 0);
      }
    },
    device: {
      // Phones/tablets: no auto-focusing the input (it would pop the keyboard).
      touch: mq("(pointer: coarse)"),
      small: function () { return mq("(max-width: 760px)"); }
    },
    util: { esc: esc, isSet: isSet, slug: slug, sleep: sleep, distance: distance },
    profile: function () { return window.PROFILE || {}; }
  };
})();
