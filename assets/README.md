# assets/

Optional generated media. **Every file is optional.** The site has CSS/canvas fallbacks and reveals media
only after it loads, so a missing file never shows a broken icon. Filenames are a contract with
`js/content.js` → `PROFILE.assets`. Keep them exact (lower-case, hyphens).

Models, prompts, negative prompts, settings, and ffmpeg/WebP commands for each file are in
[`../ASSET_PROMPTS.md`](../ASSET_PROMPTS.md). Short version: images use Qwen-Image-2512 (fallback
FLUX.2 [dev]); video uses Wan 2.2 FLF2V (fallback Wan 2.2 TI2V-5B), in ComfyUI on a 24 GB GPU.

| Priority | File | Size / format | Notes | Target weight |
|---|---|---|---|---|
| 1 | `hero-poster.webp` | 1920×1080 WebP | Desktop hero still; also frame 0 of the loop. Keep the left ~55% dark for the headline. | ≤ 350 KB |
| 2 | `hero-loop.mp4` | 1280×720 H.264 (high, yuv420p), 5–8 s, **no audio**, `+faststart` | Seamless loop, starts on the poster. Not loaded on reduced-motion or Save-Data. | **< 4 MB** |
| 2b | `hero-loop.webm` | 1280×720 VP9, no audio | Optional smaller alternate of the same loop. | < 3 MB |
| 3 | `hero-mobile.webp` | 1080×1920 WebP | Vertical hero for phones; visual weight in the top ~45%, dark lower half. | ≤ 300 KB |
| 4 | `og.png` | 1200×630 PNG | Social link preview; keep text inside the central 1000×520. | ≤ 1 MB |
| 5 | `boot-logo.webp` | 1024×1024 WebP | GUNR emblem on **pure black or alpha**, so it works with `mix-blend-mode: screen`. | ≤ 120 KB |
| 6 | `avatar.webp` | 1024×1024 WebP | Stylized portrait, centered with margin (may be cropped to a circle). Only your own photo if identity-based. | ≤ 150 KB |
| 7 | `layer-embedding.webp` | 1920×1080 WebP | Layer 1 backdrop: dark, low-contrast, no focal point (shown at ~25% opacity). | ≤ 150 KB |
| 7 | `layer-attention.webp` | 1920×1080 WebP | Layer 2 backdrop. | ≤ 150 KB |
| 7 | `layer-hidden.webp` | 1920×1080 WebP | Layer 3 backdrop. | ≤ 150 KB |
| 7 | `layer-weights.webp` | 1920×1080 WebP | Layer 4 backdrop. | ≤ 150 KB |
| 7 | `layer-output.webp` | 1920×1080 WebP | Layer 5 backdrop. | ≤ 150 KB |

**Palette for all media:**
- Near-black blue `#05070a` / `#0b1017`
- Phosphor green `#39ff9c` (primary)
- Cyan `#00d4ff` (secondary)
- Amber `#ffb547` (tiny accents only)

Before committing, strip metadata from every file (`exiftool -all= <file>`). After adding a file, open
`index.html` to confirm it appears.
