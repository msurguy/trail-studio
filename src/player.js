import picaFactory from "pica";

import { HQ_RESIZE_OPTIONS, PALETTES } from "./constants";
import { getPaletteColor } from "./color-utils";
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
  DEFAULT_SETTINGS,
  SETTINGS_CACHE_KEY,
  createSettingsPayload,
  parseSettingsPayload,
} from "./settings";

const pica = picaFactory();

const state = createInitialState();
const settings = { ...DEFAULT_SETTINGS };

const bufferA = document.createElement("canvas");
const bufferB = document.createElement("canvas");

const $ = (id) => document.getElementById(id);
const canvas = $("player-canvas");
const ctx = canvas.getContext("2d");
const settingsTextEl = $("player-settings-json");

let rawImage = null;
let rawFileName = "";

function setStatus(message, isError = false) {
  const status = $("player-status");
  status.textContent = message;
  status.style.color = isError ? "#fba3a3" : "#96a3be";
}

function getCanvasSize() {
  if (settings.canvasPreset === "custom") {
    return { w: settings.customW, h: settings.customH };
  }

  const [w, h] = settings.canvasPreset.split(",").map(Number);
  return { w, h };
}

function getSelectedPalette() {
  if (settings.paletteSelect === "custom") {
    return settings.customPalette;
  }

  const idx = parseInt(settings.paletteSelect, 10);
  return Number.isFinite(idx) ? PALETTES[idx] : null;
}

function paintBackground(targetCtx, width, height) {
  targetCtx.globalCompositeOperation = "source-over";
  targetCtx.globalAlpha = 1;
  if (settings.bgTransparent) return;
  targetCtx.fillStyle = settings.bgColor;
  targetCtx.fillRect(0, 0, width, height);
}

function initBuffers() {
  const { w, h } = getCanvasSize();

  bufferA.width = w;
  bufferA.height = h;
  bufferB.width = w;
  bufferB.height = h;

  bufferA.getContext("2d").clearRect(0, 0, w, h);
  bufferB.getContext("2d").clearRect(0, 0, w, h);

  canvas.width = w;
  canvas.height = h;
  ctx.clearRect(0, 0, w, h);
  paintBackground(ctx, w, h);
}

function renderStaticPreview() {
  if (!state.trimmedCanvas) return;

  const { w, h } = getCanvasSize();
  const spriteW = state.trimmedCanvas.width * settings.contentScale;
  const spriteH = state.trimmedCanvas.height * settings.contentScale;

  state.posX = (w - spriteW) / 2;
  state.posY = (h - spriteH) / 2;

  ctx.clearRect(0, 0, w, h);
  paintBackground(ctx, w, h);
  ctx.drawImage(state.trimmedCanvas, state.posX, state.posY, spriteW, spriteH);
}

async function processImage(img, fileName) {
  rawImage = img;
  rawFileName = fileName;
  const requestId = ++state.processRequestId;

  const sourceW = img.naturalWidth || img.width;
  const sourceH = img.naturalHeight || img.height;
  if (!sourceW || !sourceH) {
    throw new Error("Failed to read image size.");
  }

  const typeFlags = getFileTypeFlags(fileName);

  const { isSvg, isJpg, mode, targetW, targetH } = getTargetDimensions(
    sourceW,
    sourceH,
    {
      ...typeFlags,
      transparencyMode: settings.transparencyMode,
      svgWidth: settings.svgWidth,
      svgScaleMultiplier: settings.svgScaleMultiplier,
      rasterResizeEnabled: settings.rasterResizeEnabled,
      rasterWidth: settings.rasterWidth,
    },
  );

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
      tmp.getContext("2d").drawImage(sourceCanvas, 0, 0, targetW, targetH);
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

  const imageData = tmp.getContext("2d", { willReadFrequently: true }).getImageData(
    0,
    0,
    tmp.width,
    tmp.height,
  );

  let effectiveMode = isJpg ? mode : "none";
  let bounds = findContentBounds(imageData, effectiveMode);

  if (!bounds && isJpg && effectiveMode !== "none") {
    bounds = findContentBounds(imageData, "none");
    if (bounds) effectiveMode = "none";
  }

  if (!bounds) {
    bounds = { x: 0, y: 0, w: tmp.width, h: tmp.height };
  }

  const trimmed = trimImage(tmp, bounds, effectiveMode);
  if (requestId !== state.processRequestId) return;

  state.trimmedCanvas = trimmed;
  state.hasImage = true;

  $("player-empty").style.display = "none";
  $("player-btn-play").disabled = false;

  initBuffers();
  renderStaticPreview();

  setStatus(`Image ready: ${fileName} (${trimmed.width}×${trimmed.height})`);
}

function runProcessImage(img, fileName) {
  processImage(img, fileName).catch((error) => {
    console.error("Player image processing failed:", error);
    setStatus(`Image load failed: ${error.message}`, true);
  });
}

function reprocessImage() {
  if (!rawImage) return;
  runProcessImage(rawImage, rawFileName);
}

function processTextFromSettings() {
  const text = settings.textContent;
  if (!text) return;

  const fontSize = settings.textFontSize || 128;
  const fontFamily = settings.textFontFamily || "sans-serif";
  const textColor = settings.textColor || "#ffffff";

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

  const textCanvas = document.createElement("canvas");
  textCanvas.width = canvasW;
  textCanvas.height = canvasH;
  const tCtx = textCanvas.getContext("2d");

  tCtx.clearRect(0, 0, canvasW, canvasH);
  tCtx.font = `${fontSize}px ${fontFamily}`;
  tCtx.fillStyle = textColor;
  tCtx.textBaseline = "top";
  tCtx.fillText(text, pad, pad);

  state.trimmedCanvas = textCanvas;
  state.hasImage = true;
  state.inputMode = "text";

  $("player-empty").style.display = "none";
  $("player-btn-play").disabled = false;

  initBuffers();
  const { w, h } = getCanvasSize();
  state.posX = (w - textCanvas.width) / 2;
  state.posY = (h - textCanvas.height) / 2;
  renderStaticPreview();

  setStatus(`Text ready: "${text}" (${textCanvas.width}×${textCanvas.height})`);
}

function animate() {
  const trimmed = state.trimmedCanvas;
  if (!trimmed) return;

  const { w, h } = getCanvasSize();
  const palette = getSelectedPalette();

  const readBuf = state.pingPong ? bufferB : bufferA;
  const writeBuf = state.pingPong ? bufferA : bufferB;
  const wCtx = writeBuf.getContext("2d");

  wCtx.clearRect(0, 0, w, h);

  wCtx.globalAlpha = settings.alphaDecay;
  wCtx.globalCompositeOperation = "source-over";
  wCtx.drawImage(readBuf, settings.offsetX * settings.animSpeed, settings.offsetY * settings.animSpeed);
  wCtx.globalAlpha = 1;

  if (palette) {
    let doColor = true;
    if (settings.colorDuration > 0) {
      const elapsed = state.colorTime / 60;
      if (elapsed > settings.colorDuration) doColor = false;
    }

    if (doColor) {
      const color = getPaletteColor(
        palette,
        state.colorTime * settings.colorSpeed * 0.01,
      );
      if (color) {
        wCtx.globalCompositeOperation = "source-atop";
        wCtx.fillStyle = `rgba(${color[0]},${color[1]},${color[2]},${settings.colorIntensity})`;
        wCtx.fillRect(0, 0, w, h);
        wCtx.globalCompositeOperation = "source-over";
      }
    }
  }

  const spriteWidth = trimmed.width * settings.contentScale;
  const spriteHeight = trimmed.height * settings.contentScale;

  updateMotionPosition(state, {
    mode: settings.motionMode,
    width: w,
    height: h,
    spriteWidth,
    spriteHeight,
    ampX: settings.modeAmplitudeX,
    ampY: settings.modeAmplitudeY,
    speed: settings.animSpeed,
    modeSpeed: settings.modeSpeed,
    modeDuration: settings.modeDuration,
    loopMode: settings.loopMode || false,
  });

  wCtx.globalAlpha = 1;
  wCtx.drawImage(trimmed, state.posX, state.posY, spriteWidth, spriteHeight);

  ctx.clearRect(0, 0, w, h);
  paintBackground(ctx, w, h);
  ctx.drawImage(writeBuf, 0, 0);

  state.pingPong = !state.pingPong;
  state.time += 1;
  state.colorTime += 1;

  state.animId = requestAnimationFrame(animate);
}

function startAnimation() {
  if (!state.trimmedCanvas) return;

  const { w, h } = getCanvasSize();
  const spriteWidth = state.trimmedCanvas.width * settings.contentScale;
  const spriteHeight = state.trimmedCanvas.height * settings.contentScale;

  initBuffers();

  state.posX = (w - spriteWidth) / 2;
  state.posY = (h - spriteHeight) / 2;

  const angle = Math.random() * Math.PI * 2;
  state.velX = Math.cos(angle);
  state.velY = Math.sin(angle);
  state.time = 0;
  state.colorTime = 0;
  state.pingPong = false;
  state.isPlaying = true;

  $("player-btn-play").textContent = "Stop";
  setStatus("Playback running.");

  state.animId = requestAnimationFrame(animate);
}

function stopAnimation() {
  if (state.animId) cancelAnimationFrame(state.animId);
  state.animId = null;
  state.isPlaying = false;
  $("player-btn-play").textContent = "Play";

  if (state.trimmedCanvas) {
    renderStaticPreview();
  }

  setStatus("Playback stopped.");
}

function applyParsedSettings(payload, source = "manual") {
  Object.assign(settings, payload.settings);
  settingsTextEl.value = JSON.stringify(payload, null, 2);

  try {
    localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn("Failed to cache settings:", error);
  }

  if (settings.inputMode === "text" && settings.textContent) {
    processTextFromSettings();
    setStatus(`Settings applied (${source}) — text mode.`);
  } else if (state.hasImage) {
    reprocessImage();
    setStatus(`Settings applied (${source}).`);
  } else if (settings.inputMode === "text") {
    initBuffers();
    paintBackground(ctx, canvas.width, canvas.height);
    setStatus("Settings applied but text content is empty. Re-export from studio with text entered.", true);
  } else {
    initBuffers();
    paintBackground(ctx, canvas.width, canvas.height);
    setStatus(`Settings applied (${source}). Load an image or use text mode to start.`);
  }
}

function applySettingsFromText() {
  const text = settingsTextEl.value.trim();
  if (!text) {
    setStatus("Paste settings JSON first.", true);
    return;
  }

  try {
    const payload = parseSettingsPayload(text);
    applyParsedSettings(payload, "textarea");
  } catch (error) {
    setStatus(`Invalid settings JSON: ${error.message}`, true);
  }
}

async function readSettingsFile(file) {
  const text = await file.text();
  const payload = parseSettingsPayload(text);
  applyParsedSettings(payload, file.name);
}

function enterFullscreen() {
  const stage = $("player-stage-wrap");
  if (!document.fullscreenElement) {
    stage.requestFullscreen().catch((error) => {
      setStatus(`Fullscreen failed: ${error.message}`, true);
    });
  } else {
    document.exitFullscreen().catch(() => {});
  }
}

$("player-image-input").addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  setStatus(`Loading ${file.name}...`);
  loadFile(file, runProcessImage);
});

$("player-settings-file-input").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    await readSettingsFile(file);
  } catch (error) {
    setStatus(`Failed to read settings file: ${error.message}`, true);
  }
});

$("player-btn-apply-settings").addEventListener("click", () => {
  applySettingsFromText();
});

$("player-btn-play").addEventListener("click", () => {
  if (!state.hasImage) return;

  if (state.isPlaying) {
    stopAnimation();
  } else {
    startAnimation();
  }
});

$("player-btn-fullscreen").addEventListener("click", () => {
  enterFullscreen();
});

window.addEventListener("keydown", (event) => {
  if (event.code === "Space") {
    event.preventDefault();
    if (!state.hasImage) return;
    if (state.isPlaying) stopAnimation();
    else startAnimation();
  }

  if (event.code === "KeyF") {
    event.preventDefault();
    enterFullscreen();
  }
});

function bootstrapSettings() {
  try {
    const cached = localStorage.getItem(SETTINGS_CACHE_KEY);
    if (cached) {
      const payload = parseSettingsPayload(cached);
      applyParsedSettings(payload, "cached");
      return;
    }
  } catch (error) {
    console.warn("Failed to bootstrap cached settings:", error);
  }

  const payload = createSettingsPayload(DEFAULT_SETTINGS);
  settingsTextEl.value = JSON.stringify(payload, null, 2);
}

initBuffers();
bootstrapSettings();
