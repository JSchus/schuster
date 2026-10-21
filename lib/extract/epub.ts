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

  const coverHref = findCoverHref(opf);
  let cover: EpubInfo["cover"];
  if (coverHref) {
    const path = resolvePath(baseDir, coverHref.href);
    const file = zip.file(path) ?? zip.file(decodeURIComponent(path));
    if (file) cover = { data: await file.async("uint8array"), mime: coverHref.mime };
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

type ManifestItem = { id: string; href: string; mime: string; properties: string };

/** EPUB3 `properties="cover-image"`, then EPUB2 `<meta name="cover">`, then heuristics. */
function findCoverHref(opf: Document): { href: string; mime: string } | undefined {
  const items: ManifestItem[] = byLocalName(opf, "item").map((el) => ({
    id: el.getAttribute("id") ?? "",
    href: el.getAttribute("href") ?? "",
    mime: el.getAttribute("media-type") ?? "",
    properties: el.getAttribute("properties") ?? "",
  }));
  const images = items.filter((i) => i.mime.startsWith("image/"));

  const byProperty = images.find((i) => i.properties.split(/\s+/).includes("cover-image"));
  if (byProperty) return byProperty;

  const metaCover = byLocalName(opf, "meta")
    .find((m) => m.getAttribute("name") === "cover")
    ?.getAttribute("content");
  const byMeta = images.find((i) => i.id === metaCover);
  if (byMeta) return byMeta;

  return images.find((i) => /cover/i.test(i.id) || /cover/i.test(i.href)) ?? images[0];
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
