/* =============================================================================
 * GUNR.DEV — qr.js
 * Thin wrapper around qrcode-generator@1.4.4 (global `qrcode`, loaded from CDN).
 *
 * window.GUNR_QR = {
 *   ready()                 -> boolean, true when the library is available
 *   svg(text, opts)         -> SVG string, or null if the library is missing/failed
 *   png(text, px, opts)     -> Promise<dataURL "image/png"> (rejects if unavailable)
 *   matrix(text, ecc)       -> { size, isDark(row, col) } or null
 * }
 * opts: { ecc: 'L'|'M'|'Q'|'H' (default 'M'), margin: modules (default 4),
 *         dark: '#000', light: '#fff' (use 'none' for transparent),
 *         size: px width/height for the SVG (omit to size it with CSS),
 *         label: accessible name (default "QR code linking to <text>") }
 * ========================================================================== */
window.GUNR_QR = (function () {
  "use strict";

  var cache = {};

  function ready() {
    return typeof window.qrcode === "function";
  }

  function esc(v) {
    if (window.GUNR_UTIL && window.GUNR_UTIL.esc) return window.GUNR_UTIL.esc(v);
    return String(v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function normEcc(ecc) {
    var e = String(ecc || "M").toUpperCase();
    return /^[LMQH]$/.test(e) ? e : "M";
  }

  function opts(o) {
    o = o || {};
    var margin = parseInt(o.margin, 10);
    return {
      ecc: normEcc(o.ecc),
      margin: isNaN(margin) || margin < 0 ? 4 : margin,
      dark: o.dark || "#000",
      light: o.light || "#fff",
      size: o.size,
      label: o.label
    };
  }

  function utf8Bytes(s) {
    var bin = unescape(encodeURIComponent(String(s)));
    var out = [];
    for (var i = 0; i < bin.length; i++) out.push(bin.charCodeAt(i));
    return out;
  }

  /* Build (and memoize) the module matrix. Returns null on any failure. */
  function matrix(text, ecc) {
    if (!ready()) return null;
    var e = normEcc(ecc);
    var key = e + "|" + text;
    if (cache[key]) return cache[key];
    try {
      // Encode as UTF-8 bytes so non-ASCII URLs/text scan correctly.
      // (The library's default encoder truncates each char to one byte.)
      qrcode.stringToBytes = utf8Bytes;
      var qr = qrcode(0, e); // type 0 = smallest version that fits
      qr.addData(String(text), "Byte");
      qr.make();
      var m = { size: qr.getModuleCount(), isDark: function (r, c) { return qr.isDark(r, c); } };
      cache[key] = m;
      return m;
    } catch (err) {
      return null; // e.g. data too long for the chosen level
    }
  }

  function svg(text, options) {
    var o = opts(options);
    var m = matrix(text, o.ecc);
    if (!m) return null;

    var n = m.size;
    var total = n + o.margin * 2;
    var d = "";
    // One subpath per horizontal run of dark modules keeps the path small.
    for (var r = 0; r < n; r++) {
      var c = 0;
      while (c < n) {
        if (!m.isDark(r, c)) { c++; continue; }
        var start = c;
        while (c < n && m.isDark(r, c)) c++;
        d += "M" + (start + o.margin) + " " + (r + o.margin) + "h" + (c - start) + "v1h-" + (c - start) + "z";
      }
    }

    var label = o.label || "QR code linking to " + text;
    var dims = o.size ? ' width="' + Number(o.size) + '" height="' + Number(o.size) + '"' : "";
    var bg = o.light === "none" || o.light === "transparent"
      ? ""
      : '<rect width="' + total + '" height="' + total + '" fill="' + esc(o.light) + '"/>';

    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + total + " " + total + '"' + dims +
      ' role="img" aria-label="' + esc(label) + '" shape-rendering="crispEdges">' +
      "<title>" + esc(label) + "</title>" + bg +
      '<path fill="' + esc(o.dark) + '" d="' + d + '"/></svg>';
  }

  function png(text, px, options) {
    return new Promise(function (resolve, reject) {
      var o = opts(options);
      var m = matrix(text, o.ecc);
      if (!m) { reject(new Error("QR library unavailable or data too long")); return; }

      var size = Math.max(64, Math.round(px || 1024));
      var total = m.size + o.margin * 2;
      // Whole-pixel modules for crisp edges; leftover pixels become extra quiet zone.
      var unit = Math.max(1, Math.floor(size / total));
      var offset = Math.floor((size - unit * total) / 2) + o.margin * unit;

      var canvas = document.createElement("canvas");
      canvas.width = canvas.height = size;
      var ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("Canvas unsupported")); return; }
      ctx.imageSmoothingEnabled = false;
      if (o.light !== "none" && o.light !== "transparent") {
        ctx.fillStyle = o.light;
        ctx.fillRect(0, 0, size, size);
      }
      ctx.fillStyle = o.dark;
      for (var r = 0; r < m.size; r++) {
        for (var c = 0; c < m.size; c++) {
          if (m.isDark(r, c)) ctx.fillRect(offset + c * unit, offset + r * unit, unit, unit);
        }
      }
      try {
        resolve(canvas.toDataURL("image/png"));
      } catch (err) {
        reject(err);
      }
    });
  }

  return { ready: ready, svg: svg, png: png, matrix: matrix };
})();
