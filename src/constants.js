export const HQ_RESIZE_OPTIONS = {
  quality: 3,
  alpha: true,
  unsharpAmount: 80,
  unsharpRadius: 0.6,
  unsharpThreshold: 2,
};

export const PALETTES = [
  null,
  ["#ff00ff", "#00ffff", "#ff0066", "#66ff00", "#ffff00", "#0066ff"],
  ["#ff4500", "#ff6347", "#ff8c00", "#ffd700", "#ff1493", "#dc143c"],
  ["#001f3f", "#0074D9", "#7FDBFF", "#39CCCC", "#01FF70", "#2ECC40"],
  ["#ff71ce", "#01cdfe", "#05ffa1", "#b967ff", "#fffb96", "#f3baff"],
  ["#ff0000", "#ff3300", "#ff6600", "#ff9900", "#ffcc00", "#ffffff"],
  ["#00c9ff", "#92fe9d", "#f9d423", "#ff4e50", "#a044ff", "#00f2fe"],
  ["#ffffff", "#cccccc", "#999999", "#666666", "#cccccc", "#ffffff"],
];

export const CYCLIC_MOTION_MODES = new Set([
  "orbit",
  "figure8",
  "lissajous",
  "spiral",
  "zigzag",
]);

export const AMPLITUDE_MOTION_MODES = new Set([
  "bounce",
  "drift",
  "orbit",
  "figure8",
  "lissajous",
  "spiral",
  "zigzag",
]);
