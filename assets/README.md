# assets/

Optional generated media for the v2 "Forward Pass" design. **Every file is optional.** The site renders its
particle scene in code and reveals media only after it loads, so a missing file never shows a broken icon.
Keep filenames exact (lower-case, hyphens).

Models, prompts, negative prompts, settings, and ffmpeg / cwebp commands for each file are in
[`../ASSET_PROMPTS.md`](../ASSET_PROMPTS.md). Short version: stills use Qwen-Image-2512 (fallback
FLUX.2 [dev]); loops use Wan 2.2 14B FLF2V with the poster as first and last frame (fallback Wan 2.2
TI2V-5B), in ComfyUI on a 24 GB GPU.

| Priority | File | Size / format | Notes | Budget |
|---|---|---|---|---|
| 1 | `hero-poster.webp` | 1920×1080 WebP | Desktop / landscape poster; frame 0 of the desktop loop. Subject in the right 55%, left 45% pure black. | ≤ 250 KB |
| 2 | `hero-loop.webm` | 1280×720 VP9, 6–8 s, **no audio** | Seamless loop that starts on the poster. | **≤ 3 MB** |
| 2 | `hero-loop.mp4` | 1280×720 H.264 (high, yuv420p), 6–8 s, **no audio**, `+faststart` | Same loop for browsers without VP9. | **≤ 4 MB** |
| 3 | `hero-mobile.webp` | 1080×1920 WebP | Portrait poster; frame 0 of the mobile loop. Subject in the upper half, lower half pure black. | ≤ 200 KB |
| 4 | `hero-loop-mobile.webm` | 720×1280 VP9, **no audio** | Portrait loop. | ≤ 3 MB |
| 4 | `hero-loop-mobile.mp4` | 720×1280 H.264, **no audio**, `+faststart` | Portrait loop. | ≤ 3 MB |
| 5 | `og.png` | 1200×630 PNG | Link preview. Keep text inside the central 1000×520. Turn on the `og:image` / `twitter:image` tags in `index.html` once it exists (ASSET_PROMPTS.md section 6). | ≤ 1 MB |

Loops play only in full motion; reduced-motion visitors and 2g / 3g connections get the poster, and
Save-Data gets neither. The loop is only tried after a poster has loaded, so add the poster first.

The loops ship at 720p on purpose. Wan 2.2 renders 720p natively, and soft footage gains nothing from
upscaling. The posters stay full resolution.

**Pure black is required.** The video is composited with `mix-blend-mode: screen`, so pure black
(`#000000`) is transparent and any grey haze shows as a box. Crush blacks to 0 after adding grain
(ASSET_PROMPTS.md section 4.5) and check the blend at `http://localhost:8787/` via `serve.ps1`.

**Palette for all media:**
- Background: pure black `#000000`
- Light: warm off-white `#EDEAE4`
- Accent: signal orange `#FF5A1F`, tiny glints only (≤ 5% of the frame)
- Never green, cyan or purple neon; no text (except `og.png`), logos, faces or UI.

**Retired v1 slots:** `avatar.webp`, `boot-logo.webp` and `layer-*.webp` (embedding, attention, hidden,
weights, output) are not used by the v2 design. Do not generate them.

Before committing, strip metadata from every file (`exiftool -all= <file>`). After adding a file, reload the
site to confirm it appears.
