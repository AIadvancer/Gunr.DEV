/* =============================================================================
 * GUNR.DEV — terminal.js
 * The GUNR//OS terminal easter egg.
 *
 * Open:  backtick (`) anywhere outside a text field, or click #term-toggle
 *        (any element with [data-term-open] works too).
 * Close: Esc, `exit`, the close button, or backtick on an empty prompt.
 *
 * All personal output is read from window.PROFILE (js/content.js).
 * Optional collaborators, used only when present:
 *   window.GUNR_JOURNEY.goto(layerKey)   layerKey: input|embedding|attention|hidden|weights|output
 *   window.GUNR_VCARD.download() / build()
 *   window.GUNR_QR.svg(text, opts)
 *   window.GUNR_TOAST(msg)  or  window.GUNR_TOAST.show(msg)
 *
 * Public API: window.GUNR_TERM = { open(), close(), toggle(), run(cmd), isOpen() }
 * Events:     document fires "gunr:themechange" { detail: { theme } } on `theme x`.
 * ========================================================================== */
(function () {
  "use strict";

  var doc = document;
  var html = doc.documentElement;
  var U = window.GUNR_UTIL || {};

  var isSet = U.isSet || function (v) {
    if (v === null || v === undefined) return false;
    var s = String(v).trim();
    return s.length > 0 && s.indexOf("[[") === -1;
  };
  var esc = U.esc || function (v) {
    if (v === null || v === undefined) return "";
    return String(v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };
  var telHref = U.telHref || function (phone) {
    if (!isSet(phone)) return "";
    var d = String(phone).replace(/[^\d+]/g, "");
    return d ? "tel:" + d : "";
  };

  var THEMES = ["signal", "lime", "cyan"];
  var THEME_ALIASES = { green: "lime", amber: "signal" }; // v1 theme names keep working
  var THEME_COLORS = { signal: "#FF5A1F", lime: "#C8F04A", cyan: "#5CE1E6" }; // fallback if --signal is unset
  var THEME_KEY = "gunr.theme"; // shared with the index.html head script, journey.js and 404.html
  var HISTORY_MAX = 50;

  var LAYERS = [
    { key: "input", n: 0, label: "INPUT", desc: "identity", aliases: ["identity", "hero", "home", "top", "start"] },
    { key: "embedding", n: 1, label: "EMBEDDING", desc: "about", aliases: ["about", "bio"] },
    { key: "attention", n: 2, label: "ATTENTION", desc: "research", aliases: ["research", "ai"] },
    { key: "hidden", n: 3, label: "HIDDEN LAYERS", desc: "experience", aliases: ["experience", "work", "career", "hidden-layers"] },
    { key: "weights", n: 4, label: "WEIGHTS", desc: "skills", aliases: ["skills", "stack"] },
    { key: "output", n: 5, label: "OUTPUT", desc: "contact", aliases: ["contact", "connect", "end"] }
  ];

  var FILES = ["about.txt", "experience.log", "skills.json", "resume.txt", "contact.vcf", "research/"];
  var CHIPS = ["help", "about", "contact", "vcard", "qr", "socials", "nvidia-smi", "sudo hire gunnar", "matrix", "exit"];

  var reduceMQ = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  var fineMQ = window.matchMedia ? window.matchMedia("(pointer: fine)") : null;
  // The ?motion=full|reduced switch (window.GUNR_MOTION, set in the page head) wins over the OS setting.
  function reduced() {
    var M = window.GUNR_MOTION;
    if (M && typeof M.full === "boolean") return !M.full;
    return !!(reduceMQ && reduceMQ.matches);
  }

  var el = {};             // DOM refs
  var openState = false;
  var greeted = false;
  var lastFocus = null;
  var hist = [];
  var hIdx = 0;
  var draft = "";
  var timers = [];
  var rain = null;         // { raf, canvas }

  /* ---------------------------------------------------------------- helpers */

  function P() { return window.PROFILE || {}; }

  function fullName() {
    var fallback = isSet(P().handle) ? String(P().handle) : "guest";
    if (U.fullName) return U.fullName(P()) || fallback;
    var n = P().name || {};
    return [n.first, n.last].filter(isSet).join(" ") || fallback;
  }

  function promptText() {
    var h = isSet(P().handle) ? String(P().handle).toLowerCase() : "gunr";
    return "guest@" + h + ":~$";
  }

  function rep(ch, n) { return n > 0 ? new Array(n + 1).join(ch) : ""; }
  function padR(s, n, cut) {
    s = String(s);
    if (s.length > n) return cut ? s.slice(0, n - 1) + "…" : s;
    return s + rep(" ", n - s.length);
  }
  function padL(s, n) { s = String(s); return rep(" ", n - s.length) + s; }
  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function rand(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
  function clamp01(x) { x = Number(x); return isNaN(x) ? 0 : Math.max(0, Math.min(1, x)); }
  function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""); }
  function stripProto(u) { return String(u).replace(/^https?:\/\//i, "").replace(/\/$/, ""); }

  function bar(level, width) {
    var on = Math.round(clamp01(level) * width);
    return rep("█", on) + rep("░", width - on);
  }

  /* Profile value as HTML: escaped, and dimmed if it is still a [[placeholder]]. */
  function v(val) {
    if (val === null || val === undefined || val === "") return "";
    if (String(val).indexOf("[[") !== -1) {
      return '<span class="term-ph" title="Placeholder: edit js/content.js">' + esc(val) + "</span>";
    }
    return esc(val);
  }

  function safeHref(u) {
    return isSet(u) && /^(https?:|mailto:|tel:)/i.test(String(u).trim());
  }

  function link(href, label) {
    if (!safeHref(href)) return esc(label);
    var ext = /^https?:/i.test(href);
    return '<a class="term-a" href="' + esc(href) + '"' +
      (ext ? ' target="_blank" rel="noopener noreferrer"' : "") + ">" + esc(label) + "</a>";
  }

  function cmdButton(cmd, label) {
    return '<button type="button" class="term-cmd" data-run="' + esc(cmd) + '">' + esc(label || cmd) + "</button>";
  }

  function later(fn, ms) {
    var id = setTimeout(function () {
      timers = timers.filter(function (t) { return t !== id; });
      fn();
    }, ms);
    timers.push(id);
  }
  function cancelTimers() {
    timers.forEach(clearTimeout);
    timers = [];
  }

  function toast(msg) {
    var T = window.GUNR_TOAST;
    try {
      if (typeof T === "function") T(msg);
      else if (T && typeof T.show === "function") T.show(msg);
    } catch (e) { /* toast is optional */ }
  }

  /* ----------------------------------------------------------------- output */

  function scrollDown() {
    if (el.screen) el.screen.scrollTop = el.screen.scrollHeight;
  }

  function line(content, cls, asHTML) {
    var d = doc.createElement("div");
    d.className = "term-l" + (cls ? " " + cls : "");
    if (asHTML) d.innerHTML = content;
    else d.textContent = content === null || content === undefined ? "" : String(content);
    el.out.appendChild(d);
    scrollDown();
    return d;
  }
  function out(text, cls) { return line(text, cls, false); }
  function outH(markup, cls) { return line(markup, cls, true); }
  function blank() { return out(""); }
  function err(text) { return out(text, "term-err"); }

  function pre(text, cls) {
    var p = doc.createElement("pre");
    p.className = "term-pre" + (cls ? " " + cls : "");
    p.textContent = text;
    el.out.appendChild(p);
    scrollDown();
    return p;
  }

  /* key/value row: fixed-width key, HTML value */
  function kv(key, valueHTML) {
    return outH('<span class="term-k">' + esc(padR(key, 10)) + "</span>" + valueHTML);
  }

  function echo(src) {
    outH('<span class="term-p" aria-hidden="true">' + esc(promptText()) + "</span> " + esc(src), "term-echo");
  }

  /* Print steps one by one (instantly under reduced motion). */
  function sequence(steps, delay, done) {
    var i = 0;
    var d = reduced() ? 0 : delay;
    (function next() {
      if (i >= steps.length) { if (done) done(); return; }
      var s = steps[i++];
      if (typeof s === "function") s(); else out(s);
      if (d) later(next, d); else next();
    })();
  }

  /* --------------------------------------------------------------- commands */

  function cmdHelp() {
    var rows = [
      ["help", "this list"],
      ["whoami", "who are you, anyway?"],
      ["about", "bio + embedding readout"],
      ["research", "AI research projects"],
      ["experience", "training log (career)"],
      ["skills", "weights, by group"],
      ["contact", "ways to reach " + (isSet(P().name && P().name.first) ? P().name.first : "me")],
      ["socials", "public profiles"],
      ["vcard", "save contact card (.vcf)"],
      ["qr", "QR code for this site"],
      ["copy <email|url>", "copy to clipboard"],
      ["goto <layer>", "jump to a layer: input … output"],
      ["theme <name>", "accent: " + THEMES.join(" | ")],
      ["clear", "clear the screen"],
      ["exit", "close the terminal (or Esc)"]
    ];
    outH('<span class="term-hl">GUNR//OS commands</span>');
    rows.forEach(function (r) {
      var name = r[0];
      var runnable = name.indexOf("<") === -1;
      var shown = runnable ? cmdButton(name) + esc(rep(" ", 18 - name.length)) : esc(padR(name, 18));
      outH("  " + shown + '<span class="term-dim">' + esc(r[1]) + "</span>");
    });
    outH('<span class="term-dim">also try: ls, cat resume.txt, nvidia-smi, neofetch, matrix, history … and sudo, carefully.</span>');
  }

  function cmdWhoami() {
    var p = P();
    outH('<span class="term-hl">guest</span> <span class="term-dim">(token: &lt;visitor&gt;, id ' + rand(1000, 50256) + ")</span>");
    out("You're a token mid-way through " + fullName() + "'s forward pass.");
    outH("host: " + esc(fullName()) + " · " + v(p.title) + (p.company ? " @ " + v(p.company) : ""));
    outH('<span class="term-dim">next: </span>' + cmdButton("about") + '<span class="term-dim"> or </span>' + cmdButton("contact"));
  }

  function cmdAbout() {
    var p = P();
    outH('<span class="term-hl">' + esc(fullName()) + "</span> — " + v(p.title) +
      (p.company ? " @ " + v(p.company) : "") +
      (p.companyNote ? ' <span class="term-dim">(' + v(p.companyNote) + ")</span>" : ""));
    if (p.tagline) outH('<span class="term-acc">' + v(p.tagline) + "</span>");
    if (isSet(p.location)) outH('<span class="term-dim">location: </span>' + esc(p.location));
    (p.bio || []).forEach(function (para) { blank(); outH(v(para)); });

    var traits = (p.traits || []).filter(function (t) { return t && t.name; });
    if (traits.length) {
      blank();
      out("embedding = [" + traits.map(function (t) { return clamp01(t.value).toFixed(2); }).join(", ") + "]", "term-acc");
      var w = traits.reduce(function (m, t) { return Math.max(m, String(t.name).length); }, 0);
      traits.forEach(function (t) {
        out("  " + bar(t.value, 12) + " " + clamp01(t.value).toFixed(2) + "  " + padR(t.name, w));
      });
    }
  }

  function cmdResearch() {
    var list = P().research || [];
    if (!list.length) { out("no research entries yet.", "term-dim"); return; }
    outH('<span class="term-hl">LAYER 02 // ATTENTION</span> <span class="term-dim">— ' + list.length + " heads</span>");
    list.forEach(function (r, i) {
      blank();
      outH('<span class="term-acc">[' + pad2(i + 1) + "]</span> " + v(r.title) +
        (r.year ? ' <span class="term-dim">' + v(r.year) + "</span>" : ""));
      if (r.summary) outH("     " + v(r.summary));
      if (r.tags && r.tags.length) {
        outH('     <span class="term-dim">' + r.tags.map(function (t) { return "#" + esc(t); }).join(" ") + "</span>");
      }
      if (r.attends && r.attends.length) {
        outH('     <span class="term-dim">attends →</span> ' + r.attends.map(esc).join(", "));
      }
      if (safeHref(r.link)) outH("     " + link(r.link, stripProto(r.link)));
    });
  }

  function cmdExperience() {
    var list = P().experience || [];
    if (!list.length) { out("no training log yet.", "term-dim"); return; }
    outH('<span class="term-hl">training_log.txt</span> <span class="term-dim">— oldest epoch first</span>');
    list.forEach(function (e, i) {
      blank();
      var loss = typeof e.loss === "number" ? '   <span class="term-dim">loss=' + e.loss.toFixed(2) + "</span>" : "";
      outH('<span class="term-acc">epoch ' + pad2(i + 1) + "</span> · " + v(e.org) + " · " + v(e.role) + loss);
      if (e.start || e.end) outH('   <span class="term-dim">' + v(e.start) + " – " + v(e.end) + "</span>");
      if (e.event === "fine-tune" && i > 0) {
        outH('   <span class="term-amber">↳ fine-tune of epoch ' + pad2(i) + ": weights carried over</span>");
      }
      if (e.summary) outH("   " + v(e.summary));
      (e.highlights || []).forEach(function (h) { outH("   - " + v(h)); });
    });
    blank();
    out("training converged · loss ↓", "term-acc");
  }

  function cmdSkills() {
    var groups = P().skills || [];
    if (!groups.length) { out("no weights loaded.", "term-dim"); return; }
    groups.forEach(function (g, gi) {
      if (gi) blank();
      outH('<span class="term-hl">## ' + esc(g.group) + "</span>");
      (g.items || []).forEach(function (s) {
        out("  " + bar(s.level, 10) + " " + clamp01(s.level).toFixed(2) + "  " + s.name);
      });
    });
  }

  /* Prints set profile links; returns how many. */
  function printLinks() {
    var n = 0;
    (P().links || []).forEach(function (l) {
      if (!l || !safeHref(l.url)) return;
      kv(String(l.label || l.icon || "link").toLowerCase(), link(l.url, stripProto(l.url)));
      n++;
    });
    return n;
  }

  function cmdContact() {
    var p = P();
    var direct = 0;
    outH('<span class="term-hl">OUTPUT // next token: "Let\'s connect"</span>');
    if (isSet(p.email)) { kv("email", link("mailto:" + p.email, p.email)); direct++; }
    var tel = telHref(p.phone);
    if (tel) { kv("phone", link(tel, p.phone)); direct++; }
    if (isSet(p.location)) kv("location", esc(p.location));
    if (safeHref(p.siteUrl)) kv("web", link(p.siteUrl, stripProto(p.siteUrl)));
    var socials = printLinks();
    if (!direct && !socials) out("contact details are not published yet.", "term-dim");
    if (isSet(p.availability)) outH('<span class="term-dim">status:</span> ' + esc(p.availability));
    outH('<span class="term-dim">more: </span>' + cmdButton("vcard") + '<span class="term-dim"> save contact · </span>' +
      cmdButton("qr") + '<span class="term-dim"> show QR</span>');
  }

  function cmdSocials() {
    if (!printLinks()) out("no public profiles listed yet.", "term-dim");
  }

  function cmdVcard() {
    var V = window.GUNR_VCARD;
    if (!V || typeof V.download !== "function") { err("vcard: module not loaded"); return; }
    try {
      var card = V.download(P());
      var name = typeof V.filename === "function" ? V.filename(P()) : "contact.vcf";
      out("> wrote " + name + (card ? " (" + card.length + " bytes)" : ""), "term-acc");
      out("open it to add " + fullName() + " to your contacts.", "term-dim");
      toast("> contact saved");
    } catch (e) {
      err("vcard: could not create the file");
    }
  }

  function cmdQr() {
    var url = P().siteUrl || window.SITE_URL;
    if (!safeHref(url)) { err("qr: siteUrl is not set in js/content.js"); return; }
    var Q = window.GUNR_QR;
    var svg = Q && typeof Q.svg === "function"
      ? Q.svg(url, { ecc: "M", margin: 4, dark: "#000", light: "#fff", label: "QR code linking to " + url })
      : null;
    if (!svg) {
      err("qr: generator offline (CDN unreachable).");
      outH("visit " + link(url, stripProto(url)) + " instead.");
      return;
    }
    var wrap = doc.createElement("div");
    wrap.className = "term-l";
    wrap.innerHTML = '<div class="term-qr">' + svg + "</div>";
    el.out.appendChild(wrap);
    outH('<span class="term-dim">scan to open </span>' + link(url, stripProto(url)));
    scrollDown();
  }

  function copyText(text, done) {
    function fallback() {
      var prev = doc.activeElement;
      var ta = doc.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.className = "term__sr";
      el.win.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = doc.execCommand("copy"); } catch (e) { ok = false; }
      el.win.removeChild(ta);
      if (prev && prev.focus && el.win.contains(prev)) prev.focus();
      done(ok);
    }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, fallback);
    } else {
      fallback();
    }
  }

  function cmdCopy(args) {
    var p = P();
    var what = (args[0] || "").toLowerCase();
    var text = what === "email" ? p.email : what === "url" || what === "site" ? p.siteUrl : null;
    if (!what) { out("usage: copy <email|url>", "term-dim"); return; }
    if (text === null) { err("copy: unknown target '" + what + "' (try email or url)"); return; }
    if (!isSet(text)) { err("copy: " + what + " is not published yet"); return; }
    copyText(String(text), function (ok) {
      if (ok) { out("> copied to clipboard", "term-acc"); toast("> copied to clipboard"); }
      else err("copy: clipboard unavailable — " + text);
    });
  }

  function findLayer(q) {
    q = String(q || "").toLowerCase().replace(/^layer\s*[-_]?\s*/, "").trim();
    if (!q) return null;
    var num = /^\d+$/.test(q) ? parseInt(q, 10) : -1;
    for (var i = 0; i < LAYERS.length; i++) {
      var L = LAYERS[i];
      if (L.key === q || L.n === num || L.aliases.indexOf(q) !== -1) return L;
    }
    return null;
  }

  function listLayers() {
    LAYERS.forEach(function (L) {
      outH("  " + cmdButton("goto " + L.key, padR(L.key, 10)) +
        '<span class="term-dim">LAYER ' + pad2(L.n) + " // " + esc(L.label) + " · " + esc(L.desc) + "</span>");
    });
  }

  function cmdGoto(args) {
    var q = args.join(" ");
    if (!q) { out("usage: goto <layer>", "term-dim"); listLayers(); return; }
    var L = findLayer(q);
    if (!L) { err("goto: no such layer '" + q + "'"); listLayers(); return; }

    var J = window.GUNR_JOURNEY;
    if (J && typeof J.goto === "function") {
      close(false);
      try { J.goto(L.key); } catch (e) { /* journey handles its own errors */ }
      return;
    }
    var target = doc.getElementById("layer-" + L.key) ||
      doc.querySelector('[data-layer="' + L.key + '"]') ||
      doc.getElementById(L.key);
    if (!target) { err("goto: layer " + L.key + " is not on this page"); return; }
    close(false);
    target.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "start" });
    if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
    try { target.focus({ preventScroll: true }); } catch (e) { target.focus(); }
  }

  function normTheme(name) {
    name = String(name || "").toLowerCase();
    return THEME_ALIASES[name] || name;
  }

  function currentTheme() {
    var t = normTheme(html.getAttribute("data-theme"));
    return THEMES.indexOf(t) !== -1 ? t : "signal";
  }

  function applyTheme(name, persist) {
    name = normTheme(name);
    if (THEMES.indexOf(name) === -1) return false;
    html.dataset.theme = name;
    if (persist) { try { localStorage.setItem(THEME_KEY, name); } catch (e) { /* storage blocked */ } }
    // Recolor the WebGL particles to match, when the scene is running.
    var scene = window.GUNR_SCENE;
    if (scene && typeof scene.setAccent === "function") {
      try {
        var accent = getComputedStyle(html).getPropertyValue("--signal").trim() || THEME_COLORS[name];
        scene.setAccent(accent);
      } catch (e) { /* scene not ready */ }
    }
    try { doc.dispatchEvent(new CustomEvent("gunr:themechange", { detail: { theme: name } })); } catch (e) { /* old browser */ }
    return true;
  }

  function cmdTheme(args) {
    var raw = (args[0] || "").toLowerCase();
    if (!raw) {
      outH("theme: " + '<span class="term-acc">' + currentTheme() + "</span> · options: " +
        THEMES.map(function (t) { return cmdButton("theme " + t, t); }).join(" "));
      return;
    }
    var name = normTheme(raw);
    if (!applyTheme(name, true)) { err("theme: unknown '" + raw + "' (" + THEMES.join(" | ") + ")"); return; }
    out("> accent set to " + name + (name !== raw ? " (" + raw + " is now " + name + ")" : ""), "term-acc");
    toast("> theme: " + name);
  }

  function cmdClear() { el.out.innerHTML = ""; }

  function cmdExit() { close(); }

  function cmdSudo(args) {
    var rest = args.join(" ").toLowerCase();
    if (!/^hire\s+(gunnar|jake|gunr|gunnar\s+patterson|me)\b/.test(rest)) {
      out("guest is not in the sudoers file. This incident will be reported.", "term-err");
      out("(hint: there is exactly one thing sudo can do here.)", "term-dim");
      return;
    }
    var traits = (P().traits || []).slice(0, 3);
    var steps = ["[sudo] password for guest: ********"];
    traits.forEach(function (t) {
      steps.push(function () {
        outH(esc(padR("checking " + t.name + " ", 34).replace(/ (?= *$)/g, ".")) +
          " " + clamp01(t.value).toFixed(2) + ' <span class="term-acc">ok</span>');
      });
    });
    steps.push(function () { out("hire gunnar: permission granted.", "term-acc"); });
    steps.push(function () { outH('&gt; highest-probability next token: <span class="term-hl">"Let\'s connect"</span>'); });
    sequence(steps, 260, function () {
      blank();
      cmdContact();
      toast("> sudo: request accepted");
    });
  }

  function cmdNvidiaSmi() {
    var d = new Date().toString().split(" ");
    var stamp = [d[0], d[1], d[2], d[4], d[3]].join(" ");
    var fan = rand(38, 56), temp = rand(58, 67), pwr = rand(262, 348), util = rand(88, 99);
    var name = "python train.py --model " + slug(fullName());
    var procs = [
      { pid: 1337, type: "C", name: name, mem: 18432 },
      { pid: 4242, type: "G", name: "gunr-os/forward-pass", mem: 1442 }
    ];
    var used = 18432 + 1442;
    var W = [31, 22, 22];
    function row3(a, b, c) { return "|" + padR(a, W[0], true) + "|" + padR(b, W[1], true) + "|" + padR(c, W[2], true) + "|"; }
    function row1(s) { return "| " + padR(s, 75, true) + " |"; }
    var full = "+" + rep("-", 77) + "+";
    var sep3 = "+" + rep("-", W[0]) + "+" + rep("-", W[1]) + "+" + rep("-", W[2]) + "+";
    var eq3 = "|" + rep("=", W[0]) + "+" + rep("=", W[1]) + "+" + rep("=", W[2]) + "|";
    var lines = [
      stamp,
      full,
      row1("NVIDIA-SMI 555.42.02     Driver Version: 555.42.02     CUDA Version: 12.5"),
      sep3,
      row3(" GPU  Name        Persistence-M", " Bus-Id        Disp.A", " Volatile Uncorr. ECC"),
      row3(" Fan  Temp  Perf  Pwr:Usage/Cap", "         Memory-Usage", " GPU-Util  Compute M."),
      eq3,
      row3("   0  GUNR TENSOR 24G      On", " 00000000:01:00.0  On", "                  N/A"),
      row3(padL(fan + "%", 4) + "   " + temp + "C    P2   " + pwr + "W / 450W",
        padL(used + "MiB / 24576MiB", 21), padL(util + "%      Default", 21)),
      sep3,
      "",
      full,
      row1("Processes:"),
      row1(" GPU    PID  Type   Process name                                GPU Memory"),
      "|" + rep("=", 77) + "|"
    ];
    procs.forEach(function (pr) {
      lines.push(row1(padL("0", 4) + "   " + padL(pr.pid, 5) + "    " + pr.type + "   " +
        padR(pr.name, 42, true) + padL(pr.mem + "MiB", 12)));
    });
    lines.push(full);
    pre(lines.join("\n"), "term-pre--wide");
    out("(simulated readout — the real rig is busy training.)", "term-dim");
  }

  function cmdNeofetch() {
    var p = P();
    var logo = ["  o---o  ", " / \\ / \\ ", "o---o---o", " \\ / \\ / ", "  o---o  ", "         ", "         ", "         "];
    var info = [
      '<span class="term-hl">' + esc(promptText().replace(/:~\$$/, "")) + "</span>",
      esc(rep("-", 12)),
      '<span class="term-acc">OS</span>: GUNR//OS v4.2',
      '<span class="term-acc">Host</span>: ' + esc(fullName()),
      '<span class="term-acc">Role</span>: ' + v(p.title) + (p.company ? " @ " + v(p.company) : ""),
      '<span class="term-acc">Kernel</span>: forward-pass (layers 0–5)',
      '<span class="term-acc">Theme</span>: ' + currentTheme(),
      '<span class="term-acc">VRAM</span>: 24576 MiB'
    ];
    info.forEach(function (row, i) {
      outH('<span class="term-acc" aria-hidden="true">' + esc(padR(logo[i] || "", 11)) + "</span>" + row);
    });
  }

  function cmdLs(args) {
    var target = (args.filter(function (a) { return a.charAt(0) !== "-"; })[0] || "").replace(/\/$/, "");
    if (target === "research") {
      var list = P().research || [];
      if (!list.length) { out("(empty)", "term-dim"); return; }
      list.forEach(function (r, i) { outH(esc("project-" + pad2(i + 1) + ".md  ") + v(r.title)); });
      return;
    }
    if (target && target !== "." && target !== "~") { err("ls: cannot access '" + target + "': No such file or directory"); return; }
    outH(FILES.map(function (f) {
      var dir = f.slice(-1) === "/";
      var cmd = dir ? "ls research" : "cat " + f;
      return cmdButton(cmd, f).replace('class="term-cmd"', 'class="term-cmd' + (dir ? " term-cmd--dir" : "") + '"');
    }).join("   "));
  }

  function cmdResume() {
    var p = P();
    outH('<span class="term-hl">' + esc(fullName().toUpperCase()) + "</span> — " + v(p.title));
    if (p.company) outH(v(p.company) + (p.companyNote ? " (" + v(p.companyNote) + ")" : ""));
    if (p.tagline) outH('<span class="term-dim">' + v(p.tagline) + "</span>");
    if (isSet(p.location)) out(p.location, "term-dim");

    var exp = (p.experience || []).slice().reverse();
    if (exp.length) {
      blank(); out("EXPERIENCE", "term-acc");
      exp.forEach(function (e) {
        outH("  " + v(e.start) + " – " + v(e.end) + "  " + v(e.role) + ", " + v(e.org));
      });
    }
    var skills = p.skills || [];
    if (skills.length) {
      blank(); out("SKILLS", "term-acc");
      skills.forEach(function (g) {
        out("  " + g.group + ": " + (g.items || []).map(function (s) { return s.name; }).join(", "));
      });
    }
    var research = p.research || [];
    if (research.length) {
      blank(); out("RESEARCH", "term-acc");
      research.forEach(function (r) {
        outH("  - " + v(r.title) + (r.year ? ' <span class="term-dim">(' + v(r.year) + ")</span>" : ""));
      });
    }
    blank(); out("CONTACT", "term-acc");
    if (isSet(p.email)) kv("  email", link("mailto:" + p.email, p.email));
    if (telHref(p.phone)) kv("  phone", link(telHref(p.phone), p.phone));
    if (safeHref(p.siteUrl)) kv("  web", link(p.siteUrl, stripProto(p.siteUrl)));
    (p.links || []).forEach(function (l) {
      if (l && safeHref(l.url)) kv("  " + String(l.label || "link").toLowerCase(), link(l.url, stripProto(l.url)));
    });
  }

  function cmdCat(args) {
    var f = (args[0] || "").replace(/^\.\//, "");
    if (!f) { out("usage: cat <file>  (try 'ls')", "term-dim"); return; }
    switch (f) {
      case "about.txt": cmdAbout(); break;
      case "experience.log": cmdExperience(); break;
      case "resume.txt": cmdResume(); break;
      case "skills.json":
        var obj = {};
        (P().skills || []).forEach(function (g) {
          obj[g.group] = {};
          (g.items || []).forEach(function (s) { obj[g.group][s.name] = clamp01(s.level); });
        });
        pre(JSON.stringify(obj, null, 2));
        break;
      case "contact.vcf":
        var V = window.GUNR_VCARD;
        if (V && typeof V.build === "function") {
          pre(V.build(P()).replace(/\r\n/g, "\n"));
          outH('<span class="term-dim">save it: </span>' + cmdButton("vcard"));
        } else {
          err("cat: contact.vcf: vcard module not loaded");
        }
        break;
      case "research":
      case "research/":
        err("cat: research/: Is a directory (try 'ls research')");
        break;
      default:
        err("cat: " + f + ": No such file or directory");
    }
  }

  function cmdRm(args) {
    var flags = args.filter(function (a) { return a.charAt(0) === "-"; }).join("");
    var targets = args.filter(function (a) { return a.charAt(0) !== "-"; });
    var nuke = /r/.test(flags) && targets.some(function (t) { return t === "/" || t === "/*" || t === "*" || t === "~"; });
    if (!nuke) { err("rm: guest has read-only access"); return; }
    var weights = slug(fullName()) + ".safetensors";
    var first = P().name && P().name.first;
    var home = "/home/" + (slug(isSet(first) ? first : (P().handle || "user")) || "user") + "/";
    glitch();
    sequence([
      "rm: descending into '/' ...",
      "removed '/usr/share/printer_drivers' (good riddance)",
      "removed '/var/log/helpdesk/tickets_from_monday'",
      function () { err("rm: cannot remove '" + home + weights + "': Device or resource busy (still training)"); },
      function () { out("nice try. filesystem restored from last night's backup.", "term-acc"); },
      function () { out("(always test your backups.)", "term-dim"); }
    ], 240);
  }

  function cmdMatrix() {
    var done = function () {
      out("wake up, guest… the matrix has you.", "term-acc");
      outH('<span class="term-dim">follow the white rabbit → </span>' + cmdButton("contact"));
    };
    if (reduced() || !el.win.getBoundingClientRect) { done(); return; }
    stopRain();

    var c = doc.createElement("canvas");
    var ctx = c.getContext && c.getContext("2d");
    if (!ctx) { done(); return; }
    c.className = "term__rain";
    c.setAttribute("aria-hidden", "true");
    var w = el.screen.offsetWidth, h = el.screen.offsetHeight;
    c.style.left = el.screen.offsetLeft + "px";
    c.style.top = el.screen.offsetTop + "px";
    c.style.width = w + "px";
    c.style.height = h + "px";
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    ctx.scale(dpr, dpr);
    el.win.appendChild(c);

    var fs = 15;
    var cols = Math.ceil(w / fs);
    var drops = [];
    for (var i = 0; i < cols; i++) drops.push(-Math.floor(Math.random() * (h / fs)));
    var glyphs = "アイウエオカキクケコサシスセソ0123456789GUNR<>/=+*";
    var color = getComputedStyle(el.root).getPropertyValue("--term-accent").trim() || "#39ff9c";
    var start = 0, lastStep = 0;
    rain = { canvas: c, raf: 0 };

    function frame(t) {
      if (!rain) return;
      if (!start) start = t;
      if (t - lastStep >= 50) {
        lastStep = t;
        ctx.fillStyle = "rgba(5,7,10,0.16)";
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = color;
        ctx.font = fs + 'px "JetBrains Mono", ui-monospace, monospace';
        for (var k = 0; k < cols; k++) {
          var y = drops[k] * fs;
          if (y > 0) ctx.fillText(glyphs.charAt(Math.floor(Math.random() * glyphs.length)), k * fs, y);
          if (y > h && Math.random() > 0.95) drops[k] = 0;
          drops[k]++;
        }
      }
      if (t - start < 2400) {
        rain.raf = requestAnimationFrame(frame);
      } else {
        c.classList.add("is-fading");
        later(function () { stopRain(); done(); }, 420);
      }
    }
    out("> entering the matrix…", "term-dim");
    rain.raf = requestAnimationFrame(frame);
  }

  function stopRain() {
    if (!rain) return;
    cancelAnimationFrame(rain.raf);
    if (rain.canvas.parentNode) rain.canvas.parentNode.removeChild(rain.canvas);
    rain = null;
  }

  function glitch() {
    if (reduced()) return;
    el.win.classList.remove("is-glitching");
    void el.win.offsetWidth; // restart the animation
    el.win.classList.add("is-glitching");
    later(function () { el.win.classList.remove("is-glitching"); }, 450);
  }

  function cmdHistory() {
    if (!hist.length) { out("(empty)", "term-dim"); return; }
    hist.forEach(function (h, i) { out(padL(i + 1, 4) + "  " + h); });
  }

  /* name -> { run(args, raw), args?() for tab completion } */
  var COMMANDS = {
    "help": { run: cmdHelp },
    "whoami": { run: cmdWhoami },
    "about": { run: cmdAbout },
    "research": { run: cmdResearch },
    "experience": { run: cmdExperience },
    "skills": { run: cmdSkills },
    "contact": { run: cmdContact },
    "socials": { run: cmdSocials },
    "vcard": { run: cmdVcard },
    "qr": { run: cmdQr },
    "copy": { run: cmdCopy, args: function () { return ["email", "url"]; } },
    "goto": { run: cmdGoto, args: function () { return LAYERS.map(function (L) { return L.key; }); } },
    "theme": { run: cmdTheme, args: function () { return THEMES.slice(); } },
    "clear": { run: cmdClear },
    "exit": { run: cmdExit },
    "sudo": { run: cmdSudo, args: function () { return ["hire gunnar"]; } },
    "nvidia-smi": { run: cmdNvidiaSmi },
    "neofetch": { run: cmdNeofetch },
    "matrix": { run: cmdMatrix },
    "ls": { run: cmdLs, args: function () { return ["research/"]; } },
    "cat": { run: cmdCat, args: function () { return FILES.filter(function (f) { return f.slice(-1) !== "/"; }); } },
    "rm": { run: cmdRm },
    "history": { run: cmdHistory },
    "echo": { run: function (args, raw) { out(raw.replace(/^\S+\s?/, "")); } },
    "date": { run: function () { out(new Date().toString()); } },
    "pwd": { run: function () { out("/home/guest"); } },
    "cd": { run: function () { out("cd: this shell moves by layer — try 'goto attention'", "term-dim"); } },
    "hire": { run: function () { err("hire: permission denied. did you mean 'sudo hire gunnar'?"); } }
  };
  COMMANDS.cv = { run: cmdResume };
  var ALIASES = { "?": "help", "man": "help", "cls": "clear", "quit": "exit", "q": "exit", "close": "exit", "dir": "ls", "type": "cat", "resume": "cv" };

  function notFound(name) {
    err("gunr: command not found: " + name);
    var near = Object.keys(COMMANDS).filter(function (c) { return c.indexOf(name.slice(0, 2)) === 0; })[0];
    outH('<span class="term-dim">type </span>' + cmdButton("help") +
      (near ? '<span class="term-dim"> — or did you mean </span>' + cmdButton(near) + '<span class="term-dim">?</span>' : ""));
  }

  /* ------------------------------------------------------------------ run */

  function interrupt() {
    if (timers.length || rain) {
      cancelTimers();
      stopRain();
      out("^C", "term-dim");
    }
  }

  function run(raw) {
    if (!el.out) build();
    var src = String(raw === undefined ? "" : raw).trim();
    interrupt();
    echo(src);
    if (!src) return;
    pushHistory(src);

    var parts = src.split(/\s+/);
    var name = parts[0].toLowerCase();
    var cmd = COMMANDS[name] || COMMANDS[ALIASES[name]];
    if (!cmd) { notFound(name); return; }
    try {
      cmd.run(parts.slice(1), src);
    } catch (e) {
      err("gunr: " + name + ": something went wrong");
      if (window.console) console.error(e);
    }
    scrollDown();
  }

  /* -------------------------------------------------------- input / history */

  function pushHistory(s) {
    if (hist[hist.length - 1] !== s) hist.push(s);
    if (hist.length > HISTORY_MAX) hist.shift();
    hIdx = hist.length;
    draft = "";
  }

  function setInput(value) {
    el.input.value = value;
    try { el.input.setSelectionRange(value.length, value.length); } catch (e) { /* ignore */ }
    renderMirror();
  }

  function renderMirror() {
    if (!el.input) return;
    var val = el.input.value;
    var pos = el.input.selectionStart;
    if (pos === null || pos === undefined) pos = val.length;
    if (el.input.selectionDirection === "forward" && el.input.selectionEnd > pos) pos = el.input.selectionEnd;
    el.mPre.textContent = val.slice(0, pos);
    el.mCur.textContent = val.charAt(pos) || " ";
    el.mPost.textContent = val.slice(pos + 1);
  }

  function commonPrefix(list) {
    var p = list[0];
    for (var i = 1; i < list.length; i++) {
      while (list[i].toLowerCase().indexOf(p.toLowerCase()) !== 0) p = p.slice(0, -1);
    }
    return p;
  }

  function complete() {
    var val = el.input.value.replace(/^\s+/, "");
    var m = val.match(/^(\S+)(\s+)?([\s\S]*)$/);
    if (!m) return;
    var word = m[1].toLowerCase();
    var spaced = !!m[2];
    var pool, prefix, base;
    if (!spaced) {
      pool = Object.keys(COMMANDS);
      prefix = word;
      base = "";
    } else {
      var c = COMMANDS[word] || COMMANDS[ALIASES[word]];
      pool = c && c.args ? c.args() : [];
      prefix = m[3].toLowerCase();
      base = m[1] + " ";
    }
    var hits = pool.filter(function (s) { return s.toLowerCase().indexOf(prefix) === 0; });
    if (!hits.length) return;
    if (hits.length === 1) {
      var takesArgs = !spaced && COMMANDS[hits[0]] && COMMANDS[hits[0]].args;
      setInput(base + hits[0] + (takesArgs ? " " : ""));
      return;
    }
    var common = commonPrefix(hits);
    if (common.length > prefix.length) {
      setInput(base + common);
    } else {
      echo(el.input.value);
      out(hits.join("   "), "term-dim");
    }
  }

  function onInputKeydown(e) {
    if (e.isComposing) return;
    var k = e.key;
    if (k === "ArrowUp") {
      if (!hist.length) return;
      e.preventDefault();
      if (hIdx === hist.length) draft = el.input.value;
      if (hIdx > 0) hIdx--;
      setInput(hist[hIdx]);
    } else if (k === "ArrowDown") {
      if (hIdx >= hist.length) return;
      e.preventDefault();
      hIdx++;
      setInput(hIdx === hist.length ? draft : hist[hIdx]);
    } else if (k === "`" && !el.input.value) {
      e.preventDefault();
      close();
    } else if ((e.ctrlKey || e.metaKey) && (k === "l" || k === "L")) {
      e.preventDefault();
      cmdClear();
    } else if (e.ctrlKey && (k === "c" || k === "C") && el.input.selectionStart === el.input.selectionEnd) {
      e.preventDefault();
      interrupt();
      echo(el.input.value + "^C");
      setInput("");
    } else if (k === "PageUp" || k === "PageDown") {
      e.preventDefault();
      el.screen.scrollTop += (k === "PageUp" ? -1 : 1) * el.screen.clientHeight * 0.8;
    }
    // caret moves after keydown; repaint the block cursor next frame
    if (window.requestAnimationFrame) window.requestAnimationFrame(renderMirror);
    else setTimeout(renderMirror, 0);
  }

  function focusInput() {
    if (!el.input) return;
    try { el.input.focus({ preventScroll: true }); } catch (e) { el.input.focus(); }
    renderMirror();
  }

  /* -------------------------------------------------------------- focus trap */

  function focusables() {
    var list = el.win.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])');
    return Array.prototype.filter.call(list, function (n) { return n.getClientRects().length > 0; });
  }

  function onWinKeydown(e) {
    if (e.key !== "Tab") return;
    // Tab on a non-empty prompt completes; on an empty one it moves focus
    // so keyboard users can still reach links and chips.
    if (e.target === el.input && !e.shiftKey && el.input.value.trim()) {
      e.preventDefault();
      complete();
      return;
    }
    var f = focusables();
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1], active = doc.activeElement;
    if (e.shiftKey && (active === first || !el.win.contains(active))) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault(); first.focus();
    }
  }

  function onDocFocusIn(e) {
    if (openState && el.win && !el.win.contains(e.target)) focusInput();
  }

  /* ------------------------------------------------------------ open / close */

  function syncViewport() {
    var vv = window.visualViewport;
    if (!vv || !el.root) return;
    el.root.style.setProperty("--term-vvh", vv.height + "px");
    el.root.style.setProperty("--term-vvtop", vv.offsetTop + "px");
  }

  function setToggleState(expanded) {
    var t = doc.getElementById("term-toggle");
    if (t) t.setAttribute("aria-expanded", expanded ? "true" : "false");
  }

  function banner() {
    var weights = slug(fullName()) + ".safetensors";
    out("GUNR//OS v4.2 (tty1) — forward-pass shell", "term-hl");
    out("24576 MB VRAM ... OK · weights: " + weights, "term-dim");
    outH('<span class="term-dim">type </span>' + cmdButton("help") +
      '<span class="term-dim"> for commands · Esc to exit</span>');
  }

  function open() {
    build();
    if (openState) { focusInput(); return; }
    lastFocus = doc.activeElement;
    openState = true;
    el.root.hidden = false;
    el.root.classList.toggle("term--still", reduced()); // CSS: no cursor blink / transitions
    html.classList.add("term-open");
    setToggleState(true);

    syncViewport();
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", syncViewport);
      window.visualViewport.addEventListener("scroll", syncViewport);
    }
    if (!reduced()) {
      el.root.classList.remove("is-entering");
      void el.root.offsetWidth; // restart the power-on animation
      el.root.classList.add("is-entering");
    }
    if (!greeted) { greeted = true; banner(); }
    focusInput();
    scrollDown();
  }

  function close(restoreFocus) {
    if (!openState) return;
    openState = false;
    cancelTimers();
    stopRain();
    el.root.hidden = true;
    el.root.classList.remove("is-entering");
    el.win.classList.remove("is-glitching");
    html.classList.remove("term-open");
    setToggleState(false);
    if (window.visualViewport) {
      window.visualViewport.removeEventListener("resize", syncViewport);
      window.visualViewport.removeEventListener("scroll", syncViewport);
    }
    var target = lastFocus;
    lastFocus = null;
    if (restoreFocus !== false && target && target.focus && doc.contains(target) && target !== doc.body) {
      try { target.focus({ preventScroll: true }); } catch (e) { target.focus(); }
    } else if (doc.activeElement && el.root.contains(doc.activeElement)) {
      doc.activeElement.blur();
    }
  }

  function toggle() { if (openState) close(); else open(); }

  /* ------------------------------------------------------------------ build */

  function build() {
    if (el.root) return;
    var root = doc.createElement("div");
    root.className = "term";
    root.id = "gunr-term";
    root.hidden = true;

    var chips = CHIPS.map(function (c) {
      return '<button type="button" class="term-chip" data-run="' + esc(c) + '">' + esc(c) + "</button>";
    }).join("");

    root.innerHTML =
      '<div class="term__backdrop" data-term-close></div>' +
      '<div class="term__window" id="gunr-term-window" role="dialog" aria-modal="true" aria-labelledby="term-title" aria-describedby="term-desc">' +
        '<div class="term__bar">' +
          '<span class="term__dots" aria-hidden="true"><i></i><i></i><i></i></span>' +
          '<h2 class="term__title" id="term-title">GUNR//OS — tty1</h2>' +
          '<button type="button" class="term__close" data-term-close aria-label="Close terminal">' +
            '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">' +
            '<path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="square" fill="none"/></svg>' +
          "</button>" +
        "</div>" +
        '<p class="term__sr" id="term-desc">Interactive terminal. Type help and press Enter for commands. Press Escape to close.</p>' +
        '<div class="term__screen">' +
          '<div class="term__out" role="log" aria-live="polite" aria-relevant="additions"></div>' +
          '<form class="term__line" novalidate>' +
            '<span class="term__prompt" aria-hidden="true">' + esc(promptText()) + "</span>" +
            '<div class="term__field">' +
              '<div class="term__mirror" aria-hidden="true"><span></span><span class="term__cursor"> </span><span></span></div>' +
              '<input class="term__input" id="term-input" type="text" aria-label="Terminal command" ' +
                'autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="go">' +
            "</div>" +
          "</form>" +
        "</div>" +
        '<div class="term__chips" role="group" aria-label="Quick commands">' + chips + "</div>" +
      "</div>";

    doc.body.appendChild(root);

    el.root = root;
    el.win = root.querySelector(".term__window");
    el.screen = root.querySelector(".term__screen");
    el.out = root.querySelector(".term__out");
    el.form = root.querySelector(".term__line");
    el.input = root.querySelector(".term__input");
    var spans = root.querySelectorAll(".term__mirror > span");
    el.mPre = spans[0];
    el.mCur = spans[1];
    el.mPost = spans[2];

    el.form.addEventListener("submit", function (e) {
      e.preventDefault();
      var val = el.input.value;
      setInput("");
      run(val);
    });
    el.input.addEventListener("keydown", onInputKeydown);
    ["input", "keyup", "click", "focus", "select"].forEach(function (t) {
      el.input.addEventListener(t, renderMirror);
    });
    doc.addEventListener("selectionchange", function () {
      if (openState && doc.activeElement === el.input) renderMirror();
    });
    el.win.addEventListener("keydown", onWinKeydown);
    root.addEventListener("animationend", function (e) {
      if (e.target === el.win) root.classList.remove("is-entering");
    });

    root.addEventListener("click", function (e) {
      var t = e.target;
      var closer = t.closest ? t.closest("[data-term-close]") : null;
      if (closer) { close(); return; }
      var runner = t.closest ? t.closest("[data-run]") : null;
      if (runner) {
        run(runner.getAttribute("data-run"));
        // keep the on-screen keyboard down for touch users
        if (openState && (fineMQ && fineMQ.matches)) focusInput();
        return;
      }
      // tap/click on empty screen space focuses the prompt (unless selecting text)
      if (el.screen.contains(t) && !(t.closest && t.closest("a, button, .term-pre"))) {
        var sel = window.getSelection ? String(window.getSelection()) : "";
        if (!sel) focusInput();
      }
    });
    renderMirror();
  }

  /* ------------------------------------------------------------------- init */

  function isEditable(node) {
    if (!node || node.nodeType !== 1) return false;
    if (node.isContentEditable) return true;
    var tag = node.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
  }

  function init() {
    try {
      var saved = localStorage.getItem(THEME_KEY);
      if (saved && !html.getAttribute("data-theme")) applyTheme(saved, false);
    } catch (e) { /* storage blocked */ }

    build();

    var t = doc.getElementById("term-toggle");
    if (t) {
      t.setAttribute("aria-haspopup", "dialog");
      t.setAttribute("aria-controls", "gunr-term-window");
      t.setAttribute("aria-expanded", "false");
    }

    doc.addEventListener("click", function (e) {
      var opener = e.target.closest ? e.target.closest("#term-toggle, [data-term-open]") : null;
      if (!opener || (el.root && el.root.contains(opener))) return;
      e.preventDefault();
      toggle();
    });

    doc.addEventListener("keydown", function (e) {
      if (e.defaultPrevented || e.isComposing) return;
      if (!openState) {
        if (e.key === "`" && !e.ctrlKey && !e.metaKey && !e.altKey && !isEditable(e.target)) {
          e.preventDefault(); // keep the backtick out of the prompt
          open();
        }
        return;
      }
      if (e.key === "Escape" || e.key === "Esc") {
        e.preventDefault();
        close();
      }
    });

    doc.addEventListener("focusin", onDocFocusIn);
  }

  window.GUNR_TERM = {
    open: open,
    close: function () { close(); },
    toggle: toggle,
    run: function (cmd) { open(); run(cmd); },
    isOpen: function () { return openState; }
  };

  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", init);
  else init();
})();
