/* =============================================================================
 * GUNR.DEV — content.js
 * -----------------------------------------------------------------------------
 * This is the ONLY file that holds personal content. Every page and script
 * (index.html, card.html, the terminal, the vCard, QR codes) reads from
 * window.PROFILE, so editing this file updates the whole site.
 *
 * HOW TO EDIT
 *   1. Search this file for "[[" — every match is a placeholder to fill in.
 *      Replace the whole thing, brackets included:
 *          email: "[[YOUR EMAIL]]"   ->   email: "jake@example.com"
 *   2. Anything still containing "[[" is treated as UNSET: its button/link is
 *      hidden (e.g. no Call button until `phone` is real), while the text shows
 *      dimmed on the page so you can spot what is left.
 *   3. To drop an item entirely, delete its { ... } block (mind the commas).
 *   4. `level`, `value` and `loss` numbers are 0..1 and only drive visuals.
 *   5. Keep it valid JavaScript: strings in double quotes, commas between items.
 *      If the page goes blank after an edit, a missing comma or quote is the
 *      usual culprit (open the browser console to see the line number).
 *
 * Do not change the helper block at the bottom unless you know why.
 * ========================================================================== */

window.PROFILE = {
  /* Public address of the site. Used for QR codes, share links and the vCard.
     Change this if you deploy somewhere other than gunr.dev. */
  siteUrl: "https://gunr.dev",

  handle: "GUNR",
  name: { first: "Gunnar", last: "Patterson" },
  title: "IT Specialist",
  company: "Moorhead Holdings",
  companyNote: "formerly Moorhead Brothers",

  /* One line under the name in the hero. */
  tagline: "Keeping infrastructure up and models learning.",

  location: "Blacksburg, South Carolina",
  email: "jakepatterson@moorheadbros.com",
  phone: "+1 864 737 2456", // any format, e.g. "+1 555 123 4567" — used for tel: links and the vCard

  /* Social / profile links. `icon` is one of: linkedin, github, huggingface,
     x, mail, web. Entries whose url still contains "[[" are hidden. */
  links: [
    { label: "LinkedIn", url: "[[https://www.linkedin.com/in/your-profile]]", icon: "linkedin" },
    { label: "GitHub", url: "https://github.com/AIadvancer", icon: "github" },
    { label: "Hugging Face", url: "[[https://huggingface.co/your-username]]", icon: "huggingface" }
  ],

  /* About section — one string per paragraph.
     [[REVIEW: paragraphs 1–2 are a starting draft; confirm the duties and research interests match you.]] */
  bio: [
    "I'm Gunnar J. Patterson, an IT Specialist at Moorhead Holdings, the company formerly known as Moorhead Brothers. My day job is the unglamorous work that makes everything else possible: keeping people connected, systems patched, data backed up and the help desk queue moving.",
    "Alongside that I've spent years researching AI — reading papers, training and evaluating models, and building practical tools on top of them. I'm most interested in where the two worlds meet: using machine learning to make real IT operations faster, safer and easier to run.",
    "[[Optional third paragraph — what you're working on right now, or what you'd like to talk about.]]"
  ],

  /* Embedding readout in the About layer: playful "dimensions" of you, 0..1. */
  traits: [
    { name: "curiosity", value: 0.93 },
    { name: "uptime", value: 0.99 },
    { name: "signal_to_noise", value: 0.87 },
    { name: "patience_with_printers", value: 0.42 },
    { name: "late_night_training_runs", value: 0.81 },
    { name: "documentation", value: 0.76 }
  ],

  /* AI research — projects, papers, experiments.
     `attends` lists skill names (exactly as written in `skills` below) that the
     attention heatmap highlights when this card is hovered/tapped. */
  research: [
    {
      title: "[[Research project title — e.g. Local LLM assistant for IT help desk triage]]",
      summary: "[[One or two sentences: the question you explored, what you built, and what you found.]]",
      tags: ["LLMs", "RAG", "Evaluation"],
      year: "[[YYYY]]",
      link: "[[https://github.com/AIadvancer/your-repo]]",
      attends: ["Python", "RAG & embeddings", "Prompting & evals", "Microsoft 365 & Entra ID"]
    },
    {
      title: "[[Research project title — e.g. Fine-tuning small models on consumer GPUs]]",
      summary: "[[One or two sentences on the method, the hardware, and the result.]]",
      tags: ["Fine-tuning", "PyTorch", "Local inference"],
      year: "[[YYYY]]",
      link: "[[https://...]]",
      attends: ["PyTorch", "LLM fine-tuning", "Local GPU inference", "Python"]
    },
    {
      title: "[[Research project title — e.g. Anomaly detection on network and sign-in logs]]",
      summary: "[[One or two sentences on the data, the approach, and what it caught.]]",
      tags: ["Security", "Anomaly detection", "Logs"],
      year: "[[YYYY]]",
      link: "[[https://...]]",
      attends: ["Python", "Networking", "Identity & MFA", "Monitoring & alerting"]
    }
  ],

  /* Experience, OLDEST FIRST (rendered as epoch 01, 02, ...).
     `end: "present"` marks a current role. `event: "fine-tune"` styles an entry
     as a fine-tune of the previous epoch (used for the company rename).
     `loss` (0..1, optional) sets the point on the falling loss curve. */
  experience: [
    {
      org: "Moorhead Brothers",
      role: "IT Specialist",
      start: "[[YYYY]]",
      end: "[[YYYY]]",
      summary: "Supported day-to-day IT across the business — users, devices, network and the systems everyone depends on.",
      highlights: [
        "[[Highlight — e.g. Rolled out a new endpoint management setup across N devices]]",
        "[[Highlight — e.g. Cut average help desk resolution time by X%]]",
        "[[Highlight — e.g. Built PowerShell automation for onboarding/offboarding]]"
      ],
      loss: 0.78
    },
    {
      org: "Moorhead Holdings",
      role: "IT Specialist",
      start: "[[YYYY]]",
      end: "present",
      summary: "Same mission, new weights: carrying the IT environment through the transition from Moorhead Brothers to Moorhead Holdings.",
      highlights: [
        "[[Highlight — e.g. Migrated identities, mail and domains to the new organization]]",
        "[[Highlight — e.g. Standardized security baselines across sites]]",
        "[[Highlight — e.g. Introduced AI tooling to speed up internal support]]"
      ],
      event: "fine-tune",
      loss: 0.34
    },
    {
      org: "Indipendent/Student Clemson University",
      role: "AI Researcher",
      start: "2021",
      end: "2026",
      summary: "In early 2021, I started using AI to assist with basic tasks and college enrolment tracking however that was just the start to many years of AI application and research",
      highlights: [
        "Late 2021 (Pre College): Trained and evaluated a Basic NLP by fine tuning the early BERT-base model on rented equipment",
        "2022 (during college):  Used Python that I learned at Clemson to build basic machine learning pipelines—running linear regressions, decision trees, or K-Nearest Neighbors (KNN) to predict outcomes on simple datasets "
      ],
      loss: 0.12
    }
  ],

  /* Skills, grouped. `level` 0..1 is the "weight" bar; `note` is the one-liner
     shown when a node is tapped. */
  skills: [
    {
      group: "IT Infrastructure",
      items: [ // edit to match you  [[REVIEW: confirm skills list and levels]]
        { name: "Windows Server & Active Directory", level: 0.85, note: "Domains, group policy, file and print — the backbone." },
        { name: "Microsoft 365 & Entra ID", level: 0.82, note: "Tenants, licensing, mail flow and identity." },
        { name: "Networking", level: 0.75, note: "TCP/IP, DNS, DHCP, VLANs, Wi-Fi and VPN." },
        { name: "Endpoint management", level: 0.78, note: "Imaging, deployment and keeping a fleet consistent." },
        { name: "Backup & recovery", level: 0.72, note: "Tested backups, because untested ones are wishes." },
        { name: "Virtualization", level: 0.65, note: "Hypervisors and VMs for servers and labs." }
      ]
    },
    {
      group: "AI / ML",
      items: [ // edit to match you  [[REVIEW: confirm skills list and levels]]
        { name: "Python", level: 0.84, note: "The glue for data, models and automation." },
        { name: "PyTorch", level: 0.72, note: "Training loops, custom models, experiments." },
        { name: "LLM fine-tuning", level: 0.70, note: "Adapting open models to narrow tasks (LoRA and friends)." },
        { name: "RAG & embeddings", level: 0.76, note: "Grounding models in real documents with vector search." },
        { name: "Prompting & evals", level: 0.80, note: "Measuring whether it actually works, not just vibes." },
        { name: "Local GPU inference", level: 0.74, note: "Running models on your own hardware, quantized and fast." }
      ]
    },
    {
      group: "Security",
      items: [ // edit to match you  [[REVIEW: confirm skills list and levels]]
        { name: "Identity & MFA", level: 0.80, note: "Strong sign-in is the cheapest security win there is." },
        { name: "Patch management", level: 0.78, note: "Staying current without breaking Monday morning." },
        { name: "Endpoint protection", level: 0.72, note: "EDR/AV policy, alerts and response." },
        { name: "Least privilege", level: 0.70, note: "Right access, right people, nothing extra." },
        { name: "Monitoring & alerting", level: 0.66, note: "Knowing something broke before users do." }
      ]
    },
    {
      group: "Dev",
      items: [ // edit to match you  [[REVIEW: confirm skills list and levels]]
        { name: "PowerShell", level: 0.82, note: "Automating the repetitive parts of IT." },
        { name: "JavaScript / HTML / CSS", level: 0.68, note: "Front ends like this one — no framework required." },
        { name: "Git & GitHub", level: 0.74, note: "Version everything, including the configs." },
        { name: "REST APIs", level: 0.70, note: "Wiring services together and scripting against them." },
        { name: "SQL", level: 0.60, note: "Querying the data the business actually runs on." }
      ]
    }
  ],

  /* Shown in the Output / contact layer. */
  availability: "Open to collaborating on applied AI and IT projects",

  /* Optional media. Missing files are fine — the site falls back to CSS/canvas
     visuals and only shows media that loads. See assets/README.md. */
  assets: {
    avatar: "assets/avatar.webp",
    heroPoster: "assets/hero-poster.webp",
    heroLoop: "assets/hero-loop.mp4",
    heroLoopWebm: "assets/hero-loop.webm",
    heroMobile: "assets/hero-mobile.webp",
    heroLoopMobile: "assets/hero-loop-mobile.mp4",
    heroLoopMobileWebm: "assets/hero-loop-mobile.webm",
    bootLogo: "assets/boot-logo.webp",
    og: "assets/og.png",
    layers: {
      embedding: "assets/layer-embedding.webp",
      attention: "assets/layer-attention.webp",
      hidden: "assets/layer-hidden.webp",
      weights: "assets/layer-weights.webp",
      output: "assets/layer-output.webp"
    }
  }
};

/* Convenience alias for scripts that only need the URL. */
window.SITE_URL = window.PROFILE.siteUrl;

/* =============================================================================
 * Shared helpers (not content). Available everywhere as window.GUNR_UTIL.
 * ========================================================================== */
window.GUNR_UTIL = (function () {
  "use strict";

  /* True when a value is real content: not null/empty and not a [[placeholder]]. */
  function isSet(value) {
    if (value === null || value === undefined) return false;
    if (typeof value === "number") return !isNaN(value);
    if (typeof value === "boolean") return value;
    var s = String(value).trim();
    return s.length > 0 && s.indexOf("[[") === -1;
  }

  var ESC_MAP = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

  /* HTML-escape for safe use in text and quoted attributes. */
  function esc(value) {
    if (value === null || value === undefined) return "";
    return String(value).replace(/[&<>"']/g, function (ch) { return ESC_MAP[ch]; });
  }

  /* "Jake Patterson" */
  function fullName(profile) {
    var p = profile || window.PROFILE || {};
    var n = p.name || {};
    return [n.first, n.last].filter(isSet).join(" ");
  }

  /* "tel:" href from any human-formatted number, or "" if unset. */
  function telHref(phone) {
    if (!isSet(phone)) return "";
    var digits = String(phone).replace(/[^\d+]/g, "");
    return digits ? "tel:" + digits : "";
  }

  return { isSet: isSet, esc: esc, fullName: fullName, telHref: telHref };
})();
