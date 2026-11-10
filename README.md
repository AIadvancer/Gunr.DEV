# GUNR.DEV

Personal site and digital business card for Gunnar Patterson (GUNR): IT Specialist at Moorhead Holdings
and AI researcher. Live at <https://gunr.dev>.

## The idea (v4)

The headline is not an image or a font. A small neural network **learns it live in the visitor's
browser**, and the page draws what the network currently believes as a topographic map: the letters rise
as plateaus, contour lines drift around them, and a readout shows the real step count and loss.

- Visitors can **scramble the weights** and watch it recover, or **teach it their own name**.
- Scrolling into each chapter (Work, Skills, Hello) makes the same network re-learn that word.
- Everything runs on the device. Nothing is sent anywhere.

Below the hero it is a fast, plain HTML page: About, Experience, Skills, Research, Contact.

## Editing your content

All personal content lives in **`js/content.js`** (`window.PROFILE`). Edit it and reload.

- Anything still containing `[[` is a placeholder. Placeholders are hidden from buttons and links and left
  out of the copy, so search the file for `[[` to see what is still unfilled.
- `skills[].items[].level`, `traits[].value` and `experience[].loss` are 0–1 numbers that only drive visuals
  (experience "elevation" is `1 − loss`).
- Research entries without a real `title` show as "Write-up in progress".

## Preview locally

The site needs a web server (it uses a Web Worker). From this folder:

```powershell
powershell -ExecutionPolicy Bypass -File .\serve.ps1
```

Then open <http://localhost:8787/>. Add `?motion=full` or `?motion=reduced` to force a motion mode.

## Files

```
index.html            page shell (sections are filled from content.js)
css/site.css          all styles, two themes: ink (dark) and paper (light)
js/content.js         YOUR CONTENT — the only file you normally edit
js/site.js            renders sections, buttons, scroll motion, theme switch
js/field/worker.js    the neural field trainer (feature grids + MLP, Adam) in a Web Worker
js/field/field.js     turns text into a training target and draws the field with WebGL2
js/vcard.js, qr.js    "Save contact" (.vcf) and QR code helpers
card.html, css/print.css   printable business cards, stickers and QR poster
404.html              not-found page
v2/, v3/              earlier designs, kept viewable (see below)
serve.ps1             local preview server
```

## How the neural field works

- **Model:** 7 multi-resolution feature grids (2 features each, bilinear lookup) feeding a small MLP
  (14 → 16 → 1). About 250k weights on a desktop screen.
- **Target:** the words are drawn to a hidden canvas, turned into a signed distance field, and shaped into
  a height map (letters = plateaus, surroundings = gentle procedural hills).
- **Training:** Adam on random positions, half of each batch sampled near letter edges, in a Web Worker so
  the page never stutters. It stops when the loss plateaus and resumes when the target changes.
- **Drawing:** a WebGL2 fragment shader samples the field and draws contour lines, the filled letters, an
  inline contour, relief shading and a hill under the pointer.
- **Fallbacks:** without WebGL2 or Web Workers the hero shows the name as normal text. With reduced motion
  the network trains before it is shown and the contours hold still.

## Themes and motion

- The round button in the top bar switches **ink** (dark) and **paper** (light). The choice is remembered;
  first-time visitors get their system preference.
- "Motion: on / reduced" in the footer overrides the system reduced-motion setting.

## Printing cards and QR codes

Open `card.html` (linked from the Contact section). The QR codes encode `PROFILE.siteUrl`.

## Earlier designs

| Design | Where | Git tag |
|---|---|---|
| v3 — GUNR//OS terminal | <https://gunr.dev/v3/> | `v3-terminal-os` |
| v2 — Forward Pass | <https://gunr.dev/v2/> | `v2-forward-pass` |

Both share `js/content.js`, so content edits show up there too.

## Deploying

GitHub Pages serves the `main` branch of `AIadvancer/Gunr.DEV` at the custom domain in `CNAME`.
Merging to `main` publishes within a minute or two.

`ASSET_PROMPTS.md` and `assets/` describe optional generated media for the v2 design; v4 draws everything
in code and does not use them (except a future `assets/og.png` link preview).
