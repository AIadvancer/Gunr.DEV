/* =============================================================================
 * GUNR.DEV — journey.js
 * Renders every section from window.PROFILE and runs the motion system:
 * Lenis smooth scroll + GSAP ScrollTrigger/SplitText reveals, the pinned
 * horizontal experience track, velocity-reactive marquee, custom cursor,
 * magnetic buttons, the top-bar layer scramble and the scene hooks.
 *
 * Contracts
 *   window.GUNR_JOURNEY = { layers, goto(id), current(), setTheme(name),
 *                           selectSkill(name), saveContact(), copyEmail(),
 *                           share(), toast(msg), lenis }
 *   window.GUNR_TOAST(msg[, { ms, long }])
 *   window.GUNR_JOURNEY_READY = true once set up (the head failsafe reads it)
 *   Calls window.GUNR_SCENE (optional): setProgress, setSection(i, t),
 *   setAccent, staticFrame, setHeroDim. Reads window.GUNR_MOTION { full, source }
 *   (the switch itself is bound by the head script). Fills #hero-media from
 *   PROFILE.assets. Listens for gunr:scene-ready, gunr:boot-opening,
 *   gunr:boot-done, gunr:themechange, gunr:qr-ready / gunr:qr-failed.
 *
 * Degrades in layers: no GSAP -> IntersectionObserver + CSS transitions;
 * reduced motion -> opacity fades only, native scroll, no pinning.
 * ========================================================================== */
(function () {
  "use strict";

  const doc = document;
  const root = doc.documentElement;
  const P = window.PROFILE || {};
  const U = window.GUNR_UTIL || {};
  const mount = doc.getElementById("journey");
  if (!mount) { window.GUNR_JOURNEY_READY = true; return; }

  const isSet = U.isSet || ((v) => v != null && String(v).trim() !== "" && String(v).indexOf("[[") === -1);
  const esc = U.esc || ((v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]));
  const mq = (q) => (window.matchMedia ? window.matchMedia(q) : { matches: false });

  const MOTION = window.GUNR_MOTION ? !!window.GUNR_MOTION.full : !mq("(prefers-reduced-motion: reduce)").matches;
  const gsap = window.gsap;
  const ST = window.ScrollTrigger;
  const Split = window.SplitText;
  const FULL = MOTION && !!gsap && !!ST;
  const FINE = mq("(hover: hover) and (pointer: fine)").matches;

  /* ---------------------------------------------------------------------------
   * Small helpers
   * ------------------------------------------------------------------------ */
  const $ = (sel, ctx) => (ctx || doc).querySelector(sel);
  const $$ = (sel, ctx) => Array.prototype.slice.call((ctx || doc).querySelectorAll(sel));
  const arr = (v) => (Array.isArray(v) ? v : []);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const pad2 = (n) => (n < 10 ? "0" : "") + n;
  const isPh = (v) => typeof v === "string" && v.indexOf("[[") !== -1;
  const stripPh = (v) => String(v).replace(/\[\[|\]\]/g, "").trim();
  const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const fire = (fn) => { try { fn(); } catch (e) { /* keep the page alive */ } };

  /* Real text escapes; a [[placeholder]] renders dimmed so the owner can spot it. */
  function txt(v) {
    if (isSet(v)) return esc(v);
    if (isPh(v)) return '<span class="ph">' + esc(stripPh(v)) + "</span>";
    return "";
  }

  function emit(name, detail) {
    try { doc.dispatchEvent(new CustomEvent(name, { detail })); } catch (e) { /* old browser */ }
  }

  const ICON_PATHS = {
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
    arrow: '<path d="M7 17L17 7M8.5 7H17v8.5"/>',
    down: '<path d="M12 4v16M6 14l6 6 6-6"/>'
  };
  function icon(name) {
    return '<svg class="icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
      (ICON_PATHS[name] || ICON_PATHS.web) + "</svg>";
  }

  /* ---------------------------------------------------------------------------
   * Derived data
   * ------------------------------------------------------------------------ */
  const N = P.name || {};
  const NAME = (U.fullName ? U.fullName(P) : [N.first, N.last].filter(isSet).join(" ")) || "Visitor";
  const HANDLE = isSet(P.handle) ? String(P.handle) : "GUNR";
  const SITE_URL = isSet(P.siteUrl) ? String(P.siteUrl) : location.origin;
  const research = arr(P.research).filter(Boolean);
  const groups = arr(P.skills).filter((g) => g && arr(g.items).length);
  const traits = arr(P.traits).filter((t) => t && isSet(t.name));
  const links = arr(P.links).filter((l) => l && isSet(l.url));

  // Experience: the owner's order, sorted by start year only when every start is a year.
  const yearOf = (v) => { const m = /^\s*(\d{4})/.exec(String(v == null ? "" : v)); return m ? +m[1] : NaN; };
  let experience = arr(P.experience).filter(Boolean).map((e, i) => ({ e, i }));
  if (experience.length && experience.every((x) => !isNaN(yearOf(x.e.start)))) {
    experience.sort((a, b) => yearOf(a.e.start) - yearOf(b.e.start) || a.i - b.i);
  }
  experience = experience.map((x) => x.e);

  const skills = [];
  groups.forEach((g) => arr(g.items).forEach((it) => {
    if (it && isSet(it.name)) skills.push({ name: String(it.name), level: clamp(Number(it.level) || 0, 0, 1), note: it.note, group: g.group });
  }));
  const skillByName = {};
  skills.forEach((s) => { skillByName[s.name.toLowerCase()] = s; });

  const linkBy = (ic) => links.find((l) => l.icon === ic) || null;

  const LAYERS = [
    { id: "layer-input", key: "input", name: "Input", title: "Identity", state: "x = ⟨visitor⟩", aliases: ["hero", "identity", "home", "top", "start", "intro"] },
    { id: "layer-embedding", key: "embedding", name: "Embedding", title: "About", state: "e = E[x]", aliases: ["about", "bio", "emb", "embed"] },
    { id: "layer-attention", key: "attention", name: "Attention", title: "Research", state: "softmax(QKᵀ)V", aliases: ["research", "attn", "ai", "projects"] },
    { id: "layer-hidden", key: "hidden", name: "Hidden", title: "Experience", state: "h = σ(Wh + b)", aliases: ["experience", "exp", "work", "training", "log", "career", "hidden-layers"] },
    { id: "layer-weights", key: "weights", name: "Weights", title: "Skills", state: "θ ∈ ℝⁿ", aliases: ["skills", "stack", "skill"] },
    { id: "layer-output", key: "output", name: "Output", title: "Contact", state: "argmax → connect", aliases: ["contact", "connect", "out", "end"] }
  ];

  /* Contact actions: save / email / call / LinkedIn when set, topped up with other links. */
  function primaryActions(max) {
    const a = [];
    if (window.GUNR_VCARD) a.push({ key: "save", label: "Save contact", short: "Save", icon: "card", primary: true, cursor: "Save" });
    if (isSet(P.email)) a.push({ key: "email", label: "Email", short: "Email", icon: "mail", href: "mailto:" + String(P.email).trim(), cursor: "Write" });
    const tel = U.telHref ? U.telHref(P.phone) : "";
    if (tel) a.push({ key: "call", label: "Call", short: "Call", icon: "phone", href: tel, cursor: "Call" });
    const li = linkBy("linkedin");
    if (li) a.push({ key: "linkedin", label: "LinkedIn", short: "LinkedIn", icon: "linkedin", href: li.url, ext: true, cursor: "Open" });
    for (let i = 0; i < links.length && a.length < max; i++) {
      const l = links[i];
      if (l.icon === "linkedin") continue;
      a.push({ key: "link-" + slug(l.label || l.icon), label: l.label || "Link", short: l.label || "Link", icon: l.icon, href: l.url, ext: true, cursor: "Open" });
    }
    return a.slice(0, max);
  }

  function btnHTML(a, cls, useShort) {
    const label = esc(useShort ? a.short || a.label : a.label);
    const c = cls + (a.primary ? " is-primary" : "");
    const inner = '<span class="btn-fill" aria-hidden="true"></span><span class="btn-in">' + icon(a.icon) + "<span>" + label + "</span></span>";
    const extra = ' data-magnetic data-cursor="' + esc(a.cursor || "") + '"';
    if (a.href) {
      return '<a class="' + c + '" href="' + esc(a.href) + '" data-kind="' + esc(a.key) + '"' + extra +
        (a.ext ? ' target="_blank" rel="noopener"' : "") + ">" + inner + "</a>";
    }
    return '<button type="button" class="' + c + '" data-action="' + esc(a.key) + '"' + extra + ">" + inner + "</button>";
  }

  /* ---------------------------------------------------------------------------
   * Markup
   * ------------------------------------------------------------------------ */
  function secHead(L, i, titleHTML, extraCls) {
    return '<div class="sec-num" aria-hidden="true">' + pad2(i) + "</div>" +
      '<header class="sec-head' + (extraCls ? " " + extraCls : "") + '">' +
        '<p class="sec-label label" data-reveal><span class="sec-idx">' + pad2(i) + '</span><span class="sec-rule" aria-hidden="true"></span>' +
        "<span>" + esc(L.name) + '</span><span class="sec-state">' + esc(L.state) + "</span></p>" +
        '<h2 id="h-' + L.key + '" class="sec-title display" tabindex="-1" data-split>' + titleHTML + "</h2>" +
      "</header>";
  }

  function chars(word) {
    return Array.from(String(word)).map((c, k) =>
      '<span class="ch" style="--i:' + k + '">' + (c === " " ? "&nbsp;" : esc(c)) + "</span>").join("");
  }

  function renderInput() {
    const L = LAYERS[0];
    const first = isSet(N.first) ? N.first : NAME;
    const last = isSet(N.last) ? N.last : "";
    let role = "";
    if (isSet(P.title)) role += "<span>" + esc(P.title) + "</span>";
    if (isSet(P.company)) role += ' <span class="dim">at</span> <span>' + esc(P.company) + "</span>";
    if (isSet(P.companyNote)) role += ' <span class="dim">(' + esc(P.companyNote) + ")</span>";

    return '<section id="' + L.id + '" class="layer hero" data-layer="0" aria-labelledby="h-input">' +
      '<div class="wrap hero-inner">' +
        '<div class="hero-top label" data-hero>' +
          '<span><span class="sig">(00)</span> ' + esc(L.name) + ' <span class="dim">&mdash; ' + esc(L.state) + "</span></span>" +
          (isSet(P.location) || isPh(P.location) ? '<span class="hero-loc">' + txt(P.location) + "</span>" : "") +
        "</div>" +
        '<h1 id="h-input" class="hero-name" tabindex="-1" aria-label="' + esc(NAME) + '">' +
          '<span class="hn hn-first" aria-hidden="true"><span class="hn-mask">' + chars(first) + "</span></span>" +
          (last ? '<span class="hn hn-last" aria-hidden="true"><span class="hn-mask">' + chars(last) + "</span></span>" : "") +
        "</h1>" +
        '<div class="hero-foot">' +
          '<div class="hero-copy">' +
            (role ? '<p class="hero-role" data-hero>' + role + "</p>" : "") +
            (isSet(P.tagline) || isPh(P.tagline) ? '<p class="hero-tagline" data-hero>' + txt(P.tagline) + "</p>" : "") +
          "</div>" +
          '<div class="actions hero-actions" id="hero-actions" data-hero>' +
            primaryActions(4).map((a) => btnHTML(a, "btn")).join("") +
          "</div>" +
        "</div>" +
        '<a class="hero-cue label" href="#layer-embedding" data-hero><span class="cue-line" aria-hidden="true"><i></i></span>Scroll to run the forward pass</a>' +
      "</div></section>";
  }

  /* First sentence of a paragraph. A sentence end needs 2+ non-dot chars before the
   * punctuation, so initials ("Gunnar J.") and abbreviations ("e.g.") don't end it. */
  function firstSentence(s) {
    const m = String(s).match(/^[\s\S]*?[^\s.]{2}[.!?]+(?=\s|$)/);
    return m ? m[0].trim() : String(s).trim();
  }

  /* Pull quote: optional PROFILE.pullQuote, else the bio's opening sentence when it is
   * short enough for display type (then trimmed from the paragraph so it isn't shown
   * twice), else the tagline. */
  function pullQuote() {
    let src = "", fromBio = false;
    if (isSet(P.pullQuote)) src = String(P.pullQuote);
    if (!src) {
      const b = arr(P.bio).find(isSet);
      const s = b ? firstSentence(b) : "";
      if (s && s.split(/\s+/).length <= 14) { src = s; fromBio = s.length < String(b).trim().length; }
    }
    if (!src && isSet(P.tagline)) src = String(P.tagline);
    if (!src) return { html: "", fromBio: false };
    const words = src.trim().split(/\s+/);
    const lastWord = words.pop();
    return { html: (words.length ? esc(words.join(" ")) + " " : "") + "<em>" + esc(lastWord) + "</em>", fromBio };
  }

  function renderEmbedding() {
    const L = LAYERS[1];
    const pq = pullQuote();
    const quote = pq.html;
    // Unfilled paragraphs are left out entirely; they read as template copy.
    const bio = arr(P.bio).filter(isSet)
      .map((p, i) => (i === 0 && pq.fromBio ? String(p).trim().slice(firstSentence(p).length).trim() : p))
      .filter(Boolean)
      .map((p) => '<p data-lines>' + esc(p) + "</p>").join("");
    const norm = Math.sqrt(traits.reduce((s, t) => s + Math.pow(clamp(+t.value || 0, 0, 1), 2), 0));
    const rows = traits.map((t, k) => {
      const v = clamp(+t.value || 0, 0, 1);
      return '<li class="vec-row" style="--v:' + v.toFixed(3) + '">' +
        '<span class="vec-i label">d' + k + '</span><span class="vec-name">' + esc(String(t.name).replace(/_/g, " ")) + "</span>" +
        '<span class="vec-val label" data-val="' + v.toFixed(2) + '">' + v.toFixed(2) + "</span>" +
        '<span class="vec-bar" aria-hidden="true"><i></i></span></li>';
    }).join("");
    const firstName = isSet(N.first) ? esc(N.first) : esc(HANDLE);

    return '<section id="' + L.id + '" class="layer layer--embedding" data-layer="1" aria-labelledby="h-embedding">' +
      '<div class="wrap">' + secHead(L, 1, "About <em>" + firstName + "</em>") +
        (quote ? '<p class="pull display" data-split>' + quote + "</p>" : "") +
        '<div class="emb-grid">' +
          '<div class="emb-bio">' + bio + "</div>" +
          (rows ? '<div class="vec" data-vec>' +
            '<p class="label vec-head" data-reveal><span>e &isin; &#8477;<sup>' + traits.length + "</sup></span><span>&#8214;e&#8214; = " + norm.toFixed(2) + "</span></p>" +
            '<ul class="vec-list">' + rows + "</ul></div>" : "") +
        "</div>" +
      "</div></section>";
  }

  /* Attention weights for one research entry: earlier `attends` entries weigh more. */
  function attnWeights(r) {
    const keys = arr(r.attends).map(String).filter(Boolean);
    const raw = keys.map((_, j) => Math.exp(-0.45 * j));
    const sum = raw.reduce((s, x) => s + x, 0) || 1;
    return keys.map((k, j) => ({ k, w: raw[j] / sum }));
  }

  function renderAttention() {
    const L = LAYERS[2];
    const rows = research.map((r, q) => {
      const w = attnWeights(r);
      const tags = arr(r.tags).filter(isSet).map((t) => "<li>" + esc(t) + "</li>").join("");
      const chips = w.map((c) => '<li><span>' + esc(c.k) + '</span><b class="label">' + c.w.toFixed(2).replace(/^0/, "") + "</b></li>").join("");
      const link = isSet(r.link) ? '<a class="u-link att-link" href="' + esc(r.link) + '" target="_blank" rel="noopener" data-cursor="Open">View project ' + icon("arrow") + "</a>" : "";
      const year = isSet(r.year) ? esc(r.year) : "";
      return '<li class="att-row" data-q="' + q + '" data-reveal>' +
        '<button type="button" class="att-head" aria-expanded="false" aria-controls="att-b-' + q + '" data-cursor="Expand">' +
          '<span class="att-idx label">R.' + pad2(q + 1) + "</span>" +
          '<span class="att-title">' + txt(r.title) + "</span>" +
          '<span class="att-year label">' + year + "</span>" +
          '<span class="att-plus" aria-hidden="true"></span>' +
        "</button>" +
        '<div class="att-body" id="att-b-' + q + '"><div class="att-body-in">' +
          (isSet(r.summary) || isPh(r.summary) ? '<p class="att-sum">' + txt(r.summary) + "</p>" : "") +
          (tags ? '<ul class="att-tags label" aria-label="Tags">' + tags + "</ul>" : "") +
          (chips ? '<p class="label att-chips-h">Attends to</p><ul class="att-chips">' + chips + "</ul>" : "") +
          link +
        "</div></div></li>";
    }).join("");

    const cloud = skills.map((s) => '<li data-chip="' + esc(s.name.toLowerCase()) + '"><span>' + esc(s.name) + '</span><b class="label"></b></li>').join("");

    return '<section id="' + L.id + '" class="layer layer--attention" data-layer="2" aria-labelledby="h-attention">' +
      '<div class="wrap">' + secHead(L, 2, "Research <em>log</em>") +
        '<div class="att-grid">' +
          (rows ? '<ol class="att-list">' + rows + "</ol>" : '<p class="ph">Research entries coming soon.</p>') +
          (cloud ? '<aside class="att-cloud" aria-label="Skills the research attends to">' +
            '<p class="label att-cloud-h" data-reveal><span>Attention map</span><span class="dim" id="att-q">q = &mdash;</span></p>' +
            '<ul class="att-cloud-list" data-reveal>' + cloud + "</ul>" +
            '<p class="label dim att-hint" data-reveal>Hover a project to see what it attends to.</p></aside>' : "") +
        "</div>" +
      "</div></section>";
  }

  /* Year text; placeholders and blanks render as nothing so no template copy shows. */
  function fmtYear(v) {
    if (!isSet(v)) return "";
    return /^present$/i.test(String(v)) ? "Present" : esc(v);
  }

  function fmtRange(e) {
    const a = fmtYear(e.start), b = fmtYear(e.end);
    if (a && b) return a + " &ndash; " + b;
    if (b) return b === "Present" ? "&rarr; Present" : b;
    return a ? a + " &ndash; Present" : "";
  }

  function epochLoss(e, k, n) {
    const l = Number(e.loss);
    return isFinite(l) && e.loss !== "" ? clamp(l, 0, 1) : 0.9 - (0.75 * (k + 1)) / (n + 1);
  }

  function renderHidden() {
    const L = LAYERS[3];
    const n = experience.length;
    const cards = experience.map((e, k) => {
      const hl = arr(e.highlights).filter(isSet).map((h) => "<li>" + esc(h) + "</li>").join("");
      const range = fmtRange(e);
      const dates = range ? "<span>" + range + "</span>" : "";
      const loss = epochLoss(e, k, n);
      const ft = e.event === "fine-tune" ? ' <span class="tag label">fine-tune</span>' : "";
      return '<article class="epoch" data-epoch data-loss="' + loss.toFixed(3) + '">' +
        '<p class="label epoch-meta"><span>Epoch ' + pad2(k + 1) + "</span>" + dates + "</p>" +
        '<h3 class="epoch-org display">' + txt(e.org) + "</h3>" +
        '<p class="epoch-role">' + txt(e.role) + ft + "</p>" +
        (isSet(e.summary) || isPh(e.summary) ? '<p class="epoch-sum">' + txt(e.summary) + "</p>" : "") +
        (hl ? '<ul class="epoch-hl">' + hl + "</ul>" : "") +
        '<p class="label epoch-loss">loss <b>' + loss.toFixed(3) + "</b></p>" +
      "</article>";
    }).join("");
    const finalLoss = n ? epochLoss(experience[n - 1], n - 1, n) : 0;

    return '<section id="' + L.id + '" class="layer layer--hidden" data-layer="3" aria-labelledby="h-hidden">' +
      '<div class="hz">' +
        '<div class="hz-track" id="hz-track">' +
          '<div class="hz-intro">' + secHead(L, 3, "Training <em>run</em>") +
            '<p class="hz-lede" data-reveal>Every role is an epoch. The loss keeps falling as the work compounds.</p>' +
            '<p class="label dim hz-hint" data-reveal><span class="hz-arrow" aria-hidden="true">&rarr;</span> ' + n + " epochs</p>" +
          "</div>" +
          '<div class="hz-epochs"><span class="hz-line" aria-hidden="true"><i></i></span>' +
          cards +
          (n ? '<div class="hz-outro" data-reveal><p class="label dim">Final loss</p><p class="hz-final display">' + finalLoss.toFixed(2) +
            '</p><p class="label dim">Converged. Still training.</p></div>' : "") +
          "</div>" +
          '<svg class="loss" aria-hidden="true" preserveAspectRatio="none" viewBox="0 0 1000 200"><path class="loss-base" d=""/><path class="loss-path" pathLength="1" d=""/><g class="loss-pts"></g></svg>' +
        "</div>" +
      "</div></section>";
  }

  function renderWeights() {
    const L = LAYERS[4];
    const names = skills.map((s) => s.name);
    let band = "";
    names.forEach((nm, k) => { band += '<span class="mq-item' + (k % 2 ? " is-serif" : "") + '">' + esc(nm) + '</span><i class="mq-dot"></i>'; });
    const grid = groups.map((g, gi) => {
      const items = arr(g.items).filter((it) => it && isSet(it.name)).map((it) => {
        const v = clamp(Number(it.level) || 0, 0, 1);
        const id = "w-note-" + slug(it.name);
        return '<li class="w-row" data-skill-row="' + esc(String(it.name).toLowerCase()) + '">' +
          '<button type="button" class="w-btn" aria-expanded="false" aria-controls="' + id + '" data-skill="' + esc(it.name) + '" data-cursor="Details">' +
            '<span class="w-name">' + esc(it.name) + '</span><span class="w-val label">' + v.toFixed(2) + "</span>" +
            '<span class="w-bar" aria-hidden="true"><i style="--v:' + v.toFixed(3) + '"></i></span>' +
          "</button>" +
          '<div class="w-note" id="' + id + '"><p>' + txt(it.note) + "</p></div></li>";
      }).join("");
      return '<div class="w-group" data-reveal><p class="label w-group-h"><span class="sig">' + pad2(gi + 1) + "</span><span>" + txt(g.group) +
        '</span><span class="dim">' + arr(g.items).length + "</span></p><ul>" + items + "</ul></div>";
    }).join("");

    return '<section id="' + L.id + '" class="layer layer--weights" data-layer="4" aria-labelledby="h-weights">' +
      '<div class="wrap">' + secHead(L, 4, "Weights <em>&amp; skills</em>") + "</div>" +
      (band ? '<div class="marquee" aria-hidden="true"><div class="marquee-inner"><div class="mq-set">' + band + '</div><div class="mq-set">' + band + "</div></div></div>" : "") +
      '<div class="wrap"><div class="w-grid">' + grid + "</div></div></section>";
  }

  function renderOutput() {
    const L = LAYERS[5];
    const rows = [];
    if (isSet(P.email)) rows.push({ k: "Email", v: String(P.email).trim(), href: "mailto:" + String(P.email).trim(), cursor: "Write" });
    const tel = U.telHref ? U.telHref(P.phone) : "";
    if (tel) rows.push({ k: "Phone", v: String(P.phone), href: tel, cursor: "Call" });
    links.forEach((l) => rows.push({ k: l.label || "Link", v: String(l.url).replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""), href: l.url, ext: true, cursor: "Open" }));
    const rowsHTML = rows.map((r) => '<li data-reveal><a class="out-row" href="' + esc(r.href) + '"' + (r.ext ? ' target="_blank" rel="noopener"' : "") +
      ' data-cursor="' + r.cursor + '"><span class="label out-k">' + esc(r.k) + '</span><span class="out-v">' + esc(r.v) + '</span><span class="out-arrow">' + icon("arrow") + "</span></a></li>").join("");

    const acts = [];
    if (window.GUNR_VCARD) acts.push(btnHTML({ key: "save", label: "Save contact", icon: "card", primary: true, cursor: "Save" }, "btn btn--lg"));
    if (isSet(P.email)) acts.push(btnHTML({ key: "copy-email", label: "Copy email", icon: "copy", cursor: "Copy" }, "btn btn--lg"));
    acts.push(btnHTML({ key: "share", label: "Share", icon: "share", cursor: "Share" }, "btn btn--lg"));

    return '<section id="' + L.id + '" class="layer layer--output" data-layer="5" aria-labelledby="h-output">' +
      '<div class="wrap">' + secHead(L, 5, "Let&rsquo;s <em>connect</em>.", "out-head") +
        '<div class="out-grid">' +
          '<div class="out-main">' +
            (isSet(P.availability) || isPh(P.availability) ? '<p class="out-avail" data-reveal><i class="pulse" aria-hidden="true"></i>' + txt(P.availability) + "</p>" : "") +
            (rowsHTML ? '<ul class="out-rows">' + rowsHTML + "</ul>" : "") +
            '<div class="actions out-actions" data-reveal>' + acts.join("") + "</div>" +
          "</div>" +
          '<figure class="out-qr" data-reveal>' +
            '<div class="qr-box" id="qr-box"><span class="qr-wait label">QR</span></div>' +
            '<figcaption class="label"><span>Scan to save</span><span class="dim">' + esc(SITE_URL.replace(/^https?:\/\//, "")) + "</span></figcaption>" +
          "</figure>" +
        "</div>" +
      "</div></section>";
  }

  function renderIndex() {
    const nav = doc.getElementById("section-index");
    if (!nav) return;
    nav.innerHTML = '<ol class="idx-list">' + LAYERS.map((L, i) =>
      '<li><a href="#' + L.id + '" class="idx-a" data-idx="' + i + '"><span class="idx-n">' + pad2(i) + '</span><span class="idx-name">' + esc(L.name) + "</span></a></li>").join("") +
      '</ol><span class="idx-dot" aria-hidden="true"></span>';
  }

  function renderDock() {
    const dock = doc.getElementById("dock");
    if (!dock) return;
    const acts = primaryActions(4);
    if (!acts.length) { dock.hidden = true; return; }
    dock.innerHTML = acts.map((a) => btnHTML(a, "dock-btn", true)).join("");
  }

  function renderFooter() {
    const f = doc.getElementById("site-footer");
    if (!f) return;
    f.innerHTML = '<div class="wrap foot label">' +
      "<span>&copy; " + new Date().getFullYear() + " " + esc(NAME) + "</span>" +
      '<a class="u-link" href="card.html">Print networking cards</a>' +
      '<span class="foot-term">Press <kbd>`</kbd> for terminal</span>' +
      '<button type="button" class="u-link foot-term-btn" data-term-open>Open terminal</button>' +
      // Phones too narrow for the top-bar switch get it here (CSS decides which shows).
      '<button type="button" class="motion-toggle foot-motion" role="switch" aria-checked="' + String(MOTION) + '" data-motion-toggle>' +
        '<span class="mt-label">Motion</span><span class="mt-pill" aria-hidden="true"><i></i></span></button>' +
      '<a class="u-link" href="#layer-input">Back to top &uarr;</a></div>';
  }

  mount.innerHTML = renderInput() + renderEmbedding() + renderAttention() + renderHidden() + renderWeights() + renderOutput();
  renderIndex();
  renderDock();
  renderFooter();

  fire(() => {
    doc.title = NAME + " · " + HANDLE;
    const md = $('meta[name="description"]');
    if (md && isSet(P.tagline)) {
      md.setAttribute("content", NAME + (isSet(P.title) ? ", " + P.title : "") + (isSet(P.company) ? " at " + P.company : "") + ". " + P.tagline);
    }
  });

  const sections = LAYERS.map((L) => doc.getElementById(L.id));
  const hero = sections[0];

  /* ---------------------------------------------------------------------------
   * Toast, clipboard, share, vCard
   * ------------------------------------------------------------------------ */
  const toastEl = doc.getElementById("toast");
  let toastTimer = 0;
  /* toast(msg[, { ms, long }]): long messages get a rounded box and more time. */
  function toast(msg, opts) {
    if (!toastEl) return;
    const o = opts || {};
    msg = String(msg == null ? "" : msg).replace(/^>\s*/, "");
    toastEl.textContent = "";
    clearTimeout(toastTimer);
    // Re-set after a frame so screen readers announce repeated messages.
    requestAnimationFrame(() => {
      toastEl.textContent = msg;
      toastEl.classList.toggle("is-long", !!o.long);
      toastEl.classList.add("is-on");
      toastTimer = setTimeout(() => toastEl.classList.remove("is-on"), o.ms || 2600);
    });
  }
  toast.show = toast;
  window.GUNR_TOAST = toast;

  function copyText(text, okMsg) {
    function legacy() {
      const ta = doc.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;top:0;left:0;opacity:0;pointer-events:none";
      doc.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = doc.execCommand("copy"); } catch (e) { ok = false; }
      doc.body.removeChild(ta);
      toast(ok ? okMsg : "Copy failed: " + text);
    }
    if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext !== false) {
      navigator.clipboard.writeText(text).then(() => toast(okMsg), legacy);
    } else legacy();
  }

  function copyEmail() {
    if (!isSet(P.email)) { toast("Email not set yet"); return; }
    copyText(String(P.email).trim(), "Email copied");
  }

  function share() {
    const data = { title: NAME + " · " + HANDLE, text: isSet(P.tagline) ? P.tagline : NAME, url: SITE_URL };
    if (navigator.share) {
      navigator.share(data).catch((err) => { if (!err || err.name !== "AbortError") copyText(SITE_URL, "Link copied"); });
    } else copyText(SITE_URL, "Link copied");
  }

  function saveContact() {
    if (!window.GUNR_VCARD) { toast("vCard unavailable"); return; }
    try {
      window.GUNR_VCARD.download(P);
      toast("Saved " + window.GUNR_VCARD.filename(P));
    } catch (e) { toast("Could not build the contact file"); }
  }

  /* ---------------------------------------------------------------------------
   * QR
   * ------------------------------------------------------------------------ */
  function setupQr() {
    const box = doc.getElementById("qr-box");
    if (!box) return;
    let done = false;
    function draw() {
      if (done) return;
      const Q = window.GUNR_QR;
      const svg = Q && Q.ready() ? Q.svg(SITE_URL, { ecc: "M", margin: 2, dark: "#0B0B0C", light: "#EDEAE4", label: "QR code linking to " + SITE_URL }) : null;
      if (!svg) return;
      done = true;
      box.innerHTML = svg;
      box.classList.add("is-ready");
    }
    function fail() {
      if (done) return;
      box.innerHTML = '<span class="qr-wait label">' + esc(SITE_URL.replace(/^https?:\/\//, "")) + "</span>";
      box.classList.add("is-failed");
    }
    draw();
    doc.addEventListener("gunr:qr-ready", draw);
    doc.addEventListener("gunr:qr-failed", fail);
    setTimeout(() => { draw(); if (!done) fail(); }, 9000);
  }

  /* ---------------------------------------------------------------------------
   * Scene bridge (scene.js is optional)
   * ------------------------------------------------------------------------ */
  function scene() {
    const S = window.GUNR_SCENE;
    return S && S.ready ? S : null;
  }
  function accentColor() {
    return getComputedStyle(root).getPropertyValue("--signal").trim() || "#FF5A1F";
  }
  function syncAccent() {
    const S = scene();
    if (S && S.setAccent) fire(() => S.setAccent(accentColor()));
  }

  /* ---------------------------------------------------------------------------
   * Scroll state: section bounds, progress, current layer
   * ------------------------------------------------------------------------ */
  let starts = sections.map(() => 0);
  let maxScroll = 1;
  let sectionSTs = null; // ScrollTrigger instances in FULL mode
  let current = -1;
  let lenis = null;
  let lastSceneSec = -1;

  function measure() {
    const y = window.scrollY;
    if (sectionSTs) starts = sectionSTs.map((t) => t.start);
    else starts = sections.map((s) => (s ? s.getBoundingClientRect().top + y : 0));
    maxScroll = Math.max(1, (doc.scrollingElement || root).scrollHeight - window.innerHeight);
    update();
  }

  const progFill = doc.getElementById("progress-fill");
  const dock = doc.getElementById("dock");

  function update() {
    const y = window.scrollY;
    const vh = window.innerHeight;
    const p = clamp(y / maxScroll, 0, 1);
    if (progFill) progFill.style.transform = "scaleX(" + p.toFixed(4) + ")";

    // Scene: section index + progress inside it.
    let si = 0;
    for (let k = 0; k < starts.length; k++) if (y >= starts[k] - 1) si = k;
    const end = si + 1 < starts.length ? starts[si + 1] : maxScroll;
    const t = end > starts[si] ? clamp((y - starts[si]) / (end - starts[si]), 0, 1) : 1;
    const S = scene();
    if (S) {
      fire(() => {
        if (S.setProgress) S.setProgress(p);
        if (S.setSection) S.setSection(si, t);
        if (!MOTION && si !== lastSceneSec && S.staticFrame) S.staticFrame();
      });
      lastSceneSec = si;
    }

    // UI: the layer whose top has crossed 45% of the viewport.
    let ci = 0;
    for (let k = 0; k < starts.length; k++) if (y + vh * 0.45 >= starts[k]) ci = k;
    setCurrent(ci);

    if (dock) {
      const onOut = sections[5] && y + vh > starts[5] + vh * 0.35;
      root.classList.toggle("dock-on", y > vh * 0.55 && !onOut);
    }
  }

  const topIdx = doc.getElementById("topbar-idx");
  const topName = doc.getElementById("topbar-layer");
  const idxLinks = $$(".idx-a");
  const idxDot = $(".idx-dot");

  function setCurrent(i) {
    if (i === current) return;
    current = i;
    const L = LAYERS[i];
    root.setAttribute("data-section", L.key);
    if (topIdx) scramble(topIdx, pad2(i), "0123456789");
    if (topName) scramble(topName, L.name);
    idxLinks.forEach((a, k) => {
      if (k === i) a.setAttribute("aria-current", "true");
      else a.removeAttribute("aria-current");
    });
    if (idxDot && idxLinks[i]) idxDot.style.transform = "translateY(" + idxLinks[i].offsetTop + "px)";
  }

  /* Decode text in left to right, unresolved positions cycling random glyphs. */
  const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#/<>_";
  function scramble(el, text, set) {
    if (el._scr) cancelAnimationFrame(el._scr);
    if (!MOTION) { el.textContent = text; return; }
    const glyphs = set || GLYPHS;
    const from = el.textContent;
    const len = Math.max(from.length, text.length);
    const t0 = performance.now();
    const step = (now) => {
      const e = now - t0;
      let out = "";
      let doneAll = true;
      for (let k = 0; k < len; k++) {
        const at = 90 + k * 34;
        if (e >= at) out += text.charAt(k);
        else {
          doneAll = false;
          out += e < 40 ? from.charAt(k) : glyphs.charAt((Math.random() * glyphs.length) | 0);
        }
      }
      el.textContent = out;
      if (!doneAll) el._scr = requestAnimationFrame(step);
      else { el.textContent = text; el._scr = 0; }
    };
    el._scr = requestAnimationFrame(step);
  }

  /* ---------------------------------------------------------------------------
   * Navigation
   * ------------------------------------------------------------------------ */
  function resolveLayer(tgt) {
    if (typeof tgt === "number") return tgt | 0;
    let s = String(tgt == null ? "" : tgt).toLowerCase().trim().replace(/^#/, "");
    if (/^\d+$/.test(s)) return +s;
    if (/^layer[-_ ]/.test(s)) s = s.slice(6);
    if (/^\d+$/.test(s)) return +s;
    for (let i = 0; i < LAYERS.length; i++) {
      if (LAYERS[i].key === s || LAYERS[i].id === s || LAYERS[i].aliases.indexOf(s) !== -1) return i;
    }
    return -1;
  }

  function focusNoScroll(el) {
    if (!el) return;
    try { el.focus({ preventScroll: true }); } catch (e) { /* old browsers */ }
  }

  function goto(target, instant) {
    const i = resolveLayer(target);
    const sec = sections[i];
    if (!sec) return false;
    if (window.GUNR_BOOT && !window.GUNR_BOOT.done) window.GUNR_BOOT.skip();
    if (!sectionSTs) measure();
    const y = i === 0 ? 0 : Math.min(starts[i], maxScroll);
    if (lenis) {
      lenis.start();
      lenis.resize(); // its scroll limit may predate the pin spacer
      lenis.scrollTo(y, instant ? { immediate: true, force: true } : { duration: 1.5, force: true, easing: (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)) });
    } else {
      window.scrollTo({ top: y, behavior: instant || !MOTION ? "auto" : "smooth" });
    }
    focusNoScroll(sec.querySelector("h1, h2"));
    return true;
  }

  /* ---------------------------------------------------------------------------
   * Interactions (all modes)
   * ------------------------------------------------------------------------ */
  const cloudChips = $$(".att-cloud-list li");
  const attQ = doc.getElementById("att-q");
  let attPinned = -1;

  function showAttention(q) {
    const r = research[q];
    const map = {};
    if (r) attnWeights(r).forEach((c) => { map[c.k.toLowerCase()] = c.w; });
    let lit = 0;
    cloudChips.forEach((li) => {
      const w = map[li.getAttribute("data-chip")];
      const on = w !== undefined;
      li.classList.toggle("is-on", on);
      li.style.setProperty("--w", on ? w.toFixed(3) : "0");
      li.style.setProperty("--i", on ? String(lit++) : "0"); // lights chips in sequence
      const b = li.querySelector("b");
      if (b) b.textContent = on ? w.toFixed(2).replace(/^0/, "") : "";
    });
    $$(".att-row").forEach((row) => row.classList.toggle("is-focus", +row.getAttribute("data-q") === q));
    root.classList.toggle("att-active", q >= 0);
    const S = scene();
    if (q >= 0 && S && S.pulse) S.pulse();
    if (attQ) attQ.textContent = q >= 0 ? "q = R." + pad2(q + 1) : "q = —";
  }

  function toggleRow(btn) {
    const row = btn.closest(".att-row");
    const open = btn.getAttribute("aria-expanded") !== "true";
    btn.setAttribute("aria-expanded", String(open));
    row.classList.toggle("is-open", open);
    const q = +row.getAttribute("data-q");
    attPinned = open ? q : -1;
    showAttention(open ? q : -1);
    if (ST) setTimeout(() => ST.refresh(), 700); // the row's height changed
  }

  $$(".att-row").forEach((row) => {
    const q = +row.getAttribute("data-q");
    row.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") showAttention(q); });
    row.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") showAttention(attPinned); });
    row.addEventListener("focusin", () => showAttention(q));
  });

  function toggleSkill(btn, force) {
    const open = force !== undefined ? force : btn.getAttribute("aria-expanded") !== "true";
    btn.setAttribute("aria-expanded", String(open));
    btn.closest(".w-row").classList.toggle("is-open", open);
  }

  function selectSkill(name) {
    const btn = $$(".w-btn").find((b) => (b.getAttribute("data-skill") || "").toLowerCase() === String(name || "").toLowerCase());
    if (!btn) return false;
    goto("weights");
    toggleSkill(btn, true);
    return true;
  }

  doc.addEventListener("click", (e) => {
    const t = e.target;
    if (!t || !t.closest) return;
    const act = t.closest("[data-action]");
    if (act) {
      const a = act.getAttribute("data-action");
      if (a === "save") { e.preventDefault(); saveContact(); }
      else if (a === "copy-email") { e.preventDefault(); copyEmail(); }
      else if (a === "share") { e.preventDefault(); share(); }
      return;
    }
    const head = t.closest(".att-head");
    if (head) { toggleRow(head); return; }
    const sk = t.closest(".w-btn");
    if (sk) { toggleSkill(sk); return; }
    const link = t.closest('a[href^="#layer-"]');
    if (link) { e.preventDefault(); goto(link.getAttribute("href")); }
  });

  /* ---------------------------------------------------------------------------
   * Theme
   * ------------------------------------------------------------------------ */
  const THEME_ALIAS = { signal: "signal", lime: "lime", cyan: "cyan", green: "lime", amber: "signal" };
  function setTheme(name) {
    const t = THEME_ALIAS[String(name || "").toLowerCase()];
    if (!t) return false;
    root.setAttribute("data-theme", t);
    try { localStorage.setItem("gunr.theme", t); } catch (e) { /* storage blocked */ }
    emit("gunr:themechange", { theme: t });
    return true;
  }
  doc.addEventListener("gunr:themechange", () => requestAnimationFrame(syncAccent));
  doc.addEventListener("gunr:scene-ready", () => { syncAccent(); update(); const S = scene(); if (S && !MOTION && S.staticFrame) fire(() => S.staticFrame()); });

  /* ---------------------------------------------------------------------------
   * Simple mode: IntersectionObserver + CSS (reduced motion or no GSAP)
   * ------------------------------------------------------------------------ */
  function setupSimple() {
    root.classList.add("mo-css");
    const targets = $$("[data-reveal], [data-split], [data-lines], [data-hero], .epoch, .vec, .w-group");
    targets.forEach((el) => el.classList.add("rv"));
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver((entries) => entries.forEach((en) => {
        if (en.isIntersecting) { en.target.classList.add("is-in"); io.unobserve(en.target); }
      }), { rootMargin: "0px 0px -8% 0px" });
      targets.forEach((el) => { if (!el.hasAttribute("data-hero")) io.observe(el); });
    } else targets.forEach((el) => el.classList.add("is-in"));

    let ticking = false;
    window.addEventListener("scroll", () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => { ticking = false; update(); });
    }, { passive: true });
    window.addEventListener("resize", measure, { passive: true });
    window.addEventListener("load", measure);
    if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(measure, () => {});
    if (window.ResizeObserver) new ResizeObserver(measure).observe(mount);

    if (MOTION) setupMarqueeCSS();
    measure();
  }

  function heroInSimple() {
    hero.classList.add("is-in");
    $$("[data-hero]").forEach((el) => el.classList.add("is-in"));
  }

  // Without GSAP but with motion: a plain CSS marquee keeps the band alive.
  function setupMarqueeCSS() {
    const m = $(".marquee");
    if (m) m.classList.add("is-css");
  }

  /* ---------------------------------------------------------------------------
   * Full motion: Lenis + GSAP
   * ------------------------------------------------------------------------ */
  let heroTl = null;
  let velocity = 0;

  function setupFull() {
    gsap.registerPlugin(ST);
    if (Split) gsap.registerPlugin(Split);
    gsap.defaults({ ease: "expo.out", duration: 1.1 });
    ST.config({ ignoreMobileResize: true });

    // Smooth scroll; native scroll on touch (Lenis default), driven by GSAP's ticker.
    if (window.Lenis) {
      try {
        lenis = new window.Lenis({
          lerp: 0.09,
          smoothWheel: true,
          prevent: (node) => !!(node && node.closest && node.closest("#gunr-term, [data-lenis-prevent]"))
        });
        lenis.on("scroll", ST.update);
        gsap.ticker.add((time) => lenis.raf(time * 1000));
        gsap.ticker.lagSmoothing(0);
        // Freeze page scroll under the terminal overlay.
        new MutationObserver(() => {
          if (root.classList.contains("term-open")) lenis.stop(); else lenis.start();
        }).observe(root, { attributes: true, attributeFilter: ["class"] });
      } catch (e) { lenis = null; }
    }

    // Hero: chars wait below their masks for the entrance.
    gsap.set(".hero .ch", { yPercent: 118 });
    gsap.set("[data-hero]", { autoAlpha: 0, y: 24 });

    setupHorizontal(); // creates the pin first so later triggers account for its spacing

    // Section bounds for the scene and the top bar.
    sectionSTs = sections.map((s) => ST.create({ trigger: s, start: "top top" }));
    ST.addEventListener("refresh", measure);
    ST.create({ start: 0, end: "max", onUpdate: update });

    setupReveals();
    setupScrubs();
    setupVector();
    setupSkillBars();
    setupMarquee();
    if (FINE) { setupCursor(); setupMagnetic(); }

    if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(() => ST.refresh(), () => {});
    window.addEventListener("load", () => ST.refresh());
  }

  function heroInFull() {
    if (heroTl) return;
    heroTl = gsap.timeline({ defaults: { ease: "expo.out" } })
      .to(".hn-first .ch", { yPercent: 0, duration: 1.25, stagger: 0.04 }, 0)
      .to(".hn-last .ch", { yPercent: 0, duration: 1.25, stagger: 0.035 }, 0.12)
      .to("[data-hero]", { autoAlpha: 1, y: 0, duration: 1.1, stagger: 0.07 }, 0.45);
  }

  /* SplitText masked reveals; plain fade-ups where it's unavailable. */
  function setupReveals() {
    const splitTargets = $$("[data-split]");
    const lineTargets = $$("[data-lines]");
    if (Split) {
      splitTargets.forEach((el) => {
        Split.create(el, {
          type: "lines,words", mask: "lines", linesClass: "ln", wordsClass: "wd", autoSplit: true,
          // aria-label is only valid on headings; paragraphs keep their word spans readable.
          aria: /^H[1-6]$/.test(el.tagName) ? "auto" : "none",
          onSplit: (self) => gsap.from(self.words, {
            yPercent: 110, duration: 1.15, stagger: 0.045,
            scrollTrigger: { trigger: el, start: "top 88%", once: true }
          })
        });
      });
      lineTargets.forEach((el) => {
        Split.create(el, {
          type: "lines", mask: "lines", linesClass: "ln", aria: "none", autoSplit: true,
          onSplit: (self) => gsap.from(self.lines, {
            yPercent: 105, duration: 1.05, stagger: 0.07,
            scrollTrigger: { trigger: el, start: "top 90%", once: true }
          })
        });
      });
    } else {
      splitTargets.concat(lineTargets).forEach((el) => el.setAttribute("data-reveal", ""));
    }

    const fades = $$("[data-reveal]").filter((el) => !el.hasAttribute("data-split") && !el.hasAttribute("data-lines"));
    gsap.set(fades, { autoAlpha: 0, y: 28 });
    ST.batch(fades, {
      start: "top 92%", once: true,
      onEnter: (batch) => gsap.to(batch, { autoAlpha: 1, y: 0, duration: 1, stagger: 0.08, overwrite: true })
    });
  }

  function setupScrubs() {
    // Hero drifts up and dims as the pass begins.
    gsap.to(".hero-name", { yPercent: -22, ease: "none", scrollTrigger: { trigger: hero, start: "top top", end: "bottom top", scrub: true } });
    gsap.to(".hero-foot, .hero-cue", { y: -60, opacity: 0.15, ease: "none", scrollTrigger: { trigger: hero, start: "20% top", end: "bottom top", scrub: true } });

    // Big section numerals: parallax, plus a velocity skew.
    $$(".sec-num").forEach((n) => {
      gsap.fromTo(n, { yPercent: 30 }, { yPercent: -30, ease: "none", scrollTrigger: { trigger: n.parentElement, start: "top bottom", end: "bottom top", scrub: true } });
    });
    const skewers = $$(".sec-num, .out-head .sec-title");
    const skewTo = skewers.map((el) => gsap.quickTo(el, "skewY", { duration: 0.6, ease: "power3.out" }));

    // Velocity source: Lenis when present, otherwise the scroll delta per frame.
    let lastY = window.scrollY, lastSk = 0;
    gsap.ticker.add(() => {
      const y = window.scrollY;
      velocity = lenis ? lenis.velocity : y - lastY;
      lastY = y;
      const sk = clamp(velocity * 0.08, -3, 3);
      if (Math.abs(sk - lastSk) < 0.01) return; // let GSAP idle when scroll is still
      lastSk = sk;
      skewTo.forEach((fn) => fn(sk));
    });

    // Contact headline scales up slightly into place.
    const out = sections[5];
    if (out) gsap.fromTo(".out-head .sec-title", { scale: 0.92, transformOrigin: "0% 100%" }, { scale: 1, ease: "none", scrollTrigger: { trigger: out, start: "top bottom", end: "top 30%", scrub: true } });
  }

  function setupVector() {
    const vec = $(".vec");
    if (!vec) return;
    const bars = $$(".vec-bar i", vec);
    const vals = $$(".vec-val", vec);
    gsap.set(bars, { scaleX: 0 });
    gsap.set(".vec-row", { autoAlpha: 0, x: -12 });
    ST.create({
      trigger: vec, start: "top 85%", once: true,
      onEnter: () => {
        gsap.to(".vec-row", { autoAlpha: 1, x: 0, duration: 0.9, stagger: 0.07 });
        bars.forEach((b, k) => gsap.to(b, { scaleX: +b.closest(".vec-row").style.getPropertyValue("--v") || 0, duration: 1.4, delay: 0.15 + k * 0.07 }));
        vals.forEach((v, k) => tickNumber(v, v.getAttribute("data-val"), 900 + k * 70));
      }
    });
  }

  /* Numbers cycle random digits, then settle. */
  function tickNumber(el, final, ms) {
    const t0 = performance.now();
    const step = (now) => {
      const k = (now - t0) / ms;
      if (k >= 1) { el.textContent = final; return; }
      el.textContent = (Math.random() * 0.99).toFixed(2);
      setTimeout(() => requestAnimationFrame(step), 45);
    };
    requestAnimationFrame(step);
  }

  function setupSkillBars() {
    $$(".w-group").forEach((g) => {
      const bars = $$(".w-bar i", g);
      gsap.set(bars, { scaleX: 0 });
      ST.create({
        trigger: g, start: "top 85%", once: true,
        onEnter: () => bars.forEach((b, k) => gsap.to(b, { scaleX: +b.style.getPropertyValue("--v") || 0, duration: 1.3, delay: 0.2 + k * 0.05 }))
      });
    });
  }

  /* Velocity-reactive marquee: base drift, speeds up with scroll, flips with direction. */
  function setupMarquee() {
    const m = $(".marquee");
    const inner = m && $(".marquee-inner", m);
    const set = m && $(".mq-set", m);
    if (!inner || !set) return;
    let x = 0, dir = -1, w = set.offsetWidth, visible = false, speed = 0;
    const measureW = () => { w = set.offsetWidth; };
    ST.addEventListener("refresh", measureW);
    ST.create({ trigger: m, start: "top bottom", end: "bottom top", onToggle: (self) => { visible = self.isActive; } });
    const skewTo = gsap.quickTo(inner, "skewX", { duration: 0.5, ease: "power3.out" });
    gsap.ticker.add((time, dt) => {
      if (!visible || !w) return;
      if (velocity > 0.3) dir = -1; else if (velocity < -0.3) dir = 1;
      const target = 55 + Math.min(Math.abs(velocity) * 14, 900);
      speed += (target - speed) * 0.08;
      x += dir * speed * (dt / 1000);
      if (x <= -w) x += w;
      if (x > 0) x -= w;
      gsap.set(inner, { x });
      skewTo(clamp(-velocity * 0.12, -7, 7));
    });
  }

  /* Experience: pinned horizontal track with a scrubbed loss curve (desktop),
     vertical timeline with a drawing line (mobile). */
  function setupHorizontal() {
    const sec = sections[3];
    const track = doc.getElementById("hz-track");
    if (!sec || !track) return;
    const epochs = $$(".epoch", track);
    const mm = gsap.matchMedia();

    mm.add("(min-width: 900px) and (min-height: 600px)", () => {
      root.classList.add("hz-on");
      const dist = () => Math.max(0, track.scrollWidth - window.innerWidth);
      buildLoss(track, epochs);
      const xTween = gsap.to(track, {
        x: () => -dist(), ease: "none",
        scrollTrigger: {
          trigger: sec, start: "top top", end: () => "+=" + dist(), pin: true, scrub: 0.8,
          invalidateOnRefresh: true, anticipatePin: 1, refreshPriority: 1,
          onRefresh: () => buildLoss(track, epochs)
        }
      });
      const path = $(".loss-path", track);
      if (path) {
        gsap.fromTo(path, { attr: { "stroke-dashoffset": 1 } }, {
          attr: { "stroke-dashoffset": 0 }, ease: "none",
          scrollTrigger: { trigger: sec, start: "top top", end: () => "+=" + dist(), scrub: 0.8, invalidateOnRefresh: true }
        });
      }
      epochs.forEach((ep) => {
        gsap.from(ep.children, {
          autoAlpha: 0, y: 40, duration: 1, stagger: 0.06,
          scrollTrigger: { trigger: ep, containerAnimation: xTween, start: "left 88%", once: true }
        });
      });
      return () => root.classList.remove("hz-on");
    });

    mm.add("(max-width: 899.98px), (max-height: 599.98px)", () => {
      gsap.fromTo(".hz-line i", { scaleY: 0 }, {
        scaleY: 1, ease: "none",
        scrollTrigger: { trigger: ".hz-epochs", start: "top 65%", end: "bottom 65%", scrub: true }
      });
      epochs.forEach((ep) => {
        gsap.from(ep, { autoAlpha: 0, y: 40, duration: 1, scrollTrigger: { trigger: ep, start: "top 88%", once: true } });
      });
    });
  }

  /* Loss curve through each epoch's centre, in track pixels (viewBox = track size). */
  function buildLoss(track, epochs) {
    const svg = $(".loss", track);
    if (!svg) return;
    const W = Math.max(1, track.scrollWidth);
    const H = 200;
    const y = (loss) => 18 + (1 - clamp(loss, 0, 1)) * (H - 36); // high loss sits high
    const pts = [{ x: 0, y: y(0.98) }];
    epochs.forEach((ep) => {
      pts.push({ x: ep.offsetLeft + ep.offsetWidth * 0.5, y: y(+ep.getAttribute("data-loss") || 0.5) });
    });
    const lastLoss = epochs.length ? +epochs[epochs.length - 1].getAttribute("data-loss") : 0.5;
    pts.push({ x: W, y: y(Math.max(0, lastLoss * 0.7)) });
    // Catmull-Rom to cubic Bezier for a smooth descent.
    let d = "M" + pts[0].x.toFixed(1) + " " + pts[0].y.toFixed(1);
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
      const c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
      d += "C" + [c1x, c1y, c2x, c2y, p2.x, p2.y].map((v) => v.toFixed(1)).join(" ");
    }
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    $(".loss-path", svg).setAttribute("d", d);
    $(".loss-base", svg).setAttribute("d", "M0 " + (H - 1) + "H" + W);
    $(".loss-pts", svg).innerHTML = pts.slice(1, -1).map((p) => '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="4"/>').join("");
  }

  /* Custom cursor: dot + lagging ring that grows and labels on interactive elements. */
  function setupCursor() {
    const c = doc.createElement("div");
    c.className = "cursor";
    c.setAttribute("aria-hidden", "true");
    c.innerHTML = '<span class="cursor-ring"><span class="cursor-label"></span></span><span class="cursor-dot"></span>';
    doc.body.appendChild(c);
    root.classList.add("has-cursor");
    const ring = $(".cursor-ring", c), dot = $(".cursor-dot", c), label = $(".cursor-label", c);
    // Ring and dot sit exactly on the pointer (no easing lag).
    const moveTo = gsap.quickSetter([ring, dot], "css");
    let shown = false, lx = -1, ly = -1, scrollQueued = false;
    window.addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse") return;
      lx = e.clientX; ly = e.clientY;
      if (!shown) { shown = true; c.classList.add("is-on"); }
      moveTo({ x: e.clientX, y: e.clientY });
    }, { passive: true });
    doc.documentElement.addEventListener("pointerleave", () => { shown = false; c.classList.remove("is-on"); });
    doc.addEventListener("pointerdown", () => c.classList.add("is-down"));
    doc.addEventListener("pointerup", () => c.classList.remove("is-down"));
    const sync = (target) => {
      const el = target && target.closest && target.closest("a, button, [data-cursor], input, textarea");
      const isText = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA");
      c.classList.toggle("is-hover", !!el && !isText);
      c.classList.toggle("is-text", !!isText);
      const lab = el && el.getAttribute("data-cursor");
      label.textContent = lab || "";
      c.classList.toggle("has-label", !!lab);
    };
    doc.addEventListener("pointerover", (e) => sync(e.target));
    // Content can scroll under a still pointer without boundary events; re-check once per frame.
    window.addEventListener("scroll", () => {
      if (scrollQueued || !shown || lx < 0) return;
      scrollQueued = true;
      requestAnimationFrame(() => { scrollQueued = false; sync(doc.elementFromPoint(lx, ly)); });
    }, { passive: true });
  }

  /* Magnetic buttons: pull toward the pointer, at most ~10px. */
  function setupMagnetic() {
    $$("[data-magnetic]").forEach((el) => {
      const inner = el.querySelector(".btn-in") || el;
      const xTo = gsap.quickTo(el, "x", { duration: 0.6, ease: "power3.out" });
      const yTo = gsap.quickTo(el, "y", { duration: 0.6, ease: "power3.out" });
      const ixTo = gsap.quickTo(inner, "x", { duration: 0.6, ease: "power3.out" });
      const iyTo = gsap.quickTo(inner, "y", { duration: 0.6, ease: "power3.out" });
      let r = null;
      el.addEventListener("pointerenter", () => { r = el.getBoundingClientRect(); });
      el.addEventListener("pointermove", (e) => {
        if (!r || e.pointerType !== "mouse") return;
        const mx = e.clientX - (r.left + r.width / 2);
        const my = e.clientY - (r.top + r.height / 2);
        xTo(clamp(mx * 0.22, -10, 10)); yTo(clamp(my * 0.3, -8, 8));
        ixTo(clamp(mx * 0.08, -4, 4)); iyTo(clamp(my * 0.1, -3, 3));
      });
      el.addEventListener("pointerleave", () => { r = null; xTo(0); yTo(0); ixTo(0); iyTo(0); });
    });
  }

  /* ---------------------------------------------------------------------------
   * Hero media: the optional generated loop + poster (PROFILE.assets), layered
   * over the particle canvas with mix-blend-mode: screen. Every file is optional;
   * the layer stays invisible until something actually loads, so a missing file
   * leaves the hero exactly as it was (no broken icon, no layout shift).
   *   desktop / landscape: heroLoopWebm + heroLoop, poster heroPoster
   *   phones / portrait:   heroLoopMobileWebm + heroLoopMobile, poster heroMobile,
   *                        each falling back to the desktop file when it 404s
   * Video only in full motion, never on 2g/3g, and only after a poster loaded; no
   * media at all on Save-Data. Video plays only while the hero is on screen.
   * Loading waits for the loader and an idle moment.
   * ------------------------------------------------------------------------ */
  function setupHeroMedia() {
    const box = doc.getElementById("hero-media");
    const inner = box && $(".hero-media-in", box);
    const A = P.assets || {};
    if (!inner || !hero) return;

    const portrait = mq("(max-width: 767px)").matches || window.innerWidth / Math.max(1, window.innerHeight) < 0.8;
    box.classList.toggle("is-portrait", portrait);
    const pick = (keys) => keys.map((k) => A[k]).filter(isSet).map(String);
    const posters = pick(portrait ? ["heroMobile", "heroPoster"] : ["heroPoster"]);
    const loops = (portrait ? [["heroLoopMobileWebm", "heroLoopMobile"]] : [])
      .concat([["heroLoopWebm", "heroLoop"]]).map(pick).filter((s) => s.length);
    const conn = navigator.connection || {};
    const slow = !!conn.saveData || /(^|-)[23]g$/.test(String(conn.effectiveType || ""));
    const allowVideo = MOTION && !slow && loops.length > 0;
    // Save-Data: no media at all; the particle scene is the background.
    if (conn.saveData || (!posters.length && !allowVideo)) return;

    let shown = false, inView = true, video = null;

    function dimScene() {
      const S = scene();
      if (shown && S && S.setHeroDim) fire(() => S.setHeroDim(0.6));
    }
    function reveal() {
      if (shown) return;
      shown = true;
      box.classList.add("is-in");
      dimScene();
    }
    doc.addEventListener("gunr:scene-ready", dimScene);

    // Poster: decoded off-DOM and inserted only once it has loaded. The poster is
    // frame 0 of its loop, so the video is only tried once a poster exists: the
    // mobile poster -> mobile loop set first; the desktop fallback -> desktop set.
    // With no files present that is 1 request on desktop, 2 on phones.
    function loadPoster(i) {
      if (i >= posters.length) return;
      const img = new Image();
      img.alt = "";
      img.decoding = "async";
      img.className = "hm-poster";
      img.onload = () => {
        inner.insertBefore(img, inner.firstChild);
        reveal();
        if (allowVideo && !video) loadVideo(portrait && posters[i] === String(A.heroMobile) ? 0 : loops.length - 1);
      };
      img.onerror = () => loadPoster(i + 1);
      img.src = posters[i];
    }

    const play = () => {
      if (!video || !inView || doc.hidden) return;
      const p = video.play();
      if (p && p.catch) p.catch(() => { /* autoplay refused: the poster stays */ });
    };
    const pause = () => { if (video) video.pause(); };

    // Video: one <source> per format; when the last one errors, the set failed
    // and the next set (desktop files) is tried, then the video is dropped.
    function loadVideo(i) {
      if (video) { video.remove(); video = null; }
      if (i >= loops.length) return;
      const v = doc.createElement("video");
      video = v;
      v.className = "hm-video";
      v.muted = true;
      v.defaultMuted = true;
      v.playsInline = true;
      ["muted", "playsinline", "loop", "autoplay", "disablepictureinpicture", "disableremoteplayback"].forEach((a) => v.setAttribute(a, ""));
      v.setAttribute("preload", "none");
      v.setAttribute("tabindex", "-1");
      loops[i].forEach((src) => {
        const s = doc.createElement("source");
        s.src = src;
        s.type = /\.webm(\?|#|$)/i.test(src) ? "video/webm" : "video/mp4";
        v.appendChild(s);
      });
      const next = () => { if (v === video) loadVideo(i + 1); };
      v.lastElementChild.addEventListener("error", next);
      v.addEventListener("error", next);
      v.addEventListener("canplay", () => {
        if (v !== video) return;
        v.classList.add("is-ready");
        reveal();
        if (inView) play(); else pause();
      }, { once: true });
      inner.appendChild(v);
      if (!inView) pause();
    }

    if ("IntersectionObserver" in window) {
      new IntersectionObserver((en) => {
        inView = en[en.length - 1].isIntersecting;
        if (inView) play(); else pause();
      }).observe(hero);
    }
    doc.addEventListener("visibilitychange", () => { if (doc.hidden) pause(); else play(); });

    // Full motion: the layer settles (1.06 -> 1) and fades out as the hero scrolls away.
    if (mode === "full") {
      gsap.fromTo(inner, { scale: 1.06, autoAlpha: 1 }, {
        scale: 1, autoAlpha: 0, ease: "none",
        scrollTrigger: { trigger: hero, start: "top top", end: "bottom top", scrub: true }
      });
    }

    function go() {
      const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 200));
      idle(() => loadPoster(0), { timeout: 2500 });
    }
    if (window.GUNR_BOOT && !window.GUNR_BOOT.done) doc.addEventListener("gunr:boot-done", go, { once: true });
    else go();
  }

  /* Once per session, when motion is reduced only because of the OS setting, point
     at the Motion switch: a longer toast plus two outline pulses on the switch. */
  function motionHint() {
    const M = window.GUNR_MOTION;
    if (!M || M.full || M.source !== "system") return;
    try {
      if (sessionStorage.getItem("gunr.motionHint") === "1") return;
      sessionStorage.setItem("gunr.motionHint", "1");
    } catch (e) { /* storage blocked: show it anyway */ }
    // Say where the switch is: below 360px it lives in the footer, not the top bar.
    const where = mq("(max-width: 359.98px)").matches ? " (switch at the bottom of the page)" : " (top right)";
    setTimeout(() => {
      toast("Reduced motion is on in your system settings. Turn on Motion" + where + " for the full experience.", { ms: 7000, long: true });
      $$("[data-motion-toggle]").forEach((t) => {
        t.classList.remove("is-hint");
        void t.offsetWidth; // restart the pulse
        t.classList.add("is-hint");
      });
    }, 1600);
  }

  /* ---------------------------------------------------------------------------
   * Start
   * ------------------------------------------------------------------------ */
  window.GUNR_JOURNEY = {
    layers: LAYERS.map((L) => L.id),
    goto,
    current: () => LAYERS[Math.max(0, current)].id,
    setTheme,
    selectSkill,
    saveContact,
    copyEmail,
    share,
    toast,
    get lenis() { return lenis; }
  };

  fire(setupQr);

  let mode = "simple";
  if (FULL) {
    try { setupFull(); mode = "full"; }
    catch (e) {
      // Undo any half-applied motion so nothing is left hidden, then fall back.
      fire(() => { ST.getAll().forEach((t) => t.kill()); });
      fire(() => { if (lenis) lenis.destroy(); lenis = null; });
      fire(() => gsap.set($$(".ch, [data-hero], [data-reveal], .epoch, .epoch > *, .vec-row, .vec-bar i, .w-bar i"), { clearProps: "all" }));
      sectionSTs = null;
      if (window.console) console.warn("GUNR: motion setup failed, using simple mode", e);
    }
  }
  if (mode === "simple") setupSimple();
  fire(setupHeroMedia);
  measure();
  window.GUNR_JOURNEY_READY = true;

  // Hero entrance starts as the loader's curtain lifts (or right away without one).
  let begun = false;
  function begin() {
    if (begun) return;
    begun = true;
    if (mode === "full") heroInFull(); else heroInSimple();
    if (sectionSTs) ST.refresh();
    fire(motionHint);
    fire(motionReturn);
  }

  /* After the Motion switch reloads the page: return to the same scroll position,
     put focus back on the switch if it had it, and announce the new mode. */
  function motionReturn() {
    let r = null;
    try {
      r = JSON.parse(sessionStorage.getItem("gunr.motionReturn") || "null");
      sessionStorage.removeItem("gunr.motionReturn");
    } catch (e) { return; }
    if (!r) return;
    const y = Math.max(0, +r.y || 0);
    if (y && !(resolveLayer(location.hash) > 0)) { // a hash deep link already places the page
      const jump = () => {
        if (lenis) lenis.scrollTo(y, { immediate: true, force: true });
        else window.scrollTo(0, y);
      };
      jump();
      // Again once load/fonts have settled the layout (and full mode's pin spacing).
      if (doc.readyState !== "complete") window.addEventListener("load", () => setTimeout(jump, 80), { once: true });
    }
    if (r.focus) {
      const t = $$("[data-motion-toggle]").find((el) => el.offsetParent !== null);
      if (t) t.focus({ preventScroll: true });
    }
    toast("Motion " + (window.GUNR_MOTION && window.GUNR_MOTION.full ? "on" : "off"));
  }
  if (window.GUNR_BOOT && !window.GUNR_BOOT.done) {
    doc.addEventListener("gunr:boot-opening", begin, { once: true });
    doc.addEventListener("gunr:boot-done", begin, { once: true });
    setTimeout(begin, 6000); // failsafe: never keep the hero hidden
  } else {
    begin();
  }

  // Deep links (e.g. /#layer-output from the 404 page).
  const deep = resolveLayer(location.hash);
  if (deep > 0) {
    // Jump now, then again once fonts/load have settled the layout (and the pin spacing).
    const jump = () => goto(deep, true);
    requestAnimationFrame(jump);
    if (doc.readyState !== "complete") window.addEventListener("load", () => setTimeout(jump, 80), { once: true });
    if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(() => setTimeout(jump, 80), () => {});
  }
  syncAccent();
})();
