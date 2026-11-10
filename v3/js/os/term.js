/* =============================================================================
 * GUNR//OS — term.js  ("gsh", the terminal)
 * -----------------------------------------------------------------------------
 * Owns the main terminal window: the starship-style prompt, the highlighted
 * input mirror with fish-style ghost suggestions and a gliding block caret,
 * history, tab completion, Warp-style command blocks, the output builder handed
 * to every command, contextual chips (+ the mobile #dock) and the global
 * [data-cmd] delegation. Exposes GOS.term.
 *
 * Optional dependencies (all guarded): window.gsap, GOS.wm, GOS.palette,
 * GOS.desktop (toast/sfx). Without gsap every animation falls back to the Web
 * Animations API; in reduced motion output is instant and motion is fades only.
 * ========================================================================== */
(function () {
  "use strict";

  var GOS = window.GOS;
  if (!GOS || GOS.term) return;

  var doc = document;
  var U = GOS.util;
  var FULL = !!(GOS.motion && GOS.motion.full);
  var TOUCH = !!(GOS.device && GOS.device.touch);
  var HKEY = "gos.history", HMAX = 50;

  /* ---- small helpers -------------------------------------------------------- */
  function small() { return GOS.device && GOS.device.small ? GOS.device.small() : window.innerWidth <= 760; }
  function now() { return window.performance && performance.now ? performance.now() : Date.now(); }
  function esc(s) { return U.esc(s); }
  function isPh(s) { return s != null && String(s).indexOf("[[") >= 0; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function h(tag, cls, text) {
    var e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function sfx(n) { try { if (GOS.desktop && GOS.desktop.sfx) GOS.desktop.sfx(n); } catch (e) { /* optional */ } }
  function toast(m, o) { try { if (GOS.desktop && GOS.desktop.toast) GOS.desktop.toast(m, o); } catch (e) { /* optional */ } }
  function getCmd(n) { try { return GOS.commands.get(n); } catch (e) { return null; } }
  function cmdList(all) { try { return GOS.commands.list(all ? { all: true } : null) || []; } catch (e) { return []; } }
  function fmtMs(ms) {
    ms = Math.max(0, Math.round(ms));
    if (ms < 1000) return ms + "ms";
    if (ms < 60000) return (ms / 1000).toFixed(ms < 10000 ? 1 : 0) + "s";
    return Math.floor(ms / 60000) + "m" + Math.round((ms % 60000) / 1000) + "s";
  }
  function clock() { var d = new Date(); return pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds()); }

  /* ---- animation: gsap when present, WAAPI otherwise ------------------------- */
  var EASE = {
    "expo.out": "cubic-bezier(.16,1,.3,1)", "power2.out": "cubic-bezier(.33,1,.68,1)",
    "power2.in": "cubic-bezier(.32,0,.67,0)", "power3.inOut": "cubic-bezier(.65,0,.35,1)",
    "back.out": "cubic-bezier(.34,1.56,.64,1)"
  };
  function cssEase(e) { e = String(e || "expo.out"); return EASE[e] || EASE[e.replace(/\(.*\)$/, "")] || EASE["expo.out"]; }
  var TKEYS = ["x", "y", "scale", "scaleX", "scaleY", "rotate"];
  function hasT(v) { for (var i = 0; i < TKEYS.length; i++) if (TKEYS[i] in v) return true; return false; }
  function tf(v) {
    var sx = v.scaleX != null ? v.scaleX : (v.scale != null ? v.scale : 1);
    var sy = v.scaleY != null ? v.scaleY : (v.scale != null ? v.scale : 1);
    return "translate(" + (v.x || 0) + "px," + (v.y || 0) + "px) scale(" + sx + "," + sy + ")" + (v.rotate ? " rotate(" + v.rotate + "deg)" : "");
  }
  // tween(el, from, to, {duration (s), delay, ease, onComplete, clear=true})
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
  // One-shot keyframe flourish (squash, shake, pop). Full motion only.
  function pulse(el, frames, ms, easing) {
    if (!FULL || !el || !el.animate) return;
    try { el.animate(frames, { duration: ms, easing: easing || "cubic-bezier(.2,.9,.3,1)" }); } catch (e) { /* ignore */ }
  }
  var POP = [{ transform: "scale(.3)" }, { transform: "scale(1.5)", offset: 0.5 }, { transform: "scale(1)" }];
  var SHAKE = [
    { transform: "translateX(0)" }, { transform: "translateX(-7px)" }, { transform: "translateX(6px)" },
    { transform: "translateX(-4px)" }, { transform: "translateX(2px)" }, { transform: "translateX(0)" }
  ];
  function staggerIn(nodes) {
    for (var i = 0; i < nodes.length; i++) {
      if (FULL) tween(nodes[i], { opacity: 0, y: 8, scale: 0.88 }, { opacity: 1, y: 0, scale: 1 }, { duration: 0.5, delay: i * 0.04, ease: "back.out(1.7)" });
      else tween(nodes[i], { opacity: 0 }, { opacity: 1 }, { duration: 0.2, ease: "power2.out" });
    }
  }

  /* ---- structural CSS (zero specificity; css/os.css overrides everything) --- */
  var BASE_CSS = [
    ":where(.sr-only){position:absolute!important;width:1px!important;height:1px!important;margin:-1px!important;padding:0!important;overflow:hidden!important;clip:rect(0 0 0 0)!important;white-space:nowrap!important;border:0!important}",
    ":where(.term){display:flex;flex-direction:column;height:100%;min-height:0}",
    ":where(.term-scroll){flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain}",
    ":where(.prompt-line){display:flex;align-items:flex-start}",
    ":where(.prompt-field){position:relative;flex:1;min-width:0;overflow:hidden;cursor:text}",
    ":where(.prompt-mirror){position:relative;white-space:pre;min-height:1.6em;pointer-events:none}",
    ":where(.mirror-text,.blk-cmd,.pl-txt){display:inline-block}",
    ":where(.prompt-input){position:absolute;inset:0;width:100%;height:100%;margin:0;padding:0;border:0;outline:0;background:transparent;color:transparent;-webkit-text-fill-color:transparent;caret-color:transparent;font:inherit;letter-spacing:inherit;line-height:inherit;z-index:2}",
    ":where(.caret){position:absolute;left:0;top:.1em;width:1ch;height:1.4em;pointer-events:none;z-index:1}",
    ":where(.caret-core){display:block;width:100%;height:100%;background:currentColor;transform-origin:50% 100%}",
    ":where(.motion-full .caret){transition:transform 70ms cubic-bezier(.2,.8,.2,1)}",
    "@keyframes gos-caret-blink{0%,42%{opacity:1}58%,88%{opacity:.12}100%{opacity:1}}",
    ":where(.prompt-field.is-focused:not(.is-typing) .caret-core,.prompt-field.is-autotyping .caret-core){animation:gos-caret-blink 1.15s ease-in-out infinite}",
    ":where(.blk.is-collapsed .blk-out){display:none}",
    ":where(.o-stream){white-space:pre-wrap}",
    ":where(.o-pre){white-space:pre;overflow-x:auto}",
    ":where(.o-table-wrap){overflow-x:auto}",
    ":where(.o-progress-fill){display:block;height:100%;transform-origin:0 50%;transform:scaleX(0)}",
    "@keyframes gos-tok-in{from{opacity:0;filter:blur(3px)}to{opacity:1;filter:none}}",
    ":where(.motion-full .tok-in){animation:gos-tok-in .38s ease-out both}",
    ":where(.chips[hidden]){display:none}"
  ].join("\n");
  function injectBase() {
    if (doc.getElementById("gos-term-base")) return;
    var s = h("style"); s.id = "gos-term-base"; s.textContent = BASE_CSS;
    doc.head.insertBefore(s, doc.head.firstChild);
  }

  /* ---- state ------------------------------------------------------------------ */
  var mounted = false, win = null;
  var rootEl, scroller, log, promptWrap, promptLine, pchar, field, mirror, caret, caretCore, input, chipsEl, statusSeg, pathTxt, timeEl, descEl, jumpBtn;
  var cwd = "~";
  var hist = loadHist(), hNav = null;
  var ghost = "", lastState = null, autoCaret = null, typingT = 0, rafRender = 0;
  var chipList = [], compShown = false;
  var running = [], lastBlk = null, blkSeq = 0;
  var followEl = null, manual = false, rafScroll = 0;

  function loadHist() {
    try {
      var a = JSON.parse(GOS.store.get(HKEY) || "[]");
      return Array.isArray(a) ? a.filter(function (s) { return typeof s === "string" && s; }).slice(-HMAX) : [];
    } catch (e) { return []; }
  }
  function pushHist(line) {
    if (hist[hist.length - 1] !== line) hist.push(line);
    if (hist.length > HMAX) hist = hist.slice(-HMAX);
    GOS.store.set(HKEY, JSON.stringify(hist));
    hNav = null;
  }

  /* ---- command names / parsing ------------------------------------------------ */
  // Visible command names first, then aliases and hidden ones (suggestion order).
  function allNames() {
    var vis = [], rest = [], seen = {};
    cmdList(true).forEach(function (c) {
      (c.hidden ? rest : vis).push(c.name);
      (c.aliases || []).forEach(function (a) { rest.push(a); });
    });
    vis.sort(function (a, b) { return a.length - b.length; });
    return vis.concat(rest).filter(function (n) { if (seen[n]) return false; seen[n] = 1; return true; });
  }

  // Lexer for highlighting: whitespace, quoted strings, operators, words.
  var LEX = /(\s+)|("(?:[^"\\]|\\.)*"?|'[^']*'?)|(&&|\|\||[|;>])|([^\s"'|;>&]+|&)/g;
  function tokenize(s) {
    var out = [], m, first = true;
    LEX.lastIndex = 0;
    while ((m = LEX.exec(s))) {
      if (m[1]) out.push({ t: "ws", s: m[1] });
      else if (m[2]) { out.push({ t: "str", s: m[2] }); first = false; }
      else if (m[3]) { out.push({ t: "op", s: m[3] }); first = true; }
      else {
        var w = m[4];
        if (first) { out.push({ t: "cmd", s: w }); first = false; }
        else out.push({ t: /^--?[A-Za-z0-9]/.test(w) ? "flag" : "arg", s: w });
      }
    }
    return out;
  }
  function cmdState(w, final) {
    if (getCmd(w)) return "is-known";
    if (final) return "is-unknown";
    var lw = w.toLowerCase();
    return allNames().some(function (n) { return n.indexOf(lw) === 0; }) ? "is-partial" : "is-unknown";
  }
  var ANCHOR = '<span class="caret-anchor"></span>';
  // c = caret index (null: no anchor). final = render for a block header.
  function tokensHTML(v, c, final) {
    var toks = tokenize(v), html = "", pos = 0, placed = c == null, state = null;
    for (var i = 0; i < toks.length; i++) {
      var t = toks[i], cls = "tok tok-" + t.t;
      if (t.t === "cmd") { var st = cmdState(t.s, final); cls += " " + st; if (!state) state = st; }
      var end = pos + t.s.length;
      if (!placed && c >= pos && c < end) {
        var k = c - pos;
        if (k > 0) html += '<span class="' + cls + '">' + esc(t.s.slice(0, k)) + "</span>";
        html += ANCHOR + '<span class="' + cls + '">' + esc(t.s.slice(k)) + "</span>";
        placed = true;
      } else html += '<span class="' + cls + '">' + esc(t.s) + "</span>";
      pos = end;
    }
    if (!placed) html += ANCHOR;
    return { html: html, state: state };
  }
  function parseArgv(s) {
    var out = [], re = /"((?:[^"\\]|\\.)*)"?|'([^']*)'?|(\S+)/g, m;
    while ((m = re.exec(s))) {
      if (m[1] != null) out.push(m[1].replace(/\\(.)/g, "$1"));
      else if (m[2] != null) out.push(m[2]);
      else out.push(m[3]);
    }
    return out;
  }
  // "a && b; c" -> [{cmd:'a',op:null},{cmd:'b',op:'&&'},{cmd:'c',op:';'}]
  function splitChain(s) {
    var parts = [], cur = "", q = null, op = null, i, ch;
    function push(next) { var c = cur.trim(); if (c) parts.push({ cmd: c, op: op }); op = next; cur = ""; }
    for (i = 0; i < s.length; i++) {
      ch = s.charAt(i);
      if (q) { cur += ch; if (ch === q && s.charAt(i - 1) !== "\\") q = null; continue; }
      if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
      if (ch === ";") { push(";"); continue; }
      if (ch === "&" && s.charAt(i + 1) === "&") { push("&&"); i++; continue; }
      cur += ch;
    }
    push(null);
    return parts;
  }

  /* ---- suggestions & completion ---------------------------------------------- */
  function safeComplete(spec, argv) {
    if (!spec || typeof spec.complete !== "function") return [];
    try {
      var r = spec.complete(argv) || [];
      return (Array.isArray(r) ? r : []).map(function (c) {
        return c && typeof c === "object" ? String(c.value || c.name || "") : String(c);
      }).filter(Boolean);
    } catch (e) { return []; }
  }
  function completions(v) {
    var m = /^([\s\S]*?)(\S*)$/.exec(v), base = m[1], last = m[2], low = last.toLowerCase(), pool;
    if (!base.trim()) pool = allNames();
    else {
      var argv = parseArgv(base).concat([last]);
      pool = safeComplete(getCmd(argv[0]), argv);
    }
    var seen = {}, list = pool.filter(function (s) {
      if (seen[s] || s.toLowerCase().indexOf(low) !== 0) return false;
      seen[s] = 1; return true;
    });
    return { base: base, last: last, list: list.slice(0, 24) };
  }
  function suggest(v) {
    if (!v.trim()) return "";
    var low = v.toLowerCase(), i;
    for (i = hist.length - 1; i >= 0; i--) {
      if (hist[i].length > v.length && hist[i].toLowerCase().indexOf(low) === 0) return hist[i].slice(v.length);
    }
    var c = completions(v);
    if (!c.last) return "";
    for (i = 0; i < c.list.length; i++) if (c.list[i].length > c.last.length) return c.list[i].slice(c.last.length);
    return "";
  }
  function commonPrefix(list) {
    if (!list.length) return "";
    var p = list[0];
    list.forEach(function (s) { while (s.toLowerCase().indexOf(p.toLowerCase()) !== 0) p = p.slice(0, -1); });
    return p;
  }

  /* ---- prompt rendering ---------------------------------------------------- */
  // Pick the longest hint that fits the prompt field (container width, not the
  // viewport: side windows narrow the terminal), dropping whole segments.
  var HINTS_KEY = ["type a command and press Enter  ·  try help  ·  Ctrl+K", "type a command and press Enter  ·  try help", "type a command · try help", "try help  ·  Ctrl+K", "try help"];
  var HINTS_TOUCH = ["tap here to type, or use the buttons below", "tap here to type…"];
  function hintText() {
    var opts = TOUCH ? HINTS_TOUCH : HINTS_KEY;
    var w = mirror ? mirror.clientWidth : 0;
    if (!w) return TOUCH && small() ? opts[1] : opts[0];
    var fs = 14;
    try { fs = parseFloat(window.getComputedStyle(mirror).fontSize) || 14; } catch (e) { /* default */ }
    var fit = Math.floor((w - 8) / (fs * 0.62));   // ~monospace advance
    for (var i = 0; i < opts.length; i++) if (opts[i].length <= fit) return opts[i];
    return opts[opts.length - 1];
  }
  function caretIndex() {
    if (autoCaret != null) return autoCaret;
    if (doc.activeElement !== input) return input.value.length;
    var s = input.selectionStart, e = input.selectionEnd;
    if (s == null) return input.value.length;
    return input.selectionDirection === "backward" ? s : e;
  }
  function render() {
    if (!mounted) return;
    var v = input.value, c = caretIndex();
    var sel = doc.activeElement === input && input.selectionStart !== input.selectionEnd;
    ghost = !sel && c === v.length && v ? suggest(v) : "";
    var r = tokensHTML(v, c, false);
    var st = v.trim() ? r.state : null;
    // Plain-English questions aren't errors: they're routed to gunr-gpt on Enter.
    var q = st !== "is-known" && !ghost && routesToAsk(v);
    if (q) { st = "is-question"; r.html = r.html.replace(/ is-(unknown|partial)"/, ' is-q"'); }
    var html = '<span class="mirror-text">' + r.html + "</span>";
    if (ghost) html += '<span class="ghost">' + esc(ghost) + "</span>";
    else if (!v) html += '<span class="prompt-hint' + (idleHint ? " is-idle-hint" : "") + '">' + esc(idleHint || hintText()) + "</span>";
    mirror.innerHTML = html;
    promptLine.classList.toggle("is-known", st === "is-known");
    promptLine.classList.toggle("is-unknown", st === "is-unknown");
    promptLine.classList.toggle("is-question", st === "is-question");
    setDesc(q ? "✦ gunr-gpt will answer  ↵" : st === "is-known" ? specSummary(v) :
      ghost && !/\s/.test(v.trim()) ? specSummary(v + ghost) : "");
    if (st === "is-known" && lastState !== "is-known") {
      pulse(pchar, [{ transform: "scale(1)" }, { transform: "scale(1.4) rotate(-8deg)", offset: 0.4 }, { transform: "scale(1)" }], 360);
    }
    lastState = st;
    field.classList.toggle("has-selection", sel);
    field.classList.toggle("has-ghost", !!ghost);
    syncCaret();
  }
  // One-line description of the command being typed, at the right edge of the prompt.
  function specSummary(v) {
    var s = getCmd(String(v).trim().split(/\s+/)[0]);
    return s && s.summary ? String(s.summary) : "";
  }
  function setDesc(t) {
    if (!descEl || descEl.__t === t) return;
    descEl.__t = t;
    if (t) descEl.textContent = t;
    descEl.classList.toggle("is-on", !!t);
  }

  // Idle prompt: after a while with nothing typed, the hint cycles through example
  // questions (typewriter in full motion) so first-time visitors see what to do.
  var IDLE_MS = 20000, IDLE_EX = [
    "what does Gunnar research?", "how can I reach him?", "skills", "experience", "what is he working on?"
  ];
  var idleHint = "", idleEx = "", idleT = 0, idleN = 0;
  function idleReset() {
    clearTimeout(idleT);
    var had = !!idleHint;
    idleHint = ""; idleEx = "";
    if (had && mounted) render();
    if (mounted && !TOUCH) idleT = setTimeout(idleTick, IDLE_MS);
  }
  function idleTick() {
    if (!mounted || input.value || doc.hidden || running.length) { idleT = setTimeout(idleTick, 4000); return; }
    idleEx = IDLE_EX[idleN++ % IDLE_EX.length];
    var full = "try: " + idleEx + "   (Tab)";
    if (!FULL) { idleHint = full; render(); idleT = setTimeout(idleTick, 6000); return; }
    var i = 5;
    (function typeOn() {
      if (input.value) { idleReset(); return; }
      idleHint = full.slice(0, i);
      render();
      if (i++ < full.length) idleT = setTimeout(typeOn, 38);
      else idleT = setTimeout(idleTick, 4500);
    })();
  }

  function scheduleRender() {
    if (rafRender) return;
    rafRender = requestAnimationFrame(function () { rafRender = 0; render(); });
  }
  function syncCaret() {
    var sl = input.scrollLeft || 0;
    mirror.style.transform = sl ? "translateX(" + (-sl) + "px)" : "";
    var a = mirror.querySelector(".caret-anchor");
    var x = a ? a.offsetLeft - sl : 0;
    caret.style.transform = "translate3d(" + x + "px,0,0)";
  }
  function squash(kind) {
    if (!FULL || !caretCore || !caretCore.animate) return;
    var f;
    if (kind === "del") f = [{ transform: "scale(.5,1.15)" }, { transform: "scale(1.1,.95)", offset: 0.6 }, { transform: "none" }];
    else if (kind === "jump") f = [{ transform: "scale(2.2,.5)" }, { transform: "scale(.85,1.1)", offset: 0.55 }, { transform: "none" }];
    else f = [{ transform: "scale(1.5,.68)" }, { transform: "scale(.9,1.08)", offset: 0.55 }, { transform: "none" }];
    try { caretCore.animate(f, { duration: kind === "jump" ? 340 : 240, easing: "cubic-bezier(.2,.9,.25,1)" }); } catch (e) { /* ignore */ }
  }
  function typing() {
    field.classList.add("is-typing");
    clearTimeout(typingT);
    typingT = setTimeout(function () { field.classList.remove("is-typing"); }, 550);
  }
  function setValue(v, roll) {
    input.value = v;
    if (doc.activeElement === input) { try { input.setSelectionRange(v.length, v.length); } catch (e) { /* ignore */ } }
    input.scrollLeft = input.scrollWidth;
    render();
    if (roll && FULL) {
      var mt = mirror.querySelector(".mirror-text");
      tween(mt, { y: roll * 10, opacity: 0 }, { y: 0, opacity: 1 }, { duration: 0.28, ease: "expo.out" });
    }
  }
  function revealPrompt() {
    if (!scroller) return;
    var s = scroller.getBoundingClientRect(), p = promptWrap.getBoundingClientRect();
    if (p.bottom > s.bottom + 2 || p.top < s.top - 2) scrollToPrompt();
  }

  /* ---- keyboard ------------------------------------------------------------- */
  function histMove(dir) {
    if (!hNav) {
      var draft = input.value, pref = draft.toLowerCase(), seen = {}, list = [];
      for (var i = hist.length - 1; i >= 0; i--) {
        var e = hist[i];
        if (seen[e]) continue;
        seen[e] = 1;
        if (!pref || e.toLowerCase().indexOf(pref) === 0) list.push(e);
      }
      hNav = { list: list, i: -1, draft: draft };
    }
    var n = hNav.i + (dir < 0 ? 1 : -1);
    if (n >= hNav.list.length || n < -1) { pulse(field, SHAKE, 300); return; }
    hNav.i = n;
    setValue(n === -1 ? hNav.draft : hNav.list[n], dir < 0 ? -1 : 1);
  }
  function accept() { setValue(input.value + ghost); squash("jump"); }
  function acceptWord() {
    var m = /^\s*\S+/.exec(ghost);
    if (m) { setValue(input.value + m[0]); squash("jump"); }
  }
  function tab() {
    var v = input.value;
    if (ghost && caretIndex() === v.length) { accept(); return; }
    var c = completions(v);
    if (!c.list.length) { squash("del"); pulse(field, SHAKE, 300); return; }
    if (c.list.length === 1) {
      var one = c.list[0];
      setValue(c.base + one + (/\/$/.test(one) ? "" : " "));
      squash("jump");
      hideCompletions();
      return;
    }
    var lcp = commonPrefix(c.list);
    if (lcp.length > c.last.length) setValue(c.base + lcp);
    showCompletions(c);
  }
  function onKey(e) {
    if (e.isComposing) return;
    var k = e.key, v = input.value;
    var atEnd = input.selectionStart === v.length && input.selectionEnd === v.length;
    if (k === "Enter") { e.preventDefault(); submit(); return; }
    if (e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey) {
      var lk = (k || "").toLowerCase();
      if (lk === "l") { e.preventDefault(); clear(); return; }
      if (lk === "c" && input.selectionStart === input.selectionEnd) { e.preventDefault(); cancel(); return; }
      if (lk === "u") { e.preventDefault(); setValue(""); squash("del"); return; }
      if (k === "ArrowRight" && atEnd && ghost) { e.preventDefault(); acceptWord(); return; }
      return;
    }
    if (e.altKey || e.metaKey || e.ctrlKey) return;
    switch (k) {
      case "ArrowUp": e.preventDefault(); histMove(-1); return;
      case "ArrowDown": e.preventDefault(); histMove(1); return;
      case "ArrowRight":
      case "End":
        if (atEnd && ghost) { e.preventDefault(); accept(); }
        return;
      case "Tab":
        if (!e.shiftKey && !v && idleEx) { e.preventDefault(); var ex = idleEx; idleReset(); setValue(ex); squash("jump"); return; }
        if (e.shiftKey || (!v.trim() && !ghost)) return; // let Tab move focus when there's nothing to complete
        e.preventDefault(); tab(); return;
      case "Escape":
        if (compShown) { e.preventDefault(); hideCompletions(); }
        return;
    }
  }
  function submit() {
    var v = input.value;
    if (!v.trim()) {
      pulse(promptWrap, [{ transform: "translateY(0)" }, { transform: "translateY(3px)", offset: 0.35 }, { transform: "translateY(0)" }], 260);
      return;
    }
    run(v, { source: "typed" });
  }

  /* ---- chips ------------------------------------------------------------------ */
  var ICONS = {
    help: "?", welcome: "✦", man: "§", about: "◉", whoami: "◉", neofetch: "▦", research: "◇",
    experience: "⎇", skills: "▤", contact: "✉", vcard: "⤓", email: "@", call: "☎", qr: "▣",
    socials: "↗", share: "↪", ask: "✦", ls: "▸", cd: "↳", cat: "≡", tree: "⑂", pwd: "⌂",
    open: "↗", theme: "◐", motion: "∿", clear: "⌫", history: "↺", matrix: "▓", hack: "☠"
  };
  function iconHTML(icon, cls) {
    icon = icon == null ? "" : String(icon);
    return '<span class="' + cls + '" aria-hidden="true">' + (/^\s*</.test(icon) ? icon : esc(icon)) + "</span>";
  }
  function normChip(c) {
    if (!c) return null;
    if (typeof c === "string") c = { cmd: c };
    var cmd = c.cmd || c.name;
    if (!cmd) return null;
    cmd = String(cmd);
    var first = cmd.split(/\s+/)[0], spec = getCmd(first);
    return {
      cmd: cmd,
      // "ask <question>" chips read as the question itself.
      label: c.label || (spec && spec.name === "ask" && /\s/.test(cmd) ? cmd.replace(/^\S+\s+/, "") : cmd),
      icon: c.icon || (spec && spec.icon) || ICONS[first] || (spec && ICONS[spec.name]) || "❯",
      title: c.title || (spec && spec.summary) || ("Run " + cmd)
    };
  }
  function chipHTML(c, extra, fill) {
    return '<button type="button" class="chip' + (extra || "") + '" ' + (fill ? "data-cmd-fill" : "data-cmd") + '="' + esc(c.cmd) +
      '" title="' + esc(c.title) + '">' + iconHTML(c.icon, "chip-icon") + '<span class="chip-label">' + esc(c.label) + "</span></button>";
  }
  function renderChips(el, list, label, fill) {
    if (!el) return;
    var key = label + "|" + (fill ? "f|" : "") + list.map(function (c) { return c.cmd; }).join(",");
    if (el.__key === key) return;
    el.__key = key;
    el.innerHTML = (list.length && label ? '<span class="chips-label">' + esc(label) + "</span>" : "") +
      list.map(function (c) { return chipHTML(c, fill ? " chip--fill" : "", fill); }).join("");
    el.hidden = !list.length;
    staggerIn(el.querySelectorAll(".chip"));
  }
  function setChips(list) {
    chipList = (list || []).map(normChip).filter(Boolean).slice(0, 6);
    if (!mounted) return;
    if (!compShown) { chipsEl.classList.remove("is-completions"); renderChips(chipsEl, chipList, "Try:", false); }
    renderDock();
  }
  function showCompletions(c) {
    compShown = true;
    chipsEl.classList.add("is-completions");
    renderChips(chipsEl, c.list.slice(0, 12).map(function (s) {
      return { cmd: c.base + s + (/\/$/.test(s) ? "" : " "), label: s, icon: "⇥", title: "Complete to " + s };
    }), "Tab:", true);
  }
  function hideCompletions() {
    if (!compShown) return;
    compShown = false;
    chipsEl.classList.remove("is-completions");
    renderChips(chipsEl, chipList, "Try:", false);
  }

  // Mobile dock: fixed Type + palette chips, then the scrollable contextual chips.
  function renderDock() {
    var dock = doc.getElementById("dock");
    if (!dock) return;
    if (!dock.__built) {
      dock.__built = true;
      dock.innerHTML =
        '<div class="dock-fixed">' +
          '<button type="button" class="chip chip--type" data-term-type aria-label="Type a command">' + iconHTML("⌨", "chip-icon") + '<span class="chip-label">Type</span></button>' +
          '<button type="button" class="chip chip--palette" data-palette aria-label="Search commands">' +
            iconHTML('<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M20 20l-4.6-4.6"/></svg>', "chip-icon") +
            '<span class="chip-label">Search</span></button>' +
        "</div>" +
        '<div class="dock-scroll" role="group" aria-label="Suggested commands"></div>';
      var setVar = function () {
        var hgt = getComputedStyle(dock).display === "none" ? 0 : dock.getBoundingClientRect().height;
        doc.documentElement.style.setProperty("--dock-h", Math.round(hgt) + "px");
      };
      if (window.ResizeObserver) new ResizeObserver(setVar).observe(dock);
      window.addEventListener("resize", setVar);
      setVar();
    }
    var sc = dock.querySelector(".dock-scroll");
    var before = sc.__key;
    renderChips(sc, chipList, "", false);
    if (sc.__key !== before && sc.scrollLeft) {
      try { sc.scrollTo({ left: 0, behavior: FULL ? "smooth" : "auto" }); } catch (e) { sc.scrollLeft = 0; }
    }
  }

  // Default next-step chips per command (commands may override with out.chips()).
  var NEXT = {
    "": ["help", "about", "research", "contact", "ask", "neofetch"],
    help: ["about", "research", "contact", "neofetch", "ask", "theme"],
    welcome: ["about", "research", "contact", "vcard", "ask", "help"],
    man: ["help", "about", "contact"],
    about: ["research", "experience", "skills", "contact", "ask"],
    neofetch: ["about", "research", "experience", "contact", "help"],
    research: ["experience", "skills", "contact", "ask", "about"],
    experience: ["skills", "research", "contact", "about", "ask"],
    skills: ["research", "experience", "contact", "ask"],
    contact: ["vcard", "qr", "socials", "email", "about"],
    vcard: ["contact", "qr", "share", "about"],
    email: ["contact", "vcard", "socials"],
    call: ["contact", "vcard", "socials"],
    qr: ["vcard", "share", "contact"],
    socials: ["contact", "vcard", "about"],
    share: ["qr", "vcard", "contact"],
    ask: ["contact", "about", "research", "experience"],
    ls: ["tree", "cat ~/README.md", "cd ~/research", "pwd"],
    cd: ["ls", "pwd", "tree"],
    pwd: ["ls", "tree"],
    cat: ["ls", "tree", "contact"],
    open: ["ls", "contact"],
    tree: ["ls", "cat ~/README.md", "cd ~/research"],
    clear: ["help", "about", "contact", "neofetch"],
    history: ["help", "clear", "neofetch"],
    theme: ["neofetch", "motion status", "help"],
    motion: ["theme", "neofetch", "help"],
    sfx: ["theme", "help"],
    sudo: ["contact", "vcard", "about"],
    plain: ["help", "contact"],
    print: ["contact", "vcard", "qr"],
    _fun: ["help fun", "matrix", "hack", "coffee", "about"]
  };
  function contextChips(name) {
    var spec = getCmd(name), key = spec ? spec.name : (name || "");
    var list = NEXT[key] || (spec && spec.group === "fun" ? NEXT._fun : NEXT[""]);
    var seen = {};
    return list.filter(function (c) {
      var s = getCmd(c.split(/\s+/)[0]);
      if (!s || seen[c]) return false;
      if (spec && s.name === spec.name && c.indexOf(" ") < 0) return false;
      seen[c] = 1;
      return true;
    }).slice(0, 6).map(normChip).filter(Boolean);
  }

  /* ---- scrolling: follow the newest block until its head reaches the top ---- */
  function kick() { if (!rafScroll && scroller) rafScroll = requestAnimationFrame(step); }
  function step() {
    rafScroll = 0;
    if (manual || !scroller) return;
    var max = scroller.scrollHeight - scroller.clientHeight;
    if (max <= 0) return;
    var target = max;
    if (followEl && followEl.isConnected) {
      var top = followEl.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - 12;
      target = Math.min(max, Math.max(0, top));
    }
    var cur = scroller.scrollTop, d = target - cur;
    if (d < 1) { if (d > 0) scroller.scrollTop = target; return; } // never yank the reader back up
    if (!FULL) { scroller.scrollTop = target; return; }
    scroller.scrollTop = cur + d * 0.2 + (d > 0 ? 0.5 : -0.5);
    rafScroll = requestAnimationFrame(step);
  }
  function scrollToPrompt() { followEl = null; manual = false; kick(); }

  /* ---- blocks ------------------------------------------------------------------ */
  function actBtn(name, glyph, label, extra) {
    return '<button type="button" class="blk-act blk-act--' + name + '" data-act="' + name + '" aria-label="' + label + '" title="' + label + '"' + (extra || "") + ">" + glyph + "</button>";
  }
  function newBlock(line, o) {
    o = o || {};
    var id = "blk-" + (++blkSeq);
    var el = h("article", "blk is-running" + (o.system ? " blk--system" : ""));
    el.id = id;
    el.tabIndex = 0;
    el.setAttribute("aria-busy", "true");
    el.setAttribute("aria-label", o.system ? (o.label || "Message") : "Command: " + line);
    var b = { id: id, el: el, line: line, err: false, explicit: null, isCancelled: false, spinners: [], chipsSet: false, revealN: 0, lastReveal: 0 };
    b.cancelP = new Promise(function (r) { b.cancelResolve = r; });
    if (!o.system || o.label) {
      var head = h("header", "blk-head");
      if (o.system) {
        head.innerHTML = '<span class="blk-dot" aria-hidden="true"></span><span class="blk-label">' + esc(o.label) + "</span>";
      } else {
        head.innerHTML =
          '<span class="blk-dot" aria-hidden="true"></span>' +
          '<span class="blk-prompt" aria-hidden="true"><span class="blk-path">' + esc(cwd) + '</span><span class="blk-char">❯</span></span>' +
          '<code class="blk-cmd">' + tokensHTML(line, null, true).html + "</code>" +
          '<span class="blk-meta"><span class="blk-time"></span></span>' +
          '<span class="blk-actions">' +
            actBtn("rerun", "↻", "Run again") +
            actBtn("copy", "⧉", "Copy output") +
            actBtn("collapse", "▾", "Collapse output", ' aria-expanded="true" aria-controls="' + id + '-out"') +
          "</span>";
      }
      el.appendChild(head);
      b.head = head;
      b.dot = head.querySelector(".blk-dot");
      b.cmdEl = head.querySelector(".blk-cmd");
      b.timeEl = head.querySelector(".blk-time");
    }
    b.out = h("div", "blk-out");
    b.out.id = id + "-out";
    el.appendChild(b.out);
    el.__blk = b;
    return b;
  }
  function captureMorph(source, origin) {
    if (!FULL || !mounted) return null;
    var m = { p: promptWrap.getBoundingClientRect().top, r: null, kind: null };
    try {
      if (source === "typed" || source === "auto") {
        var mt = mirror.querySelector(".mirror-text");
        if (mt && input.value.trim()) { m.r = mt.getBoundingClientRect(); m.kind = "prompt"; }
      } else if (origin) {
        m.r = origin.getBoundingClientRect ? origin.getBoundingClientRect() : origin;
        m.kind = "origin";
      }
    } catch (e) { m.r = null; }
    if (m.r && !(m.r.width > 0 && m.r.height > 0 && m.r.bottom > 0 && m.r.top < window.innerHeight)) m.r = null;
    return m;
  }
  // Cap the scrollback so long sessions don't grow DOM (and live animations) forever.
  // Running blocks are kept; a reader scrolled up keeps their place.
  var MAX_BLOCKS = 200;
  function trimLog() {
    var extra = log.children.length - MAX_BLOCKS, i = 0, removed = 0;
    while (extra > 0 && i < log.children.length) {
      var c = log.children[i];
      if (c.__blk && running.indexOf(c.__blk) >= 0) { i++; continue; }
      removed += c.offsetHeight;
      log.removeChild(c);
      extra--;
    }
    if (removed && manual) scroller.scrollTop = Math.max(0, scroller.scrollTop - removed);
  }
  function insertBlock(b, m) {
    log.appendChild(b.el);
    trimLog();
    lastBlk = b;
    manual = false;
    followEl = b.el;
    kick();
    if (!FULL) { tween(b.el, { opacity: 0 }, { opacity: 1 }, { duration: 0.18, ease: "power2.out" }); return; }
    if (m && m.p != null) {
      var p1 = promptWrap.getBoundingClientRect().top;
      if (Math.abs(m.p - p1) > 1) tween(promptWrap, { y: m.p - p1 }, { y: 0 }, { duration: 0.6, ease: "expo.out" });
    }
    if (m && m.r && b.cmdEl) {
      // The typed line (or the clicked chip) morphs into the block header.
      var r1 = b.cmdEl.getBoundingClientRect();
      var s = clamp(m.r.height / (r1.height || 1), 0.5, 2);
      tween(b.cmdEl,
        { x: m.r.left - r1.left, y: m.r.top - r1.top, scale: s, opacity: m.kind === "origin" ? 0.25 : 1, transformOrigin: "0 50%" },
        { x: 0, y: 0, scale: 1, opacity: 1 },
        { duration: m.kind === "prompt" ? 0.55 : 0.75, ease: m.kind === "prompt" ? "expo.out" : "back.out(1.2)" });
      var rest = b.head.querySelectorAll(".blk-dot, .blk-prompt, .blk-meta");
      for (var i = 0; i < rest.length; i++) {
        tween(rest[i], { opacity: 0, x: -8 }, { opacity: 1, x: 0 }, { duration: 0.45, delay: 0.1 + i * 0.05 });
      }
    } else {
      tween(b.el, { opacity: 0, y: 12 }, { opacity: 1, y: 0 }, { duration: 0.5 });
    }
  }
  function reveal(b, el) {
    if (!FULL) return;
    var t = now();
    if (t - b.lastReveal > 220) b.revealN = 0;
    b.lastReveal = t;
    tween(el, { opacity: 0, y: 8 }, { opacity: 1, y: 0 }, { duration: 0.5, delay: Math.min(b.revealN++, 14) * 0.04 });
  }
  function settle(b, status, ms) {
    var el = b.el;
    el.classList.remove("is-running");
    el.classList.add("is-" + status);
    el.removeAttribute("aria-busy");
    b.spinners.forEach(function (s) { s.stop(null, status === "ok" ? "ok" : "error"); });
    if (b.timeEl) {
      b.timeEl.textContent = status === "cancelled" ? "^C" : fmtMs(ms);
      b.timeEl.title = status === "ok" ? "Succeeded" : status === "cancelled" ? "Cancelled" : "Failed";
    }
    pulse(b.dot, POP, 420);
  }
  function setPromptStatus(status, ms) {
    var ok = status === "ok";
    statusSeg.className = "pl-seg pl-seg--status " + (ok ? "is-ok" : "is-error");
    statusSeg.innerHTML = '<span class="pl-icon">' + (ok ? "✓" : "✗") + "</span>" + (status === "cancelled" ? "^C" : fmtMs(ms));
    pchar.classList.toggle("is-error", !ok);
    promptWrap.classList.toggle("is-error", !ok);
    timeEl.textContent = clock();
    pulse(statusSeg, [{ opacity: 0, transform: "translateX(-8px)" }, { opacity: 1, transform: "none" }], 420);
  }
  function cancelBlock(b) {
    if (b.isCancelled) return;
    b.isCancelled = true;
    b.out.appendChild(h("p", "o-cancel", "^C"));
    b.cancelResolve();
  }
  function blockAction(b, act, btn) {
    if (act === "rerun") { run(b.line, { source: "link", origin: b.cmdEl || btn }); return; }
    if (act === "copy") {
      copyText((b.out.innerText || "").trim() || b.line).then(function (ok) {
        btn.classList.add(ok ? "is-done" : "is-failed");
        var old = btn.textContent;
        btn.textContent = ok ? "✓" : "✗";
        pulse(btn, POP, 380);
        toast(ok ? "Copied output" : "Couldn't copy", { kind: ok ? "ok" : "error", ms: 1600 });
        setTimeout(function () { btn.textContent = old; btn.classList.remove("is-done", "is-failed"); }, 1300);
      });
      return;
    }
    if (act === "collapse") {
      var collapse = !b.el.classList.contains("is-collapsed");
      btn.setAttribute("aria-expanded", String(!collapse));
      btn.setAttribute("aria-label", collapse ? "Expand output" : "Collapse output");
      btn.title = btn.getAttribute("aria-label");
      var g = window.gsap;
      if (!FULL || !g) { b.el.classList.toggle("is-collapsed", collapse); return; }
      g.killTweensOf(b.out);
      g.set(b.out, { overflow: "hidden" });
      if (collapse) {
        g.to(b.out, { height: 0, opacity: 0, duration: 0.32, ease: "power3.inOut", onComplete: function () {
          b.el.classList.add("is-collapsed");
          g.set(b.out, { clearProps: "height,opacity,overflow" });
        } });
      } else {
        b.el.classList.remove("is-collapsed");
        g.fromTo(b.out, { height: 0, opacity: 0 }, { height: "auto", opacity: 1, duration: 0.5, ease: "expo.out", clearProps: "height,opacity,overflow" });
      }
    }
  }
  function copyText(s) {
    function legacy() {
      try {
        var t = h("textarea");
        t.value = s; t.setAttribute("readonly", ""); t.style.position = "fixed"; t.style.opacity = "0";
        doc.body.appendChild(t); t.select();
        var ok = doc.execCommand("copy");
        doc.body.removeChild(t);
        return ok;
      } catch (e) { return false; }
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(s).then(function () { return true; }, function () { return legacy(); });
    }
    return Promise.resolve(legacy());
  }

  /* ---- output builder ----------------------------------------------------------- */
  function isUrl(t) { return /^(https?:|mailto:|tel:|sms:|\/|\.{1,2}\/|#)/i.test(t) || /\.(html?|pdf|vcf)([?#]|$)/i.test(t); }
  function safeUrl(t) { return /^(https?:|mailto:|tel:|sms:)/i.test(t) || !/^[a-z][a-z0-9+.\-]*:/i.test(t); }
  function cmdLink(label, cmd, cls) {
    var b = h("button", "cmd-link" + (cls ? " " + cls : ""), label);
    b.type = "button";
    b.setAttribute("data-cmd", cmd);
    b.title = "Run: " + cmd;
    return b;
  }
  function extLink(label, href, cls) {
    var a = h("a", "ext-link" + (cls ? " " + cls : ""));
    a.href = href;
    a.textContent = U.isSet(label) ? label : String(href).replace(/^(https?:\/\/|mailto:|tel:)/i, "");
    if (/^https?:/i.test(href) && a.host !== location.host) {
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      var arr = h("span", "ext-arrow", "↗");
      arr.setAttribute("aria-hidden", "true");
      a.appendChild(arr);
    }
    return a;
  }
  // Returns null when the target is an unset placeholder (links to [[...]] are hidden).
  function linkEl(label, target, cls) {
    target = target == null ? "" : String(target);
    label = label == null ? target : String(label);
    if (!target) return null;
    if (isUrl(target)) return U.isSet(target) && safeUrl(target) ? extLink(label, target, cls) : null;
    return cmdLink(label, target, cls);
  }
  function partNode(p) {
    if (p == null || p === false) return null;
    if (p.nodeType) return p;
    if (typeof p !== "object") {
      var s = String(p);
      return isPh(s) ? h("span", "is-placeholder", s) : doc.createTextNode(s);
    }
    var text = p.text != null ? String(p.text) : String(p.cmd || p.href || "");
    if (p.cmd) return cmdLink(text, p.cmd, p.cls);
    if (p.href) return linkEl(text, p.href, p.cls);
    var sp = h("span", p.cls || null, text);
    if (isPh(text)) sp.classList.add("is-placeholder");
    return sp;
  }
  function appendParts(el, parts) {
    (Array.isArray(parts) ? parts : [parts]).forEach(function (p) { var n = partNode(p); if (n) el.appendChild(n); });
    return el;
  }
  function normPairs(pairs) {
    if (!pairs) return [];
    if (!Array.isArray(pairs)) return Object.keys(pairs).map(function (k) { return { k: k, v: pairs[k] }; });
    return pairs.map(function (p) {
      if (Array.isArray(p)) return { k: p[0], v: p[1] };
      return { k: p.k || p.key || p.label, v: p.v !== undefined ? p.v : p.value, cmd: p.cmd, href: p.href, cls: p.cls };
    });
  }

  // Inline syntax for streamed text: [label](command-or-url), **bold**, `code`.
  var INLINE = /\[\[[^\]]*\]\]|\[([^\]\[]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|`([^`]+)`/g;
  function parseInline(s) {
    var out = [], last = 0, m;
    INLINE.lastIndex = 0;
    while ((m = INLINE.exec(s))) {
      if (m.index > last) out.push({ t: "text", v: s.slice(last, m.index) });
      if (m[1] != null) out.push({ t: "link", v: m[1], to: m[2] });
      else if (m[3] != null) out.push({ t: "b", v: m[3] });
      else if (m[4] != null) out.push({ t: "code", v: m[4] });
      else out.push({ t: "ph", v: m[0] });
      last = INLINE.lastIndex;
    }
    if (last < s.length) out.push({ t: "text", v: s.slice(last) });
    return out;
  }
  function segNode(s, streaming) {
    switch (s.t) {
      case "link":
        var a = linkEl(s.v, s.to);
        if (!a) return doc.createTextNode(s.v);
        if (streaming) a.tabIndex = -1;
        return a;
      case "b": return h("strong", "o-strong", s.v);
      case "code": return h("code", "o-code", s.v);
      case "ph": return h("span", "is-placeholder", s.v);
      default: return doc.createTextNode(s.v);
    }
  }
  var TOKEN = /\s*[^\s]{1,6}|\s+/g;

  function makeOut(b) {
    var body = b.out;
    function add(el) {
      if (!el) return el;
      body.appendChild(el);
      reveal(b, el);
      kick();
      return el;
    }
    function msg(cls, icon, m, sr) {
      var p = h("p", "o-msg " + cls);
      var i = h("span", "o-msg-icon", icon);
      i.setAttribute("aria-hidden", "true");
      p.appendChild(i);
      if (sr) p.appendChild(h("span", "sr-only", sr));
      appendParts(p, m);
      return add(p);
    }
    var out = {
      block: b.el,
      body: body,
      cancelled: function () { return b.isCancelled; },
      // Cancellable pause (0 in reduced motion).
      wait: function (ms) {
        return new Promise(function (r) {
          if (b.isCancelled || !FULL) { r(); return; }
          setTimeout(r, ms || 0);
          b.cancelP.then(r);
        });
      },
      text: function (s, cls) {
        var p = h("p", "o-text" + (cls ? " " + cls : ""), s == null ? "" : String(s));
        if (isPh(s)) p.classList.add("is-placeholder");
        return add(p);
      },
      html: function (markup) { var d = h("div", "o-html"); d.innerHTML = markup == null ? "" : String(markup); return add(d); },
      el: function (node) { return node && node.nodeType ? add(node) : null; },
      line: function (parts, cls) { return add(appendParts(h("p", "o-line" + (cls ? " " + cls : "")), parts)); },
      link: function (label, target, cls) {
        var a = linkEl(label, target, cls);
        if (!a) return null;
        var p = h("p", "o-line o-link-line");
        p.appendChild(a);
        add(p);
        return a;
      },
      kv: function (pairs) {
        var dl = h("dl", "o-kv");
        normPairs(pairs).forEach(function (r) {
          if (r.v == null || r.v === "") return;
          var dd = h("dd", "o-v" + (r.cls ? " " + r.cls : ""));
          if (r.href || r.cmd) {
            var l = linkEl(r.v, r.href || r.cmd);
            if (!l) return;
            dd.appendChild(l);
          } else appendParts(dd, r.v);
          var row = h("div", "o-kv-row");
          row.appendChild(h("dt", "o-k", r.k == null ? "" : String(r.k)));
          row.appendChild(dd);
          dl.appendChild(row);
        });
        return add(dl);
      },
      table: function (rows, opt) {
        opt = opt || {};
        var wrap = h("div", "o-table-wrap"), t = h("table", "o-table" + (opt.cls ? " " + opt.cls : ""));
        if (opt.head) {
          var th = h("thead"), tr = h("tr");
          opt.head.forEach(function (c) { var x = h("th"); x.scope = "col"; appendParts(x, c); tr.appendChild(x); });
          th.appendChild(tr);
          t.appendChild(th);
        }
        var tb = h("tbody");
        (rows || []).forEach(function (r) {
          var tr2 = h("tr");
          (Array.isArray(r) ? r : [r]).forEach(function (c) { tr2.appendChild(appendParts(h("td"), c)); });
          tb.appendChild(tr2);
        });
        t.appendChild(tb);
        wrap.appendChild(t);
        return add(wrap);
      },
      list: function (items, opt) {
        opt = opt || {};
        var l = h(opt.ordered ? "ol" : "ul", "o-list" + (opt.cls ? " " + opt.cls : ""));
        (items || []).forEach(function (it) { l.appendChild(appendParts(h("li"), it)); });
        return add(l);
      },
      pre: function (s, cls) { return add(h("pre", "o-pre" + (cls ? " " + cls : ""), s == null ? "" : String(s))); },
      heading: function (s, cls) { return add(h("p", "o-heading" + (cls ? " " + cls : ""), s == null ? "" : String(s))); },
      gap: function () { var g = h("div", "o-gap"); g.setAttribute("aria-hidden", "true"); return add(g); },
      // Next-step chips: replaces the prompt's chips (and the mobile dock).
      // {inline:true} also renders them inside this block.
      chips: function (list, opt) {
        opt = opt || {};
        b.chipsSet = true;
        if (b === lastBlk || !lastBlk || !lastBlk.el.isConnected) setChips(list);
        if (!opt.inline) return chipsEl;
        var row = h("div", "o-chips");
        row.setAttribute("role", "group");
        row.setAttribute("aria-label", opt.label || "Next steps");
        row.innerHTML = (list || []).map(normChip).filter(Boolean).map(function (c) { return chipHTML(c, ""); }).join("");
        body.appendChild(row);
        kick();
        staggerIn(row.querySelectorAll(".chip"));
        return row;
      },
      error: function (m) { b.err = true; return msg("o-error", "✗", m, "Error: "); },
      success: function (m) { return msg("o-success", "✓", m); },
      hint: function (m) { return msg("o-hint", "›", m); },
      done: function (status) { b.explicit = status === "error" ? "error" : "ok"; },

      // Token-by-token "LLM" streaming. Glyphs are aria-hidden while streaming;
      // on completion the paragraph is swapped for clean final text, which the
      // log announces once. Click the text to skip ahead.
      stream: function (str, o) {
        o = o || {};
        var p = h("p", "o-stream" + (o.cls ? " " + o.cls : ""));
        var segs = parseInline(Array.isArray(str) ? str.join("\n\n") : String(str == null ? "" : str));
        function final() { p.textContent = ""; segs.forEach(function (s) { p.appendChild(segNode(s, false)); }); }
        if (!FULL || b.isCancelled) { final(); add(p); return Promise.resolve(p); }
        body.appendChild(p);
        kick();
        var vis = h("span", "o-stream-vis"), cur = h("span", "stream-cursor");
        vis.setAttribute("aria-hidden", "true");
        cur.setAttribute("aria-hidden", "true");
        p.appendChild(vis);
        p.appendChild(cur);
        p.classList.add("is-streaming");
        var q = [];
        segs.forEach(function (s) {
          if (s.t === "text") (s.v.match(TOKEN) || []).forEach(function (tk) { q.push({ t: "text", v: tk }); });
          else q.push(s);
        });
        var cps = Math.max(10, o.cps || 110), i = 0;
        return new Promise(function (resolve) {
          function end() {
            p.classList.remove("is-streaming");
            p.classList.add("is-streamed");
            final();
            cur.classList.add("is-fading");
            p.appendChild(cur);
            setTimeout(function () { if (cur.parentNode) cur.parentNode.removeChild(cur); }, 600);
            kick();
            resolve(p);
          }
          function tick() {
            if (b.isCancelled || p.__skip || i >= q.length) { end(); return; }
            var tk = q[i++], node = segNode(tk, true);
            if (node.nodeType === 1) node.classList.add("tok-in");
            else { var sp = h("span", "tok-in"); sp.appendChild(node); node = sp; }
            vis.appendChild(node);
            kick();
            var v = tk.v || "", ms = (v.length || 4) / cps * 1000 * (0.55 + Math.random() * 0.9);
            if (/[.!?]["')\]]?\s*$/.test(v)) ms += 140;
            else if (/[,;:—]\s*$/.test(v)) ms += 60;
            if (/\n/.test(v)) ms += 110;
            setTimeout(tick, Math.max(10, ms));
          }
          setTimeout(tick, o.delay != null ? o.delay : 220);
        });
      },

      progress: function (label, ms) {
        var row = h("div", "o-progress");
        row.setAttribute("role", "progressbar");
        row.setAttribute("aria-label", label || "Progress");
        row.setAttribute("aria-valuemin", "0");
        row.setAttribute("aria-valuemax", "100");
        row.setAttribute("aria-valuenow", "0");
        row.innerHTML = '<span class="o-progress-label"></span><span class="o-progress-track" aria-hidden="true"><span class="o-progress-fill"></span></span><span class="o-progress-pct" aria-hidden="true">0%</span>';
        row.firstChild.textContent = label || "";
        var fill = row.querySelector(".o-progress-fill"), pct = row.querySelector(".o-progress-pct"), lastN = -1;
        function set(v) {
          fill.style.transform = "scaleX(" + v + ")";
          var n = Math.round(v * 100);
          if (n === lastN) return;
          lastN = n;
          pct.textContent = n + "%";
          if (n % 10 === 0) row.setAttribute("aria-valuenow", String(n));
        }
        add(row);
        ms = Math.max(200, ms || 1200);
        if (!FULL || b.isCancelled) { set(1); row.classList.add("is-done"); return Promise.resolve(row); }
        return new Promise(function (res) {
          var t0 = now();
          (function f() {
            var t = Math.min(1, (now() - t0) / ms);
            set(1 - Math.pow(1 - t, 2.4));
            if (t < 1 && !b.isCancelled) { requestAnimationFrame(f); return; }
            if (!b.isCancelled) set(1);
            row.classList.add(b.isCancelled ? "is-cancelled" : "is-done");
            res(row);
          })();
        });
      },

      spinner: function (label) {
        var row = h("div", "o-spinner"), g = h("span", "o-spinner-glyph"), tx = h("span", "o-spinner-label", label || "Working…");
        g.setAttribute("aria-hidden", "true");
        row.appendChild(g);
        row.appendChild(tx);
        add(row);
        var F = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏", k = 0, timer = 0, stopped = false;
        if (FULL) { g.textContent = F.charAt(0); timer = setInterval(function () { k = (k + 1) % F.length; g.textContent = F.charAt(k); }, 80); }
        else g.textContent = "…";
        var sp = {
          el: row,
          update: function (l) { tx.textContent = l; return sp; },
          stop: function (finalText, status) {
            if (stopped) return sp;
            stopped = true;
            clearInterval(timer);
            var bad = status === "error";
            row.classList.add(bad ? "is-error" : "is-done");
            g.textContent = bad ? "✗" : "✓";
            if (finalText != null) tx.textContent = finalText;
            pulse(g, POP, 380);
            return sp;
          }
        };
        b.spinners.push(sp);
        return sp;
      }
    };
    return out;
  }

  /* ---- running commands -------------------------------------------------------- */
  function didYouMean(name) {
    // only suggest primary, non-easter-egg names ("foo" should not offer "moo")
    var names = cmdList(true).filter(function (c) { return c && c.name && c.group !== "fun"; })
      .map(function (c) { return c.name; }).sort(function (a, b) { return a.length - b.length; });
    var lw = String(name).toLowerCase(), best = null, bd = Infinity;
    var limit = Math.min(2, Math.max(1, Math.floor(lw.length / 2)));
    names.forEach(function (n) { var d = U.distance(lw, n); if (d < bd) { bd = d; best = n; } });
    if (best && bd <= limit) return best;
    if (lw.length >= 2) {
      var pre = names.filter(function (n) { return n.indexOf(lw) === 0; });
      if (pre.length) return pre[0];
    }
    return null;
  }
  function looksLikeQuestion(line) {
    return /\?\s*$/.test(line) ||
      (/^(who|what|where|when|why|how|does|do|is|are|can|could|tell|show|which|has|have|will|would)\b/i.test(line) && line.split(/\s+/).length >= 2);
  }
  // Plain English that isn't a command goes to gunr-gpt instead of an error:
  // anything question-shaped, or 3+ words starting with an ordinary word.
  function routesToAsk(line) {
    line = String(line || "").trim();
    if (!line || !getCmd("ask")) return false;
    var words = line.split(/\s+/);
    if (getCmd(words[0])) return false;
    if (!/^[a-z][a-z'’-]*[?!.,]?$/i.test(words[0])) return false;
    return looksLikeQuestion(line) || words.length >= 3;
  }
  function unknown(b, name, line, source) {
    var out = makeOut(b);
    out.error(["gsh: command not found: ", { text: name, cls: "o-err-word" }]);
    // A lone question word ("how") is the start of a question, not a typo of "now".
    var qish = looksLikeQuestion(line) || /^(who|what|where|when|why|how|which)\??$/i.test(name);
    var best = qish ? null : didYouMean(name), rest = line.replace(/^\s*\S+/, "");
    if (best) out.line(["did you mean ", { text: best, cmd: best + rest }, "?"], "o-dym");
    if (qish && getCmd("ask")) out.line(["Asking something? ", { text: "ask gunr-gpt", cmd: "ask " + line }], "o-dym");
    out.line([{ text: "› ", cls: "o-msg-icon" }, "type ", { text: "help", cmd: "help" }, " to see everything, or tap a suggestion"], "o-hint");
    out.chips([best, "help", "about", "contact"].filter(Boolean));
    settle(b, "error", 0);
    setPromptStatus("error", 0);
    pulse(promptWrap, SHAKE, 420);
    GOS.emit("command:unknown", { name: name, raw: line, source: source });
    return "error";
  }
  // Mobile: a command that prints to the terminal reveals it by lowering any open
  // sheet, unless it opened a window itself or is flagged `quiet: true`.
  function maybeDismissSheets(spec) {
    if (spec.quiet || !GOS.wm || !GOS.wm.dismissSheets) return;
    var opened = false, off = GOS.on("wm:open", function () { opened = true; });
    setTimeout(function () {
      off();
      if (!opened) { try { GOS.wm.dismissSheets(); } catch (e) { /* ignore */ } }
    }, 90);
  }
  function exec(line, opts) {
    var source = opts.source || "link";
    var argv = parseArgv(line), name = argv[0] || "", spec = getCmd(name), raw = line, routed = false;
    if (!spec && routesToAsk(line)) {
      routed = true; spec = getCmd("ask"); raw = "ask " + line; argv = ["ask"].concat(argv);
    }
    var morph = opts.chained ? null : captureMorph(source, opts.origin);
    if ((source === "typed" || source === "auto") && !opts.chained) {
      input.value = "";
      autoCaret = null;
      hNav = null;
      hideCompletions();
      render();
    }
    var b = newBlock(line);
    if (routed && b.cmdEl) {
      // Show the question as plain text (not a red "unknown command") plus a quiet route note.
      b.cmdEl.innerHTML = '<span class="tok tok-q">' + esc(line) + "</span>";
      var meta = b.head.querySelector(".blk-meta");
      if (meta) meta.insertAdjacentHTML("afterbegin", '<span class="blk-route" title="Answered by gunr-gpt, the built-in assistant">→ gunr-gpt</span>');
    }
    insertBlock(b, morph);
    if (GOS.wm && GOS.wm.focus) { try { GOS.wm.focus("gsh"); } catch (e) { /* ignore */ } }
    if (!spec) return Promise.resolve(unknown(b, name, line, source));
    if (small()) maybeDismissSheets(spec);

    var out = makeOut(b), t0 = now();
    var ctx = {
      name: spec.name, argv: argv, args: argv.slice(1), rest: raw.replace(/^\s*\S+\s*/, ""), raw: raw,
      out: out, term: api, wm: GOS.wm || null, profile: GOS.profile(), util: U,
      origin: opts.origin || null, source: source
    };
    GOS.emit("command", { name: spec.name, argv: argv, source: source, raw: raw, routed: routed });
    running.push(b);
    var p;
    try { p = Promise.resolve(spec.run(ctx)); } catch (e) { p = Promise.reject(e); }
    return Promise.race([p, b.cancelP]).then(function () { return null; }, function (err) {
      if (!b.isCancelled) out.error((err && err.message) || String(err));
      if (window.console && err) console.error("[gsh] " + spec.name, err);
      return "error";
    }).then(function (st) {
      var ms = now() - t0;
      var status = b.isCancelled ? "cancelled" : st === "error" ? "error" : (b.explicit || (b.err ? "error" : "ok"));
      settle(b, status, ms);
      running = running.filter(function (x) { return x !== b; });
      if (b === lastBlk) {
        setPromptStatus(status, ms);
        if (!b.chipsSet) setChips(contextChips(spec.name));
      }
      GOS.emit("command:done", { name: spec.name, argv: argv, source: source, status: status, ms: Math.round(ms) });
      // Return to the prompt unless the command moved focus into a window it opened.
      var a = doc.activeElement;
      if (source === "typed" && (!a || a === doc.body || rootEl.contains(a))) focus();
      return status;
    });
  }
  function run(line, opts) {
    opts = opts || {};
    if (!mount()) return Promise.resolve("error");
    line = String(line == null ? "" : line).trim();
    if (!line) return Promise.resolve("ok");
    pushHist(line);
    var parts = splitChain(line);
    if (parts.length < 2) return exec(line, opts);
    var p = Promise.resolve("ok"), first = true;
    parts.forEach(function (pt) {
      var o = first ? opts : { source: opts.source, chained: true };
      first = false;
      p = p.then(function (st) { return pt.op === "&&" && st !== "ok" ? st : exec(pt.cmd, o); });
    });
    return p;
  }
  // Auto-types a line into the prompt, then runs it (instant in reduced motion).
  function type(line, o) {
    if (!mount()) return Promise.resolve("error");
    line = String(line == null ? "" : line);
    o = o || {};
    if (!FULL) return run(line, { source: "auto" });
    return new Promise(function (res) {
      input.value = "";
      autoCaret = 0;
      field.classList.add("is-autotyping");
      var i = 0;
      (function next() {
        if (i >= line.length) {
          setTimeout(function () {
            field.classList.remove("is-autotyping");
            autoCaret = null;
            res(run(line, { source: "auto" }));
          }, o.pause != null ? o.pause : 280);
          return;
        }
        input.value += line.charAt(i++);
        autoCaret = input.value.length;
        render();
        squash("ins");
        sfx("key");
        var ch = line.charAt(i - 1);
        setTimeout(next, 42 + Math.random() * 58 + (ch === " " ? 70 : 0));
      })();
    });
  }
  function cancel() {
    if (!mounted) return false;
    var b = running[running.length - 1];
    if (b) { cancelBlock(b); return true; }
    var v = input.value;
    if (!v.trim()) { pulse(pchar, SHAKE, 300); return false; }
    var nb = newBlock(v);
    nb.el.classList.add("blk--echo");
    insertBlock(nb, captureMorph("typed"));
    nb.out.appendChild(h("p", "o-cancel", "^C"));
    settle(nb, "cancelled", 0);
    setPromptStatus("cancelled", 0);
    input.value = "";
    hNav = null;
    render();
    return false;
  }
  function clear() {
    if (!mounted) return;
    hideCompletions();
    followEl = null;
    var blocks = [].slice.call(log.children);
    if (!blocks.length) return;
    function gone() {
      var p0 = promptWrap.getBoundingClientRect().top;
      blocks.forEach(function (x) { if (x.parentNode) x.parentNode.removeChild(x); });
      scroller.scrollTop = 0;
      var p1 = promptWrap.getBoundingClientRect().top;
      if (FULL && Math.abs(p0 - p1) > 1) tween(promptWrap, { y: p0 - p1 }, { y: 0 }, { duration: 0.6, ease: "expo.out" });
    }
    if (FULL && window.gsap) {
      window.gsap.to(blocks, { opacity: 0, y: -14, duration: 0.22, ease: "power2.in", stagger: { each: 0.018, from: "end" }, onComplete: gone });
    } else gone();
    GOS.emit("term:clear", {});
  }
  function print(fn, o) {
    o = o || {};
    if (!mount()) return Promise.resolve(null);
    var b = newBlock(o.label || "", { system: true, label: o.label });
    insertBlock(b, null);
    var out = makeOut(b), r;
    try { r = typeof fn === "function" ? fn(out) : (fn != null ? out.text(fn) : null); }
    catch (e) { out.error((e && e.message) || String(e)); }
    return Promise.resolve(r).then(function (v) {
      settle(b, b.err ? "error" : "ok", 0);
      return v;
    }, function (e) {
      out.error((e && e.message) || String(e));
      settle(b, "error", 0);
      return null;
    });
  }
  function focus(o) {
    if (!mounted) return;
    o = o || {};
    if (TOUCH && !o.force) return;
    try { input.focus({ preventScroll: true }); } catch (e) { input.focus(); }
    if (o.force) { revealPrompt(); if (TOUCH) setTimeout(scrollToPrompt, 320); }
  }
  function fill(v) {
    if (!mount()) return;
    focus({ force: true });
    setValue(String(v == null ? "" : v));
    squash("jump");
    hideCompletions();
    scrollToPrompt();
  }
  function setCwd(p) {
    p = String(p || "~");
    if (p === cwd) return;
    var prev = cwd;
    cwd = p;
    if (pathTxt) {
      if (FULL) {
        tween(pathTxt, { opacity: 1, y: 0 }, { opacity: 0, y: -6 }, { duration: 0.14, ease: "power2.in", onComplete: function () {
          pathTxt.textContent = cwd;
          tween(pathTxt, { opacity: 0, y: 7 }, { opacity: 1, y: 0 }, { duration: 0.4, ease: "expo.out" });
        } });
      } else pathTxt.textContent = p;
    }
    if (win && win.setPath) win.setPath(p);
    GOS.emit("term:cwd", { cwd: p, from: prev });
  }

  /* ---- DOM ----------------------------------------------------------------------- */
  function build() {
    var el = h("div", "term");
    el.innerHTML =
      '<div class="term-scroll">' +
        '<div class="term-log" role="log" aria-live="polite" aria-relevant="additions text" aria-label="Terminal output"></div>' +
        '<div class="term-prompt">' +
          '<div class="pl" aria-hidden="true">' +
            '<span class="pl-seg pl-seg--user"><span class="pl-icon">◆</span>guest@gunr</span>' +
            '<span class="pl-seg pl-seg--path"><span class="pl-txt"></span></span>' +
            '<span class="pl-seg pl-seg--git"><span class="pl-icon">⎇</span>main</span>' +
            '<span class="pl-seg pl-seg--status is-idle"></span>' +
            '<span class="pl-fill"></span>' +
            '<span class="pl-right"><span class="pl-time"></span></span>' +
          "</div>" +
          '<div class="prompt-line">' +
            '<span class="prompt-char" aria-hidden="true">❯</span>' +
            '<div class="prompt-field">' +
              '<label class="sr-only" for="gsh-input">Command. Type help and press Enter.</label>' +
              '<div class="prompt-mirror" aria-hidden="true"></div>' +
              '<span class="caret" aria-hidden="true"><span class="caret-core"></span></span>' +
              '<input id="gsh-input" class="prompt-input" type="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="go" aria-describedby="gsh-keys">' +
            "</div>" +
            '<span class="prompt-desc" aria-hidden="true"></span>' +
          "</div>" +
          '<p id="gsh-keys" class="sr-only">Up and Down browse history. Tab or Right arrow accepts a suggestion. Plain-English questions are answered by gunr-gpt. Control K opens the command palette.</p>' +
          '<div class="chips" role="group" aria-label="Suggested commands" hidden></div>' +
        "</div>" +
      "</div>" +
      '<button type="button" class="jump-prompt" tabindex="-1" aria-hidden="true"><span class="jump-prompt-i" aria-hidden="true">↓</span>Back to prompt</button>';
    return el;
  }
  function bind() {
    input.addEventListener("input", function (e) {
      if (idleHint || idleEx) { idleHint = ""; idleEx = ""; }
      idleReset();
      hNav = null;
      hideCompletions();
      squash(/^delete/.test(e.inputType || "") ? "del" : "ins");
      typing();
      render();
      revealPrompt();
    });
    input.addEventListener("keydown", onKey);
    input.addEventListener("focus", function () { field.classList.add("is-focused"); promptWrap.classList.add("is-focused"); render(); });
    input.addEventListener("blur", function () { field.classList.remove("is-focused"); promptWrap.classList.remove("is-focused"); render(); });
    input.addEventListener("scroll", syncCaret);
    ["keyup", "mouseup", "select"].forEach(function (t) { input.addEventListener(t, scheduleRender); });
    doc.addEventListener("selectionchange", function () { if (doc.activeElement === input) scheduleRender(); });

    log.addEventListener("click", function (e) {
      var btn = e.target.closest(".blk-act");
      if (btn) {
        var bel = btn.closest(".blk");
        if (bel && bel.__blk) blockAction(bel.__blk, btn.getAttribute("data-act"), btn);
        return;
      }
      var st = e.target.closest(".o-stream.is-streaming");
      if (st) st.__skip = true;
    });

    // Focus the input from the window: desktop anywhere (unless selecting text or
    // clicking a control); touch only on the prompt area.
    rootEl.addEventListener("click", function (e) {
      var t = e.target;
      if (t.closest("button, a, input, textarea, select, [data-cmd], [contenteditable], summary, label, .o-table-wrap")) return;
      if (TOUCH) { if (t.closest(".term-prompt")) focus({ force: true }); return; }
      if (window.getSelection && String(window.getSelection())) return;
      focus();
    });

    scroller.addEventListener("wheel", function () { manual = true; }, { passive: true });
    scroller.addEventListener("touchmove", function () { manual = true; }, { passive: true });
    // Scrollbar drags land on the scroller itself; keyboard scrolling outside the input.
    scroller.addEventListener("pointerdown", function (e) { if (e.target === scroller) manual = true; });
    scroller.addEventListener("keydown", function (e) {
      if (e.target !== input && /^(PageUp|PageDown|Home|End|ArrowUp|ArrowDown| )$/.test(e.key)) manual = true;
    });
    if (window.ResizeObserver) {
      var roW = 0;
      var ro = new ResizeObserver(function () {
        kick(); syncCaret();
        // width changed with an empty prompt: re-fit the hint
        var w = mirror ? mirror.clientWidth : 0;
        if (w !== roW) { roW = w; if (!input.value) render(); }
      });
      ro.observe(log);
      ro.observe(scroller);
      if (mirror) ro.observe(mirror);
    } else window.addEventListener("resize", kick);
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", function () { if (doc.activeElement === input) scrollToPrompt(); });
    }

    // "Back to prompt" pill while the prompt row is scrolled out of view.
    jumpBtn.addEventListener("click", function () { scrollToPrompt(); focus(); });
    if (window.IntersectionObserver) {
      new IntersectionObserver(function (ents) {
        var off = !ents[ents.length - 1].isIntersecting && log.children.length > 0;
        jumpBtn.classList.toggle("is-on", off);
        if (off) { jumpBtn.removeAttribute("aria-hidden"); jumpBtn.tabIndex = 0; }
        else {
          if (doc.activeElement === jumpBtn) focus();
          jumpBtn.setAttribute("aria-hidden", "true"); jumpBtn.tabIndex = -1;
        }
      }, { root: scroller, threshold: 0 }).observe(promptLine);
    }

    // Ambient cursor spotlight (desktop pointer, full motion only).
    if (FULL && !TOUCH && window.matchMedia && matchMedia("(pointer: fine)").matches) {
      var mx = 0, my = 0, raf = 0;
      rootEl.addEventListener("pointermove", function (e) {
        var r = rootEl.getBoundingClientRect();
        mx = e.clientX - r.left; my = e.clientY - r.top;
        if (!raf) raf = requestAnimationFrame(function () {
          raf = 0;
          rootEl.style.setProperty("--mx", mx + "px");
          rootEl.style.setProperty("--my", my + "px");
        });
      }, { passive: true });
      rootEl.addEventListener("pointerleave", function () { rootEl.style.removeProperty("--mx"); rootEl.style.removeProperty("--my"); });
    }
    GOS.on("command:done", idleReset);
  }
  function mount() {
    if (mounted) return true;
    if (!doc.body) return false;
    mounted = true;
    injectBase();
    rootEl = build();
    scroller = rootEl.querySelector(".term-scroll");
    log = rootEl.querySelector(".term-log");
    promptWrap = rootEl.querySelector(".term-prompt");
    promptLine = rootEl.querySelector(".prompt-line");
    pchar = rootEl.querySelector(".prompt-char");
    field = rootEl.querySelector(".prompt-field");
    mirror = rootEl.querySelector(".prompt-mirror");
    caret = rootEl.querySelector(".caret");
    caretCore = rootEl.querySelector(".caret-core");
    input = rootEl.querySelector(".prompt-input");
    chipsEl = rootEl.querySelector(".chips");
    statusSeg = rootEl.querySelector(".pl-seg--status");
    pathTxt = rootEl.querySelector(".pl-txt");
    timeEl = rootEl.querySelector(".pl-time");
    descEl = rootEl.querySelector(".prompt-desc");
    jumpBtn = rootEl.querySelector(".jump-prompt");
    pathTxt.textContent = cwd;
    timeEl.textContent = clock();

    if (GOS.wm && GOS.wm.open) {
      try {
        win = GOS.wm.open({ id: "gsh", title: "gsh", icon: "❯", kind: "term", size: "main", body: rootEl, label: cwd, closable: false, focus: false });
      } catch (e) { win = null; if (window.console) console.error("[gsh] wm.open failed", e); }
    }
    if (!win || !rootEl.isConnected) (doc.getElementById("wm") || doc.body).appendChild(rootEl);

    bind();
    render();
    setChips(chipList.length ? chipList : contextChips(""));
    idleReset();
    api.ready = true;
    GOS.emit("term:ready", {});
    return true;
  }

  /* ---- global delegation ------------------------------------------------------- */
  function inPalette(el) { return !!(el.closest && el.closest("#palette")); }
  doc.addEventListener("click", function (e) {
    if (e.defaultPrevented || !e.target || !e.target.closest) return;
    var t = e.target;
    var typeBtn = t.closest("[data-term-type]");
    if (typeBtn) { e.preventDefault(); focus({ force: true }); scrollToPrompt(); return; }
    var pal = t.closest("[data-palette]");
    if (pal && !(GOS.palette && GOS.palette.open)) { e.preventDefault(); run("help", { source: "chip", origin: pal }); return; }
    var f = t.closest("[data-cmd-fill]");
    if (f && !inPalette(f)) { e.preventDefault(); fill(f.getAttribute("data-cmd-fill")); return; }
    var c = t.closest("[data-cmd]");
    if (!c || inPalette(c) || c.disabled || c.getAttribute("aria-disabled") === "true") return;
    if (c.tagName === "A" && c.getAttribute("href") && (e.metaKey || e.ctrlKey || e.shiftKey)) return; // let "open in new tab" through
    e.preventDefault();
    c.classList.add("is-fired");
    setTimeout(function () { c.classList.remove("is-fired"); }, 520);
    pulse(c, [{ transform: "scale(.92)" }, { transform: "scale(1.04)", offset: 0.5 }, { transform: "scale(1)" }], 320);
    run(c.getAttribute("data-cmd"), { source: c.closest(".chips, .o-chips, #dock") ? "chip" : "link", origin: c });
  });
  // Desktop: printable keys typed while nothing in particular is focused go to the prompt.
  doc.addEventListener("keydown", function (e) {
    if (TOUCH || !mounted || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
    if (!e.key || e.key.length !== 1) return;
    if (GOS.palette && GOS.palette.isOpen && GOS.palette.isOpen()) return;
    var a = doc.activeElement;
    var idle = !a || a === doc.body || a === doc.documentElement || (win && a === win.el) || a === rootEl ||
      (a.classList && a.classList.contains("blk") && rootEl.contains(a));
    if (!idle) return;
    focus();
    scrollToPrompt();
  });

  /* ---- public API ------------------------------------------------------------------ */
  var api = {
    ready: false,
    run: run,
    type: type,
    clear: clear,
    cancel: cancel,
    focus: focus,
    fill: fill,
    print: print,
    setChips: setChips,
    contextChips: contextChips,
    setCwd: setCwd,
    scrollToPrompt: scrollToPrompt,
    mount: mount,
    running: function () { return running.length > 0; },
    history: function () { return hist.slice(); },
    clearHistory: function () { hist = []; hNav = null; GOS.store.del(HKEY); render(); }
  };
  Object.defineProperty(api, "cwd", { get: function () { return cwd; }, set: setCwd, enumerable: true });
  Object.defineProperty(api, "input", { get: function () { return input || null; }, enumerable: true });
  Object.defineProperty(api, "el", { get: function () { return rootEl || null; }, enumerable: true });
  GOS.term = api;

  GOS.on("os:ready", function () { mount(); });
  // Safety net: if the desktop never boots (script failure), still give people a terminal.
  window.addEventListener("load", function () { setTimeout(function () { if (!mounted) mount(); }, 4000); });
})();
