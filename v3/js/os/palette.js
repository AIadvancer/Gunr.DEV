/* =============================================================================
 * GUNR//OS — palette.js  (rofi-style command palette)
 * -----------------------------------------------------------------------------
 * Ctrl+K / Cmd+K, any [data-palette] element, or GOS.palette.open(). Fuzzy
 * search over the command registry (name, aliases, summary, group) with
 * highlighted matches, grouped results, a sliding highlight, recents first when
 * empty, and "run this line" / "ask gunr-gpt" fallbacks. ARIA combobox +
 * listbox inside a modal dialog with a focus trap. Exposes GOS.palette.
 * ========================================================================== */
(function () {
  "use strict";

  var GOS = window.GOS;
  if (!GOS || GOS.palette) return;

  var doc = document;
  var FULL = !!(GOS.motion && GOS.motion.full);
  var TOUCH = !!(GOS.device && GOS.device.touch);
  var esc = GOS.util.esc;
  var GROUPS = [["start", "Get started"], ["profile", "Profile"], ["system", "System"], ["fun", "Fun"]];

  var root, backdrop, dialog, input, scrollEl, list, hl, countEl, escBtn;
  var built = false, opened = false, lastFocus = null, flat = [], active = 0;

  function small() { return GOS.device && GOS.device.small ? GOS.device.small() : window.innerWidth <= 760; }

  /* ---- animation (gsap or WAAPI) -------------------------------------------------- */
  var EASE = { "expo.out": "cubic-bezier(.16,1,.3,1)", "power2.out": "cubic-bezier(.33,1,.68,1)", "power2.in": "cubic-bezier(.32,0,.67,0)", "back.out": "cubic-bezier(.34,1.56,.64,1)" };
  function cssEase(e) { e = String(e || "expo.out"); return EASE[e] || EASE[e.replace(/\(.*\)$/, "")] || EASE["expo.out"]; }
  function tf(v) {
    var s = v.scale != null ? v.scale : 1;
    return "translate(" + (v.x || 0) + "px," + (v.y || 0) + "px) scale(" + s + ")";
  }
  function tween(el, from, to, o) {
    o = o || {};
    if (!el) { if (o.onComplete) o.onComplete(); return; }
    var dur = o.duration == null ? 0.4 : o.duration;
    if (window.gsap) {
      var v = {}, k;
      for (k in to) v[k] = to[k];
      v.duration = dur; v.delay = o.delay || 0; v.ease = o.ease || "expo.out"; v.overwrite = "auto";
      v.clearProps = "transform,opacity";
      if (o.onComplete) v.onComplete = o.onComplete;
      window.gsap.fromTo(el, from, v);
      return;
    }
    if (el.animate) {
      var a = {}, b = {};
      if ("x" in from || "y" in from || "scale" in from) { a.transform = tf(from); b.transform = tf(to); }
      if ("opacity" in from) { a.opacity = from.opacity; b.opacity = to.opacity == null ? 1 : to.opacity; }
      if (from.transformOrigin) el.style.transformOrigin = from.transformOrigin;
      var an = el.animate([a, b], { duration: dur * 1000, delay: (o.delay || 0) * 1000, easing: cssEase(o.ease), fill: "both" });
      an.onfinish = function () { if (o.onComplete) o.onComplete(); an.cancel(); };
      return;
    }
    if (o.onComplete) o.onComplete();
  }

  var BASE_CSS = [
    ":where(.palette){position:fixed;inset:0;z-index:1000}",
    ":where(.palette[hidden]){display:none}",
    ":where(.palette-backdrop){position:absolute;inset:0}",
    ":where(.palette-dialog){position:relative;display:flex;flex-direction:column}",
    ":where(.palette-scroll){position:relative;overflow-y:auto;overscroll-behavior:contain}",
    ":where(.palette-hl){position:absolute;left:0;right:0;top:0;height:0;pointer-events:none;opacity:0;z-index:0}",
    ":where(.motion-full .palette-hl){transition:transform .28s cubic-bezier(.16,1,.3,1),height .28s cubic-bezier(.16,1,.3,1),opacity .2s}",
    ":where(.palette-list){position:static}",
    ":where(.palette-item){position:relative;z-index:1;cursor:pointer}"
  ].join("\n");

  /* ---- build ------------------------------------------------------------------------ */
  function build() {
    if (built) return;
    built = true;
    if (!doc.getElementById("gos-palette-base")) {
      var st = doc.createElement("style");
      st.id = "gos-palette-base";
      st.textContent = BASE_CSS;
      doc.head.insertBefore(st, doc.head.firstChild);
    }
    root = doc.getElementById("palette");
    if (!root) {
      root = doc.createElement("div");
      root.id = "palette";
      root.className = "palette";
      root.hidden = true;
      doc.body.appendChild(root);
    }
    root.innerHTML =
      '<div class="palette-backdrop" data-palette-close></div>' +
      '<div class="palette-dialog" role="dialog" aria-modal="true" aria-label="Command palette">' +
        '<div class="palette-search">' +
          '<span class="palette-glyph" aria-hidden="true">⌘</span>' +
          '<input class="palette-input" type="text" role="combobox" aria-expanded="true" aria-controls="palette-list" aria-autocomplete="list" aria-haspopup="listbox" aria-label="Search commands" placeholder="Search commands or ask a question…" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="go">' +
          '<button type="button" class="palette-esc" data-palette-close aria-label="Close palette"><kbd>esc</kbd></button>' +
        "</div>" +
        '<div class="palette-scroll">' +
          '<span class="palette-hl" aria-hidden="true"></span>' +
          '<div class="palette-list" id="palette-list" role="listbox" aria-label="Commands"></div>' +
        "</div>" +
        '<div class="palette-foot" aria-hidden="true">' +
          "<span><kbd>↑</kbd><kbd>↓</kbd> navigate</span><span><kbd>↵</kbd> run</span><span><kbd>esc</kbd> close</span>" +
          '<span class="palette-count"></span>' +
        "</div>" +
      "</div>";
    backdrop = root.querySelector(".palette-backdrop");
    dialog = root.querySelector(".palette-dialog");
    input = root.querySelector(".palette-input");
    scrollEl = root.querySelector(".palette-scroll");
    list = root.querySelector(".palette-list");
    hl = root.querySelector(".palette-hl");
    countEl = root.querySelector(".palette-count");
    escBtn = root.querySelector(".palette-esc");

    input.addEventListener("input", function () { render(false); });
    input.addEventListener("keydown", onKey);
    // Focus trap: only the search field and the close button are tabbable.
    dialog.addEventListener("keydown", function (e) {
      if (e.key !== "Tab") return;
      e.preventDefault();
      (doc.activeElement === input ? escBtn : input).focus();
    });
    list.addEventListener("mousedown", function (e) { e.preventDefault(); }); // keep focus in the field
    list.addEventListener("pointermove", function (e) {
      var it = e.target.closest(".palette-item");
      if (it) { var i = +it.getAttribute("data-i"); if (i !== active) setActive(i, true); }
    });
    list.addEventListener("click", function (e) {
      var it = e.target.closest(".palette-item");
      if (it) choose(+it.getAttribute("data-i"));
    });
  }

  /* ---- matching -------------------------------------------------------------------------- */
  function boundary(t, i) { return i === 0 || /[\s\-_./]/.test(t.charAt(i - 1)); }
  // Contiguous substring beats scattered subsequence; prefixes and word starts score extra.
  function fuzzy(q, s) {
    s = String(s || "");
    var t = s.toLowerCase(), i;
    if (!q || !t) return null;
    var at = t.indexOf(q);
    if (at >= 0) {
      var idx = [];
      for (i = 0; i < q.length; i++) idx.push(at + i);
      return { score: 100 + (at === 0 ? 60 : 0) + (boundary(t, at) ? 20 : 0) - at - (t.length - q.length) * 0.8, idx: idx };
    }
    var j = 0, prev = -2, sc = 0, ix = [];
    for (i = 0; i < t.length && j < q.length; i++) {
      if (t.charAt(i) === q.charAt(j)) {
        ix.push(i);
        sc += (i === prev + 1 ? 9 : 2) + (boundary(t, i) ? 7 : 0);
        prev = i;
        j++;
      }
    }
    if (j < q.length) return null;
    return { score: sc - (ix[ix.length - 1] - ix[0]) * 0.6 - ix[0], idx: ix };
  }
  function cmdItem(c) {
    return { kind: "cmd", line: c.name, spec: c, name: c.name, summary: c.summary || "", icon: c.icon || "❯", group: c.group || "system" };
  }
  function match(q, c) {
    var best = null, n = fuzzy(q, c.name);
    if (n) best = { score: n.score + 40, nameIdx: n.idx };
    (c.aliases || []).forEach(function (a) {
      var m = fuzzy(q, a);
      if (m && (!best || m.score + 25 > best.score)) best = { score: m.score + 25, alias: a, aliasIdx: m.idx };
    });
    var s = String(c.summary || "").toLowerCase(), si = q.length >= 2 ? s.indexOf(q) : -1;
    if (si >= 0) {
      var ss = 30 - Math.min(si, 20) * 0.5 + (boundary(s, si) ? 8 : 0);
      if (!best || ss > best.score) best = { score: ss, sumIdx: [si, si + q.length] };
    }
    if (!best && c.group && String(c.group).indexOf(q) === 0) best = { score: 8 };
    if (!best) return null;
    // Hidden (easter-egg) commands only surface on a real prefix match.
    if (c.hidden) {
      var pre = c.name.indexOf(q) === 0 || (c.aliases || []).some(function (a) { return a.indexOf(q) === 0; });
      if (!pre || q.length < 2) return null;
    }
    var it = cmdItem(c);
    it.score = best.score;
    it.nameIdx = best.nameIdx;
    it.alias = best.alias;
    it.aliasIdx = best.aliasIdx;
    it.sumIdx = best.sumIdx;
    return it;
  }
  function history() {
    if (GOS.term && GOS.term.history) return GOS.term.history();
    try { var a = JSON.parse(GOS.store.get("gos.history") || "[]"); return Array.isArray(a) ? a : []; } catch (e) { return []; }
  }
  function recent() {
    var h = history(), out = [], seen = {};
    for (var i = h.length - 1; i >= 0 && out.length < 4; i--) {
      var line = String(h[i] || "").trim(), spec = GOS.commands.get(line.split(/\s+/)[0]);
      if (!line || !spec || seen[line]) continue;
      seen[line] = 1;
      out.push({ kind: "recent", line: line, spec: spec, name: line, summary: spec.summary || "", icon: spec.icon || "↺", group: "recent" });
    }
    return out;
  }
  function groupLabel(g) {
    for (var i = 0; i < GROUPS.length; i++) if (GROUPS[i][0] === g) return GROUPS[i][1];
    return g ? g.charAt(0).toUpperCase() + g.slice(1) : "More";
  }
  function compute(q) {
    var cmds = GOS.commands.list(), groups = [];
    if (!q) {
      var rec = recent(), inRecent = {};
      if (rec.length) groups.push({ label: "Recent", items: rec });
      // A bare command already listed under Recent isn't repeated in its own group.
      rec.forEach(function (r) { if (!/\s/.test(r.line)) inRecent[r.spec.name] = 1; });
      cmds = cmds.filter(function (c) { return !inRecent[c.name]; });
      var known = {};
      GROUPS.forEach(function (g) {
        known[g[0]] = 1;
        var its = cmds.filter(function (c) { return (c.group || "system") === g[0]; }).map(cmdItem);
        if (its.length) groups.push({ label: g[1], items: its });
      });
      var other = cmds.filter(function (c) { return !known[c.group || "system"]; }).map(cmdItem);
      if (other.length) groups.push({ label: "More", items: other });
      return groups;
    }
    var ql = q.toLowerCase(), scored = [];
    GOS.commands.list({ all: true }).forEach(function (c) { var m = match(ql, c); if (m) scored.push(m); });
    scored.sort(function (a, b) { return b.score - a.score; });
    var byG = {}, gOrder = [];
    scored.forEach(function (it) {
      if (!byG[it.group]) { byG[it.group] = []; gOrder.push(it.group); }
      byG[it.group].push(it);
    });
    gOrder.forEach(function (g) { groups.push({ label: groupLabel(g), items: byG[g] }); });

    var actions = [];
    if (GOS.commands.get("ask") && q.length > 1) {
      actions.push({ kind: "ask", line: "ask " + q, name: "Ask gunr-gpt", summary: "“" + q + "”", icon: "✦" });
    }
    actions.push({ kind: "run", line: q, name: "Run in terminal", summary: q, icon: "❯" });
    var first = GOS.commands.get(q.split(/\s+/)[0]);
    var question = /\s/.test(q) || /\?$/.test(q);
    // "theme nord" -> run it; "what does he do?" -> ask; otherwise fallbacks go last.
    if (first && /\s/.test(q)) actions.reverse();
    if (question || !scored.length) groups.unshift({ label: "Actions", items: actions });
    else groups.push({ label: "Actions", items: actions });
    return groups;
  }

  /* ---- render ---------------------------------------------------------------------------- */
  function mark(text, idx) {
    if (!idx || !idx.length) return esc(text);
    var set = {}, out = "", i;
    idx.forEach(function (k) { set[k] = 1; });
    for (i = 0; i < text.length; i++) {
      var ch = esc(text.charAt(i));
      out += set[i] ? "<mark>" + ch + "</mark>" : ch;
    }
    return out.replace(/<\/mark><mark>/g, "");
  }
  function iconHTML(icon) {
    icon = icon == null ? "" : String(icon);
    return /^\s*</.test(icon) ? icon : esc(icon);
  }
  function itemHTML(it, i) {
    var name = it.kind === "cmd" ? mark(it.name, it.nameIdx) : esc(it.name);
    var sum = it.sumIdx
      ? esc(it.summary.slice(0, it.sumIdx[0])) + "<mark>" + esc(it.summary.slice(it.sumIdx[0], it.sumIdx[1])) + "</mark>" + esc(it.summary.slice(it.sumIdx[1]))
      : esc(it.summary);
    return '<div class="palette-item palette-item--' + it.kind + '" role="option" id="pal-opt-' + i + '" aria-selected="false" data-i="' + i + '">' +
      '<span class="palette-item-icon" aria-hidden="true">' + iconHTML(it.icon) + "</span>" +
      '<span class="palette-item-main">' +
        '<span class="palette-item-name">' + name + "</span>" +
        (it.alias ? '<span class="palette-item-alias">' + mark(it.alias, it.aliasIdx) + "</span>" : "") +
        (it.summary ? '<span class="palette-item-summary">' + sum + "</span>" : "") +
      "</span>" +
      '<span class="palette-item-hint" aria-hidden="true">' + (it.kind === "ask" ? "ask" : "↵") + "</span>" +
    "</div>";
  }
  function render(intro) {
    var q = input.value.trim(), groups = compute(q), html = "", n = 0;
    flat = [];
    groups.forEach(function (g, gi) {
      var gid = "pal-g-" + gi;
      html += '<div class="palette-group" role="group" aria-labelledby="' + gid + '"><div class="palette-group-label" id="' + gid + '">' + esc(g.label) + "</div>";
      g.items.forEach(function (it) { flat.push(it); html += itemHTML(it, n++); });
      html += "</div>";
    });
    list.innerHTML = n ? html : '<div class="palette-empty">No matches — press Enter to run it anyway.</div>';
    countEl.textContent = q ? n + (n === 1 ? " result" : " results") : "";
    scrollEl.scrollTop = 0;
    active = 0;
    setActive(0, false);
    if (intro) {
      var nodes = list.querySelectorAll(".palette-item, .palette-group-label");
      for (var i = 0; i < Math.min(nodes.length, 12); i++) {
        if (FULL) tween(nodes[i], { opacity: 0, x: -10 }, { opacity: 1, x: 0 }, { duration: 0.4, delay: 0.06 + i * 0.018 });
      }
    }
  }
  function setActive(i, anim) {
    var nodes = list.querySelectorAll(".palette-item");
    if (!nodes.length) { input.removeAttribute("aria-activedescendant"); hl.style.opacity = "0"; return; }
    i = ((i % nodes.length) + nodes.length) % nodes.length;
    var prev = list.querySelector(".palette-item.is-active");
    if (prev) { prev.classList.remove("is-active"); prev.setAttribute("aria-selected", "false"); }
    active = i;
    var el = nodes[i];
    el.classList.add("is-active");
    el.setAttribute("aria-selected", "true");
    input.setAttribute("aria-activedescendant", el.id);
    var top = el.offsetTop, hgt = el.offsetHeight;
    hl.style.opacity = "1";
    if (window.gsap) {
      if (anim && FULL) window.gsap.to(hl, { y: top, height: hgt, duration: 0.32, ease: "expo.out", overwrite: true });
      else window.gsap.set(hl, { y: top, height: hgt });
    } else {
      hl.style.transform = "translateY(" + top + "px)";
      hl.style.height = hgt + "px";
    }
    if (top < scrollEl.scrollTop + 4) scrollEl.scrollTop = Math.max(0, top - 28);
    else if (top + hgt > scrollEl.scrollTop + scrollEl.clientHeight - 4) scrollEl.scrollTop = top + hgt - scrollEl.clientHeight + 8;
  }

  /* ---- interaction ------------------------------------------------------------------------ */
  function onKey(e) {
    if (e.isComposing) return;
    switch (e.key) {
      case "ArrowDown": e.preventDefault(); setActive(active + 1, true); return;
      case "ArrowUp": e.preventDefault(); setActive(active - 1, true); return;
      case "PageDown": e.preventDefault(); setActive(Math.min(active + 6, flat.length - 1), true); return;
      case "PageUp": e.preventDefault(); setActive(Math.max(active - 6, 0), true); return;
      case "Enter": e.preventDefault(); choose(active); return;
      case "Escape":
        e.preventDefault();
        e.stopPropagation();
        if (input.value) { input.value = ""; render(false); } else close();
        return;
    }
  }
  function choose(i) {
    var it = flat[i], q = input.value.trim();
    if (!it) { if (!q) return; it = { line: q }; }
    var node = list.querySelector("#pal-opt-" + i), origin = null;
    if (node) {
      node.classList.add("is-chosen");
      var nm = node.querySelector(".palette-item-name") || node;
      var r = nm.getBoundingClientRect();
      origin = { left: r.left, top: r.top, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
    }
    close({ restore: false });
    if (GOS.term && GOS.term.run) {
      GOS.term.run(it.line, { source: "palette", origin: origin });
      var a = doc.activeElement; // the command may have focused a window it opened
      if (GOS.term.focus && (!a || a === doc.body || root.contains(a))) GOS.term.focus();
    }
  }
  function setInert(on) {
    var d = doc.getElementById("desktop");
    if (!d) return;
    if ("inert" in d) d.inert = on;
    else if (on) d.setAttribute("aria-hidden", "true");
    else d.removeAttribute("aria-hidden");
  }
  function open(o) {
    o = o || {};
    build();
    if (opened) { input.focus(); input.select(); return; }
    opened = true;
    lastFocus = doc.activeElement;
    root.hidden = false;
    root.classList.add("is-open");
    doc.documentElement.classList.add("palette-open");
    setInert(true);
    input.value = o.query ? String(o.query) : "";
    // narrow phones clip the long placeholder mid-word; use the short one there
    input.placeholder = (window.innerWidth || 1024) < 560 ? "Search or ask…" : "Search commands or ask a question…";
    render(true);
    try { input.focus({ preventScroll: true }); } catch (e) { input.focus(); }

    tween(backdrop, { opacity: 0 }, { opacity: 1 }, { duration: 0.25, ease: "power2.out" });
    if (small()) {
      var hgt = dialog.offsetHeight || 320;
      if (FULL) tween(dialog, { y: -hgt - 24 }, { y: 0 }, { duration: 0.55, ease: "expo.out" });
      else tween(dialog, { opacity: 0 }, { opacity: 1 }, { duration: 0.18, ease: "power2.out" });
    } else if (FULL) {
      // Grow out of whatever opened it (the bar button, the dock chip) when known.
      var dr = dialog.getBoundingClientRect(), or = null, tor = "50% 0%";
      try { or = o.origin && o.origin.getBoundingClientRect ? o.origin.getBoundingClientRect() : null; } catch (e) { or = null; }
      if (or && dr.width) tor = Math.round(or.left + or.width / 2 - dr.left) + "px " + Math.round(or.top + or.height / 2 - dr.top) + "px";
      tween(dialog, { opacity: 0, scale: 0.94, y: -8, transformOrigin: tor }, { opacity: 1, scale: 1, y: 0 }, { duration: 0.46, ease: "back.out(1.5)" });
    } else tween(dialog, { opacity: 0 }, { opacity: 1 }, { duration: 0.18, ease: "power2.out" });
    GOS.emit("palette:open", {});
  }
  function close(o) {
    if (!opened) return;
    o = o || {};
    opened = false;
    setInert(false);
    doc.documentElement.classList.remove("palette-open");
    function finish() {
      if (opened) return;
      root.hidden = true;
      root.classList.remove("is-open");
    }
    tween(backdrop, { opacity: 1 }, { opacity: 0 }, { duration: 0.2, ease: "power2.out" });
    if (FULL) {
      tween(dialog, { opacity: 1, scale: 1, y: 0 }, small() ? { opacity: 0, scale: 1, y: -40 } : { opacity: 0, scale: 0.97, y: -6 },
        { duration: 0.18, ease: "power2.in", onComplete: finish });
    } else tween(dialog, { opacity: 1 }, { opacity: 0 }, { duration: 0.14, ease: "power2.out", onComplete: finish });
    if (o.restore !== false && lastFocus && lastFocus.focus && doc.contains(lastFocus)) {
      // Never re-open the on-screen keyboard just because the palette closed.
      var isPrompt = lastFocus.classList && lastFocus.classList.contains("prompt-input");
      if (!(TOUCH && isPrompt)) { try { lastFocus.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
    }
    lastFocus = null;
    GOS.emit("palette:close", {});
  }
  function toggle(o) { if (opened) close(); else open(o); }

  /* ---- global triggers --------------------------------------------------------------------- */
  doc.addEventListener("keydown", function (e) {
    var k = (e.key || "").toLowerCase();
    if (k === "k" && (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      toggle();
      return;
    }
    if (opened && e.key === "Escape" && doc.activeElement !== input) { e.preventDefault(); e.stopPropagation(); close(); }
  }, true);
  doc.addEventListener("click", function (e) {
    if (!e.target || !e.target.closest) return;
    var t = e.target.closest("[data-palette]");
    if (t) { e.preventDefault(); open({ origin: t }); return; }
    var c = e.target.closest("[data-palette-close]");
    if (c && root && root.contains(c)) { e.preventDefault(); close(); }
  });

  // A command started from anywhere else (bar, terminal API) shouldn't run under an open palette.
  if (GOS.on) GOS.on("command", function (d) { if (opened && !(d && d.source === "palette")) close(); });

  GOS.palette = {
    open: open,
    close: close,
    toggle: toggle,
    isOpen: function () { return opened; }
  };
})();
