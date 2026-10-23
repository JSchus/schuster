// @vitest-environment happy-dom
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { parseEpub } from "@/lib/extract/epub";

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 7, 7, 7]);
const CONTAINER = `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`;

/** Build an EPUB whose cover is only discoverable the way `opts` describes. */
async function epub(opts: { manifest: string; metadataExtra?: string; guide?: string; files: Record<string, string | Uint8Array> }) {
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip");
  zip.file("META-INF/container.xml", CONTAINER);
  zip.file(
    "OEBPS/content.opf",
    `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0">
      <metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Book</dc:title><dc:creator>Ann Author</dc:creator>${opts.metadataExtra ?? ""}</metadata>
      <manifest>${opts.manifest}</manifest>${opts.guide ?? ""}</package>`,
  );
  for (const [path, data] of Object.entries(opts.files)) zip.file(path, data);
  return zip.generateAsync({ type: "uint8array" });
}

// Decoy image listed first, so the "first image" fallback would pick the wrong one.
const DECOY = `<item id="a1" href="Images/logo.png" media-type="image/png"/>`;
const ART = `<item id="art" href="Images/front.jpg" media-type="image/jpeg"/>`;

describe("EPUB cover discovery", () => {
  it("follows <guide type=cover> to the cover page's <img>", async () => {
    const info = await parseEpub(
      await epub({
        manifest: DECOY + ART + `<item id="cp" href="Text/titlepage.xhtml" media-type="application/xhtml+xml"/>`,
        guide: `<guide><reference type="cover" href="Text/titlepage.xhtml" title="Cover"/></guide>`,
        files: {
          "OEBPS/Images/logo.png": new Uint8Array([1]),
          "OEBPS/Images/front.jpg": JPEG,
          "OEBPS/Text/titlepage.xhtml": `<html xmlns="http://www.w3.org/1999/xhtml"><body><img src="../Images/front.jpg" alt=""/></body></html>`,
        },
      }),
    );
    expect(Array.from(info.cover!.data)).toEqual(Array.from(JPEG));
    expect(info.cover!.mime).toBe("image/jpeg");
    expect(info.author).toBe("Ann Author");
  });

  it("follows the EPUB 3 landmarks nav to an SVG-wrapped cover image", async () => {
    const info = await parseEpub(
      await epub({
        manifest:
          DECOY +
          ART +
          `<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>` +
          `<item id="c" href="Text/c.xhtml" media-type="application/xhtml+xml"/>`,
        files: {
          "OEBPS/Images/logo.png": new Uint8Array([1]),
          "OEBPS/Images/front.jpg": JPEG,
          "OEBPS/nav.xhtml": `<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><body>
            <nav epub:type="landmarks"><ol><li><a epub:type="cover" href="Text/c.xhtml">Cover</a></li></ol></nav></body></html>`,
          "OEBPS/Text/c.xhtml": `<html xmlns="http://www.w3.org/1999/xhtml"><body>
            <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><image xlink:href="../Images/front.jpg"/></svg></body></html>`,
        },
      }),
    );
    expect(Array.from(info.cover!.data)).toEqual(Array.from(JPEG));
  });

  it("matches <meta name=cover> ids case-insensitively", async () => {
    const info = await parseEpub(
      await epub({
        manifest: DECOY + `<item id="Cover-Image" href="Images/front.jpg" media-type="image/jpeg"/>`,
        metadataExtra: `<meta name="cover" content="cover-image"/>`,
        files: { "OEBPS/Images/logo.png": new Uint8Array([1]), "OEBPS/Images/front.jpg": JPEG },
      }),
    );
    expect(Array.from(info.cover!.data)).toEqual(Array.from(JPEG));
  });

  it("returns no cover when the book has no images", async () => {
    const info = await parseEpub(await epub({ manifest: "", files: {} }));
    expect(info.cover).toBeUndefined();
    expect(info.title).toBe("Book");
  });
});
