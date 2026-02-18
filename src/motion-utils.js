import { CYCLIC_MOTION_MODES } from "./constants";

export function updateMotionPosition(state, params) {
  const {
    mode,
    width,
    height,
    spriteWidth,
    spriteHeight,
    ampX,
    ampY,
    speed,
    modeSpeed,
    modeDuration,
    loopMode = false,
  } = params;

  const cx = width / 2 - spriteWidth / 2;
  const cy = height / 2 - spriteHeight / 2;
  const rangeW = Math.max(0, width - spriteWidth);
  const rangeH = Math.max(0, height - spriteHeight);
  const minX = ((1 - ampX) * rangeW) / 2;
  const minY = ((1 - ampY) * rangeH) / 2;
  const maxX = minX + rangeW * ampX;
  const maxY = minY + rangeH * ampY;
  const maxRx = Math.max(0, rangeW * 0.45 * ampX);
  const maxRy = Math.max(0, rangeH * 0.45 * ampY);

  const isCyclicMode = CYCLIC_MOTION_MODES.has(mode);
  const cycleSeconds = Math.max(0.25, modeDuration);
  // In loop mode, snap speed*modeSpeed to nearest integer so motion completes
  // full periods at the cycle boundary (ensures seamless loop)
  const effectiveSpeedProduct = loopMode
    ? Math.max(1, Math.round(speed * modeSpeed))
    : speed * modeSpeed;
  const cycleT =
    (state.time / (cycleSeconds * 60)) * Math.PI * 2 * effectiveSpeedProduct;
  const freeT = state.time * 0.02 * speed * modeSpeed;
  const t = isCyclicMode ? cycleT : freeT;

  if (mode === "bounce") {
    state.posX += state.velX * modeSpeed * speed;
    state.posY += state.velY * modeSpeed * speed;

    if (state.posX <= minX || state.posX >= maxX) {
      state.velX *= -1;
      state.posX = Math.max(minX, Math.min(state.posX, maxX));
    }
    if (state.posY <= minY || state.posY >= maxY) {
      state.velY *= -1;
      state.posY = Math.max(minY, Math.min(state.posY, maxY));
    }
    return;
  }

  if (mode === "orbit") {
    const rx = rangeW * 0.35 * ampX;
    const ry = rangeH * 0.35 * ampY;
    state.posX = cx + Math.cos(t) * rx;
    state.posY = cy + Math.sin(t) * ry;
    return;
  }

  if (mode === "drift") {
    state.posX += state.velX * modeSpeed * speed * 0.8;
    state.posY += state.velY * modeSpeed * speed * 0.3;

    if (state.posX > maxX) state.posX = minX;
    if (state.posX < minX) state.posX = maxX;
    if (state.posY > maxY) state.posY = minY;
    if (state.posY < minY) state.posY = maxY;
    return;
  }

  if (mode === "figure8") {
    state.posX = cx + Math.sin(t) * maxRx * 0.9;
    state.posY = cy + Math.sin(t * 2) * maxRy * 0.55;
    return;
  }

  if (mode === "lissajous") {
    const lx = loopMode ? 2 : 1.7;
    const ly = loopMode ? 3 : 2.3;
    state.posX = cx + Math.sin(t * lx + Math.PI / 2) * maxRx * 0.95;
    state.posY = cy + Math.sin(t * ly) * maxRy * 0.95;
    return;
  }

  if (mode === "spiral") {
    const spiralMul = loopMode ? 1.0 : 0.55;
    const orbitMul = loopMode ? 1.0 : 1.2;
    const spiralPhase = t * spiralMul;
    const radiusBlend = 0.15 + 0.85 * ((Math.sin(spiralPhase) + 1) / 2);
    const rx = maxRx * radiusBlend;
    const ry = maxRy * radiusBlend;
    state.posX = cx + Math.cos(t * orbitMul) * rx;
    state.posY = cy + Math.sin(t * orbitMul) * ry;
    return;
  }

  if (mode === "zigzag") {
    const zigNorm = ((t / (Math.PI * 2)) % 1 + 1) % 1;
    const zigTri = zigNorm < 0.5 ? zigNorm * 2 : (1 - zigNorm) * 2;
    state.posX = minX + (maxX - minX) * zigTri;
    const zigYMul = loopMode ? 1.0 : 1.4;
    state.posY = cy + Math.sin(t * zigYMul) * maxRy * 0.65;
    return;
  }

  state.posX = (width - spriteWidth) / 2;
  state.posY = (height - spriteHeight) / 2;
}
