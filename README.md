# Ping-Pong Trail Studio

A browser-based motion graphics tool for turning static images into animated trail loops.

Upload a PNG/JPG/SVG, auto-trim the content, tune motion + color controls, and export either:
- a preview frame (`PNG`)
- an animation (`WebM`)
- reusable scene settings (`JSON`)

It also includes a separate **Lean Player** page that loads image + settings JSON and plays fullscreen with minimal UI.

## What This Is Good For

- Motion logo loops
- Intro/outro visuals
- UI background loops
- Keynote/Slides animated elements
- Social clips from static brand assets
- Quick iteration of generative trail looks without After Effects

## Core Features

- Auto-trim uploaded image bounds (transparent PNG/SVG + JPG black/white-key modes)
- SVG raster resolution control with selectable `1x/2x/3x` multiplier
- Ping-pong buffer trail rendering with adjustable decay + offset
- Multiple motion modes: bounce, orbit, drift, figure-8, lissajous, spiral, zigzag, static
- Palette cycling with custom palette input
- Transparent background mode for alpha workflows
- WebM recording from canvas
- Settings export/import as JSON
- Lean fullscreen player (`/player.html`) for playback of image + JSON settings

## App Modes

### Studio (`/`)
Full editor UI:
- upload image
- tune animation
- record/export
- manage settings JSON

### Lean Player (`/player.html`)
Playback-focused UI:
- load image
- paste/load settings JSON
- apply + play
- fullscreen presentation mode

Player shortcuts:
- `Space` = play/pause
- `F` = toggle fullscreen

## Quick Start

```bash
npm install
npm run dev
```

Open:
- `http://localhost:5173/` (Studio)
- `http://localhost:5173/player.html` (Lean Player)

Build production assets:

```bash
npm run build
npm run preview
```

## Basic Workflow

1. Upload image (`PNG`, `JPG`, or `SVG`).
2. Adjust canvas size, trail, motion, background, and palette.
3. Press **Play** to preview.
4. Export:
   - `PNG` frame
   - `WebM` recording
   - `Settings JSON` (Generate/Copy/Download)
5. Open **Lean Player**, load image + JSON settings, and run fullscreen.

## Settings JSON

The settings payload is versioned and normalized/sanitized on import.

High-level format:

```json
{
  "schema": "pingpong-trail-studio-settings",
  "version": 1,
  "exportedAt": "2026-02-17T10:00:00.000Z",
  "settings": {
    "canvasPreset": "800,600",
    "motionMode": "bounce",
    "alphaDecay": 0.92,
    "paletteSelect": "0"
  }
}
```

Notes:
- You can import either full payloads or raw settings objects.
- Invalid values are clamped to safe ranges.
- Last used settings are cached locally in browser storage.

## FFmpeg Conversion Recipes

Use these when you need Keynote-friendly or post-production-friendly outputs.

### 1) Check alpha metadata

```bash
ffprobe -v error -select_streams v:0 \
  -show_entries stream=codec_name,pix_fmt,width,height:stream_tags=alpha_mode \
  -of default=nw=1 \
  "pingpong-animation.webm"
```

### 2) Transparent ProRes 4444 MOV (recommended)

```bash
ffmpeg -c:v libvpx-vp9 -i "pingpong-animation.webm" \
  -c:v prores_ks -profile:v 4 -pix_fmt yuva444p10le -alpha_bits 16 \
  -an \
  "pingpong-animation-prores4444-alpha.mov"
```

### 3) Keynote-compatible non-transparent MP4

```bash
ffmpeg -i "pingpong-animation.webm" \
  -c:v libx264 -pix_fmt yuv420p -movflags +faststart \
  -an \
  "pingpong-animation-keynote.mp4"
```

### 4) ProRes 422 HQ MOV (no alpha)

```bash
ffmpeg -i "pingpong-animation.webm" \
  -c:v prores_ks -profile:v 3 -pix_fmt yuv422p10le \
  -an \
  "pingpong-animation-prores422hq.mov"
```

## Project Structure

```text
.
├── index.html           # Studio UI
├── player.html          # Lean player UI
├── src/main.js          # Studio app logic
├── src/player.js        # Lean player logic
├── src/settings.js      # Shared JSON schema + sanitization
├── src/image-utils.js   # Image loading/resize/trim helpers
├── src/motion-utils.js  # Motion path calculations
├── src/color-utils.js   # Color/palette helpers
├── src/constants.js     # Shared constants
└── vite.config.js       # Multi-page Vite config
```

## Publishing Notes (GitHub)

Before making the repository public, recommended:
- Add a `LICENSE` file (MIT or your preferred license)
- Add screenshots/GIFs to this README for quick visual context
- Add repository topics (`motion-graphics`, `canvas`, `vite`, `webm`, etc.)
- Create a short release note describing Studio + Lean Player workflow

## Troubleshooting

- If fullscreen does not open, check browser permissions for fullscreen APIs.
- If transparent WebM alpha is missing in downstream tools, convert to ProRes 4444.
- If imported settings behave unexpectedly, regenerate JSON from Studio and re-apply.
