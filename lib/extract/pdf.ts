import { canvasToJpeg } from "./image";

/**
 * Render a PDF's first page as a cover image (browser only). pdf.js is loaded
 * on demand, so it only costs anything when a PDF is actually involved.
 */
export async function pdfCover(source: Blob | ArrayBuffer, maxEdge = 600): Promise<Blob | undefined> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const data = new Uint8Array(source instanceof Blob ? await source.arrayBuffer() : source.slice(0));
  const doc = await pdfjs.getDocument({ data }).promise;
  try {
    if (!doc.numPages) return undefined;
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: maxEdge / Math.max(base.width, base.height) });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    ctx.fillStyle = "#fff"; // PDFs assume a white page
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    return canvasToJpeg(canvas);
  } finally {
    await doc.destroy();
  }
}
