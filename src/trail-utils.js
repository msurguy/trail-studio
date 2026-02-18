const DEFAULT_ALPHA_FLOOR = 2;
const DEFAULT_CLEANUP_INTERVAL = 4;

export function cleanupFaintTrail(
  ctx,
  width,
  height,
  frameCount,
  alphaFloor = DEFAULT_ALPHA_FLOOR,
  interval = DEFAULT_CLEANUP_INTERVAL,
) {
  if (!ctx || !width || !height || alphaFloor <= 0 || interval <= 0) return;
  if (frameCount % interval !== 0) return;

  const imageData = ctx.getImageData(0, 0, width, height);
  const pixels = imageData.data;
  let changed = false;

  for (let i = 3; i < pixels.length; i += 4) {
    if (pixels[i] > alphaFloor) continue;
    if (pixels[i] === 0 && pixels[i - 1] === 0 && pixels[i - 2] === 0 && pixels[i - 3] === 0) {
      continue;
    }

    pixels[i - 3] = 0;
    pixels[i - 2] = 0;
    pixels[i - 1] = 0;
    pixels[i] = 0;
    changed = true;
  }

  if (changed) {
    ctx.putImageData(imageData, 0, 0);
  }
}
