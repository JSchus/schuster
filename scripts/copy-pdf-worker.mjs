// Copy pdf.js's worker into public/ so it's served as a plain static file at
// /pdf.worker.min.mjs, matching the installed pdfjs-dist version. Runs before
// `next dev` and `next build`.
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const src = require.resolve("pdfjs-dist/legacy/build/pdf.worker.min.mjs");
mkdirSync(new URL("../public/", import.meta.url), { recursive: true });
copyFileSync(src, new URL("../public/pdf.worker.min.mjs", import.meta.url));
