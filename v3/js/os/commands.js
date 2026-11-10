/* =============================================================================
 * GUNR//OS — commands.js
 * -----------------------------------------------------------------------------
 * Registers every command with GOS.commands. Each command renders a small,
 * designed "product" into its terminal block through the output builder (ctx.out)
 * or opens an app window through GOS.wm.open(). Nothing here touches terminal or
 * window-manager internals; when a module is missing the command degrades
 * (apps render inline, toasts become silent, CDN helpers show text fallbacks).
 *
 * Styling lives in css/apps.css. Class prefixes:
 *   .x-*  shared UI bits      .help .man .wc   help / man / welcome
 *   .ab   about                .nf  neofetch     .yz  research (yazi)
 *   .gl   experience graph     .bt  skills (btop) .cc contact card
 *   .chat gunr-gpt chat         .th  themes       .fs  ls/tree/cat (bat)
 *   .fun  fun commands
 * ========================================================================== */
(function () {
  "use strict";

  var GOS = window.GOS;
  if (!GOS || !GOS.commands) return;

  var U = GOS.util, doc = document, root = doc.documentElement;
  var set = U.isSet;
  var SVGNS = "http://www.w3.org/2000/svg";

  function P() { return (GOS.profile && GOS.profile()) || window.PROFILE || {}; }
  function full() { return !!(GOS.motion && GOS.motion.full); }
  function touch() { return !!(GOS.device && GOS.device.touch); }
  function small() { return !!(GOS.device && GOS.device.small && GOS.device.small()); }
  function clean(s) { return String(s == null ? "" : s).replace(/\s+/g, " ").trim(); }
  function pad(s, n) { s = String(s); while (s.length < n) s += " "; return s; }
  function lpad(s, n) { s = String(s); while (s.length < n) s = " " + s; return s; }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function now() { return (window.performance && performance.now) ? performance.now() : Date.now(); }
  function log(e) { if (window.console) console.error("[gsh]", e); }

  /* ---------------------------------------------------------------------------
   * DOM helpers
   * ------------------------------------------------------------------------ */
  function add(el, kids) {
    if (kids == null || kids === false) return el;
    if (!Array.isArray(kids)) kids = [kids];
    kids.forEach(function (c) {
      if (c == null || c === false) return;
      if (Array.isArray(c)) { add(el, c); return; }
      el.appendChild(typeof c === "object" ? c : doc.createTextNode(String(c)));
    });
    return el;
  }
  function h(tag, a, kids) {
    var el = doc.createElement(tag);
    if (a) Object.keys(a).forEach(function (k) {
      var v = a[k];
      if (v == null || v === false) return;
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k === "html") el.innerHTML = v;
      else if (k === "value") el.value = v;
      else if (k === "style" && typeof v === "object") Object.keys(v).forEach(function (s) { el.style.setProperty(s, v[s]); });
      else if (k.slice(0, 2) === "on" && typeof v === "function") el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    });
    return add(el, kids);
  }
  function s(tag, a, kids) {
    var el = doc.createElementNS(SVGNS, tag);
    if (a) Object.keys(a).forEach(function (k) { if (a[k] != null) el.setAttribute(k, a[k]); });
    return add(el, kids);
  }
  // A command link: the terminal's global [data-cmd] delegation runs it.
  function cmd(label, line, cls, title) {
    return h("button", { type: "button", "class": "cmd-link" + (cls ? " " + cls : ""), "data-cmd": line, title: title || null }, label);
  }
  function btn(label, opts) {
    opts = opts || {};
    return h("button", {
      type: "button",
      "class": "x-btn" + (opts.primary ? " is-primary" : "") + (opts.cls ? " " + opts.cls : ""),
      "data-cmd": opts.cmd || null, "aria-label": opts.aria || null, onclick: opts.onclick || null
    }, [opts.icon ? iconEl(opts.icon) : null, h("span", null, label)]);
  }
  function alive(el) { return !!(el && el.isConnected); }

  // setInterval that stops itself once its element leaves the document.
  function loop(el, fn, ms) {
    var seen = false, misses = 0, id;
    id = setInterval(function () {
      if (alive(el)) seen = true;
      else { if (seen || ++misses > 4) clearInterval(id); return; }
      if (doc.hidden) return;
      try { fn(); } catch (e) { clearInterval(id); log(e); }
    }, ms);
    return function () { clearInterval(id); };
  }

  /* ---------------------------------------------------------------------------
   * Icons (24px stroke glyphs, currentColor)
   * ------------------------------------------------------------------------ */
  var PATHS = {
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7M12 17h.01"/>',
    spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
    book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5M8 7h7"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
    term: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M7.5 9.5l3 2.5-3 2.5M13 15h4"/>',
    folder: '<path d="M3 6.5A2.5 2.5 0 0 1 5.5 4H9l2 2h7.5A2.5 2.5 0 0 1 21 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 16.5z"/>',
    git: '<circle cx="6" cy="6" r="2.2"/><circle cx="6" cy="18" r="2.2"/><circle cx="18" cy="8" r="2.2"/><path d="M6 8.2v7.6M18 10.2c0 3.5-3.5 4.8-10 6.3"/>',
    gauge: '<path d="M4 18a8 8 0 1 1 16 0"/><path d="M12 18l4-6M8 18h8"/>',
    card: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><circle cx="9" cy="11" r="2"/><path d="M6 16c.8-1.4 1.8-2 3-2s2.2.6 3 2M15 10h3M15 13.5h3"/>',
    download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3.5 7l8.5 6 8.5-6"/>',
    phone: '<path d="M5 4h3.5l2 5-2.4 1.5a11 11 0 0 0 5.4 5.4L15 13.5l5 2V19a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
    qr: '<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2.5v2.5H14zM17.5 17.5H20V20h-2.5zM14 19v1M19 14h1"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    share: '<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.2 10.8l7.6-3.6M8.2 13.2l7.6 3.6"/>',
    chat: '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5H9l-5 4z"/><path d="M8 9h8M8 12h5"/>',
    sparkles: '<path d="M11 3l1.7 5.3L18 10l-5.3 1.7L11 17l-1.7-5.3L4 10l5.3-1.7z"/><path d="M18.5 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>',
    file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h4"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>',
    tree: '<path d="M5 3v13a2 2 0 0 0 2 2h4M5 9h6"/><rect x="13" y="6" width="7" height="6" rx="1.5"/><rect x="13" y="15" width="7" height="6" rx="1.5"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    pin: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.2"/>',
    eye: '<path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
    open: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    eraser: '<path d="M4 20h16M7.5 16.5l9.5-9.5 3 3-9.5 9.5H7.5z"/><path d="M4.5 13.5l3 3"/>',
    history: '<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3.5 8.5"/><path d="M3.5 3.5v5h5M12 7.5V12l3 2"/>',
    palette: '<path d="M12 3a9 9 0 1 0 0 18c1.4 0 2-.9 2-1.9 0-1.2-1-1.6-1-2.6 0-1 .9-1.5 2-1.5h2a4 4 0 0 0 4-4c0-4.4-4-8-9-8z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7.5" r="1"/>',
    wave: '<path d="M3 12c2.5-6 5.5-6 9 0s6.5 6 9 0"/>',
    sound: '<path d="M4 9.5v5h4l5 4v-13l-5 4z"/><path d="M16.5 9a4 4 0 0 1 0 6M19 6.5a7.5 7.5 0 0 1 0 11"/>',
    doc: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h3.5"/>',
    printer: '<path d="M7 9V3.5h10V9"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v6.5H7z"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    echo: '<path d="M4 7h16M4 12h10M4 17h13"/>',
    power: '<path d="M12 3v8"/><path d="M6.3 7.3a8 8 0 1 0 11.4 0"/>',
    shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
    rain: '<path d="M6 3v6M6 13v2M12 5v8M12 17v4M18 3v3M18 10v7"/>',
    gpu: '<rect x="3" y="6.5" width="18" height="10" rx="2"/><circle cx="9" cy="11.5" r="2.4"/><circle cx="15.5" cy="11.5" r="2.4"/><path d="M6 16.5v3M10 16.5v3M14 16.5v3"/>',
    ping: '<path d="M5 12a7 7 0 0 1 14 0M8.5 12a3.5 3.5 0 0 1 7 0"/><circle cx="12" cy="12" r="1"/><path d="M12 13v7"/>',
    cow: '<path d="M6 9c0-2.2 2-4 6-4s6 1.8 6 4v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4z"/><path d="M6 9L3.5 7M18 9l2.5-2M10 15h4"/><circle cx="9.5" cy="11" r=".6"/><circle cx="14.5" cy="11" r=".6"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    coffee: '<path d="M4 9h12v5.5a5.5 5.5 0 0 1-5.5 5.5h-1A5.5 5.5 0 0 1 4 14.5z"/><path d="M16 11h1.5a2.5 2.5 0 0 1 0 5H16M8 3.5v3M12 3.5v3"/>',
    hack: '<path d="M4 17l6-5-6-5M12 19h8"/>',
    home: '<path d="M3.5 11L12 3.5l8.5 7.5M5.5 9.5V20h13V9.5"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.7 5.6 3.7 9S14.5 18.4 12 21c-2.5-2.6-3.7-5.6-3.7-9S9.5 5.6 12 3z"/>',
    github: '<path d="M9 19c-4 1.3-4-2-6-2.5M15 21v-3.5a3 3 0 0 0-.9-2.4c3-.3 6-1.5 6-6.6a5.2 5.2 0 0 0-1.4-3.6 4.8 4.8 0 0 0-.1-3.6s-1.1-.3-3.7 1.4a12.6 12.6 0 0 0-6.6 0C5.7 1 4.6 1.3 4.6 1.3a4.8 4.8 0 0 0-.1 3.6A5.2 5.2 0 0 0 3 8.5c0 5.1 3 6.3 6 6.6a3 3 0 0 0-.9 2.4V21"/>',
    linkedin: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 10v7M8 7v.01M12 17v-4a2 2 0 0 1 4 0v4M12 10v7"/>',
    hf: '<circle cx="12" cy="12" r="9"/><circle cx="9" cy="10" r=".8"/><circle cx="15" cy="10" r=".8"/><path d="M8.5 14c1 1.4 2.2 2 3.5 2s2.5-.6 3.5-2"/>',
    send: '<path d="M4 12l16-8-6 16-2.5-6.5z"/><path d="M11.5 13.5L20 4"/>',
    back: '<path d="M15 6l-6 6 6 6"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>'
  };
  function icon(name) {
    return '<svg class="x-i" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + (PATHS[name] || PATHS.term) + "</svg>";
  }
  function iconEl(name) { return h("span", { "class": "x-ico", "aria-hidden": "true", html: icon(name) }); }
  var LINK_ICON = { linkedin: "linkedin", github: "github", huggingface: "hf", mail: "mail", web: "globe", x: "link" };

  /* ---------------------------------------------------------------------------
   * Bridges to other modules (all optional)
   * ------------------------------------------------------------------------ */
  function toast(msg, kind) {
    try { if (GOS.desktop && GOS.desktop.toast) GOS.desktop.toast(msg, { kind: kind || "info" }); } catch (e) { log(e); }
  }
  function sfx(name) {
    try { if (GOS.desktop && GOS.desktop.sfx) GOS.desktop.sfx(name); } catch (e) { /* audio is optional */ }
  }
  function openApp(ctx, o) {
    var wm = GOS.wm;
    if (wm && typeof wm.open === "function") {
      try {
        return wm.open({
          id: o.id, title: o.title, icon: o.icon, kind: "app", body: o.body,
          size: o.size || "side", origin: (ctx && ctx.origin) || null, onClose: o.onClose, label: o.label || ""
        });
      } catch (e) { log(e); }
    }
    // No window manager: the app lives inline in the terminal block.
    if (ctx && ctx.out) ctx.out.el(o.body);
    return null;
  }
  function closeApp(id) { try { if (GOS.wm && GOS.wm.close) GOS.wm.close(id); } catch (e) { log(e); } }
  function chips(ctx, list) {
    if (!ctx || !ctx.out || !ctx.out.chips) return;
    ctx.out.chips(list.filter(function (c, i) { return c && list.indexOf(c) === i; }).slice(0, 6));
  }

  // Parse the raw line ourselves so quoting works regardless of how argv is built.
  function argsOf(ctx) {
    if (ctx && typeof ctx.raw === "string" && ctx.raw.trim()) {
      var t = ctx.raw.match(/"[^"]*"|'[^']*'|\S+/g) || [];
      return t.slice(1).map(function (x) { return x.replace(/^(["'])([\s\S]*)\1$/, "$2"); });
    }
    if (ctx && Array.isArray(ctx.args)) return ctx.args.slice();
    if (ctx && Array.isArray(ctx.argv)) return ctx.argv.slice(1);
    return [];
  }
  function restOf(ctx) {
    if (ctx && typeof ctx.raw === "string") return ctx.raw.replace(/^\s*\S+\s*/, "").trim();
    return argsOf(ctx).join(" ");
  }
  // complete(argv) may receive argv with or without the command word; we only need the last token.
  function completer(fn) {
    return function (argv) {
      argv = Array.isArray(argv) ? argv : [];
      var cur = String(argv.length ? argv[argv.length - 1] : "").toLowerCase();
      var all = fn(argv) || [];
      return all.filter(function (c) { return String(c).toLowerCase().indexOf(cur) === 0; });
    };
  }

  function copyText(text, done) {
    function legacy() {
      var ta = h("textarea", { readonly: true, style: { position: "fixed", top: "0", left: "0", opacity: "0", "pointer-events": "none" } });
      ta.value = text;
      doc.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = doc.execCommand("copy"); } catch (e) { ok = false; }
      doc.body.removeChild(ta);
      done(ok);
    }
    if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext !== false) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, legacy);
    } else legacy();
  }
  // A copy button that morphs to "Copied" for a moment.
  function copyBtn(text, label) {
    var b = h("button", { type: "button", "class": "x-copy", "aria-label": "Copy " + (label || text) });
    b.innerHTML = icon("copy") + "<span>Copy</span>";
    b.addEventListener("click", function (e) {
      e.stopPropagation();
      copyText(text, function (ok) {
        b.classList.toggle("is-done", ok);
        b.innerHTML = icon(ok ? "check" : "x") + "<span>" + (ok ? "Copied" : "Failed") + "</span>";
        toast(ok ? (label || "Text") + " copied" : "Copy failed — " + text, ok ? "ok" : "error");
        sfx(ok ? "pop" : "error");
        setTimeout(function () { b.classList.remove("is-done"); b.innerHTML = icon("copy") + "<span>Copy</span>"; }, 1600);
      });
    });
    return b;
  }

  /* ---------------------------------------------------------------------------
   * Profile views
   * ------------------------------------------------------------------------ */
  function fullName() {
    var n = P().name || {};
    return [n.first, n.last].filter(set).join(" ") || (set(P().handle) ? P().handle : "Gunnar");
  }
  function firstName() { var n = P().name || {}; return set(n.first) ? n.first : fullName(); }
  function initials() {
    var n = P().name || {};
    return ((set(n.first) ? String(n.first).charAt(0) : "") + (set(n.last) ? String(n.last).charAt(0) : "")).toUpperCase() || "G";
  }
  function siteUrl() { var u = P().siteUrl || window.SITE_URL; return set(u) ? String(u) : location.origin; }
  function host(u) { return String(u || "").replace(/^https?:\/\//, "").replace(/\/$/, ""); }
  function telHref(p) {
    if (window.GUNR_UTIL && GUNR_UTIL.telHref) return GUNR_UTIL.telHref(p);
    var d = String(p || "").replace(/[^\d+]/g, ""); return d ? "tel:" + d : "";
  }
  function liveLinks() { return (P().links || []).filter(function (l) { return l && set(l.url) && set(l.label); }); }
  function allSkills() {
    var out = [];
    (P().skills || []).forEach(function (g, gi) {
      (g.items || []).forEach(function (sk) {
        if (set(sk.name)) out.push({ name: sk.name, level: clamp(+sk.level || 0, 0, 1), note: set(sk.note) ? sk.note : "", group: g.group, gi: gi });
      });
    });
    return out;
  }
  function skillLevel(name) {
    var all = allSkills();
    for (var i = 0; i < all.length; i++) if (all[i].name === name) return all[i];
    return null;
  }
  function isResearchRole(e) { return /research|student|universit|\bai\b/i.test((e.role || "") + " " + (e.org || "")); }
  function experience() { return (P().experience || []).filter(function (e) { return e && (set(e.org) || set(e.role)); }); }
  function earliestYear() {
    var ys = experience().map(function (e) { return set(e.start) && /^\d{4}$/.test(e.start) ? +e.start : null; }).filter(Boolean);
    return ys.length ? Math.min.apply(Math, ys) : null;
  }
  function researchItems() {
    return (P().research || []).map(function (r, i) {
      var titled = set(r.title);
      var tags = (r.tags || []).filter(set);
      var n = ("0" + (i + 1)).slice(-2);
      return {
        i: i, raw: r, titled: titled,
        title: titled ? r.title : (tags.length ? tags.join(" · ") : "Project " + n),
        draft: !titled || !set(r.summary),
        slug: titled ? U.slug(r.title).slice(0, 32).replace(/-+$/, "") : "project-" + n,
        year: set(r.year) ? String(r.year) : "",
        tags: tags,
        summary: set(r.summary) ? r.summary : "",
        link: set(r.link) ? r.link : "",
        attends: (r.attends || []).filter(set)
      };
    });
  }
  function hash7(str) {
    var h1 = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) { h1 ^= str.charCodeAt(i); h1 = (h1 * 0x01000193) >>> 0; }
    return ("0000000" + h1.toString(16)).slice(-7);
  }
  // whole words only, at most ~28 chars: "indipendent-student-clemson"
  function orgSlug(org) {
    var out = "";
    U.slug(org || "").split("-").some(function (w) {
      if (out && (out + "-" + w).length > 28) return true;
      out = out ? out + "-" + w : w;
      return false;
    });
    return out;
  }

  // Theme palettes for the swatch previews (mirrors css/os.css tokens).
  var THEME_PAL = {
    "gunr":        { label: "GUNR", bg: "#0B0B0C", fg: "#EDEAE4", a: "#FF5A1F", b: "#7AA2F7", c: ["#F2665A", "#A9C77F", "#F3C468", "#7AA2F7", "#D48BD8", "#77CFC6"] },
    "tokyo-night": { label: "Tokyo Night", bg: "#1A1B26", fg: "#C0CAF5", a: "#7AA2F7", b: "#BB9AF7", c: ["#F7768E", "#9ECE6A", "#E0AF68", "#7AA2F7", "#BB9AF7", "#7DCFFF"] },
    "catppuccin":  { label: "Catppuccin Mocha", bg: "#1E1E2E", fg: "#CDD6F4", a: "#CBA6F7", b: "#89B4FA", c: ["#F38BA8", "#A6E3A1", "#F9E2AF", "#89B4FA", "#F5C2E7", "#94E2D5"] },
    "gruvbox":     { label: "Gruvbox Dark", bg: "#282828", fg: "#EBDBB2", a: "#FE8019", b: "#83A598", c: ["#FB4934", "#B8BB26", "#FABD2F", "#83A598", "#D3869B", "#8EC07C"] },
    "nord":        { label: "Nord", bg: "#2E3440", fg: "#ECEFF4", a: "#88C0D0", b: "#81A1C1", c: ["#BF616A", "#A3BE8C", "#EBCB8B", "#81A1C1", "#B48EAD", "#8FBCBB"] },
    "rose-pine":   { label: "Rosé Pine", bg: "#191724", fg: "#E0DEF4", a: "#EBBCBA", b: "#C4A7E7", c: ["#EB6F92", "#31748F", "#F6C177", "#9CCFD8", "#C4A7E7", "#EBBCBA"] },
    "matrix":      { label: "Matrix", bg: "#020A04", fg: "#B6FFB0", a: "#39FF14", b: "#00C853", c: ["#5BFF6A", "#39FF14", "#A8FF60", "#00E676", "#69F0AE", "#B9F6CA"] }
  };
  function themes() { return (GOS.themes || Object.keys(THEME_PAL)).slice(); }
  function currentTheme() { return root.getAttribute("data-theme") || "gunr"; }

  /* ---------------------------------------------------------------------------
   * Streaming text (own renderer for rich answers with inline links)
   * segs: strings or Nodes. Visible copy is aria-hidden; a single sr-only copy of
   * the final text is announced once. Reduced motion renders instantly.
   * ------------------------------------------------------------------------ */
  function streamInto(host, segs, opts) {
    opts = opts || {};
    if (!full() || opts.instant) {
      add(host, segs);
      return Promise.resolve();
    }
    var vis = h("span", { "class": "x-stream", "aria-hidden": "true" });
    var sr = h("span", { "class": "x-sr" });
    sr.textContent = segs.map(function (x) { return typeof x === "string" ? x : x.textContent; }).join("");
    host.appendChild(vis);
    var tokens = [];
    segs.forEach(function (x) {
      if (typeof x === "string") (x.match(/\s+|[^\s]+/g) || []).forEach(function (t) { tokens.push(t); });
      else {
        // links inside the aria-hidden copy stay mouse-only; the closing chips cover keyboard users
        if (x.setAttribute) x.setAttribute("tabindex", "-1");
        tokens.push(x);
      }
    });
    var caret = h("span", { "class": "x-caret" });
    vis.appendChild(caret);
    host.appendChild(sr);
    var i = 0, finished = false, resolve;
    var p = new Promise(function (r) { resolve = r; });
    function finish() {
      if (finished) return;
      finished = true;
      while (i < tokens.length) put(tokens[i++]);
      if (caret.parentNode) caret.parentNode.removeChild(caret);
      resolve();
    }
    function put(t) {
      if (typeof t === "string") vis.insertBefore(doc.createTextNode(t), caret);
      else { t.classList.add("x-in"); vis.insertBefore(t, caret); }
    }
    function tick() {
      if (finished) return;
      if (!alive(host)) { finish(); return; }
      var burst = 1 + Math.floor(Math.random() * 3);
      for (var k = 0; k < burst && i < tokens.length; k++) put(tokens[i++]);
      if (i >= tokens.length) { setTimeout(finish, 120); return; }
      setTimeout(tick, (opts.speed || 26) + Math.random() * 30);
    }
    host.addEventListener("click", finish, { once: true }); // tap to skip
    setTimeout(tick, opts.delay || 60);
    return p;
  }

  /* ---------------------------------------------------------------------------
   * Virtual filesystem built from PROFILE
   * ------------------------------------------------------------------------ */
  var cwdLocal = "~";
  function cwd(ctx) { var t = (ctx && ctx.term) || GOS.term; return (t && t.cwd) || cwdLocal; }
  function setCwd(ctx, p) {
    cwdLocal = p;
    var t = (ctx && ctx.term) || GOS.term;
    try { if (t && t.setCwd) t.setCwd(p); } catch (e) { log(e); }
  }

  function vfs() {
    var p = P();
    var rootDir = { name: "~", type: "dir", path: "~", children: [] };
    function dir(parent, name) { var d = { name: name, type: "dir", path: parent.path + "/" + name, children: [] }; parent.children.push(d); return d; }
    function file(parent, name, kind, o) {
      var f = { name: name, type: "file", kind: kind, path: parent.path + "/" + name };
      Object.keys(o || {}).forEach(function (k) { f[k] = o[k]; });
      parent.children.push(f);
      return f;
    }

    file(rootDir, "README.md", "md", { open: "welcome", body: function () {
      return [
        "# GUNR//OS",
        "",
        "Hi — this is " + fullName() + "'s corner of the internet, built as a terminal.",
        "You never have to type: tap anything highlighted or use the chips.",
        "",
        "## Start here",
        "- `contact`   — email, phone and a one-tap Save contact",
        "- `about`     — who " + firstName() + " is",
        "- `research`  — AI research browser",
        "- `experience`— career as a git graph",
        "- `skills`    — live skills dashboard",
        "- `ask`       — ask gunr-gpt anything",
        "",
        "## Keys",
        "- Ctrl+K  search every command",
        "- Tab     complete · ↑/↓ history · Ctrl+L clear"
      ].join("\n");
    } });
    file(rootDir, "about.md", "md", { open: "about", body: function () {
      var lines = ["# " + fullName(), ""];
      var role = [p.title, p.company].filter(set).join(" @ ");
      if (role) lines.push("> " + role + (set(p.companyNote) ? " (" + p.companyNote + ")" : ""));
      if (set(p.location)) lines.push("> " + p.location);
      if (set(p.tagline)) { lines.push(""); lines.push("_" + p.tagline + "_"); }
      (p.bio || []).filter(set).forEach(function (b) { lines.push(""); lines.push(clean(b)); });
      if (set(p.availability)) { lines.push(""); lines.push("**Status:** " + p.availability); }
      return lines.join("\n");
    } });

    var rd = dir(rootDir, "research");
    researchItems().forEach(function (r) {
      file(rd, r.slug + ".md", "md", { open: "research " + (r.i + 1), research: r, body: function () {
        var L = ["# " + r.title, ""];
        L.push("year:  " + (r.year || "—"));
        if (r.tags.length) L.push("tags:  " + r.tags.join(", "));
        if (r.attends.length) L.push("uses:  " + r.attends.join(", "));
        L.push("");
        L.push(r.summary ? clean(r.summary) : "_Write-up in progress — coming soon._");
        if (r.link) { L.push(""); L.push("link:  " + r.link); }
        return L.join("\n");
      } });
    });

    var ed = dir(rootDir, "experience");
    var used = {};
    experience().forEach(function (e) {
      var base = orgSlug(e.org || e.role) || "role", nm = base, k = 2;
      while (used[nm]) nm = base + "-" + k++;
      used[nm] = 1;
      file(ed, nm + ".log", "log", { open: "experience", body: function () {
        var L = ["commit " + hash7((e.org || "") + (e.role || "") + (e.start || "")) + (String(e.end).toLowerCase() === "present" && !isResearchRole(e) ? " (HEAD -> main)" : "")];
        L.push("Author: " + fullName());
        L.push("Date:   " + (set(e.start) ? e.start : "—") + " → " + (set(e.end) ? e.end : "—"));
        L.push("");
        L.push("    " + [e.role, e.org].filter(set).join(" @ "));
        if (set(e.summary)) { L.push(""); L.push("    " + clean(e.summary)); }
        var hs = (e.highlights || []).filter(set);
        if (hs.length) { L.push(""); hs.forEach(function (x) { L.push("    - " + clean(x)); }); }
        var pend = (e.highlights || []).length - hs.length;
        if (pend > 0) L.push("    # " + pend + " more highlight" + (pend > 1 ? "s" : "") + " being written");
        return L.join("\n");
      } });
    });

    file(rootDir, "skills.json", "json", { open: "skills", body: function () {
      var o = {};
      (p.skills || []).forEach(function (g) {
        var gg = {};
        (g.items || []).forEach(function (sk) { if (set(sk.name)) gg[sk.name] = Math.round((+sk.level || 0) * 100) / 100; });
        o[g.group] = gg;
      });
      return JSON.stringify(o, null, 2);
    } });
    file(rootDir, "contact.vcf", "vcf", { open: "vcard", body: function () {
      try { if (window.GUNR_VCARD) return GUNR_VCARD.build(p).replace(/\r\n/g, "\n").trim(); } catch (e) { log(e); }
      return "BEGIN:VCARD\nVERSION:3.0\nFN:" + fullName() + (set(p.email) ? "\nEMAIL:" + p.email : "") + (set(p.phone) ? "\nTEL:" + p.phone : "") + "\nEND:VCARD";
    } });

    var ld = dir(rootDir, "links");
    file(ld, "website.url", "url", { href: siteUrl(), body: function () { return "[InternetShortcut]\nURL=" + siteUrl(); } });
    liveLinks().forEach(function (l) {
      file(ld, U.slug(l.label) + ".url", "url", { href: l.url, body: function () { return "[InternetShortcut]\nURL=" + l.url; } });
    });
    file(rootDir, "card.html", "html", { href: "../card.html", body: function () {
      return "<!-- card.html — printable networking cards with a QR code -->\n<!-- run `open card.html` or `print` to open it -->";
    } });
    return rootDir;
  }

  // Normalise a user path against the cwd → "~/a/b" (or null if it escapes ~).
  function resolve(ctx, input) {
    var base = cwd(ctx);
    var p = String(input == null || input === "" ? "~" : input).trim();
    if (p === "/" || /^\/home\/(guest|gunnar)\/?$/.test(p)) p = "~";
    p = p.replace(/^\/home\/(guest|gunnar)/, "~");
    if (p.charAt(0) === "/") p = "~" + p;
    var parts = (p.charAt(0) === "~" ? p : base + "/" + p).split("/");
    var out = [];
    parts.forEach(function (x) {
      if (!x || x === ".") return;
      if (x === "~") { out = ["~"]; return; }
      if (x === "..") { if (out.length > 1) out.pop(); return; }
      out.push(x);
    });
    if (!out.length) out = ["~"];
    return out.join("/");
  }
  function lookup(tree, path) {
    var parts = path.split("/"), node = tree;
    for (var i = 1; i < parts.length; i++) {
      if (!node || node.type !== "dir") return null;
      var nm = parts[i].toLowerCase(), next = null;
      node.children.forEach(function (c) { if (c.name.toLowerCase() === nm) next = c; });
      // forgiving: "about" finds "about.md", "github" finds "github.url"
      if (!next) node.children.forEach(function (c) { if (!next && c.name.toLowerCase().replace(/\.[a-z]+$/, "") === nm) next = c; });
      node = next;
    }
    return node;
  }
  function allPaths(tree) {
    var out = [];
    (function walk(n) { out.push(n); if (n.children) n.children.forEach(walk); })(tree);
    return out;
  }
  function rel(ctx, path) {
    var c = cwd(ctx);
    if (path.indexOf(c + "/") === 0) return path.slice(c.length + 1);
    return path;
  }
  function fsComplete(kind) {
    return completer(function (argv) {
      var ctx = { term: GOS.term }, t = vfs();
      var last = String(argv && argv.length ? argv[argv.length - 1] : "");
      var abs = last.charAt(0) === "~";   // "~/re" completes absolute paths
      return allPaths(t).filter(function (n) { return n.path !== "~" && (!kind || n.type === kind); })
        .map(function (n) { return (abs ? n.path : rel(ctx, n.path)) + (n.type === "dir" ? "/" : ""); });
    });
  }
  function fileClass(n) {
    if (n.type === "dir") return "is-dir";
    return { md: "is-md", log: "is-log", json: "is-json", vcf: "is-special", url: "is-link", html: "is-special" }[n.kind] || "";
  }
  function fileIcon(n) {
    if (n.type === "dir") return "folder";
    return { md: "file", log: "git", json: "gauge", vcf: "card", url: "link", html: "printer" }[n.kind] || "file";
  }
  function nodeAction(ctx, n) {
    if (n.type === "dir") return "cd " + rel(ctx, n.path);
    if (n.kind === "md" || n.kind === "log" || n.kind === "json") return "cat " + rel(ctx, n.path);
    return "open " + rel(ctx, n.path);
  }
  function nodeActionAbs(n) { return nodeAction({ term: { cwd: "\u0000" } }, n); }
  function fsSize(n) {
    if (n.type === "dir") return 4096;
    try { return new Blob([n.body()]).size; } catch (e) { return n.body().length; }
  }
  function human(b) { return b < 1024 ? b + "B" : (b / 1024).toFixed(1) + "K"; }

  /* ---------------------------------------------------------------------------
   * bat-style file viewer
   * ------------------------------------------------------------------------ */
  function hiLine(line, kind) {
    var e = U.esc(line);
    if (kind === "md") {
      if (/^#{1,6}\s/.test(line)) return '<span class="t-h">' + e + "</span>";
      if (/^>\s/.test(line)) return '<span class="t-q">' + e + "</span>";
      e = e.replace(/`([^`]+)`/g, '<span class="t-code">`$1`</span>')
        .replace(/\*\*([^*]+)\*\*/g, '<span class="t-b">**$1**</span>')
        .replace(/(^|\s)_([^_]+)_(?=\s|$)/g, '$1<span class="t-em">_$2_</span>')
        .replace(/^(-\s)/, '<span class="t-bullet">$1</span>')
        .replace(/^([a-z]+:)(\s)/, '<span class="t-key">$1</span>$2');
      return e;
    }
    if (kind === "json") {
      return e.replace(/(&quot;[^&]*?&quot;)(\s*:)/g, '<span class="t-key">$1</span>$2')
        .replace(/:\s(\d[\d.]*)/g, ': <span class="t-num">$1</span>');
    }
    if (kind === "log") {
      if (/^commit\s/.test(line)) return e.replace(/^commit\s(\w+)/, '<span class="t-kw">commit</span> <span class="t-hash">$1</span>').replace(/\((HEAD[^)]*)\)/, '(<span class="t-ref">$1</span>)');
      if (/^(Author|Date):/.test(line)) return e.replace(/^(\w+:)/, '<span class="t-key">$1</span>');
      if (/^\s+#/.test(line)) return '<span class="t-cm">' + e + "</span>";
      if (/^\s+-\s/.test(line)) return e.replace(/-\s/, '<span class="t-bullet">- </span>');
      return e;
    }
    if (kind === "vcf" || kind === "url") return e.replace(/^([A-Z][A-Z;=,\-]*?)([:=])/, '<span class="t-key">$1</span>$2');
    if (kind === "html") return '<span class="t-cm">' + e + "</span>";
    return e;
  }
  function batView(n) {
    var lines = n.body().split("\n");
    var body = h("div", { "class": "fs-bat-body" });
    lines.forEach(function (ln, i) {
      body.appendChild(h("div", { "class": "fs-bat-row", style: { "--i": String(Math.min(i, 30)) } }, [
        h("span", { "class": "fs-bat-n", "aria-hidden": "true" }, String(i + 1)),
        h("span", { "class": "fs-bat-l", html: hiLine(ln, n.kind) || "&#8203;" })
      ]));
    });
    return h("figure", { "class": "fs-bat" }, [
      h("figcaption", { "class": "fs-bat-head" }, [
        iconEl(fileIcon(n)),
        h("span", { "class": "fs-bat-name" }, n.path.replace(/^~\//, "")),
        h("span", { "class": "fs-bat-meta" }, n.kind.toUpperCase() + " · " + lines.length + " lines · " + human(fsSize(n)))
      ]),
      body
    ]);
  }

  /* ---------------------------------------------------------------------------
   * Shared building blocks
   * ------------------------------------------------------------------------ */
  function meter(level, opts) {
    opts = opts || {};
    var m = h("span", { "class": "x-meter" + (opts.cls ? " " + opts.cls : ""), role: "meter", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(Math.round(level * 100)), "aria-label": opts.label || null });
    var fill = h("span", { "class": "x-meter-fill" });
    m.appendChild(fill);
    fill.style.setProperty("--v", String(full() ? 0 : level));
    if (full()) requestAnimationFrame(function () { requestAnimationFrame(function () { fill.style.setProperty("--v", String(level)); }); });
    return m;
  }
  var avatarOk = null;
  function avatar(size) {
    var a = h("span", { "class": "x-avatar" + (size ? " x-avatar--" + size : ""), "aria-hidden": "true" }, h("span", null, initials()));
    var src = P().assets && P().assets.avatar;
    // Probe the photo once per page: a missing file shouldn't 404 on every card.
    if (set(src) && avatarOk !== false) {
      var img = h("img", { alt: "", src: src, loading: "lazy", decoding: "async" });
      img.addEventListener("load", function () { avatarOk = true; a.classList.add("has-img"); });
      img.addEventListener("error", function () { avatarOk = false; if (img.parentNode) img.parentNode.removeChild(img); });
      a.appendChild(img);
    }
    return a;
  }
  function heading(text, sub) {
    return h("div", { "class": "x-head" }, [h("span", { "class": "x-head-t" }, text), sub ? h("span", { "class": "x-head-s" }, sub) : null]);
  }

  /* ---------------------------------------------------------------------------
   * QR box (waits for the async CDN library; text fallback)
   * ------------------------------------------------------------------------ */
  function qrBox(url, cls) {
    var box = h("div", { "class": "x-qr " + (cls || ""), role: "img", "aria-label": "QR code linking to " + host(url) });
    box.appendChild(h("span", { "class": "x-qr-wait" }, "generating…"));
    var done = false;
    function draw() {
      if (done) return;
      var Q = window.GUNR_QR, svg = null;
      try { svg = Q && Q.ready && Q.ready() ? Q.svg(url, { ecc: "M", margin: 2, dark: "#0B0B0C", light: "#F4F1EA", label: "QR code linking to " + url }) : null; } catch (e) { svg = null; }
      if (!svg) return;
      done = true;
      box.innerHTML = svg;
      box.classList.add("is-ready");
      cleanup();
    }
    function fail() {
      if (done) return;
      done = true;
      box.innerHTML = "";
      box.classList.add("is-failed");
      box.appendChild(h("span", { "class": "x-qr-fallback" }, [h("b", null, "QR offline"), h("span", null, host(url))]));
      cleanup();
    }
    function cleanup() { doc.removeEventListener("gunr:qr-ready", draw); doc.removeEventListener("gunr:qr-failed", fail); }
    doc.addEventListener("gunr:qr-ready", draw);
    doc.addEventListener("gunr:qr-failed", fail);
    draw();
    setTimeout(function () { draw(); if (!done) fail(); }, 9000);
    return box;
  }

  /* ---------------------------------------------------------------------------
   * Actions shared by several commands
   * ------------------------------------------------------------------------ */
  function saveVcard() {
    if (!window.GUNR_VCARD || !GUNR_VCARD.download) { toast("Contact file unavailable", "error"); return false; }
    try {
      GUNR_VCARD.download(P());
      toast("Saved " + (GUNR_VCARD.filename ? GUNR_VCARD.filename(P()) : "contact"), "ok");
      sfx("pop");
      return true;
    } catch (e) { log(e); toast("Could not build the contact file", "error"); return false; }
  }
  function shareSite(done) {
    var data = { title: fullName() + (set(P().handle) ? " · " + P().handle : ""), text: set(P().tagline) ? P().tagline : fullName(), url: siteUrl() };
    if (navigator.share) {
      navigator.share(data).then(function () { done && done("shared"); }, function (err) {
        if (err && err.name === "AbortError") { done && done("cancelled"); return; }
        copyText(siteUrl(), function (ok) { done && done(ok ? "copied" : "failed"); });
      });
    } else copyText(siteUrl(), function (ok) { if (ok) toast("Link copied", "ok"); done && done(ok ? "copied" : "failed"); });
  }
  function setThemeTo(name, origin) {
    try {
      if (GOS.desktop && GOS.desktop.setTheme) { GOS.desktop.setTheme(name, { origin: origin }); return; }
    } catch (e) { log(e); }
    root.setAttribute("data-theme", name);
    GOS.store.set("gos.theme", name);
    GOS.emit("theme", { name: name });
  }
  function goPlain() {
    try { if (GOS.desktop && GOS.desktop.plain) { GOS.desktop.plain(true); return; } } catch (e) { log(e); }
    root.classList.add("plain");
    var el = doc.getElementById("plain");
    if (el) { el.hidden = false; el.scrollIntoView(); }
  }

  /* ===========================================================================
   * Command registry helper
   * ======================================================================== */
  var C = [];
  function def(spec) {
    spec.aliases = spec.aliases || [];
    spec.icon = icon(spec.iconName || "term");
    spec.usage = spec.usage || spec.name;
    var run = spec.run;
    // A crash inside one command must never take the shell down.
    spec.run = function (ctx) {
      try {
        var r = run(ctx || {});
        if (r && typeof r.then === "function") return r.then(null, function (e) { log(e); fail(ctx, e); });
        return r;
      } catch (e) { log(e); fail(ctx, e); }
    };
    C.push(spec);
    return spec;
  }
  function fail(ctx, e) {
    if (ctx && ctx.out && ctx.out.error) ctx.out.error("gsh: " + (e && e.message ? e.message : "something went wrong"));
    chips(ctx, ["help", "contact"]);
  }

  /* ===========================================================================
   * START
   * ======================================================================== */
  var GROUPS = [
    { id: "start", title: "Start here", hint: "new? begin with these" },
    { id: "profile", title: "Gunnar", hint: "who, what, how to reach him" },
    { id: "system", title: "System", hint: "files, themes, settings" },
    { id: "fun", title: "Easter eggs", hint: "you found the fun drawer" }
  ];

  function helpRow(c) {
    return h("button", { type: "button", "class": "help-row", "data-cmd": c.name, title: c.usage }, [
      h("span", { "class": "help-ico", "aria-hidden": "true", html: c.icon }),
      h("span", { "class": "help-name" }, c.name),
      h("span", { "class": "help-sum" }, c.summary),
      c.aliases.length ? h("span", { "class": "help-al" }, c.aliases.slice(0, 2).join(" · ")) : null
    ]);
  }

  def({
    name: "help", aliases: ["?", "commands", "menu"], group: "start", iconName: "help",
    summary: "Every command, grouped — tap any to run it",
    usage: "help [command|fun]",
    details: "Lists the commands by group. help <command> opens its manual page; help fun reveals the easter eggs.",
    complete: completer(function () { return GOS.commands.list({ all: true }).map(function (c) { return c.name; }).concat(["fun"]); }),
    run: function (ctx) {
      var a = argsOf(ctx)[0];
      if (a && a !== "fun" && a !== "all") return showMan(ctx, a);
      var wantFun = a === "fun", wantAll = a === "all";
      var list = GOS.commands.list({ all: true });
      var wrap = h("div", { "class": "help" });
      wrap.appendChild(h("p", { "class": "help-lead" }, wantFun
        ? ["Easter eggs. None of these are useful. All of them are fun."]
        : [h("b", null, "New here? "), "You don't need to type — tap any command below. ", "Or start with ", cmd("welcome", "welcome"), ", or just ", cmd("ask a question", "ask"), "."]));
      GROUPS.forEach(function (g) {
        if (wantFun ? g.id !== "fun" : (g.id === "fun" && !wantAll)) return;
        var items = list.filter(function (c) { return (c.group || "system") === g.id && (!c.hidden || wantFun || wantAll); });
        if (!items.length) return;
        var box = h("section", { "class": "help-group help-group--" + g.id, "aria-label": g.title }, [
          h("header", { "class": "help-gh" }, [h("span", { "class": "help-gt" }, g.title), h("span", { "class": "help-gs" }, g.hint), h("span", { "class": "help-gc" }, String(items.length))])
        ]);
        var grid = h("div", { "class": "help-grid" });
        items.forEach(function (c) { grid.appendChild(helpRow(c)); });
        box.appendChild(grid);
        wrap.appendChild(box);
      });
      if (!touch()) {
        wrap.appendChild(h("p", { "class": "help-keys" }, [
          h("kbd", null, "Tab"), " complete  ", h("kbd", null, "↑"), h("kbd", null, "↓"), " history  ",
          h("kbd", null, "Ctrl"), h("kbd", null, "K"), " search  ", h("kbd", null, "Ctrl"), h("kbd", null, "L"), " clear"
        ]));
      }
      if (!wantFun) wrap.appendChild(h("p", { "class": "help-foot" }, ["Psst — there's a ", cmd("fun drawer", "help fun"), "."]));
      ctx.out.el(wrap);
      chips(ctx, wantFun ? ["matrix", "hack", "nvidia-smi", "help"] : ["welcome", "contact", "about", "research", "ask"]);
    }
  });

  function showMan(ctx, name) {
    var c = GOS.commands.get(name);
    if (!c) {
      ctx.out.error("man: no manual entry for " + name);
      var best = GOS.commands.list({ all: true }).map(function (x) { return { n: x.name, d: U.distance(name, x.name) }; }).sort(function (a, b) { return a.d - b.d; })[0];
      if (best && best.d <= 2) ctx.out.line(["did you mean ", { text: best.n, cmd: "man " + best.n }, "?"]);
      chips(ctx, ["help"]);
      return;
    }
    var title = c.name.toUpperCase() + "(1)";
    var seeAlso = GOS.commands.list().filter(function (x) { return x.group === c.group && x.name !== c.name; }).slice(0, 5);
    var page = h("article", { "class": "man", "aria-label": "Manual: " + c.name }, [
      h("header", { "class": "man-top" }, [h("span", null, title), h("span", null, "GUNR//OS manual"), h("span", null, title)]),
      h("h3", null, "NAME"), h("p", null, [h("b", null, c.name), " — " + c.summary]),
      h("h3", null, "SYNOPSIS"), h("p", { "class": "man-syn" }, cmd(c.usage, c.usage.replace(/\s*[\[<].*$/, ""))),
      h("h3", null, "DESCRIPTION"), h("p", null, c.details || c.summary),
      c.aliases.length ? h("h3", null, "ALIASES") : null,
      c.aliases.length ? h("p", { "class": "man-al" }, c.aliases.map(function (x) { return h("code", null, x); })) : null,
      seeAlso.length ? h("h3", null, "SEE ALSO") : null,
      seeAlso.length ? h("p", { "class": "man-see" }, seeAlso.map(function (x) { return cmd(x.name + "(1)", "man " + x.name); })) : null
    ]);
    ctx.out.el(page);
    chips(ctx, [c.name, "help"].concat(seeAlso.slice(0, 2).map(function (x) { return x.name; })));
  }

  def({
    name: "man", aliases: ["info"], group: "start", iconName: "book",
    summary: "Read the manual page for a command", usage: "man <command>",
    details: "Shows what a command does, its aliases and related commands.",
    complete: completer(function () { return GOS.commands.list({ all: true }).map(function (c) { return c.name; }); }),
    run: function (ctx) {
      var a = argsOf(ctx)[0];
      if (!a) { ctx.out.hint("What manual page do you want? Try man contact."); chips(ctx, ["man contact", "man research", "help"]); return; }
      showMan(ctx, a);
    }
  });

  def({
    name: "welcome", aliases: ["start", "hello", "hi", "guide"], group: "start", iconName: "spark",
    summary: "The friendly guide — start here",
    details: "A one-card guide to this site with the most useful buttons. No commands needed.",
    run: function (ctx) {
      var p = P();
      // --short: the desktop landing shows the full guide in its own window.
      if (argsOf(ctx)[0] === "--short") {
        ctx.out.el(h("p", { "class": "wc-short" }, [
          h("span", { "class": "wc-short-ico", "aria-hidden": "true", html: icon("sparkles") }),
          h("span", null, ["Welcome, guest. ", h("b", null, "Click anything highlighted"), ", ask a question in plain English, or type ", cmd("help", "help"), "."])
        ]));
        chips(ctx, ["contact", "about", "research", "experience", "ask", "help"]);
        return;
      }
      var card = h("section", { "class": "wc", "aria-label": "Welcome" }, [
        h("div", { "class": "wc-glow", "aria-hidden": "true" }),
        h("div", { "class": "wc-top" }, [
          avatar("sm"),
          h("div", null, [
            h("p", { "class": "wc-eyebrow" }, "guest@gunr · welcome"),
            h("h2", { "class": "wc-title" }, ["Hi, I'm ", h("span", { "class": "wc-name" }, firstName()), "."]),
            h("p", { "class": "wc-role" }, [p.title, p.company].filter(set).join(" · ") + (set(p.location) ? " — " + p.location : ""))
          ])
        ]),
        h("p", { "class": "wc-lead" }, "This site is a terminal — but you don't need to know commands. Tap anything highlighted, use the buttons below, or type help."),
        h("div", { "class": "wc-actions" }, [
          btn("Save contact", { primary: true, icon: "download", cmd: "vcard" }),
          btn("Contact", { icon: "card", cmd: "contact" }),
          btn("About", { icon: "user", cmd: "about" }),
          btn("Research", { icon: "folder", cmd: "research" }),
          btn("Ask gunr-gpt", { icon: "sparkles", cmd: "ask" })
        ]),
        h("p", { "class": "wc-foot" }, [
          touch() ? "Tip: the pills at the bottom are shortcuts. " : [h("kbd", null, "Ctrl"), h("kbd", null, "K"), " searches everything. "],
          "Prefer a normal page? ", cmd("Plain view", "plain"), "."
        ])
      ]);
      ctx.out.el(card);
      chips(ctx, ["contact", "about", "research", "experience", "skills", "help"]);
    }
  });

  /* ===========================================================================
   * PROFILE
   * ======================================================================== */
  var KEY_PHRASES = [
    ["Moorhead Holdings", "experience"], ["Moorhead Brothers", "experience"], ["IT Specialist", "experience"],
    ["help desk", "skills"], ["backed up", "skills"], ["researching AI", "research"],
    ["training and evaluating models", "skills"], ["building practical tools", "research"],
    ["machine learning", "research"], ["IT operations", "skills"]
  ];
  // Highlight key phrases. Only the first phrase per target command becomes a link
  // (shared `cmds` map across paragraphs); the rest are plain emphasis.
  function linkify(text, cmds) {
    var segs = [], rest = text, used = {};
    cmds = cmds || {};
    while (rest) {
      var best = null;
      KEY_PHRASES.forEach(function (kp) {
        if (used[kp[0]]) return;
        var i = rest.indexOf(kp[0]);
        if (i >= 0 && (!best || i < best.i)) best = { i: i, kp: kp };
      });
      if (!best) { segs.push(rest); break; }
      if (best.i) segs.push(rest.slice(0, best.i));
      if (cmds[best.kp[1]]) segs.push(h("em", { "class": "ab-em" }, best.kp[0]));
      else { cmds[best.kp[1]] = 1; segs.push(cmd(best.kp[0], best.kp[1], "ab-key")); }
      used[best.kp[0]] = 1;
      rest = rest.slice(best.i + best.kp[0].length);
    }
    return segs;
  }

  def({
    name: "about", aliases: ["whoami", "bio", "me"], group: "profile", iconName: "user",
    summary: "Who Gunnar is — streamed like an answer",
    details: "A short bio with links into the rest of the site, plus a playful embedding readout.",
    run: function (ctx) {
      var p = P();
      var wrap = h("section", { "class": "ab", "aria-label": "About " + fullName() });
      wrap.appendChild(h("header", { "class": "ab-head" }, [
        avatar(),
        h("div", { "class": "ab-id" }, [
          h("h2", { "class": "ab-name" }, [fullName(), set(p.handle) ? h("span", { "class": "ab-handle" }, " // " + p.handle) : null]),
          h("p", { "class": "ab-role" }, [p.title, p.company].filter(set).join(" @ ") + (set(p.companyNote) ? " (" + p.companyNote + ")" : "")),
          h("p", { "class": "ab-meta" }, [
            set(p.location) ? h("span", null, [iconEl("pin"), p.location]) : null,
            set(p.availability) ? h("span", { "class": "ab-avail" }, [h("i", { "class": "x-dot", "aria-hidden": "true" }), p.availability]) : null
          ])
        ])
      ]));
      var ans = h("div", { "class": "ab-answer" }, [h("span", { "class": "ab-badge" }, [iconEl("sparkles"), "whoami"])]);
      wrap.appendChild(ans);
      ctx.out.el(wrap);

      var paras = (p.bio || []).filter(set);
      if (set(p.tagline)) paras.unshift(p.tagline);
      var chain = Promise.resolve(), linked = {};
      paras.forEach(function (txt, i) {
        chain = chain.then(function () {
          var el = h("p", { "class": i === 0 && set(p.tagline) ? "ab-tagline" : "ab-p" });
          ans.appendChild(el);
          return streamInto(el, linkify(clean(txt), linked), { speed: 18 });
        });
      });
      return chain.then(function () {
        var tr = (p.traits || []).filter(function (t) { return set(t.name); });
        if (tr.length) {
          var box = h("div", { "class": "ab-traits", "aria-label": "Embedding readout (just for fun)" }, [h("p", { "class": "ab-traits-t" }, ["embedding readout ", h("span", null, "· just for fun")])]);
          tr.forEach(function (t) {
            box.appendChild(h("div", { "class": "ab-trait" }, [
              h("span", { "class": "ab-trait-n" }, t.name),
              meter(+t.value || 0, { label: t.name }),
              h("span", { "class": "ab-trait-v" }, (+t.value || 0).toFixed(2))
            ]));
          });
          wrap.appendChild(box);
        }
        chips(ctx, ["research", "experience", "skills", "contact", "ask"]);
      });
    }
  });

  /* ---- neofetch ----------------------------------------------------------- */
  var LOGO = [
    " ██████  ██    ██ ███    ██ ██████ ",
    "██       ██    ██ ████   ██ ██   ██",
    "██   ███ ██    ██ ██ ██  ██ ██████ ",
    "██    ██ ██    ██ ██  ██ ██ ██   ██",
    " ██████   ██████  ██   ████ ██   ██"
  ];
  def({
    name: "neofetch", aliases: ["fetch", "fastfetch", "sysinfo"], group: "profile", iconName: "term",
    summary: "System info, rice-style — the GUNR logo and the specs",
    details: "Prints the GUNR logo with Gunnar's profile as system info, plus the current theme's colours.",
    run: function (ctx) {
      var p = P(), y = earliestYear(), nowY = new Date().getFullYear();
      var logo = h("pre", { "class": "nf-logo", "aria-hidden": "true" }, LOGO.join("\n"));
      var who = "guest@gunr";
      var rows = [
        ["User", fullName()],
        ["Role", p.title],
        ["Host", set(p.company) ? p.company + (set(p.companyNote) ? " (" + p.companyNote.replace(/^formerly\s*/i, "ex-") + ")" : "") : ""],
        ["Kernel", "ai-research" + (y ? " (since " + y + ")" : "")],
        ["Uptime", y ? (nowY - y) + " years" : ""],
        ["Packages", allSkills().length + " skills (" + (p.skills || []).length + " groups)"],
        ["Shell", "gsh " + (GOS.version || "3.0")],
        ["WM", "gunr-wm (dwindle)"],
        ["Theme", (THEME_PAL[currentTheme()] || {}).label || currentTheme()],
        ["Font", "JetBrains Mono"],
        ["Location", p.location],
        ["GPU", "24 GB VRAM · local inference"]
      ].filter(function (r) { return set(r[1]); });
      var info = h("div", { "class": "nf-info" }, [
        h("p", { "class": "nf-who" }, [h("span", { "class": "nf-u" }, "guest"), "@", h("span", { "class": "nf-h" }, "gunr")]),
        h("p", { "class": "nf-sep", "aria-hidden": "true" }, new Array(who.length + 1).join("─"))
      ]);
      var dl = h("dl", { "class": "nf-rows" });
      rows.forEach(function (r, i) {
        var dd = h("dd", null, r[1]);
        if (r[0] === "Role" || r[0] === "Host") dd = h("dd", null, cmd(r[1], "experience"));
        if (r[0] === "Theme") dd = h("dd", null, cmd(r[1], "theme"));
        if (r[0] === "Packages") dd = h("dd", null, cmd(r[1], "skills"));
        if (r[0] === "Kernel") dd = h("dd", null, cmd(r[1], "research"));
        dl.appendChild(h("div", { "class": "nf-row", style: { "--i": String(i) } }, [h("dt", null, r[0]), dd]));
      });
      info.appendChild(dl);
      var sw = h("div", { "class": "nf-swatches", "aria-hidden": "true" });
      ["bg-2", "c-red", "c-green", "c-yellow", "c-blue", "c-magenta", "c-cyan", "fg"].forEach(function (c) { sw.appendChild(h("i", { style: { "--sw": "var(--" + c + ")" } })); });
      var sw2 = h("div", { "class": "nf-swatches nf-swatches--bright", "aria-hidden": "true" });
      ["fg-faint", "c-red", "c-green", "c-yellow", "c-blue", "c-magenta", "c-cyan", "fg"].forEach(function (c) { sw2.appendChild(h("i", { style: { "--sw": "var(--" + c + ")" } })); });
      info.appendChild(sw);
      info.appendChild(sw2);
      var wrap = h("section", { "class": "nf" + (full() ? " is-anim" : ""), "aria-label": "System information" }, [
        h("div", { "class": "nf-art" }, [logo, h("span", { "class": "x-sr" }, "GUNR")]), info
      ]);
      ctx.out.el(wrap);
      chips(ctx, ["about", "contact", "research", "skills", "theme", "help"]);
    }
  });

  /* ---- research: yazi-style browser ------------------------------------- */
  var uid = 0; // keeps ids unique when the same app renders more than once
  function researchApp(selected) {
    var items = researchItems(), gid = ++uid;
    var sel = clamp(selected || 0, 0, Math.max(0, items.length - 1));
    var app = h("div", { "class": "app yz", tabindex: "-1" });
    var crumbs = h("div", { "class": "yz-top" }, [
      h("span", { "class": "yz-path" }, [h("span", { "class": "yz-home" }, "~"), h("span", { "class": "yz-slash" }, "/"), h("b", null, "research"), h("span", { "class": "yz-slash" }, "/")]),
      h("span", { "class": "yz-keys", "aria-hidden": "true" }, [h("kbd", null, "j"), h("kbd", null, "k"), " move  ", h("kbd", null, "↵"), " open"])
    ]);
    var listEl = h("ul", { "class": "yz-list", role: "listbox", "aria-label": "Research projects", tabindex: "0" });
    var prev = h("div", { "class": "yz-prev", "aria-live": "polite" });
    var side = h("div", { "class": "yz-side" });
    var status = h("div", { "class": "yz-status" });
    var back = h("button", { type: "button", "class": "yz-back", "aria-label": "Back to list" }, [iconEl("back"), "research"]);

    items.forEach(function (r, i) {
      var li = h("li", { role: "option", id: "yz-opt-" + gid + "-" + i, "class": "yz-item" + (r.draft ? " is-draft" : ""), "aria-selected": "false", "data-i": String(i) }, [
        iconEl("file"),
        h("span", { "class": "yz-fl" }, [h("span", { "class": "yz-fn" }, r.slug + ".md"), h("span", { "class": "yz-fsub" }, r.title)]),
        h("span", { "class": "yz-badge" }, r.draft ? "soon" : (r.year || "md"))
      ]);
      li.addEventListener("click", function () { select(i, true); if (small()) app.classList.add("is-detail"); });
      listEl.appendChild(li);
    });
    if (!items.length) listEl.appendChild(h("li", { "class": "yz-empty" }, "No research entries yet."));

    function render() {
      var r = items[sel];
      prev.innerHTML = ""; side.innerHTML = "";
      if (!r) return;
      prev.appendChild(h("p", { "class": "yz-kicker" }, [r.slug + ".md", r.draft ? h("span", { "class": "x-pill is-soon" }, "write-up coming soon") : null]));
      prev.appendChild(h("h3", { "class": "yz-title" + (r.titled ? "" : " is-working") }, r.title));
      if (!r.titled) prev.appendChild(h("p", { "class": "yz-sub" }, "Working title from the project's tags"));
      prev.appendChild(h("dl", { "class": "yz-meta" }, [
        h("div", null, [h("dt", null, "year"), h("dd", null, r.year || h("span", { "class": "x-ph" }, "tbd"))]),
        h("div", null, [h("dt", null, "tags"), h("dd", { "class": "yz-tags" }, r.tags.map(function (t) { return h("span", { "class": "x-tag" }, t); }))])
      ]));
      prev.appendChild(r.summary
        ? h("p", { "class": "yz-sum" }, r.summary)
        : h("div", { "class": "yz-soon" }, [h("span", { "class": "yz-soon-bar", "aria-hidden": "true" }), h("span", { "class": "yz-soon-bar", "aria-hidden": "true" }), h("span", { "class": "yz-soon-bar is-short", "aria-hidden": "true" }), h("p", null, "The write-up for this one is still being drafted. Ask about it in person — or check back soon.")]));
      var acts = h("div", { "class": "yz-acts" });
      if (r.link) acts.appendChild(h("a", { "class": "x-btn is-primary", href: r.link, target: "_blank", rel: "noopener" }, [iconEl("open"), h("span", null, "Open project")]));
      acts.appendChild(btn("cat " + r.slug + ".md", { icon: "eye", cmd: "cat ~/research/" + r.slug + ".md" }));
      acts.appendChild(btn("Ask about it", { icon: "sparkles", cmd: "ask what research has he done on " + (r.tags[0] || "AI") }));
      prev.appendChild(acts);

      side.appendChild(h("p", { "class": "yz-side-t" }, "Related skills"));
      r.attends.forEach(function (name, k) {
        var sk = skillLevel(name);
        side.appendChild(h("button", { type: "button", "class": "yz-att", "data-cmd": "skills " + name, style: { "--i": String(k) } }, [
          h("span", { "class": "yz-att-n" }, name),
          sk ? meter(sk.level, { label: name }) : h("span", { "class": "x-ph" }, "—"),
          h("span", { "class": "yz-att-v" }, sk ? Math.round(sk.level * 100) + "%" : "")
        ]));
      });
      if (!r.attends.length) side.appendChild(h("p", { "class": "x-ph" }, "no linked skills"));

      status.innerHTML = "";
      add(status, [h("span", { "class": "yz-mode" }, "NOR"), h("span", { "class": "yz-st-f" }, r.slug + ".md"), h("span", { "class": "yz-st-r" }, "-rw-r--r--  " + (sel + 1) + "/" + items.length)]);
    }
    function select(i, focusList) {
      if (!items.length) return;
      sel = clamp(i, 0, items.length - 1);
      Array.prototype.forEach.call(listEl.children, function (li, k) {
        li.setAttribute("aria-selected", k === sel ? "true" : "false");
        li.classList.toggle("is-sel", k === sel);
      });
      listEl.setAttribute("aria-activedescendant", "yz-opt-" + gid + "-" + sel);
      render();
      if (focusList && !touch()) listEl.focus({ preventScroll: true });
      var li = listEl.children[sel];
      if (li && li.scrollIntoView) li.scrollIntoView({ block: "nearest" });
    }
    app.addEventListener("keydown", function (e) {
      if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      var k = e.key;
      if (k === "j" || k === "ArrowDown") { select(sel + 1); e.preventDefault(); }
      else if (k === "k" || k === "ArrowUp") { select(sel - 1); e.preventDefault(); }
      else if (k === "g" || k === "Home") { select(0); e.preventDefault(); }
      else if (k === "G" || k === "End") { select(items.length - 1); e.preventDefault(); }
      else if (k === "Enter" || k === "l" || k === "ArrowRight") {
        var r = items[sel];
        if (small()) app.classList.add("is-detail");
        else if (r && r.link) window.open(r.link, "_blank", "noopener");
        e.preventDefault();
      } else if (k === "h" || k === "ArrowLeft" || k === "Backspace") { app.classList.remove("is-detail"); }
      else if (k === "q") { closeApp("research"); }
    });
    back.addEventListener("click", function () { app.classList.remove("is-detail"); });
    add(app, [crumbs, h("div", { "class": "yz-cols" }, [
      h("div", { "class": "yz-col yz-col--list" }, listEl),
      h("div", { "class": "yz-col yz-col--prev" }, [back, prev]),
      h("div", { "class": "yz-col yz-col--side" }, side)
    ]), status]);
    select(sel);
    return app;
  }

  def({
    name: "research", aliases: ["projects", "papers", "yazi", "ranger"], group: "profile", iconName: "folder",
    summary: "Browse Gunnar's AI research in a file manager",
    usage: "research [number]",
    details: "Opens a yazi-style browser: projects on the left, a preview in the middle and the skills each one uses on the right. j/k or arrows to move, Enter to open.",
    complete: completer(function () { return researchItems().map(function (r) { return String(r.i + 1); }); }),
    run: function (ctx) {
      var items = researchItems(), a = argsOf(ctx)[0], idx = 0;
      if (a) {
        var n = parseInt(a, 10);
        if (!isNaN(n)) idx = n - 1;
        else items.forEach(function (r) { if (r.slug.indexOf(a.toLowerCase()) === 0) idx = r.i; });
      }
      var drafts = items.filter(function (r) { return r.draft; }).length;
      var list = h("div", { "class": "fs-ls fs-ls--rows" });
      items.forEach(function (r) {
        list.appendChild(h("button", { type: "button", "class": "fs-ent is-md", "data-cmd": "research " + (r.i + 1) }, [
          iconEl("file"), h("span", { "class": "fs-n" }, r.slug + ".md"),
          h("span", { "class": "fs-d" }, r.tags.join(" · ")),
          r.draft ? h("span", { "class": "x-pill is-soon" }, "soon") : h("span", { "class": "x-pill" }, r.year || "")
        ]));
      });
      ctx.out.el(h("div", { "class": "x-block" }, [
        heading("~/research", items.length + " project" + (items.length === 1 ? "" : "s") + (drafts ? " · " + drafts + " write-up" + (drafts === 1 ? "" : "s") + " coming soon" : "")),
        list
      ]));
      openApp(ctx, { id: "research", title: "research — yazi", label: "~/research", icon: icon("folder"), size: "side", body: researchApp(idx) });
      chips(ctx, ["experience", "skills", "ask what research has he done", "contact"]);
    }
  });

  /* ---- experience: git log --graph ------------------------------------- */
  function experienceGraph() {
    var ex = experience(), gid = ++uid;
    function key(e, i) {
      if (String(e.end).toLowerCase() === "present") return 1e5 + i;
      if (set(e.end) && /^\d{4}$/.test(e.end)) return +e.end * 10 + i;
      if (set(e.start) && /^\d{4}$/.test(e.start)) return +e.start * 10 + i;
      return i; // unknown dates keep their array (oldest-first) order
    }
    var entries = ex.map(function (e, i) {
      var research = isResearchRole(e);
      return { e: e, i: i, lane: research ? 1 : 0, k: key(e, i), branch: research ? "ai-research" : (orgSlug(e.org).replace(/^moorhead-/, "") || "main") };
    }).sort(function (a, b) { return b.k - a.k; });

    var lanes = entries.some(function (x) { return x.lane === 1; }) ? 2 : 1;
    var rows = [];
    entries.forEach(function (x) {
      rows.push({ type: "commit", x: x });
      if (x.e.event === "fine-tune" && x.lane === 0) {
        var older = entries.filter(function (y) { return y.lane === 0 && y.k < x.k; })[0];
        if (older) rows.push({ type: "rename", from: older, to: x });
      }
    });
    // keep each rename directly under the commit that introduced it
    if (lanes === 2) rows.push({ type: "fork" });

    // which lanes are drawn through each row
    var firstIdx = [Infinity, Infinity], lastIdx = [-1, -1];
    rows.forEach(function (r, i) {
      var l = r.type === "commit" ? r.x.lane : r.type === "rename" ? 0 : null;
      if (l == null) return;
      firstIdx[l] = Math.min(firstIdx[l], i); lastIdx[l] = Math.max(lastIdx[l], i);
    });
    var renameIdx = -1;
    rows.forEach(function (r, i) { if (r.type === "rename") renameIdx = i; });

    var LX = function (l) { return 14 + l * 22; };
    var gw = 18 + lanes * 22;
    var g = h("div", { "class": "gl" + (full() ? " is-anim" : ""), style: { "--gw": gw + "px" }, role: "list", "aria-label": "Experience as a git history, newest first" });
    var n = rows.length;

    rows.forEach(function (r, i) {
      var row = h("div", { "class": "gl-row gl-row--" + r.type, role: "listitem", style: { "--d": String((n - 1 - i) * 0.11) } });
      var gc = h("div", { "class": "gl-g", "aria-hidden": "true" });
      for (var l = 0; l < lanes; l++) {
        var nodeLane = r.type === "commit" ? r.x.lane : r.type === "rename" ? 0 : -1;
        var aliveLane = (l === 0) || (i >= firstIdx[1] && i <= rows.length - 1);
        if (r.type === "fork" && l === 1) continue; // drawn as a curve below
        if (!aliveLane) continue;
        var cls = "gl-lane gl-lane--" + l;
        if (l === 0 && renameIdx >= 0 && i > renameIdx) cls += " is-old";
        if (l === 0 && i === renameIdx) cls += " is-rename";
        if (i === firstIdx[l] && nodeLane === l) cls += " is-tip";
        if (r.type === "fork" && l === 0) cls += " is-end";
        gc.appendChild(h("i", { "class": cls, style: { "--x": LX(l) + "px" } }));
      }
      if (r.type === "commit") {
        gc.appendChild(h("i", { "class": "gl-node gl-node--" + r.x.lane + (i === firstIdx[r.x.lane] ? " is-head" : "") + (r.x.lane === 0 && renameIdx >= 0 && i > renameIdx ? " is-old" : ""), style: { "--x": LX(r.x.lane) + "px" } }));
      } else if (r.type === "rename") {
        gc.appendChild(h("i", { "class": "gl-node gl-node--rename", style: { "--x": LX(0) + "px" } }));
      } else if (r.type === "fork") {
        var svg = s("svg", { "class": "gl-fork", width: gw, height: 40, viewBox: "0 0 " + gw + " 40" }, [
          s("path", { d: "M" + LX(1) + " 0 C " + LX(1) + " 22, " + LX(0) + " 14, " + LX(0) + " 34", pathLength: "1" })
        ]);
        gc.appendChild(svg);
        gc.appendChild(h("i", { "class": "gl-node gl-node--root", style: { "--x": LX(0) + "px" } }));
      }
      row.appendChild(gc);

      var body = h("div", { "class": "gl-b" });
      if (r.type === "commit") {
        var e = r.x.e, isHead = i === firstIdx[r.x.lane];
        var present = String(e.end).toLowerCase() === "present";
        var hs = (e.highlights || []).filter(set), pending = (e.highlights || []).length - hs.length;
        var refs = [];
        if (isHead) refs.push(h("span", { "class": "gl-ref gl-ref--" + r.x.lane }, (r.x.lane === 0 && present ? "HEAD → " : "") + r.x.branch));
        if (r.x.lane === 0 && renameIdx >= 0 && i > renameIdx) refs.push(h("span", { "class": "gl-ref gl-ref--old" }, r.x.branch + " (renamed)"));
        var more = h("div", { "class": "gl-more", id: "gl-more-" + gid + "-" + r.x.i }, h("div", { "class": "gl-more-in" }, [
          set(e.summary) ? h("p", { "class": "gl-sum" }, clean(e.summary)) : null,
          hs.length ? h("ul", { "class": "gl-hl" }, hs.map(function (x) { return h("li", null, clean(x)); })) : null,
          pending > 0 ? h("p", { "class": "gl-pend" }, "+ " + pending + " highlight" + (pending > 1 ? "s" : "") + " being written") : null
        ]));
        var open = isHead && r.x.lane === 0;
        var toggle = h("button", { type: "button", "class": "gl-msg", "aria-expanded": open ? "true" : "false", "aria-controls": "gl-more-" + gid + "-" + r.x.i }, [
          h("span", { "class": "gl-hash" }, hash7((e.org || "") + (e.role || "") + (e.start || ""))),
          refs.length ? h("span", { "class": "gl-refs" }, refs) : null,
          h("span", { "class": "gl-t" }, [h("b", null, set(e.role) ? e.role : "Role"), " @ ", set(e.org) ? e.org : ""]),
          h("span", { "class": "gl-chev", "aria-hidden": "true" }, "▾")
        ]);
        if (open) row.classList.add("is-open");
        toggle.addEventListener("click", function () {
          var o = !row.classList.contains("is-open");
          row.classList.toggle("is-open", o);
          toggle.setAttribute("aria-expanded", o ? "true" : "false");
          sfx("pop");
        });
        body.appendChild(toggle);
        // Unset dates are left out rather than drawn as lone dashes.
        var endEl = present ? h("span", { "class": "gl-now" }, "present") : (set(e.end) ? h("span", null, e.end) : null);
        var dates = set(e.start) ? [h("span", null, e.start), " → ", endEl || h("span", null, "—")] : (endEl ? ["→ ", endEl] : []);
        body.appendChild(h("p", { "class": "gl-date" }, dates.concat([
          h("span", { "class": "gl-auth" }, (dates.length ? " · " : "") + fullName())
        ])));
        body.appendChild(more);
      } else if (r.type === "rename") {
        body.appendChild(h("p", { "class": "gl-op" }, [h("span", { "class": "gl-kw" }, "git branch -m"), " ", h("span", { "class": "gl-ref gl-ref--old" }, r.from.branch), " ", h("span", { "class": "gl-ref gl-ref--0" }, r.to.branch)]));
        body.appendChild(h("p", { "class": "gl-date" }, [r.from.e.org, " → ", h("b", null, r.to.e.org), set(P().companyNote) ? " · same company, new name" : ""]));
      } else {
        body.appendChild(h("p", { "class": "gl-op" }, [h("span", { "class": "gl-ref gl-ref--1" }, "ai-research"), " branched off, running in parallel"]));
      }
      row.appendChild(body);
      g.appendChild(row);
    });
    return g;
  }

  def({
    name: "experience", aliases: ["work", "git", "log", "career", "jobs", "cv"], group: "profile", iconName: "git",
    summary: "Career as a git graph — tap a commit for details",
    usage: "experience",
    details: "Renders Gunnar's experience as git log --graph: the company line (Moorhead Brothers renamed to Moorhead Holdings) and the parallel ai-research branch. Tap any commit to expand its highlights.",
    run: function (ctx) {
      var wrap = h("section", { "class": "x-block gl-wrap", "aria-label": "Experience" }, [
        h("p", { "class": "gl-cmdline" }, [h("span", { "class": "gl-kw" }, "git log"), " --graph --all --decorate"]),
        experienceGraph(),
        h("p", { "class": "gl-legend" }, [
          h("span", null, [h("i", { "class": "gl-key gl-key--0" }), "company"]),
          h("span", null, [h("i", { "class": "gl-key gl-key--old" }), "before the rename"]),
          h("span", null, [h("i", { "class": "gl-key gl-key--1" }), "ai-research"])
        ])
      ]);
      ctx.out.el(wrap);
      chips(ctx, ["skills", "research", "ls ~/experience", "contact"]);
    }
  });

  /* ---- skills: btop ------------------------------------------------------ */
  function sparkPath(vals, w, hgt) {
    var step = w / (vals.length - 1), d = "", a = "";
    vals.forEach(function (v, i) {
      var x = (i * step).toFixed(1), y = (hgt - 2 - v * (hgt - 4)).toFixed(1);
      d += (i ? " L" : "M") + x + " " + y;
    });
    a = d + " L" + w + " " + hgt + " L0 " + hgt + " Z";
    return { line: d, area: a };
  }
  function skillsApp(filter) {
    var p = P(), all = allSkills();
    var app = h("div", { "class": "app bt", tabindex: "-1" });
    var stops = [];
    var clock = h("span", { "class": "bt-clock" });
    function tickClock() { var d = new Date(); clock.textContent = ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2) + ":" + ("0" + d.getSeconds()).slice(-2); }
    tickClock();
    var avgAll = all.reduce(function (a, s2) { return a + s2.level; }, 0) / (all.length || 1);
    var y = earliestYear();
    app.appendChild(h("div", { "class": "bt-top" }, [
      h("span", { "class": "bt-logo" }, "btop"),
      h("span", null, ["skills ", h("b", null, String(all.length))]),
      h("span", null, ["groups ", h("b", null, String((p.skills || []).length))]),
      h("span", null, ["avg ", h("b", null, Math.round(avgAll * 100) + "%")]),
      y ? h("span", { "class": "bt-hide-sm" }, ["up ", h("b", null, (new Date().getFullYear() - y) + "y")]) : null,
      clock
    ]));

    var boxes = h("div", { "class": "bt-boxes" });
    (p.skills || []).forEach(function (g, gi) {
      var items = all.filter(function (x) { return x.gi === gi; });
      if (!items.length) return;
      var avg = items.reduce(function (a, x) { return a + x.level; }, 0) / items.length;
      var top = items.slice().sort(function (a, b) { return b.level - a.level; })[0];
      var vals = [];
      for (var k = 0; k < 40; k++) vals.push(clamp(avg + Math.sin(k * 0.55 + gi) * 0.08 + rand(-0.06, 0.06), 0.05, 0.98));
      var W = 200, H = 44;
      var path = sparkPath(vals, W, H);
      var line = s("path", { "class": "bt-spark-l", d: path.line });
      var area = s("path", { "class": "bt-spark-a", d: path.area });
      var svg = s("svg", { "class": "bt-spark", viewBox: "0 0 " + W + " " + H, preserveAspectRatio: "none", "aria-hidden": "true" }, [area, line]);
      var pctEl = h("b", { "class": "bt-pct" }, Math.round(avg * 100) + "%");
      var box = h("section", { "class": "bt-box", style: { "--hue": String(gi) }, "aria-label": g.group + " average " + Math.round(avg * 100) + " percent" }, [
        h("h3", { "class": "bt-box-t" }, [h("sup", null, String(gi + 1)), g.group]),
        h("div", { "class": "bt-box-row" }, [pctEl, meter(avg, { cls: "x-meter--seg", label: g.group })]),
        svg,
        h("p", { "class": "bt-box-f" }, [items.length + " skills · top ", h("button", { type: "button", "class": "bt-top-skill", "data-pick": top.name }, top.name)])
      ]);
      boxes.appendChild(box);
      if (full()) {
        stops.push(loop(box, function () {
          vals.shift();
          vals.push(clamp(avg + rand(-0.14, 0.12), 0.05, 0.98));
          var pp = sparkPath(vals, W, H);
          line.setAttribute("d", pp.line); area.setAttribute("d", pp.area);
          pctEl.textContent = Math.round(clamp(avg + rand(-0.02, 0.02), 0, 1) * 100) + "%";
        }, 900));
      }
    });
    app.appendChild(boxes);

    // proc list
    var sortKey = "level", sortDir = -1, sel = 0, rows = [];
    var input = h("input", { type: "search", "class": "bt-filter", placeholder: "type to filter…", "aria-label": "Filter skills", autocomplete: "off", spellcheck: "false", value: filter || "" });
    var tbody = h("tbody");
    var note = h("p", { "class": "bt-note", "aria-live": "polite" });
    function th(label, k, cls) {
      var b = h("button", { type: "button", "class": "bt-th" }, label);
      b.addEventListener("click", function () { if (sortKey === k) sortDir = -sortDir; else { sortKey = k; sortDir = k === "name" ? 1 : -1; } draw(); });
      return h("th", { scope: "col", "class": cls || null }, b);
    }
    var table = h("table", { "class": "bt-table" }, [
      h("thead", null, h("tr", null, [th("pid", "pid", "bt-c-pid"), th("name", "name"), th("group", "group", "bt-c-grp"), th("lvl", "level", "bt-c-lvl")])),
      tbody
    ]);
    function draw() {
      var q = input.value.trim().toLowerCase();
      rows = all.map(function (x, i) { x.pid = 1000 + i * 7; return x; }).filter(function (x) {
        return !q || (x.name + " " + x.group + " " + x.note).toLowerCase().indexOf(q) >= 0;
      }).sort(function (a, b) {
        var va = a[sortKey], vb = b[sortKey];
        return (va > vb ? 1 : va < vb ? -1 : 0) * sortDir;
      });
      sel = clamp(sel, 0, Math.max(0, rows.length - 1));
      tbody.innerHTML = "";
      rows.forEach(function (x, i) {
        var tr = h("tr", { "class": i === sel ? "is-sel" : null, tabindex: "-1" }, [
          h("td", { "class": "bt-c-pid" }, String(x.pid)),
          h("td", { "class": "bt-c-name" }, x.name),
          h("td", { "class": "bt-c-grp" }, x.group),
          h("td", { "class": "bt-c-lvl" }, [meter(x.level, { cls: "x-meter--mini", label: x.name }), h("span", null, Math.round(x.level * 100))])
        ]);
        tr.addEventListener("click", function () { sel = i; mark(); });
        tbody.appendChild(tr);
      });
      if (!rows.length) tbody.appendChild(h("tr", null, h("td", { colspan: "4", "class": "bt-none" }, "no process matches “" + input.value + "” — not on the list (yet)")));
      mark();
    }
    function mark() {
      Array.prototype.forEach.call(tbody.children, function (tr, i) { tr.classList.toggle("is-sel", i === sel); });
      var x = rows[sel];
      note.innerHTML = "";
      if (x) add(note, [h("b", null, x.name), h("span", { "class": "bt-note-g" }, " · " + x.group + " · " + Math.round(x.level * 100) + "%"), x.note ? h("span", null, " — " + x.note) : null]);
      var tr = tbody.children[sel];
      if (tr && tr.scrollIntoView) tr.scrollIntoView({ block: "nearest" });
    }
    input.addEventListener("input", function () { sel = 0; draw(); });
    app.addEventListener("click", function (e) {
      var t = e.target.closest ? e.target.closest("[data-pick]") : null;
      if (!t) return;
      input.value = t.getAttribute("data-pick"); sel = 0; draw();
    });
    app.addEventListener("keydown", function (e) {
      var k = e.key, inInput = e.target === input;
      if (k === "ArrowDown") { sel = Math.min(rows.length - 1, sel + 1); mark(); e.preventDefault(); }
      else if (k === "ArrowUp") { sel = Math.max(0, sel - 1); mark(); e.preventDefault(); }
      else if (k === "Escape" && input.value) { input.value = ""; draw(); e.preventDefault(); e.stopPropagation(); }
      else if (!inInput && k === "/") { input.focus(); e.preventDefault(); }
      else if (!inInput && k.length === 1 && /[\w&\s]/.test(k) && !e.ctrlKey && !e.metaKey && !e.altKey) {
        // type-to-filter from anywhere in the app
        input.focus(); input.value += k; sel = 0; draw(); e.preventDefault();
      }
    });
    app.appendChild(h("section", { "class": "bt-box bt-proc", "aria-label": "Skill processes" }, [
      h("h3", { "class": "bt-box-t" }, [h("sup", null, "5"), "proc"]),
      h("div", { "class": "bt-filter-row" }, [h("span", { "aria-hidden": "true" }, "filter:"), input]),
      h("div", { "class": "bt-table-wrap" }, table),
      note
    ]));
    if (full()) stops.push(loop(app, tickClock, 1000));
    draw();
    app._stop = function () { stops.forEach(function (f) { f(); }); };
    return app;
  }

  def({
    name: "skills", aliases: ["btop", "htop", "top", "stack"], group: "profile", iconName: "gauge",
    summary: "Live skills dashboard — type to filter",
    usage: "skills [filter]",
    details: "Opens a btop-style dashboard: one box per skill group with a live sparkline, and a process list of every skill sorted by level. Type anywhere to filter; select a row for the note.",
    complete: completer(function () { return allSkills().map(function (x) { return x.name.split(/[\s/&]+/)[0].toLowerCase(); }); }),
    run: function (ctx) {
      var q = restOf(ctx), all = allSkills();
      var top = all.slice().sort(function (a, b) { return b.level - a.level; });
      if (q) top = top.filter(function (x) { return (x.name + " " + x.group).toLowerCase().indexOf(q.toLowerCase()) >= 0; });
      var mini = h("div", { "class": "bt-inline" });
      top.slice(0, 5).forEach(function (x) {
        mini.appendChild(h("div", { "class": "bt-inline-row" }, [h("span", { "class": "bt-inline-n" }, x.name), meter(x.level, { cls: "x-meter--seg", label: x.name }), h("span", { "class": "bt-inline-v" }, Math.round(x.level * 100) + "%")]));
      });
      ctx.out.el(h("div", { "class": "x-block" }, [
        heading(q ? "skills matching “" + q + "”" : "top skills", (q ? top.length + " match" + (top.length === 1 ? "" : "es") : all.length + " total") + " · full dashboard opened"),
        top.length ? mini : h("p", { "class": "x-ph" }, "Nothing on the list matches that — ask gunr-gpt to be sure.")
      ]));
      var app = skillsApp(q);
      openApp(ctx, { id: "skills", title: "btop — skills", label: "~/skills.json", icon: icon("gauge"), size: "side", body: app, onClose: function () { if (app._stop) app._stop(); } });
      chips(ctx, q ? ["skills", "ask does he know " + q, "research"] : ["research", "experience", "ask does he know python", "contact"]);
    }
  });

  /* ---- contact ------------------------------------------------------------ */
  function contactRows(compact) {
    var p = P(), rows = [];
    if (set(p.email)) rows.push({ icon: "mail", label: "Email", value: clean(p.email), href: "mailto:" + clean(p.email) });
    if (set(p.phone)) rows.push({ icon: "phone", label: "Phone", value: clean(p.phone), href: telHref(p.phone) });
    rows.push({ icon: "globe", label: "Website", value: host(siteUrl()), href: siteUrl(), copy: siteUrl() });
    if (!compact) liveLinks().forEach(function (l) { rows.push({ icon: LINK_ICON[l.icon] || "link", label: l.label, value: host(l.url), href: l.url, copy: l.url }); });
    return rows;
  }
  function contactApp() {
    var p = P();
    var app = h("div", { "class": "app cc" });
    var card = h("article", { "class": "cc-card", "aria-label": "Contact card" }, [
      h("div", { "class": "cc-holo", "aria-hidden": "true" }),
      h("header", { "class": "cc-head" }, [
        avatar("lg"),
        h("div", null, [
          h("h2", { "class": "cc-name" }, fullName()),
          h("p", { "class": "cc-role" }, [p.title, p.company].filter(set).join(" · ")),
          set(p.companyNote) ? h("p", { "class": "cc-note" }, p.companyNote) : null,
          set(p.location) ? h("p", { "class": "cc-loc" }, [iconEl("pin"), p.location]) : null
        ])
      ]),
      set(p.availability) ? h("p", { "class": "cc-avail" }, [h("i", { "class": "x-dot", "aria-hidden": "true" }), p.availability]) : null
    ]);
    var list = h("ul", { "class": "cc-rows" });
    contactRows(false).forEach(function (r, i) {
      list.appendChild(h("li", { "class": "cc-row", style: { "--i": String(i) } }, [
        h("a", { "class": "cc-link", href: r.href, target: /^https?:/.test(r.href) ? "_blank" : null, rel: "noopener" }, [
          iconEl(r.icon), h("span", { "class": "cc-l" }, r.label), h("span", { "class": "cc-v" }, r.value)
        ]),
        copyBtn(r.copy || r.value, r.label)
      ]));
    });
    card.appendChild(list);

    var actions = h("div", { "class": "cc-actions" }, [
      btn("Save contact (.vcf)", { primary: true, icon: "download", cls: "cc-save", onclick: function (e) {
        var b = e.currentTarget;
        if (saveVcard()) { b.classList.add("is-done"); setTimeout(function () { b.classList.remove("is-done"); }, 1800); }
      } }),
      btn("Share", { icon: "share", onclick: function () { shareSite(function (r) { if (r === "copied") toast("Link copied", "ok"); }); } }),
      h("a", { "class": "x-btn", href: "../card.html", target: "_blank", rel: "noopener" }, [iconEl("printer"), h("span", null, "Print networking cards")])
    ]);
    var qr = h("figure", { "class": "cc-qr" }, [qrBox(siteUrl()), h("figcaption", null, ["Scan to open ", h("b", null, host(siteUrl()))])]);
    add(app, [card, h("div", { "class": "cc-side" }, [actions, qr])]);
    return app;
  }

  def({
    name: "contact", aliases: ["reach", "connect", "contacts"], group: "profile", iconName: "card",
    summary: "Email, phone, QR and one-tap Save contact",
    details: "Opens Gunnar's contact card: copyable email, phone and links, a QR code for the site, Save contact (.vcf), Share, and printable networking cards.",
    run: function (ctx) {
      var rows = contactRows(true);
      var quick = h("div", { "class": "x-block cc-inline" }, [
        h("div", { "class": "cc-inline-rows" }, rows.map(function (r) {
          return h("div", { "class": "cc-inline-row" }, [
            h("a", { "class": "cc-link", href: r.href, target: /^https?:/.test(r.href) ? "_blank" : null, rel: "noopener" }, [iconEl(r.icon), h("span", { "class": "cc-l" }, r.label), h("span", { "class": "cc-v" }, r.value)]),
            copyBtn(r.copy || r.value, r.label)
          ]);
        })),
        h("div", { "class": "cc-inline-acts" }, [
          btn("Save contact", { primary: true, icon: "download", cmd: "vcard" }),
          btn("Show QR", { icon: "qr", cmd: "qr" }),
          btn("Share", { icon: "share", cmd: "share" })
        ])
      ]);
      ctx.out.el(quick);
      openApp(ctx, { id: "contact", title: "contact — " + fullName(), label: "~/contact.vcf", icon: icon("card"), size: "side", body: contactApp() });
      chips(ctx, ["vcard", "email", "call", "socials", "about", "ask is he open to collaborating"]);
    }
  });

  def({
    name: "vcard", aliases: ["save", "vcf", "savecontact"], group: "profile", iconName: "download",
    summary: "Save Gunnar's contact to your phone (.vcf)",
    details: "Downloads a vCard. On a phone, opening it offers to add Gunnar to your contacts in one step.",
    run: function (ctx) {
      var name = window.GUNR_VCARD && GUNR_VCARD.filename ? GUNR_VCARD.filename(P()) : "contact.vcf";
      // The download must stay close to the user's tap (iOS), so save first and animate after.
      var ok = saveVcard();
      var after = function () {
        if (ok) {
          ctx.out.success("Saved " + name);
          ctx.out.hint("Open the file to add " + firstName() + " to your contacts.");
          chips(ctx, ["contact", "share", "about", "ask"]);
        } else { ctx.out.error("vcard: couldn't create the contact file here."); chips(ctx, ["contact", "email", "cat ~/contact.vcf"]); }
      };
      if (ok && full() && ctx.out.progress) return ctx.out.progress("packing " + name, 650).then(after);
      after();
    }
  });

  def({
    name: "email", aliases: ["mail", "e-mail"], group: "profile", iconName: "mail",
    summary: "Write Gunnar an email",
    details: "Opens your mail app addressed to Gunnar and shows the address with a copy button.",
    run: function (ctx) {
      var p = P();
      if (!set(p.email)) { ctx.out.error("email: not published yet"); chips(ctx, ["contact", "socials"]); return; }
      var addr = clean(p.email);
      ctx.out.el(h("div", { "class": "x-block cc-inline" }, h("div", { "class": "cc-inline-row is-big" }, [
        h("a", { "class": "cc-link", href: "mailto:" + addr }, [iconEl("mail"), h("span", { "class": "cc-v" }, addr)]),
        copyBtn(addr, "Email")
      ])));
      if (ctx.source !== "auto") { try { location.href = "mailto:" + addr; } catch (e) { log(e); } }
      ctx.out.hint("Opening your mail app… if nothing happens, copy the address above.");
      chips(ctx, ["vcard", "call", "contact"]);
    }
  });

  def({
    name: "call", aliases: ["phone", "tel", "ring"], group: "profile", iconName: "phone",
    summary: "Call Gunnar",
    details: "On a phone this starts a call; on a computer it shows the number to copy.",
    run: function (ctx) {
      var p = P();
      if (!set(p.phone)) { ctx.out.error("call: no number published"); chips(ctx, ["email", "contact"]); return; }
      var num = clean(p.phone), href = telHref(num);
      ctx.out.el(h("div", { "class": "x-block cc-inline" }, h("div", { "class": "cc-inline-row is-big" }, [
        h("a", { "class": "cc-link", href: href }, [iconEl("phone"), h("span", { "class": "cc-v" }, num)]),
        copyBtn(num, "Phone number")
      ])));
      if (touch() && href) { try { location.href = href; } catch (e) { log(e); } ctx.out.hint("Starting the call…"); }
      else ctx.out.hint("Tap the number on a phone to call, or copy it.");
      chips(ctx, ["vcard", "email", "contact"]);
    }
  });

  def({
    name: "qr", aliases: ["qrcode"], group: "profile", iconName: "qr",
    summary: "QR code for this site — pass it on",
    details: "Shows a QR code for the site so someone next to you can scan it.",
    run: function (ctx) {
      var u = siteUrl();
      ctx.out.el(h("figure", { "class": "x-block qr-card" }, [qrBox(u, "x-qr--big"), h("figcaption", null, ["Scan to open ", h("b", null, host(u))])]));
      chips(ctx, ["share", "vcard", "print", "contact"]);
    }
  });

  def({
    name: "socials", aliases: ["links", "social", "github", "linkedin"], group: "profile", iconName: "link",
    summary: "Gunnar's profiles around the web",
    details: "Lists every published profile link. Links that aren't live yet are shown as coming soon.",
    run: function (ctx) {
      var list = h("div", { "class": "x-block so" });
      var links = (P().links || []).filter(function (l) { return l && set(l.label); });
      links.forEach(function (l, i) {
        var live = set(l.url);
        list.appendChild(live
          ? h("a", { "class": "so-row", href: l.url, target: "_blank", rel: "noopener", style: { "--i": String(i) } }, [iconEl(LINK_ICON[l.icon] || "link"), h("span", { "class": "so-l" }, l.label), h("span", { "class": "so-v" }, host(l.url)), iconEl("open")])
          : h("div", { "class": "so-row is-soon", style: { "--i": String(i) } }, [iconEl(LINK_ICON[l.icon] || "link"), h("span", { "class": "so-l" }, l.label), h("span", { "class": "x-pill is-soon" }, "coming soon")]));
      });
      list.appendChild(h("a", { "class": "so-row", href: siteUrl(), target: "_blank", rel: "noopener" }, [iconEl("globe"), h("span", { "class": "so-l" }, "Website"), h("span", { "class": "so-v" }, host(siteUrl())), iconEl("open")]));
      ctx.out.el(list);
      chips(ctx, ["contact", "share", "ls ~/links"]);
    }
  });

  def({
    name: "share", aliases: ["send"], group: "profile", iconName: "share",
    summary: "Share this site",
    details: "Opens your device's share sheet, or copies the link if sharing isn't available.",
    run: function (ctx) {
      return new Promise(function (resolve) {
        shareSite(function (r) {
          if (r === "shared") ctx.out.success("Shared — thanks for passing it on.");
          else if (r === "copied") ctx.out.success("Link copied: " + host(siteUrl()));
          else if (r === "cancelled") ctx.out.hint("Share cancelled.");
          else {
            // Clipboard can be blocked (no permission / not focused): still hand over the link.
            ctx.out.hint("Couldn't open the share sheet or the clipboard here — copy the link below:");
            ctx.out.line([{ text: siteUrl(), href: siteUrl() }]);
          }
          chips(ctx, ["qr", "vcard", "contact"]);
          resolve();
        });
      });
    }
  });

  /* ---- ask / gunr-gpt ---------------------------------------------------- */
  function gpt() { return GOS.gpt && GOS.gpt.answer ? GOS.gpt : null; }

  function chatApp() {
    var G = gpt();
    var app = h("div", { "class": "app chat" });
    var logEl = h("div", { "class": "chat-log", role: "log", "aria-live": "polite", "aria-label": "Conversation with gunr-gpt" });
    var sugg = h("div", { "class": "chat-sugg", "aria-label": "Suggested questions" });
    var input = h("input", { "class": "chat-in", type: "text", placeholder: "Ask about Gunnar…", "aria-label": "Your question", autocomplete: "off", enterkeyhint: "send", maxlength: "200" });
    var send = h("button", { type: "submit", "class": "chat-send", "aria-label": "Send" }, iconEl("send"));
    var form = h("form", { "class": "chat-form" }, [input, send]);
    var busy = false;

    function bubble(who, kids) {
      var b = h("div", { "class": "chat-msg chat-msg--" + who }, [
        who === "bot" ? h("span", { "class": "chat-av", "aria-hidden": "true", html: icon("sparkles") }) : null,
        h("div", { "class": "chat-bub" }, kids)
      ]);
      logEl.appendChild(b);
      logEl.scrollTop = logEl.scrollHeight;
      return b;
    }
    function ask(q) {
      q = clean(q);
      if (!q || busy) return;
      busy = true;
      input.value = "";
      bubble("me", [h("p", null, q)]);
      var typing = bubble("bot", [h("span", { "class": "chat-typing", "aria-label": "gunr-gpt is typing" }, [h("i"), h("i"), h("i")])]);
      // Look the engine up per question: it may have loaded after this window opened.
      G = gpt() || G;
      var a = G ? G.answer(q) : { text: "gunr-gpt isn't available right now — try the contact card.", cmds: ["contact"], confidence: 0 };
      setTimeout(function () {
        var bub = typing.querySelector(".chat-bub");
        bub.innerHTML = "";
        var ptxt = h("p");
        bub.appendChild(ptxt);
        streamInto(ptxt, [a.text], { speed: 14 }).then(function () {
          if (a.cmds && a.cmds.length) {
            bub.appendChild(h("div", { "class": "chat-acts" }, a.cmds.map(function (c) { return h("button", { type: "button", "class": "chip-s", "data-cmd": c }, c); })));
          }
          if (a.confidence < 0.3) bub.appendChild(h("p", { "class": "chat-conf" }, "low confidence · answers only from the profile"));
          logEl.scrollTop = logEl.scrollHeight;
          busy = false;
        });
        var keep = setInterval(function () { if (!busy || !alive(logEl)) clearInterval(keep); logEl.scrollTop = logEl.scrollHeight; }, 120);
      }, full() ? 380 + Math.random() * 300 : 0);
    }
    form.addEventListener("submit", function (e) { e.preventDefault(); ask(input.value); });
    (G ? G.suggestions : []).forEach(function (q) {
      sugg.appendChild(h("button", { type: "button", "class": "chip-s", onclick: function () { ask(q); } }, q));
    });
    bubble("bot", [h("p", null, "Hi! I'm gunr-gpt. Ask me anything about " + firstName() + " — or tap a suggestion.")]);
    add(app, [
      h("header", { "class": "chat-head" }, [
        h("span", { "class": "chat-logo", "aria-hidden": "true", html: icon("sparkles") }),
        h("div", null, [h("p", { "class": "chat-name" }, "gunr-gpt"), h("p", { "class": "chat-label" }, G ? G.label : "offline")])
      ]),
      logEl, sugg, form
    ]);
    app._focus = function () { if (!touch()) input.focus(); };
    setTimeout(app._focus, 260);
    return app;
  }

  def({
    name: "ask", aliases: ["gpt", "chat", "gunr-gpt", "ai"], group: "profile", iconName: "sparkles",
    summary: "Ask gunr-gpt anything about Gunnar",
    usage: "ask [question]",
    details: "A tiny assistant that runs entirely in your browser and answers only from Gunnar's profile — it's not a real LLM and it won't guess. With a question it answers here; without one it opens a chat window.",
    complete: completer(function () { return gpt() ? gpt().suggestions : []; }),
    run: function (ctx) {
      var q = restOf(ctx);
      var G = gpt();
      if (!q) {
        ctx.out.hint("Opening a chat with gunr-gpt…");
        openApp(ctx, { id: "gpt", title: "gunr-gpt — chat", label: "local · offline", icon: icon("sparkles"), size: "side", body: chatApp() });
        chips(ctx, (G ? G.suggestions.slice(0, 3).map(function (x) { return "ask " + x; }) : []).concat(["contact"]));
        return;
      }
      if (!G) { ctx.out.error("ask: gunr-gpt isn't loaded"); chips(ctx, ["about", "contact"]); return; }
      var a = G.answer(q);
      ctx.out.el(h("p", { "class": "gpt-q" }, [h("span", { "class": "gpt-badge", html: icon("sparkles") }), h("span", null, "gunr-gpt"), h("span", { "class": "gpt-qt" }, "“" + q + "”")]));
      // Full motion: a brief "thinking" token shimmer before the answer streams in.
      var think = null;
      if (GOS.motion && GOS.motion.full) {
        think = h("p", { "class": "gpt-think", "aria-hidden": "true" }, [h("i"), h("i"), h("i"), h("span", null, "thinking")]);
        ctx.out.el(think);
      }
      var p = new Promise(function (res) { setTimeout(res, think ? 520 : 0); }).then(function () {
        if (think && think.parentNode) think.parentNode.removeChild(think);
        return ctx.out.stream ? ctx.out.stream(a.text, { cps: 120 }) : ctx.out.text(a.text);
      });
      return Promise.resolve(p).then(function () {
        ctx.out.el(h("p", { "class": "gpt-label" }, (a.confidence < 0.3 ? "low confidence · " : "") + (G.label || "")));
        chips(ctx, (a.cmds || []).concat(["ask"]));
      });
    }
  });

  /* ===========================================================================
   * SYSTEM — filesystem
   * ======================================================================== */
  function lsGrid(ctx, dirNode, long) {
    var grid = h("div", { "class": "fs-ls" + (long ? " fs-ls--long" : "") });
    dirNode.children.forEach(function (n, i) {
      var name = n.name + (n.type === "dir" ? "/" : "");
      var kids = [iconEl(fileIcon(n)), h("span", { "class": "fs-n" }, name)];
      if (long) {
        kids.unshift(h("span", { "class": "fs-perm" }, (n.type === "dir" ? "d" : "-") + "rw-r--r--"));
        kids.push(h("span", { "class": "fs-size" }, n.type === "dir" ? String(n.children.length) + " items" : human(fsSize(n))));
        if (n.research && n.research.draft) kids.push(h("span", { "class": "x-pill is-soon" }, "soon"));
      }
      grid.appendChild(h("button", { type: "button", "class": "fs-ent " + fileClass(n), "data-cmd": nodeAction(ctx, n), style: { "--i": String(i) }, title: nodeAction(ctx, n) }, kids));
    });
    if (!dirNode.children.length) grid.appendChild(h("p", { "class": "x-ph" }, "(empty)"));
    return grid;
  }

  def({
    name: "ls", aliases: ["dir", "ll", "la"], group: "system", iconName: "list",
    summary: "List files — tap one to open it", usage: "ls [-l] [path]",
    details: "Lists the virtual filesystem built from Gunnar's profile. Folders are blue-ish, special files yellow. Tap any entry.",
    complete: fsComplete(),
    run: function (ctx) {
      var a = argsOf(ctx), long = /^(ll|la)$/.test(String(ctx.raw || "").trim().split(/\s+/)[0]);
      var target = null;
      a.forEach(function (x) { if (/^-/.test(x)) { if (/l/.test(x)) long = true; } else target = x; });
      var tree = vfs(), path = resolve(ctx, target || cwd(ctx)), n = lookup(tree, path);
      if (!n) { ctx.out.error("ls: cannot access '" + (target || path) + "': No such file or directory"); chips(ctx, ["ls ~", "tree"]); return; }
      if (n.type !== "dir") { ctx.out.el(lsGrid(ctx, { children: [n] }, true)); chips(ctx, [nodeAction(ctx, n), "ls"]); return; }
      ctx.out.el(h("div", { "class": "x-block" }, [heading(n.path, n.children.length + " entries"), lsGrid(ctx, n, long)]));
      var next = n.children.slice(0, 3).map(function (c) { return nodeAction(ctx, c); });
      chips(ctx, next.concat([long ? "ls" : "ls -l", "tree"]));
    }
  });

  def({
    name: "cd", aliases: [], group: "system", iconName: "arrow",
    summary: "Change directory", usage: "cd [path]",
    details: "Moves around the virtual filesystem and shows what's inside. cd .. goes up, cd ~ goes home.",
    complete: fsComplete("dir"),
    run: function (ctx) {
      var a = argsOf(ctx)[0] || "~";
      if (a === "-") a = "~";
      var tree = vfs(), path = resolve(ctx, a), n = lookup(tree, path);
      if (!n) { ctx.out.error("cd: no such file or directory: " + a); chips(ctx, ["ls", "tree"]); return; }
      if (n.type !== "dir") { ctx.out.error("cd: not a directory: " + a); chips(ctx, [nodeAction(ctx, n), "ls"]); return; }
      setCwd(ctx, n.path);
      ctx.out.el(lsGrid(ctx, n, false));
      chips(ctx, (n.path === "~" ? ["cat README.md", "cd research"] : ["cd ..", "ls -l"]).concat(["tree", "pwd"]));
    }
  });

  def({
    name: "pwd", aliases: [], group: "system", iconName: "pin",
    summary: "Where am I?",
    details: "Prints the current directory.",
    run: function (ctx) {
      var c = cwd(ctx);
      ctx.out.line([{ text: "/home/guest" + c.replace(/^~/, ""), cls: "fs-pwd" }, { text: "  (" + c + ")", cls: "x-ph" }]);
      chips(ctx, ["ls", "cd ~", "tree"]);
    }
  });

  def({
    name: "cat", aliases: ["bat", "less", "more", "view"], group: "system", iconName: "eye",
    summary: "Show a file", usage: "cat <file>",
    details: "Prints a file with bat-style line numbers and highlighting. Try cat about.md.",
    complete: fsComplete("file"),
    run: function (ctx) {
      var a = argsOf(ctx)[0];
      if (!a) { ctx.out.hint("cat what? Try one of these:"); chips(ctx, ["cat README.md", "cat about.md", "cat skills.json", "ls"]); return; }
      var tree = vfs(), n = lookup(tree, resolve(ctx, a));
      if (!n) { ctx.out.error("cat: " + a + ": No such file or directory"); chips(ctx, ["ls", "tree"]); return; }
      if (n.type === "dir") { ctx.out.error("cat: " + a + ": Is a directory"); chips(ctx, ["ls " + rel(ctx, n.path), "cd " + rel(ctx, n.path)]); return; }
      ctx.out.el(batView(n));
      var next = n.open ? [n.open] : [];
      if (n.kind === "vcf") next = ["vcard"];
      if (n.kind === "url" || n.kind === "html") next = ["open " + rel(ctx, n.path)];
      chips(ctx, next.concat(["ls", "contact"]));
    }
  });

  def({
    name: "open", aliases: ["xdg-open"], group: "system", iconName: "open",
    summary: "Open a file the right way", usage: "open <file>",
    details: "Markdown opens its app, contact.vcf saves the contact, .url files open the link, card.html opens the printable cards.",
    complete: fsComplete("file"),
    run: function (ctx) {
      var a = argsOf(ctx)[0];
      if (!a) { ctx.out.hint("open what?"); chips(ctx, ["open contact.vcf", "open card.html", "ls"]); return; }
      var tree = vfs(), n = lookup(tree, resolve(ctx, a));
      if (!n) { ctx.out.error("open: " + a + ": No such file"); chips(ctx, ["ls", "tree"]); return; }
      if (n.type === "dir") { setCwd(ctx, n.path); ctx.out.el(lsGrid(ctx, n, false)); chips(ctx, ["cd ..", "tree"]); return; }
      if (n.kind === "vcf") {
        if (saveVcard()) ctx.out.success("Saved contact.vcf — open it to add " + firstName() + " to your contacts.");
        else ctx.out.error("open: couldn't create the contact file");
        chips(ctx, ["contact", "share"]); return;
      }
      if (n.kind === "url" || n.kind === "html") {
        var w = null;
        try { w = window.open(n.href, "_blank", "noopener"); } catch (e) { w = null; }
        ctx.out.line(["→ opening ", n.kind === "html" ? { text: "card.html", href: n.href } : { text: host(n.href), href: n.href }]);
        if (!w) ctx.out.hint("If a pop-up blocker stopped it, tap the link above.");
        chips(ctx, ["socials", "contact", "ls ~/links"]);
        return;
      }
      // md/log/json: show it, and point to the richer app
      ctx.out.el(batView(n));
      chips(ctx, [n.open || "help", "ls"]);
    }
  });

  def({
    name: "tree", aliases: [], group: "system", iconName: "tree",
    summary: "The whole filesystem at a glance", usage: "tree [path]",
    details: "Draws the virtual filesystem as a tree. Every entry is clickable.",
    complete: fsComplete("dir"),
    run: function (ctx) {
      var tree = vfs(), start = lookup(tree, resolve(ctx, argsOf(ctx)[0] || cwd(ctx))) || tree;
      var pre = h("div", { "class": "fs-tree", role: "tree", "aria-label": "File tree" });
      var dirs = 0, files = 0, i = 0;
      pre.appendChild(h("div", { "class": "fs-tree-row is-root" }, cmd(start.path, "cd " + start.path, "fs-n is-dir")));
      (function walk(node, prefix) {
        (node.children || []).forEach(function (c, k) {
          var last = k === node.children.length - 1;
          if (c.type === "dir") dirs++; else files++;
          pre.appendChild(h("div", { "class": "fs-tree-row", role: "treeitem", style: { "--i": String(i++) } }, [
            h("span", { "class": "fs-tree-g", "aria-hidden": "true" }, prefix + (last ? "└── " : "├── ")),
            cmd(c.name + (c.type === "dir" ? "/" : ""), nodeActionAbs(c), "fs-n " + fileClass(c)),
            c.research && c.research.draft ? h("span", { "class": "x-pill is-soon" }, "soon") : null
          ]));
          if (c.type === "dir") walk(c, prefix + (last ? "    " : "│   "));
        });
      })(start, "");
      pre.appendChild(h("p", { "class": "fs-tree-sum" }, dirs + " directories, " + files + " files"));
      ctx.out.el(pre);
      chips(ctx, ["cat README.md", "cd research", "open contact.vcf", "ls -l"]);
    }
  });

  /* ===========================================================================
   * SYSTEM — session & settings
   * ======================================================================== */
  def({
    name: "clear", aliases: ["cls", "reset"], group: "system", iconName: "eraser",
    summary: "Clear the terminal",
    details: "Clears the screen. Ctrl+L does the same.",
    run: function (ctx) {
      var t = ctx.term || GOS.term;
      if (t && t.clear) { t.clear(); return; }
      ctx.out.hint("Nothing to clear.");
    }
  });

  def({
    name: "history", aliases: ["hist"], group: "system", iconName: "history",
    summary: "Commands you've run — tap to rerun", usage: "history [-c]",
    details: "Shows your recent commands (stored only in this browser). history -c forgets them.",
    run: function (ctx) {
      var a = argsOf(ctx)[0];
      if (a === "-c" || a === "clear") {
        if (GOS.term && GOS.term.clearHistory) GOS.term.clearHistory(); else GOS.store.del("gos.history");
        GOS.emit("history:clear", {});
        ctx.out.success("History cleared (in this browser).");
        chips(ctx, ["help"]); return;
      }
      var list = [];
      try { list = GOS.term && GOS.term.history ? GOS.term.history() : (JSON.parse(GOS.store.get("gos.history") || "[]") || []); } catch (e) { list = []; }
      if (!Array.isArray(list) || !list.length) { ctx.out.hint("No history yet — everything you run shows up here."); chips(ctx, ["help", "about", "contact"]); return; }
      var box = h("ol", { "class": "x-block hist" });
      list.slice(-20).forEach(function (line, i, arr) {
        var n = list.length - arr.length + i + 1;
        box.appendChild(h("li", null, [h("span", { "class": "hist-n" }, lpad(n, 3)), cmd(String(line), String(line), "hist-c")]));
      });
      ctx.out.el(box);
      chips(ctx, ["history -c", "help"]);
    }
  });

  function themeCard(name, active) {
    var pal = THEME_PAL[name] || THEME_PAL.gunr;
    var b = h("button", {
      type: "button", "class": "th-card" + (active ? " is-active" : ""), "data-cmd": "theme " + name,
      "aria-label": "Use the " + pal.label + " theme" + (active ? " (current)" : ""), "aria-pressed": active ? "true" : "false",
      style: { "--tb": pal.bg, "--tf": pal.fg, "--ta": pal.a, "--t2": pal.b }
    }, [
      h("span", { "class": "th-prev", "aria-hidden": "true" }, [
        h("span", { "class": "th-bar" }, [h("i"), h("i"), h("i")]),
        h("span", { "class": "th-line" }, [h("span", { "class": "th-seg", style: { background: pal.a } }, "guest"), h("span", { "class": "th-seg th-seg--2", style: { background: pal.b } }, "~")]),
        h("span", { "class": "th-line" }, [h("span", { style: { color: pal.a } }, "❯ "), h("span", { style: { color: pal.c[1] } }, "neofetch"), h("span", { "class": "th-caret", style: { background: pal.a } })]),
        h("span", { "class": "th-dots" }, pal.c.map(function (c) { return h("i", { style: { background: c } }); }))
      ]),
      h("span", { "class": "th-name" }, [pal.label, active ? h("span", { "class": "th-on" }, "active") : null])
    ]);
    return b;
  }
  def({
    name: "theme", aliases: ["themes", "colors", "colorscheme", "rice"], group: "system", iconName: "palette",
    summary: "Re-skin the whole desktop", usage: "theme [name|next]",
    details: "Without a name shows a live preview of every theme. theme next cycles. Your choice is remembered.",
    complete: completer(function () { return themes().concat(["next", "random"]); }),
    run: function (ctx) {
      var a = (argsOf(ctx)[0] || "").toLowerCase(), list = themes(), cur = currentTheme();
      if (!a) {
        var grid = h("div", { "class": "th" });
        list.forEach(function (t) { grid.appendChild(themeCard(t, t === cur)); });
        ctx.out.el(h("div", { "class": "x-block" }, [heading("themes", "tap one to apply · current: " + ((THEME_PAL[cur] || {}).label || cur)), grid]));
        chips(ctx, ["theme next", "neofetch", "motion", "help"]);
        return;
      }
      if (a === "next" || a === "random") {
        var i = list.indexOf(cur);
        a = a === "next" ? list[(i + 1) % list.length] : list.filter(function (t) { return t !== cur; })[Math.floor(Math.random() * (list.length - 1))];
      }
      a = a.replace(/^tokyo$/, "tokyo-night").replace(/^rose(pine)?$|^rosepine$/, "rose-pine").replace(/^cat(ppuccin)?(-mocha)?$|^mocha$/, "catppuccin");
      if (list.indexOf(a) < 0) {
        ctx.out.error("theme: unknown theme '" + a + "'");
        ctx.out.line(["available: "].concat(list.map(function (t, k) { return { text: t + (k < list.length - 1 ? "  " : ""), cmd: "theme " + t }; })));
        chips(ctx, ["theme"]); return;
      }
      setThemeTo(a, ctx.origin);
      var pal = THEME_PAL[a] || {};
      ctx.out.el(h("p", { "class": "th-done" }, [h("span", { "class": "th-dots" }, (pal.c || []).map(function (c) { return h("i", { style: { background: c } }); })), " theme → ", h("b", null, pal.label || a)]));
      chips(ctx, ["theme next", "theme", "neofetch"].concat(a === "matrix" ? ["matrix"] : []));
    }
  });

  def({
    name: "motion", aliases: ["animations", "reduce-motion"], group: "system", iconName: "wave",
    summary: "Turn animations on or off", usage: "motion [on|off|status]",
    details: "Full motion streams text and animates windows; reduced motion shows everything instantly. Changing it reloads the page.",
    complete: completer(function () { return ["on", "off", "status"]; }),
    run: function (ctx) {
      var a = (argsOf(ctx)[0] || "status").toLowerCase(), isFull = full();
      var src = (GOS.motion && GOS.motion.source) || "system";
      if (a === "status") {
        ctx.out.el(h("div", { "class": "x-block mo" }, [
          h("p", null, ["Motion is ", h("b", { "class": isFull ? "mo-on" : "mo-off" }, isFull ? "full" : "reduced"), h("span", { "class": "x-ph" }, " · set by " + (src === "stored" ? "you" : src === "url" ? "the link" : "your system setting"))]),
          h("div", { "class": "mo-seg", role: "group", "aria-label": "Motion" }, [
            h("button", { type: "button", "class": "mo-opt" + (isFull ? " is-on" : ""), "data-cmd": "motion on", "aria-pressed": isFull ? "true" : "false" }, "Full"),
            h("button", { type: "button", "class": "mo-opt" + (!isFull ? " is-on" : ""), "data-cmd": "motion off", "aria-pressed": !isFull ? "true" : "false" }, "Reduced")
          ])
        ]));
        chips(ctx, [isFull ? "motion off" : "motion on", "theme", "sfx"]);
        return;
      }
      var want = /^(on|full|1|true|yes)$/.test(a) ? true : /^(off|reduced|reduce|0|false|no)$/.test(a) ? false : null;
      if (want === null) { ctx.out.error("motion: expected on, off or status"); chips(ctx, ["motion on", "motion off"]); return; }
      if (want === isFull) { ctx.out.hint("Motion is already " + (isFull ? "full" : "reduced") + "."); chips(ctx, ["motion", "theme"]); return; }
      ctx.out.success("Switching to " + (want ? "full" : "reduced") + " motion — reloading…");
      if (GOS.motion && GOS.motion.set) setTimeout(function () { GOS.motion.set(want); }, 350);
    }
  });

  def({
    name: "sfx", aliases: ["sound", "audio"], group: "system", iconName: "sound",
    summary: "Subtle interface sounds on/off", usage: "sfx [on|off]",
    details: "Tiny synthesised clicks and pops. Off by default; your choice is remembered.",
    complete: completer(function () { return ["on", "off", "status"]; }),
    run: function (ctx) {
      // gos.sfx is "on"/"off" (owned by desktop.js, which also syncs the bar buttons).
      var a = (argsOf(ctx)[0] || "").toLowerCase(), on = GOS.store.get("gos.sfx") === "on";
      if (!a || a === "toggle") a = on ? "off" : "on";
      if (a === "status") { ctx.out.line(["sound effects: ", { text: on ? "on" : "off", cls: on ? "mo-on" : "mo-off" }]); chips(ctx, [on ? "sfx off" : "sfx on"]); return; }
      var want = /^(on|1|true|yes)$/.test(a);
      var viaDesktop = false;
      try { if (GOS.desktop && GOS.desktop.setSfx) { GOS.desktop.setSfx(want); viaDesktop = true; } } catch (e) { log(e); }
      if (!viaDesktop) { GOS.store.set("gos.sfx", want ? "on" : "off"); GOS.emit("sfx", { on: want }); }
      if (want) sfx("pop");
      ctx.out.success("Sound effects " + (want ? "on — subtle, promise." : "off."));
      chips(ctx, [want ? "sfx off" : "sfx on", "motion", "theme"]);
    }
  });

  def({
    name: "plain", aliases: ["gui", "html", "simple", "accessible"], group: "system", iconName: "doc",
    summary: "Switch to a plain, simple page",
    details: "Shows the whole profile as a normal, accessible web page. You can come back to the terminal any time.",
    run: function (ctx) {
      ctx.out.success("Switching to plain view…");
      setTimeout(goPlain, full() ? 260 : 0);
      chips(ctx, ["contact", "help"]);
    }
  });

  def({
    name: "print", aliases: ["cards", "lp"], group: "system", iconName: "printer",
    summary: "Printable networking cards",
    details: "Opens card.html — business cards with a QR code, ready to print.",
    run: function (ctx) {
      var w = null;
      try { w = window.open("../card.html", "_blank", "noopener"); } catch (e) { w = null; }
      ctx.out.line(["→ opening ", { text: "card.html", href: "../card.html" }, " (printable cards)"]);
      if (!w) ctx.out.hint("If nothing opened, tap the link above.");
      chips(ctx, ["qr", "vcard", "contact"]);
    }
  });

  function calendar(d) {
    var y = d.getFullYear(), m = d.getMonth(), firstDow = new Date(y, m, 1).getDay(), days = new Date(y, m + 1, 0).getDate();
    var grid = h("div", { "class": "cal", "aria-hidden": "true" });
    grid.appendChild(h("p", { "class": "cal-t" }, d.toLocaleString(undefined, { month: "long", year: "numeric" })));
    var g = h("div", { "class": "cal-g" });
    ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].forEach(function (x) { g.appendChild(h("span", { "class": "cal-h" }, x)); });
    for (var i = 0; i < firstDow; i++) g.appendChild(h("span"));
    for (var k = 1; k <= days; k++) g.appendChild(h("span", { "class": k === d.getDate() ? "is-today" : null }, String(k)));
    grid.appendChild(g);
    return grid;
  }
  def({
    name: "date", aliases: ["time", "cal", "now"], group: "system", iconName: "calendar",
    summary: "Your time, Gunnar's time and a calendar",
    details: "Shows the date and time for you and in Gunnar's time zone (US Eastern), with a small calendar.",
    run: function (ctx) {
      var d = new Date(), theirs = "";
      try { theirs = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }); } catch (e) { theirs = ""; }
      var mine = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
      var info = h("div", { "class": "dt-info" }, [
        h("p", { "class": "dt-big" }, mine),
        h("p", { "class": "dt-day" }, d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })),
        theirs && set(P().location) ? h("p", { "class": "dt-them" }, [iconEl("pin"), "It's ", h("b", null, theirs), " for " + firstName() + " (" + P().location + ")"]) : null,
        h("p", { "class": "x-ph dt-iso" }, d.toISOString() + " · unix " + Math.floor(d.getTime() / 1000))
      ]);
      ctx.out.el(h("div", { "class": "x-block dt" }, [info, calendar(d)]));
      chips(ctx, ["uptime", "contact", "neofetch"]);
    }
  });

  var bootT = Date.now();
  def({
    name: "uptime", aliases: [], group: "system", iconName: "clock",
    summary: "How long things have been running",
    details: "Your session uptime, and how long Gunnar has been at AI research.",
    run: function (ctx) {
      var t = Math.floor((Date.now() - bootT) / 1000), y = earliestYear();
      var load = allSkills().slice(0, 3).map(function (x) { return x.level.toFixed(2); }).join(", ");
      ctx.out.line([
        { text: new Date().toTimeString().slice(0, 8), cls: "x-ph" }, " up ",
        { text: (t >= 60 ? Math.floor(t / 60) + "m " : "") + (t % 60) + "s", cls: "mo-on" }, " (this visit)",
        y ? ", ai-research up " : "", y ? { text: (new Date().getFullYear() - y) + " years", cls: "mo-on" } : "",
        ",  load average: " + load
      ]);
      chips(ctx, ["neofetch", "experience", "date"]);
    }
  });

  def({
    name: "echo", aliases: ["say"], group: "system", iconName: "echo",
    summary: "Print some text", usage: "echo <text>",
    details: "Prints what you type. $USER, $SHELL, $HOME and $THEME expand.",
    run: function (ctx) {
      var vars = { USER: "guest", SHELL: "/usr/bin/gsh", HOME: "/home/guest", THEME: currentTheme(), HOSTNAME: "gunr", PWD: cwd(ctx) };
      var t = restOf(ctx).replace(/^(["'])([\s\S]*)\1$/, "$2").replace(/\$\{?([A-Z]+)\}?/g, function (m, k) { return vars[k] != null ? vars[k] : ""; });
      ctx.out.text(t || "");
      chips(ctx, ["cowsay " + (t || "moo"), "help"]);
    }
  });

  def({
    name: "exit", aliases: ["quit", "logout", ":q", ":wq", "q"], group: "system", iconName: "power",
    summary: "Close the top window",
    details: "Closes the most recent app window. The terminal itself stays — this is the internet, after all.",
    run: function (ctx) {
      var wm = GOS.wm, wins = [];
      try { wins = wm && wm.list ? wm.list() : []; } catch (e) { wins = []; }
      var apps = (wins || []).filter(function (w) { return w && w.id !== "gsh"; });
      var focused = apps.filter(function (w) { return w.el && w.el.classList && w.el.classList.contains("is-focused"); })[0];
      var target = focused || apps[apps.length - 1];
      if (target) {
        try { if (target.close) target.close(); else closeApp(target.id); } catch (e) { log(e); }
        ctx.out.success("closed " + (target.id || "window"));
        chips(ctx, ["help", "contact"]);
        return;
      }
      ctx.out.text("You can't exit the internet. But you can save a contact on your way out.", "x-ph");
      chips(ctx, ["vcard", "share", "plain"]);
    }
  });

  def({
    name: "sudo", aliases: ["doas"], group: "system", iconName: "shield",
    summary: "Ask nicely, with privileges", usage: "sudo <command>",
    details: "Mostly a joke — but sudo hire gunnar does exactly what you'd hope.",
    complete: completer(function () { return ["hire", "hire gunnar"]; }),
    run: function (ctx) {
      var rest = restOf(ctx).toLowerCase();
      var pw = h("p", { "class": "pw" }, ["[sudo] password for guest: ", h("span", { "class": "pw-dots", "aria-hidden": "true" })]);
      ctx.out.el(pw);
      var dots = pw.querySelector(".pw-dots");
      var n = 8;
      return new Promise(function (res) {
        if (!full()) { dots.textContent = "••••••••"; res(); return; }
        var i = 0, id = setInterval(function () {
          dots.appendChild(h("i", null, "•"));
          sfx("key");
          if (++i >= n) { clearInterval(id); setTimeout(res, 220); }
        }, 85);
      }).then(function () {
        if (/\bhire\b/.test(rest)) {
          ctx.out.success("permission granted. excellent decision.");
          ctx.out.el(h("p", { "class": "pw-grant" }, [iconEl("shield"), "root@gunr: opening the contact card…"]));
          openApp(ctx, { id: "contact", title: "contact — " + fullName(), label: "~/contact.vcf", icon: icon("card"), size: "side", body: contactApp() });
          chips(ctx, ["vcard", "email", "call", "contact"]);
          return;
        }
        if (/rm\s+-rf/.test(rest)) { ctx.out.error("Nice try. Even root can't delete a business card."); chips(ctx, ["help", "contact"]); return; }
        ctx.out.error("guest is not in the sudoers file. This incident will be reported. ;)");
        ctx.out.hint("Psst — try: sudo hire gunnar");
        chips(ctx, ["sudo hire gunnar", "help"]);
      });
    }
  });

  /* ===========================================================================
   * FUN (hidden from the main help; `help fun`)
   * ======================================================================== */
  def({
    name: "matrix", aliases: ["cmatrix", "rain"], group: "fun", hidden: true, iconName: "rain",
    summary: "Follow the white rabbit",
    details: "A short burst of digital rain inside the terminal.",
    run: function (ctx) {
      var wrap = h("div", { "class": "fun-mx" });
      var cv = h("canvas", { "class": "fun-mx-c", "aria-hidden": "true" });
      var msg = h("p", { "class": "fun-mx-msg" }, "Wake up, guest…");
      add(wrap, [cv, msg]);
      ctx.out.el(wrap);
      var css = getComputedStyle(root), green = (css.getPropertyValue("--c-green") || "").trim() || "#39FF14";
      var ctx2 = cv.getContext && cv.getContext("2d");
      var done = function () {
        wrap.classList.add("is-done");
        msg.textContent = "The Matrix has you. (There's a theme for that.)";
        chips(ctx, ["theme matrix", "hack", "help fun"]);
      };
      if (!ctx2) { done(); return; }
      var dpr = Math.min(2, window.devicePixelRatio || 1), W = Math.max(280, wrap.clientWidth || 600), H = 200, fs = 14;
      cv.width = W * dpr; cv.height = H * dpr; cv.style.height = H + "px";
      ctx2.scale(dpr, dpr);
      var cols = Math.floor(W / fs), drops = [], glyphs = "アイウエオカキクケコサシスセソタチツテトナニヌネノ0123456789GUNR<>/{}=+*";
      for (var i = 0; i < cols; i++) drops.push(full() ? Math.random() * -20 : Math.random() * (H / fs));
      ctx2.font = fs + "px 'JetBrains Mono', monospace";
      function frame(alpha) {
        ctx2.fillStyle = "rgba(0,0,0," + alpha + ")";
        ctx2.globalCompositeOperation = "destination-out";
        ctx2.fillRect(0, 0, W, H);
        ctx2.globalCompositeOperation = "source-over";
        for (var c = 0; c < cols; c++) {
          var ch = glyphs.charAt(Math.floor(Math.random() * glyphs.length));
          var y = drops[c] * fs;
          ctx2.fillStyle = Math.random() > 0.95 ? "#E9FFE6" : green;
          ctx2.fillText(ch, c * fs, y);
          if (y > H && Math.random() > 0.975) drops[c] = 0;
          drops[c] += full() ? 1 : 0;
        }
      }
      if (!full()) { for (var r = 0; r < 14; r++) { frame(0); for (var c2 = 0; c2 < cols; c2++) drops[c2] = Math.random() * (H / fs); } done(); return; }
      return new Promise(function (res) {
        var start = now(), last = 0;
        (function step(t) {
          if (!alive(wrap)) { res(); return; }
          if (t - last > 45) { frame(0.12); last = t; }
          if (now() - start < 4200) requestAnimationFrame(step);
          else { done(); res(); }
        })(0);
      });
    }
  });

  def({
    name: "nvidia-smi", aliases: ["gpu", "smi"], group: "fun", hidden: true, iconName: "gpu",
    summary: "Check on the GPU",
    details: "A (lovingly fake) nvidia-smi readout for the 24 GB card, with live utilisation.",
    run: function (ctx) {
      function span(cls, txt) { return '<span class="' + cls + '">' + txt + "</span>"; }
      var tpl = [
        "+-----------------------------------------------------------------------------+",
        "| NVIDIA-SMI 555.42       Driver Version: 555.42       CUDA Version: 12.5     |",
        "|-------------------------------+----------------------+----------------------+",
        "| GPU  Name        Persistence-M| Bus-Id        Disp.A | Volatile Uncorr. ECC |",
        "| Fan  Temp  Perf  Pwr:Usage/Cap|         Memory-Usage | GPU-Util  Compute M. |",
        "|===============================+======================+======================|",
        "|   0  GUNR-RIG 24G         On  | 00000000:01:00.0  On |                  N/A |",
        "| 42%   61C    P2   287W / 350W |  18432MiB / 24576MiB |     87%      Default |",
        "+-------------------------------+----------------------+----------------------+",
        "| Processes:                                                                  |",
        "|  GPU   PID   Type   Process name                             GPU Memory     |",
        "|    0   4211    C    python3 finetune.py --lora                 14336MiB     |",
        "|    0   1337    C    llama-server -m gunr-7b-q4.gguf             4096MiB     |",
        "+-----------------------------------------------------------------------------+"
      ].map(U.esc).join("\n")
        // live fields keep their exact width so the table never shifts
        .replace("| 42%", "| " + span("nv-fan", "42%"))
        .replace("61C", span("nv-tmp", "61C"))
        .replace("287W", span("nv-pwr", "287W"))
        .replace("18432MiB", span("nv-mem", "18432MiB"))
        .replace("87%  ", span("nv-utl", "87%") + "  ");
      var bar = h("div", { "class": "nv-bar" }, [h("span", { "class": "nv-bar-l" }, "GPU 0"), meter(0.87, { cls: "x-meter--seg nv-m", label: "GPU utilisation" }), h("span", { "class": "nv-bar-v" }, "87%")]);
      var pre = h("pre", { "class": "nv", html: tpl, role: "img", "aria-label": "GPU status table (nvidia-smi)" });
      ctx.out.el(h("div", { "class": "x-block nv-wrap" }, [bar, h("div", { "class": "x-scroll" }, pre)]));
      if (full()) {
        var k = 0, id = setInterval(function () {
          if (!alive(pre) || ++k > 14) { clearInterval(id); return; }
          var u = Math.round(rand(71, 99)), m = Math.round(rand(17400, 19800)), t = Math.round(rand(58, 71)), w = Math.round(rand(240, 338));
          var q = function (c) { return pre.querySelector("." + c); };
          q("nv-utl").textContent = lpad(u + "%", 3);
          q("nv-mem").textContent = lpad(m + "MiB", 8);
          q("nv-tmp").textContent = t + "C";
          q("nv-pwr").textContent = lpad(w + "W", 4);
          q("nv-fan").textContent = Math.round(30 + u / 3) + "%";
          var f = bar.querySelector(".x-meter-fill"); if (f) f.style.setProperty("--v", String(u / 100));
          bar.querySelector(".nv-bar-v").textContent = u + "%";
        }, 520);
      }
      chips(ctx, ["skills", "ask does he run models locally", "neofetch"]);
    }
  });

  def({
    name: "ping", aliases: [], group: "fun", hidden: true, iconName: "ping",
    summary: "Ping gunr.dev (for real, over HTTP)", usage: "ping [gunr.dev]",
    details: "Measures real round-trips to this site's server with tiny HTTP requests (browsers can't send ICMP).",
    run: function (ctx) {
      var target = (argsOf(ctx)[0] || host(siteUrl())).toLowerCase();
      var here = location.host || host(siteUrl());
      if (target !== host(siteUrl()) && target !== here && target !== "localhost") {
        ctx.out.error("ping: " + target + ": from in here, only " + host(siteUrl()) + " answers");
        chips(ctx, ["ping " + host(siteUrl()), "help fun"]); return;
      }
      var box = h("div", { "class": "x-block ping" }, h("p", { "class": "x-ph" }, "PING " + target + " — HTTP round-trip (" + (location.protocol === "file:" ? "simulated" : here) + ")"));
      ctx.out.el(box);
      var times = [];
      function once(seq) {
        var t0 = now();
        var real = location.protocol !== "file:" && window.fetch;
        var p = real ? fetch(location.origin + location.pathname + "?ping=" + seq + "-" + Date.now(), { method: "HEAD", cache: "no-store" }).then(function () { return now() - t0; }, function () { return null; }) : U.sleep(rand(12, 30)).then(function () { return now() - t0; });
        return p.then(function (ms) {
          if (ms == null) ms = rand(14, 32);
          times.push(ms);
          box.appendChild(h("p", { "class": "ping-row" }, [
            "reply from ", h("b", null, target), ": seq=" + seq + " time=", h("span", { "class": "ping-ms" }, ms.toFixed(1) + " ms"),
            h("span", { "class": "ping-bar", style: { "--w": String(clamp(ms / 120, 0.04, 1)) }, "aria-hidden": "true" })
          ]));
          return full() ? U.sleep(420) : null;
        });
      }
      var chain = Promise.resolve();
      [1, 2, 3, 4].forEach(function (i) { chain = chain.then(function () { return once(i); }); });
      return chain.then(function () {
        var min = Math.min.apply(Math, times), max = Math.max.apply(Math, times), avg = times.reduce(function (a, b) { return a + b; }, 0) / times.length;
        box.appendChild(h("p", { "class": "ping-sum" }, "4 sent, 4 received, 0% loss · min/avg/max = " + min.toFixed(1) + "/" + avg.toFixed(1) + "/" + max.toFixed(1) + " ms"));
        chips(ctx, ["uptime", "contact", "help fun"]);
      });
    }
  });

  function wrapText(t, w) {
    var words = t.split(/\s+/), lines = [], cur = "";
    words.forEach(function (x) {
      while (x.length > w) { if (cur) { lines.push(cur); cur = ""; } lines.push(x.slice(0, w)); x = x.slice(w); }
      if ((cur + " " + x).trim().length > w) { lines.push(cur); cur = x; } else cur = (cur + " " + x).trim();
    });
    if (cur) lines.push(cur);
    return lines.length ? lines : [""];
  }
  def({
    name: "cowsay", aliases: ["moo"], group: "fun", hidden: true, iconName: "cow",
    summary: "A cow says your thing", usage: "cowsay <text>",
    details: "The classic. A cow, saying whatever you type.",
    run: function (ctx) {
      var t = restOf(ctx) || "moo. tap contact to say hi to " + firstName() + ".";
      var w = Math.min(34, Math.max(8, t.length)), lines = wrapText(t, w), width = Math.max.apply(Math, lines.map(function (l) { return l.length; }));
      var out = [" " + new Array(width + 3).join("_")];
      lines.forEach(function (l, i) {
        var L = lines.length === 1 ? ["<", ">"] : i === 0 ? ["/", "\\"] : i === lines.length - 1 ? ["\\", "/"] : ["|", "|"];
        out.push(L[0] + " " + pad(l, width) + " " + L[1]);
      });
      out.push(" " + new Array(width + 3).join("-"));
      out = out.concat([
        "        \\   ^__^",
        "         \\  (oo)\\_______",
        "            (__)\\       )\\/\\",
        "                ||----w |",
        "                ||     ||"
      ]);
      ctx.out.el(h("pre", { "class": "fun-cow" }, out.join("\n")));
      chips(ctx, ["cowsay hire gunnar", "coffee", "help fun"]);
    }
  });

  def({
    name: "rm", aliases: ["rmdir", "del", "shred"], group: "fun", hidden: true, iconName: "trash",
    summary: "Delete things (you can't)", usage: "rm <file>",
    details: "The filesystem is read-only. rm -rf / gets a special answer.",
    run: function (ctx) {
      var r = restOf(ctx);
      if (/-[a-z]*r[a-z]*f|-[a-z]*f[a-z]*r/i.test(r) && /(^|\s)(\/|~|\*|\/\*)(\s|$)/.test(r + " ")) {
        var box = h("div", { "class": "x-block fun-rm" }, [
          h("p", { "class": "fun-rm-t" }, "rm: it is dangerous to operate recursively on '/'"),
          h("p", null, "Nope. This is a business card, not a server. Everything is exactly where it was."),
          h("p", { "class": "x-ph" }, "rm: use --no-preserve-root to override this failsafe (it still won't work)")
        ]);
        ctx.out.el(box);
        chips(ctx, ["sudo rm -rf /", "hack", "contact"]);
        return;
      }
      ctx.out.error("rm: cannot remove '" + (r || "") + "': Read-only file system (it's a website)");
      chips(ctx, ["ls", "help fun"]);
    }
  });

  def({
    name: "coffee", aliases: ["brew", "espresso", "tea"], group: "fun", hidden: true, iconName: "coffee",
    summary: "Brew a coffee",
    details: "Brews a virtual coffee. Fuel for late-night training runs.",
    run: function (ctx) {
      var late = (P().traits || []).filter(function (t) { return /late_night/.test(t.name || ""); })[0];
      var mug = h("pre", { "class": "fun-mug", "aria-hidden": "true" }, [
        h("span", { "class": "fun-steam" }, "   ( (\n    ) )\n"),
        " ........\n |      |]\n \\      /\n  `----'"
      ]);
      var finish = function () {
        ctx.out.el(h("div", { "class": "x-block fun-coffee" }, [mug, h("p", null, ["Coffee's ready. ", late ? h("span", { "class": "x-ph" }, "(late_night_training_runs: " + (+late.value).toFixed(2) + " — this explains a lot.)") : null])]));
        chips(ctx, ["nvidia-smi", "contact", "help fun"]);
      };
      if (full() && ctx.out.progress) return ctx.out.progress("brewing ☕", 1300).then(finish);
      finish();
    }
  });

  def({
    name: "hack", aliases: ["hacker", "hollywood", "mainframe"], group: "fun", hidden: true, iconName: "hack",
    summary: "Hack the mainframe (cinematically)",
    details: "Fake, cinematic hacker output. No mainframes were harmed.",
    run: function (ctx) {
      var box = h("div", { "class": "x-block fun-hack" });
      ctx.out.el(box);
      var steps = [
        ["[*] initialising exploit framework v13.37", 0],
        ["[*] spoofing MAC address … 4c:4f:4c:21:21:21", 0],
        ["[*] bypassing firewall", 1],
        ["[*] decrypting mainframe (AES-256, very scary)", 1],
        ["[+] enumerating /home/gunnar … found: business_card.vcf", 0],
        ["[+] escalating privileges … uid=0(root)", 0],
        ["[*] downloading the internet", 1]
      ];
      var chain = Promise.resolve();
      steps.forEach(function (st) {
        chain = chain.then(function () {
          var line = h("p", { "class": "fun-hack-l" }, st[0]);
          box.appendChild(line);
          if (!st[1]) return full() ? U.sleep(rand(140, 260)) : null;
          var bar = h("span", { "class": "fun-hack-bar" }, h("i"));
          line.appendChild(bar);
          if (!full()) { bar.firstChild.style.width = "100%"; return null; }
          return new Promise(function (res) {
            var v = 0, id = setInterval(function () {
              v = Math.min(100, v + rand(9, 24));
              bar.firstChild.style.width = v + "%";
              if (v >= 100) { clearInterval(id); setTimeout(res, 120); }
            }, 70);
          });
        });
      });
      return chain.then(function () {
        box.appendChild(h("p", { "class": "fun-hack-big" + (full() ? " is-glitch" : ""), "data-text": "ACCESS GRANTED" }, "ACCESS GRANTED"));
        return full() ? U.sleep(900) : null;
      }).then(function () {
        box.appendChild(h("p", { "class": "fun-hack-wink" }, "…just kidding. The only thing compromised here is your free time ;)"));
        chips(ctx, ["sudo hire gunnar", "matrix", "contact"]);
      });
    }
  });

  /* ---------------------------------------------------------------------------
   * Register
   * ------------------------------------------------------------------------ */
  C.forEach(function (spec) {
    try { GOS.commands.register(spec); } catch (e) { log(e); }
  });
  GOS.emit("commands:ready", { count: C.length });
})();
