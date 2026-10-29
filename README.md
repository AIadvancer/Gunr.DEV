# GUNR.DEV — Forward Pass

A personal networking site and digital business card for Gunnar Patterson (GUNR). The concept is
**Forward Pass**: the visitor is a token run through a neural network. After a short "loading weights"
counter, scrolling carries them through the layers of a model. It starts at **Input** (identity, with
Save Contact / Email / Call / LinkedIn), then moves through **Embedding** (about), **Attention**
(AI research), **Hidden Layers** (experience), and **Weights** (skills). It ends at **Output**
(contact, QR, share). It is static HTML, CSS and JavaScript (ES modules, no build step), built
mobile-first because most visitors arrive by scanning a QR code on a phone.

### Design

Editorial and restrained, with the motion doing the talking:

- **Palette:** warm ink `#0B0B0C` and paper `#EDEAE4`, with one accent, signal orange `#FF5A1F`, used
  sparingly. A faint film grain sits over everything. No neon, no glows, no gradient text.
- **Type:** *Instrument Serif* for big headlines (italic for emphasis), *Geist* for body and UI, and
  *Geist Mono* only for small technical labels, the loader counter and the terminal.
- **Layout:** a 12-column grid, hairline rules instead of boxes, large section numerals `01`–`05`.
- **Motion:** smooth scrolling (Lenis) drives GSAP ScrollTrigger reveals, a pinned horizontal
  experience track and a velocity-reactive skills marquee. A WebGL particle field (Three.js) behind
  the page morphs between a shape for every layer (core, embedding sphere, attention arcs, stacked
  hidden planes, a wave grid, and finally the letters GUNR).
- **Fallbacks:** content, contact buttons and the vCard work without WebGL or if a CDN fails. With
  *reduce motion* turned on, there is no smooth-scroll hijack or pinning and the scene shows one still frame.

---

## Quick start

The site uses ES modules, so it needs a local web server (double-clicking `index.html` no longer works).

1. In PowerShell, from this folder, run:
   ```
   powershell -ExecutionPolicy Bypass -File .\serve.ps1
   ```
2. Open **http://localhost:8787**.
3. Edit **`js/content.js`**, save, and refresh the browser.

**Testing motion:** add `?motion=full` to force the full animations even if your system asks for
reduced motion, or `?motion=reduced` to see the calm version, for example
`http://localhost:8787/?motion=full`. Without the switch, the site follows your OS setting.
The loader shows once per browser tab; open a new tab to see it again.

> Fonts (Google Fonts) and libraries (jsDelivr) load from the internet. When you're offline the
> site falls back to system fonts, skips the 3D scene, and shows the URL as text instead of a QR code.

---

## Edit your content

**Every bit of personal text lives in one file: `js/content.js`** (`window.PROFILE`).

- **Find what's left to fill in:** search the file for `[[`. Each match is a placeholder.
  ```
  email: "[[YOUR EMAIL]]"   ->   email: "you@yourdomain.com"
  ```
  - Search in Notepad / VS Code with Ctrl+F `[[`, or in PowerShell: `Select-String -Path js\content.js -Pattern '\[\['`
- **Anything still containing `[[` counts as unset.** Its button or link is hidden (for example, no Call
  button until `phone` is real). Placeholder text inside sections shows up dimmed so you can spot it.
- Keep the quotes and commas intact. If the page goes blank after an edit, a missing `"` or `,` is the usual cause.
- **`siteUrl`** (the top of the file) is the address that QR codes and Share use. See [Deploy](#deploy-to-github-pages).
- Social/SEO tags in `index.html` (`canonical`, `og:url`, and `og:image`/`twitter:image` once re-enabled) point to
  `https://gunr.dev/`. If you deploy somewhere else, update them too.

| Field | What it drives |
|---|---|
| `email`, `phone`, `links` | Hero buttons, mobile dock, Output layer, vCard, terminal |
| `bio`, `traits` | Embedding layer text + vector readout |
| `research` | Attention cards + heatmap |
| `experience` | Training-log timeline (`event: "fine-tune"` marks the Moorhead Brothers → Holdings transition) |
| `skills` | Weights graph (`level` is 0–1, `note` is the tap-to-read one-liner) |
| `assets` | Not used by the v2 design (kept for compatibility) |

---

## Add a social preview image (optional)

The v2 design draws everything (particle field, grain, type) in code, so it uses **no media files**.
The only image that matters is the link-preview card:

| File | Size | Used by |
|---|---|---|
| `assets/og.png` | 1200×630 PNG | Link previews on LinkedIn, iMessage, Slack, etc. |

After adding it, re-enable the preview tags in `index.html` (the comment above `twitter:card` lists them).
`PROFILE.assets` and the other slots in `ASSET_PROMPTS.md` (avatar, hero loop, layer backdrops, boot emblem)
are not read by the current design; files dropped in for them do nothing.

---

## Terminal easter egg

To open it, press **`` ` ``** (backtick) or tap the **`>_`** button. To close it, type `exit` or press backtick or Esc.
Use ↑/↓ for history and **Tab** to complete. All output comes from `js/content.js`.

| Command | Does |
|---|---|
| `help` (`?`, `man`) | List commands |
| `whoami` · `about` | Identity · bio |
| `research` · `experience` · `skills` | Section summaries |
| `contact` · `socials` | Contact details · links |
| `vcard` | Download the contact card (.vcf) |
| `qr` | Show a QR code for the site |
| `copy email` / `copy url` | Copy to clipboard |
| `goto <layer>` | Jump to `input`, `embedding`, `attention`, `hidden`, `weights`, `output` (aliases like `about`, `skills`, `contact` work too) |
| `theme <signal\|lime\|cyan>` | Swap the accent color: signal orange (default), lime or cyan. Also recolors the 3D particles and is remembered in this browser. The old names `green` and `amber` still work. |
| `ls` · `cat <file>` | Files: `about.txt`, `experience.log`, `skills.json`, `resume.txt`, `contact.vcf`, `research/` |
| `cv` (`resume`) | Same as `cat resume.txt` |
| `nvidia-smi` · `neofetch` | Fake GPU / system readout |
| `matrix` | Digital rain (Ctrl+C stops it) |
| `sudo hire gunnar` | Try it |
| `history` · `echo` · `date` · `pwd` · `cd` · `rm` · `hire` | Shell flavor |
| `clear` (`cls`, Ctrl+L) · `exit` (`quit`, `q`, `close`) | Housekeeping |

---

## Print QR networking cards (`card.html`)

> **Set `siteUrl` in `js/content.js` first.** The QR code encodes `PROFILE.siteUrl`. A card printed
> with the wrong URL can't be fixed later. **Wait to print until the live address (ideally `https://gunr.dev`)
> opens on your phone.**

1. Open **`card.html`** on the live site, or locally at **http://localhost:8787/card.html** (see Quick start).
   The printed designs match the site: name in Instrument Serif, details in Geist and Geist Mono, a single
   signal-orange rule, and the QR code always dark on light with a quiet zone so it scans reliably.
2. Pick a layout:
   - **Business cards**: 3.5 × 2 in, 10-up on US Letter, with crop marks. Choose *front + back (duplex)*,
     *front only*, or *back only*. Use **Shift X/Y (mm)** to line up the back if your printer drifts.
   - **Stickers / badges**: 2 × 2 in, 12-up.
   - **Poster**: one large QR on a full page, for a table or booth.
3. Leave **Ink-friendly** on (black on white with one orange rule). That's the most reliable setup for
   scanning. Turn it off for the dark ink version, and tick **Background graphics** when printing it.
4. Click **Print**. In the print dialog, set **Scale 100% / Actual size**, turn **margins off/default**,
   and pick **double-sided, flip on long edge** for duplex cards.
5. Scan a test print with your phone before you print a full batch.

The page also has buttons for **Download QR as SVG / PNG (1024px)**, **Save contact (.vcf)**, **Copy link**
and a **lock-screen QR** image you can show from your phone.

---

## Deploy to GitHub Pages

Repo: **github.com/AIadvancer/Gunr.DEV**. These steps don't need git.
Upload the **contents** of this folder so `index.html` sits at the top level of the repo, not inside a subfolder.

### Option A: GitHub website only (no installs)

1. Sign in, then open **https://github.com/AIadvancer/Gunr.DEV**.
2. If the repo is empty, click **"uploading an existing file"**. Otherwise click **Add file → Upload files**.
3. Open this project folder in File Explorer, select **everything inside it** (`index.html`, `card.html`,
   `404.html`, `favicon.svg`, `manifest.webmanifest`, the `.md` files, and the **`css`**, **`js`** and **`assets`**
   folders), then drag it all onto the upload area. Chrome and Edge keep the folder structure.
4. Type a commit message such as `Initial site`, then click **Commit changes**.
5. Check that the repo now shows `index.html`, `css/`, `js/` and `assets/` at the top level.
6. Go to **Settings → Pages**. Under **Build and deployment**, set **Source: Deploy from a branch**,
   **Branch: `main`**, folder **`/ (root)`**, then click **Save**.
7. After about 1–2 minutes the site is live at **https://aiadvancer.github.io/Gunr.DEV/**. The path is
   case-sensitive, and the **Actions** tab shows deploy progress.

**To update later:** use **Add file → Upload files** again and drop the changed files into the matching
folder. For `js/content.js`, open the `js` folder in the repo first, or just edit the file in the browser
with the pencil icon. Uploading a file with the same name replaces it. Files can be up to 25 MB each through the web uploader.

### Option B: GitHub Desktop

1. Install **GitHub Desktop** (desktop.github.com) and sign in.
2. **File → Clone repository → AIadvancer/Gunr.DEV**, and pick a local folder.
3. Copy this project's contents into that folder, so `index.html` is at the top level.
4. In GitHub Desktop, enter a summary such as `Initial site`, then click **Commit to main** and **Push origin**.
5. Turn on Pages the same way as Option A, step 6.
6. **To update later:** edit the files in that folder, then commit and push.

### Before you share the github.io link

Until a custom domain is set up, set `siteUrl: "https://aiadvancer.github.io/Gunr.DEV/"` in
`js/content.js` so QR codes and Share point somewhere real. Also note that the 404 page's
"home" links point to `/`, which only works properly once the custom domain is live.

---

## Custom domain: gunr.dev (optional)

Do this only after you own `gunr.dev`. Note that `.dev` domains require HTTPS, and GitHub Pages provides it.

1. **CNAME file:** in the repo, use **Add file → Create new file**, name it `CNAME` (no extension), and
   give it one line containing `gunr.dev`. Commit it. You can also just type the domain in
   **Settings → Pages → Custom domain** and save, which creates the same file.
2. **DNS at your registrar** (for the apex `gunr.dev`):

   | Type | Host | Value |
   |---|---|---|
   | A | `@` | `185.199.108.153` |
   | A | `@` | `185.199.109.153` |
   | A | `@` | `185.199.110.153` |
   | A | `@` | `185.199.111.153` |
   | AAAA | `@` | `2606:50c0:8000::153` |
   | AAAA | `@` | `2606:50c0:8001::153` |
   | AAAA | `@` | `2606:50c0:8002::153` |
   | AAAA | `@` | `2606:50c0:8003::153` |
   | CNAME | `www` | `aiadvancer.github.io` |

   Remove any conflicting parking or forwarding records the registrar added. The IPs above are GitHub's
   published Pages addresses at the time of writing. Double-check them against GitHub's
   "Managing a custom domain for your GitHub Pages site" docs.
3. *(Recommended)* Verify the domain under **GitHub profile Settings → Pages → Add a domain**. This stops anyone else from claiming it.
4. Wait for DNS to propagate (minutes to a few hours). Then **Settings → Pages** should show the DNS check passing.
5. Tick **Enforce HTTPS**. The checkbox becomes available once GitHub has issued the certificate, which can take up to about an hour.
6. Set `siteUrl: "https://gunr.dev"` in `js/content.js`, and make sure the `og:`/`canonical` tags in
   `index.html` match. Re-upload, open **https://gunr.dev** on your phone, and **only then print cards**.

---

## File map

```
index.html            main experience
card.html             printable cards / stickers / poster + QR downloads
404.html              "token not found in vocabulary" page
css/style.css         main styles     css/terminal.css  terminal overlay     css/print.css  card.html
js/content.js         ALL personal content + siteUrl  <- edit this
js/vcard.js  js/qr.js js/boot.js  js/scene.js (WebGL particles)  js/journey.js  js/terminal.js
serve.ps1             local preview server (http://localhost:8787)
assets/               og.png social preview only (optional)
favicon.svg  manifest.webmanifest
```
