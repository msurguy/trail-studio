import { normalizeHexColor } from "./color-utils";
import { PALETTES } from "./constants";

export const SETTINGS_SCHEMA = "pingpong-trail-studio-settings";
export const SETTINGS_VERSION = 1;
export const SETTINGS_CACHE_KEY = "pingpong:settings-json";

const ALLOWED_CANVAS_PRESETS = new Set([
  "512,512",
  "800,600",
  "1024,768",
  "1280,720",
  "1920,1080",
  "custom",
]);

const ALLOWED_MOTION_MODES = new Set([
  "bounce",
  "orbit",
  "drift",
  "figure8",
  "lissajous",
  "spiral",
  "zigzag",
  "static",
]);

const ALLOWED_TRANSPARENCY_MODES = new Set(["none", "black", "white"]);

const MAX_PALETTE_INDEX = PALETTES.length - 1;

export const DEFAULT_SETTINGS = {
  canvasPreset: "800,600",
  customW: 800,
  customH: 600,
  alphaDecay: 0.92,
  offsetX: 1.5,
  offsetY: 0.5,
  animSpeed: 1.0,
  contentScale: 1.0,
  motionMode: "bounce",
  modeSpeed: 2.0,
  modeDuration: 8.0,
  modeAmplitudeX: 0.9,
  modeAmplitudeY: 0.9,
  bgColor: "#000000",
  bgTransparent: false,
  paletteSelect: "0",
  customPalette: ["#ff00ff", "#00ffff", "#ffb703", "#00ff66", "#ff006e"],
  colorSpeed: 0.3,
  colorIntensity: 0.6,
  colorDuration: 0,
  transparencyMode: "none",
  rasterWidth: 1600,
  rasterResizeEnabled: false,
  svgWidth: 1200,
  svgScaleMultiplier: 1,
  recordDuration: 5,
};

function clampNumber(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function normalizePaletteSelect(value) {
  if (value === "custom") return "custom";
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_SETTINGS.paletteSelect;
  const clamped = Math.max(0, Math.min(MAX_PALETTE_INDEX, parsed));
  return String(clamped);
}

function normalizeCustomPalette(value) {
  const source = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];

  const normalized = source
    .map((entry) => normalizeHexColor(String(entry || "")))
    .filter(Boolean);

  if (normalized.length >= 2) {
    return normalized;
  }

  return [...DEFAULT_SETTINGS.customPalette];
}

export function sanitizeSettings(input = {}) {
  const source = input && typeof input === "object" ? input : {};

  const canvasPreset = ALLOWED_CANVAS_PRESETS.has(source.canvasPreset)
    ? source.canvasPreset
    : DEFAULT_SETTINGS.canvasPreset;

  const motionMode = ALLOWED_MOTION_MODES.has(source.motionMode)
    ? source.motionMode
    : DEFAULT_SETTINGS.motionMode;

  const transparencyMode = ALLOWED_TRANSPARENCY_MODES.has(source.transparencyMode)
    ? source.transparencyMode
    : DEFAULT_SETTINGS.transparencyMode;

  const bgColor =
    normalizeHexColor(source.bgColor) ||
    normalizeHexColor(source.bgColorHex) ||
    DEFAULT_SETTINGS.bgColor;

  return {
    canvasPreset,
    customW: Math.round(clampNumber(source.customW, DEFAULT_SETTINGS.customW, 64, 3840)),
    customH: Math.round(clampNumber(source.customH, DEFAULT_SETTINGS.customH, 64, 2160)),
    alphaDecay: clampNumber(source.alphaDecay, DEFAULT_SETTINGS.alphaDecay, 0.5, 0.99),
    offsetX: clampNumber(source.offsetX, DEFAULT_SETTINGS.offsetX, -8, 8),
    offsetY: clampNumber(source.offsetY, DEFAULT_SETTINGS.offsetY, -8, 8),
    animSpeed: clampNumber(source.animSpeed, DEFAULT_SETTINGS.animSpeed, 0.1, 4),
    contentScale: clampNumber(source.contentScale, DEFAULT_SETTINGS.contentScale, 0.1, 3),
    motionMode,
    modeSpeed: clampNumber(source.modeSpeed, DEFAULT_SETTINGS.modeSpeed, 0.1, 8),
    modeDuration: clampNumber(source.modeDuration, DEFAULT_SETTINGS.modeDuration, 1, 30),
    modeAmplitudeX: clampNumber(
      source.modeAmplitudeX,
      DEFAULT_SETTINGS.modeAmplitudeX,
      0.1,
      1,
    ),
    modeAmplitudeY: clampNumber(
      source.modeAmplitudeY,
      DEFAULT_SETTINGS.modeAmplitudeY,
      0.1,
      1,
    ),
    bgColor,
    bgTransparent: Boolean(source.bgTransparent),
    paletteSelect: normalizePaletteSelect(source.paletteSelect),
    customPalette: normalizeCustomPalette(source.customPalette),
    colorSpeed: clampNumber(source.colorSpeed, DEFAULT_SETTINGS.colorSpeed, 0.01, 2),
    colorIntensity: clampNumber(source.colorIntensity, DEFAULT_SETTINGS.colorIntensity, 0, 1),
    colorDuration: clampNumber(source.colorDuration, DEFAULT_SETTINGS.colorDuration, 0, 30),
    transparencyMode,
    rasterWidth: Math.round(
      clampNumber(source.rasterWidth, DEFAULT_SETTINGS.rasterWidth, 32, 8192),
    ),
    rasterResizeEnabled: Boolean(source.rasterResizeEnabled),
    svgWidth: Math.round(clampNumber(source.svgWidth, DEFAULT_SETTINGS.svgWidth, 32, 8192)),
    svgScaleMultiplier: Math.round(
      clampNumber(source.svgScaleMultiplier, DEFAULT_SETTINGS.svgScaleMultiplier, 1, 3),
    ),
    recordDuration: Math.round(
      clampNumber(source.recordDuration, DEFAULT_SETTINGS.recordDuration, 1, 120),
    ),
  };
}

export function createSettingsPayload(rawSettings, exportedAt = new Date().toISOString()) {
  return {
    schema: SETTINGS_SCHEMA,
    version: SETTINGS_VERSION,
    exportedAt,
    settings: sanitizeSettings(rawSettings),
  };
}

export function parseSettingsPayload(input) {
  let parsed = input;

  if (typeof input === "string") {
    parsed = JSON.parse(input);
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Settings payload must be a JSON object.");
  }

  const sourceSettings =
    parsed.settings && typeof parsed.settings === "object" ? parsed.settings : parsed;

  const exportedAt =
    typeof parsed.exportedAt === "string" ? parsed.exportedAt : new Date().toISOString();

  return createSettingsPayload(sourceSettings, exportedAt);
}
