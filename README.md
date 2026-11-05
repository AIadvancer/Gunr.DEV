# GUNR.DEV — GUNR//OS

A personal networking site and digital business card for Gunnar Patterson (GUNR), built as
**GUNR//OS**: the whole site is a command prompt on a heavily customised Linux desktop. Think Hyprland
tiling windows, a starship-style powerline prompt, a waybar status bar, a rofi-style command palette and
a btop dashboard, all over a live WebGL particle wallpaper.

You don't need to know any commands to use it. **Everything is clickable**: highlighted words, the buttons
under each answer and the chips at the bottom of the screen all run commands for you. Typing is optional.
Most visitors arrive on a phone by scanning a QR code, so **Save contact** is one tap from landing.

It is static HTML, CSS and JavaScript (no build step), hosted on GitHub Pages.

### Design

- **Centrepiece:** the `gsh` terminal. A two-line powerline prompt (`guest@gunr`, current folder,
  branch, last exit status and duration), live syntax highlighting while you type (known commands green,
  unknown red), fish-style ghost suggestions, a gliding block caret, and Warp-style output blocks with
  re-run, copy and collapse actions.
- **Desktop:** windows tile automatically (one full, two side by side, three or more stacked) and spring
  into place. On phones the terminal is full-screen and every other window is a bottom sheet you can
  swipe down.
- **Apps:** each command has its own presentation: a neofetch logo card, a yazi-style research browser,
  a `git log --graph` experience timeline, a btop-style skills dashboard, and a contact card with QR code.
- **Type:** *JetBrains Mono* for the terminal, *Geist* for window chrome, *Instrument Serif* for the
  login clock.
- **Fallbacks:** every library is optional. Without GSAP, animations become CSS transitions; without
  WebGL there is no particle wallpaper; without the QR library the URL shows as text. Content and contact
  buttons always work, and the **Plain view** shows everything as a simple page.

---

## Using the site (for visitors)

1. **Tap anything highlighted.** Words in the output, the buttons under each answer and the chips at the
   bottom (on phones) all run commands. Every answer ends with suggestions for what to do next.
2. **Prefer typing?** Click the prompt (or tap the **⌨ Type** chip on a phone), type a command such as
   `help`, and press Enter. Tab or → accepts the grey suggestion; ↑/↓ walk through history.
3. **Search everything:** press **Ctrl+K** (⌘K on Mac) or the **⌘** button to open the command
   palette, then type a few letters and press Enter.
4. **Just want to read?** Use **Plain view** in the status bar (or the skip link, or type `plain`) for
   the whole profile as an ordinary web page.
5. **Workspaces:** the numbered pills in the status bar (`~ about research work skills contact`) jump
   straight to each section, and the particle wallpaper changes shape with them. Alt+1 to Alt+6 work too.

### Keyboard shortcuts

| Keys | Does |
|---|---|
| Enter | Run the command |
| Tab / → / End | Accept the suggestion (Tab with several matches shows them as chips) |
| ↑ / ↓ | Command history (the last 50 are remembered in this browser) |
| Ctrl+K / ⌘K | Command palette |
| Ctrl+L | Clear the terminal |
| Ctrl+C | Cancel (prints `^C`) |
| Ctrl+U | Clear the line |
| Alt+1 … Alt+6 (⌥ on Mac) | Switch workspace |
| Alt+Shift+W | Close the focused window |
| Ctrl+Shift+F | Maximize the focused window |
| Esc | Close the focused window (un-maximizes first), a sheet or the palette |

---

## Commands

Type `help` for this list in the site, `man <command>` for details on one, and `help fun` for the hidden
extras. Aliases are in parentheses.

**Start**

| Command | Does |
|---|---|
| `help` | All commands, grouped and clickable |
| `welcome` | The friendly guide card shown at landing |
| `man <cmd>` | Usage and details for one command |

**Profile**

| Command | Does |
|---|---|
| `about` (`whoami`) | Bio, streamed like an AI answer, with clickable key phrases |
| `neofetch` (`fetch`) | Logo plus system-style info: role, company, location, uptime, theme |
| `research` (`projects`) | Opens the research browser: list, preview, and "attends" skill meters (j/k or arrows, Enter opens) |
| `experience` (`work`, `git log`) | Experience as a `git log --graph` timeline; tap a commit for highlights |
| `skills` (`btop`, `htop`, `top`) | btop-style skills dashboard with meters and a filterable list |
| `contact` | Contact card: email, phone, links with copy buttons, QR code, **Save contact**, Share |
| `vcard` (`save`) | Download the contact card (.vcf) |
| `email` · `call` | Start an email or a phone call |
| `qr` | QR code for the site |
| `socials` (`links`) | All links |
| `share` | Share the site (or copy the link) |
| `ask [question]` (`gpt`, `chat`) | Ask **gunr-gpt** about Gunnar. With a question it answers in the terminal; without one it opens a chat window |

gunr-gpt runs entirely in the browser and answers only from `js/content.js`. It is not a real language
model, says so, and never makes facts up.

**System**

| Command | Does |
|---|---|
| `ls [path]` · `cd` · `pwd` · `tree` | Browse the virtual file system built from your profile |
| `cat <file>` · `open <file>` | Read a file, or open it (`open ~/contact.vcf` downloads the vCard, `open ~/card.html` opens the card page) |
| `clear` · `history` | Housekeeping |
| `theme [name]` | Switch theme; with no name, shows live previews of every theme |
| `motion [on\|off\|status]` | Full or reduced animation |
| `sfx [on\|off]` | Subtle synthesized sound effects |
| `plain` | Switch to Plain view |
| `print` | Open `card.html` |
| `date` · `uptime` · `echo` | Shell flavour |
| `exit` | Close the focused window |
| `sudo hire gunnar` | Try it |

Files in the virtual file system: `~/README.md`, `~/about.md`, `~/research/<name>.md`,
`~/experience/<name>.log`, `~/skills.json`, `~/contact.vcf`, `~/links/<name>.url`, `~/card.html`.

**Fun** (`help fun`): `matrix`, `nvidia-smi`, `ping gunr.dev`, `cowsay <text>`, `rm -rf /`, `coffee`, `hack`.

---

## Quick start (local preview)

The site needs a local web server (double-clicking `index.html` does not work).

1. In PowerShell, from this folder, run:
   ```
   powershell -ExecutionPolicy Bypass -File .\serve.ps1
   ```
2. Open **http://localhost:8787**.
3. Edit **`js/content.js`**, save, and refresh the browser. The server sends `no-store`, so a plain refresh
   always shows your latest edit.

The boot and login animation plays once per browser tab. Open a new tab to see it again.

> Fonts (Google Fonts) and libraries (jsDelivr) load from the internet. When you're offline the site
> falls back to system fonts, skips the particle wallpaper and animations, and shows the URL as text
> instead of a QR code.

---

## Edit your content

**Every bit of personal text lives in one file: `js/content.js`** (`window.PROFILE`). The terminal, every
app window, gunr-gpt, the Plain view, the vCard, `card.html` and the QR codes all read from it.

- **Find what's left to fill in:** search the file for `[[`. Each match is a placeholder.
  ```
  email: "[[YOUR EMAIL]]"   ->   email: "you@yourdomain.com"
  ```
  - Search in Notepad / VS Code with Ctrl+F `[[`, or in PowerShell: `Select-String -Path js\content.js -Pattern '\[\['`
- **Anything still containing `[[` counts as unset.** Its button or link is hidden (for example, no `call`
  button until `phone` is real). Placeholder text inside output shows dimmed or is skipped.
- Keep the quotes and commas intact. If the page goes blank after an edit, a missing `"` or `,` is the usual cause
  (the browser console, F12, shows the line number).
- **`siteUrl`** (the top of the file) is the address that QR codes and Share use. See [Deploy](#deploy-to-github-pages).
- Social/SEO tags in `index.html` (`canonical`, `og:url`, and `og:image`/`twitter:image` once enabled) point to
  `https://gunr.dev/`. If you deploy somewhere else, update them too.

| Field | What it drives |
|---|---|
| `handle`, `name`, `title`, `company`, `location`, `tagline` | Prompt, neofetch, contact card, Plain view, vCard |
| `email`, `phone`, `links` | `contact`, `email`, `call`, `socials`, the welcome buttons, vCard, `~/links/` |
| `bio`, `traits`, `availability` | `about`, `~/about.md`, gunr-gpt |
| `research` | `research` browser, `~/research/`, gunr-gpt |
| `experience` | `experience` timeline (`event: "fine-tune"` marks the Moorhead Brothers → Moorhead Holdings rename), `~/experience/` |
| `skills` | `skills` dashboard (`level` is 0–1, `note` shows when a skill is selected), `~/skills.json`, gunr-gpt |
| `assets` | Optional desktop wallpaper media (see below) |

---

## Themes, motion, sound

- **Themes:** `gunr` (default: warm ink `#0B0B0C`, paper `#EDEAE4`, signal orange `#FF5A1F`),
  `tokyo-night`, `catppuccin`, `gruvbox`, `nord`, `rose-pine` and `matrix`. Switch with `theme <name>`, the
  theme dot in the status bar, or `theme` alone for live previews. The switch sweeps across the screen in a
  circle from where you clicked, the particle wallpaper recolors to match, and the choice is remembered in
  the browser (`gos.theme`; the 404 page uses it too).
- **Motion:** by default the site follows the operating system's *reduce motion* setting. The status-bar
  **Motion** switch or `motion on|off` overrides it and is remembered. Reduced motion means no boot
  animation, no auto-typing or streaming (output appears at once), fades instead of springs, and a calm
  ambient wallpaper.
  - **Testing:** add `?motion=full` or `?motion=reduced` to the URL, for example
    `http://localhost:8787/?motion=full`.
- **Sound:** off by default. `sfx on` or the status-bar toggle turns on very quiet synthesized sounds (key
  ticks, Enter, window pops). There are no audio files.

## Plain view

A simple, readable page with the whole profile (name, role, contact buttons including Save contact, bio,
research, experience, skills, links) and a **Back to terminal** button. Reach it from the status bar, the
`plain` command or the skip link. Visitors without JavaScript see it automatically, and it is what search
engines index.

---

## Desktop wallpaper media (optional)

Behind the windows sits the WebGL particle wallpaper (`js/scene.js`), which changes shape with each
workspace. On top of it you can add an optional animated wallpaper: the hero poster and loop slots from
`PROFILE.assets` (`heroPoster`, `heroLoop`, `heroLoopWebm` and the mobile variants). They are
screen-blended over the particles, so **pure black in the media stays invisible**. Videos play only in
full motion and never on Save-Data or slow connections; nothing breaks when the files are missing.

**`ASSET_PROMPTS.md` still applies**: generate the files exactly as described there; in v3 they become the
desktop wallpaper instead of the hero. The link-preview image `assets/og.png` (1200×630) is also optional;
after adding it, enable the preview tags in `index.html`.

---

## The v2 archive

The previous design, **Forward Pass** (scroll through the layers of a neural network), is kept at
**`/v2/`** (`v2/index.html`, with its own `v2/css` and `v2/js`; it shares `js/content.js`, `js/vcard.js`,
`js/qr.js` and `card.html` with v3). The exact v2 source is also tagged in git as **`v2-forward-pass`**:

```
git checkout v2-forward-pass
```

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
   `404.html`, `favicon.svg`, `manifest.webmanifest`, the `.md` files, and the **`css`**, **`js`**, **`v2`** and **`assets`**
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
index.html            GUNR//OS (the desktop, terminal and Plain view markup)
card.html             printable cards / stickers / poster + QR downloads
404.html              self-contained "gsh: no such file or directory" page
css/os.css            desktop, windows, terminal, status bar, palette, themes
css/apps.css          command outputs and app windows      css/print.css   card.html
js/content.js         ALL personal content + siteUrl  <- edit this
js/os/gos.js          kernel: event bus, command registry, motion, storage, helpers (loads first)
js/os/term.js         the gsh terminal (prompt, input, blocks, chips)
js/os/wm.js           tiling window manager + mobile bottom sheets
js/os/palette.js      Ctrl+K command palette
js/os/gpt.js          gunr-gpt (offline, answers from content.js)
js/os/commands.js     every command
js/os/desktop.js      boot/login, status bar, workspaces, themes, sfx, wallpaper, Plain view (loads last)
js/scene.js           WebGL particle wallpaper     js/vcard.js  js/qr.js   shared with card.html and v2
v2/                   archived v2 "Forward Pass" design (served at /v2/)
serve.ps1             local preview server (http://localhost:8787)
assets/               optional media: og.png, wallpaper poster/loops (see ASSET_PROMPTS.md)
favicon.svg  favicon.ico  manifest.webmanifest  CNAME
```
