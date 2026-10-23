/**
 * Downscale an image to a JPEG cover (max 600px on the long edge) so the
 * library grid downloads a few dozen KB per tile instead of full-size art.
 */
export async function toCoverJpeg(source: Blob | CanvasImageSource, maxEdge = 600): Promise<Blob> {
  const bitmap = source instanceof Blob ? await createImageBitmap(source) : source;
  const { width: w, height: h } = dimensions(bitmap);
  const scale = Math.min(1, maxEdge / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D unavailable");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  if ("close" in bitmap && typeof bitmap.close === "function") bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/jpeg", 0.85),
  );
}

function dimensions(src: CanvasImageSource): { width: number; height: number } {
  if (src instanceof HTMLVideoElement) return { width: src.videoWidth, height: src.videoHeight };
  if (src instanceof HTMLImageElement) return { width: src.naturalWidth, height: src.naturalHeight };
  const s = src as { width: number | SVGAnimatedLength; height: number | SVGAnimatedLength };
  return {
    width: typeof s.width === "number" ? s.width : s.width.baseVal.value,
    height: typeof s.height === "number" ? s.height : s.height.baseVal.value,
  };
}
