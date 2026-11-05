/* =============================================================================
 * GUNR//OS — gpt.js  ("gunr-gpt")
 * -----------------------------------------------------------------------------
 * A tiny, honest, offline assistant. It is NOT a language model: it matches the
 * question to an intent (weighted patterns + entities found in PROFILE) and
 * composes a natural answer from the profile data only. Anything it cannot find
 * gets an honest "I don't know that" plus suggestions — it never guesses.
 *
 *   GOS.gpt.answer(question) -> { text, cmds: [command strings], confidence 0..1, intent }
 *   GOS.gpt.suggestions      -> starter questions for the chat UI
 *   GOS.gpt.label            -> the honesty label shown wherever answers appear
 *   GOS.gpt.name             -> "gunr-gpt"
 * ========================================================================== */
(function () {
  "use strict";

  var GOS = window.GOS;
  if (!GOS) return;
  var U = GOS.util;

  function P() { return (GOS.profile && GOS.profile()) || window.PROFILE || {}; }
  function set(v) { return U.isSet(v); }
  function clean(s) { return String(s == null ? "" : s).replace(/\s+/g, " ").trim(); }
  function sentence(s) {
    s = clean(s);
    if (s && !/[.!?…]$/.test(s)) s += ".";
    return s;
  }
  function list(a) {
    a = a.filter(Boolean);
    if (a.length < 2) return a.join("");
    return a.slice(0, -1).join(", ") + " and " + a[a.length - 1];
  }
  // First-person profile text is quoted rather than paraphrased into new claims.
  function voice(s) { s = sentence(s); return /\b(I|I'm|I've|my)\b/.test(s) ? "In his words: \"" + s + "\"" : s; }
  function first() { var n = P().name || {}; return set(n.first) ? n.first : "Gunnar"; }
  function fullName() {
    var n = P().name || {};
    return [n.first, n.last].filter(set).join(" ") || (set(P().handle) ? P().handle : "Gunnar");
  }
  function pct(l) { return Math.round(l * 100) + "%"; }
  function uniq(a) { return a.filter(function (x, i) { return x && a.indexOf(x) === i; }); }
  function reEsc(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

  /* ---- profile views ------------------------------------------------------ */
  function skills() {
    var out = [];
    (P().skills || []).forEach(function (g) {
      (g.items || []).forEach(function (s) {
        if (set(s.name)) out.push({ name: s.name, level: +s.level || 0, note: set(s.note) ? s.note : "", group: g.group });
      });
    });
    return out;
  }
  function skillByName(name) {
    var all = skills();
    for (var i = 0; i < all.length; i++) if (all[i].name === name) return all[i];
    return null;
  }
  function isResearchRole(e) { return /research|student|universit|\bai\b/i.test((e.role || "") + " " + (e.org || "")); }
  function experience() { return (P().experience || []).filter(function (e) { return set(e.org) || set(e.role); }); }
  function current() {
    var ex = experience(), c = null;
    ex.forEach(function (e) { if (String(e.end).toLowerCase() === "present" && !isResearchRole(e)) c = e; });
    return c || ex.filter(function (e) { return String(e.end).toLowerCase() === "present"; })[0] || null;
  }
  function dates(e) {
    var s = set(e.start) ? e.start : "", en = set(e.end) ? e.end : "";
    if (s && en) return s + "–" + en;
    if (en === "present") return "currently";
    if (s) return "from " + s;
    return "";
  }
  function setHighlights(e) { return (e.highlights || []).filter(set).map(clean); }
  function research() { return (P().research || []).filter(Boolean); }
  function researchTags() {
    var tags = [];
    research().forEach(function (r) { (r.tags || []).forEach(function (t) { if (set(t) && tags.indexOf(t) < 0) tags.push(t); }); });
    return tags;
  }
  function links() { return (P().links || []).filter(function (l) { return l && set(l.url) && set(l.label); }); }
  function companyLine() {
    var p = P(), s = "";
    if (set(p.title)) s += p.title;
    if (set(p.company)) s += (s ? " at " : "") + p.company;
    if (set(p.companyNote)) s += " (" + p.companyNote + ")";
    return s;
  }
  function aiSince() {
    var years = [];
    experience().forEach(function (e) { if (isResearchRole(e) && set(e.start) && /^\d{4}$/.test(e.start)) years.push(+e.start); });
    return years.length ? Math.min.apply(Math, years) : null;
  }

  /* ---- skill matching ----------------------------------------------------- */
  // [pattern, skill name, related?]  related = the product/term is not literally on
  // his list, so the answer says so and only points at the closest listed skill.
  var SYN = [
    ["active directory|\\bad\\b|group polic|\\bgpo\\b|domain controller|windows server|file and print", "Windows Server & Active Directory"],
    ["microsoft 365|\\bm365\\b|office 365|\\bo365\\b|\\bentra\\b|azure ad|tenant|mail flow|licensing", "Microsoft 365 & Entra ID"],
    ["exchange|outlook|sharepoint|teams admin", "Microsoft 365 & Entra ID", 1],
    ["network|tcp/?ip|\\bdns\\b|\\bdhcp\\b|vlan|wi-?fi|\\bvpn\\b", "Networking"],
    ["firewall|cisco|meraki|ubiquiti|unifi|fortinet|pfsense", "Networking", 1],
    ["endpoint management|imaging|device management|deploy(ing|ment)? (devices|laptops|machines)", "Endpoint management"],
    ["intune|\\bsccm\\b|\\bmecm\\b|\\bmdm\\b|autopilot", "Endpoint management", 1],
    ["backup|recovery|restore|disaster", "Backup & recovery"],
    ["virtuali[sz]|hypervisor|\\bvms?\\b|virtual machine", "Virtualization"],
    ["vmware|hyper-?v|proxmox|esxi|virtualbox", "Virtualization", 1],
    ["python|\\bpy\\b", "Python"],
    ["pandas|numpy|scikit|sklearn|jupyter", "Python", 1],
    ["pytorch|\\btorch\\b", "PyTorch"],
    ["tensorflow|keras|\\bjax\\b", "PyTorch", 1],
    ["fine-?tun|\\blora\\b", "LLM fine-tuning"],
    ["qlora|\\bpeft\\b|unsloth", "LLM fine-tuning", 1],
    ["\\brag\\b|retrieval|embedding|vector search|vector db", "RAG & embeddings"],
    ["pinecone|chroma|faiss|pgvector|langchain|llamaindex", "RAG & embeddings", 1],
    ["prompting|prompt engineering|\\bevals?\\b|evaluation|benchmark", "Prompting & evals"],
    ["\\bgpus?\\b|inference|quantiz|local models?|run(ning)? models", "Local GPU inference"],
    ["ollama|llama\\.?cpp|\\bvllm\\b|\\bcuda\\b|gguf", "Local GPU inference", 1],
    ["\\bmfa\\b|\\b2fa\\b|multi-?factor|identity|sign-?in", "Identity & MFA"],
    ["\\bsso\\b|okta|conditional access|passkey|yubikey", "Identity & MFA", 1],
    ["patch|updates\\b|updating", "Patch management"],
    ["wsus", "Patch management", 1],
    ["endpoint protection|\\bedr\\b|antivirus|\\bav\\b|malware", "Endpoint protection"],
    ["defender|crowdstrike|sentinelone|sophos", "Endpoint protection", 1],
    ["least privilege|privilege|access control|permissions", "Least privilege"],
    ["\\brbac\\b|\\bpam\\b", "Least privilege", 1],
    ["monitor|alerting|alerts", "Monitoring & alerting"],
    ["siem|splunk|grafana|prometheus|zabbix|prtg", "Monitoring & alerting", 1],
    ["powershell|\\bps1\\b|automat", "PowerShell"],
    ["bash|shell script", "PowerShell", 1],
    ["javascript|\\bjs\\b|\\bhtml\\b|\\bcss\\b|front-?end|web dev", "JavaScript / HTML / CSS"],
    ["react|\\bvue\\b|svelte|typescript|node\\.?js|next\\.?js", "JavaScript / HTML / CSS", 1],
    ["\\bgit\\b|github|version control", "Git & GitHub"],
    ["\\bapis?\\b|rest api|restful|webhook", "REST APIs"],
    ["\\bsql\\b|database|queries", "SQL"],
    ["postgres|mysql|sql server|sqlite|mongo", "SQL", 1]
  ];
  var GROUP_SYN = [
    ["\\bai\\b|\\bml\\b|machine learning|deep learning|artificial intelligence|\\bllms?\\b", "AI / ML"],
    ["security|cyber|infosec|secure", "Security"],
    ["infrastructure|sysadmin|system admin|\\bit (ops|support|work|infrastructure)\\b|help ?desk", "IT Infrastructure"],
    ["\\bdev\\b|coding|programming|software|developer|scripting", "Dev"]
  ];

  function findSkills(q) {
    var found = [], seen = {};
    skills().forEach(function (s) {
      // the skill's own words count as exact matches ("windows server", "html", …)
      s.name.toLowerCase().split(/\s*(?:&|\/|,)\s*/).forEach(function (part) {
        part = part.trim();
        if (part.length < 2 || seen[s.name]) return;
        if (new RegExp("\\b" + reEsc(part) + "\\b").test(q)) { seen[s.name] = 1; found.push({ skill: s, related: false, term: part }); }
      });
    });
    SYN.forEach(function (row) {
      if (seen[row[1]]) return;
      var m = new RegExp(row[0]).exec(q);
      if (!m) return;
      var s = skillByName(row[1]);
      if (!s) return;
      seen[row[1]] = 1;
      found.push({ skill: s, related: !!row[2], term: m[0] });
    });
    return found;
  }
  function findGroup(q) {
    var groups = (P().skills || []).map(function (g) { return g.group; });
    for (var i = 0; i < GROUP_SYN.length; i++) {
      if (new RegExp(GROUP_SYN[i][0]).test(q) && groups.indexOf(GROUP_SYN[i][1]) >= 0) return GROUP_SYN[i][1];
    }
    return null;
  }
  function findTags(q) {
    return researchTags().filter(function (t) { return new RegExp("\\b" + reEsc(t.toLowerCase()) + "\\b").test(q); });
  }
  // "does he know rust?" → "rust" (only used when nothing on the list matched)
  var ASK_TECH = /\b(?:know|knows|use|uses|used|familiar with|experience (?:with|in)|experienced (?:with|in)|good (?:at|with)|skilled (?:at|in|with)|proficient (?:in|with)|code in|program in|work with|worked with|certified in)\s+([a-z0-9+#.\- ]{2,28})/;
  var STOP = /^(about|anything|something|it|that|this|the|a|an|him|me|you|what|how|computers?|stuff|things|tech|technology)$/;
  function unknownTech(q) {
    var m = ASK_TECH.exec(q);
    if (!m) return null;
    var t = m[1].replace(/\?.*$/, "").replace(/\b(at all|well|much|very|really|too|also|yet|or not)\b.*$/, "").trim();
    t = t.replace(/^(the|a|an)\s+/, "");
    if (!t || STOP.test(t) || t.split(" ").length > 3) return null;
    return t;
  }

  /* ---- intents ------------------------------------------------------------ */
  var INTENTS = [
    { id: "greet", w: 3, re: /^(hi|hey|hello|yo|sup|hiya|howdy|hola|good (morning|afternoon|evening))\b/ },
    { id: "thanks", w: 3, re: /\b(thanks|thank you|thx|ty|cheers|appreciate it)\b/ },
    { id: "bye", w: 2.5, re: /\b(bye|goodbye|see ya|cya|good night)\b/ },
    { id: "self", w: 4, re: /\b(who|what) are you\b|\bare you (real|an? (ai|bot|llm|human)|chatgpt|gpt|claude)\b|\bgunr-?gpt\b|how do you work|\byour (data|source|knowledge)\b|\bwhat can you (do|answer)\b/ },
    { id: "howto", w: 2.5, re: /\bhow (do|can|should) i (use|navigate|get around|work|start)|how does (this|the site|it) work|\b(commands?|instructions|shortcuts?)\b|\bnavigat|\bwhere do i start|\bi'?m (lost|confused|new)/ },
    { id: "site", w: 2.5, re: /\b(this|the) (site|website|page|terminal|portfolio)\b|\bbuilt (with|using|in)\b|\bwho (made|built|designed)\b|source code|\bgunr\.dev\b|\bframework\b/ },
    { id: "vcard", w: 4.5, re: /\bsave (his |the )?contact|\bvcard\b|\.vcf\b|add (him |gunnar )?to (my )?(contacts|phone)/ },
    { id: "qr", w: 3.5, re: /\bqr\b/ },
    { id: "contact", w: 3, re: /\bcontact|\breach\b|get in touch|talk to (him|gunnar)|connect with|message (him|gunnar)|how (can|do) i (reach|contact|talk)/ },
    { id: "email", w: 3.2, re: /\be-?mail|\bmail\b|\binbox\b/ },
    { id: "phone", w: 3.2, re: /\bphone|\bcall\b|\bnumber\b|\bcell\b|\bmobile\b|\btext (him|gunnar)/ },
    { id: "location", w: 3, re: /\bwhere\b.*\b(live|lives|located|based|from|is he)\b|\blocation\b|\bcity\b|\bwhich state\b|south carolina|blacksburg|time ?zone|\bwhere is (he|gunnar)/ },
    { id: "role", w: 2.6, re: /\bwhat does (he|gunnar) do\b|\b(job|role|title|position|occupation|day job|profession)\b|\bwork(s|ing)? (as|at|for)\b|\bwhere (does|do|did) (he|gunnar|gunr) work\b|\bwhere (does|is) (he|gunnar) (work|employed)|\bwho does he work for|\bemploy(ed|er)?\b|\bcurrent(ly)?\b/ },
    { id: "company", w: 2.6, re: /\bmoorhead|holdings|brothers|\bcompany\b|\brenam|name change|\bmerger?\b/ },
    { id: "previous", w: 1.6, re: /\b(previous|before|prior|past|former(ly)?|used to|earlier|first job)\b/ },
    { id: "experience", w: 2.4, re: /\bexperience|\bcareer|\bhistory\b|\bbackground\b|\bresume|\bcv\b|\bworked\b|\bjobs\b|\btimeline\b|how long|how many years|\byears\b/ },
    { id: "research", w: 3, re: /\bresearch|\bprojects?\b|\bpapers?\b|\bexperiments?\b|\bportfolio\b|what (has|did) he (build|built|make|made)|working on/ },
    { id: "ai", w: 1.8, re: /\b(ai|artificial intelligence|machine learning|ml|llms?|models?|neural|deep learning|bert|nlp)\b/ },
    { id: "skills", w: 2.5, re: /\bskills?\b|good at|\bstrengths?\b|\bstack\b|\btech(nologies|nology)?\b|\btools\b|\bexpertise\b|\babilities\b|\bspecializ|\bbest at\b|what (does|can) he (know|do well)/ },
    { id: "education", w: 3, re: /\beducation|\bschool|\bcollege|universit|\bdegree|\bstud(y|ied|ent)|clemson|graduat|\bmajor\b|\bclasses\b/ },
    { id: "availability", w: 3, re: /\bavailab|\bopen to\b|\bhire\b|\bhiring\b|\brecruit|freelance|contract work|collaborat|work together|job offer|opportunit|\bpartner|consult|side project/ },
    { id: "links", w: 3, re: /\blinkedin|\bgithub\b|hugging ?face|\bsocials?\b|\blinks?\b|\bprofiles?\b|twitter/ },
    { id: "who", w: 3, re: /\bwho is (he|gunnar|gunr|this)\b|\bwhat is gunr\b|\bwho'?s (gunnar|gunr|this)\b|\babout (him|gunnar)\b|tell me about (him|gunnar|yourself)|\bintroduc|\bbio\b|\bsummary\b|tl;?dr|elevator pitch|\bsummari[sz]e\b/ },
    { id: "handle", w: 2, re: /what does gunr (mean|stand for)|\bhandle\b|\bnickname\b|\bwhy gunr\b/ },
    { id: "traits", w: 2.2, re: /fun fact|personality|\btraits?\b|\bhobb(y|ies)\b|printers?|night owl|late night|\bcurious\b|\bquirk/ }
  ];

  function score(q) {
    var s = {};
    INTENTS.forEach(function (it) { if (it.re.test(q)) s[it.id] = (s[it.id] || 0) + it.w; });
    return s;
  }

  /* ---- answer builders ---------------------------------------------------- */
  function A(text, cmds, confidence, intent) {
    return { text: clean(text), cmds: uniq(cmds || []).slice(0, 4), confidence: confidence, intent: intent };
  }

  function contactAnswer(kind) {
    var p = P(), bits = [], cmds = ["contact", "vcard"];
    var hasMail = set(p.email), hasTel = set(p.phone);
    if (kind === "email") {
      if (!hasMail) return A("His email isn't published on the site yet. Your best bet is the contact card, which lists every way to reach him.", ["contact", "socials"], 0.6, "email");
      return A("You can email " + first() + " at " + clean(p.email) + ". " + (hasTel ? "If it's quicker, his number is " + clean(p.phone) + ". " : "") + "Tap Save contact to add everything to your phone in one go.", ["email", "vcard", "contact"], 0.95, "email");
    }
    if (kind === "phone") {
      if (!hasTel) return A("His phone number isn't published yet" + (hasMail ? " — email works best: " + clean(p.email) + "." : "."), ["contact", "email"], 0.6, "phone");
      return A(first() + "'s number is " + clean(p.phone) + ". " + (hasMail ? "He's also on email at " + clean(p.email) + ". " : "") + "Save contact puts both on your phone.", ["call", "vcard", "contact"], 0.95, "phone");
    }
    if (hasMail) bits.push("email him at " + clean(p.email));
    if (hasTel) bits.push("call " + clean(p.phone));
    var text = bits.length
      ? "The easiest way to reach " + first() + " is to " + list(bits).replace(/ and (?=[^,]*$)/, " or ") + ". "
      : "The direct contact details aren't published yet, but the contact card has everything that is. ";
    if (set(p.location)) text += "He's based in " + clean(p.location) + ". ";
    text += "Tap Save contact to add him to your phone in one step.";
    if (hasMail) cmds.push("email");
    return A(text, cmds, 0.95, "contact");
  }

  function roleAnswer(prevOnly) {
    var p = P(), ex = experience(), c = current();
    if (prevOnly) {
      var prev = ex.filter(function (e) { return e !== c && !isResearchRole(e) && String(e.end).toLowerCase() !== "present"; });
      if (!prev.length) return A("The profile doesn't list an earlier role besides his current one.", ["experience"], 0.5, "previous");
      var txt = prev.map(function (e) {
        var d = dates(e);
        return "Before that, he was " + (set(e.role) ? e.role : "on the team") + " at " + e.org + (d ? " (" + d + ")" : "") + ". " + (set(e.summary) ? sentence(e.summary) : "");
      }).join(" ");
      if (set(p.companyNote) && c) txt += " " + c.org + " is the same company under its new name, so it's one continuous run.";
      return A(txt, ["experience", "about"], 0.85, "previous");
    }
    var t = first() + " is " + (companyLine() ? "an " + companyLine() : "an IT professional") + ". ";
    if (c && set(c.summary)) t += voice(c.summary) + " ";
    var ai = aiSince();
    if (ai) t += "Alongside the day job he has been researching and applying AI since " + ai + ".";
    return A(t, ["experience", "about", "research"], 0.9, "role");
  }

  function companyAnswer() {
    var p = P(), c = current();
    var t = "";
    if (set(p.company)) t += p.company + (set(p.companyNote) ? " is the company " + p.companyNote.replace(/^formerly/i, "formerly known as") + ". " : " is where " + first() + " works. ");
    var ex = experience().filter(function (e) { return !isResearchRole(e); });
    if (ex.length > 1) t += first() + " has worked there across both names — " + list(ex.map(function (e) { return (set(e.role) ? e.role : "") + " at " + e.org; })) + ". ";
    if (c && set(c.summary)) t += sentence(c.summary);
    if (!t) return null;
    return A(t, ["experience", "about"], 0.85, "company");
  }

  function experienceAnswer(q) {
    var ex = experience();
    if (!ex.length) return null;
    // current role first, then the rest newest-first, research last
    var rank = function (e) { return String(e.end).toLowerCase() === "present" && !isResearchRole(e) ? 0 : isResearchRole(e) ? 2 : 1; };
    var ordered = ex.slice().reverse().sort(function (a, b) { return rank(a) - rank(b); });
    var parts = ordered.map(function (e) {
      var d = dates(e);
      var s = (set(e.role) ? e.role : "Role") + " at " + e.org + (d ? " (" + d + ")" : "");
      return s + (set(e.summary) ? ". " + voice(e.summary) : ".");
    });
    var t = "Here's the short version of " + first() + "'s experience. " + parts.join(" ");
    if (/how long|how many years|\byears\b/.test(q)) {
      var known = ex.filter(function (e) { return set(e.start); });
      if (known.length < ex.length) t += " Start dates for his IT roles aren't listed yet, so I can't give you an exact total.";
    }
    return A(t, ["experience", "skills", "research"], 0.85, "experience");
  }

  function researchAnswer(tags) {
    var rs = research();
    var real = rs.filter(function (r) { return set(r.title); });
    var t = "";
    if (tags && tags.length) {
      var hits = rs.filter(function (r) { return (r.tags || []).some(function (x) { return tags.indexOf(x) >= 0; }); });
      var named = hits.filter(function (r) { return set(r.title); });
      if (named.length) {
        t = named.map(function (r) { return r.title + (set(r.year) ? " (" + r.year + ")" : "") + (set(r.summary) ? ": " + clean(r.summary) : "."); }).join(" ");
      } else if (hits.length) {
        var other = [];
        hits.forEach(function (r) { (r.tags || []).forEach(function (x) { if (tags.indexOf(x) < 0 && other.indexOf(x) < 0) other.push(x); }); });
        t = "There's a research track tagged " + list(tags) + (other.length ? " (alongside " + list(other) + ")" : "") + ", but its write-up isn't published yet, so I can't share details without guessing.";
      }
    }
    if (!t) {
      if (real.length) {
        t = first() + "'s research includes " + list(real.map(function (r) { return r.title + (set(r.year) ? " (" + r.year + ")" : ""); })) + ".";
      } else {
        var tg = researchTags();
        t = "The project write-ups are still being prepared, so I won't make up details. " + (rs.length ? "There are " + rs.length + " research tracks on the way" + (tg.length ? ", covering " + list(tg.slice(0, 9)) : "") + ". " : "");
      }
    }
    var ai = experience().filter(isResearchRole)[0];
    if (ai && !(tags && tags.length)) {
      var h = setHighlights(ai);
      if (set(ai.summary)) t += " What's on record: " + voice(ai.summary);
      if (h.length) t += " Milestones: " + h.map(sentence).join(" ");
    }
    return A(t, ["research", "experience", "skills"], real.length ? 0.85 : 0.7, "research");
  }

  function aiAnswer() {
    var ai = experience().filter(isResearchRole)[0];
    var since = aiSince();
    var top = skills().filter(function (s) { return s.group === "AI / ML"; }).sort(function (a, b) { return b.level - a.level; }).slice(0, 3);
    var t = "";
    if (since) t += first() + " has been working with AI since " + since + ". ";
    if (ai && set(ai.summary)) t += voice(ai.summary) + " ";
    var h = ai ? setHighlights(ai) : [];
    if (h.length) t += "Two concrete milestones: " + h.map(sentence).join(" ") + " ";
    if (top.length) t += "His strongest AI skills are " + list(top.map(function (s) { return s.name + " (" + pct(s.level) + ")"; })) + ".";
    if (!t) return null;
    return A(t, ["research", "skills", "experience"], 0.8, "ai");
  }

  function skillAnswer(matches) {
    var exact = matches.filter(function (m) { return !m.related; });
    var rel = matches.filter(function (m) { return m.related; });
    var parts = [];
    exact.slice(0, 3).forEach(function (m) {
      var s = m.skill, lv = s.level;
      var word = lv >= 0.82 ? "one of his strongest skills" : lv >= 0.74 ? "a solid, everyday skill" : lv >= 0.66 ? "a working skill" : "a skill he's still building on";
      parts.push("Yes — " + s.name + " is " + word + " (" + pct(lv) + ", " + s.group + ")." + (s.note ? " In his words: \"" + s.note + "\"" : ""));
    });
    rel.slice(0, 2).forEach(function (m) {
      if (exact.some(function (e) { return e.skill === m.skill; })) return;
      parts.push("\"" + m.term + "\" isn't named specifically on his list, so I can't confirm it. The closest listed skill is " + m.skill.name + " (" + pct(m.skill.level) + ")" + (m.skill.note ? ": " + m.skill.note : "."));
    });
    return A(parts.join(" "), ["skills", "research", "contact"], exact.length ? 0.9 : 0.55, "skill");
  }

  function groupAnswer(group) {
    var g = skills().filter(function (s) { return s.group === group; }).sort(function (a, b) { return b.level - a.level; });
    if (!g.length) return null;
    return A("In " + group + ", " + first() + "'s list runs " + list(g.map(function (s) { return s.name + " (" + pct(s.level) + ")"; })) + ". Strongest: " + g[0].name + " — " + (g[0].note || "") , ["skills", "research"], 0.8, "skills");
  }

  function skillsAnswer() {
    var all = skills();
    if (!all.length) return null;
    var groups = (P().skills || []).map(function (g) {
      var top = all.filter(function (s) { return s.group === g.group; }).sort(function (a, b) { return b.level - a.level; }).slice(0, 2);
      return top.length ? g.group + ": " + list(top.map(function (s) { return s.name; })) : "";
    }).filter(Boolean);
    var best = all.slice().sort(function (a, b) { return b.level - a.level; }).slice(0, 3);
    return A(first() + " spans " + list((P().skills || []).map(function (g) { return g.group; })) + ". The highlights per area — " + groups.join("; ") + ". Overall, his top three are " + list(best.map(function (s) { return s.name + " (" + pct(s.level) + ")"; })) + ".", ["skills", "research", "experience"], 0.85, "skills");
  }

  function educationAnswer() {
    var hits = experience().filter(function (e) { return /clemson|universit|college|school|student/i.test([e.org, e.role, e.summary].concat(e.highlights || []).join(" ")); });
    if (!hits.length) return A("The profile doesn't mention his education, so I'd rather not guess. You could ask him directly.", ["contact", "experience"], 0.5, "education");
    var e = hits[0];
    var t = "The profile connects " + first() + " with " + (/clemson/i.test(e.org) ? "Clemson University" : e.org) + " through his AI research" + (dates(e) ? " (" + dates(e) + ")" : "") + ". ";
    var h = setHighlights(e).filter(function (x) { return /college|clemson|universit|school/i.test(x); });
    if (h.length) t += "From his notes: " + h.map(sentence).join(" ") + " ";
    t += "It doesn't list a specific degree, so I won't guess at one.";
    return A(t, ["experience", "research", "contact"], 0.75, "education");
  }

  function availabilityAnswer() {
    var p = P();
    var t = set(p.availability) ? first() + " is " + p.availability.charAt(0).toLowerCase() + p.availability.slice(1) + ". " : first() + " hasn't posted his availability, but he's easy to reach. ";
    if (set(p.email)) t += "The best first step is an email to " + clean(p.email) + ". ";
    t += "Save contact adds his details to your phone.";
    return A(t, ["contact", "vcard", "email"], 0.9, "availability");
  }

  function linksAnswer(q) {
    var all = P().links || [], live = links(), t = "";
    var asked = all.filter(function (l) { return set(l.label) && new RegExp(reEsc(String(l.label).toLowerCase())).test(q); });
    if (asked.length) {
      t = asked.map(function (l) { return set(l.url) ? "His " + l.label + " is " + l.url.replace(/^https?:\/\//, "") + "." : l.label + " isn't published on the site yet."; }).join(" ");
    } else if (live.length) {
      t = "You can find " + first() + " on " + list(live.map(function (l) { return l.label + " (" + l.url.replace(/^https?:\/\//, "") + ")"; })) + ".";
    } else {
      t = "No social profiles are published yet — email is the way to go.";
    }
    return A(t, ["socials", "contact"], 0.85, "links");
  }

  function whoAnswer() {
    var p = P(), bio = (p.bio || []).filter(set);
    var t = fullName() + (set(p.handle) ? " (" + p.handle + ")" : "") + " is " + (companyLine() ? "an " + companyLine() : "an IT professional") + " and an AI researcher" + (set(p.location) ? ", based in " + clean(p.location) : "") + ". ";
    if (set(p.tagline)) t += "His one-liner: \"" + clean(p.tagline) + "\" ";
    if (bio[1]) t += "In his own words: \"" + clean(bio[1]) + "\"";
    return A(t, ["about", "experience", "contact"], 0.9, "who");
  }

  function traitsAnswer() {
    var tr = (P().traits || []).filter(function (x) { return set(x.name); });
    if (!tr.length) return null;
    var s = tr.slice().sort(function (a, b) { return b.value - a.value; });
    var low = s[s.length - 1];
    return A("On the site's playful \"embedding readout\" " + first() + " scores " + list(s.slice(0, 3).map(function (x) { return x.name.replace(/_/g, " ") + " " + x.value.toFixed(2); })) + " — and a modest " + low.value.toFixed(2) + " for " + low.name.replace(/_/g, " ") + ". Treat it as a wink, not a benchmark.", ["neofetch", "about"], 0.7, "traits");
  }

  function siteAnswer() {
    return A("This site is GUNR//OS: a static, framework-free page where the terminal is the interface. It's plain JavaScript and CSS, with a three.js particle wallpaper and GSAP for motion, hosted on GitHub Pages. You never have to type — every highlighted word and chip is a button.", ["help", "neofetch", "theme"], 0.85, "site");
  }
  function howtoAnswer() {
    return A("You don't need to know any commands. Tap anything highlighted, use the chips under the prompt, or press Ctrl+K (or the ⌘ button) to search everything. If you like typing: help lists every command, Tab completes, and the arrow keys walk your history.", ["help", "welcome", "contact"], 0.9, "howto");
  }
  function selfAnswer() {
    return A("I'm gunr-gpt, a tiny assistant that runs entirely in your browser. I'm not a real LLM — I match your question to what's in " + first() + "'s profile and answer only from that, so if something isn't there I'll say so instead of guessing. Ask me about his role, experience, research, skills, or how to reach him.", ["about", "help"], 1, "self");
  }
  function handleAnswer() {
    var p = P();
    if (!set(p.handle)) return null;
    return A(p.handle + " is " + first() + "'s handle — it's the name on this site (gunr.dev) and the logo in the corner. The profile doesn't explain it further, so the backstory is one to ask him about.", ["neofetch", "about"], 0.6, "handle");
  }
  function locationAnswer() {
    var p = P();
    if (!set(p.location)) return A("His location isn't published.", ["contact"], 0.5, "location");
    return A(first() + " is based in " + clean(p.location) + ". " + (/carolina|virginia|georgia|new york|florida/i.test(p.location) ? "That's US Eastern time — the date command shows his local time. " : ""), ["date", "contact"], 0.9, "location");
  }

  var SUGGESTIONS = [
    "What does Gunnar do?",
    "How can I contact him?",
    "What AI research has he done?",
    "Does he know Python?",
    "Is he open to collaborating?",
    "What's his experience?",
    "What are his strongest skills?",
    "How does this site work?"
  ];

  function fallback(q) {
    var tech = unknownTech(q);
    if (tech) {
      var best = skills().sort(function (a, b) { return b.level - a.level; }).slice(0, 3);
      return A("I don't see \"" + tech + "\" on " + first() + "'s skills list, so I can't say he knows it — and I'd rather not guess. What is listed at the top: " + list(best.map(function (s) { return s.name; })) + ". For anything else, it's best to ask him directly.", ["skills", "contact"], 0.45, "unknown-skill");
    }
    return A("I don't have that in " + first() + "'s profile, and I'd rather not make something up. I can tell you about his role, experience, AI research, skills, or how to reach him.", ["about", "skills", "contact"], 0.15, "fallback");
  }

  function byIntent(id, q, ctx) {
    switch (id) {
      case "greet": return A("Hi! I'm gunr-gpt. Ask me anything about " + first() + " — what he does, his AI research, his skills, or how to get in touch.", ["about", "contact", "research"], 0.9, id);
      case "thanks": return A("Anytime. If you'd like to keep in touch, Save contact adds " + first() + " to your phone in one tap.", ["vcard", "contact"], 0.9, id);
      case "bye": return A("Thanks for stopping by! One tap on Save contact and you'll have " + first() + "'s details for later.", ["vcard", "share"], 0.9, id);
      case "self": return selfAnswer();
      case "howto": return howtoAnswer();
      case "site": return siteAnswer();
      case "vcard": return A("Tap Save contact (or run vcard) and your phone will offer to add " + fullName() + " with his email, phone and links in one step.", ["vcard", "contact"], 0.95, id);
      case "qr": return A("The qr command shows a QR code for " + String(P().siteUrl || "the site").replace(/^https?:\/\//, "") + " — handy for passing the site to someone next to you.", ["qr", "share"], 0.9, id);
      case "contact": return contactAnswer();
      case "email": return contactAnswer("email");
      case "phone": return contactAnswer("phone");
      case "location": return locationAnswer();
      case "role": return roleAnswer(ctx.previous);
      case "previous": return roleAnswer(true);
      case "company": return ctx.previous ? roleAnswer(true) : companyAnswer();
      case "experience": return experienceAnswer(q);
      case "research": return researchAnswer(ctx.tags);
      case "ai": return aiAnswer();
      case "skills": return ctx.group ? groupAnswer(ctx.group) : skillsAnswer();
      case "education": return educationAnswer();
      case "availability": return availabilityAnswer();
      case "links": return linksAnswer(q);
      case "who": return whoAnswer();
      case "handle": return handleAnswer();
      case "traits": return traitsAnswer();
    }
    return null;
  }

  // Answers from the same family shouldn't be stacked ("email" + "contact").
  var FAMILY = { contact: "c", email: "c", phone: "c", vcard: "c", role: "r", company: "r", previous: "r", who: "r", research: "x", ai: "x", skills: "s", skill: "s" };

  function answer(question) {
    var raw = clean(question);
    if (!raw) return A("Ask me anything about " + first() + " — try one of the suggestions.", ["about", "contact"], 0.3, "empty");
    var q = raw.toLowerCase().replace(/[’']/g, "'").replace(/[?!.,;:]+/g, " ").replace(/\s+/g, " ").trim();

    var sc = score(q);
    var skillHits = findSkills(q);
    var tags = findTags(q);
    var group = findGroup(q);
    var ctx = { tags: tags, group: group, previous: !!sc.previous };

    if (tags.length && sc.research) sc.research += 2;
    if (group && sc.skills) sc.skills += 1;
    if (skillHits.length) {
      sc.skill = 2.8 + (ASK_TECH.test(q) || /\b(does|can|is) (he|gunnar)\b/.test(q) ? 1.6 : 0);
      if (sc.research && tags.length) sc.skill -= 1.2; // "research on RAG" is about research
    }
    if (sc.previous && (sc.company || sc.role || sc.experience || /\bwork/.test(q))) sc.previous += 2;
    if (sc.ai && (sc.research || sc.skills || sc.skill)) delete sc.ai; // the more specific intent wins

    var ranked = Object.keys(sc).sort(function (a, b) { return sc[b] - sc[a]; });
    if (!ranked.length || sc[ranked[0]] < 1.5) return fallback(q);

    var best = ranked[0] === "skill" ? skillAnswer(skillHits) : byIntent(ranked[0], q, ctx);
    if (!best) return fallback(q);

    // A second, clearly different question in the same message gets answered too.
    var second = ranked[1];
    if (second && sc[second] >= 2.8 && (FAMILY[second] || second) !== (FAMILY[best.intent] || best.intent) && best.intent !== "greet") {
      var b = second === "skill" ? skillAnswer(skillHits) : byIntent(second, q, ctx);
      if (b && b.text && b.intent !== best.intent) {
        best = A(best.text + " " + b.text, best.cmds.concat(b.cmds), Math.min(best.confidence, b.confidence), best.intent);
      }
    }
    if (best.intent === "greet" && ranked[1] && sc[ranked[1]] >= 2.5) {
      var g = ranked[1] === "skill" ? skillAnswer(skillHits) : byIntent(ranked[1], q, ctx);
      if (g) best = A("Hi! " + g.text, g.cmds, g.confidence, g.intent);
    }
    return best;
  }

  GOS.gpt = {
    name: "gunr-gpt",
    label: "Runs entirely in your browser · answers come from Gunnar's profile — not a real LLM",
    suggestions: SUGGESTIONS,
    answer: function (q) {
      try { return answer(q); }
      catch (e) {
        if (window.console) console.error("[gunr-gpt]", e);
        return A("Something went wrong on my side. Try asking a different way, or open the contact card.", ["contact", "help"], 0, "error");
      }
    }
  };
})();
