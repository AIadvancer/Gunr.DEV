/* =============================================================================
 * GUNR.DEV — vcard.js
 * window.GUNR_VCARD = {
 *   build(profile)    -> vCard 3.0 string (CRLF, escaped, folded at 75 octets)
 *   download(profile) -> saves "<first>-<last>.vcf"; returns the vCard string
 *   filename(profile) -> "jake-patterson.vcf"
 * }
 * Unset values (empty or containing "[[") are skipped entirely.
 * ========================================================================== */
window.GUNR_VCARD = (function () {
  "use strict";

  var CRLF = "\r\n";
  var SOCIAL_TYPES = { linkedin: 1, github: 1, x: 1, twitter: 1, huggingface: 1, mastodon: 1, instagram: 1, facebook: 1, youtube: 1 };

  function isSet(v) {
    if (window.GUNR_UTIL && window.GUNR_UTIL.isSet) return window.GUNR_UTIL.isSet(v);
    return v !== null && v !== undefined && String(v).trim() !== "" && String(v).indexOf("[[") === -1;
  }

  /* TEXT value escaping per RFC 2426: backslash, comma, semicolon, newline. */
  function escText(v) {
    return String(v)
      .replace(/\\/g, "\\\\")
      .replace(/,/g, "\\,")
      .replace(/;/g, "\\;")
      .replace(/\r\n|\r|\n/g, "\\n");
  }

  /* URI values are not TEXT-escaped (escaped commas break many parsers);
     just strip anything that would break the line. */
  function cleanUri(v) {
    return String(v).replace(/[\r\n]+/g, "").trim();
  }

  function utf8Len(codePoint) {
    if (codePoint < 0x80) return 1;
    if (codePoint < 0x800) return 2;
    if (codePoint < 0x10000) return 3;
    return 4;
  }

  /* Fold a content line so no physical line exceeds 75 octets (UTF-8),
     never splitting a multi-byte character. Continuations start with a space,
     which counts toward their 75. */
  function fold(line) {
    var out = "";
    var used = 0;
    var limit = 75;
    for (var ch of line) {
      var n = utf8Len(ch.codePointAt(0));
      if (used + n > limit) {
        out += CRLF + " ";
        used = 1;
      }
      out += ch;
      used += n;
    }
    return out;
  }

  function build(profile) {
    var p = profile || window.PROFILE || {};
    var name = p.name || {};
    var first = isSet(name.first) ? name.first : "";
    var last = isSet(name.last) ? name.last : "";
    var full = [first, last].filter(Boolean).join(" ") || (isSet(p.handle) ? p.handle : "Contact");
    var lines = [];

    lines.push("BEGIN:VCARD");
    lines.push("VERSION:3.0");
    lines.push("PRODID:-//GUNR//Forward Pass//EN");
    lines.push("N:" + escText(last) + ";" + escText(first) + ";;;");
    lines.push("FN:" + escText(full));
    if (isSet(p.handle)) lines.push("NICKNAME:" + escText(p.handle));
    if (isSet(p.company)) lines.push("ORG:" + escText(p.company));
    if (isSet(p.title)) lines.push("TITLE:" + escText(p.title));
    if (isSet(p.email)) lines.push("EMAIL;TYPE=INTERNET,PREF:" + escText(String(p.email).trim()));
    if (isSet(p.phone)) lines.push("TEL;TYPE=CELL,VOICE:" + escText(String(p.phone).trim()));
    if (isSet(p.siteUrl)) lines.push("URL:" + cleanUri(p.siteUrl));

    // Links: labelled URL (Apple + Android) plus X-SOCIALPROFILE for known networks (iOS/macOS).
    var item = 1;
    (p.links || []).forEach(function (link) {
      if (!link || !isSet(link.url)) return;
      var url = cleanUri(link.url);
      if (/^mailto:/i.test(url)) return; // email already covered
      var group = "item" + item++;
      lines.push(group + ".URL:" + url);
      if (isSet(link.label)) lines.push(group + ".X-ABLabel:" + escText(link.label));
      var type = String(link.icon || "").toLowerCase();
      if (SOCIAL_TYPES[type]) lines.push("X-SOCIALPROFILE;TYPE=" + type + ":" + url);
    });

    var note = [];
    if (isSet(p.tagline)) note.push(p.tagline);
    if (isSet(p.companyNote) && isSet(p.company)) note.push(p.company + " (" + p.companyNote + ")");
    if (note.length) lines.push("NOTE:" + escText(note.join("\n")));

    lines.push("END:VCARD");
    return lines.map(fold).join(CRLF) + CRLF;
  }

  function filename(profile) {
    var p = profile || window.PROFILE || {};
    var n = p.name || {};
    var base = [n.first, n.last].filter(isSet).join("-") || p.handle || "contact";
    base = String(base).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return (base || "contact") + ".vcf";
  }

  function download(profile) {
    var data = build(profile);
    var name = filename(profile);
    var a = document.createElement("a");
    var canBlob = typeof Blob !== "undefined" && window.URL && typeof URL.createObjectURL === "function";

    if (canBlob && "download" in a) {
      var url = URL.createObjectURL(new Blob([data], { type: "text/vcard;charset=utf-8" }));
      a.href = url;
      a.download = name;
      a.rel = "noopener";
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      setTimeout(function () {
        URL.revokeObjectURL(url);
        if (a.parentNode) a.parentNode.removeChild(a);
      }, 1500);
    } else {
      // Older iOS Safari / in-app browsers: navigating to the data URI opens the
      // native "Add to Contacts" sheet.
      window.location.href = "data:text/vcard;charset=utf-8," + encodeURIComponent(data);
    }
    return data;
  }

  return { build: build, download: download, filename: filename };
})();
