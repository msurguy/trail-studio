function hexToRgb(hex) {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function lerpColor(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

export function getPaletteColor(paletteColors, t) {
  if (!paletteColors) return null;
  const cols = paletteColors.map(hexToRgb);
  const n = cols.length;
  const s = (((t % 1) + 1) % 1) * n;
  const i = Math.floor(s);
  return lerpColor(cols[i % n], cols[(i + 1) % n], s - i);
}

export function normalizeHexColor(value) {
  if (!value) return null;
  let normalized = value.trim();
  if (!normalized) return null;

  if (!normalized.startsWith("#")) {
    normalized = `#${normalized}`;
  }

  if (/^#[0-9a-fA-F]{3}$/.test(normalized)) {
    normalized = `#${normalized[1]}${normalized[1]}${normalized[2]}${normalized[2]}${normalized[3]}${normalized[3]}`;
  }

  if (!/^#[0-9a-fA-F]{6}$/.test(normalized)) return null;
  return normalized.toLowerCase();
}

export function parsePaletteInput(value) {
  return value.split(",").map(normalizeHexColor).filter(Boolean);
}
