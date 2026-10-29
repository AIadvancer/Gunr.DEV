# ASSET_PROMPTS.md — generating the GUNR.DEV v2 media locally

How to make every media file in `assets/` for the v2 "Forward Pass" design on a local 24 GB GPU.

**Every file is optional.** The site renders its particle scene in code, and media only appears after it
loads (`onload` / `canplay`), so a missing file never shows a broken image. Add files one at a time, in the
priority order below, and reload after each one.

**Who sees what.** With Windows "Animation effects" off, Chrome reports `prefers-reduced-motion: reduce`.
The site then runs a calm ambient particle loop and shows only the still poster (`hero-poster.webp` /
`hero-mobile.webp`) over it. The video loops play only in full motion: on systems without reduced motion,
or after the visitor turns on the Motion switch (or the `motion on` terminal command). They never load on
Save-Data or 2g/3g connections (Save-Data skips the poster too), and the loop is only tried after a poster
has loaded, so make the poster first.

Model information was re-checked on 29 Oct 2026 against the pages under [Sources](#sources). These models
change fast. Before downloading 40 GB of weights, check the model card and the current ComfyUI template.

---

## 0. Slots and priority

| # | File | Size | Budget | Role |
|---|---|---|---|---|
| 1 | `assets/hero-poster.webp` | 1920×1080 | ≤ 250 KB | Desktop / landscape poster, and frame 0 of the desktop loop |
| 2 | `assets/hero-loop.webm` + `assets/hero-loop.mp4` | **1280×720** (see 0.1) | webm VP9 ≤ 3 MB, mp4 H.264 ≤ 4 MB | 6–8 s seamless loop, no audio, `+faststart` |
| 3 | `assets/hero-mobile.webp` | 1080×1920 | ≤ 200 KB | Portrait poster, and frame 0 of the mobile loop |
| 4 | `assets/hero-loop-mobile.webm` + `assets/hero-loop-mobile.mp4` | **720×1280** | ≤ 3 MB each | Portrait loop, no audio, `+faststart` |
| 5 | `assets/og.png` | 1200×630 | ≤ 1 MB | Link-preview card (LinkedIn, iMessage, Slack) |

**Order of work:** hero poster → desktop loop → mobile poster → mobile loop → og.png. If you only have
one evening, do 1 and 2. Steps 3 and 4 can be cropped from 1 and 2 in minutes (section 5, route B).

**v1 slots are retired.** `avatar.webp`, `boot-logo.webp` and the five `layer-*.webp` backdrops are no
longer used by the v2 design. Their recipes have been removed. Generating them changes nothing.

### 0.1 Resolution decision for the loops

Ship the loops at **1280×720 (desktop) and 720×1280 (mobile)**.
- Wan 2.2 14B renders 720p natively. 1080p does not fit 24 GB at 81 frames.
- Upscaling the video to 1080p adds no real detail to soft, bokeh-heavy footage. It would spend the
  3 MB budget on resolution instead of clean gradients.
- The browser scales the 720p video to fill the hero. With `mix-blend-mode: screen` over the canvas, the
  difference is not visible.

The **posters** stay 1920×1080 / 1080×1920, because a still is judged at full sharpness.

---

## 1. Toolchain and model picks (24 GB VRAM)

Use **ComfyUI** (portable Windows build or ComfyUI Desktop). It has official native templates for every
model below and handles weight offloading to system RAM automatically. Update ComfyUI before loading a new
template. Aim for 64 GB of system RAM if you can, because offloading uses it.

Extra custom nodes: **ComfyUI-Frame-Interpolation** (RIFE VFI) and **ComfyUI-VideoHelperSuite** (Video
Combine). Install them through ComfyUI-Manager. Tools on PATH: `ffmpeg`/`ffprobe` (gyan.dev or BtbN
Windows builds) and `cwebp` (Google libwebp).

### Image: primary — **Qwen-Image-2512** (20B MMDiT, Apache 2.0)

- **Why this one:** the fp8 build fits a 24 GB card. It uses real CFG, so **negative prompts work
  normally**. Its Apache 2.0 license is the least restrictive option here.
- **Files (Comfy-Org repack):**
  - `qwen_image_2512_fp8_e4m3fn.safetensors` goes in `models/diffusion_models/` (about 20 GB). A
    `_bf16` build exists for cards with more VRAM.
  - `qwen_2.5_vl_7b_fp8_scaled.safetensors` goes in `models/text_encoders/`.
  - `qwen_image_vae.safetensors` goes in `models/vae/`.
  - Optional: `Qwen-Image-Lightning-4steps-V1.0.safetensors` in `models/loras/`.
  - Comfy's Qwen-Image tests on a 24 GB RTX 4090D used about 86% of VRAM.
- **If you hit out-of-memory errors**, use a GGUF Q6_K or Q5_K_M build through the ComfyUI-GGUF loader.
- **Native resolutions** (render at these, then upscale and crop):

  | Aspect | Size | Used for |
  |---|---|---|
  | 16:9 | 1664×928 | desktop poster, og.png |
  | 9:16 | 928×1664 | mobile poster |

- **Settings:**
  - Official example: 50 steps, `true_cfg_scale` 4.0.
  - ComfyUI: KSampler steps 40–50, CFG 4.0, sampler `euler`, scheduler `simple`.
  - Leave the `ModelSamplingAuraFlow` shift at the template default.
  - Fast drafts: the 4-step Lightning LoRA path in the template at **CFG 1.0**. At CFG 1 the negative
    prompt is ignored, so use it only to explore compositions, then re-render the keeper at full steps.

### Image: fallback — **FLUX.2 [dev]** (32B rectified-flow transformer, FLUX Non-Commercial license)

- **Strength:** best-in-class photoreal detail. Good for the "scientific macro photograph" look.
- **Files (Comfy tutorial):** `flux2_dev_fp8mixed.safetensors` (diffusion_models),
  `mistral_3_small_flux2_bf16.safetensors` (text_encoders; let ComfyUI offload it), `flux2-vae.safetensors`
  (vae). On 24 GB, rely on weight offload or use a GGUF Q4_K_M / Q5_K_M build. It is noticeably slower than
  Qwen-Image.
- **Negative prompts do not work.** FLUX.2 [dev] is **guidance-distilled** (BFL's model table). Run it with
  **KSampler CFG = 1.0** and set strength with the `FluxGuidance` node (start at about 4.0; the official
  example uses guidance 4 and 28–50 steps). At CFG 1 the negative branch is never evaluated.
- **What to do instead:**
  1. Say what you want in positive terms ("a pure black, empty background" rather than "no clutter").
  2. Lower FluxGuidance to 3.0–3.5 if the result looks over-cooked or too contrasty.
  3. Fix the seed and adjust one phrase at a time.
  4. If you really need negatives, the community NAG (Normalized Attention Guidance) nodes add them to
     distilled models. Treat them as experimental.
- **Lighter option:** FLUX.2 [klein] 9B is also guidance-distilled (same rule). Its "Base" variants are not
  distilled and do take CFG and negatives. The [klein] 4B models are Apache 2.0.
- **License:** FLUX Non-Commercial covers [dev] and the 9B klein models. Have whoever handles licensing
  confirm the terms before using these outputs on a site tied to business use. Qwen-Image avoids the
  question.

### Video: primary — **Wan 2.2 I2V-A14B in FLF2V mode** (MoE, 2×14B experts, Apache 2.0)

- **Version check:** Wan 2.2 is still the newest Wan with downloadable weights. Wan 2.5 / 2.6 are
  hosted-API only, and "Wan 2.7 open weights" download pages are not official releases.
- **Why Wan:** native **First-Last-Frame-to-Video** (`WanFirstLastFrameToVideo`). Feed the poster as
  **both** the first and the last frame, and the clip is a seamless loop that starts exactly on the still.
- **Files (Comfy-Org `Wan_2.2_ComfyUI_Repackaged`):**
  - `wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors` and `wan2.2_i2v_low_noise_14B_fp8_scaled.safetensors`
    in `models/diffusion_models/`. Use **fp8_scaled on 24 GB**, not the fp16 files. (Comfy's tutorial text
    names the T2V files in one step. FLF2V needs the **i2v** pair.)
  - `wan_2.1_vae.safetensors` (the 14B models use the 2.1 VAE).
  - `umt5_xxl_fp8_e4m3fn_scaled.safetensors`.
- **How it fits:** ComfyUI loads one expert at a time and offloads the other. 1280×720 × 81 frames fits on
  24 GB. If it runs out of memory, use GGUF Q6/Q5 builds of both experts, or render at 960×544 and upscale.
- **Settings** (stock template values; trust your loaded template where it differs):

  | Setting | Value |
  |---|---|
  | Samplers | two `KSamplerAdvanced`: high-noise expert steps 0→10, low-noise expert steps 10→20 (20 total) |
  | CFG | 3.5 (negatives work) |
  | Sampler / scheduler | `euler` / `simple` |
  | Shift | `ModelSamplingSD3` shift 8 |
  | Size | 1280×720 desktop, 720×1280 mobile (set in `WanFirstLastFrameToVideo`; the template default is smaller) |
  | Length | **81 frames** at **16 fps** (Wan uses 4n+1 frames) |

- **Fast path:** LightX2V / "Lightning" 4-step LoRAs for Wan 2.2 (2+2 steps). These need **CFG 1**, so the
  negative prompt is ignored. Use them for previews and re-render the final without them if motion looks
  rubbery or flickers.

### Video: fallback — **Wan 2.2 TI2V-5B** (dense 5B, Apache 2.0)

- Runs easily on 24 GB (Comfy says about 8 GB with offload). Native 720p is **1280×704** at **24 fps**.
- Files: `wan2.2_ti2v_5B_fp16.safetensors` with the newer `wan2.2_vae.safetensors`.
- **Limitation:** single-image I2V only, no first/last-frame node. Make the loop with the crossfade or
  ping-pong in section 4.4. Prompt for back-and-forth "breathing" motion so a ping-pong reads naturally.
- Settings: about 30 steps, CFG 5, `uni_pc` or `euler`, length 121 frames (5 s at 24 fps). Negatives work.
- **Another option:** **LTX-2.3** (22B, LTX-2 Community License). Width and height must be divisible by 32,
  frames must be 8n+1, and its distilled build runs 8 steps at **CFG 1** (negatives ignored). It also
  generates audio. Discard it, because the loops must be silent.

---

## 2. Shared art direction (paste into every prompt)

The site is warm off-white type on near-black ink (`#0B0B0C`), with one signal-orange accent. The video is
composited over the particle canvas with **`mix-blend-mode: screen`**. In screen mode, pure black adds
nothing, so **black = transparent**. Any grey haze in the "empty" areas becomes a visible grey box.

**Rules:**
- **Background:** pure black `#000000`. Not navy, not charcoal, no haze in the empty areas.
- **Light:** warm off-white `#EDEAE4`. Sparse signal-orange `#FF5A1F` glints, **≤ 5% of the frame**. The
  site has lime and cyan accent themes too, so keep the orange tiny enough to sit with either.
- **Look:** abstract cinematic macro of a luminous neural network / particle-filament structure. Think
  scientific macro photography and long-exposure light trails: shallow depth of field, soft bokeh, fine
  film grain, slow drifting motion.
- **Desktop composition:** subject in the **right 55%**. The **left 45% is empty black**, because the name
  sits there.
- **Mobile composition:** subject in the **upper 50%**. The **lower half is empty black** for the copy and
  buttons.
- **Never:** text, logos, faces, people, UI, HUD overlays, green / cyan / purple neon, sci-fi clichés, the
  stock "glowing brain".

**Style suffix** (append to every positive prompt):

```
abstract scientific macro photograph, long-exposure light trails, warm off-white light (#EDEAE4) on a pure black background (#000000), a few tiny signal-orange (#FF5A1F) glints, shallow depth of field, soft round bokeh, fine film grain, high dynamic range, deep true blacks, crisp micro-detail in the focal plane, calm, elegant, minimal, cinematic
```

**Composition clause** (add one):

```
DESKTOP: the structure occupies only the right half of the frame; the left 45% of the frame is completely empty pure black.
MOBILE: the structure occupies only the upper half of the frame; the lower half of the frame is completely empty pure black.
```

**Base negative prompt** (Qwen-Image, Wan and other CFG models; does nothing on FLUX.2 [dev] at CFG 1).
It merges Qwen's default negative (translated) with the site rules:

```
text, letters, words, numbers, watermark, signature, logo, UI, HUD, interface, screen, hologram, people, person, face, hands, brain, skull, head silhouette, green, cyan, teal, purple, magenta, neon, blue tint, colored background, grey background, navy background, haze over the background, fog, smoke, gradient background, vignette, lens flare streaks, rainbow, chromatic aberration, oversaturated, overexposed, blown highlights, cluttered, busy, symmetrical, centered composition, circuit board, sci-fi city, cartoon, anime, illustration, 3d render, plastic, low resolution, low quality, blurry everywhere, jpeg artifacts, banding, distorted, AI look, overly smooth, frame, border
```

**FLUX.2 [dev] positive add-on** (replaces the negative):

```
The image is a photograph with no text, no people and no interface elements. Everything outside the light structure is pure, empty, matte black. The only colors are warm off-white and a few very small orange sparks.
```

**Seeds:** draft 8–16 seeds at the fast path, pick a composition, then fix that seed for the full render.
Change one phrase at a time. Keep a `seeds.txt` next to the renders with *file, model, seed, steps, cfg,
prompt version*. Use the **same seed** for the mobile render to keep a family resemblance.

---

## 3. Hero concepts (pick one)

Both concepts read as "a model thinking" without being literal. Each has a still prompt (Qwen-Image) and a
loop prompt (Wan FLF2V). Append the style suffix and one composition clause to each still prompt.

### Concept A — "Attention filaments"

Hundreds of hair-thin light strands sweep in from the frame edge and converge into one bright, dense knot,
like attention heads focusing on a single token.

**Still (Qwen-Image), desktop:**

```
Hundreds of hair-thin luminous filaments of warm off-white light sweep in long, gently curving arcs from the right edge of the frame and converge into a single small, intensely bright knot of tangled light slightly right of center. The strands are sharp where they meet the knot and dissolve into soft round bokeh as they recede in depth. Tiny particles of light drift along the strands like signals in transit, and two or three of them glow signal orange. The knot casts no haze; everything around the strands is pure, empty black.
```

**Still, mobile:** same text, with "sweep down from the top edge" instead of "sweep in from the right edge",
"knot in the upper third of the frame" instead of "slightly right of center", plus the MOBILE clause.

**Loop (Wan FLF2V) positive:**

```
Very slow, calm, continuous motion. The camera pushes in extremely slowly toward the bright knot with a slight parallax between near and far strands. Tiny points of light travel steadily along the filaments toward the knot, the knot breathes gently brighter and dimmer, out-of-focus strands in the foreground drift slowly. The background stays pure black and the composition stays the same. Smooth, hypnotic, ambient, one continuous shot.
```

### Concept B — "Embedding nebula"

A loose cloud of fine points slowly organizes into faint, stacked layers, like an embedding space settling
into the layers of a network.

**Still (Qwen-Image), desktop:**

```
A loose, three-dimensional cloud of thousands of fine points of warm off-white light floating in pure black space. Toward its center the points organize into five faint, thin, parallel layers seen at a slight angle, like sheets of a neural network, with delicate light threads connecting a few points between layers. Only the middle layer is in sharp focus; the near and far points melt into soft round bokeh. Three or four points glow signal orange. Long-exposure feel, fine film grain, everything outside the cloud is pure empty black.
```

**Still, mobile:** same text, with "the layers seen from slightly below, stacked vertically in the upper
half of the frame" plus the MOBILE clause.

**Loop (Wan FLF2V) positive:**

```
Very slow, calm, continuous motion. The camera orbits a few degrees around the cloud of light points with gentle parallax between the layers. Loose points drift slowly and settle into the layers, a faint pulse of light passes from one layer to the next, the orange points glow softly. The background stays pure black and the composition stays the same. Smooth, hypnotic, ambient, one continuous shot.
```

### Loop negative (both concepts)

Wan's default negative, in English, plus site items:

```
bright colors, overexposed, static, frozen, blurry details, subtitles, text, watermark, logo, style change, painting, still picture, overall gray, grey background, haze, fog, worst quality, low quality, jpeg artifacts, ugly, deformed, extra objects, morphing into objects, people, faces, hands, fast motion, fast camera, camera shake, zoom burst, rotation over 5 degrees, flicker, strobing, flashing, sudden cuts, scene change, transitions, melting, color shift, green, cyan, purple, neon
```

**Camera rule:** very slow push-in **or** an orbit of 5° or less over the whole clip. No cuts, no flicker,
no morphing into objects. If Wan adds too much motion, remove a verb from the positive prompt before you
touch the settings.

**FLUX.2 note:** if you made the still with FLUX.2, nothing changes for the loop. Wan only sees the image.

---

## 4. Desktop pipeline (poster + loop)

All commands run from the project folder in PowerShell or Git Bash. Where a two-pass encode writes to a
null file, use `NUL` in PowerShell and `/dev/null` in Git Bash. Work files go in a `work\` folder outside
`assets/` (or anywhere outside the repo).

### 4.1 Make the master still

1. Qwen-Image-2512 at **1664×928**, 50 steps, CFG 4, euler/simple, fixed seed. Concept prompt + style
   suffix + DESKTOP clause, base negative.
2. Upscale ×2 in ComfyUI (`Load Upscale Model` → `Upscale Image (using Model)`, e.g. 4x-UltraSharp, then
   downscale). Save as `work\hero_master.png`.
3. **Crush the blacks to true 0** before anything else, so Wan starts from a clean frame:

   ```bash
   ffmpeg -y -i work/hero_master.png -vf "scale=1920:1080:force_original_aspect_ratio=increase:flags=lanczos,crop=1920:1080,colorlevels=rimin=0.05:gimin=0.05:bimin=0.05" work/hero_1920.png
   ffmpeg -y -i work/hero_1920.png -vf "scale=1280:720:flags=lanczos" work/hero_start_1280x720.png
   ```

   `colorlevels` maps everything at or below 5% (about 13/255) to 0 and stretches the rest. Raise to 0.07
   if the empty side still reads grey on the site; lower to 0.03 if dim strands vanish.

### 4.2 Render the loop (Wan 2.2 FLF2V)

- Template: Wan 2.2 14B First-Last-Frame-to-Video.
- `start_image` **and** `end_image` = `work\hero_start_1280x720.png`.
- 1280×720, length 81, 16 fps, settings from section 1, fixed seed, concept loop prompt + loop negative.
- Save a near-lossless intermediate (Video Combine: `video/h264-mp4`, crf ≤ 12, or a PNG sequence):
  `work\wan_raw.mp4`.

### 4.3 Smooth to 30 fps (RIFE) and trim the seam

- ComfyUI-Frame-Interpolation → **RIFE VFI**, **multiplier 3** on the 81 raw frames → about 241 frames.
- Video Combine at **30 fps** → `work\wan_rife.mp4`. That plays at 8.0 s, and the motion becomes 1.6×
  slower, which suits the "slow drift" brief. (Multiplier 2 at 25 fps gives about 6.4 s.)
- FLF2V's last frame equals its first, so drop the last frame to avoid a stutter at the seam. Count the
  frames first:

  ```bash
  ffprobe -v error -count_frames -select_streams v:0 -show_entries stream=nb_read_frames -of csv=p=0 work/wan_rife.mp4
  # if it prints 241, keep frames 0..239:
  ffmpeg -y -i work/wan_rife.mp4 -vf "select='lt(n\,240)',setpts=N/(30*TB)" -an -c:v ffv1 work/loop_trim.mkv
  ```

ffmpeg-only alternative to RIFE: `-vf "minterpolate=fps=30:mi_mode=mci"`. It is slower and can warp thin
filaments, so check the result.

### 4.4 Loop fallbacks (TI2V-5B, LTX, or an FLF2V seam you can see)

**Crossfade** (one-way motion). Blends the last 0.75 s into the first. The output is 0.75 s shorter and
loops cleanly. `offset` = clip length − 1.5 (example: 8.75 s clip → 7.25):

```bash
ffmpeg -y -i work/raw.mp4 -filter_complex "[0:v]split[body][head];[head]trim=0:0.75,setpts=PTS-STARTPTS[h];[body]trim=0.75,setpts=PTS-STARTPTS[b];[b][h]xfade=transition=fade:duration=0.75:offset=7.25[v]" -map "[v]" -an -c:v ffv1 work/loop_trim.mkv
```

**Ping-pong** (back-and-forth motion). For an N-frame clip, use `end_frame=N-1` (example N=121):

```bash
ffmpeg -y -i work/raw.mp4 -filter_complex "[0:v]split[a][b];[b]reverse,trim=start_frame=1:end_frame=120,setpts=PTS-STARTPTS[r];[a][r]concat=n=2:v=1:a=0[v]" -map "[v]" -an -c:v ffv1 work/loop_trim.mkv
```

With either fallback, the poster must come from frame 0 of the result (4.6), because the loop no longer
starts on the original still.

### 4.5 Grade: grain, then crush blacks again

Wan and RIFE lift blacks slightly, and grain added after a crush would turn the empty side grey under the
screen blend. Always add grain **first**, then crush:

```bash
ffmpeg -y -i work/loop_trim.mkv -vf "noise=alls=4:allf=t,colorlevels=rimin=0.05:gimin=0.05:bimin=0.05" -an -c:v ffv1 work/loop_master.mkv
```

Grain of ±4 stays below the crush threshold in black areas, so black stays 0 while the lit areas get
texture. Skip `noise` if the render already has enough grain.

### 4.6 Poster from frame 0

Wan re-encodes the first frame through its VAE, so its colors drift slightly from the still. Take the
poster from the graded loop so the poster-to-video swap is invisible:

```bash
ffmpeg -y -i work/loop_master.mkv -frames:v 1 work/frame0.png
ffmpeg -y -i work/frame0.png -vf "scale=1920:1080:flags=lanczos" work/poster_1920.png
cwebp -q 80 -m 6 -sharp_yuv -af work/poster_1920.png -o assets/hero-poster.webp
```

For a sharper poster, use `work\hero_1920.png` from 4.1 instead, at the cost of a faint color jump when the
video appears. Target ≤ 250 KB. Drop `-q` to 74 if it is larger.

### 4.7 Encode (silent, BT.709, `+faststart`)

Size math: `kbps ≈ MB × 8000 ÷ seconds × 0.9`. For 8 s: 3 MB → about 2700 kbps, 4 MB → about 3600 kbps.

The `scale=...:out_range=tv` part makes black land exactly on video black (Y=16), which decodes to 0.

**VP9 WebM (≤ 3 MB), two-pass:**

```bash
ffmpeg -y -i work/loop_master.mkv -an -vf "scale=1280:720:flags=lanczos:out_color_matrix=bt709:out_range=tv,format=yuv420p" -c:v libvpx-vp9 -b:v 2400k -maxrate 2800k -bufsize 4800k -deadline good -cpu-used 1 -row-mt 1 -tile-columns 2 -g 240 -colorspace bt709 -color_primaries bt709 -color_trc bt709 -pass 1 -f webm NUL
ffmpeg -y -i work/loop_master.mkv -an -vf "scale=1280:720:flags=lanczos:out_color_matrix=bt709:out_range=tv,format=yuv420p" -c:v libvpx-vp9 -b:v 2400k -maxrate 2800k -bufsize 4800k -deadline good -cpu-used 1 -row-mt 1 -tile-columns 2 -g 240 -colorspace bt709 -color_primaries bt709 -color_trc bt709 -pass 2 assets/hero-loop.webm
```

Simpler single pass: replace the bitrate flags with `-crf 34 -b:v 0`. Dark, slow footage often lands well
under 3 MB that way.

**H.264 MP4 (≤ 4 MB), two-pass:**

```bash
ffmpeg -y -i work/loop_master.mkv -an -vf "scale=1280:720:flags=lanczos:out_color_matrix=bt709:out_range=tv,format=yuv420p" -c:v libx264 -preset slow -profile:v high -level 4.0 -b:v 3200k -maxrate 3800k -bufsize 6400k -g 60 -colorspace bt709 -color_primaries bt709 -color_trc bt709 -pass 1 -f mp4 NUL
ffmpeg -y -i work/loop_master.mkv -an -vf "scale=1280:720:flags=lanczos:out_color_matrix=bt709:out_range=tv,format=yuv420p" -c:v libx264 -preset slow -profile:v high -level 4.0 -b:v 3200k -maxrate 3800k -bufsize 6400k -g 60 -colorspace bt709 -color_primaries bt709 -color_trc bt709 -pass 2 -movflags +faststart assets/hero-loop.mp4
```

If dark gradients band, add `-tune grain` to the x264 lines. **Do not** add noise at encode time. That
lifts blacks (see 4.5).

---

## 5. Mobile pipeline (poster + loop)

### Route A — dedicated portrait render (best composition)

1. Qwen-Image-2512 at **928×1664**, the **same seed** as the desktop still, mobile prompt + MOBILE clause.
   Upscale, then crush as in 4.1, at 1080×1920 → `work\mobile_1080.png`, and 720×1280 →
   `work\mobile_start_720x1280.png`.
2. Wan FLF2V at **720×1280**, both frames = `work\mobile_start_720x1280.png`, same loop prompt (for
   concept A, replace "toward the bright knot" with "toward the bright knot near the top").
3. Run 4.3 → 4.6 on it. Use 1080×1920 for the poster scale.
4. Encode as in 4.7, but with `scale=720:1280:...` and a lower bitrate for the ≤ 3 MB cap on **both** files:
   VP9 `-b:v 2400k -maxrate 2800k`; H.264 `-b:v 2400k -maxrate 2800k -bufsize 4800k`. Output names:
   `assets/hero-loop-mobile.webm`, `assets/hero-loop-mobile.mp4`.

### Route B — crop from the desktop files (no extra render)

The desktop subject sits in the right 55%, and the mobile layout wants it in the upper half. Crop a 9:8
window from the right side, scale it to the top half of a portrait frame, fade its bottom edge to black, and
pad the lower half with black.

**Mobile loop master** (from `work\loop_master.mkv`, 1280×720):

```bash
ffmpeg -y -i work/loop_master.mkv -vf "crop=810:720:470:0,scale=720:640:flags=lanczos,format=gbrp,geq=r='r(X,Y)*clip((640-Y)/160,0,1)':g='g(X,Y)*clip((640-Y)/160,0,1)':b='b(X,Y)*clip((640-Y)/160,0,1)',pad=720:1280:0:0:black" -an -c:v ffv1 work/loop_mobile_master.mkv
```

**Mobile poster** (from `work\poster_1920.png`, 1920×1080):

```bash
ffmpeg -y -i work/poster_1920.png -vf "crop=1215:1080:705:0,scale=1080:960:flags=lanczos,format=gbrp,geq=r='r(X,Y)*clip((960-Y)/240,0,1)':g='g(X,Y)*clip((960-Y)/240,0,1)':b='b(X,Y)*clip((960-Y)/240,0,1)',pad=1080:1920:0:0:black" work/mobile_1080.png
cwebp -q 78 -m 6 -sharp_yuv -af work/mobile_1080.png -o assets/hero-mobile.webp
```

Then encode `work\loop_mobile_master.mkv` as in Route A, step 4. The upper half is a downscale of the
desktop frame, so it stays sharp at 720 wide.

---

## 6. `assets/og.png` — 1200×630 link preview

The most reliable route is the hero poster plus real type. AI-rendered text can misspell.

1. Crop the graded poster to 1.905:1 and scale:

   ```bash
   ffmpeg -y -i work/poster_1920.png -vf "crop=1920:1008:0:36,scale=1200:630:flags=lanczos" work/og_base.png
   ```

2. Add type in any editor, in the empty left side, using the site's fonts (Instrument Serif for the name,
   Geist Mono for the small line; both are free on Google Fonts):
   - Name: `Gunnar Patterson` in `#EDEAE4`, about 84 px.
   - Small line: `GUNR.DEV` in `#FF5A1F`, about 22 px, letter-spaced.
   - Keep the text inside the central 1000×520, because some apps crop the edges.
   - Use only facts that are already on the site.
3. Export PNG to `assets/og.png`, ≤ 1 MB (optionally `pngquant --quality 70-90`).

Text-in-model option: Qwen-Image-2512 renders short English text well. Add to the still prompt: `On the
empty left side, the words "Gunnar Patterson" in a large, elegant, light-weight serif typeface in warm
off-white, and below it "GUNR.DEV" in small orange monospace capitals.` Remove `text, letters, words` from
the negative, add `misspelled text, extra letters, garbled characters`, and check every character.

### Turn the preview tags on in `index.html`

Today `index.html` has **no** image tags. Lines 22–24 are a comment that explains they were left out, and
`twitter:card` is set to `summary`. Once `assets/og.png` is committed:

1. Replace the three-line comment that starts `<!-- Preview image: once assets/og.png (1200x630) exists`
   with:

   ```html
   <meta property="og:image" content="https://gunr.dev/assets/og.png">
   <meta property="og:image:type" content="image/png">
   <meta property="og:image:width" content="1200">
   <meta property="og:image:height" content="630">
   <meta property="og:image:alt" content="Gunnar Patterson · GUNR">
   ```

2. Change `<meta name="twitter:card" content="summary">` to
   `<meta name="twitter:card" content="summary_large_image">`.
3. Add after the `twitter:description` line:

   ```html
   <meta name="twitter:image" content="https://gunr.dev/assets/og.png">
   <meta name="twitter:image:alt" content="Gunnar Patterson · GUNR">
   ```

The URLs must be absolute, as the existing comment on line 15 notes. After deploying, re-scrape the link in
LinkedIn's Post Inspector, because LinkedIn caches previews.

---

## 7. Check the blend

1. Start the local server: `powershell -ExecutionPolicy Bypass -File .\serve.ps1`, then open
   `http://localhost:8787/`. If Windows "Animation effects" is off, also try
   `http://localhost:8787/?motion=full` to see the full-motion path.
2. Look at the empty side of the hero. It must be indistinguishable from the page. A visible rectangle or
   grey wash means the blacks are not 0. Raise the `colorlevels` threshold in 4.5 and re-encode.
3. Numeric check in Git Bash, which finds the brightest pixel in the left 40% of every frame:

   ```bash
   ffmpeg -v error -i assets/hero-loop.mp4 -vf "crop=iw*0.4:ih:0:0,signalstats,metadata=print:key=lavfi.signalstats.YMAX:file=-" -f null - | grep YMAX | sort -t= -k2 -n | tail -n 1
   ```

   The highest YMAX in the empty region should be 16–20. Anything higher is haze or grain leaking into the
   black.
4. Watch the seam: play the file in a player with looping on (`ffplay -loop 0 assets/hero-loop.mp4`). There
   should be no jump, flash or stall.
5. With Motion on (or `?motion=full`), DevTools → Network → throttle to "Fast 4G" and confirm the poster
   shows first and the video fades in.
   The simple `serve.ps1` does not answer byte-range requests, so seeking may misbehave locally. GitHub
   Pages handles ranges.

---

## 8. Final checklist

- [ ] Filenames exact (lower-case, hyphens): see `assets/README.md`.
- [ ] Empty areas are true black in every file (section 7, step 3).
- [ ] Posters match loop frame 0; no visible seam; no audio track (`ffprobe` shows one video stream only).
- [ ] Sizes: posters ≤ 250 / 200 KB; `hero-loop.webm` ≤ 3 MB, `hero-loop.mp4` ≤ 4 MB, mobile loops ≤ 3 MB
      each; `og.png` ≤ 1 MB. `+faststart` on every MP4.
- [ ] Orange glints are ≤ 5% of the frame and nothing reads as green, cyan or purple.
- [ ] `og.png` text is spelled correctly and states only facts already on the site; the `index.html` tags
      are turned on (section 6).
- [ ] No metadata embedded. The ffmpeg/cwebp re-encodes drop it; use `exiftool -all= <file>` if unsure.
- [ ] Delete one file locally and confirm the site still looks right without it.

```bash
ffprobe -v error -show_entries format=size,duration:stream=codec_type,codec_name,width,height,r_frame_rate assets/hero-loop.mp4
```

---

## Sources

Re-checked 29 Oct 2026.

Model pages:
- Qwen-Image-2512 model card (Apache 2.0, 50 steps / true_cfg 4.0, resolutions, default negative): https://huggingface.co/Qwen/Qwen-Image-2512
- ComfyUI Qwen-Image-2512 tutorial (file names, Lightning LoRA): https://docs.comfy.org/tutorials/image/qwen/qwen-image-2512
- ComfyUI Qwen-Image tutorial (fp8 on 24 GB RTX 4090D, about 86% VRAM): https://docs.comfy.org/tutorials/image/qwen/qwen-image
- FLUX.2 [dev] model card (guidance 4, 28–50 steps, Non-Commercial license): https://huggingface.co/black-forest-labs/FLUX.2-dev
- FLUX.2 repo (guidance-distillation table, klein variants, licenses): https://github.com/black-forest-labs/flux2
- FLUX.2 announcement (fp8 reference implementation with NVIDIA and ComfyUI): https://bfl.ai/blog/flux-2
- ComfyUI FLUX.2 [dev] tutorial (file names): https://docs.comfy.org/tutorials/flux/flux-2-dev
- Wan 2.2 I2V-A14B model card (Apache 2.0, 720p): https://huggingface.co/Wan-AI/Wan2.2-I2V-A14B
- ComfyUI Wan 2.2 tutorial (I2V, FLF2V, TI2V-5B, VAEs): https://docs.comfy.org/tutorials/video/wan/wan2_2
- Comfy-Org Wan 2.2 repack (i2v fp8_scaled file names): https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/tree/main/split_files/diffusion_models
- LTX-2.3 model card (÷32 sizes, 8n+1 frames, distilled CFG 1): https://huggingface.co/Lightricks/LTX-2.3
- ComfyUI-Frame-Interpolation (RIFE VFI): https://github.com/Fannovel16/ComfyUI-Frame-Interpolation

Cross-checks:
- Wan open-weights status (Wan 2.2 still the newest downloadable): https://howaiworks.ai/blog/alibaba-wan-open-weights-stopped-at-2-2
- Local video model roundup: https://insiderllm.com/guides/local-ai-video-generation/

Some values are not on the official pages: the Wan template sampler values (20 steps split 10/10, CFG 3.5,
shift 8), the Qwen KSampler sampler and shift, and the FLUX.2 CFG-1 / FluxGuidance usage. They follow the
stock ComfyUI templates, so trust your loaded template where it differs.
