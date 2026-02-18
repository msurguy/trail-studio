import picaFactory from "pica";

import {
  AMPLITUDE_MOTION_MODES,
  CYCLIC_MOTION_MODES,
  HQ_RESIZE_OPTIONS,
  PALETTES,
} from "./constants";
import {
  getPaletteColor,
  normalizeHexColor,
  parsePaletteInput,
} from "./color-utils";
import {
  findContentBounds,
  getFileTypeFlags,
  getTargetDimensions,
  loadFile,
  resizeCanvasHighQuality,
  trimImage,
} from "./image-utils";
import { updateMotionPosition } from "./motion-utils";
import { createInitialState } from "./state";
import {
  SETTINGS_CACHE_KEY,
  createSettingsPayload,
  parseSettingsPayload,
} from "./settings";
import { cleanupFaintTrail } from "./trail-utils";

const pica = picaFactory();

const state = createInitialState();

const bufferA = document.createElement("canvas");
const bufferB = document.createElement("canvas");

const $ = (id) => document.getElementById(id);
const displayCanvas = $("display-canvas");
const displayCtx = displayCanvas.getContext("2d");

let rawImage = null;
let rawFileName = "";

let mediaRecorder = null;
let recordedChunks = [];
const sliderDisplayUpdaters = [];

function getSelectedPalette() {
  const selected = $("palette-select").value;
  if (selected === "custom") return state.customPalette;
  const idx = parseInt(selected, 10);
  return Number.isFinite(idx) ? PALETTES[idx] : null;
}

function getBackgroundColor() {
  const normalized = normalizeHexColor($("bg-color").value);
  return normalized || "#000000";
}

function isTransparentBackground() {
  return $("bg-transparent").checked;
}

function paintBackground(ctx, w, h) {
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  if (isTransparentBackground()) return;
  ctx.fillStyle = getBackgroundColor();
  ctx.fillRect(0, 0, w, h);
}

function getCanvasSize() {
  const preset = $("canvas-preset").value;
  if (preset === "custom") {
    return {
      w: parseInt($("custom-w").value, 10) || 800,
      h: parseInt($("custom-h").value, 10) || 600,
    };
  }

  const [w, h] = preset.split(",").map(Number);
  return { w, h };
}

function updateSizeLabel() {
  const { w, h } = getCanvasSize();
  $("canvas-size-label").textContent = `${w} × ${h} px`;
  $("badge-size").textContent = `${w}×${h}`;
}

function renderStaticPreview() {
  const { w, h } = getCanvasSize();
  displayCtx.clearRect(0, 0, w, h);
  paintBackground(displayCtx, w, h);
  if (!state.trimmedCanvas) return;

  const scale = parseFloat($("content-scale").value);
  const spriteW = state.trimmedCanvas.width * scale;
  const spriteH = state.trimmedCanvas.height * scale;
  const x = (w - spriteW) / 2;
  const y = (h - spriteH) / 2;

  state.posX = x;
  state.posY = y;
  displayCtx.drawImage(state.trimmedCanvas, x, y, spriteW, spriteH);
}

function updateImageOptionPanels(flags) {
  $("jpg-options").classList.toggle("hidden", !flags.isJpg);
  $("svg-options").classList.toggle("hidden", !flags.isSvg);
  $("raster-options").classList.toggle("hidden", flags.isSvg);
}

async function processImage(img, fileName) {
  rawImage = img;
  rawFileName = fileName;
  const requestId = ++state.processRequestId;

  const sourceW = img.naturalWidth || img.width;
  const sourceH = img.naturalHeight || img.height;
  if (!sourceW || !sourceH) {
    alert("Failed to read image size.");
    return;
  }

  const fileTypeFlags = getFileTypeFlags(fileName);
  updateImageOptionPanels(fileTypeFlags);
  if (!fileTypeFlags.isJpg) {
    $("transparency-mode").value = "none";
  }

  const { isSvg, isJpg, mode, targetW, targetH, sizeLabel } =
    getTargetDimensions(sourceW, sourceH, {
      ...fileTypeFlags,
      transparencyMode: $("transparency-mode").value,
      svgWidth: parseInt($("svg-width").value, 10),
      svgScaleMultiplier: parseFloat($("svg-scale-multiplier").value),
      rasterResizeEnabled: $("raster-resize-enabled").checked,
      rasterWidth: parseInt($("raster-width").value, 10),
    });

  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = sourceW;
  sourceCanvas.height = sourceH;
  const sourceCtx = sourceCanvas.getContext("2d");
  sourceCtx.clearRect(0, 0, sourceW, sourceH);
  sourceCtx.drawImage(img, 0, 0, sourceW, sourceH);

  let tmp = sourceCanvas;
  if (targetW !== sourceW || targetH !== sourceH) {
    if (isSvg) {
      tmp = document.createElement("canvas");
      tmp.width = targetW;
      tmp.height = targetH;
      const tmpDrawCtx = tmp.getContext("2d");
      tmpDrawCtx.clearRect(0, 0, targetW, targetH);
      tmpDrawCtx.drawImage(sourceCanvas, 0, 0, targetW, targetH);
    } else {
      tmp = await resizeCanvasHighQuality({
        pica,
        srcCanvas: sourceCanvas,
        targetW,
        targetH,
        options: HQ_RESIZE_OPTIONS,
      });
    }
  }

  if (requestId !== state.processRequestId) return;

  const tmpCtx = tmp.getContext("2d", { willReadFrequently: true });
  const imageData = tmpCtx.getImageData(0, 0, tmp.width, tmp.height);

  let nonTransparentCount = 0;
  let totalAlpha = 0;
  for (let i = 3; i < imageData.data.length; i += 4) {
    if (imageData.data[i] > 10) nonTransparentCount++;
    totalAlpha += imageData.data[i];
  }

  console.log(
    `Image ${tmp.width}x${tmp.height}, non-transparent pixels: ${nonTransparentCount}/${tmp.width * tmp.height}, avg alpha: ${(totalAlpha / (tmp.width * tmp.height)).toFixed(1)}`,
  );

  let effectiveMode = mode;
  let bounds = findContentBounds(imageData, effectiveMode);

  if (!bounds && isJpg && effectiveMode !== "none") {
    bounds = findContentBounds(imageData, "none");
    if (bounds) {
      effectiveMode = "none";
      $("transparency-mode").value = "none";
    }
  }

  if (!bounds) {
    console.warn("Bounds detection returned empty; falling back to full image.");
    bounds = { x: 0, y: 0, w: tmp.width, h: tmp.height };
  }

  $("bounds-info").classList.remove("hidden");
  $("info-original").textContent = sizeLabel;
  $("info-trimmed").innerHTML =
    `Trimmed: ${bounds.w}×${bounds.h} <span class="info-muted">@ (${bounds.x},${bounds.y})</span>`;

  const trimmed = trimImage(tmp, bounds, effectiveMode);
  if (requestId !== state.processRequestId) return;

  state.trimmedCanvas = trimmed;
  state.hasImage = true;
  state.inputMode = "image";
  state.isPlaying = false;

  $("drop-icon").textContent = "✓";
  $("drop-text").textContent = fileName;
  $("drop-text").classList.add("active");
  $("btn-play").disabled = false;
  $("btn-export").disabled = false;
  $("btn-record").disabled = false;
  $("empty-state").classList.add("hidden");

  stopAnimation();
  initBuffers();

  const { w, h } = getCanvasSize();
  state.posX = (w - trimmed.width) / 2;
  state.posY = (h - trimmed.height) / 2;
  renderStaticPreview();
}

function runProcessImage(img, fileName) {
  processImage(img, fileName).catch((error) => {
    console.error("Image processing failed:", error);
    alert("Image processing failed. Try a smaller target width.");
  });
}

function reprocessImage() {
  if (!rawImage) return;
  runProcessImage(rawImage, rawFileName);
}

function processText() {
  const text = $("text-content").value.trim();
  if (!text) return;

  const fontSize = parseInt($("text-font-size").value, 10) || 128;
  const fontFamily = $("text-font-family").value || "sans-serif";
  const textColor = $("text-color").value || "#ffffff";

  const measure = document.createElement("canvas");
  const mCtx = measure.getContext("2d");
  mCtx.font = `${fontSize}px ${fontFamily}`;
  const metrics = mCtx.measureText(text);

  const textWidth = Math.ceil(metrics.width);
  const ascent = Math.ceil(metrics.actualBoundingBoxAscent || fontSize * 0.85);
  const descent = Math.ceil(metrics.actualBoundingBoxDescent || fontSize * 0.2);
  const textHeight = ascent + descent;

  const pad = Math.ceil(fontSize * 0.1);
  const canvasW = textWidth + pad * 2;
  const canvasH = textHeight + pad * 2;

  if (canvasW < 1 || canvasH < 1) return;

  const canvas = document.createElement("canvas");
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext("2d");

  ctx.clearRect(0, 0, canvasW, canvasH);
  ctx.font = `${fontSize}px ${fontFamily}`;
  ctx.fillStyle = textColor;
  ctx.textBaseline = "top";
  ctx.fillText(text, pad, pad);

  state.trimmedCanvas = canvas;
  state.hasImage = true;
  state.inputMode = "text";
  state.isPlaying = false;

  $("btn-play").disabled = false;
  $("btn-export").disabled = false;
  $("btn-record").disabled = false;
  $("empty-state").classList.add("hidden");

  stopAnimation();
  initBuffers();

  const { w, h } = getCanvasSize();
  state.posX = (w - canvas.width) / 2;
  state.posY = (h - canvas.height) / 2;
  renderStaticPreview();
}

function switchInputTab(mode) {
  state.inputMode = mode;
  $("tab-image").classList.toggle("active", mode === "image");
  $("tab-text").classList.toggle("active", mode === "text");
  $("image-input-section").classList.toggle("hidden", mode !== "image");
  $("text-input-section").classList.toggle("hidden", mode !== "text");
}

function syncTextColorInputs(fromHex = false) {
  if (fromHex) {
    const normalized = normalizeHexColor($("text-color-hex").value) || "#ffffff";
    $("text-color").value = normalized;
    $("text-color-hex").value = normalized;
  } else {
    const normalized = normalizeHexColor($("text-color").value) || "#ffffff";
    $("text-color").value = normalized;
    $("text-color-hex").value = normalized;
  }
}

function initBuffers() {
  const { w, h } = getCanvasSize();

  bufferA.width = w;
  bufferA.height = h;
  bufferB.width = w;
  bufferB.height = h;

  const aCtx = bufferA.getContext("2d");
  const bCtx = bufferB.getContext("2d");
  aCtx.clearRect(0, 0, w, h);
  bCtx.clearRect(0, 0, w, h);

  displayCanvas.width = w;
  displayCanvas.height = h;
  displayCtx.clearRect(0, 0, w, h);
  paintBackground(displayCtx, w, h);

  updateSizeLabel();
}

function wireSlider(sliderId, displayId, suffix = "") {
  const el = $(sliderId);
  const display = $(displayId);

  const update = () => {
    display.textContent =
      parseFloat(el.value).toFixed(el.step < 1 ? 2 : 1) + suffix;
  };

  el.addEventListener("input", update);
  sliderDisplayUpdaters.push(update);
  update();
}

function updateMotionModeUI() {
  const mode = $("motion-mode").value;
  const speedLabel = $("label-mode-speed");
  const ampXLabel = $("label-mode-amp-x");
  const ampYLabel = $("label-mode-amp-y");

  if (mode === "bounce") speedLabel.textContent = "Bounce Speed";
  else if (mode === "drift") speedLabel.textContent = "Drift Speed";
  else if (mode === "zigzag") speedLabel.textContent = "Sweep Speed";
  else if (mode === "static") speedLabel.textContent = "Mode Speed";
  else speedLabel.textContent = "Path Speed";

  if (mode === "bounce" || mode === "drift") {
    ampXLabel.textContent = "Travel Range X";
    ampYLabel.textContent = "Travel Range Y";
  } else {
    ampXLabel.textContent = "Path Radius X";
    ampYLabel.textContent = "Path Radius Y";
  }

  $("mode-speed").disabled = mode === "static";
  $("mode-duration-row").classList.toggle("hidden", !CYCLIC_MOTION_MODES.has(mode));
  const showAmp = AMPLITUDE_MOTION_MODES.has(mode);
  $("mode-amp-x-row").classList.toggle("hidden", !showAmp);
  $("mode-amp-y-row").classList.toggle("hidden", !showAmp);
}

function refreshPaletteUI() {
  const selected = $("palette-select").value;
  const hasPalette = selected !== "0";

  $("palette-controls").classList.toggle("hidden", !hasPalette);
  $("custom-palette-controls").classList.toggle("hidden", selected !== "custom");

  const swatches = $("palette-swatches");
  swatches.innerHTML = "";

  const palette = getSelectedPalette();
  if (hasPalette && palette) {
    palette.forEach((color) => {
      const swatch = document.createElement("div");
      swatch.className = "color-swatch";
      swatch.style.background = color;
      swatch.style.boxShadow = `0 2px 8px ${color}44`;
      swatches.appendChild(swatch);
    });
  }
}

function applyCustomPalette() {
  const parsed = parsePaletteInput($("custom-palette-input").value);
  if (parsed.length < 2) {
    alert("Enter at least 2 valid hex colors, separated by commas.");
    return;
  }

  state.customPalette = parsed;
  $("custom-palette-input").value = state.customPalette.join(", ");
  refreshPaletteUI();
}

function applyBackgroundModeUI() {
  const disabled = isTransparentBackground();
  $("bg-color").disabled = disabled;
  $("bg-color-hex").disabled = disabled;
}

function syncBackgroundInputs(fromHexInput = false) {
  if (fromHexInput) {
    const normalized = normalizeHexColor($("bg-color-hex").value) || "#000000";
    $("bg-color").value = normalized;
    $("bg-color-hex").value = normalized;
  } else {
    const normalized = normalizeHexColor($("bg-color").value) || "#000000";
    $("bg-color").value = normalized;
    $("bg-color-hex").value = normalized;
  }

  if (!state.isPlaying) {
    initBuffers();
    if (state.hasImage) renderStaticPreview();
  }
}

function setSettingsStatus(message, isError = false) {
  const statusEl = $("settings-status");
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#fca5a5" : "";
}

function readCurrentSettings() {
  return {
    canvasPreset: $("canvas-preset").value,
    customW: parseInt($("custom-w").value, 10),
    customH: parseInt($("custom-h").value, 10),
    alphaDecay: parseFloat($("alpha-decay").value),
    offsetX: parseFloat($("offset-x").value),
    offsetY: parseFloat($("offset-y").value),
    animSpeed: parseFloat($("anim-speed").value),
    contentScale: parseFloat($("content-scale").value),
    motionMode: $("motion-mode").value,
    modeSpeed: parseFloat($("mode-speed").value),
    modeDuration: parseFloat($("mode-duration").value),
    modeAmplitudeX: parseFloat($("mode-amplitude-x").value),
    modeAmplitudeY: parseFloat($("mode-amplitude-y").value),
    bgColor: $("bg-color").value,
    bgTransparent: $("bg-transparent").checked,
    paletteSelect: $("palette-select").value,
    customPalette: [...state.customPalette],
    colorSpeed: parseFloat($("color-speed").value),
    colorIntensity: parseFloat($("color-intensity").value),
    colorDuration: parseFloat($("color-duration").value),
    transparencyMode: $("transparency-mode").value,
    rasterWidth: parseInt($("raster-width").value, 10),
    rasterResizeEnabled: $("raster-resize-enabled").checked,
    svgWidth: parseInt($("svg-width").value, 10),
    svgScaleMultiplier: parseFloat($("svg-scale-multiplier").value),
    recordDuration: parseInt($("record-duration").value, 10),
    loopMode: $("loop-mode").checked,
    inputMode: state.inputMode,
    textContent: $("text-content").value,
    textFontSize: parseInt($("text-font-size").value, 10),
    textFontFamily: $("text-font-family").value,
    textColor: $("text-color").value,
  };
}

function refreshControlReadouts() {
  sliderDisplayUpdaters.forEach((update) => update());
  updateColorDurationDisplay();
  updateModeDurationDisplay();
  updateAmpDisplay();
}

function cacheSettingsPayload(payload) {
  try {
    localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn("Failed to cache settings payload:", error);
  }
}

function applySettingsPayload(payload, options = {}) {
  const { reprocess = true, source = "JSON import" } = options;
  const parsed = parseSettingsPayload(payload);
  const { settings } = parsed;

  $("canvas-preset").value = settings.canvasPreset;
  $("custom-w").value = String(settings.customW);
  $("custom-h").value = String(settings.customH);
  $("alpha-decay").value = String(settings.alphaDecay);
  $("offset-x").value = String(settings.offsetX);
  $("offset-y").value = String(settings.offsetY);
  $("anim-speed").value = String(settings.animSpeed);
  $("content-scale").value = String(settings.contentScale);
  $("motion-mode").value = settings.motionMode;
  $("mode-speed").value = String(settings.modeSpeed);
  $("mode-duration").value = String(settings.modeDuration);
  $("mode-amplitude-x").value = String(settings.modeAmplitudeX);
  $("mode-amplitude-y").value = String(settings.modeAmplitudeY);
  $("bg-color").value = settings.bgColor;
  $("bg-color-hex").value = settings.bgColor;
  $("bg-transparent").checked = settings.bgTransparent;
  $("palette-select").value = settings.paletteSelect;
  $("color-speed").value = String(settings.colorSpeed);
  $("color-intensity").value = String(settings.colorIntensity);
  $("color-duration").value = String(settings.colorDuration);
  $("transparency-mode").value = settings.transparencyMode;
  $("raster-width").value = String(settings.rasterWidth);
  $("raster-resize-enabled").checked = settings.rasterResizeEnabled;
  $("svg-width").value = String(settings.svgWidth);
  $("svg-scale-multiplier").value = String(settings.svgScaleMultiplier);
  $("record-duration").value = String(settings.recordDuration);
  $("loop-mode").checked = settings.loopMode;

  $("text-content").value = settings.textContent || "";
  $("text-font-size").value = String(settings.textFontSize || 128);
  $("text-font-family").value = settings.textFontFamily || "sans-serif";
  $("text-color").value = settings.textColor || "#ffffff";
  $("text-color-hex").value = settings.textColor || "#ffffff";

  state.customPalette = [...settings.customPalette];
  $("custom-palette-input").value = state.customPalette.join(", ");

  $("custom-size").classList.toggle("hidden", settings.canvasPreset !== "custom");
  $("raster-width").disabled = !settings.rasterResizeEnabled;

  const importedMode = settings.inputMode || "image";
  switchInputTab(importedMode);

  refreshControlReadouts();
  updateMotionModeUI();
  updateLoopModeUI();
  refreshPaletteUI();
  applyBackgroundModeUI();

  if (importedMode === "text" && settings.textContent && reprocess) {
    processText();
  } else if (rawImage && reprocess) {
    reprocessImage();
  } else if (!state.isPlaying) {
    initBuffers();
    if (state.hasImage) renderStaticPreview();
  }

  $("settings-json").value = JSON.stringify(parsed, null, 2);
  cacheSettingsPayload(parsed);
  setSettingsStatus(`Applied settings (${source}).`);

  return parsed;
}

function buildSettingsPayload() {
  return createSettingsPayload(readCurrentSettings());
}

function openLeanPlayerFromStudio() {
  const payload = buildSettingsPayload();
  cacheSettingsPayload(payload);
  window.open("/player.html", "_blank", "noopener");
}

function openInfoOverlay() {
  $("info-overlay").classList.remove("hidden");
  document.body.classList.add("modal-open");
}

function closeInfoOverlay() {
  $("info-overlay").classList.add("hidden");
  document.body.classList.remove("modal-open");
}

function isTypingTarget(target) {
  if (!target) return false;
  const tag = target.tagName;
  return (
    target.isContentEditable ||
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT"
  );
}

function animate() {
  const trimmed = state.trimmedCanvas;
  if (!trimmed) return;

  const { w, h } = getCanvasSize();
  const decay = parseFloat($("alpha-decay").value);
  const ox = parseFloat($("offset-x").value);
  const oy = parseFloat($("offset-y").value);
  const speed = parseFloat($("anim-speed").value);
  const modeSpeed = parseFloat($("mode-speed").value);
  const modeDuration = parseFloat($("mode-duration").value);
  const ampX = parseFloat($("mode-amplitude-x").value);
  const ampY = parseFloat($("mode-amplitude-y").value);
  const scale = parseFloat($("content-scale").value);
  const mode = $("motion-mode").value;
  const palette = getSelectedPalette();
  const colorSpeed = parseFloat($("color-speed").value);
  const colorIntensity = parseFloat($("color-intensity").value);
  const colorDuration = parseFloat($("color-duration").value);

  const readBuf = state.pingPong ? bufferB : bufferA;
  const writeBuf = state.pingPong ? bufferA : bufferB;
  const wCtx = writeBuf.getContext("2d");

  wCtx.clearRect(0, 0, w, h);

  wCtx.globalAlpha = decay;
  wCtx.globalCompositeOperation = "source-over";
  wCtx.drawImage(readBuf, ox * speed, oy * speed);
  wCtx.globalAlpha = 1.0;

  if (palette) {
    let doColor = true;
    if (colorDuration > 0) {
      const elapsed = state.colorTime / 60;
      if (elapsed > colorDuration) doColor = false;
    }

    if (doColor) {
      const color = getPaletteColor(palette, state.colorTime * colorSpeed * 0.01);
      if (color) {
        wCtx.globalCompositeOperation = "source-atop";
        wCtx.fillStyle = `rgba(${color[0]},${color[1]},${color[2]},${colorIntensity})`;
        wCtx.fillRect(0, 0, w, h);
        wCtx.globalCompositeOperation = "source-over";
      }
    }
  }

  cleanupFaintTrail(wCtx, w, h, state.time);

  const spriteWidth = trimmed.width * scale;
  const spriteHeight = trimmed.height * scale;

  const loopMode = $("loop-mode").checked;

  updateMotionPosition(state, {
    mode,
    width: w,
    height: h,
    spriteWidth,
    spriteHeight,
    ampX,
    ampY,
    speed,
    modeSpeed,
    modeDuration,
    loopMode,
  });

  wCtx.globalAlpha = 1.0;
  wCtx.drawImage(trimmed, state.posX, state.posY, spriteWidth, spriteHeight);

  displayCtx.clearRect(0, 0, w, h);
  paintBackground(displayCtx, w, h);
  displayCtx.drawImage(writeBuf, 0, 0);

  state.pingPong = !state.pingPong;
  state.time += 1;
  state.colorTime += 1;

  if (state.isWarmingUp) {
    state.loopFrameCount += 1;
    const progress = Math.min(100, (state.loopFrameCount / state.loopTotalFrames) * 100);
    $("progress-fill").style.width = `${progress}%`;
    $("record-status").textContent =
      `Warming up... ${Math.round(progress)}%`;

    if (state.loopFrameCount >= state.loopTotalFrames) {
      state.isWarmingUp = false;
      state.loopTotalFrames = state._loopRecordFrames;
      state.loopFrameCount = 0;
      beginMediaRecording();
    }
  }

  if (state.isRecording) {
    if (loopMode) {
      state.loopFrameCount += 1;
      const progress = Math.min(100, (state.loopFrameCount / state.loopTotalFrames) * 100);
      $("progress-fill").style.width = `${progress}%`;
      const elapsed = (state.loopFrameCount / 60).toFixed(1);
      const total = (state.loopTotalFrames / 60).toFixed(1);
      $("record-status").textContent =
        `Recording loop... ${elapsed}s / ${total}s`;

      if (state.loopFrameCount >= state.loopTotalFrames) {
        stopRecording();
        return;
      }
    } else {
      const durationMs = parseFloat($("record-duration").value) * 1000;
      const elapsed = performance.now() - state.recordStartTime;
      const progress = Math.min(100, (elapsed / durationMs) * 100);
      $("progress-fill").style.width = `${progress}%`;
      $("record-status").textContent =
        `Recording... ${(elapsed / 1000).toFixed(1)}s / ${(durationMs / 1000).toFixed(1)}s`;

      if (elapsed >= durationMs) {
        stopRecording();
        return;
      }
    }
  }

  state.animId = requestAnimationFrame(animate);
}

function startAnimation() {
  const trimmed = state.trimmedCanvas;
  if (!trimmed) return;

  const { w, h } = getCanvasSize();
  const scale = parseFloat($("content-scale").value);

  initBuffers();

  state.posX = (w - trimmed.width * scale) / 2;
  state.posY = (h - trimmed.height * scale) / 2;

  const angle = Math.random() * Math.PI * 2;
  state.velX = Math.cos(angle);
  state.velY = Math.sin(angle);
  state.time = 0;
  state.colorTime = 0;
  state.pingPong = false;
  state.isPlaying = true;

  displayCanvas.classList.add("live");
  $("badge-live").classList.remove("hidden");
  $("btn-play").textContent = "■ Stop";
  $("btn-play").classList.remove("btn-primary");
  $("btn-play").classList.add("btn-stop");

  state.animId = requestAnimationFrame(animate);
}

function stopAnimation() {
  if (state.animId) cancelAnimationFrame(state.animId);
  state.animId = null;
  state.isPlaying = false;

  displayCanvas.classList.remove("live");
  $("badge-live").classList.add("hidden");
  $("btn-play").textContent = "▶ Play";
  $("btn-play").classList.remove("btn-stop");
  $("btn-play").classList.add("btn-primary");
}

function beginMediaRecording() {
  const stream = displayCanvas.captureStream(60);
  const supportsVp9 = MediaRecorder.isTypeSupported("video/webm;codecs=vp9");
  const supportsVp8 = MediaRecorder.isTypeSupported("video/webm;codecs=vp8");
  const mimeType = supportsVp9
    ? "video/webm;codecs=vp9"
    : supportsVp8
      ? "video/webm;codecs=vp8"
      : "video/webm";

  if (isTransparentBackground() && !supportsVp9 && !supportsVp8) {
    alert(
      "Transparent WebM may not be supported by this browser/codec. If alpha is missing, use Chrome desktop with VP9 or export PNG sequence + ffmpeg ProRes 4444.",
    );
  }

  mediaRecorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 8000000,
  });
  recordedChunks = [];

  mediaRecorder.ondataavailable = (event) => {
    if (event.data.size > 0) recordedChunks.push(event.data);
  };

  mediaRecorder.onstop = () => {
    const blob = new Blob(recordedChunks, { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "pingpong-animation.webm";
    a.click();
    URL.revokeObjectURL(url);
    recordedChunks = [];
  };

  mediaRecorder.start(100);
  state.isRecording = true;
  state.loopFrameCount = 0;
  state.recordStartTime = performance.now();

  displayCanvas.classList.add("recording");
  $("badge-rec").classList.remove("hidden");
  $("btn-record").textContent = "⏹ Stop Rec";
  $("btn-record").classList.remove("btn-record");
  $("btn-record").classList.add("btn-stop");
}

function startRecording() {
  if (!state.hasImage) return;

  const loopMode = $("loop-mode").checked;

  // Loop mode needs a clean restart so time starts at 0
  if (loopMode) {
    if (state.isPlaying) stopAnimation();
    startAnimation();
  } else if (!state.isPlaying) {
    startAnimation();
  }

  $("record-progress").classList.remove("hidden");

  if (loopMode) {
    const decay = parseFloat($("alpha-decay").value);
    const modeDuration = parseFloat($("mode-duration").value);
    const loopFrames = Math.round(modeDuration * 60);

    // Calculate warm-up frames: enough for trail to decay below 0.1% visibility
    // decay^N < 0.001 => N > log(0.001) / log(decay), capped at 5 cycles
    const decayFrames = Math.ceil(Math.log(0.001) / Math.log(Math.max(0.5, decay)));
    const maxWarmupFrames = loopFrames * 5;
    const warmupFrames = Math.min(decayFrames, maxWarmupFrames);

    state.loopTotalFrames = warmupFrames;
    state.loopFrameCount = 0;
    state.isWarmingUp = true;
    // Store the recording frame count for after warm-up
    state._loopRecordFrames = loopFrames;
  } else {
    beginMediaRecording();
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
  }

  state.isRecording = false;
  state.isWarmingUp = false;
  state.loopFrameCount = 0;
  state.loopTotalFrames = 0;

  displayCanvas.classList.remove("recording");
  $("badge-rec").classList.add("hidden");
  $("record-progress").classList.add("hidden");
  $("progress-fill").style.width = "0%";
  $("record-status").textContent = "";
  $("btn-record").textContent = "⏺ Record WebM";
  $("btn-record").classList.remove("btn-stop");
  $("btn-record").classList.add("btn-record");
}

$("file-input").addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  loadFile(file, runProcessImage);
});

const dropZone = $("drop-zone");
dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropZone.classList.add("dragover");
});

dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("dragover");
});

dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropZone.classList.remove("dragover");
  const file = event.dataTransfer.files?.[0];
  if (file) loadFile(file, runProcessImage);
});

$("tab-image").addEventListener("click", () => switchInputTab("image"));
$("tab-text").addEventListener("click", () => switchInputTab("text"));

$("btn-apply-text").addEventListener("click", () => processText());
$("text-content").addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    processText();
  }
});

const fontSizeEl = $("text-font-size");
const fontSizeDisplay = $("val-font-size");
function updateFontSizeDisplay() {
  fontSizeDisplay.textContent = `${fontSizeEl.value}px`;
}
fontSizeEl.addEventListener("input", updateFontSizeDisplay);
updateFontSizeDisplay();

$("text-color").addEventListener("input", () => syncTextColorInputs(false));
$("text-color-hex").addEventListener("change", () => syncTextColorInputs(true));

$("transparency-mode").addEventListener("change", () => reprocessImage());

$("svg-width").addEventListener("change", () => {
  if (rawImage && rawFileName.toLowerCase().endsWith(".svg")) {
    reprocessImage();
  }
});

$("svg-scale-multiplier").addEventListener("change", () => {
  if (rawImage && rawFileName.toLowerCase().endsWith(".svg")) {
    reprocessImage();
  }
});

$("raster-resize-enabled").addEventListener("change", () => {
  const enabled = $("raster-resize-enabled").checked;
  $("raster-width").disabled = !enabled;

  if (rawImage && !rawFileName.toLowerCase().endsWith(".svg")) {
    reprocessImage();
  }
});

$("raster-width").addEventListener("change", () => {
  const isRaster = rawImage && !rawFileName.toLowerCase().endsWith(".svg");
  if (isRaster && $("raster-resize-enabled").checked) {
    reprocessImage();
  }
});

$("canvas-preset").addEventListener("change", () => {
  $("custom-size").classList.toggle("hidden", $("canvas-preset").value !== "custom");
  initBuffers();
  updateSizeLabel();
});

$("custom-w").addEventListener("change", () => {
  initBuffers();
  updateSizeLabel();
});

$("custom-h").addEventListener("change", () => {
  initBuffers();
  updateSizeLabel();
});

wireSlider("alpha-decay", "val-decay");
wireSlider("offset-x", "val-ox", "px");
wireSlider("offset-y", "val-oy", "px");
wireSlider("anim-speed", "val-speed", "×");
wireSlider("mode-speed", "val-mode-speed", "×");
wireSlider("content-scale", "val-scale", "×");
wireSlider("color-speed", "val-cspeed", "×");
wireSlider("color-intensity", "val-cintensity");

const colorDurationEl = $("color-duration");
const colorDurationDisplay = $("val-cduration");
function updateColorDurationDisplay() {
  const value = parseFloat(colorDurationEl.value);
  colorDurationDisplay.textContent = value === 0 ? "∞" : `${value.toFixed(1)}s`;
}
colorDurationEl.addEventListener("input", updateColorDurationDisplay);
updateColorDurationDisplay();

const modeDurationEl = $("mode-duration");
const modeDurationDisplay = $("val-mode-duration");
function updateModeDurationDisplay() {
  modeDurationDisplay.textContent = `${parseFloat(modeDurationEl.value).toFixed(1)}s`;
}
modeDurationEl.addEventListener("input", updateModeDurationDisplay);
updateModeDurationDisplay();

const ampXEl = $("mode-amplitude-x");
const ampXDisplay = $("val-mode-amp-x");
const ampYEl = $("mode-amplitude-y");
const ampYDisplay = $("val-mode-amp-y");
function updateAmpDisplay() {
  ampXDisplay.textContent = `${Math.round(parseFloat(ampXEl.value) * 100)}%`;
  ampYDisplay.textContent = `${Math.round(parseFloat(ampYEl.value) * 100)}%`;
}
ampXEl.addEventListener("input", updateAmpDisplay);
ampYEl.addEventListener("input", updateAmpDisplay);
updateAmpDisplay();

$("motion-mode").addEventListener("change", () => {
  updateMotionModeUI();
  updateLoopModeUI();
});
updateMotionModeUI();

function updateLoopModeUI() {
  const loopOn = $("loop-mode").checked;
  const mode = $("motion-mode").value;
  const isCyclic = CYCLIC_MOTION_MODES.has(mode);

  $("record-duration").disabled = loopOn;
  $("loop-mode-warning").style.display =
    loopOn && !isCyclic ? "block" : "none";
}

$("loop-mode").addEventListener("change", updateLoopModeUI);
updateLoopModeUI();

$("palette-select").addEventListener("change", refreshPaletteUI);

$("btn-apply-custom-palette").addEventListener("click", applyCustomPalette);
$("custom-palette-input").addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    applyCustomPalette();
  }
});

$("bg-color").addEventListener("input", () => syncBackgroundInputs(false));
$("bg-color-hex").addEventListener("change", () => syncBackgroundInputs(true));
$("bg-transparent").addEventListener("change", () => {
  applyBackgroundModeUI();
  if (!state.isPlaying) {
    initBuffers();
    if (state.hasImage) renderStaticPreview();
  }
});

$("btn-play").addEventListener("click", () => {
  if (!state.hasImage) return;

  if (state.isPlaying) {
    if (state.isRecording) stopRecording();
    stopAnimation();
  } else {
    startAnimation();
  }
});

$("btn-export").addEventListener("click", () => {
  const link = document.createElement("a");
  link.download = "pingpong-frame.png";
  link.href = displayCanvas.toDataURL("image/png");
  link.click();
});

$("btn-record").addEventListener("click", () => {
  if (state.isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
});

$("btn-export-settings").addEventListener("click", () => {
  const payload = buildSettingsPayload();
  $("settings-json").value = JSON.stringify(payload, null, 2);
  cacheSettingsPayload(payload);
  setSettingsStatus("Settings JSON generated.");
});

$("btn-copy-settings").addEventListener("click", async () => {
  const editor = $("settings-json");
  if (!editor.value.trim()) {
    const payload = buildSettingsPayload();
    editor.value = JSON.stringify(payload, null, 2);
    cacheSettingsPayload(payload);
  }

  try {
    await navigator.clipboard.writeText(editor.value);
    setSettingsStatus("Settings JSON copied to clipboard.");
  } catch (error) {
    setSettingsStatus(`Clipboard copy failed: ${error.message}`, true);
  }
});

$("btn-import-settings").addEventListener("click", () => {
  const text = $("settings-json").value.trim();
  if (!text) {
    setSettingsStatus("Paste settings JSON first.", true);
    return;
  }

  try {
    applySettingsPayload(text, { source: "textarea" });
  } catch (error) {
    setSettingsStatus(`Invalid settings JSON: ${error.message}`, true);
  }
});

$("btn-download-settings").addEventListener("click", () => {
  try {
    const text = $("settings-json").value.trim();
    const payload = text ? parseSettingsPayload(text) : buildSettingsPayload();
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "pingpong-settings.json";
    link.click();
    URL.revokeObjectURL(url);
    setSettingsStatus("Settings JSON downloaded.");
  } catch (error) {
    setSettingsStatus(`Download failed: ${error.message}`, true);
  }
});

$("settings-file-input").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    applySettingsPayload(text, { source: file.name });
  } catch (error) {
    setSettingsStatus(`Failed to load settings file: ${error.message}`, true);
  } finally {
    event.target.value = "";
  }
});

$("btn-open-player").addEventListener("click", () => {
  openLeanPlayerFromStudio();
});

$("nav-open-player").addEventListener("click", () => {
  openLeanPlayerFromStudio();
});

$("nav-howto").addEventListener("click", () => {
  openInfoOverlay();
});

$("btn-close-info").addEventListener("click", () => {
  closeInfoOverlay();
});

$("info-overlay").addEventListener("click", (event) => {
  if (event.target === $("info-overlay")) {
    closeInfoOverlay();
  }
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !$("info-overlay").classList.contains("hidden")) {
    event.preventDefault();
    closeInfoOverlay();
    return;
  }

  if (event.key === "?" && !isTypingTarget(event.target)) {
    event.preventDefault();
    openInfoOverlay();
  }
});

try {
  const cachedSettings = localStorage.getItem(SETTINGS_CACHE_KEY);
  if (cachedSettings) {
    applySettingsPayload(cachedSettings, { reprocess: false, source: "cache" });
  } else {
    $("settings-json").value = JSON.stringify(buildSettingsPayload(), null, 2);
  }
} catch (error) {
  console.warn("Failed to load cached settings:", error);
  $("settings-json").value = JSON.stringify(buildSettingsPayload(), null, 2);
}

initBuffers();
updateSizeLabel();
refreshPaletteUI();
syncBackgroundInputs(true);
applyBackgroundModeUI();
$("raster-width").disabled = !$("raster-resize-enabled").checked;
