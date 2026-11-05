/* =============================================================================
 * GUNR//OS — desktop.js  (loaded last; boots the OS)
 * -----------------------------------------------------------------------------
 * Boot + login, status bar (workspaces, tray, clock, toggles), workspaces <->
 * particle wallpaper, View-Transition theme switching, WebAudio sfx, wallpaper
 * media, plain view, toasts and global shortcuts. Emits GOS "os:ready".
 *
 * GOS.desktop = {
 *   setWorkspace(i, {silent})   0..5, morphs the wallpaper, no command run
 *   toast(msg, {kind, ms})      kind 'info' | 'ok' | 'err'  -> { el, close() }
 *   setTheme(name, {origin})    origin: Element | DOMRect | {x, y} | Event
 *   sfx(name)                   'key' 'enter' 'pop' 'whoosh' 'error' 'toggle' 'success'
 *   setSfx(on)                  persists gos.sfx "on"/"off", syncs bar buttons, emits 'sfx'
 *   plain(on)                   on: true | false | undefined (toggle)
 *   saveContact(), share(), copy(text) -> Promise<boolean>
 *   workspaces, workspace (current index), ready (after os:ready)
 * }
 * Bus events emitted: 'os:ready', 'workspace' {index,key}, 'theme' {name},
 * 'plain' {on}, 'sfx' {on}.
 * ========================================================================== */
(function () {
  "use strict";

  var GOS = window.GOS;
  if (!GOS) return;

  var win = window, doc = document, root = doc.documentElement;
  var U = GOS.util, store = GOS.store, isSet = U.isSet, esc = U.esc;
  var FULL = !!GOS.motion.full;
  var THEMES = GOS.themes || ["gunr"];

  function $(s, c) { return (c || doc).querySelector(s); }
  function $$(s, c) { return Array.prototype.slice.call((c || doc).querySelectorAll(s)); }
  function mq(q) { return !!(win.matchMedia && win.matchMedia(q).matches); }
  function P() { return win.PROFILE || {}; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function warn(msg, e) { if (win.console) console.warn("[desktop] " + msg, e || ""); }
  function scene() { return win.GUNR_SCENE && win.GUNR_SCENE.ready ? win.GUNR_SCENE : null; }
  function flip() {
    var g = win.gsap, F = win.Flip;
    if (!g || !F) return null;
    if (!flip.ok) { try { g.registerPlugin(F); } catch (e) { /* already registered */ } flip.ok = true; }
    return F;
  }
  function fullName() {
    var n = P().name || {};
    return [n.first, n.last].filter(isSet).join(" ") || "Gunnar Patterson";
  }
  function el(tag, cls, html) {
    var e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  /* ---- icons (stroke, 24 grid) ------------------------------------------- */
  var ICON = {
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    soundOn: '<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>',
    soundOff: '<path d="M11 5 6 9H3v6h3l5 4z"/><path d="m22 9-6 6M16 9l6 6"/>',
    doc: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
    more: '<circle cx="5" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="19" cy="12" r="1.4" fill="currentColor"/>',
    save: '<path d="M12 3v12m0 0-4.5-4.5M12 15l4.5-4.5"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    flask: '<path d="M9 3h6M10 3v6L4.5 18.5A2 2 0 0 0 6.2 21.5h11.6a2 2 0 0 0 1.7-3L14 9V3"/><path d="M7 15h10"/>',
    spark: '<path d="M12 3l1.8 4.7 4.7 1.8-4.7 1.8L12 16l-1.8-4.7-4.7-1.8 4.7-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
    back: '<path d="M19 12H5m0 0 6-6m-6 6 6 6"/>',
    share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    card: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M6 16a3 3 0 0 1 6 0M14 10h4M14 13h3"/>'
  };
  function icon(name) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + (ICON[name] || "") + "</svg>";
  }

  /* ---- workspaces --------------------------------------------------------- */
  var WS = [
    { key: "~", label: "home", cmd: "welcome" },
    { key: "about", label: "about", cmd: "about" },
    { key: "research", label: "research", cmd: "research" },
    { key: "work", label: "work", cmd: "experience" },
    { key: "skills", label: "skills", cmd: "skills" },
    { key: "contact", label: "contact", cmd: "contact" }
  ];
  // Commands that move the wallpaper. Everything else (theme, ls, …) leaves it be.
  var CMD_WS = {
    welcome: 0, neofetch: 0, help: 0, man: 0,
    about: 1, research: 2, experience: 3, skills: 4,
    contact: 5, vcard: 5, email: 5, call: 5, qr: 5, socials: 5, share: 5
  };
  // App windows that "own" a workspace (closing one returns the label home).
  var WIN_WS = { welcome: 0, research: 2, skills: 4, contact: 5 };
  var wsIndex = 0;

  var API = { ready: false, workspaces: WS };
  Object.defineProperty(API, "workspace", { enumerable: true, get: function () { return wsIndex; } });
  GOS.desktop = API;

  /* =========================================================================
   * Toasts
   * ====================================================================== */
  function toast(msg, opts) {
    opts = opts || {};
    var box = $("#toasts");
    if (!box || msg == null) return null;
    var kind = opts.kind === "error" ? "err" : (opts.kind === "ok" || opts.kind === "err" ? opts.kind : "info");
    var ms = opts.ms || (String(msg).length > 80 ? 5600 : 3400);
    var t = el("div", "toast toast--" + kind);
    t.innerHTML = '<span class="toast-ico" aria-hidden="true">' + (kind === "ok" ? "✓" : kind === "err" ? "!" : "i") +
      '</span><span class="toast-msg"></span><span class="toast-bar" aria-hidden="true"></span>';
    var m = $(".toast-msg", t);
    if (opts.html) m.innerHTML = opts.html; else m.textContent = String(msg);
    t.style.setProperty("--ms", ms + "ms");
    box.appendChild(t);
    while (box.children.length > 4) box.removeChild(box.firstElementChild);

    var timer = setTimeout(close, ms);
    function close() {
      clearTimeout(timer);
      if (t.classList.contains("is-out")) return;
      t.classList.add("is-out");
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 360);
    }
    t.addEventListener("click", close);
    return { el: t, close: close };
  }

  /* =========================================================================
   * SFX — WebAudio, synthesised, off by default (gos.sfx)
   * ====================================================================== */
  var sfxOn = store.get("gos.sfx") === "on";
  var audio = { ctx: null, master: null, noise: null, lastKey: 0 };

  function actx() {
    if (!audio.ctx) {
      var AC = win.AudioContext || win.webkitAudioContext;
      if (!AC) return null;
      try {
        audio.ctx = new AC();
        audio.master = audio.ctx.createGain();
        audio.master.gain.value = 0.5;
        audio.master.connect(audio.ctx.destination);
      } catch (e) { audio.ctx = null; return null; }
    }
    if (audio.ctx.state === "suspended") { try { audio.ctx.resume(); } catch (e) { /* needs a gesture */ } }
    return audio.ctx;
  }
  function noiseBuf(c) {
    if (audio.noise) return audio.noise;
    var len = Math.floor(c.sampleRate * 0.6), b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return (audio.noise = b);
  }
  function envelope(g, t, peak, attack, decay) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }
  function tone(c, type, f0, f1, t, dur, peak) {
    var o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    envelope(g, t, peak, 0.004, dur);
    o.connect(g); g.connect(audio.master);
    o.start(t); o.stop(t + dur + 0.05);
  }
  function hiss(c, t, dur, peak, type, f0, f1, q, attack) {
    var s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = noiseBuf(c);
    f.type = type;
    f.frequency.setValueAtTime(f0, t);
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    f.Q.value = q || 1;
    envelope(g, t, peak, attack || Math.min(0.01, dur / 3), dur);
    s.connect(f); f.connect(g); g.connect(audio.master);
    s.start(t, Math.random() * 0.4); s.stop(t + dur + 0.05);
  }
  function sfx(name) {
    if (!sfxOn) return;
    var c = actx();
    if (!c) return;
    var t = c.currentTime + 0.005, j;
    try {
      switch (name) {
        case "key":
          if (t - audio.lastKey < 0.025) return;
          audio.lastKey = t;
          j = 1 + (Math.random() * 0.16 - 0.08);           // ±8% pitch
          hiss(c, t, 0.028, 0.07, "bandpass", 3200 * j, 0, 1.4);
          tone(c, "triangle", 1900 * j, 1500 * j, t, 0.018, 0.02);
          break;
        case "enter":                                       // soft thock
          tone(c, "sine", 190, 62, t, 0.14, 0.22);
          hiss(c, t, 0.045, 0.07, "lowpass", 1400, 500, 0.7);
          break;
        case "pop":
          tone(c, "sine", 420, 820, t, 0.09, 0.08);
          tone(c, "triangle", 840, 1240, t + 0.015, 0.06, 0.025);
          break;
        case "whoosh":
          hiss(c, t, 0.34, 0.05, "bandpass", 280, 2600, 0.9, 0.12);
          break;
        case "error":
          tone(c, "triangle", 165, 150, t, 0.07, 0.09);
          tone(c, "triangle", 150, 118, t + 0.09, 0.1, 0.09);
          break;
        case "toggle":
          tone(c, "sine", 1250, 1100, t, 0.035, 0.05);
          break;
        case "success":
          tone(c, "sine", 660, 660, t, 0.12, 0.055);
          tone(c, "sine", 990, 990, t + 0.07, 0.18, 0.055);
          break;
      }
    } catch (e) { /* audio is decoration; never throw */ }
  }
  function setSfx(on) {
    sfxOn = !!on;
    store.set("gos.sfx", sfxOn ? "on" : "off");
    if (sfxOn) { actx(); sfx("toggle"); }
    $$(".sfx-btn").forEach(function (b) {
      b.setAttribute("aria-pressed", String(sfxOn));
      var v = $(".bm-val", b);
      if (v) v.textContent = sfxOn ? "on" : "off";
    });
    GOS.emit("sfx", { on: sfxOn });
    return sfxOn;
  }

  /* =========================================================================
   * Themes — View Transition circular reveal from the origin point
   * ====================================================================== */
  function pointOf(o) {
    var r;
    if (o && typeof o.getBoundingClientRect === "function") r = o.getBoundingClientRect();
    else if (o && o.width != null && o.left != null) r = o;
    if (r) return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    if (o && typeof o.clientX === "number") return { x: o.clientX, y: o.clientY };
    if (o && typeof o.x === "number" && typeof o.y === "number") return { x: o.x, y: o.y };
    return { x: win.innerWidth / 2, y: win.innerHeight / 3 };
  }
  function syncTheme() {
    var name = root.dataset.theme || "gunr";
    var bg = "";
    try { bg = getComputedStyle(root).getPropertyValue("--bg").trim(); } catch (e) { /* ignore */ }
    var meta = $('meta[name="theme-color"]');
    if (meta && bg) meta.setAttribute("content", bg);
    $$(".theme-btn").forEach(function (b) {
      b.setAttribute("aria-label", "Theme: " + name + ". Switch to the next theme");
      b.title = "Theme: " + name;
      var v = $(".bm-theme-name", b);
      if (v) v.textContent = name;
    });
  }
  var pendingTheme = null;
  function setTheme(name, opts) {
    opts = opts || {};
    name = String(name || "").toLowerCase();
    if (THEMES.indexOf(name) < 0) return false;
    // A view transition applies the theme a frame or two later: compare against
    // the theme that is already on its way, not only the one on <html>.
    if (name === (pendingTheme || root.dataset.theme)) return true;
    pendingTheme = name;

    function apply() {
      if (pendingTheme === name) pendingTheme = null;
      root.dataset.theme = name;
      store.set("gos.theme", name);
      syncTheme();
      GOS.emit("theme", { name: name });
    }
    function xfade() {
      root.classList.add("theme-xfade");
      apply();
      setTimeout(function () { root.classList.remove("theme-xfade"); }, 520);
    }

    if (doc.startViewTransition && !doc.hidden) {
      var pt = pointOf(opts.origin);
      if (FULL) root.classList.add("vt-reveal");
      try {
        var vt = doc.startViewTransition(apply);
        var done = function () { root.classList.remove("vt-reveal"); };
        // A rapid second switch skips this transition; its promises then reject.
        vt.ready.catch(function () { /* skipped */ });
        if (vt.updateCallbackDone) vt.updateCallbackDone.catch(function () { /* skipped */ });
        if (FULL) {
          vt.ready.then(function () {
            var r = Math.hypot(Math.max(pt.x, win.innerWidth - pt.x), Math.max(pt.y, win.innerHeight - pt.y));
            var at = " at " + pt.x + "px " + pt.y + "px)";
            root.animate({ clipPath: ["circle(0px" + at, "circle(" + r + "px" + at] },
              { duration: 760, easing: "cubic-bezier(.16,1,.3,1)", pseudoElement: "::view-transition-new(root)" });
          }).catch(done);
        }
        vt.finished.then(done, done);
      } catch (e) { root.classList.remove("vt-reveal"); xfade(); }
    } else xfade();
    sfx("whoosh");
    return true;
  }
  function cycleTheme(origin) {
    var i = THEMES.indexOf(root.dataset.theme);
    var next = THEMES[(i + 1) % THEMES.length];
    setTheme(next, { origin: origin });
    toast("Theme · " + next, { ms: 1800 });
  }

  /* =========================================================================
   * Status bar
   * ====================================================================== */
  var bar, menu, menuBtn;
  var isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || "");

  function motionSwitch(cls, label) {
    return '<button type="button" class="motion-switch ' + (cls || "") + '" role="switch" aria-checked="' + FULL +
      '" data-act="motion" title="Animations (reloads the page)">' + label +
      '<span class="sw-track" aria-hidden="true"><span class="sw-thumb"></span></span></button>';
  }

  function buildBar() {
    bar = $("#bar");
    if (!bar) return;
    var ws = WS.map(function (w, i) {
      return '<button type="button" class="ws-btn" data-act="ws" data-ws="' + i + '" title="' + esc(w.label) +
        " (" + (isMac ? "⌥" : "Alt+") + (i + 1) + ')" aria-label="Workspace ' + (i + 1) + ": " + esc(w.label) + '">' +
        '<span class="ws-num" aria-hidden="true">' + (i + 1) + '</span><span class="ws-label" aria-hidden="true">' + esc(w.key) + "</span></button>";
    }).join("");
    var wsMenu = WS.map(function (w, i) {
      return '<button type="button" class="bm-ws" data-act="ws" data-ws="' + i + '">' + esc(w.label) +
        "<small>" + (i + 1) + " · " + esc(w.key === "~" ? "~" : "~/" + w.key) + "</small></button>";
    }).join("");
    var palKey = isMac ? "⌘K" : "Ctrl K";

    bar.innerHTML =
      '<div class="bar-l">' +
        '<button type="button" class="bar-pill bar-logo" data-act="logo" style="--i:0" aria-label="GUNR//OS: show system info (neofetch)">' +
          '<span class="bar-logo-mark" aria-hidden="true"></span><span class="bar-logo-text" aria-hidden="true">GUNR<i>//</i>OS</span></button>' +
        '<nav class="bar-pill ws" style="--i:1" aria-label="Workspaces">' + ws + "</nav>" +
        '<span class="bar-pill bar-ws-now" style="--i:1" aria-hidden="true"></span>' +
      "</div>" +
      '<div class="bar-c"><div class="bar-pill bar-title" style="--i:2" aria-hidden="true"><span class="bar-title-dot"></span>' +
        '<span class="bar-title-stack"><span class="bar-title-text"><b>gsh</b></span></span></div></div>' +
      '<div class="bar-r">' +
        '<div class="bar-pill tray tray--metrics" style="--i:3" aria-hidden="true" title="Simulated system load">' +
          '<span class="tray-cpu"><span class="tray-k">cpu</span>' +
            '<svg class="spark" viewBox="0 0 54 18"><defs><linearGradient id="spark-grad" x1="0" y1="0" x2="0" y2="1">' +
            '<stop offset="0" stop-color="currentColor" stop-opacity=".35"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/>' +
            '</linearGradient></defs><path class="spark-area" d=""/><path class="spark-line" d=""/><circle class="spark-dot" r="1.8" cx="54" cy="9"/></svg>' +
            '<span class="tray-v tray-cpu-v">0%</span></span>' +
          '<span class="tray-sep"></span>' +
          '<span class="tray-gpu"><span class="tray-k">gpu</span><span class="meter"><i></i></span><span class="tray-v">24G</span></span>' +
        "</div>" +
        '<div class="bar-pill tray tray--ctrl" style="--i:4">' +
          '<button type="button" class="tray-btn theme-btn" data-act="theme"><span class="theme-dot" aria-hidden="true"></span></button>' +
          motionSwitch("", '<span class="sw-label" aria-hidden="true">motion</span><span class="sr-only">Motion</span>') +
          '<button type="button" class="tray-btn sfx-btn" data-act="sfx" aria-pressed="' + sfxOn + '" aria-label="Sound effects" title="Sound effects">' +
            '<span class="ico-on">' + icon("soundOn") + '</span><span class="ico-off">' + icon("soundOff") + "</span></button>" +
          '<button type="button" class="tray-btn plain-btn" data-act="plain" aria-label="Plain view (simple page)" title="Plain view">' + icon("doc") + "</button>" +
        "</div>" +
        '<button type="button" class="bar-pill pal-btn" data-act="palette" style="--i:5" aria-label="Search commands (' + palKey + ')">' +
          icon("search") + '<span class="pal-btn-text">commands</span><kbd aria-hidden="true">' + palKey + "</kbd></button>" +
        '<div class="bar-pill clock" style="--i:6"><span class="clock-day"></span><time class="clock-t"></time></div>' +
        '<button type="button" class="bar-pill bar-more" data-act="more" style="--i:7" aria-expanded="false" aria-controls="bar-menu" aria-label="Menu">' + icon("more") + "</button>" +
      "</div>" +
      '<div id="bar-menu" class="bar-menu" hidden>' +
        '<p class="bar-menu-h">Go to</p><div class="bar-menu-ws">' + wsMenu + "</div>" +
        '<p class="bar-menu-h">Settings</p>' +
        '<button type="button" class="bm-row theme-btn" data-act="theme">Theme<span class="bm-val"><span class="theme-dot" aria-hidden="true"></span><span class="bm-theme-name"></span></span></button>' +
        motionSwitch("bm-row", "Motion") +
        '<button type="button" class="bm-row sfx-btn" data-act="sfx" aria-pressed="' + sfxOn + '">Sound effects<span class="bm-val">' + (sfxOn ? "on" : "off") + "</span></button>" +
        '<button type="button" class="bm-row plain-btn" data-act="plain">Plain view<span class="bm-val">simple page →</span></button>' +
      "</div>";

    menu = $("#bar-menu", bar);
    menuBtn = $(".bar-more", bar);

    // the shared active-workspace indicator lives inside the active button
    var first = $(".ws-btn", bar);
    if (first) first.insertBefore(el("span", "ws-ind"), first.firstChild);
    markWorkspace(0);

    bar.addEventListener("click", onBarClick);
    syncTheme();
  }

  function onBarClick(e) {
    var t = e.target.closest ? e.target.closest("[data-act]") : null;
    if (!t || !bar.contains(t)) return;
    var act = t.getAttribute("data-act");
    if (act !== "more" && menu && !menu.hidden && act !== "theme" && act !== "sfx") toggleMenu(false);
    switch (act) {
      case "logo": run("neofetch", t); break;
      case "ws": goWorkspace(+t.getAttribute("data-ws"), t); break;
      case "theme": cycleTheme(t); break;
      case "motion": sfx("toggle"); GOS.motion.set(!FULL); break;
      case "sfx": setSfx(!sfxOn); break;
      case "plain": plain(true); break;
      case "palette": openPalette(t); break;
      case "more": toggleMenu(); break;
    }
  }

  function toggleMenu(force) {
    if (!menu) return;
    var open = force === undefined ? menu.hidden : !!force;
    menu.hidden = !open;
    menuBtn.setAttribute("aria-expanded", String(open));
    if (open) {
      var f = $(".bm-ws.is-active", menu) || $("button", menu);
      if (f) f.focus();
      sfx("pop");
    }
  }
  doc.addEventListener("pointerdown", function (e) {
    if (menu && !menu.hidden && !menu.contains(e.target) && !(menuBtn && menuBtn.contains(e.target))) toggleMenu(false);
  });

  function openPalette(origin) {
    var Pal = GOS.palette;
    if (Pal && typeof Pal.open === "function") {
      try { Pal.open({ origin: origin }); return; } catch (e) { warn("palette failed", e); }
    }
    run("help", origin);
  }

  /* ---- workspaces --------------------------------------------------------- */
  function markWorkspace(i) {
    if (!bar) return;
    $$(".ws-btn", bar).forEach(function (b, k) {
      b.classList.toggle("is-active", k === i);
      if (k === i) b.setAttribute("aria-current", "true"); else b.removeAttribute("aria-current");
    });
    $$(".bm-ws", bar).forEach(function (b, k) { b.classList.toggle("is-active", k === i); });
    var now = $(".bar-ws-now", bar);
    if (now) now.innerHTML = "<b>~</b>" + (i ? "/" + esc(WS[i].key) : "");
  }

  function setWorkspace(i, opts) {
    opts = opts || {};
    i = clamp(Math.round(+i || 0), 0, WS.length - 1);
    if (i === wsIndex && !opts.force) return wsIndex;
    var dir = i > wsIndex ? 1 : -1;
    wsIndex = i;
    // Hyprland-style: the window layer slides in from the direction of travel
    // (crossfade only in reduced motion). Desktop only: a transform on #wm would
    // re-anchor the position:fixed sheets used on phones.
    var layer = doc.getElementById("wm");
    if (layer && layer.animate && !opts.silent && !doc.hidden && !GOS.device.small()) {
      try {
        layer.animate(FULL
          ? [{ transform: "translateX(" + dir * 40 + "px)", opacity: 0.25 }, { transform: "none", opacity: 1 }]
          : [{ opacity: 0.55 }, { opacity: 1 }],
          { duration: FULL ? 380 : 200, easing: FULL ? "cubic-bezier(.34,1.3,.64,1)" : "ease-out" });
      } catch (e) { /* cosmetic */ }
    }

    var btns = bar ? $$(".ws-btn", bar) : [];
    var ind = bar ? $(".ws-ind", bar) : null;
    var F = FULL && !doc.hidden ? flip() : null;
    var state = null;
    if (F && btns.length) { try { state = F.getState(btns.concat(ind ? [ind] : [])); } catch (e) { state = null; } }
    markWorkspace(i);
    if (ind && btns[i]) btns[i].insertBefore(ind, btns[i].firstChild);
    if (state) {
      try { F.from(state, { duration: 0.62, ease: "back.out(1.3)", nested: true }); } catch (e) { /* layout is already final */ }
    }

    var S = scene();
    if (S && S.setSection) { try { S.setSection(i, 0); } catch (e) { /* wallpaper is optional */ } }
    if (!opts.silent) sfx("whoosh");
    GOS.emit("workspace", { index: i, key: WS[i].key });
    return i;
  }
  function goWorkspace(i, origin) {
    if (!WS[i]) return;
    setWorkspace(i);
    run(WS[i].cmd, origin);
  }
  doc.addEventListener("gunr:scene-ready", function () {
    var S = scene();
    if (S && S.setSection) { try { S.setSection(wsIndex, 0); } catch (e) { /* ignore */ } }
  });

  /* ---- centre: focused window title -------------------------------------- */
  var lastTitle = "";
  function titleOf(id) {
    var W = GOS.wm, w = W && W.get ? W.get(id) : null;
    if (!w) return "";
    var t = w.el && $(".win-title", w.el);
    var p = w.el && $(".win-path", w.el);
    return (t ? t.textContent : w.title || id) + (p && p.textContent ? " " + p.textContent : "");
  }
  function setBarTitle(text) {
    var stack = bar && $(".bar-title-stack", bar);
    if (!stack || !text || text === lastTitle) return;
    lastTitle = text;
    var parts = text.split(" ");
    var next = el("span", "bar-title-text is-pre",
      "<b>" + esc(parts[0]) + "</b>" + (parts[1] ? " <span class=\"faint\">" + esc(parts[1]) + "</span>" : ""));
    $$(".bar-title-text", stack).forEach(function (old) {
      old.classList.add("is-out");
      setTimeout(function () { if (old.parentNode) old.parentNode.removeChild(old); }, 420);
    });
    stack.appendChild(next);
    void next.offsetWidth;
    next.classList.remove("is-pre");
  }

  /* ---- tray: fake-but-alive CPU sparkline + GPU meter --------------------- */
  var load = { cpu: [], target: 0.22, gpu: 0.38, spike: 0 };
  function tickTray() {
    if (doc.hidden || root.classList.contains("plain") || !bar) return;
    load.spike *= 0.72;
    var base = 0.16 + Math.sin(Date.now() / 4200) * 0.06 + Math.random() * 0.12;
    var v = clamp(base + load.spike, 0.04, 0.98);
    load.cpu.push(v);
    while (load.cpu.length < 24) load.cpu.unshift(v);
    if (load.cpu.length > 24) load.cpu.shift();

    var w = 54, hgt = 18, n = load.cpu.length, step = w / (n - 1), d = "", x, y, px = 0, py = 0;
    for (var k = 0; k < n; k++) {
      x = k * step; y = hgt - 1.5 - load.cpu[k] * (hgt - 3);
      if (!k) d = "M0 " + y.toFixed(2);
      else d += " Q" + px.toFixed(2) + " " + py.toFixed(2) + " " + ((px + x) / 2).toFixed(2) + " " + ((py + y) / 2).toFixed(2);
      px = x; py = y;
    }
    d += " T" + x.toFixed(2) + " " + y.toFixed(2);
    var line = $(".spark-line", bar), area = $(".spark-area", bar), dot = $(".spark-dot", bar), val = $(".tray-cpu-v", bar);
    if (line) line.setAttribute("d", d);
    if (area) area.setAttribute("d", d + " L" + w + " " + hgt + " L0 " + hgt + " Z");
    if (dot) { dot.setAttribute("cx", x.toFixed(2)); dot.setAttribute("cy", y.toFixed(2)); }
    if (val) val.textContent = Math.round(v * 100) + "%";

    load.gpu += ((0.34 + load.spike * 0.9 + Math.random() * 0.06) - load.gpu) * 0.35;
    var meter = $(".meter > i", bar);
    if (meter) meter.style.setProperty("--v", clamp(load.gpu, 0.05, 1).toFixed(3));
    var metrics = $(".tray--metrics", bar);
    if (metrics) metrics.title = "Simulated load · GPU " + Math.round(load.gpu * 24.576 * 10) / 10 + " / 24.6 GB";
  }

  /* ---- clock -------------------------------------------------------------- */
  var H12 = (function () {
    try { return /am|pm/i.test(new Date(2020, 0, 1, 13).toLocaleTimeString()); } catch (e) { return false; }
  })();
  function clockParts(d) {
    var hr = d.getHours(), mm = ("0" + d.getMinutes()).slice(-2), suffix = "";
    if (H12) { suffix = hr >= 12 ? "PM" : "AM"; hr = hr % 12 || 12; }
    else hr = ("0" + hr).slice(-2);
    return { h: String(hr), m: mm, suffix: suffix };
  }
  function tickClock() {
    var d = new Date(), c = clockParts(d);
    var t = bar && $(".clock-t", bar), day = bar && $(".clock-day", bar);
    if (t) {
      t.innerHTML = c.h + '<span class="clock-colon">:</span>' + c.m + (c.suffix ? " " + c.suffix : "");
      t.setAttribute("datetime", d.toISOString());
    }
    if (day) { try { day.textContent = d.toLocaleDateString(undefined, { weekday: "short" }); } catch (e) { /* ignore */ } }
    var big = $(".login-clock");
    if (big) big.textContent = c.h + ":" + c.m;
  }
  function startClock() {
    tickClock();
    setTimeout(function () { tickClock(); setInterval(tickClock, 60000); }, (60 - new Date().getSeconds()) * 1000 + 50);
  }

  /* =========================================================================
   * Commands bridge
   * ====================================================================== */
  function run(cmd, origin, source) {
    var T = GOS.term;
    if (T && typeof T.run === "function") {
      try { return Promise.resolve(T.run(cmd, { source: source || "chip", origin: origin || null })); }
      catch (e) { warn("term.run failed", e); }
    }
    // Degraded mode (no terminal): the essentials still work.
    if (cmd === "vcard") saveContact();
    else if (cmd === "plain" || cmd === "contact" || cmd === "about") plain(true);
    return Promise.resolve();
  }

  /* =========================================================================
   * Contact helpers (plain view, guide, degraded mode)
   * ====================================================================== */
  function saveContact() {
    var V = win.GUNR_VCARD;
    if (!V || typeof V.download !== "function") {
      toast("Couldn't build the contact file here. Email works too.", { kind: "err" });
      return false;
    }
    try {
      V.download(P());
      toast("Contact saved. Open the .vcf to add it to your phone.", { kind: "ok" });
      sfx("success");
      return true;
    } catch (e) {
      warn("vCard failed", e);
      toast("Saving the contact failed. Try the email button instead.", { kind: "err" });
      return false;
    }
  }
  function copy(text) {
    text = String(text);
    if (navigator.clipboard && navigator.clipboard.writeText && win.isSecureContext !== false) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return legacyCopy(text); });
    }
    return Promise.resolve(legacyCopy(text));
  }
  function legacyCopy(text) {
    var ta = el("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;top:-1000px;opacity:0";
    doc.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = doc.execCommand("copy"); } catch (e) { ok = false; }
    doc.body.removeChild(ta);
    return ok;
  }
  function share() {
    var p = P(), url = isSet(p.siteUrl) ? p.siteUrl : location.origin;
    var data = { title: fullName() + " · GUNR", text: [fullName(), p.title, p.company].filter(isSet).join(" · "), url: url };
    if (navigator.share) return navigator.share(data).then(function () { return true; }, function () { return false; });
    return copy(url).then(function (ok) {
      toast(ok ? "Link copied: " + url : "Copy this link: " + url, { kind: ok ? "ok" : "info" });
      return ok;
    });
  }

  /* =========================================================================
   * Plain view
   * ====================================================================== */
  function dates(x) {
    var s = isSet(x.start) ? String(x.start) : "", e = isSet(x.end) ? String(x.end) : "";
    if (e.toLowerCase() === "present") e = "Present";
    return s && e ? s + " – " + e : s || e;
  }
  function sortedExperience(list) {
    return (list || []).map(function (x, i) { return { x: x, i: i }; }).sort(function (a, b) {
      function key(o) {
        if (String(o.x.end).toLowerCase() === "present") return 1e9;
        var n = parseInt(o.x.end, 10);
        return isNaN(n) ? -1 : n;
      }
      return key(b) - key(a) || b.i - a.i;
    }).map(function (o) { return o.x; });
  }
  function renderPlain() {
    var sec = $("#plain"), p = P();
    if (!sec || !p.name) return;      // keep the static copy if content.js is missing
    var n = p.name || {}, H = [];
    var tel = win.GUNR_UTIL && GUNR_UTIL.telHref ? GUNR_UTIL.telHref(p.phone) : "";
    var links = (p.links || []).filter(function (l) { return l && isSet(l.url) && isSet(l.label); });
    var host = isSet(p.siteUrl) ? String(p.siteUrl).replace(/^https?:\/\//, "").replace(/\/$/, "") : "gunr.dev";

    H.push('<div class="plain-wrap">');
    H.push('<div class="p-bar"><span><b>' + esc(p.handle || "GUNR") + '</b>//OS<span class="p-long"> · plain view</span></span>' +
      '<button type="button" class="p-btn" data-plain-off aria-label="Back to terminal">' + icon("back") +
      '<span class="p-long">Back to terminal</span><span class="p-short">Terminal</span></button></div>');

    H.push('<header class="p-head">');
    H.push('<p class="p-kicker">' + esc(p.handle || "GUNR") + " · IT &amp; AI</p>");
    H.push('<h1 class="p-name" tabindex="-1">' + esc(isSet(n.first) ? n.first : "") + (isSet(n.last) ? " <em>" + esc(n.last) + "</em>" : "") + "</h1>");
    var role = [p.title, p.company].filter(isSet).map(esc).join(" · ");
    if (role) H.push('<p class="p-role">' + role + (isSet(p.companyNote) ? " <span>(" + esc(p.companyNote) + ")</span>" : "") + "</p>");
    if (isSet(p.tagline)) H.push('<p class="p-tag">' + esc(p.tagline) + "</p>");
    var meta = [p.location, p.availability].filter(isSet).map(esc).join(" · ");
    if (meta) H.push('<p class="p-meta">' + meta + "</p>");

    H.push('<div class="p-actions">');
    H.push('<button type="button" class="p-btn p-btn--primary" data-vcard>' + icon("save") + "Save contact</button>");
    if (isSet(p.email)) H.push('<a class="p-btn" href="mailto:' + esc(p.email) + '">' + icon("mail") + "Email</a>");
    if (tel) H.push('<a class="p-btn" href="' + esc(tel) + '">' + icon("phone") + "Call</a>");
    H.push('<button type="button" class="p-btn" data-share>' + icon("share") + "Share</button>");
    H.push("</div></header>");

    var bio = (p.bio || []).filter(isSet);
    if (bio.length) {
      H.push('<section class="p-sec" aria-labelledby="p-about"><h2 id="p-about">About</h2>');
      bio.forEach(function (b) { H.push("<p>" + esc(b) + "</p>"); });
      H.push("</section>");
    }

    var research = (p.research || []).filter(function (r) { return r && isSet(r.title); });
    H.push('<section class="p-sec" aria-labelledby="p-research"><h2 id="p-research">Research</h2>');
    if (research.length) {
      H.push('<ul class="p-list">');
      research.forEach(function (r) {
        H.push('<li class="p-item"><h3>' + esc(r.title) + "</h3>");
        if (isSet(r.year)) H.push('<p class="p-item-meta">' + esc(r.year) + "</p>");
        if (isSet(r.summary)) H.push("<p>" + esc(r.summary) + "</p>");
        var tags = (r.tags || []).filter(isSet);
        if (tags.length) H.push('<ul class="p-tags">' + tags.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul>");
        if (isSet(r.link)) H.push('<p><a href="' + esc(r.link) + '" rel="noopener">View project</a></p>');
        H.push("</li>");
      });
      H.push("</ul>");
    } else {
      H.push('<p class="dim">Project write-ups are on the way. Until then: years of hands-on work with language models, fine-tuning on consumer GPUs, retrieval and evaluation — ask me about any of it.</p>');
    }
    H.push("</section>");

    var exp = sortedExperience(p.experience);
    if (exp.length) {
      H.push('<section class="p-sec" aria-labelledby="p-exp"><h2 id="p-exp">Experience</h2><ol class="p-list">');
      exp.forEach(function (x) {
        var head = [x.role, x.org].filter(isSet).map(esc).join(" · ");
        if (!head) return;
        H.push('<li class="p-item"><h3>' + head + "</h3>");
        var d = dates(x);
        if (d) H.push('<p class="p-item-meta">' + esc(d) + "</p>");
        if (isSet(x.summary)) H.push("<p>" + esc(x.summary) + "</p>");
        var hl = (x.highlights || []).filter(isSet);
        if (hl.length) H.push("<ul>" + hl.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul>");
        H.push("</li>");
      });
      H.push("</ol></section>");
    }

    var groups = (p.skills || []).filter(function (g) { return g && (g.items || []).length; });
    if (groups.length) {
      H.push('<section class="p-sec" aria-labelledby="p-skills"><h2 id="p-skills">Skills</h2><div class="p-skills">');
      groups.forEach(function (g) {
        H.push("<div><h3>" + esc(g.group) + "</h3><ul class=\"p-list\">");
        g.items.filter(function (s) { return isSet(s.name); }).forEach(function (s) {
          var lv = clamp(+s.level || 0, 0, 1);
          H.push('<li class="p-skill"><span>' + esc(s.name) + '</span><span class="p-skill-lvl">' + Math.round(lv * 100) + "%</span>" +
            '<span class="p-skill-bar" aria-hidden="true"><i style="--v:' + lv.toFixed(2) + '"></i></span>' +
            (isSet(s.note) ? '<span class="p-skill-note">' + esc(s.note) + "</span>" : "") + "</li>");
        });
        H.push("</ul></div>");
      });
      H.push("</div></section>");
    }

    H.push('<section class="p-sec" aria-labelledby="p-contact"><h2 id="p-contact">Contact &amp; links</h2><dl class="p-dl">');
    if (isSet(p.email)) H.push('<dt>Email</dt><dd><a href="mailto:' + esc(p.email) + '">' + esc(p.email) + "</a></dd>");
    if (tel) H.push('<dt>Phone</dt><dd><a href="' + esc(tel) + '">' + esc(p.phone) + "</a></dd>");
    if (isSet(p.location)) H.push("<dt>Location</dt><dd>" + esc(p.location) + "</dd>");
    links.forEach(function (l) {
      H.push("<dt>" + esc(l.label) + '</dt><dd><a href="' + esc(l.url) + '" rel="me noopener">' + esc(String(l.url).replace(/^https?:\/\/(www\.)?/, "")) + "</a></dd>");
    });
    H.push('<dt>Card</dt><dd><a href="card.html">Printable networking card &amp; QR code</a></dd>');
    H.push("</dl></section>");

    H.push('<footer class="p-foot"><span>© ' + new Date().getFullYear() + " " + esc(fullName()) + " · " + esc(host) + "</span>" +
      '<button type="button" class="p-btn" data-plain-off>' + icon("back") + "Back to terminal</button></footer>");
    H.push("</div>");
    sec.innerHTML = H.join("");
  }

  function syncPlainButtons(on) {
    $$(".plain-btn").forEach(function (b) { b.setAttribute("aria-pressed", String(on)); });
  }
  var pendingPlain = null;   // state a view transition is about to apply
  function plain(on) {
    var cur = pendingPlain != null ? pendingPlain : root.classList.contains("plain");
    on = on === undefined ? !cur : !!on;
    if (on === cur) {
      if (on) { var h1 = $("#plain .p-name"); if (h1) h1.focus({ preventScroll: true }); }
      return on;
    }
    if (on) renderPlain();
    toggleMenu(false);

    pendingPlain = on;
    function apply() {
      if (pendingPlain === on) pendingPlain = null;
      root.classList.toggle("plain", on);
      root.classList.remove("is-booting");
      store.sset("gos.plain", on ? "1" : "0");
      syncPlainButtons(on);
    }
    if (doc.startViewTransition && !doc.hidden) {
      try {
        var vt = doc.startViewTransition(apply);
        vt.ready.catch(function () { /* skipped */ });
        vt.finished.catch(function () { /* skipped */ });
      } catch (e) { apply(); }
    }
    else apply();

    var S = scene();
    if (on) {
      win.scrollTo(0, 0);
      setTimeout(function () { var h1 = $("#plain .p-name") || $("#plain"); if (h1) h1.focus({ preventScroll: true }); }, 30);
      if (S && S.pause) S.pause();
      pauseMedia();
    } else {
      if (location.hash === "#plain" && win.history && history.replaceState) history.replaceState(null, "", location.pathname + location.search);
      if (S && S.resume) S.resume();
      playMedia();
      setTimeout(function () {
        if (GOS.wm && GOS.wm.layout) { try { GOS.wm.layout(false); } catch (e) { /* ignore */ } }
        if (GOS.term && GOS.term.focus && !GOS.device.touch) GOS.term.focus();
      }, 40);
      if (!API.ready) emitReady();
    }
    sfx("toggle");
    GOS.emit("plain", { on: on });
    return on;
  }

  // Plain-view controls and the skip link work anywhere in the document.
  doc.addEventListener("click", function (e) {
    var t = e.target.closest ? e.target.closest("[data-plain-link],[data-plain-off],[data-vcard],[data-share]") : null;
    if (!t) return;
    if (t.hasAttribute("data-plain-link")) { e.preventDefault(); plain(true); }
    else if (t.hasAttribute("data-plain-off")) { e.preventDefault(); plain(false); }
    else if (t.hasAttribute("data-vcard")) { e.preventDefault(); saveContact(); }
    else if (t.hasAttribute("data-share")) { e.preventDefault(); share(); }
  });
  win.addEventListener("hashchange", function () { if (location.hash === "#plain") plain(true); });

  /* =========================================================================
   * Wallpaper media (port of v2 setupHeroMedia)
   *   landscape: heroLoopWebm + heroLoop, poster heroPoster
   *   portrait:  heroLoopMobileWebm + heroLoopMobile, poster heroMobile, each
   *              falling back to the desktop files
   * Video only in full motion, never on Save-Data/2g/3g, and only after a poster
   * loaded; nothing shows until something actually loads.
   * ====================================================================== */
  var media = { video: null, shown: false };
  function playMedia() {
    var v = media.video;
    if (!v || doc.hidden || root.classList.contains("plain")) return;
    var pr = v.play();
    if (pr && pr.catch) pr.catch(function () { /* autoplay refused: the poster stays */ });
  }
  function pauseMedia() { if (media.video) media.video.pause(); }
  function setupWallpaperMedia() {
    var box = $("#wallpaper-media"), A = P().assets || {};
    if (!box) return;
    var portrait = mq("(max-width: 767px)") || win.innerWidth / Math.max(1, win.innerHeight) < 0.8;
    function pick(keys) { return keys.map(function (k) { return A[k]; }).filter(isSet).map(String); }
    var posters = pick(portrait ? ["heroMobile", "heroPoster"] : ["heroPoster"]);
    var loops = (portrait ? [["heroLoopMobileWebm", "heroLoopMobile"]] : []).concat([["heroLoopWebm", "heroLoop"]])
      .map(pick).filter(function (s) { return s.length; });
    var conn = navigator.connection || {};
    var slow = !!conn.saveData || /(^|-)[23]g$/.test(String(conn.effectiveType || ""));
    var allowVideo = FULL && !slow && loops.length > 0;
    if (conn.saveData || (!posters.length && !allowVideo)) return;

    var inner = el("div", "wp-in");
    box.appendChild(inner);
    box.classList.toggle("is-portrait", portrait);

    function reveal() {
      if (media.shown) return;
      media.shown = true;
      box.classList.add("is-in");
      var S = scene();
      if (S && S.setHeroDim) S.setHeroDim(0.5);
    }
    doc.addEventListener("gunr:scene-ready", function () {
      var S = scene();
      if (media.shown && S && S.setHeroDim) S.setHeroDim(0.5);
    });

    function loadPoster(i) {
      if (i >= posters.length) return;
      var img = new Image();
      img.alt = "";
      img.decoding = "async";
      img.className = "wp-poster";
      img.onload = function () {
        inner.insertBefore(img, inner.firstChild);
        reveal();
        if (allowVideo && !media.video) loadVideo(portrait && posters[i] === String(A.heroMobile) ? 0 : loops.length - 1);
      };
      img.onerror = function () { loadPoster(i + 1); };
      img.src = posters[i];
    }
    function loadVideo(i) {
      if (media.video) { media.video.remove(); media.video = null; }
      if (i >= loops.length) return;
      var v = doc.createElement("video");
      media.video = v;
      v.className = "wp-video";
      v.muted = true;
      v.defaultMuted = true;
      v.playsInline = true;
      ["muted", "playsinline", "loop", "autoplay", "disablepictureinpicture", "disableremoteplayback"].forEach(function (a) { v.setAttribute(a, ""); });
      v.setAttribute("preload", "none");
      v.setAttribute("tabindex", "-1");
      loops[i].forEach(function (src) {
        var s = doc.createElement("source");
        s.src = src;
        s.type = /\.webm(\?|#|$)/i.test(src) ? "video/webm" : "video/mp4";
        v.appendChild(s);
      });
      var next = function () { if (v === media.video) loadVideo(i + 1); };
      v.lastElementChild.addEventListener("error", next);
      v.addEventListener("error", next);
      v.addEventListener("canplay", function () {
        if (v !== media.video) return;
        v.classList.add("is-ready");
        reveal();
        playMedia();
      }, { once: true });
      inner.appendChild(v);
    }
    doc.addEventListener("visibilitychange", function () { if (doc.hidden) pauseMedia(); else playMedia(); });

    var idle = win.requestIdleCallback || function (fn) { return setTimeout(fn, 200); };
    idle(function () { loadPoster(0); }, { timeout: 2500 });
  }

  /* =========================================================================
   * Quick guide window (welcome.md) — desktop ≥ 1100px
   * ====================================================================== */
  function buildGuide() {
    var p = P(), first = (p.name && isSet(p.name.first)) ? p.name.first : "Gunnar";
    var mod = isMac ? "⌘" : "Ctrl";
    function btn(cmd, ico, label, sub, primary) {
      return '<button type="button" class="guide-btn' + (primary ? " guide-btn--primary" : "") + '" data-cmd="' + cmd + '">' +
        '<span class="guide-btn-ico">' + icon(ico) + "</span><span>" + label + "<small>" + sub + "</small></span></button>";
    }
    var a = el("article", "guide");
    a.setAttribute("aria-label", "Quick guide");
    a.innerHTML =
      '<p class="guide-kicker">~/welcome.md</p>' +
      '<h2 class="guide-title">Hi, I’m ' + esc(first) + ".<br><em>This whole site is a terminal.</em></h2>" +
      '<p class="guide-lead">You don’t need to know any commands. Click anything highlighted, use these buttons, or type <kbd>help</kbd> and press <kbd>Enter</kbd>.</p>' +
      '<div class="guide-actions">' +
        btn("vcard", "save", "Save contact", "vcard · .vcf", true) +
        btn("contact", "card", "Contact", "contact") +
        btn("about", "user", "About me", "about") +
        btn("research", "flask", "Research", "research") +
        btn("ask", "spark", "Ask gunr-gpt", "ask · runs locally") +
        btn("experience", "doc", "Experience", "git log") +
      "</div>" +
      '<p class="guide-h">Shortcuts</p>' +
      '<dl class="guide-keys">' +
        "<dt><kbd>" + mod + "</kbd><kbd>K</kbd></dt><dd>Search every command</dd>" +
        "<dt><kbd>Tab</kbd><kbd>→</kbd></dt><dd>Accept the grey suggestion</dd>" +
        "<dt><kbd>↑</kbd><kbd>↓</kbd></dt><dd>Previous commands</dd>" +
        "<dt><kbd>" + (isMac ? "⌥" : "Alt") + "</kbd><kbd>1</kbd>–<kbd>6</kbd></dt><dd>Switch workspace</dd>" +
        "<dt><kbd>Ctrl</kbd><kbd>L</kbd></dt><dd>Clear the screen</dd>" +
        "<dt><kbd>Esc</kbd></dt><dd>Close this window</dd>" +
      "</dl>" +
      '<p class="guide-foot">Prefer a normal page? <button type="button" data-plain-link>Open the plain view</button></p>';
    // Without the terminal the data-cmd buttons still do the important things.
    a.addEventListener("click", function (e) {
      if (GOS.term && GOS.term.run) return;
      var b = e.target.closest && e.target.closest("[data-cmd]");
      if (b) run(b.getAttribute("data-cmd"), b);
    });
    return a;
  }
  function openGuide() {
    var W = GOS.wm;
    if (!W || typeof W.open !== "function") return;
    try {
      W.open({ id: "welcome", title: "welcome.md", icon: "✦", kind: "app", size: "side", body: buildGuide(), label: "Quick guide", origin: bar ? $(".bar-logo", bar) : null });
      if (W.focus) W.focus("gsh");
    } catch (e) { warn("guide window failed", e); }
  }

  /* =========================================================================
   * Landing (after os:ready): neofetch, welcome card, guide, deep link
   * ====================================================================== */
  function deepLink() {
    var hsh = (location.hash || "").replace(/^#\/?/, "").toLowerCase();
    if (!hsh || hsh === "plain") return "";
    for (var i = 0; i < WS.length; i++) if (WS[i].key === hsh || WS[i].cmd === hsh) return WS[i].cmd;
    return GOS.commands.get(hsh) ? hsh : "";
  }
  function landing() {
    var T = GOS.term, link = deepLink(), small = GOS.device.small();
    // The guide window carries the hero + buttons on wide screens, so the terminal
    // then prints only a one-line welcome. Phones skip neofetch: the welcome card
    // (with Save contact) must be the first thing they see.
    var guide = mq("(min-width: 1100px)") && !small;
    if (guide) setTimeout(openGuide, FULL ? 420 : 0);
    setTimeout(function () {
      var p = Promise.resolve();
      if (T) {
        if (!small) p = p.then(function () { return T.type ? T.type("neofetch") : T.run("neofetch", { source: "auto" }); });
        p = p.then(function () { return T.run(guide ? "welcome --short" : "welcome", { source: "auto" }); })
          .catch(function (e) { warn("landing failed", e); });
      }
      p.then(function () {
        if (link) run(link, null, "link");
        else if (T && T.focus && !GOS.device.touch) T.focus();
      });
    }, FULL ? 260 : 0);
  }

  function motionHint() {
    if (FULL || GOS.motion.source !== "system" || store.sget("gos.motionHint") === "1") return;
    store.sset("gos.motionHint", "1");
    setTimeout(function () {
      var where = GOS.device.small() ? " (menu ⋯, top right)" : " (top right)";
      toast("Reduced motion is on in your system settings. Turn on Motion" + where + " for the full experience.", { ms: 7000 });
      $$(".motion-switch").forEach(function (s) {
        s.classList.remove("is-hint");
        void s.offsetWidth;
        s.classList.add("is-hint");
      });
    }, 1800);
  }

  function emitReady() {
    if (API.ready) return;
    API.ready = true;
    root.classList.add("os-ready");
    GOS.emit("os:ready", {});
    landing();
    setupWallpaperMedia();
    motionHint();
  }

  /* =========================================================================
   * Boot + login (first visit per session, full motion only)
   * ====================================================================== */
  win.GUNR_BOOT = { done: false };   // read by scene.js (burst on late load)

  var LOG = [
    ["0.000000", "gunr-os 3.0.0-gsh #1 SMP PREEMPT_DYNAMIC x86_64", ""],
    ["0.004113", "Command line: BOOT_IMAGE=/vmlinuz-gunr root=/dev/nvme0n1p2 quiet splash", ""],
    ["0.081920", "nvidia: 24576 MiB VRAM online", "hl"],
    ["", "Mounted /home/gunnar", "ok"],
    ["", "Started Network Manager", "ok"],
    ["", "Started Hyprland compositor", "ok"],
    ["0.402771", "Loading model weights… gunr-gpt.safetensors", "hl"],
    ["", "Started gunr-gpt (local, offline)", "ok"],
    ["", "Started gsh — the gunr shell", "ok"],
    ["", "Reached target Graphical Interface", "ok"]
  ];

  function finishBoot(animated) {
    win.GUNR_BOOT.done = true;
    try { doc.dispatchEvent(new Event("gunr:boot-done")); } catch (e) { /* old browsers */ }
    var desk = $("#desktop");
    if (desk) { desk.removeAttribute("inert"); desk.removeAttribute("aria-hidden"); }
    root.classList.add("os-enter");
    setTimeout(function () { root.classList.remove("os-enter"); }, 1600);
    if (animated) {
      var S = scene();
      if (S && S.burst) S.burst();
    }
    emitReady();
  }

  function boot() {
    var box = $("#boot");
    if (!box || !root.classList.contains("is-booting")) {
      root.classList.remove("is-booting");
      finishBoot(false);
      return;
    }
    var desk = $("#desktop");
    if (desk) { desk.setAttribute("inert", ""); desk.setAttribute("aria-hidden", "true"); }
    box.setAttribute("aria-hidden", "false");
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-label", "Starting GUNR//OS");

    var p = P(), n = p.name || {};
    var initials = ((isSet(n.first) ? n.first[0] : "G") + (isSet(n.last) ? n.last[0] : "P")).toUpperCase();
    var touch = GOS.device.touch;
    var dateStr = "";
    try { dateStr = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }); } catch (e) { /* ignore */ }

    box.innerHTML =
      '<button type="button" class="boot-skip">Skip intro <kbd aria-hidden="true">Esc</kbd></button>' +
      '<ol class="boot-log" aria-hidden="true"></ol>' +
      '<div class="login">' +
        '<p class="login-clock" aria-hidden="true"></p>' +
        '<p class="login-date">' + esc(dateStr) + "</p>" +
        '<div class="login-avatar" aria-hidden="true">' + esc(initials) + "</div>" +
        '<p class="login-user">guest</p>' +
        '<button type="button" class="login-field"><span class="login-hint">' + (touch ? "Tap to sign in" : "Press Enter or tap to sign in") +
          '</span><span class="login-caret" aria-hidden="true"></span></button>' +
        '<p class="login-welcome" aria-live="polite"></p>' +
        '<p class="login-foot">GUNR//OS 3.0 · tty1 · ' + esc(String(p.siteUrl || "gunr.dev").replace(/^https?:\/\//, "")) + "</p>" +
      "</div>";
    tickClock();

    // avatar photo, only if it actually loads
    var A = p.assets || {};
    if (isSet(A.avatar)) {
      var img = new Image();
      img.alt = "";
      img.onload = function () { var av = $(".login-avatar", box); if (av) av.appendChild(img); };
      img.src = A.avatar;
    }

    var timers = [], done = false, signing = false, loginShown = false;
    var log = $(".boot-log", box), login = $(".login", box), field = $(".login-field", box);
    function later(fn, ms) { timers.push(setTimeout(fn, ms)); }

    LOG.forEach(function (l, i) {
      later(function () {
        if (loginShown) return;   // the log is faded out under the lock screen
        var li = el("li");
        li.innerHTML = (l[2] === "ok" ? '<span class="ok">[  OK  ]</span> ' : '<span class="ts">[' + ("    " + l[0]).slice(-12) + "]</span> ") +
          (l[2] === "hl" ? '<span class="hl">' + esc(l[1]) + "</span>" : esc(l[1]));
        log.appendChild(li);
      }, 30 + i * 62);
    });
    later(showLogin, 760);
    later(function () { signIn(false); }, 1480);

    function showLogin() {
      if (done) return;
      loginShown = true;
      box.classList.add("is-login");
      if (!touch) { try { field.focus({ preventScroll: true }); } catch (e) { field.focus(); } }
    }
    function signIn(fast) {
      if (done || signing) return;
      signing = true;
      if (!loginShown) showLogin();
      var dots = el("span", "login-dots");
      field.innerHTML = "";
      field.appendChild(dots);
      login.classList.add("is-auth");
      var count = 8, gap = fast ? 22 : 40;
      for (var k = 0; k < count; k++) later(function () { dots.appendChild(el("i")); sfx("key"); }, k * gap);
      later(function () {
        login.classList.add("is-welcome");
        $(".login-welcome", box).textContent = "Welcome, guest";
        sfx("enter");
      }, count * gap + 60);
      later(function () { end(false); }, count * gap + (fast ? 300 : 420));
    }
    function end(instant) {
      if (done) return;
      done = true;
      timers.forEach(clearTimeout);
      doc.removeEventListener("keydown", onKey, true);
      box.removeEventListener("pointerdown", onTap);
      store.sset("gos.booted", "1");
      function cleanup() {
        root.classList.remove("is-booting", "boot-leaving");
        box.className = "boot";
        box.innerHTML = "";
        box.setAttribute("aria-hidden", "true");
        box.removeAttribute("role");
        box.removeAttribute("aria-label");
      }
      if (instant) {
        cleanup();
        finishBoot(false);
        return;
      }
      var fr = FULL && field && field.isConnected ? field.getBoundingClientRect() : null;
      root.classList.add("boot-leaving");
      box.classList.add("is-out");
      finishBoot(true);
      if (fr && fr.width) morphToPrompt(fr);
      setTimeout(cleanup, 640);
    }
    // The sign-in pill flies into the terminal's prompt row, so the caret visibly
    // travels from the lock screen into the shell. Full motion only; cosmetic.
    function morphToPrompt(fr) {
      setTimeout(function () {
        var t = GOS.term && GOS.term.el, pl = t && $(".prompt-line", t);
        var tr = pl && pl.getBoundingClientRect();
        if (!tr || !tr.width || !doc.body.animate) return;
        var g = el("div", "login-morph");
        g.setAttribute("aria-hidden", "true");
        g.style.cssText = "left:" + fr.left + "px;top:" + fr.top + "px;width:" + fr.width + "px;height:" + fr.height + "px";
        doc.body.appendChild(g);
        var sx = tr.width / fr.width, sy = Math.max(tr.height, 24) / fr.height;
        var a = g.animate([
          { transform: "none", opacity: 1 },
          { transform: "translate(" + (tr.left - fr.left) + "px," + (tr.top - fr.top) + "px) scale(" + sx + "," + sy + ")", opacity: 0.9, offset: 0.8 },
          { transform: "translate(" + (tr.left - fr.left) + "px," + (tr.top - fr.top) + "px) scale(" + sx + "," + sy + ")", opacity: 0 }
        ], { duration: 720, easing: "cubic-bezier(.16,1,.3,1)", fill: "forwards" });
        var rm = function () { if (g.parentNode) g.parentNode.removeChild(g); };
        a.onfinish = rm;
        setTimeout(rm, 1200);
      }, 40);
    }
    function onKey(e) {
      if (done) return;
      var k = e.key;
      if (k === "Tab" || k === "Shift" || k === "Control" || k === "Alt" || k === "Meta" || k === "CapsLock") return;
      if (k === "Enter" || k === " " || k === "Escape") { e.preventDefault(); e.stopPropagation(); }
      if (loginShown && (k === "Enter" || k === " ")) signIn(true);
      else end(true);
    }
    function onTap(e) {
      if (done) return;
      if (e.target.closest(".boot-skip")) { e.preventDefault(); end(true); return; }
      if (loginShown && e.target.closest(".login-field, .login-avatar, .login-clock")) { e.preventDefault(); signIn(true); return; }
      end(true);
    }
    doc.addEventListener("keydown", onKey, true);
    box.addEventListener("pointerdown", onTap);
    // keyboard activation of the buttons (pointerdown covers mouse/touch)
    box.addEventListener("click", function (e) {
      if (done) return;
      if (e.target.closest(".boot-skip")) end(true);
      else if (e.target.closest(".login-field")) signIn(true);
    });
  }

  /* =========================================================================
   * Global wiring
   * ====================================================================== */
  function wireBus() {
    GOS.on("command", function (d) {
      if (!d) return;
      var c = GOS.commands.get(d.name);
      var name = c ? c.name : String(d.name || "").toLowerCase();
      if (Object.prototype.hasOwnProperty.call(CMD_WS, name)) setWorkspace(CMD_WS[name]);
      load.spike = Math.min(0.75, load.spike + 0.45);
      if (d.source !== "auto") sfx("enter");
    });
    GOS.on("command:unknown", function () { sfx("error"); });
    GOS.on("wm:open", function () { sfx("pop"); });
    GOS.on("wm:focus", function (d) { if (d && d.id) setBarTitle(titleOf(d.id)); });
    GOS.on("wm:close", function (d) {
      var W = GOS.wm, list = W && W.list ? W.list() : [];
      var f = null, open = {};
      for (var i = 0; i < list.length; i++) {
        var w = list[i];
        if (!w) continue;
        open[w.id] = true;
        if (!f && w.el && w.el.classList.contains("is-focused")) f = w.id;
      }
      setBarTitle(titleOf(f || "gsh") || "gsh");
      // The workspace's own window just closed: fall back to the focused
      // window's workspace, or home, so the label never points at nothing.
      var gone = d && WIN_WS[d.id];
      if (gone != null && gone === wsIndex && !open[d.id]) {
        var next = f && WIN_WS[f] != null ? WIN_WS[f] : 0;
        if (next !== wsIndex) setWorkspace(next, { silent: true });
      }
    });
  }

  function wireKeys() {
    doc.addEventListener("keydown", function (e) {
      if (root.classList.contains("is-booting")) return;
      // Alt+1..6 (documented); Ctrl+1..6 also works where the browser lets it through
      var m = /^Digit([1-6])$/.exec(e.code || "");
      if (m && (e.ctrlKey !== e.altKey) && !e.shiftKey && !e.metaKey && !root.classList.contains("plain")) {
        e.preventDefault();
        var i = +m[1] - 1;
        goWorkspace(i, bar ? $$(".ws-btn", bar)[i] : null);
        return;
      }
      if (e.key === "Escape" && menu && !menu.hidden) { toggleMenu(false); if (menuBtn) menuBtn.focus(); }
    });
    // typing ticks for any text field (prompt, palette, chat)
    doc.addEventListener("keydown", function (e) {
      if (!sfxOn || e.ctrlKey || e.metaKey || e.altKey) return;
      var t = e.target, tag = t && t.tagName;
      if ((tag === "INPUT" || tag === "TEXTAREA") && (e.key.length === 1 || e.key === "Backspace" || e.key === "Delete")) sfx("key");
    }, true);
  }

  function refreshMeta() {
    var p = P();
    if (!p.name) return;
    doc.title = fullName() + " · GUNR//OS";
    var d = $('meta[name="description"]');
    var role = [p.title, p.company].filter(isSet).join(" at ");
    var desc = fullName() + " (" + (p.handle || "GUNR") + ")" + (role ? ": " + role + "." : ".") + (isSet(p.tagline) ? " " + p.tagline : "");
    if (d) d.setAttribute("content", desc + " Explore the terminal or save my contact in one tap.");
  }

  /* =========================================================================
   * Start
   * ====================================================================== */
  API.setWorkspace = setWorkspace;
  API.toast = toast;
  API.setTheme = setTheme;
  API.sfx = sfx;
  API.setSfx = setSfx;
  API.plain = plain;
  API.saveContact = saveContact;
  API.share = share;
  API.copy = copy;

  win.addEventListener("pageshow", function (e) { if (e.persisted) root.classList.remove("is-leaving"); });

  try { buildBar(); } catch (e) { warn("status bar failed", e); }
  startClock();
  setInterval(tickTray, FULL ? 750 : 2200);
  tickTray();
  refreshMeta();
  wireBus();
  wireKeys();
  syncPlainButtons(root.classList.contains("plain"));

  try { renderPlain(); } catch (e) { warn("plain view render failed", e); }

  if (root.classList.contains("plain")) {
    // Plain view chosen for this session: no intro; the desktop boots when they leave it.
    root.classList.remove("is-booting");
    win.GUNR_BOOT.done = true;
    store.sset("gos.plain", "1");
    var S0 = scene();
    if (S0 && S0.pause) S0.pause();
    doc.addEventListener("gunr:scene-ready", function () {
      var S = scene();
      if (S && S.pause && root.classList.contains("plain")) S.pause();
    });
  } else {
    try { boot(); } catch (e) {
      warn("boot failed", e);
      root.classList.remove("is-booting", "boot-leaving");
      finishBoot(false);
    }
  }
})();
