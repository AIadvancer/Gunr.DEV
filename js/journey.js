/* =============================================================================
 * GUNR.DEV — journey.js
 * Renders every layer of the "forward pass" from window.PROFILE and runs the
 * page: layer rail / progress bar, reveals, the visitor token, section
 * interactions (embedding readout, attention heatmap, loss curve, weights),
 * the output layer (vCard, copy, share, QR), mobile dock and toasts.
 *
 * Public API
 *   window.GUNR_JOURNEY = {
 *     layers: ["layer-input", ... "layer-output"],
 *     goto(target)      id, key ("attention"), alias ("skills"), or index; -> bool
 *     current()         id of the layer in view
 *     setTheme(name)    "green" | "amber" | "cyan"; saved to localStorage "gunr.theme"
 *     selectSkill(name) open a skill in the weights layer and scroll to it
 *     saveContact(), copyEmail(), share(), toast(msg)
 *   }
 *   window.GUNR_TOAST(msg)  shows "> msg" in the status toast
 * ========================================================================== */
(function () {
  "use strict";

  var doc = document;
  var root = doc.documentElement;
  var mount = doc.getElementById("journey");
  var P = window.PROFILE;
  var U = window.GUNR_UTIL;

  if (!mount) return;
  if (!P || !U) {
    mount.innerHTML = '<section class="layer"><div class="wrap"><p class="layer-tag">ERR // CONTENT</p>' +
      "<p>js/content.js did not load. Check it for a missing comma or quote.</p></div></section>";
    return;
  }

  var isSet = U.isSet;
  var esc = U.esc;
  var mq = function (q) { return window.matchMedia ? window.matchMedia(q) : { matches: false }; };
  var reduced = mq("(prefers-reduced-motion: reduce)").matches;
  var conn = navigator.connection || {};
  var saveData = !!conn.saveData;

  /* ---------------------------------------------------------------------------
   * Small helpers
   * ------------------------------------------------------------------------ */
  function $(sel, ctx) { return (ctx || doc).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || doc).querySelectorAll(sel)); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function num(v, d) { return Number(v).toFixed(d); }
  function isPh(v) { return typeof v === "string" && v.indexOf("[[") !== -1; }

  /* Content text: real values escaped, [[placeholders]] shown dimmed. */
  function txt(v, fallback) {
    if (isSet(v)) return esc(v);
    if (isPh(v)) return '<span class="ph" title="Placeholder: edit js/content.js">' + esc(v) + "</span>";
    return fallback || "";
  }

  /* Deterministic 0..1 hash, so generated visuals are stable between visits. */
  function hash(s) {
    var h = 2166136261;
    s = String(s);
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return ((h >>> 0) % 10000) / 10000;
  }

  function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""); }

  function fire(fn) { try { fn(); } catch (e) { /* keep the page alive */ } }

  /* Stroke icons, 24x24. */
  var ICON_PATHS = {
    card: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2.5"/><path d="M5.5 17c.7-1.8 2-2.7 3.5-2.7s2.8.9 3.5 2.7M14.5 9h4M14.5 13h4"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.5 7l8.5 6 8.5-6"/>',
    phone: '<path d="M5 4h3.5l1.8 4.5-2.3 1.4a11 11 0 0 0 6.1 6.1l1.4-2.3L20 15.5V19a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
    linkedin: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 10.5V17M8 7.2v.1M12 17v-6.5M12 13.5a2.5 2.5 0 0 1 5 0V17"/>',
    github: '<path d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21"/>',
    huggingface: '<circle cx="12" cy="12" r="9"/><path d="M8.5 10v.5M15.5 10v.5M8 14.5c1 1.6 2.4 2.4 4 2.4s3-.8 4-2.4"/>',
    x: '<path d="M4 4l16 16M20 4L4 20"/>',
    web: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.7 5.6 3.7 9s-1.2 6.4-3.7 9c-2.5-2.6-3.7-5.6-3.7-9S9.5 5.6 12 3z"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h8"/>',
    share: '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4"/>',
    print: '<path d="M7 9V3h10v6M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2"/><rect x="7" y="14" width="10" height="7"/>',
    ext: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    down: '<path d="M12 4v16M6 14l6 6 6-6"/>'
  };
  function icon(name) {
    return '<svg class="icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
      (ICON_PATHS[name] || ICON_PATHS.web) + "</svg>";
  }

  /* Load an image off-DOM-visible and reveal it only once it has loaded. */
  function mediaImg(src, cls, alt) {
    if (!isSet(src)) return null;
    var img = new Image();
    img.decoding = "async";
    img.alt = alt || "";
    img.className = cls;
    img.addEventListener("load", function () { img.classList.add("is-loaded"); });
    img.addEventListener("error", function () { if (img.parentNode) img.parentNode.removeChild(img); });
    img.src = src;
    return img;
  }

  /* ---------------------------------------------------------------------------
   * Derived data
   * ------------------------------------------------------------------------ */
  var NAME = U.fullName(P) || "Visitor";
  var HANDLE = isSet(P.handle) ? String(P.handle) : "";
  var SITE_URL = isSet(P.siteUrl) ? String(P.siteUrl) : "";
  var A = P.assets || {};
  var research = arr(P.research);
  var experience = arr(P.experience);
  var groups = arr(P.skills).filter(function (g) { return g && arr(g.items).length; });
  var traits = arr(P.traits);
  var links = arr(P.links).filter(function (l) { return l && isSet(l.url); });

  var skills = [];
  groups.forEach(function (g, gi) {
    arr(g.items).forEach(function (it, ii) {
      if (it && isSet(it.name)) skills.push({ name: it.name, level: clamp(Number(it.level) || 0, 0, 1), note: it.note, group: g.group, id: "w-" + gi + "-" + ii });
    });
  });
  var skillByName = {};
  skills.forEach(function (s) { skillByName[s.name.toLowerCase()] = s; });

  function linkBy(iconName) {
    for (var i = 0; i < links.length; i++) if (links[i].icon === iconName) return links[i];
    return null;
  }

  var LAYERS = [
    { id: "layer-input", key: "input", name: "INPUT", title: "Identity", state: "x = <visitor>", aliases: ["hero", "identity", "home", "top", "start", "intro"] },
    { id: "layer-embedding", key: "embedding", name: "EMBEDDING", title: "About", state: "e = E[x]", aliases: ["about", "bio", "emb", "embed"] },
    { id: "layer-attention", key: "attention", name: "ATTENTION", title: "AI research", state: "softmax(QK\u1D40)V", aliases: ["research", "attn", "ai", "projects"] },
    { id: "layer-hidden", key: "hidden", name: "HIDDEN LAYERS", title: "Experience", state: "h = \u03C3(Wh + b)", aliases: ["experience", "exp", "work", "training", "log", "career", "hidden-layers"] },
    { id: "layer-weights", key: "weights", name: "WEIGHTS", title: "Skills & stack", state: "\u03B8 \u2208 \u211D\u207F", aliases: ["skills", "stack", "skill"] },
    { id: "layer-output", key: "output", name: "OUTPUT", title: "Let\u2019s connect", state: "argmax \u2192 \u201Cconnect\u201D", aliases: ["contact", "connect", "out", "end"] }
  ];
  // One coherent forward pass (d_model = 768); content counts are annotations.
  var SYNAPSE_OPS = ["embed(x)", "attn(e)", "mlp(h)", "load(θ)", "lm_head(h)"];

  /* Contact actions: the core four (save/email/call/linkedin), only when set. */
  function coreActions() {
    var a = [];
    if (window.GUNR_VCARD) a.push({ key: "save", label: "Save Contact", short: "Save", icon: "card", primary: true });
    if (isSet(P.email)) a.push({ key: "email", label: "Email", short: "Email", icon: "mail", href: "mailto:" + String(P.email).trim() });
    var tel = U.telHref(P.phone);
    if (tel) a.push({ key: "call", label: "Call", short: "Call", icon: "phone", href: tel });
    var li = linkBy("linkedin");
    if (li) a.push({ key: "linkedin", label: "LinkedIn", short: "LinkedIn", icon: "linkedin", href: li.url, ext: true });
    return a;
  }

  /* Hero + dock: core actions, topped up with other real links (e.g. GitHub). */
  function primaryActions(max) {
    var a = coreActions();
    for (var i = 0; i < links.length && a.length < max; i++) {
      var l = links[i];
      if (l.icon === "linkedin") continue;
      a.push({ key: "link-" + slug(l.label || l.icon), label: l.label || "Link", short: l.label || "Link", icon: l.icon, href: l.url, ext: true });
    }
    return a.slice(0, max);
  }

  function actionHTML(a, cls, useShort) {
    var label = esc(useShort ? a.short || a.label : a.label);
    var c = cls + (a.primary ? " is-primary" : "");
    if (a.href) {
      return '<a class="' + c + '" href="' + esc(a.href) + '" data-kind="' + esc(a.key) + '"' +
        (a.ext ? ' target="_blank" rel="noopener"' : "") + ">" + icon(a.icon) + "<span>" + label + "</span></a>";
    }
    return '<button type="button" class="' + c + '" data-action="' + esc(a.key) + '">' + icon(a.icon) + "<span>" + label + "</span></button>";
  }

  /* ---------------------------------------------------------------------------
   * Markup builders
   * ------------------------------------------------------------------------ */
  function panelBar(file, right) {
    return '<div class="panel-bar"><span class="dots" aria-hidden="true"><i></i><i></i><i></i></span>' +
      '<span class="panel-file">' + esc(file) + "</span>" + (right ? '<span class="panel-right">' + right + "</span>" : "") + "</div>";
  }

  function layerHead(L, i, shape) {
    return '<header class="layer-head" data-reveal-group>' +
      '<p class="layer-tag" data-reveal>LAYER ' + pad2(i) + " <span>//</span> " + esc(L.name) + "</p>" +
      '<h2 id="h-' + L.key + '" class="layer-title" tabindex="-1" data-reveal>' + esc(L.title) + "</h2>" +
      '<p class="layer-shape" data-reveal>shape: ' + esc(shape) + ' <span class="layer-op">· ' + esc(L.state) + "</span></p></header>";
  }

  function section(L, i, shape, inner) {
    return '<section id="' + L.id + '" class="layer layer--' + L.key + '" data-layer="' + i + '" aria-labelledby="h-' + L.key + '">' +
      '<div class="layer-bg" data-bg="' + L.key + '" aria-hidden="true"></div>' +
      '<div class="wrap">' + layerHead(L, i, shape) + inner + "</div></section>";
  }

  function synapse(i) {
    var dots = "";
    for (var k = 1; k < 6; k++) dots += '<b style="left:' + (k * 16.66).toFixed(2) + '%"></b>';
    return '<div class="synapse" aria-hidden="true" data-synapse>' +
      '<div class="wrap synapse-wrap"><span class="synapse-op">' + SYNAPSE_OPS[i] + "</span>" +
      '<span class="synapse-line">' + dots + '<i class="synapse-pulse"></i></span>' +
      '<span class="synapse-to">\u2192 L' + pad2(i + 1) + "</span></div></div>";
  }

  /* ---- Layer 00 · INPUT ---------------------------------------------------- */
  function renderInput() {
    var L = LAYERS[0];
    var n = P.name || {};
    var initials = ((isSet(n.first) ? n.first.charAt(0) : "") + (isSet(n.last) ? n.last.charAt(0) : "")).toUpperCase() || "G";
    var first = isSet(n.first) ? esc(n.first) : "";
    var last = isSet(n.last) ? esc(n.last) : "";
    var meta = [];
    if (HANDLE) meta.push('<li><span class="k">handle</span> ' + esc(HANDLE) + "</li>");
    if (isSet(P.location) || isPh(P.location)) meta.push('<li><span class="k">loc</span> ' + txt(P.location) + "</li>");
    meta.push('<li><span class="k">status</span> <span class="live">online</span></li>');

    var role = "";
    if (isSet(P.title)) role += '<span class="hero-title">' + esc(P.title) + "</span>";
    if (isSet(P.company)) role += ' <span class="at" aria-hidden="true">@</span><span class="sr-only"> at </span> <span class="hero-company">' + esc(P.company) + "</span>";
    if (isSet(P.companyNote)) role += ' <span class="hero-note">// ' + esc(P.companyNote) + "</span>";

    return '<section id="' + L.id + '" class="layer layer--input hero" data-layer="0" aria-labelledby="h-input">' +
      '<div class="hero-media" id="hero-media" aria-hidden="true"><div class="hero-grid"></div><div class="hero-glow"></div></div>' +
      '<div class="wrap hero-inner" data-reveal-group data-hook="hero">' +
        '<p class="layer-tag" data-reveal>LAYER 00 <span>//</span> INPUT <span class="layer-shape-inline">shape: [1, 1] · int64 · id=1337 <span class="layer-op">· ' + esc(L.state) + "</span></span></p>" +
        '<div class="hero-id">' +
          '<div class="avatar" id="avatar" data-reveal><span class="avatar-mono" aria-hidden="true">' + esc(initials) + "</span></div>" +
          '<div class="hero-id-text">' +
            '<p class="hero-prompt" data-reveal><span class="dim">&gt; tokenize(</span><span class="token-pill" id="hero-token">&lt;visitor&gt;</span><span class="dim">) → 1337</span></p>' +
            '<h1 id="h-input" class="hero-name" tabindex="-1" aria-label="' + esc(NAME) + '" data-reveal>' +
              '<span class="hero-first" data-scramble aria-hidden="true">' + first + '</span> <span class="hero-last" data-scramble aria-hidden="true">' + last + "</span></h1>" +
          "</div>" +
        "</div>" +
        (role ? '<p class="hero-role" data-reveal>' + role + "</p>" : "") +
        (isSet(P.tagline) || isPh(P.tagline) ? '<p class="hero-tagline" data-reveal>' + txt(P.tagline) + "</p>" : "") +
        '<ul class="hero-meta" data-reveal>' + meta.join("") + "</ul>" +
        '<div class="actions hero-actions" id="hero-actions" data-reveal>' +
          primaryActions(4).map(function (a) { return actionHTML(a, "btn"); }).join("") +
        "</div>" +
        '<a class="scroll-cue" href="#layer-embedding" data-reveal><span>run forward pass</span>' + icon("down") + "</a>" +
      "</div></section>";
  }

  /* ---- Layer 01 · EMBEDDING ------------------------------------------------ */
  function renderEmbedding() {
    var L = LAYERS[1];
    var bio = arr(P.bio).map(function (p) { return '<p data-reveal>' + txt(p) + "</p>"; }).join("");
    var dims = traits.map(function (t) {
      var v = clamp(Number(t.value) || 0, 0, 1);
      var d = v * 2 - 1; // map 0..1 onto a signed embedding dimension
      return { name: t.name, d: d };
    });
    var norm = Math.sqrt(dims.reduce(function (s, x) { return s + x.d * x.d; }, 0));

    var vector = dims.map(function (x) {
      return '<span class="emb-num" data-num="' + num(x.d, 2) + '">' + num(x.d, 2) + "</span>";
    }).join('<span class="dim">, </span>');

    var rows = dims.map(function (x) {
      var a = Math.abs(x.d) * 50;
      var left = x.d >= 0 ? 50 : 50 - a;
      return '<li class="emb-dim' + (x.d < 0 ? " is-neg" : "") + '" data-reveal>' +
        '<span class="emb-name">' + esc(x.name) + "</span>" +
        '<span class="emb-bar" aria-hidden="true"><i style="left:' + left.toFixed(1) + "%;width:" + a.toFixed(1) + '%"></i></span>' +
        '<span class="emb-val">' + (x.d >= 0 ? "+" : "\u2212") + num(Math.abs(x.d), 2) + "</span></li>";
    }).join("");

    var inner = '<div class="emb-grid">' +
      '<article class="panel emb-bio" data-reveal-group>' + panelBar("about.md") +
        '<div class="panel-body prose">' + bio + "</div></article>" +
      '<aside class="panel emb-vec" data-reveal-group data-hook="emb" aria-label="Embedding readout">' + panelBar("embedding.npy", "dim=" + dims.length) +
        '<div class="panel-body">' +
          '<p class="emb-eq" data-reveal><span class="dim">emb(</span><span class="accent">&lt;visitor&gt;</span><span class="dim">) =</span></p>' +
          '<p class="emb-vector" data-reveal aria-hidden="true"><span class="dim">[</span>' + vector + '<span class="dim">]</span></p>' +
          '<ul class="emb-dims">' + rows + "</ul>" +
          '<p class="emb-foot" data-reveal><span class="dim">\u2016e\u2016\u2082 =</span> ' + num(norm, 3) + ' <span class="dim">\u00B7 dtype=float16 \u00B7 traits mapped to [\u22121, 1]</span></p>' +
        "</div></aside></div>";

    return section(L, 1, "[1, 1, 768] · showing " + dims.length + " dims", inner);
  }

  /* ---- Layer 02 · ATTENTION ------------------------------------------------ */
  var attnKeys = [];
  function attends(q, key) {
    var list = arr(research[q] && research[q].attends);
    for (var i = 0; i < list.length; i++) if (String(list[i]).toLowerCase() === key.toLowerCase()) return true;
    return false;
  }
  function attnWeight(q, key) {
    return attends(q, key) ? 0.62 + 0.36 * hash(q + "|" + key) : 0.03 + 0.14 * hash(key + "|" + q);
  }

  function renderAttention() {
    var L = LAYERS[2];
    var seen = {};
    research.forEach(function (r) {
      arr(r.attends).forEach(function (k) {
        var low = String(k).toLowerCase();
        if (isSet(k) && !seen[low]) { seen[low] = 1; attnKeys.push(skillByName[low] ? skillByName[low].name : String(k)); }
      });
    });
    if (!attnKeys.length) attnKeys = skills.slice(0, 8).map(function (s) { return s.name; });

    var cards = research.map(function (r, q) {
      var chips = arr(r.attends).map(function (k) { return { k: String(k), w: attnWeight(q, String(k)) }; })
        .sort(function (a, b) { return b.w - a.w; })
        .map(function (c) {
          return '<li class="chip" style="--w:' + c.w.toFixed(2) + '">' + esc(c.k) + " <b>" + num(c.w, 2).slice(1) + "</b></li>";
        }).join("");
      var tags = arr(r.tags).filter(isSet).map(function (t) { return "<li>#" + esc(t) + "</li>"; }).join("");
      return '<article class="panel attn-card" data-q="' + q + '" data-reveal-group>' +
        panelBar("research_" + pad2(q + 1) + ".ipynb", txt(r.year)) +
        '<div class="panel-body">' +
          '<p class="attn-q" data-reveal>q<sub>' + (q + 1) + "</sub> <span class=\"dim\">\u00B7 query</span></p>" +
          '<h3 class="attn-title" data-reveal>' + txt(r.title, "Untitled") + "</h3>" +
          (r.summary ? '<p class="attn-sum" data-reveal>' + txt(r.summary) + "</p>" : "") +
          (tags ? '<ul class="tags" data-reveal>' + tags + "</ul>" : "") +
          (chips ? '<div class="attn-attends" data-reveal><span class="dim">attends \u2192</span><ul class="chips">' + chips + "</ul></div>" : "") +
          '<div class="attn-actions" data-reveal>' +
            '<button type="button" class="btn btn--sm btn--ghost" data-attend="' + q + '" aria-pressed="false">focus attention</button>' +
            (isSet(r.link) ? '<a class="btn btn--sm btn--ghost" href="' + esc(r.link) + '" target="_blank" rel="noopener">open ' + icon("ext") + "</a>" : "") +
          "</div>" +
        "</div></article>";
    }).join("");

    if (!research.length) {
      cards = '<p class="panel panel-body dim" data-reveal>No research entries yet. Add them to js/content.js.</p>';
    }

    var head = '<tr><td></td>' + research.map(function (r, q) { return '<th scope="col">q<sub>' + (q + 1) + "</sub></th>"; }).join("") + "</tr>";
    var body = attnKeys.map(function (k, ki) {
      var cells = research.map(function (r, q) {
        var w = attnWeight(q, k);
        return '<td class="heat-cell' + (w >= 0.5 ? " is-high" : "") + '" data-q="' + q + '" style="--w:' + w.toFixed(2) + '"><span>' + num(w, 2).slice(1) + "</span></td>";
      }).join("");
      var hasNode = !!skillByName[k.toLowerCase()];
      var label = hasNode
        ? '<button type="button" class="heat-key" data-skill="' + esc(k) + '" title="Show in weights">' + esc(k) + '<span class="sr-only">, show in weights</span></button>'
        : '<span class="heat-key">' + esc(k) + "</span>";
      return '<tr data-k="' + ki + '"><th scope="row">' + label + "</th>" + cells + "</tr>";
    }).join("");

    var map = research.length ? '<aside class="panel attn-map" data-reveal-group aria-label="Attention heatmap">' +
      panelBar("attn_head_0.viz", "keys=" + attnKeys.length) +
      '<div class="panel-body">' +
        '<table class="heat" data-reveal><caption class="sr-only">Attention weights: research projects (columns) against skills (rows)</caption>' +
          "<thead>" + head + "</thead><tbody>" + body + "</tbody></table>" +
        '<p class="heat-legend" data-reveal><span class="dim">low</span><span class="heat-scale" aria-hidden="true"></span><span class="dim">high</span>' +
          '<span class="heat-hint">hover or focus a card \u00B7 tap a skill to inspect its weight</span></p>' +
      "</div></aside>" : "";

    var inner = '<div class="attn-grid"><div class="attn-cards">' + cards + "</div>" + map + "</div>";
    return section(L, 2, "[1, " + research.length + " heads, 1, " + attnKeys.length + "]", inner);
  }

  /* ---- Layer 03 · HIDDEN (experience as a training log) -------------------- */
  var LOSS_STEPS = 14;
  var lossPts = [];   // [{x, y, v}] in viewBox units
  var lossLen = 0;

  function lossAnchors() {
    var a = [1];
    experience.forEach(function (e, i) {
      var v = Number(e.loss);
      a.push(isFinite(v) && v > 0 ? clamp(v, 0.01, 1) : 0.9 * Math.pow(0.45, i + 1));
    });
    return a;
  }

  function lossSVG() {
    var E = Math.max(1, experience.length);
    var anchors = lossAnchors();
    var VW = 360, VH = 200, pl = 34, pr = 12, pt = 16, pb = 26;
    var N = E * LOSS_STEPS;
    var X = function (k) { return pl + (k / N) * (VW - pl - pr); };
    var Y = function (v) { return pt + (1 - v / 1.05) * (VH - pt - pb); };
    var K = 3.2, norm = 1 - Math.exp(-K);

    lossPts = [];
    var val = [];
    for (var e = 0; e < E; e++) {
      var a = anchors[e], b = anchors[e + 1] !== undefined ? anchors[e + 1] : a * 0.5;
      var ft = experience[e] && experience[e].event === "fine-tune";
      for (var s = e === 0 ? 0 : 1; s <= LOSS_STEPS; s++) {
        var t = s / LOSS_STEPS;
        var v = a + (b - a) * (1 - Math.exp(-K * t)) / norm;
        if (s > 0 && s < LOSS_STEPS) v += (hash("n" + e + "_" + s) - 0.5) * 0.07 * a;
        if (ft && s > 0 && s < 5) v += 0.07 * Math.exp(-(s - 1)); // spike as the fine-tune starts
        v = clamp(v, 0.005, 1.04);
        var k = e * LOSS_STEPS + s;
        lossPts.push({ x: X(k), y: Y(v), v: v });
        val.push({ x: X(k), y: Y(clamp(v + 0.035 + (hash("v" + k) - 0.5) * 0.04, 0, 1.04)) });
      }
    }
    var toD = function (pts) {
      return pts.map(function (p, i) { return (i ? "L" : "M") + p.x.toFixed(1) + " " + p.y.toFixed(1); }).join("");
    };
    lossLen = 0;
    for (var i = 1; i < lossPts.length; i++) lossLen += Math.hypot(lossPts[i].x - lossPts[i - 1].x, lossPts[i].y - lossPts[i - 1].y);
    var valLen = 0;
    for (i = 1; i < val.length; i++) valLen += Math.hypot(val[i].x - val[i - 1].x, val[i].y - val[i - 1].y);

    var grid = "";
    [0.25, 0.5, 0.75, 1].forEach(function (g) {
      grid += '<line x1="' + pl + '" x2="' + (VW - pr) + '" y1="' + Y(g).toFixed(1) + '" y2="' + Y(g).toFixed(1) + '"/>' +
        '<text x="' + (pl - 6) + '" y="' + (Y(g) + 3).toFixed(1) + '" text-anchor="end">' + g.toFixed(2) + "</text>";
    });
    var ticks = "", marks = "", ftLines = "";
    for (e = 0; e < E; e++) {
      var xe = X((e + 1) * LOSS_STEPS);
      ticks += '<text x="' + xe.toFixed(1) + '" y="' + (VH - 8) + '" text-anchor="middle">e' + pad2(e + 1) + "</text>";
      var pe = lossPts[Math.min(lossPts.length - 1, (e + 1) * LOSS_STEPS)];
      marks += '<circle class="loss-mark" data-epoch="' + e + '" cx="' + pe.x.toFixed(1) + '" cy="' + pe.y.toFixed(1) + '" r="3.2"/>';
      if (experience[e] && experience[e].event === "fine-tune") {
        var xf = X(e * LOSS_STEPS);
        ftLines += '<line class="loss-ft" x1="' + xf.toFixed(1) + '" x2="' + xf.toFixed(1) + '" y1="' + pt + '" y2="' + (VH - pb) + '"/>' +
          '<text class="loss-ft-label" x="' + (xf + 4).toFixed(1) + '" y="' + (pt + 9) + '">fine-tune</text>';
      }
    }
    var first = anchors[0], lastV = lossPts[lossPts.length - 1].v;
    var label = "Training loss falling from " + num(first, 2) + " to " + num(lastV, 2) + " over " + E + " epochs";

    return '<svg class="loss-svg" viewBox="0 0 ' + VW + " " + VH + '" role="img" aria-label="' + esc(label) + '">' +
      '<g class="loss-grid">' + grid + ticks + "</g>" + ftLines +
      '<path class="loss-val" d="' + toD(val) + '" style="stroke-dasharray:' + valLen.toFixed(1) + ";stroke-dashoffset:" + valLen.toFixed(1) + '" data-len="' + valLen.toFixed(1) + '"/>' +
      '<path class="loss-train-glow" d="' + toD(lossPts) + '" style="stroke-dasharray:' + lossLen.toFixed(1) + ";stroke-dashoffset:" + lossLen.toFixed(1) + '"/>' +
      '<path class="loss-train" d="' + toD(lossPts) + '" style="stroke-dasharray:' + lossLen.toFixed(1) + ";stroke-dashoffset:" + lossLen.toFixed(1) + '"/>' +
      marks +
      '<circle class="loss-halo" r="9" cx="' + lossPts[0].x.toFixed(1) + '" cy="' + lossPts[0].y.toFixed(1) + '"/>' +
      '<circle class="loss-head" r="4" cx="' + lossPts[0].x.toFixed(1) + '" cy="' + lossPts[0].y.toFixed(1) + '"/>' +
      '<text class="loss-axis" x="' + pl + '" y="10">loss</text></svg>';
  }

  function renderHidden() {
    var L = LAYERS[3];
    var E = experience.length;
    var model = slug((P.name && P.name.first) || HANDLE || "model") || "model";

    var epochs = experience.map(function (x, i) {
      var ft = x.event === "fine-tune";
      var prev = i > 0 ? experience[i - 1] : null;
      var end = String(x.end || "").toLowerCase() === "present" ? '<span class="live">present</span>' : txt(x.end);
      var loss = Number(x.loss);
      var hl = arr(x.highlights).map(function (h) { return "<li>" + txt(h) + "</li>"; }).join("");
      return '<li class="epoch' + (ft ? " is-finetune" : "") + '" data-epoch="' + i + '" data-reveal-group>' +
        (ft ? '<p class="ft-event" data-reveal><span class="ft-tag">fine-tune</span> ' +
          (prev && isSet(prev.org) ? esc(prev.org) + " \u2192 " : "") + txt(x.org) + "</p>" : "") +
        '<h3 class="epoch-head" data-reveal><span class="epoch-n">epoch ' + pad2(i + 1) + "/" + pad2(E) + "</span>" +
          '<span class="sep" aria-hidden="true">\u00B7</span><span class="epoch-org">' + txt(x.org) + "</span>" +
          (x.role ? '<span class="sep" aria-hidden="true">\u00B7</span><span class="epoch-role">' + txt(x.role) + "</span>" : "") + "</h3>" +
        '<p class="epoch-meta" data-reveal><span>' + txt(x.start, "?") + " \u2013 " + (end || "?") + "</span>" +
          (isFinite(loss) && loss > 0 ? '<span class="epoch-loss">loss=' + num(loss, 3) + "</span>" : "") + "</p>" +
        (x.summary ? '<p class="epoch-sum" data-reveal>' + txt(x.summary) + "</p>" : "") +
        (hl ? '<ul class="epoch-hl" data-reveal>' + hl + "</ul>" : "") +
      "</li>";
    }).join("");

    var inner = '<div class="exp-grid">' +
      '<div class="exp-chart-col"><figure class="panel exp-chart" id="loss-chart" data-reveal-group>' +
        panelBar("loss_curve.svg", '<span id="loss-readout">loss 1.000</span>') +
        '<div class="panel-body" data-reveal>' + lossSVG() + "</div>" +
        '<figcaption class="exp-legend" data-reveal><span class="lg lg-train"></span>train <span class="lg lg-val"></span>val <span class="lg lg-ft"></span>fine-tune</figcaption>' +
      "</figure></div>" +
      '<div class="panel exp-log">' + panelBar("train.log", "epochs=" + E) +
        '<div class="panel-body">' +
          '<p class="log-cmd" data-reveal>$ python train.py --model ' + esc(model) + " --epochs " + E + "</p>" +
          '<ol class="epochs">' + epochs + "</ol>" +
          '<p class="log-done" data-reveal><span class="accent">\u2713</span> checkpoint saved <span class="dim">\u00B7 still training \u00B7 lr=3e-4</span></p>' +
        "</div></div></div>";

    return section(L, 3, "[1, 1, 3072] × " + E + " epochs", inner);
  }

  /* ---- Layer 04 · WEIGHTS -------------------------------------------------- */
  function renderWeights() {
    var L = LAYERS[4];
    var mean = skills.length ? skills.reduce(function (s, x) { return s + x.level; }, 0) / skills.length : 0;

    var panels = groups.map(function (g, gi) {
      var rows = arr(g.items).map(function (it, ii) {
        if (!it || !isSet(it.name)) return "";
        var lv = clamp(Number(it.level) || 0, 0, 1);
        var id = "w-" + gi + "-" + ii;
        return '<li class="w-row" data-reveal data-skill-row="' + esc(String(it.name).toLowerCase()) + '">' +
          '<button type="button" class="w-node" aria-expanded="false" aria-controls="' + id + '" style="--l:' + lv.toFixed(2) + '">' +
            '<span class="w-dot" aria-hidden="true"></span>' +
            '<span class="w-name">' + esc(it.name) + "</span>" +
            '<span class="w-val"><span class="sr-only">weight </span>' + num(lv, 2) + "</span>" +
            '<span class="w-bar" aria-hidden="true"><i></i></span>' +
          "</button>" +
          '<p class="w-note" id="' + id + '" hidden><span class="dim">// </span>' + txt(it.note, "no note") + "</p></li>";
      }).join("");
      return '<section class="panel w-group" aria-labelledby="wg-' + gi + '" data-reveal-group>' +
        panelBar("weights/" + slug(g.group) + ".pt", "[" + arr(g.items).length + "]") +
        '<div class="panel-body"><h3 id="wg-' + gi + '" class="w-group-title" data-reveal>' + txt(g.group) + "</h3>" +
        '<ul class="w-list">' + rows + "</ul></div></section>";
    }).join("");

    var inner = '<p class="w-summary" data-reveal>\u03B8: ' + skills.length + " params across " + groups.length +
      " groups <span class=\"dim\">\u00B7 mean w = " + num(mean, 2) + " \u00B7 tap a node to inspect</span></p>" +
      '<div class="w-grid">' + panels + "</div>";
    return section(L, 4, "θ: " + skills.length + " params / " + groups.length + " groups", inner);
  }

  /* ---- Layer 05 · OUTPUT --------------------------------------------------- */
  var LOGITS = [["Let\u2019s connect", 0.87], ["Save contact", 0.06], ["Send an email", 0.04], ["Share this card", 0.02], ["<eos>", 0.01]];

  function renderOutput() {
    var L = LAYERS[5];
    var logits = LOGITS.map(function (l, i) {
      return '<li class="logit' + (i === 0 ? " is-top" : "") + '" data-reveal style="--p:' + l[1] + '">' +
        '<code>\u201C' + esc(l[0]) + "\u201D</code>" +
        '<span class="logit-bar" aria-hidden="true"><i></i></span><span class="logit-p">' + num(l[1], 2) + "</span></li>";
    }).join("");

    var actions = coreActions();
    for (var ai = 0; ai < actions.length; ai++) {
      if (actions[ai].key === "email") { actions.splice(ai + 1, 0, { key: "copy-email", label: "Copy email", icon: "copy" }); break; }
    }
    var actionsHTML = actions.map(function (a) { return actionHTML(a, "btn btn--lg"); }).join("");

    var others = links.filter(function (l) { return l.icon !== "linkedin"; }).map(function (l) {
      return '<a class="btn btn--ghost" href="' + esc(l.url) + '" target="_blank" rel="noopener">' + icon(l.icon) + "<span>" + esc(l.label || l.icon) + "</span></a>";
    }).join("");
    others += '<button type="button" class="btn btn--ghost" data-action="share">' + icon("share") + "<span>Share this card</span></button>";
    others += '<a class="btn btn--ghost" href="card.html">' + icon("print") + "<span>Printable card</span></a>";

    // The QR library loads async; the box is filled now or on gunr:qr-ready (setupQr).
    var qrHTML = SITE_URL ? '<aside class="panel out-qr" id="out-qr" data-reveal-group aria-label="Share via QR code">' + panelBar("qr.svg", "ecc=M") +
      '<div class="panel-body"><div class="qr-box is-pending" id="qr-box" data-reveal></div>' +
      '<p class="qr-url" data-reveal>' + esc(SITE_URL.replace(/^https?:\/\//, "").replace(/\/$/, "")) + "</p>" +
      '<p class="qr-hint" data-reveal>Show this to a friend: scan to run the forward pass.</p></div></aside>' : "";

    var inner = '<div class="out-grid' + (SITE_URL ? "" : " no-qr") + '" id="out-grid"><div class="out-main">' +
      '<div class="panel logits" data-reveal-group data-hook="out">' + panelBar("generate.py", "T=0.7") +
        '<div class="panel-body"><p class="log-cmd" data-reveal>&gt; generation complete \u00B7 sampling next token</p>' +
        '<ol class="logits-list" aria-label="Next-token probabilities">' + logits + "</ol></div></div>" +
      (isSet(P.availability) ? '<p class="out-avail" data-reveal><span class="live-dot" aria-hidden="true"></span>' + esc(P.availability) + "</p>" : "") +
      '<div class="actions out-actions" id="out-actions" data-reveal>' + actionsHTML + "</div>" +
      '<div class="actions out-links" data-reveal>' + others + "</div>" +
      "</div>" + qrHTML + "</div>";

    return section(L, 5, "[1, 50257] \u2192 argmax", inner);
  }

  function renderRail() {
    var rail = doc.getElementById("rail");
    if (!rail) return;
    var n = LAYERS.length - 1;
    var items = LAYERS.map(function (L, i) {
      return '<li style="top:' + ((i / n) * 100).toFixed(2) + '%"><a class="rail-node" href="#' + L.id + '" data-i="' + i + '">' +
        '<span class="rail-dot" aria-hidden="true"></span><span class="rail-label"><b>' + pad2(i) + "</b> " + esc(L.name) + "</span></a></li>";
    }).join("");
    rail.innerHTML = '<div class="rail-inner">' +
      '<a class="rail-brand" href="#layer-input" aria-label="Back to the input layer">' + esc((HANDLE || "G").charAt(0)) + "<span>//</span></a>" +
      '<div class="rail-track" id="rail-track"><span class="rail-line"></span><span class="rail-fill" id="rail-fill"></span>' +
      '<ol class="rail-list">' + items + "</ol>" +
      '<span class="rail-token" id="rail-token" aria-hidden="true"></span></div>' +
      '<p class="rail-state" id="rail-state" aria-hidden="true"></p></div>';
  }

  function renderDock() {
    var dock = doc.getElementById("dock");
    if (!dock) return;
    var acts = primaryActions(4);
    if (!acts.length) { dock.parentNode.removeChild(dock); return; }
    dock.innerHTML = acts.map(function (a) { return actionHTML(a, "dock-btn", true); }).join("");
    dock.style.setProperty("--n", acts.length);
  }

  function renderFooter() {
    var f = doc.getElementById("site-footer");
    if (!f) return;
    f.innerHTML = '<div class="wrap footer-inner">' +
      "<p>\u00A9 " + new Date().getFullYear() + " " + esc(NAME) + (HANDLE ? ' <span class="dim">\u00B7</span> ' + esc(HANDLE) + "//DEV" : "") + "</p>" +
      '<p class="dim">&lt;eos&gt; \u00B7 press <kbd>`</kbd> for the terminal \u00B7 <a href="card.html">print a card</a></p></div>';
  }

  /* ---------------------------------------------------------------------------
   * Render
   * ------------------------------------------------------------------------ */
  var html = [renderInput(), renderEmbedding(), renderAttention(), renderHidden(), renderWeights(), renderOutput()];
  var out = "";
  html.forEach(function (h, i) { out += h; if (i < html.length - 1) out += synapse(i); });
  mount.innerHTML = out;
  renderRail();
  renderDock();
  renderFooter();

  doc.title = NAME + (HANDLE ? " \u00B7 " + HANDLE : "") + " // Forward Pass";
  var metaDesc = $('meta[name="description"]');
  if (metaDesc && isSet(P.tagline)) {
    metaDesc.setAttribute("content", NAME + (isSet(P.title) ? ", " + P.title : "") + (isSet(P.company) ? " at " + P.company : "") + ". " + P.tagline);
  }

  var sections = LAYERS.map(function (L) { return doc.getElementById(L.id); });

  /* ---------------------------------------------------------------------------
   * Toast, clipboard, share, vCard
   * ------------------------------------------------------------------------ */
  var toastEl = doc.getElementById("toast");
  var toastTimer = 0;
  function toast(msg) {
    if (!toastEl) return;
    msg = String(msg == null ? "" : msg);
    if (msg.charAt(0) !== ">") msg = "> " + msg;
    toastEl.textContent = "";
    clearTimeout(toastTimer);
    // Re-set after a frame so screen readers announce repeated messages.
    requestAnimationFrame(function () {
      toastEl.textContent = msg;
      toastEl.classList.add("is-on");
      toastTimer = setTimeout(function () { toastEl.classList.remove("is-on"); }, 2600);
    });
  }
  window.GUNR_TOAST = toast;

  function copyText(text, okMsg) {
    okMsg = okMsg || "copied to clipboard";
    function legacy() {
      var ta = doc.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;top:0;left:0;opacity:0;pointer-events:none";
      doc.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = doc.execCommand("copy"); } catch (e) { ok = false; }
      doc.body.removeChild(ta);
      toast(ok ? okMsg : "copy failed: " + text);
    }
    if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext !== false) {
      navigator.clipboard.writeText(text).then(function () { toast(okMsg); }, legacy);
    } else {
      legacy();
    }
  }

  function copyEmail() {
    if (!isSet(P.email)) { toast("email not set yet"); return; }
    copyText(String(P.email).trim(), "copied to clipboard");
  }

  function share() {
    var url = isSet(P.siteUrl) ? String(P.siteUrl) : location.href;
    var data = { title: NAME + (HANDLE ? " \u00B7 " + HANDLE : ""), text: isSet(P.tagline) ? P.tagline : NAME, url: url };
    if (navigator.share) {
      navigator.share(data).catch(function (err) {
        if (err && err.name === "AbortError") return;
        copyText(url, "link copied to clipboard");
      });
    } else {
      copyText(url, "link copied to clipboard");
    }
  }

  function saveContact() {
    if (!window.GUNR_VCARD) { toast("vCard unavailable"); return; }
    try {
      window.GUNR_VCARD.download(P);
      toast("contact saved: " + window.GUNR_VCARD.filename(P));
    } catch (e) {
      toast("could not build the contact file");
    }
  }

  /* ---------------------------------------------------------------------------
   * Navigation: goto, rail, progress, current layer
   * ------------------------------------------------------------------------ */
  function resolveLayer(t) {
    if (typeof t === "number") return t | 0;
    var s = String(t == null ? "" : t).toLowerCase().trim().replace(/^#/, "");
    if (/^\d+$/.test(s)) return +s;
    if (s.indexOf("layer-") === 0 || s.indexOf("layer ") === 0 || s.indexOf("layer_") === 0) s = s.slice(6);
    if (/^\d+$/.test(s)) return +s;
    for (var i = 0; i < LAYERS.length; i++) {
      if (LAYERS[i].key === s || LAYERS[i].id === s || LAYERS[i].aliases.indexOf(s) !== -1) return i;
    }
    return -1;
  }

  function focusNoScroll(el) {
    if (!el) return;
    try { el.focus({ preventScroll: true }); } catch (e) { /* old browsers: skip focus */ }
  }

  function goto(target) {
    var i = resolveLayer(target);
    var sec = sections[i];
    if (!sec) return false;
    if (window.GUNR_BOOT && !window.GUNR_BOOT.done) window.GUNR_BOOT.skip();
    sec.scrollIntoView(reduced ? true : { behavior: "smooth", block: "start" });
    focusNoScroll(sec.querySelector("h1, h2"));
    return true;
  }

  var current = -1;
  var railNodes = $$(".rail-node");
  var railFill = doc.getElementById("rail-fill");
  var railToken = doc.getElementById("rail-token");
  var railState = doc.getElementById("rail-state");
  var railTrack = doc.getElementById("rail-track");
  var progFill = doc.getElementById("progress-fill");
  var progToken = doc.getElementById("progress-token");
  var progBar = progFill ? progFill.parentNode : null;
  var topLabel = doc.getElementById("topbar-layer");
  var synapses = $$("[data-synapse]");

  /* Crossing a boundary forward fires that synapse once (CSS .is-fired). */
  function fireSynapse(s) {
    if (!s || reduced) return;
    s.classList.remove("is-fired");
    void s.offsetWidth; // restart the one-shot animation
    s.classList.add("is-fired");
  }

  function setCurrent(i) {
    if (i === current) return;
    var prev = current;
    current = i;
    if (prev >= 0 && i > prev) fireSynapse(synapses[i - 1]);
    root.classList.toggle("at-output", i === LAYERS.length - 1);
    railNodes.forEach(function (n, k) {
      n.classList.toggle("is-passed", k < i);
      n.classList.toggle("is-current", k === i);
      if (k === i) n.setAttribute("aria-current", "step");
      else n.removeAttribute("aria-current");
    });
    var L = LAYERS[i];
    if (topLabel) {
      var label = "L" + pad2(i) + " // " + L.name;
      topLabel.textContent = label;           // correct immediately (and under reduced motion)
      if (prev >= 0) scramble(topLabel, label, 300);
    }
    if (railState) railState.textContent = "token: " + L.state;
    root.setAttribute("data-layer", L.key);
    if (window.GUNR_NET) fire(function () { window.GUNR_NET.setLayer(i); });
  }

  /* Geometry is cached here; scroll handlers only read scrollY. */
  var geo = { tops: [], vh: 0, docH: 0, railH: 0, barW: 0, desk: false, loss: null };
  var lastF = -1;

  function measure() {
    var y = window.pageYOffset || 0;
    geo.vh = window.innerHeight || 1;
    geo.docH = doc.documentElement.scrollHeight;
    geo.tops = sections.map(function (s) { return s ? s.getBoundingClientRect().top + y : 0; });
    geo.railH = railTrack ? railTrack.offsetHeight : 0;
    geo.barW = progBar ? progBar.offsetWidth : 0;
    geo.desk = mq("(min-width: 1024px)").matches;
    var chart = doc.getElementById("loss-chart");
    var hid = sections[3];
    if (chart && hid) {
      var cr = chart.getBoundingClientRect(), hr = hid.getBoundingClientRect();
      geo.loss = { cTop: cr.top + y, cH: cr.height, sTop: hr.top + y, sH: hr.height };
    }
    lastF = -1;
    update();
  }

  function update() {
    var y = window.pageYOffset || 0;
    var n = geo.tops.length;
    if (!n) return;
    var anchor = y + geo.vh * 0.35;
    var prog = 0;
    for (var i = n - 1; i >= 0; i--) {
      if (anchor >= geo.tops[i]) {
        prog = i + (i < n - 1 ? clamp((anchor - geo.tops[i]) / Math.max(1, geo.tops[i + 1] - geo.tops[i]), 0, 1) : 0);
        break;
      }
    }
    if (y + geo.vh >= geo.docH - 4) prog = n - 1;
    setCurrent(Math.min(n - 1, Math.floor(prog + 1e-4)));

    var f = prog / (n - 1);
    if (Math.abs(f - lastF) > 0.0005) {
      lastF = f;
      if (railFill) railFill.style.transform = "scaleY(" + f.toFixed(4) + ")";
      if (railToken) railToken.style.transform = "translate3d(-50%," + (f * geo.railH).toFixed(1) + "px,0)";
      if (progFill) progFill.style.transform = "scaleX(" + f.toFixed(4) + ")";
      if (progToken) progToken.style.transform = "translate3d(" + (f * geo.barW).toFixed(1) + "px,-50%,0)";
    }
    updateLoss(y);
  }

  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () { ticking = false; update(); });
  }

  var measurePending = false;
  function scheduleMeasure() {
    if (measurePending) return;
    measurePending = true;
    requestAnimationFrame(function () { measurePending = false; measure(); });
  }

  /* ---------------------------------------------------------------------------
   * Loss curve (drawn by scroll progress)
   * ------------------------------------------------------------------------ */
  var lossTrain = $(".loss-train");
  var lossGlow = $(".loss-train-glow");
  var lossVal = $(".loss-val");
  var lossHead = $(".loss-head");
  var lossHalo = $(".loss-halo");
  var lossMarks = $$(".loss-mark");
  var lossReadout = doc.getElementById("loss-readout");
  var epochItems = $$(".epoch");
  var lastLossP = -1;

  function updateLoss(y) {
    if (!lossTrain || !geo.loss || !lossPts.length) return;
    var g = geo.loss, p;
    if (reduced) p = 1;
    else if (geo.desk) p = clamp((y + geo.vh * 0.7 - g.sTop) / (g.sH * 0.8), 0, 1);  // sticky chart: follow the section
    else p = clamp((y + geo.vh - g.cTop) / (g.cH + geo.vh * 0.45), 0, 1);           // phone: follow the chart itself
    if (Math.abs(p - lastLossP) < 0.002) return;
    lastLossP = p;

    var off = (lossLen * (1 - p)).toFixed(1);
    lossTrain.style.strokeDashoffset = off;
    if (lossGlow) lossGlow.style.strokeDashoffset = off;
    if (lossVal) {
      var vl = parseFloat(lossVal.getAttribute("data-len")) || 0;
      lossVal.style.strokeDashoffset = (vl * (1 - p)).toFixed(1);
    }
    var fi = p * (lossPts.length - 1);
    var a = lossPts[Math.floor(fi)], b = lossPts[Math.min(lossPts.length - 1, Math.floor(fi) + 1)];
    var t = fi - Math.floor(fi);
    var hx = a.x + (b.x - a.x) * t, hy = a.y + (b.y - a.y) * t, hv = a.v + (b.v - a.v) * t;
    [lossHalo, lossHead].forEach(function (c) {
      if (c) { c.setAttribute("cx", hx.toFixed(1)); c.setAttribute("cy", hy.toFixed(1)); }
    });
    if (lossReadout) lossReadout.textContent = "loss " + hv.toFixed(3);
    var E = lossMarks.length;
    var active = Math.min(E - 1, Math.floor(p * E - 1e-6));
    lossMarks.forEach(function (m, k) { m.classList.toggle("is-on", p >= (k + 1) / E - 0.001); });
    epochItems.forEach(function (el, k) { el.classList.toggle("is-active", k === active); });
  }

  /* ---------------------------------------------------------------------------
   * Reveals (IntersectionObserver)
   * ------------------------------------------------------------------------ */
  // Loose [data-reveal] elements become their own one-item group.
  $$("[data-reveal]").forEach(function (el) {
    if (!el.parentNode.closest || !el.parentNode.closest("[data-reveal-group]")) el.setAttribute("data-reveal-group", "");
  });
  var revealGroups = $$("[data-reveal-group]");
  revealGroups.forEach(function (g) {
    var k = 0;
    $$("[data-reveal]", g).forEach(function (el) {
      if (el.parentNode.closest("[data-reveal-group]") === g) el.style.setProperty("--i", Math.min(k++, 12));
    });
  });
  root.classList.add("reveals-on");

  var HOOKS = {
    hero: function () {
      $$("[data-scramble]").forEach(function (el, i) { scramble(el, el.textContent, 650 + i * 220); });
    },
    emb: function (g) {
      $$(".emb-num", g).forEach(function (el) { scrambleNum(el, el.getAttribute("data-num"), 900); });
    },
    /* The destination: once the bars have grown, the top token is sampled. */
    out: function (g) {
      if (reduced) return;
      setTimeout(function () {
        var top = $(".logit.is-top", g);
        if (top) top.classList.add("is-sampled");
        var h = doc.getElementById("h-output");
        if (h) {
          // Keep the accessible name stable while the glyphs churn.
          if (!h.hasAttribute("aria-label")) h.setAttribute("aria-label", h.textContent);
          scramble(h, h.getAttribute("aria-label"), 600);
        }
        if (window.GUNR_NET) fire(function () { window.GUNR_NET.burst(10); });
      }, 1100); // 5 bars x 90ms stagger + 200ms delay + most of the .9s grow
    }
  };

  function reveal(g) {
    if (g.classList.contains("is-in")) return;
    g.classList.add("is-in");
    var hook = g.getAttribute("data-hook");
    if (hook && HOOKS[hook]) fire(function () { HOOKS[hook](g); });
    // After the wipe (max stagger 12 x 70ms + .7s), release clip/transform/filter.
    setTimeout(function () { g.classList.add("is-done"); }, 700 + 12 * 70);
  }

  function startReveals() {
    if (!("IntersectionObserver" in window)) { revealGroups.forEach(reveal); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { reveal(e.target); io.unobserve(e.target); }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0 });
    revealGroups.forEach(function (g) { io.observe(g); });
  }

  var GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$%&@<>/";
  function scramble(el, final, dur) {
    if (reduced || !final) return;
    var start = performance.now(), n = final.length;
    (function tick(now) {
      var k = (now - start) / dur, s = "";
      for (var i = 0; i < n; i++) {
        var settle = 0.25 + (i / n) * 0.7;
        s += k >= settle || final.charAt(i) === " " ? final.charAt(i) : GLYPHS.charAt((Math.random() * GLYPHS.length) | 0);
      }
      el.textContent = s;
      if (k < 1) requestAnimationFrame(tick);
      else el.textContent = final;
    })(start);
  }

  function scrambleNum(el, final, dur) {
    if (reduced) return;
    var start = performance.now();
    (function tick(now) {
      var k = (now - start) / dur;
      if (k < 1) {
        el.textContent = ((Math.random() * 2 - 1)).toFixed(2);
        requestAnimationFrame(tick);
      } else {
        el.textContent = final;
      }
    })(start);
  }

  /* ---------------------------------------------------------------------------
   * Media slots (load-then-reveal)
   * ------------------------------------------------------------------------ */
  function setupMedia() {
    var avatar = doc.getElementById("avatar");
    var av = mediaImg(A.avatar, "avatar-img", NAME);
    if (avatar && av) avatar.appendChild(av);

    var holder = doc.getElementById("hero-media");
    if (holder) {
      // portraitPhone only picks the still; the video needs a non-phone, fast connection.
      var portraitPhone = mq("(max-width: 767px) and (orientation: portrait)").matches;
      var phone = mq("(max-width: 1023px)").matches || mq("(pointer: coarse)").matches;
      var slow = /(^|-)(2g|3g)$/.test(conn.effectiveType || "");
      var still = portraitPhone && isSet(A.heroMobile) ? A.heroMobile : A.heroPoster;
      var img = mediaImg(still, "hero-still", "");
      if (img) holder.appendChild(img);

      if (!phone && !slow && !reduced && !saveData && isSet(A.heroLoop)) {
        var v = doc.createElement("video");
        v.className = "hero-video";
        v.muted = true;
        v.defaultMuted = true;
        v.loop = true;
        v.autoplay = true;
        v.playsInline = true;
        v.preload = "metadata";
        ["muted", "playsinline", "loop", "autoplay"].forEach(function (a) { v.setAttribute(a, ""); });
        v.setAttribute("aria-hidden", "true");
        v.setAttribute("tabindex", "-1");
        if (isSet(A.heroPoster)) v.setAttribute("poster", A.heroPoster);
        var srcs = [];
        if (isSet(A.heroLoopWebm)) srcs.push([A.heroLoopWebm, "video/webm"]);
        srcs.push([A.heroLoop, "video/mp4"]);
        srcs.forEach(function (s, i) {
          var so = doc.createElement("source");
          so.src = s[0];
          so.type = s[1];
          if (i === srcs.length - 1) {
            so.addEventListener("error", function () { if (v.parentNode) v.parentNode.removeChild(v); });
          }
          v.appendChild(so);
        });
        v.addEventListener("canplay", function () {
          v.classList.add("is-loaded");
          var pr = v.play();
          if (pr && pr.catch) pr.catch(function () {});
        }, { once: true });
        holder.appendChild(v);

        // Pause the loop while the hero is off screen.
        if ("IntersectionObserver" in window) {
          new IntersectionObserver(function (en) {
            if (!v.parentNode) return;
            if (en[0].isIntersecting) { var p = v.play(); if (p && p.catch) p.catch(function () {}); }
            else v.pause();
          }).observe(holder);
        }
      }
    }

    // Layer backdrops: fetched only as their layer approaches.
    var bgs = $$(".layer-bg[data-bg]");
    var layerAssets = A.layers || {};
    if (saveData) return;
    function load(el) {
      var im = mediaImg(layerAssets[el.getAttribute("data-bg")], "layer-bg-img", "");
      if (im) { im.loading = "lazy"; el.appendChild(im); }
    }
    if (!("IntersectionObserver" in window)) { bgs.forEach(load); return; }
    var bio = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { load(e.target); bio.unobserve(e.target); } });
    }, { rootMargin: "300px 0px" });
    bgs.forEach(function (b) { bio.observe(b); });
  }

  /* ---------------------------------------------------------------------------
   * Output QR: the library loads async (index.html), so fill the box when it
   * arrives and drop the panel if it never does. Async scripts hold up the
   * window load event, so by "load" the library has either run or failed.
   * ------------------------------------------------------------------------ */
  function setupQr() {
    var box = doc.getElementById("qr-box");
    if (!box) return;
    function drop() {
      if (!box.classList.contains("is-pending")) return;
      var aside = doc.getElementById("out-qr");
      if (aside && aside.parentNode) aside.parentNode.removeChild(aside);
      var grid = doc.getElementById("out-grid");
      if (grid) grid.classList.add("no-qr");
      scheduleMeasure();
    }
    function fill() {
      if (!box.classList.contains("is-pending")) return true;
      if (!window.GUNR_QR || !window.GUNR_QR.ready()) return false;
      var svg = null;
      fire(function () {
        svg = window.GUNR_QR.svg(SITE_URL, { ecc: "M", margin: 4, dark: "#05070a", light: "#ffffff", label: "QR code linking to " + SITE_URL });
      });
      if (!svg) { drop(); return true; }
      box.innerHTML = svg;
      box.classList.remove("is-pending");
      return true;
    }
    if (fill()) return;
    doc.addEventListener("gunr:qr-ready", fill);
    doc.addEventListener("gunr:qr-failed", drop);
    window.addEventListener("load", function () { if (!fill()) drop(); });
  }

  /* ---------------------------------------------------------------------------
   * Attention heatmap
   * ------------------------------------------------------------------------ */
  var attnSection = sections[2];
  var attnMap = $(".attn-map");
  var attnCards = $$(".attn-card");
  var attnLock = -1;

  function attnShow(q) {
    if (!attnMap) return;
    attnMap.classList.toggle("has-focus", q >= 0);
    $$(".heat-cell", attnMap).forEach(function (c) { c.classList.toggle("is-col", +c.getAttribute("data-q") === q); });
    $$("tbody tr", attnMap).forEach(function (tr) {
      tr.classList.toggle("is-hot", q >= 0 && attends(q, attnKeys[+tr.getAttribute("data-k")]));
    });
    $$("thead th", attnMap).forEach(function (th, k) { th.classList.toggle("is-col", k === q); });
    attnCards.forEach(function (c) { c.classList.toggle("is-focus", +c.getAttribute("data-q") === q); });
  }

  function setupAttention() {
    if (!attnSection) return;
    attnCards.forEach(function (card) {
      var q = +card.getAttribute("data-q");
      card.addEventListener("mouseenter", function () { if (attnLock < 0) attnShow(q); });
      card.addEventListener("mouseleave", function () { if (attnLock < 0) attnShow(-1); });
      card.addEventListener("focusin", function () { if (attnLock < 0) attnShow(q); });
      card.addEventListener("focusout", function (e) {
        if (attnLock < 0 && !card.contains(e.relatedTarget)) attnShow(-1);
      });
    });
  }

  function toggleAttend(btn) {
    var q = +btn.getAttribute("data-attend");
    attnLock = attnLock === q ? -1 : q;
    $$("[data-attend]").forEach(function (b) {
      var on = +b.getAttribute("data-attend") === attnLock;
      // Constant label; aria-pressed (and its styling) carries the state.
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
    attnShow(attnLock);
    if (attnLock >= 0 && attnMap && !geo.desk) {
      toast("attention: q" + (q + 1) + " \u2192 " + arr(research[q].attends).length + " keys");
    }
  }

  /* ---------------------------------------------------------------------------
   * Weights
   * ------------------------------------------------------------------------ */
  function toggleNode(btn, force) {
    var open = typeof force === "boolean" ? force : btn.getAttribute("aria-expanded") !== "true";
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    var note = doc.getElementById(btn.getAttribute("aria-controls"));
    if (note) note.hidden = !open;
    btn.parentNode.classList.toggle("is-open", open);
    scheduleMeasure();
  }

  function selectSkill(name) {
    var row = $('[data-skill-row="' + String(name).toLowerCase().replace(/["\\]/g, "") + '"]');
    if (!row) return false;
    var group = row.closest("[data-reveal-group]");
    if (group) reveal(group);
    var btn = $(".w-node", row);
    toggleNode(btn, true);
    row.classList.remove("is-ping");
    void row.offsetWidth; // restart the highlight animation
    row.classList.add("is-ping");
    row.scrollIntoView(reduced ? false : { behavior: "smooth", block: "center" });
    focusNoScroll(btn);
    return true;
  }

  /* ---------------------------------------------------------------------------
   * Dock visibility (phones): show once the hero actions scroll away,
   * hide again while the output layer's own actions are on screen.
   * ------------------------------------------------------------------------ */
  function setupDock() {
    var dock = doc.getElementById("dock");
    var heroActs = doc.getElementById("hero-actions");
    var outActs = doc.getElementById("out-actions");
    if (!dock || !heroActs || !("IntersectionObserver" in window)) {
      if (dock) { dock.classList.add("is-on"); root.classList.add("dock-on"); }
      return;
    }
    var heroGone = false, outVisible = false;
    function apply() {
      var on = heroGone && !outVisible;
      dock.classList.toggle("is-on", on);
      root.classList.toggle("dock-on", on);
    }
    new IntersectionObserver(function (en) {
      var e = en[0];
      heroGone = !e.isIntersecting && e.boundingClientRect.top < 0;
      apply();
    }).observe(heroActs);
    if (outActs) {
      new IntersectionObserver(function (en) { outVisible = en[0].isIntersecting; apply(); }).observe(outActs);
    }
  }

  /* ---------------------------------------------------------------------------
   * Events
   * ------------------------------------------------------------------------ */
  doc.addEventListener("click", function (e) {
    var t = e.target;
    if (!t || !t.closest) return;

    var act = t.closest("[data-action]");
    if (act) {
      var a = act.getAttribute("data-action");
      if (a === "save") { e.preventDefault(); saveContact(); }
      else if (a === "copy-email") { e.preventDefault(); copyEmail(); }
      else if (a === "share") { e.preventDefault(); share(); }
      return;
    }
    var at = t.closest("[data-attend]");
    if (at) { toggleAttend(at); return; }

    var sk = t.closest("[data-skill]");
    if (sk) { selectSkill(sk.getAttribute("data-skill")); return; }

    var node = t.closest(".w-node");
    if (node) { toggleNode(node); return; }

    var link = t.closest('a[href^="#layer-"]');
    if (link) {
      e.preventDefault();
      goto(link.getAttribute("href"));
    }
  });

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", scheduleMeasure, { passive: true });
  window.addEventListener("load", scheduleMeasure);
  if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(scheduleMeasure, function () {});
  if (window.ResizeObserver) new ResizeObserver(scheduleMeasure).observe(mount);

  /* ---------------------------------------------------------------------------
   * Theme
   * ------------------------------------------------------------------------ */
  var THEMES = ["green", "amber", "cyan"];
  function setTheme(name) {
    name = String(name || "").toLowerCase();
    if (THEMES.indexOf(name) === -1) return false;
    root.setAttribute("data-theme", name);
    try { localStorage.setItem("gunr.theme", name); } catch (e) { /* storage blocked */ }
    return true;
  }

  /* ---------------------------------------------------------------------------
   * Start
   * ------------------------------------------------------------------------ */
  window.GUNR_JOURNEY = {
    layers: LAYERS.map(function (L) { return L.id; }),
    goto: goto,
    current: function () { return LAYERS[Math.max(0, current)].id; },
    setTheme: setTheme,
    selectSkill: selectSkill,
    saveContact: saveContact,
    copyEmail: copyEmail,
    share: share,
    toast: toast
  };

  fire(setupMedia);
  fire(setupQr);
  fire(setupAttention);
  fire(setupDock);
  measure();

  /* Reveals start as the boot shutters begin to part (gunr:boot-opening), so
     the hero wipes in with them as one motion; gunr:boot-done is the fallback. */
  var begun = false;
  function begin(fromBoot) {
    if (begun) return;
    begun = true;
    if (fromBoot === true && !reduced) {
      root.classList.add("from-boot");
      setTimeout(function () { root.classList.remove("from-boot"); }, 1500);
    }
    startReveals();
    scheduleMeasure();
  }
  if (window.GUNR_BOOT && !window.GUNR_BOOT.done) {
    doc.addEventListener("gunr:boot-opening", function () { begin(true); }, { once: true });
    doc.addEventListener("gunr:boot-done", function () { begin(false); }, { once: true });
  } else {
    begin(false);
  }
})();
