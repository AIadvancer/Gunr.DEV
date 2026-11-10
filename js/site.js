/* =============================================================================
 * GUNR.DEV v4 — site.js
 * -----------------------------------------------------------------------------
 * Renders every section from window.PROFILE (js/content.js), starts the live
 * neural field (js/field/field.js) and runs the scroll-driven motion.
 * Values still containing "[[" are placeholders: hidden from links/buttons and
 * left out of the copy.
 * ========================================================================== */
(function () {
  "use strict";

  var doc = document, root = doc.documentElement;
  var P = window.PROFILE || {}, U = window.GUNR_UTIL || {};
  var MOTION = !!(window.GUNR_MOTION && window.GUNR_MOTION.full);
  var isSet = U.isSet || function (v) { return v != null && String(v).trim() !== "" && String(v).indexOf("[[") === -1; };
  var esc = U.esc || function (v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var $ = function (s, c) { return (c || doc).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || doc).querySelectorAll(s)); };
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var mq = function (q) { return !!(window.matchMedia && matchMedia(q).matches); };
  var arr = function (v) { return Array.isArray(v) ? v : []; };
  var COARSE = mq("(pointer: coarse)");

  /* ---- data ----------------------------------------------------------------- */
  var first = P.name && isSet(P.name.first) ? String(P.name.first) : "", last = P.name && isSet(P.name.last) ? String(P.name.last) : "";
  var NAME = (U.fullName ? U.fullName(P) : [first, last].join(" ").trim()) || "GUNR";
  var SITE = isSet(P.siteUrl) ? String(P.siteUrl) : location.origin;
  var HOST = SITE.replace(/^https?:\/\//, "").replace(/\/$/, "");
  var TEL = U.telHref ? U.telHref(P.phone) : (isSet(P.phone) ? "tel:" + String(P.phone).replace(/[^\d+]/g, "") : "");
  var LINKS = arr(P.links).filter(function (l) { return l && isSet(l.url); });
  var num = function (v, d) { return (Math.round(v * Math.pow(10, d)) / Math.pow(10, d)).toFixed(d); };

  var ICON = {
    card: '<path d="M12 4v10m0 0-4-4m4 4 4-4M5 19h14"/>',
    mail: '<rect x="3" y="5.500" width="18" height="13" rx="2.500"/><path d="m4 7.500 8 6 8-6"/>',
    phone: '<path d="M5.500 4h3l1.500 4-2 1.500a11 11 0 0 0 5.500 5.500l1.500-2 4 1.500v3a1.500 1.500 0 0 1-1.500 1.500A14.500 14.500 0 0 1 4 5.500 1.500 1.500 0 0 1 5.500 4z"/>',
    github: '<path d="M9 19c-4 1.300-4-2-6-2.500m12 4.500v-3.300a2.900 2.900 0 0 0-.800-2.200c2.700-.300 5.500-1.300 5.500-6a4.700 4.700 0 0 0-1.300-3.200 4.300 4.300 0 0 0-.100-3.200s-1-.300-3.400 1.300a11.600 11.600 0 0 0-6 0C6.500 2.800 5.500 3.100 5.500 3.100a4.300 4.300 0 0 0-.100 3.200A4.700 4.700 0 0 0 4.100 9.500c0 4.700 2.800 5.700 5.500 6a2.900 2.900 0 0 0-.800 2.200V21"/>',
    linkedin: '<rect x="3.500" y="3.500" width="17" height="17" rx="2.500"/><path d="M8 10.500v6M8 7.500v.100M12 16.500v-3.500a2 2 0 0 1 4 0v3.500M12 10.500v6"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.700 0l3-3a4 4 0 0 0-5.700-5.700l-1 1M14 10a4 4 0 0 0-5.700 0l-3 3a4 4 0 0 0 5.700 5.700l1-1"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
    share: '<circle cx="18" cy="5.500" r="2.500"/><circle cx="6" cy="12" r="2.500"/><circle cx="18" cy="18.500" r="2.500"/><path d="m8.200 10.800 7.600-4M8.200 13.200l7.600 4"/>',
    qr: '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><path d="M14 14h2v2h-2zM18 14h2M14 18h2M18 18h2v2"/>',
    print: '<path d="M7 9V4h10v5M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2"/><rect x="7" y="14" width="10" height="6" rx="1"/>',
    arrow: '<path d="M7 17 17 7M9 7h8v8"/>'
  };
  function icon(n) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICON[n] || ICON.link) + "</svg>"; }
  function btn(o, cls) {
    var inner = icon(o.icon) + "<span>" + esc(o.label) + "</span>";
    var c = "btn " + (o.primary ? "btn--primary " : "") + (cls || "");
    return o.href
      ? '<a class="' + c + '" href="' + esc(o.href) + '"' + (o.ext ? ' target="_blank" rel="noopener"' : "") + ">" + inner + "</a>"
      : '<button type="button" class="' + c + '" data-act="' + o.act + '">' + inner + "</button>";
  }

  /* ---- toast + actions -------------------------------------------------------- */
  var toastEl = $("#toast"), toastT = 0;
  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg; toastEl.classList.add("is-on");
    clearTimeout(toastT); toastT = setTimeout(function () { toastEl.classList.remove("is-on"); }, 2600);
  }
  function copy(text, ok) {
    var done = function () { toast(ok); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { legacyCopy(text) ? done() : toast("Couldn't copy — " + text); });
    else legacyCopy(text) ? done() : toast(text);
  }
  function legacyCopy(text) {
    try {
      var t = doc.createElement("textarea"); t.value = text; t.setAttribute("readonly", ""); t.style.cssText = "position:fixed;top:-99px;opacity:0";
      doc.body.appendChild(t); t.select(); var ok = doc.execCommand("copy"); doc.body.removeChild(t); return ok;
    } catch (e) { return false; }
  }
  var qrLoading = null;
  function loadQr() {
    if (window.qrcode) return Promise.resolve();
    if (qrLoading) return qrLoading;
    qrLoading = new Promise(function (res, rej) {
      var s = doc.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js";
      s.onload = function () { res(); }; s.onerror = function () { qrLoading = null; rej(); };
      doc.head.appendChild(s);
    });
    return qrLoading;
  }
  function toggleQr(b) {
    var box = $("#qr"); if (!box) return;
    var open = !box.classList.contains("open");
    if (!open) { box.classList.remove("open"); b.setAttribute("aria-expanded", "false"); return; }
    loadQr().then(function () {
      var svg = window.GUNR_QR && GUNR_QR.svg ? GUNR_QR.svg(SITE, { ecc: "M", margin: 2, dark: "#111111", light: "#ffffff", label: "QR code for " + HOST }) : null;
      if (!svg) throw new Error("qr");
      $("#qr-svg").innerHTML = svg;
      box.classList.add("open"); b.setAttribute("aria-expanded", "true");
    }).catch(function () { toast("QR code unavailable offline — " + HOST); });
  }
  var ACT = {
    save: function () {
      if (window.GUNR_VCARD && GUNR_VCARD.download) { try { GUNR_VCARD.download(P); toast("Contact card downloaded"); return; } catch (e) { /* fall through */ } }
      toast("Couldn't build the contact card");
    },
    "copy-email": function () { copy(String(P.email).trim(), "Email copied"); },
    "copy-phone": function () { copy(String(P.phone).trim(), "Number copied"); },
    share: function () {
      var data = { title: NAME, text: NAME + (isSet(P.title) ? " — " + P.title : ""), url: SITE };
      if (navigator.share) navigator.share(data).catch(function () {});
      else copy(SITE, "Link copied");
    },
    qr: function (b) { toggleQr(b); },
    motion: function () {
      try { localStorage.setItem("gunr.motion", MOTION ? "reduced" : "full"); } catch (e) {}
      location.replace(location.pathname + location.hash);
    }
  };
  doc.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-act]");
    if (b && ACT[b.getAttribute("data-act")]) ACT[b.getAttribute("data-act")](b);
  });

  /* ---- render: hero ----------------------------------------------------------- */
  function contactActions() {
    var a = [];
    if (window.GUNR_VCARD) a.push({ act: "save", label: "Save contact", icon: "card", primary: true });
    if (isSet(P.email)) a.push({ href: "mailto:" + String(P.email).trim(), label: "Email", icon: "mail" });
    if (TEL) a.push({ href: TEL, label: "Call", icon: "phone" });
    var li = LINKS.filter(function (l) { return l.icon === "linkedin"; })[0] || LINKS[0];
    if (li) a.push({ href: li.url, label: li.label || "Link", icon: li.icon, ext: true });
    return a;
  }
  function renderHero() {
    var k = [P.title, P.company].filter(isSet).join(" · ");
    if (k) $("#hero-kicker").textContent = k;
    if (isSet(P.tagline)) $("#hero-tag").textContent = P.tagline;
    $("#hero-name").textContent = NAME;
    var acts = contactActions();
    $("#hero-actions").innerHTML = acts.map(function (a) { return btn(a); }).join("");
    $("#dock").innerHTML = acts.slice(0, 3).map(function (a) { return btn(a); }).join("");
  }

  /* ---- render: about ---------------------------------------------------------- */
  function words(text, emLast) {
    var w = String(text).split(/\s+/).filter(Boolean);
    return w.map(function (x, i) {
      var s = '<span class="w" style="--i:' + i + '">' + esc(x) + "</span>";
      return emLast && i === w.length - 1 ? "<em>" + s + "</em>" : s;
    }).join(" ") ;
  }
  function renderAbout() {
    var bio = arr(P.bio).filter(isSet), traits = arr(P.traits).filter(function (t) { return t && isSet(t.name); });
    var lead = isSet(P.tagline) ? String(P.tagline) : (bio[0] || "");
    var n = lead.split(/\s+/).filter(Boolean).length;
    var rows = [];
    if (isSet(P.title)) rows.push(["Role", esc(P.title)]);
    if (isSet(P.company)) rows.push(["Company", esc(P.company) + (isSet(P.companyNote) ? "<small>" + esc(P.companyNote) + "</small>" : "")]);
    if (isSet(P.location)) rows.push(["Based in", esc(P.location)]);
    var groups = arr(P.skills).map(function (g) { return g && g.group; }).filter(isSet);
    if (groups.length) rows.push(["Focus", esc(groups.join(" · "))]);
    if (isSet(P.handle)) rows.push(["Handle", esc(P.handle)]);
    var h = "";
    if (lead) h += '<p class="lead" data-scrub style="--n:' + n + '" aria-label="' + esc(lead) + '"><span aria-hidden="true">' + words(lead, true) + "</span></p>";
    h += '<div class="about-grid">';
    h += '<div class="about-text" data-reveal>' + bio.map(function (p) { return "<p>" + esc(p) + "</p>"; }).join("") + "</div>";
    h += '<aside class="spec" data-reveal style="--d:1" aria-label="Spec sheet"><div class="spec-head"><span class="label">Spec sheet</span><span class="label">rev. ' + new Date().getFullYear() + "</span></div>";
    h += "<dl>" + rows.map(function (r) { return "<div><dt>" + r[0] + "</dt><dd>" + r[1] + "</dd></div>"; }).join("") + "</dl>";
    if (traits.length) {
      h += '<div class="traits"><p class="label traits-h">Measured traits · 0–1</p>' + traits.map(function (t, i) {
        var v = clamp(Number(t.value) || 0, 0, 1);
        return '<div class="trait' + (v < 0.5 ? " is-low" : "") + '" style="--d:' + i + '"><span class="trait-name">' + esc(String(t.name).replace(/_/g, " ")) +
          '</span><span class="scale" role="img" aria-label="' + num(v, 2) + ' out of 1"><i style="--v:' + v + '"></i></span><span class="trait-val">' + num(v, 2) + "</span></div>";
      }).join("") + "</div>";
    }
    h += "</aside></div>";
    $("#about-body").innerHTML = h;
  }

  /* ---- render: experience ------------------------------------------------------ */
  var trail = null;
  function span(e) {
    var s = isSet(e.start) ? String(e.start) : "", en = isSet(e.end) ? String(e.end) : "";
    if (/^present$/i.test(en)) en = "Present";
    return s && en ? s + " — " + en : s ? "Since " + s : en === "Present" ? "Current" : en;
  }
  function renderWork() {
    var xp = arr(P.experience).filter(function (e) { return e && (isSet(e.org) || isSet(e.role)); });
    if (!xp.length) { $("#work").hidden = true; return; }
    var n = xp.length, W = 1000, Hh = 300;
    // elevation = 1 - loss; fall back to an even climb when a role has no loss value
    var pts = xp.map(function (e, i) {
      var el = typeof e.loss === "number" ? clamp(1 - e.loss, 0.05, 1) : (i + 1) / (n + 0.5);
      return { x: n === 1 ? W * 0.6 : 90 + i * (W - 200) / (n - 1), y: Hh - 26 - el * (Hh - 70), el: el };
    });
    var d = "M0," + (Hh - 14), px = 0, py = Hh - 14;
    pts.forEach(function (p) { var mx = (px + p.x) / 2; d += " C" + mx + "," + py + " " + mx + "," + p.y + " " + p.x + "," + p.y; px = p.x; py = p.y; });
    var ex = W, ey = py - 10, mx2 = (px + ex) / 2;
    d += " C" + mx2 + "," + py + " " + mx2 + "," + ey + " " + ex + "," + ey;
    var grid = [0.25, 0.5, 0.75, 1].map(function (g) { var y = Hh - 26 - g * (Hh - 70); return { y: y, g: g }; });

    var h = '<div class="trail" data-scrub data-trail><div class="trail-plot">';
    h += '<svg viewBox="0 0 ' + W + " " + Hh + '" preserveAspectRatio="none" aria-hidden="true"><defs><pattern id="hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="7" stroke="var(--line-2)" stroke-width="1"/></pattern></defs>';
    h += '<g class="trail-grid">' + grid.map(function (g) { return '<line x1="0" x2="' + W + '" y1="' + g.y + '" y2="' + g.y + '"/>'; }).join("") + "</g>";
    h += '<path class="trail-area" d="' + d + " L" + W + "," + Hh + " L0," + Hh + ' Z"/>';
    h += '<path class="trail-line" pathLength="1" d="' + d + '"/></svg>';
    h += grid.map(function (g) { return '<span class="trail-y" style="top:' + (g.y / Hh * 100) + '%">' + num(g.g, 2) + "</span>"; }).join("");
    h += pts.map(function (p, i) { return '<span class="way" data-way="' + i + '" style="left:' + (p.x / W * 100) + "%;top:" + (p.y / Hh * 100) + '%">' + (i < 9 ? "0" : "") + (i + 1) + "</span>"; }).join("");
    h += '<span class="hiker" aria-hidden="true"></span></div>';
    h += '<div class="trail-cap"><span class="label">elevation = 1 − loss</span><span class="label">' + n + " waypoint" + (n === 1 ? "" : "s") + "</span></div></div>";

    h += '<ol class="camps" style="--cols:' + Math.min(n, 3) + '">' + xp.map(function (e, i) {
      var hl = arr(e.highlights).filter(isSet), sp = span(e);
      return '<li class="camp" data-camp="' + i + '"><div class="camp-top"><span class="label">Waypoint ' + (i < 9 ? "0" : "") + (i + 1) + '</span><span class="label">' + esc(sp) + "</span></div>" +
        (isSet(e.org) ? '<h3 class="camp-org">' + esc(e.org) + "</h3>" : "") +
        (isSet(e.role) ? '<p class="camp-role">' + esc(e.role) + "</p>" : "") +
        (isSet(e.summary) ? '<p class="camp-sum">' + esc(e.summary) + "</p>" : "") +
        (hl.length ? "<ul>" + hl.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>" : "") +
        (e.event === "fine-tune" ? '<span class="camp-tag">fine-tune · same team, new name</span>' : "") + "</li>";
    }).join("") + "</ol>";
    $("#work-body").innerHTML = h;

    var path = $(".trail-line"), len = path.getTotalLength();
    // how far along the path each waypoint sits (0..1), found by walking the curve
    var at = pts.map(function () { return 1; }), k = 0;
    for (var s = 0; s <= 400 && k < n; s++) { var q = path.getPointAtLength(len * s / 400); if (q.x >= pts[k].x - 0.5) { at[k] = s / 400; k++; } }
    trail = { el: $("[data-trail]"), path: path, len: len, at: at, ways: $$(".way"), camps: $$(".camp"), hiker: $(".hiker"), W: W, H: Hh, p: -1 };
  }
  function updateTrail(p) {
    if (!trail || Math.abs(p - trail.p) < 0.002) return;
    trail.p = p;
    var q = trail.path.getPointAtLength(trail.len * p);
    trail.hiker.style.left = (q.x / trail.W * 100) + "%"; trail.hiker.style.top = (q.y / trail.H * 100) + "%";
    trail.at.forEach(function (a, i) {
      var on = p >= a - 0.01;
      trail.ways[i].classList.toggle("on", on); trail.camps[i].classList.toggle("on", on);
    });
  }

  /* ---- render: skills + research ----------------------------------------------- */
  function ridge(level) {
    var W = 200, Hh = 28, c = clamp(level, 0.06, 0.94) * W, A = 5 + 17 * level, sg = 10, d = "";
    for (var x = 0; x <= W; x += 4) { var y = Hh - 3 - A * Math.exp(-(x - c) * (x - c) / (2 * sg * sg)); d += (x ? " L" : "M") + x + "," + y.toFixed(2); }
    return '<svg class="ridge" viewBox="0 0 ' + W + " " + Hh + '" preserveAspectRatio="none" aria-hidden="true"><line x1="50" x2="50" y1="4" y2="' + Hh + '"/><line x1="100" x2="100" y1="4" y2="' + Hh + '"/><line x1="150" x2="150" y1="4" y2="' + Hh + '"/><path pathLength="1" d="' + d + '"/></svg>';
  }
  function renderSkills() {
    var groups = arr(P.skills).map(function (g) {
      return { name: g && g.group, items: arr(g && g.items).filter(function (s) { return s && isSet(s.name); }) };
    }).filter(function (g) { return isSet(g.name) && g.items.length; });
    if (!groups.length) { $("#skills-body").innerHTML = ""; return; }
    var id = 0;
    $("#skills-body").innerHTML = '<div class="ranges">' + groups.map(function (g, gi) {
      var mean = g.items.reduce(function (a, s) { return a + clamp(Number(s.level) || 0, 0, 1); }, 0) / g.items.length;
      return '<section class="range" data-reveal style="--d:' + (gi % 2) + '"><header class="range-head"><h3 class="range-name">' + esc(g.name) + '</h3><span class="label">' +
        g.items.length + " peaks · mean " + num(mean, 2) + '</span></header><ul>' + g.items.map(function (s, i) {
          var lv = clamp(Number(s.level) || 0, 0, 1), nid = "sk-" + (id++), has = isSet(s.note);
          return '<li class="skill" style="--d:' + i + '"><button type="button" class="skill-btn"' + (has ? ' aria-expanded="false" aria-controls="' + nid + '"' : "") + ">" +
            '<span class="skill-name">' + esc(s.name) + "</span>" + ridge(lv) + '<span class="skill-val">' + num(lv, 2) + "</span></button>" +
            (has ? '<div class="skill-note" id="' + nid + '"><p>' + esc(s.note) + "</p></div>" : "") + "</li>";
        }).join("") + "</ul></section>";
    }).join("") + "</div>";
    $("#skills-body").addEventListener("click", function (e) {
      var b = e.target.closest(".skill-btn"); if (!b || !b.hasAttribute("aria-expanded")) return;
      var li = b.parentNode, open = !li.classList.contains("open");
      $$(".skill.open", b.closest(".range")).forEach(function (o) { o.classList.remove("open"); $(".skill-btn", o).setAttribute("aria-expanded", "false"); });
      li.classList.toggle("open", open); b.setAttribute("aria-expanded", String(open));
    });
  }
  function renderResearch() {
    var rs = arr(P.research).filter(Boolean);
    if (!rs.length) { $("#research").hidden = true; return; }
    $("#research-body").innerHTML = '<div class="notes">' + rs.map(function (r, i) {
      var live = isSet(r.title), tags = arr(r.tags).filter(isSet);
      return '<article class="note ' + (live ? "is-live" : "is-soon") + '" data-reveal style="--d:' + i + '"><span class="label">Note ' + (i < 9 ? "0" : "") + (i + 1) +
        (isSet(r.year) ? " · " + esc(r.year) : "") + "</span>" +
        '<h3 class="note-title">' + (live ? esc(r.title) : "Write-up in progress") + "</h3>" +
        (isSet(r.summary) ? '<p class="note-sum">' + esc(r.summary) + "</p>" : "") +
        (isSet(r.link) ? '<p><a href="' + esc(r.link) + '" target="_blank" rel="noopener">Read it ↗</a></p>' : "") +
        (tags.length ? '<ul class="tags">' + tags.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul>" : "") + "</article>";
    }).join("") + "</div>";
  }

  /* ---- render: contact + footer ------------------------------------------------ */
  function renderContact() {
    var rows = [];
    if (isSet(P.email)) rows.push('<li class="row"><span class="label row-k">Email</span><a class="row-v" href="mailto:' + esc(String(P.email).trim()) + '">' + esc(String(P.email).trim()) + '</a><button type="button" class="chip" data-act="copy-email">Copy</button></li>');
    if (TEL) rows.push('<li class="row"><span class="label row-k">Phone</span><a class="row-v" href="' + esc(TEL) + '">' + esc(P.phone) + '</a><button type="button" class="chip" data-act="copy-phone">Copy</button></li>');
    LINKS.forEach(function (l) {
      rows.push('<li class="row"><span class="label row-k">' + esc(l.label || "Link") + '</span><a class="row-v" href="' + esc(l.url) + '" target="_blank" rel="noopener">' +
        esc(String(l.url).replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")) + '</a><span class="chip" aria-hidden="true">↗</span></li>');
    });
    if (isSet(P.location)) rows.push('<li class="row"><span class="label row-k">Based in</span><span class="row-v">' + esc(P.location) + "</span><span></span></li>");
    var h = '<div class="contact-grid"><div data-reveal>' +
      (isSet(P.availability) ? '<p class="avail">' + esc(P.availability) + ".</p>" : "") +
      '<ul class="rows">' + rows.join("") + "</ul></div>" +
      '<div class="contact-side" data-reveal style="--d:1">' +
      (window.GUNR_VCARD ? btn({ act: "save", label: "Save contact", icon: "card", primary: true }, "btn--lg") : "") +
      btn({ act: "share", label: "Share this page", icon: "share" }, "btn--lg") +
      '<button type="button" class="btn btn--lg" data-act="qr" aria-expanded="false" aria-controls="qr">' + icon("qr") + "<span>Show QR code</span></button>" +
      '<div class="qr" id="qr"><div><div class="qr-box"><div id="qr-svg"></div><p>' + esc(HOST) + "</p></div></div></div>" +
      btn({ href: "card.html", label: "Print networking cards", icon: "print" }, "btn--lg") +
      "</div></div>";
    $("#contact-body").innerHTML = h;

    $("#foot").innerHTML = '<p class="foot-big" aria-hidden="true">' + esc(isSet(P.handle) ? P.handle : NAME) + "</p>" +
      '<div class="foot-row"><span>© ' + new Date().getFullYear() + " " + esc(NAME) + ' · This page was learned on your device by a <span id="foot-params">small</span> neural network. Nothing left your browser.</span>' +
      '<span class="foot-links"><button type="button" class="link-btn" data-act="motion">Motion: ' + (MOTION ? "on" : "reduced") + '</button><a href="v3/">Terminal edition</a><a href="v2/">Forward Pass edition</a></span></div>';
  }

  /* ---- field -------------------------------------------------------------------- */
  var THEMES = {
    ink: { bg: "#0c0c0e", line: "#efebe3", fill: "#efebe3", accent: "#ff5a1f", lineA: 0.16, indexA: 0.34, relief: 0.02, glow: 0.07, grain: 0.03, vig: 0.3, engrave: 0.75 },
    paper: { bg: "#f1ede4", line: "#15151a", fill: "#131316", accent: "#ff5a1f", lineA: 0.2, indexA: 0.42, relief: 0.03, glow: 0.07, grain: 0.025, vig: 0.08, engrave: 0.8 }
  };
  function fieldTheme() {
    var t = THEMES[root.dataset.theme] || THEMES.ink, o = {}, k;
    for (k in t) o[k] = t[k];
    if (small()) { o.engrave = 0; o.lineA *= 0.8; o.indexA *= 0.72; }   // phones: solid letters, quieter lines
    return o;
  }
  function small() { return COARSE || Math.min(window.innerWidth, window.innerHeight) < 600; }
  var field = null, wins = [], activeWin = null, custom = null, pendT = 0;
  var hud = { state: $("#hud-state"), step: $("#hud-step"), loss: $("#hud-loss"), sps: $("#hud-sps"), params: $("#hud-params"), box: $("#hud"), spark: $("#hud-spark") };
  var hist = [], lastState = "", liveEls = [];

  function heroLines() {
    if (custom) return custom;
    var a = [first, last].filter(Boolean).map(function (s) { return s.toUpperCase(); });
    return a.length ? a : [NAME.toUpperCase()];
  }
  function targetFor(w) {
    var portrait = window.innerWidth / window.innerHeight < 0.8;
    if (!w || w.getAttribute("data-field") === "hero") {
      // The name fills the free band between the kicker line and the hero footer.
      var H = Math.max(1, $("#field").clientHeight), k = $("#hero-kicker"), f = $(".hero-foot");
      var a = k.offsetTop + k.offsetHeight + H * 0.035, b = f.offsetTop - H * 0.045;
      if (!(b - a > H * 0.18)) { a = H * 0.16; b = H * 0.58; }
      return { lines: heroLines(), lay: { cy: (a + b) / 2 / H, fitW: portrait ? 0.88 : 0.8, fitH: (b - a) / H, maxCap: portrait ? 0.3 : 0.46, gap: 0.18 } };
    }
    return { lines: [w.getAttribute("data-field")], lay: portrait ? { cy: 0.46, fitW: 0.82, maxCap: 0.3 } : { cy: 0.47, fitW: 0.62, maxCap: 0.46 } };
  }
  function applyTarget() {
    if (!field) return;
    var t = targetFor(activeWin);
    field.setText(t.lines, t.lay);
  }
  function drawSpark() {
    var c = hud.spark; if (!c || !c.getContext || !hist.length) return;
    var g = c.getContext("2d"), W = c.width, Hh = c.height, i;
    g.clearRect(0, 0, W, Hh);
    var cs = getComputedStyle(root), lo = -4.6, hi = -0.6;
    g.strokeStyle = cs.getPropertyValue("--line-2").trim() || "#888"; g.lineWidth = 1; g.setLineDash([3, 5]);
    g.beginPath(); g.moveTo(0, Hh - 1); g.lineTo(W, Hh - 1); g.stroke(); g.setLineDash([]);
    g.strokeStyle = cs.getPropertyValue("--accent").trim() || "#ff5a1f"; g.lineWidth = 2.5; g.lineJoin = "round"; g.beginPath();
    for (i = 0; i < hist.length; i++) {
      var x = hist.length > 1 ? i / (hist.length - 1) * (W - 4) + 2 : 2;
      var y = Hh - 4 - clamp((Math.log(hist[i]) / Math.LN10 - lo) / (hi - lo), 0, 1) * (Hh - 8);
      if (i) g.lineTo(x, y); else g.moveTo(x, y);
    }
    g.stroke();
  }
  function onStats(s) {
    var training = s.state === "training";
    if (s.state !== lastState) {
      lastState = s.state;
      hud.box.classList.toggle("is-training", training); hud.box.classList.toggle("is-idle", !training);
      hud.state.textContent = training ? "Training" : "Converged";
    }
    hud.step.textContent = s.step.toLocaleString("en-US");
    hud.loss.textContent = s.loss < 0.0001 ? s.loss.toExponential(1) : s.loss.toFixed(4);
    if (s.sps) hud.sps.textContent = Math.round(s.sps) + " it/s";
    hist.push(Math.max(1e-6, s.loss)); if (hist.length > 140) hist.shift();
    drawSpark();
    var txt = "loss " + (s.loss < 0.0001 ? s.loss.toExponential(1) : s.loss.toFixed(4));
    for (var i = 0; i < liveEls.length; i++) liveEls[i].textContent = txt;
  }
  function startField() {
    var canvas = $("#field");
    field = window.GUNR_FIELD ? GUNR_FIELD.create(canvas, {
      motion: MOTION, coarse: small(), onStats: onStats,
      onReady: function (m) {
        hud.params.textContent = m.params.toLocaleString("en-US");
        var fp = $("#foot-params"); if (fp) fp.textContent = m.params.toLocaleString("en-US") + "-weight";
      }
    }) : null;
    if (!field) { root.classList.add("no-field"); return; }
    root.classList.add("has-field");
    field.setTheme(fieldTheme(), true);
    activeWin = wins[0] || null;
    applyTarget();
    update();
  }

  /* ---- hero controls ------------------------------------------------------------- */
  function bindHud() {
    var pb = $("#perturb-btn"), form = $("#teach"), input = $("#teach-in"), reset = $("#teach-reset");
    if (pb) pb.addEventListener("click", function () { if (field) field.perturb(1.3); });
    if (form) form.addEventListener("submit", function (e) {
      e.preventDefault();
      var w = String(input.value || "").toUpperCase().replace(/[^A-Z0-9 &!?.'\-]/g, "").replace(/\s+/g, " ").trim().slice(0, 12);
      if (!w) { input.focus(); return; }
      var parts = w.split(" ");
      custom = parts.length > 2 ? [parts[0], parts.slice(1).join(" ")] : parts;
      reset.hidden = false; input.blur();
      activeWin = wins[0]; applyTarget();
      toast("Learning “" + w + "” …");
      if (window.scrollY > 40) scrollToEl(doc.body, 0);
    });
    if (reset) reset.addEventListener("click", function () { custom = null; reset.hidden = true; input.value = ""; applyTarget(); });
    var coord = $("#hero-coord"), cq = 0;
    if (coord && !COARSE) window.addEventListener("pointermove", function (e) {
      if (cq || !field) return;
      cq = requestAnimationFrame(function () {
        cq = 0;
        var u = e.clientX / window.innerWidth, v = e.clientY / window.innerHeight, hgt = field.heightAt(u, v);
        coord.textContent = "x " + u.toFixed(3) + "  y " + v.toFixed(3) + (hgt == null ? "" : "  elev " + hgt.toFixed(3));
      });
    }, { passive: true });
  }

  /* ---- theme ---------------------------------------------------------------------- */
  function setTheme(t, ev) {
    var apply = function () {
      root.dataset.theme = t;
      try { localStorage.setItem("gunr.theme", t); } catch (e) {}
      var m = $('meta[name="theme-color"]'); if (m) m.setAttribute("content", THEMES[t].bg);
      if (field) field.setTheme(fieldTheme(), !!doc.startViewTransition);
      drawSpark();
    };
    if (doc.startViewTransition && MOTION) {
      var r = ev && ev.currentTarget ? ev.currentTarget.getBoundingClientRect() : null;
      root.style.setProperty("--vx", (r ? r.left + r.width / 2 : window.innerWidth - 60) + "px");
      root.style.setProperty("--vy", (r ? r.top + r.height / 2 : 30) + "px");
      doc.startViewTransition(apply);
    } else apply();
  }

  /* ---- scroll engine -------------------------------------------------------------- */
  var lenis = null, ticking = false, scrubs = [], navLinks = [], secs = [], topbar = $("#topbar"), dock = $("#dock"), hero = $("#hero");
  function scrollToEl(el, offset) {
    var y = el === doc.body ? 0 : el.getBoundingClientRect().top + window.scrollY - (offset == null ? 0 : offset);
    if (lenis) lenis.scrollTo(y, { duration: 1.2 });
    else window.scrollTo({ top: y, behavior: MOTION ? "smooth" : "auto" });
  }
  function update() {
    ticking = false;
    var vh = window.innerHeight, y = window.scrollY, i, r;
    topbar.classList.toggle("is-stuck", y > vh * 0.6);
    var hr = hero.getBoundingClientRect();
    dock.classList.toggle("is-on", hr.bottom < vh * 0.35);

    for (i = 0; i < scrubs.length; i++) {
      r = scrubs[i].getBoundingClientRect();
      if (r.bottom < -vh || r.top > vh * 2) continue;
      var p = clamp((vh * 0.88 - r.top) / (r.height + vh * 0.38), 0, 1);
      scrubs[i].style.setProperty("--p", p.toFixed(4));
      if (trail && scrubs[i] === trail.el) updateTrail(MOTION ? p : 1);
    }

    // which window is on stage, and is any of the field visible at all?
    var best = null, bestA = 0, any = false, bp = 0;
    for (i = 0; i < wins.length; i++) {
      r = wins[i].getBoundingClientRect();
      var vis = Math.min(r.bottom, vh) - Math.max(r.top, 0);
      if (vis > 0) { any = true; if (vis > bestA) { bestA = vis; best = wins[i]; bp = clamp((vh - r.top) / (vh + r.height), 0, 1); } }
    }
    if (field) {
      field.setVisible(any);
      if (best && best !== activeWin && bestA > vh * 0.3) {
        activeWin = best;
        clearTimeout(pendT); pendT = setTimeout(applyTarget, 90);
      }
      if (best && MOTION) {
        if (best === hero) field.setCamera(1 + 0.32 * clamp(y / Math.max(1, hr.height), 0, 1), 0.43);
        else field.setCamera(0.9 + 0.22 * bp, 0.5);
      }
    }
    // nav highlight
    var cur = "";
    for (i = 0; i < secs.length; i++) { if (secs[i].getBoundingClientRect().top < vh * 0.5) cur = secs[i].id; }
    for (i = 0; i < navLinks.length; i++) navLinks[i].classList.toggle("is-on", navLinks[i].getAttribute("href") === "#" + cur);
  }
  function onScroll() { if (!ticking) { ticking = true; requestAnimationFrame(update); } }

  /* ---- boot ------------------------------------------------------------------------ */
  function boot() {
    renderHero(); renderAbout(); renderWork(); renderSkills(); renderResearch(); renderContact();
    doc.title = NAME + (isSet(P.title) ? " — " + P.title : "");

    wins = $$("[data-field]"); scrubs = $$("[data-scrub]"); liveEls = $$(".live-loss");
    navLinks = $$(".top-nav a"); secs = $$("main section[id]").filter(function (s) { return s.id !== "hero"; });

    // reveals
    var rev = $$("[data-reveal]");
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (es) {
        es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
      }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
      rev.forEach(function (el) { io.observe(el); });
    } else rev.forEach(function (el) { el.classList.add("in"); });

    // smooth wheel scrolling on desktops (touch keeps native momentum)
    if (MOTION && !COARSE && window.Lenis) {
      try {
        lenis = new window.Lenis({ lerp: 0.11, wheelMultiplier: 1 });
        root.classList.add("lenis");
        lenis.on("scroll", onScroll);
        var raf = function (t) { lenis.raf(t); requestAnimationFrame(raf); };
        requestAnimationFrame(raf);
      } catch (e) { lenis = null; }
    }
    doc.addEventListener("click", function (e) {
      var a = e.target.closest && e.target.closest('a[href^="#"]');
      if (!a) return;
      var id = a.getAttribute("href").slice(1), el = id === "top" ? doc.body : doc.getElementById(id);
      if (!el) return;
      e.preventDefault();
      scrollToEl(el, el === doc.body ? 0 : topbar.offsetHeight - 1);
      if (el !== doc.body) { el.setAttribute("tabindex", "-1"); el.focus({ preventScroll: true }); }
      if (history.replaceState) history.replaceState(null, "", id === "top" ? location.pathname + location.search : "#" + id);
    });
    window.addEventListener("scroll", onScroll, { passive: true });
    // Phones fire resize whenever the URL bar slides; only a width change re-lays the words.
    var lastW = window.innerWidth;
    window.addEventListener("resize", function () {
      onScroll();
      if (window.innerWidth === lastW) return;
      lastW = window.innerWidth;
      clearTimeout(pendT); pendT = setTimeout(applyTarget, 300);
    });

    $("#theme-btn").addEventListener("click", function (e) { setTheme(root.dataset.theme === "paper" ? "ink" : "paper", e); });
    bindHud();

    // Start the field once the display face is ready (the glyphs are drawn with it).
    var started = false, go = function () { if (started) return; started = true; startField(); root.classList.add("is-in"); hero.classList.add("is-in"); };
    if (doc.fonts && doc.fonts.load) { doc.fonts.load('400 64px "Anton"').then(go, go); setTimeout(go, 1800); } else go();

    window.GUNR_SITE_READY = true;
    update();
  }
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", boot); else boot();
})();
