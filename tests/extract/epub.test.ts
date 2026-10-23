// @vitest-environment happy-dom
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { detectMediaType, titleFromFilename } from "@/lib/extract/detect";
import { parseEpub, resolvePath } from "@/lib/extract/epub";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);

async function makeEpub(opts: { epub3: boolean }) {
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip");
  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
      <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
    </container>`,
  );
  const coverItem = opts.epub3
    ? `<item id="img1" href="../images/cover.png" media-type="image/png" properties="cover-image"/>`
    : `<item id="cov" href="../images/cover.png" media-type="image/png"/>`;
  zip.file(
    "OEBPS/content.opf",
    `<?xml version="1.0"?>
    <package xmlns="http://www.idpf.org/2007/opf" version="${opts.epub3 ? "3.0" : "2.0"}">
      <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
        <dc:title>Dune</dc:title>
        <dc:creator>Frank Herbert</dc:creator>
        <dc:description>&lt;p&gt;A &lt;b&gt;desert&lt;/b&gt; planet.&lt;/p&gt;</dc:description>
        <dc:subject>Science Fiction; Classics</dc:subject>
        <dc:language>en</dc:language>
        ${opts.epub3 ? "" : `<meta name="cover" content="cov"/>`}
      </metadata>
      <manifest>
        <item id="other" href="images/logo.png" media-type="image/png"/>
        ${coverItem}
      </manifest>
    </package>`,
  );
  zip.file("images/cover.png", PNG);
  zip.file("OEBPS/images/logo.png", new Uint8Array([9]));
  return zip.generateAsync({ type: "uint8array" });
}

describe("parseEpub", () => {
  for (const epub3 of [true, false]) {
    it(`extracts metadata and cover (EPUB ${epub3 ? 3 : 2})`, async () => {
      const info = await parseEpub(await makeEpub({ epub3 }));
      expect(info.title).toBe("Dune");
      expect(info.author).toBe("Frank Herbert");
      expect(info.description).toBe("A desert planet.");
      expect(info.subjects).toEqual(["Science Fiction", "Classics"]);
      expect(info.language).toBe("en");
      expect(info.cover?.mime).toBe("image/png");
      expect(Array.from(info.cover!.data)).toEqual(Array.from(PNG));
    });
  }

  it("rejects non-EPUB zips", async () => {
    const zip = new JSZip();
    zip.file("hello.txt", "hi");
    await expect(parseEpub(await zip.generateAsync({ type: "uint8array" }))).rejects.toThrow(
      /container\.xml/,
    );
  });
});

describe("helpers", () => {
  it("resolves relative hrefs", () => {
    expect(resolvePath("OEBPS/", "../images/a.png")).toBe("images/a.png");
    expect(resolvePath("", "./a.png#x")).toBe("a.png");
  });

  it("detects media types", () => {
    expect(detectMediaType("a.epub", "")).toBe("book");
    expect(detectMediaType("mario.nes", "")).toBe("game");
    expect(detectMediaType("x.mkv", "")).toBe("video");
    expect(detectMediaType("x", "audio/mpeg")).toBe("audio");
    expect(detectMediaType("taxes.xlsx", "application/vnd.ms-excel")).toBe("file");
  });

  it("derives titles from filenames", () => {
    expect(titleFromFilename("my_great-movie.2019.mkv")).toBe("my great-movie 2019");
  });
});
