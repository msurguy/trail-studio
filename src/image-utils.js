export function getFileTypeFlags(fileName) {
  const name = fileName.toLowerCase();
  return {
    isSvg: name.endsWith(".svg"),
    isJpg: name.endsWith(".jpg") || name.endsWith(".jpeg"),
    isPng: name.endsWith(".png"),
  };
}

export function getTargetDimensions(sourceW, sourceH, options) {
  const {
    isSvg,
    isJpg,
    isPng,
    transparencyMode,
    svgWidth,
    svgScaleMultiplier,
    rasterResizeEnabled,
    rasterWidth,
  } = options;

  let targetW = sourceW;
  let targetH = sourceH;
  let mode = "none";
  let sizeLabel = `Original: ${sourceW}×${sourceH}`;

  if (isJpg) mode = transparencyMode;

  if (isSvg) {
    const multiplier =
      Number.isFinite(svgScaleMultiplier) && svgScaleMultiplier > 0
        ? svgScaleMultiplier
        : 1;
    const finalSvgWidth = Number.isFinite(svgWidth) ? svgWidth * multiplier : svgWidth;
    if (Number.isFinite(finalSvgWidth) && finalSvgWidth > 0 && sourceW > 0) {
      const scale = finalSvgWidth / sourceW;
      targetW = Math.max(1, Math.round(finalSvgWidth));
      targetH = Math.max(1, Math.round(sourceH * scale));
    }
    sizeLabel =
      `SVG source: ${sourceW}×${sourceH} → rasterized: ${targetW}×${targetH}`;
  } else if ((isPng || isJpg) && rasterResizeEnabled) {
    if (Number.isFinite(rasterWidth) && rasterWidth > 0 && sourceW > 0) {
      const scale = rasterWidth / sourceW;
      targetW = Math.max(1, Math.round(rasterWidth));
      targetH = Math.max(1, Math.round(sourceH * scale));
    }
    sizeLabel = `Original: ${sourceW}×${sourceH} → resized: ${targetW}×${targetH}`;
  }

  return { isSvg, isJpg, mode, targetW, targetH, sizeLabel };
}

export async function resizeCanvasHighQuality({
  pica,
  srcCanvas,
  targetW,
  targetH,
  options,
}) {
  if (srcCanvas.width === targetW && srcCanvas.height === targetH) {
    return srcCanvas;
  }

  const outCanvas = document.createElement("canvas");
  outCanvas.width = targetW;
  outCanvas.height = targetH;
  await pica.resize(srcCanvas, outCanvas, options);
  return outCanvas;
}

export function findContentBounds(imageData, mode) {
  const { data, width, height } = imageData;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];

      let transparent = false;
      if (a < 10) transparent = true;
      if (!transparent && mode === "black" && r < 20 && g < 20 && b < 20) {
        transparent = true;
      }
      if (!transparent && mode === "white" && r > 235 && g > 235 && b > 235) {
        transparent = true;
      }

      if (!transparent) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < 0) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

export function trimImage(srcCanvas, bounds, mode) {
  const canvas = document.createElement("canvas");
  canvas.width = bounds.w;
  canvas.height = bounds.h;

  const ctx = canvas.getContext("2d");
  const srcCtx = srcCanvas.getContext("2d");
  const srcData = srcCtx.getImageData(bounds.x, bounds.y, bounds.w, bounds.h);
  const data = srcData.data;

  if (mode === "black" || mode === "white") {
    for (let i = 0; i < data.length; i += 4) {
      if (mode === "black" && data[i] < 20 && data[i + 1] < 20 && data[i + 2] < 20) {
        data[i + 3] = 0;
      }
      if (mode === "white" && data[i] > 235 && data[i + 1] > 235 && data[i + 2] > 235) {
        data[i + 3] = 0;
      }
    }
  }

  ctx.putImageData(srcData, 0, 0);
  return canvas;
}

export async function loadFile(file, runProcessImage) {
  const isSvg = file.name.toLowerCase().endsWith(".svg");

  if (isSvg) {
    const reader = new FileReader();
    reader.onload = (event) => {
      const svgText = event.target.result;
      const blob = new Blob([svgText], { type: "image/svg+xml" });
      const url = URL.createObjectURL(blob);
      const img = new Image();

      img.onload = () => {
        runProcessImage(img, file.name);
        URL.revokeObjectURL(url);
      };
      img.onerror = () => {
        alert("Failed to load SVG.");
        URL.revokeObjectURL(url);
      };
      img.src = url;
    };

    reader.readAsText(file);
    return;
  }

  try {
    const bitmap = await createImageBitmap(file);
    runProcessImage(bitmap, file.name);
  } catch (error) {
    console.warn("createImageBitmap failed, falling back to Image decode.", error);
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => runProcessImage(img, file.name);
      img.onerror = () => alert("Failed to load image.");
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  }
}
