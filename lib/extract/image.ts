/**
 * Downscale an image to a JPEG cover (max 600px on the long edge) so the
 * library grid downloads a few dozen KB per tile instead of full-size art.
 */
export async function toCoverJpeg(source: Blob | CanvasImageSource, maxEdge = 600): Promise<Blob> {
  const canvas = drawScaled(source instanceof Blob ? await decodeImage(source) : source, maxEdge);
  return canvasToJpeg(canvas);
}

/** Draw `src` onto a new canvas no larger than `maxEdge` on its long side. */
export function drawScaled(src: CanvasImageSource, maxEdge: number): HTMLCanvasElement {
  const { width: w, height: h } = dimensions(src);
  if (!w || !h) throw new Error("Image has no dimensions");
  const scale = Math.min(1, maxEdge / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D unavailable");
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
  if ("close" in src && typeof src.close === "function") src.close();
  return canvas;
}

export function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/jpeg", 0.85),
  );
}

/**
 * Decode an image blob. `createImageBitmap` is fastest, but Safari rejects
 * some JPEG/PNG variants (and blobs with an odd MIME type), so fall back to
 * an <img> element, which decodes anything the browser can display.
 */
export async function decodeImage(blob: Blob): Promise<ImageBitmap | HTMLImageElement> {
  try {
    return await createImageBitmap(blob);
  } catch {
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      // The decoded pixels stay usable after the URL is revoked.
      URL.revokeObjectURL(url);
    }
  }
}

/** Pixel size of a local image file, if the browser can decode it. */
export async function imageSize(blob: Blob): Promise<{ width: number; height: number }> {
  const img = await decodeImage(blob);
  const size = dimensions(img);
  if ("close" in img) img.close();
  return size;
}

/**
 * True when a frame is (nearly) black: average luminance below `threshold`
 * (0–255). Samples every 4th pixel of RGBA data, which is plenty for a
 * downscaled poster.
 */
export function isMostlyDark(rgba: Uint8ClampedArray, threshold = 16): boolean {
  let sum = 0;
  let count = 0;
  for (let i = 0; i + 2 < rgba.length; i += 16) {
    sum += 0.2126 * rgba[i]! + 0.7152 * rgba[i + 1]! + 0.0722 * rgba[i + 2]!;
    count++;
  }
  return count === 0 || sum / count < threshold;
}

function dimensions(src: CanvasImageSource): { width: number; height: number } {
  if (typeof HTMLVideoElement !== "undefined" && src instanceof HTMLVideoElement)
    return { width: src.videoWidth, height: src.videoHeight };
  if (typeof HTMLImageElement !== "undefined" && src instanceof HTMLImageElement)
    return { width: src.naturalWidth, height: src.naturalHeight };
  const s = src as { width: number | SVGAnimatedLength; height: number | SVGAnimatedLength };
  return {
    width: typeof s.width === "number" ? s.width : s.width.baseVal.value,
    height: typeof s.height === "number" ? s.height : s.height.baseVal.value,
  };
}
