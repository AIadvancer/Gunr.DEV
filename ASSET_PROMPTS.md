# ASSET_PROMPTS.md — generating the GUNR.DEV media locally

Guide for making every optional media file in `assets/` on a local 24 GB GPU.

**All of these files are optional.** Every slot has a CSS or canvas fallback. The site shows a file only
after it loads (`onload` / `canplay`), so a missing file never shows a broken image. Add the files one at a
time, in the priority order below, and reload after each one.

Model information was checked in late October 2026 against the pages listed under
[Sources](#sources-verified-oct-2026). These models change fast. Before downloading 40 GB of weights, check
the model card and the current ComfyUI template.

---

## 0. Which assets matter most

| # | Asset | Why |
|---|---|---|
| 1 | `hero-poster.webp` | First thing every visitor sees. It is also the start frame of the loop. |
| 2 | `hero-loop.mp4` | The "alive" moment on desktop and Wi-Fi phones. It is skipped on reduced-motion and Save-Data. |
| 3 | `hero-mobile.webp` | About 90% of visitors arrive by QR on a phone, so this is the hero they will actually see. |
| 4 | `og.png` | The preview card when the link is pasted into LinkedIn, iMessage, Slack, and similar apps. |
| 5 | `boot-logo.webp` | The GUNR emblem on the boot screen. |
| 6 | `avatar.webp` | Optional. Make it only if you want a face on the card. |
| 7 | `layer-*.webp` (×5) | Subtle texture at about 25% opacity. Least noticeable, so do these last. |

If you only have one evening, make 1, 2 and 3.

---

## 1. Toolchain and model picks (24 GB VRAM)

Use **ComfyUI** (portable Windows build or ComfyUI Desktop). It has official native templates for every
model below and handles weight offloading to system RAM automatically. Update ComfyUI before loading a new
template. Aim for 64 GB of system RAM if you can, because offloading uses it.

### Image: primary — **Qwen-Image-2512** (20B MMDiT, Apache 2.0)

- **Why this one:** the fp8 build fits a 24 GB card. It renders text reliably, which matters for the GUNR
  emblem and the OG card. It uses real CFG, so **negative prompts work normally**. Its Apache 2.0 license
  is the least restrictive of the options here.
- **Files (Comfy-Org repack):**
  - `qwen_image_2512_fp8_e4m3fn.safetensors` goes in `models/diffusion_models/` (about 20 GB).
  - `qwen_2.5_vl_7b_fp8_scaled.safetensors` goes in `models/text_encoders/`.
  - `qwen_image_vae.safetensors` goes in `models/vae/`.
  - Comfy's tests on a 24 GB RTX 4090D used about 86% of VRAM.
- **If you hit out-of-memory errors**, use a GGUF Q6_K or Q5_K_M build through the ComfyUI-GGUF loader.
- **Native resolutions:** use these, then upscale and crop (see section 3).

  | Aspect | Size |
  |---|---|
  | 1:1 | 1328×1328 |
  | 16:9 | 1664×928 |
  | 9:16 | 928×1664 |

- **Settings:**
  - The official example uses 50 steps and `true_cfg_scale` 4.0.
  - In ComfyUI, use KSampler with steps 40–50, CFG 4.0, sampler `euler`, scheduler `simple`.
  - Leave the `ModelSamplingAuraFlow` shift at the template default.
  - Fast drafts: the 4-step Lightning LoRA path in the template, at **CFG 1.0**. At CFG 1 the negative
    prompt is ignored, so use it only to explore compositions, then re-render the keeper at full steps.
- **Seeds:** fix the seed once you like a composition. Then change one prompt phrase at a time. Keep a
  `seeds.txt` with *filename, seed, steps, cfg*.

### Image: fallback — **FLUX.2 [dev]** (32B rectified-flow transformer, FLUX Non-Commercial license)

- **Strengths:** best-in-class photoreal detail and multi-reference editing (up to 10 reference images).
- **Fitting it into 24 GB:**
  - BFL's repo says full precision needs an H100-class GPU.
  - On 24 GB, use the Comfy `flux2_dev_fp8mixed.safetensors` with ComfyUI weight offload, or a GGUF
    Q4_K_M / Q5_K_M build.
  - Keep the large Mistral-3-Small text encoder (`mistral_3_small_flux2_*.safetensors`) in fp8 or offloaded.
  - Expect it to be noticeably slower than Qwen-Image.
- **Negative prompts:**
  - FLUX.2 [dev] is **guidance-distilled** (BFL's model table says so).
  - Run it in ComfyUI with **KSampler CFG = 1.0**, and set the strength with the `FluxGuidance` node
    (start at about 4.0). The official example uses guidance 4, 28–50 steps.
  - At CFG 1, the negative-prompt branch is never evaluated, so **a negative prompt does nothing**.
- **What to do instead of a negative prompt:**
  1. Describe what you want in positive terms. For example, write "clean empty dark background, no text"
     as "a clean, empty, matte dark background with only soft light".
  2. Lower the FluxGuidance value (3.0–3.5) if results look over-cooked.
  3. Use a fixed seed and adjust the prompt.
  4. If you really need negatives, the community "NAG" (Normalized Attention Guidance) nodes add
     negative-prompt support to distilled models. Treat them as experimental.
- **Lighter option:** FLUX.2 [klein] 9B is also guidance-distilled, so the same no-negatives rule applies.
  Its "Base" variants are not distilled and do take CFG and negatives.
- **License:** the FLUX Non-Commercial license covers both FLUX.2 [dev] and klein 9B. Have whoever handles
  licensing confirm the terms if the site is tied to business use. Qwen-Image avoids this question.

### Video: primary — **Wan 2.2 I2V-A14B / FLF2V** (MoE, 2×14B experts, Apache 2.0)

- **Version check:** Wan 2.2 is still the newest Wan with downloadable weights. Later Wan versions are
  hosted-only.
- **Files (Comfy-Org `Wan_2.2_ComfyUI_Repackaged`):**
  - `wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors` and `wan2.2_i2v_low_noise_14B_fp8_scaled.safetensors`.
    The fp16 versions are also listed, but **use fp8_scaled on 24 GB**.
  - `wan_2.1_vae.safetensors`
  - `umt5_xxl_fp8_e4m3fn_scaled.safetensors`
- **How it fits on 24 GB:** ComfyUI loads one expert at a time and offloads the other. 1280×720 × 81
  frames fits on 24 GB with that offload. If it runs out of memory, use GGUF Q6/Q5 builds of both experts,
  or render at 960×544 and upscale.
- **Why Wan:** it has a native **First-Last-Frame-to-Video (FLF2V)** workflow. Feed the hero poster as
  *both* the first and last frame, and the clip is a seamless loop that starts exactly on the still image.
- **Negative prompts work** at CFG > 1, and the official pipeline ships a default negative prompt.
- **Settings (Comfy template defaults; confirm in your loaded template):**
  - Two `KSamplerAdvanced` nodes: 20 steps total. The high-noise expert runs steps 0→10 and the low-noise
    expert runs steps 10→20.
  - CFG 3.5, `euler` / `simple`, `ModelSamplingSD3` shift 8.
  - Length **81 frames** (Wan works in 4n+1 frames) at **16 fps**, which gives about 5.06 s.
  - Size 1280×720.
- **Fast path:** the LightX2V / "Lightning" 4-step LoRAs for Wan 2.2 (2+2 steps). These need **CFG 1**, so
  the negative prompt is ignored. Good for previews. Re-render the final clip without them if the motion
  looks rubbery.

### Video: fallback — **Wan 2.2 TI2V-5B** (dense 5B, Apache 2.0)

- **Requirements:** runs comfortably on 24 GB (Comfy says about 8 GB with offload). Native 720p is
  **1280×704** at **24 fps**.
- **Files:** `wan2.2_ti2v_5B_fp16.safetensors` with the new `wan2.2_vae.safetensors`.
- **Limitation:** single-image I2V only, with no first/last-frame node. Make the loop with ping-pong or a
  crossfade (section 4).
- **Settings:** about 30 steps, CFG 5, `uni_pc` or `euler`, length 121 frames (5 s at 24 fps). Negatives
  work.
- **Another option:** **LTX-2.3** (22B, LTX-2 Community License).
  - Its distilled build runs 8 steps at **CFG 1**, so negatives are ignored there.
  - Width and height must be divisible by 32, and frames must be 8n+1.
  - Use it via the ComfyUI LTXVideo nodes, typically fp8 on 24 GB.
  - It also generates audio. Discard the audio here, because the site loop must be silent.

---

## 2. Shared art direction (paste into every prompt)

The site is a near-black blue "terminal running a neural network". The media must **sit behind text**: low
contrast, dark, with most of the frame in deep shadow and a few precise light sources.

- **Background:** near-black with a blue cast, `#05070a` to `#0b1017`. No pure white anywhere. Avoid large
  bright areas.
- **Light colors:**
  - Phosphor green `#39ff9c`: primary glow, edges, signal pulses.
  - Cyan `#00d4ff`: secondary data flow.
  - Amber `#ffb547`: tiny warm accents only, under 5% of the frame.
- **Motifs:** neural-network node graphs, signal pulses along edges, attention matrices, terminal glyphs,
  CRT phosphor bloom, faint scanlines, data-center / server-rack bokeh, circuit traces, GPU silicon
  macro shots.
- **Mood:** calm, precise, cinematic, technical. Not cyberpunk-city neon clutter, not stock-photo
  "hacker in hoodie".
- **Composition rules:**
  - **Desktop hero:** keep the **left 55%** quiet and dark (headline and buttons go there). Put the visual
    weight in the right third.
  - **Mobile hero:** put the visual weight in the **upper 45%**. Keep the lower half dark for text and the
    action dock.
  - **Backdrops:** spread texture evenly with no focal point, because they tile behind reading text.

**Style suffix** (append to positive prompts):

```
cinematic, deep near-black navy background (#05070a), phosphor green (#39ff9c) and cyan (#00d4ff) light, tiny amber (#ffb547) accents, soft CRT phosphor bloom, very subtle scanlines, high dynamic range, low overall brightness, crisp micro-detail, shallow depth of field, volumetric haze, 35mm anamorphic look, clean minimal composition
```

**Base negative prompt** (Qwen-Image, Wan, and other CFG models; useless on FLUX.2 [dev] at CFG 1):

```
text, watermark, signature, logo, letters, words, captions, UI screenshot, people, hands, faces, bright white background, overexposed, blown highlights, high contrast, rainbow colors, magenta, purple neon, red, oversaturated, cluttered, busy, cyberpunk city, skyscrapers, cartoon, anime, illustration, 3d render plastic look, low resolution, blurry, jpeg artifacts, noise, banding, distorted, deformed, frame, border, vignette too strong
```

Remove "text, letters, words, logo" from the negative prompt for the two slots that *should* contain text
(boot logo, OG image).

---

## 3. Per-slot recipes

Common image post-processing uses ffmpeg (Windows build from gyan.dev or BtbN). `cwebp` from Google's
libwebp tools is an alternative.

```bash
# upscale/crop any render to an exact size and encode WebP (quality 78 is a good size/quality point)
ffmpeg -y -i render.png -vf "scale=1920:1080:force_original_aspect_ratio=increase:flags=lanczos,crop=1920:1080" -c:v libwebp -quality 78 -compression_level 6 out.webp
# same with cwebp
cwebp -q 78 -m 6 -resize 1920 1080 render.png -o out.webp
```

For a real 2× upscale before resizing, use an upscale model in ComfyUI (`Load Upscale Model` →
`Upscale Image (using Model)`, e.g. 4x-UltraSharp or 2x real-ESRGAN, then downscale). Plain Lanczos is
fine for the backdrops.

Size targets: hero images ≤ 350 KB, backdrops ≤ 150 KB, avatar ≤ 150 KB, boot logo ≤ 120 KB. Check them
with `dir assets`.

---

### 3.1 `assets/hero-poster.webp` — 1920×1080, also frame 0 of the loop (PRIORITY 1)

**Model and settings:**
- Qwen-Image-2512 at 1664×928, 50 steps, CFG 4.0, euler/simple, fixed seed.
- Render 8–16 seeds at 4-step Lightning first, pick the best composition, then re-render that seed at full
  steps.

**Positive:**
```
A vast dark three-dimensional neural network floating in deep space-like darkness, seen from a low cinematic angle. Hundreds of small glowing nodes connected by thin luminous filaments form layered planes receding into depth, like the layers of a transformer model. Bright phosphor-green signal pulses travel along a few of the connections from left to right, with cyan data streams on secondary paths and two or three tiny warm amber nodes. The densest, brightest cluster sits in the right third of the frame; the left half fades into smooth, nearly black navy shadow with only faint out-of-focus bokeh nodes. Fine atmospheric haze catches the light, faint horizontal CRT scanlines and soft phosphor bloom, ultra clean, elegant, technical and calm. cinematic, deep near-black navy background (#05070a), phosphor green (#39ff9c) and cyan (#00d4ff) light, tiny amber (#ffb547) accents, soft CRT phosphor bloom, very subtle scanlines, high dynamic range, low overall brightness, crisp micro-detail, shallow depth of field, volumetric haze, 35mm anamorphic look, clean minimal composition
```
**Negative:** the base negative prompt.

**FLUX.2 [dev] variant:**
- Same positive, with this appended: "The image contains no text, no people and no logos; large areas
  of clean, matte, near-black background."
- Settings: CFG 1, FluxGuidance 3.5–4, 28–40 steps, `euler`, no negative.

**Post-processing:**
1. Save the full-res PNG as `hero-poster_master.png` and keep it. It is the source for the loop.
2. Run the crop/encode command from section 3 to produce `hero-poster.webp` at 1920×1080.
3. Make the loop start frame:

   ```bash
   ffmpeg -y -i hero-poster_master.png -vf "scale=1280:720:force_original_aspect_ratio=increase:flags=lanczos,crop=1280:720" hero-start_1280x720.png
   ```

4. Check legibility: put the image behind white 48px text at the left and squint. If the text fights the
   image, darken the left side:

   ```bash
   ffmpeg -y -i hero-poster_master.png -vf "geq=lum='lum(X,Y)*(0.55+0.45*X/W)':cb='cb(X,Y)':cr='cr(X,Y)'" hero-darkened.png
   ```

---

### 3.2 `assets/hero-loop.mp4` (+ optional `hero-loop.webm`) — 1280×720, 5–8 s, seamless, no audio, < 4 MB (PRIORITY 2)

**Model and settings:**
- Wan 2.2 14B **FLF2V** template (`WanFirstLastFrameToVideo`).
- `start_image` = `end_image` = `hero-start_1280x720.png`.
- 1280×720, length 81 (16 fps ≈ 5 s). Use 113 frames for ≈ 7 s if VRAM allows.
- 20 steps (10 high + 10 low), CFG 3.5, shift 8, euler/simple, fixed seed.

**Positive** (describe *motion*, not the scene; the image already defines the scene):
```
Slow, calm, continuous motion. The camera drifts very slightly forward and to the left with a gentle parallax between the network layers. Phosphor-green signal pulses travel steadily along the glowing connections from left to right, nodes softly brighten and dim as pulses pass, cyan data streams flicker gently on the secondary paths, fine haze drifts slowly. The scene stays dark and the composition stays the same; smooth, hypnotic, ambient, loopable motion, no cuts.
```
**Negative** (Wan's default negative, in English, plus site-specific items):
```
bright colors, overexposed, static, frozen, blurry details, subtitles, text, watermark, logo, style change, artwork, painting, still picture, overall gray, worst quality, low quality, jpeg artifacts, ugly, deformed, extra objects, people, faces, hands, fast motion, camera shake, flicker, strobing, sudden cuts, scene change, zoom burst, morphing, melting, color shift
```

**Fallback (TI2V-5B or LTX-2.3):**
- Generate plain I2V from the same start image, 1280×704 (TI2V-5B) or 1280×704 / 1280×736 (LTX,
  divisible by 32). Crop or pad to 720 afterwards.
- Make it loop with **ping-pong** or a **crossfade** (below).
- Prompt for *back-and-forth* motion ("nodes pulse and breathe gently") rather than one-way travel, because
  ping-pong reverses it.

**Seamless loop techniques (pick one):**

1. **FLF2V (preferred).** The first and last frames are the same image. Drop the duplicate last frame so
   the seam does not stutter:

   ```bash
   ffmpeg -y -i wan_raw.mp4 -vf "select='lt(n\,80)',setpts=N/FRAME_RATE/TB" -an loop_16fps.mp4   # 81 -> 80 frames
   ```

2. **Ping-pong** (any I2V output). Play forward, then reversed, without repeating the turn-around frames.
   For an N-frame clip, set `end_frame=N-1` (example uses N=81):

   ```bash
   ffmpeg -y -i raw.mp4 -filter_complex "[0:v]split[a][b];[b]reverse,trim=start_frame=1:end_frame=80,setpts=PTS-STARTPTS[r];[a][r]concat=n=2:v=1:a=0[v]" -map "[v]" -an pingpong.mp4
   ```

3. **Crossfade** (one-way motion that cannot reverse). Blend the last 0.75 s into the first. The output is
   shorter by the fade length, and it loops cleanly. Replace 5.06 with your clip length:

   ```bash
   ffmpeg -y -i raw.mp4 -filter_complex "[0:v]split[body][head];[head]trim=0:0.75,setpts=PTS-STARTPTS[h];[body]trim=0.75:5.06,setpts=PTS-STARTPTS[b];[b][h]xfade=transition=fade:duration=0.75:offset=3.56[v]" -map "[v]" -an xfade_loop.mp4
   ```

   Set `offset` = (clip length − 0.75) − 0.75.

**Smoother motion:** 16 fps looks steppy. Interpolate to 32 fps with RIFE in ComfyUI
(`ComfyUI-Frame-Interpolation` → RIFE VFI, multiplier 2) on the 81 raw frames *before* dropping the last
frame (drop the last 2 frames after 2× interpolation). An ffmpeg-only alternative is
`-vf "minterpolate=fps=30:mi_mode=mci"`. It is slower and can warp thin lines, so check the result.

**Encode H.264 MP4 (< 4 MB, silent, fast-start):**
```bash
# two-pass at ~3.2 Mbps: a 7 s clip lands near 2.8 MB. Lower -b:v if the file is still > 4 MB
ffmpeg -y -i loop_final.mp4 -an -c:v libx264 -preset slow -profile:v high -level 4.0 -pix_fmt yuv420p -vf "scale=1280:720:flags=lanczos" -b:v 3200k -maxrate 4000k -bufsize 8000k -pass 1 -f mp4 NUL
ffmpeg -y -i loop_final.mp4 -an -c:v libx264 -preset slow -profile:v high -level 4.0 -pix_fmt yuv420p -vf "scale=1280:720:flags=lanczos" -b:v 3200k -maxrate 4000k -bufsize 8000k -pass 2 -movflags +faststart assets/hero-loop.mp4
# (on macOS/Linux replace NUL with /dev/null)

# simpler single pass alternative (dark, slow footage compresses well):
ffmpeg -y -i loop_final.mp4 -an -c:v libx264 -preset slow -crf 23 -maxrate 4000k -bufsize 8000k -pix_fmt yuv420p -profile:v high -movflags +faststart assets/hero-loop.mp4
```
Dark gradients can band. If they do, add `-tune grain` or a touch of noise before encoding
(`-vf "noise=alls=3:allf=t"`).

**Optional VP9 WebM** (often smaller):
```bash
ffmpeg -y -i loop_final.mp4 -an -c:v libvpx-vp9 -b:v 0 -crf 36 -row-mt 1 -deadline good -cpu-used 2 -pix_fmt yuv420p assets/hero-loop.webm
```

**Checks:**
- `ffprobe -v error -show_entries format=size,duration:stream=codec_name,width,height,r_frame_rate assets/hero-loop.mp4`
  should show h264 at 1280×720, no audio stream, and size under 4194304.
- Frame 0 should match the poster.

---

### 3.3 `assets/hero-mobile.webp` — 1080×1920 vertical (PRIORITY 3)

**Model and settings:**
- Qwen-Image-2512 at 928×1664, 50 steps, CFG 4, the **same seed** as the poster for a family resemblance.
- For a closer match, use **Qwen-Image-Edit-2511** with the poster as input and ask it to "recompose this
  exact scene as a tall 9:16 vertical image".
- Or outpaint the poster's right third vertically.

**Positive:**
```
A tall vertical view of a vast dark three-dimensional neural network floating in deep darkness. Glowing nodes connected by thin luminous filaments form layered planes that rise upward into depth. The brightest, densest cluster of phosphor-green and cyan nodes sits in the upper third of the frame with signal pulses traveling upward along the connections; the lower half fades smoothly into nearly black navy shadow with only a few faint, soft out-of-focus nodes, leaving calm empty space. Fine haze, soft phosphor bloom, faint horizontal scanlines, elegant, technical, calm. cinematic, deep near-black navy background (#05070a), phosphor green (#39ff9c) and cyan (#00d4ff) light, tiny amber (#ffb547) accents, soft CRT phosphor bloom, very subtle scanlines, high dynamic range, low overall brightness, crisp micro-detail, shallow depth of field, volumetric haze, clean minimal composition
```
**Negative:** the base negative prompt.

**Post-processing:**
```bash
ffmpeg -y -i mobile.png -vf "scale=1080:1920:force_original_aspect_ratio=increase:flags=lanczos,crop=1080:1920" -c:v libwebp -quality 74 -compression_level 6 assets/hero-mobile.webp
```
Aim for ≤ 300 KB, because this file is on the phone's critical path.

---

### 3.4 `assets/og.png` — 1200×630 social preview (PRIORITY 4)

**Model and settings:**
- Qwen-Image-2512 at 1664×928 (crop to 1.905:1 afterwards), 50 steps, CFG 4.
- Qwen renders short English text well. You can also generate it text-free and add type in any editor
  (Space Grotesk / JetBrains Mono). That is the most reliable route.

**Positive (with text):**
```
A minimal dark tech title card. Near-black navy background (#05070a) with a faint glowing neural network of phosphor-green and cyan nodes on the right side and very subtle horizontal CRT scanlines. On the left, large bold clean geometric sans-serif text reading "GUNR.DEV" in phosphor green (#39ff9c) with a soft glow, and below it smaller monospace text reading "Jake Patterson // IT Specialist · AI Research" in pale gray-blue (#d8e1ea). A small blinking-cursor block after the text. Balanced margins, crisp typography, sharp, professional, high contrast text on dark background.
```
**Negative:** the base negative prompt **without** "text, letters, words, logo". Add:
`misspelled text, extra letters, garbled characters, duplicated words, cropped text`.

**Post-processing:**
```bash
ffmpeg -y -i og_render.png -vf "scale=1200:630:force_original_aspect_ratio=increase:flags=lanczos,crop=1200:630" -frames:v 1 assets/og.png
```
- Keep the file under about 1 MB (optionally `pngquant --quality 70-90`).
- Keep the important text inside the central 1000×520, because some platforms crop the edges.
- Check every character, and only use facts that are already on the site.

---

### 3.5 `assets/boot-logo.webp` — 1024×1024 GUNR emblem, transparent-friendly (PRIORITY 5)

**Model and settings:** Qwen-Image-2512 at 1328×1328, 50 steps, CFG 4–4.5.

**Positive:**
```
A centered minimalist emblem logo on a pure solid black background. A geometric hexagonal badge made of thin glowing phosphor-green (#39ff9c) vector lines, inside it a stylized neural-network node graph of seven connected nodes that also suggests a crosshair, with one cyan (#00d4ff) node at the center. Below the badge the word "GUNR" in bold, wide, geometric monospace capital letters in phosphor green with a soft CRT glow. Flat vector style, perfectly symmetrical, clean lines, high contrast against pure black, lots of empty black margin around the emblem, no gradient background.
```
**Negative:** the base negative prompt without "text, letters, words, logo". Add:
`photo, 3d, bevel, metallic, gradient background, textured background, grey background, misspelled text, extra letters, asymmetry, clutter`.

**Making it transparent-friendly (pick one):**

- **Keep the pure black background (simplest).** On the boot screen it blends into `#05070a`. With CSS
  `mix-blend-mode: screen`, black disappears on any dark background. Crush near-blacks to true black first:

  ```bash
  ffmpeg -y -i logo.png -vf "scale=1024:1024:flags=lanczos,curves=all='0/0 0.06/0 1/1'" -c:v libwebp -quality 85 assets/boot-logo.webp
  ```

- **Real alpha.** Remove the background in ComfyUI with a BiRefNet / RMBG node, or derive alpha from
  brightness so the glow stays soft:

  ```bash
  ffmpeg -y -i logo.png -filter_complex "[0:v]scale=1024:1024:flags=lanczos,format=rgba,split[c][a];[a]format=gray,curves=all='0/0 0.05/0 0.5/1 1/1'[m];[c][m]alphamerge" -c:v libwebp -quality 90 -lossless 0 assets/boot-logo.webp
  ```

  (libwebp keeps the alpha channel when the input is RGBA.)

---

### 3.6 `assets/avatar.webp` — 1024×1024 stylized portrait (optional, PRIORITY 6)

There are two routes.

**A. Non-identifying stylized avatar (no photo needed).** Qwen-Image-2512 at 1328×1328, 50 steps, CFG 4.

```
A stylized portrait avatar of an anonymous figure rendered entirely as a glowing wireframe made of neural-network nodes and thin luminous filaments, head and shoulders, three-quarter view, phosphor-green (#39ff9c) lines with cyan (#00d4ff) highlights and a single small amber (#ffb547) node near the temple, on a deep near-black navy background (#05070a). Soft CRT bloom, faint scanlines, centered, lots of dark margin so it can be cropped to a circle, elegant, calm, technical.
```
**Negative:** the base negative prompt without "faces". Add `realistic photo of a specific person, celebrity`.

**B. Identity-preserving portrait from a photo of the owner.**

Recommended: **Qwen-Image-Edit-2511** (Apache 2.0, same text encoder and VAE as Qwen-Image; native ComfyUI
template; its main improvement is character and identity consistency).
- Input: one clear, front-lit, recent photo of yourself, roughly shoulders-up, at least 1024 px.
- Steps 40 with CFG 4. Or use its 4-step Lightning LoRA at CFG 1, where negatives are ignored.
- Instruction prompt:

  ```
  Turn this photo into a stylized portrait of the same person, keeping his exact facial features, face shape, hairline, and expression. Head and shoulders, three-quarter view, on a deep near-black navy background (#05070a). Dramatic low-key lighting: a phosphor-green (#39ff9c) rim light on one side and a soft cyan (#00d4ff) rim light on the other, faint holographic neural-network lines and small glowing nodes drifting behind him, subtle CRT scanlines and bloom. Cinematic, sharp eyes, natural skin texture, professional headshot quality.
  ```

- Negative: `different person, changed facial features, distorted face, asymmetrical eyes, extra fingers, plastic skin, cartoon, anime, text, watermark, overexposed, red tint`

Alternatives:
- **FLUX.2 [dev]** multi-reference: give 2–4 photos of yourself as references, CFG 1 with FluxGuidance
  about 4, **no negative prompt**. Phrase the exclusions positively.
- **PuLID / InstantID / IP-Adapter FaceID:** older identity adapters for SDXL and FLUX.1 that still work in
  ComfyUI. Use them only if you already have that stack. The 2511 editor is simpler and usually more
  faithful.

**Consent and likeness:**
- Use only photos **of yourself that you have the right to use**. Do not use other people's photos or
  photos owned by your employer.
- Do everything locally. Do not upload your photo to online generators.
- Strip metadata from source photos and outputs (`exiftool -all= file`). The ffmpeg/cwebp re-encode below
  also drops EXIF.
- The avatar will be public and tied to your name, title and employer. Make sure it is an accurate,
  professional likeness, and check that it matches any company or brand guidance on how staff are pictured.
- Don't generate a likeness of anyone else.

**Post-processing:**
```bash
ffmpeg -y -i avatar.png -vf "scale=1024:1024:force_original_aspect_ratio=increase:flags=lanczos,crop=1024:1024" -c:v libwebp -quality 80 -compression_level 6 assets/avatar.webp
```
The site may crop it to a circle or rounded square, so keep the face centered with margin.

---

### 3.7 Layer backdrops — `assets/layer-*.webp`, 1920×1080 each (PRIORITY 7)

**Shared settings:**
- Qwen-Image-2512 at 1664×928, 40–50 steps, CFG 4. Use **one seed for all five** so they feel like a set.
- These are shown at about 25% opacity behind body text, so render them **dark, flat and low-contrast**.
  No focal point, with even texture edge to edge.

Use this **backdrop suffix** in place of the style suffix:
```
abstract background texture, evenly distributed detail across the whole frame, no focal point, very low contrast, dark and muted, deep near-black navy (#05070a) base, thin dim phosphor-green (#39ff9c) and cyan (#00d4ff) lines, soft haze, subtle scanlines, seamless-feeling, minimal, calm
```
**Negative:** the base negative prompt, plus `focal point, central subject, bright spot, glare, lens flare, sharp contrast`.

| File | Layer | Positive (then add the backdrop suffix) |
|---|---|---|
| `layer-embedding.webp` | 1 · EMBEDDING / About | `a vast field of tiny glowing points suspended in dark 3D space, loosely clustered into soft constellations like a word-embedding vector space, faint thin axis lines and a sparse coordinate grid fading into depth` |
| `layer-attention.webp` | 2 · ATTENTION / Research | `a huge dim grid of softly glowing square cells like an attention heatmap matrix seen at a slight perspective angle, most cells dark, scattered cells faintly lit in green and cyan, thin curved arcs connecting distant cells` |
| `layer-hidden.webp` | 3 · HIDDEN LAYERS / Experience | `many stacked translucent dark glass planes receding into depth, each etched with faint circuit-like node patterns, thin vertical light threads passing through the stacked layers, like the hidden layers of a deep network` |
| `layer-weights.webp` | 4 · WEIGHTS / Skills | `extreme macro of a dark GPU silicon die and circuit board traces, fine copper-like lines rendered in dim green and cyan light, tiny glowing junction points, shallow depth of field` |
| `layer-output.webp` | 5 · OUTPUT / Contact | `many faint converging light streams flowing from the edges toward a soft, barely brighter horizon line, like probability distributions collapsing into one output token, a few tiny amber (#ffb547) sparks among the green and cyan` |

**Post-processing (darken, flatten, encode; target ≤ 150 KB each):**
```bash
ffmpeg -y -i layer_raw.png -vf "scale=1920:1080:force_original_aspect_ratio=increase:flags=lanczos,crop=1920:1080,eq=contrast=0.85:brightness=-0.04:saturation=0.9,gblur=sigma=0.6" -c:v libwebp -quality 70 -compression_level 6 assets/layer-embedding.webp
```
Repeat with each filename. A slight blur helps them sit behind text and shrinks the file a lot.

---

## 4. Final checklist

- [ ] Filenames match exactly (lower-case, hyphens): see `assets/README.md`.
- [ ] Hero poster and loop frame 0 match. The loop has no visible seam, no audio track, is under 4 MB, and
      is encoded with `+faststart`.
- [ ] Every image is dark enough that white body text over it passes a quick squint test.
- [ ] Text in `og.png` and `boot-logo.webp` is spelled correctly and states nothing that isn't already on
      the site.
- [ ] No metadata or personal information is embedded (`exiftool -all=` if unsure). The avatar uses only
      your own photo.
- [ ] Open `index.html` and confirm each asset appears. Then delete one file and confirm the fallback still
      looks good.

---

## Sources (verified Oct 2026)

Model pages:
- Qwen-Image-2512 model card: https://huggingface.co/Qwen/Qwen-Image-2512
- ComfyUI Qwen-Image-2512 tutorial: https://docs.comfy.org/tutorials/image/qwen/qwen-image-2512
- ComfyUI Qwen-Image tutorial (fp8 sizes, 4090D VRAM, Lightning LoRA): https://docs.comfy.org/tutorials/image/qwen/qwen-image
- Qwen-Image-Edit-2511 ComfyUI tutorial: https://docs.comfy.org/tutorials/image/qwen/qwen-image-edit-2511
- FLUX.2 [dev] model card: https://huggingface.co/black-forest-labs/FLUX.2-dev
- FLUX.2 repo (guidance-distillation table, klein variants, licenses): https://github.com/black-forest-labs/flux2
- FLUX.2 announcement (fp8 reference implementation with NVIDIA and ComfyUI): https://bfl.ai/blog/flux-2
- ComfyUI FLUX.2 [dev] tutorial: https://docs.comfy.org/tutorials/flux/flux-2-dev
- Wan 2.2 I2V-A14B model card: https://huggingface.co/Wan-AI/Wan2.2-I2V-A14B
- ComfyUI Wan 2.2 tutorial (I2V, FLF2V, TI2V-5B file names): https://docs.comfy.org/tutorials/video/wan/wan2_2
- LTX-2.3 model card: https://huggingface.co/Lightricks/LTX-2.3

Roundups used for the late-2026 cross-check:
- https://insiderllm.com/guides/local-ai-video-generation/
- https://insiderllm.com/guides/flux-locally-complete-guide/

Some settings are not on the official pages. These include the FLUX.2 [dev] CFG-1/FluxGuidance usage, the
Wan template sampler values, and the Qwen shift. They follow the stock ComfyUI templates, so trust your
loaded template's defaults where they differ.
