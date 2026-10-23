import JSZip from "jszip";

export type EpubInfo = {
  title?: string;
  author?: string;
  description?: string;
  publisher?: string;
  language?: string;
  subjects: string[];
  cover?: { data: Uint8Array; mime: string };
};

/**
 * Read metadata and the cover image from an EPUB (2 or 3) entirely in the
 * browser: container.xml → OPF package → Dublin Core + manifest.
 */
export async function parseEpub(data: ArrayBuffer | Uint8Array | Blob): Promise<EpubInfo> {
  const zip = await JSZip.loadAsync(data);
  const container = await readXml(zip, "META-INF/container.xml");
  const opfPath = byLocalName(container, "rootfile")[0]?.getAttribute("full-path");
  if (!opfPath) throw new Error("EPUB has no rootfile");
  const opf = await readXml(zip, opfPath);
  const baseDir = opfPath.includes("/") ? opfPath.slice(0, opfPath.lastIndexOf("/") + 1) : "";

  const dc = (name: string) =>
    byLocalName(opf, name)
      .map((el) => el.textContent?.trim() ?? "")
      .filter(Boolean);

  let cover: EpubInfo["cover"];
  const found = await findCover(zip, opf, baseDir);
  if (found) {
    const file = zipFile(zip, found.path);
    if (file) cover = { data: await file.async("uint8array"), mime: found.mime };
  }

  return {
    title: dc("title")[0],
    author: dc("creator").join(", ") || undefined,
    description: stripHtml(dc("description")[0]),
    publisher: dc("publisher")[0],
    language: dc("language")[0],
    subjects: [...new Set(dc("subject").flatMap((s) => s.split(/\s*[,;]\s*/)))].filter(Boolean),
    cover,
  };
}

type ManifestItem = { id: string; href: string; path: string; mime: string; properties: string };
type CoverRef = { path: string; mime: string };

/**
 * Locate the cover image, trying in order:
 *  1. EPUB 3 manifest item with `properties="cover-image"`
 *  2. EPUB 2 `<meta name="cover" content="item-id">` (id matched case-insensitively)
 *  3. the cover *page* named by `<guide><reference type="cover">` or the EPUB 3
 *     landmarks nav, and the first image on that page
 *  4. an image whose id/filename mentions "cover", else the first image
 */
async function findCover(zip: JSZip, opf: Document, baseDir: string): Promise<CoverRef | undefined> {
  const items: ManifestItem[] = byLocalName(opf, "item").map((el) => {
    const href = el.getAttribute("href") ?? "";
    return {
      id: el.getAttribute("id") ?? "",
      href,
      path: resolvePath(baseDir, href),
      mime: el.getAttribute("media-type") ?? "",
      properties: el.getAttribute("properties") ?? "",
    };
  });
  const images = items.filter((i) => i.mime.startsWith("image/") && !i.mime.includes("svg"));

  const byProperty = images.find((i) => i.properties.split(/\s+/).includes("cover-image"));
  if (byProperty) return byProperty;

  const metaCover = byLocalName(opf, "meta")
    .find((m) => m.getAttribute("name")?.toLowerCase() === "cover")
    ?.getAttribute("content")
    ?.trim();
  if (metaCover) {
    const byMeta =
      images.find((i) => i.id.toLowerCase() === metaCover.toLowerCase()) ??
      images.find((i) => i.path === resolvePath(baseDir, metaCover));
    if (byMeta) return byMeta;
  }

  for (const pagePath of await coverPagePaths(zip, opf, baseDir, items)) {
    const img = await firstImageOnPage(zip, pagePath);
    if (img) return { path: img, mime: images.find((i) => i.path === img)?.mime ?? mimeFromName(img) };
  }

  return images.find((i) => /cover/i.test(i.id) || /cover/i.test(i.href)) ?? images[0];
}

/** Cover page paths from the EPUB 2 guide and the EPUB 3 landmarks nav. */
async function coverPagePaths(
  zip: JSZip,
  opf: Document,
  baseDir: string,
  items: ManifestItem[],
): Promise<string[]> {
  const paths = byLocalName(opf, "reference")
    .filter((r) => r.getAttribute("type")?.toLowerCase() === "cover")
    .map((r) => resolvePath(baseDir, r.getAttribute("href") ?? ""));

  const nav = items.find((i) => i.properties.split(/\s+/).includes("nav"));
  const navDoc = nav ? await readMarkup(zip, nav.path) : undefined;
  if (nav && navDoc) {
    const navDir = dirOf(nav.path);
    for (const a of byLocalName(navDoc, "a")) {
      const isCover = Array.from(a.attributes).some(
        (attr) =>
          (attr.name === "epub:type" || attr.name.endsWith(":type")) &&
          attr.value.split(/\s+/).includes("cover"),
      );
      const href = a.getAttribute("href");
      if (isCover && href) paths.push(resolvePath(navDir, href));
    }
  }
  return [...new Set(paths)].filter(Boolean);
}

/** First <img src> or SVG <image href> on an (X)HTML page, resolved to a zip path. */
async function firstImageOnPage(zip: JSZip, pagePath: string): Promise<string | undefined> {
  const page = await readMarkup(zip, pagePath);
  if (!page) return undefined;
  for (const el of [...byLocalName(page, "img"), ...byLocalName(page, "image")]) {
    const ref =
      el.getAttribute("src") ??
      el.getAttribute("href") ??
      Array.from(el.attributes).find((a) => a.localName === "href")?.value;
    if (!ref) continue;
    const path = resolvePath(dirOf(pagePath), ref);
    if (zipFile(zip, path) && !/\.svg$/i.test(path)) return path;
  }
  return undefined;
}

function mimeFromName(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "gif") return "image/gif";
  if (ext === "webp") return "image/webp";
  return "image/jpeg";
}

function dirOf(path: string): string {
  return path.includes("/") ? path.slice(0, path.lastIndexOf("/") + 1) : "";
}

function zipFile(zip: JSZip, path: string) {
  return zip.file(path) ?? zip.file(safeDecode(path));
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** Parse an XHTML page leniently: strict XML first, then HTML if that fails. */
async function readMarkup(zip: JSZip, path: string): Promise<Document | undefined> {
  const file = zipFile(zip, path);
  if (!file) return undefined;
  const text = await file.async("text");
  const xml = new DOMParser().parseFromString(text, "application/xhtml+xml");
  if (!xml.getElementsByTagName("parsererror").length) return xml;
  return new DOMParser().parseFromString(text, "text/html");
}

/**
 * Elements by local name, ignoring namespaces/prefixes. Real-world EPUBs are
 * inconsistent about namespace declarations (`dc:title` vs `title`).
 */
function byLocalName(doc: Document, name: string): Element[] {
  return Array.from(doc.getElementsByTagName("*")).filter((el) => el.localName === name);
}

async function readXml(zip: JSZip, path: string): Promise<Document> {
  const file = zip.file(path);
  if (!file) throw new Error(`EPUB is missing ${path}`);
  return new DOMParser().parseFromString(await file.async("text"), "application/xml");
}

/** Resolve `href` relative to the OPF directory (handles ../). */
export function resolvePath(baseDir: string, href: string): string {
  const out: string[] = [];
  for (const seg of (baseDir + href.split("#")[0]).split("/")) {
    if (seg === "..") out.pop();
    else if (seg && seg !== ".") out.push(seg);
  }
  return out.join("/");
}

function stripHtml(s: string | undefined): string | undefined {
  if (!s) return undefined;
  const text = new DOMParser().parseFromString(s, "text/html").body.textContent ?? s;
  return text.replace(/\s+/g, " ").trim() || undefined;
}
