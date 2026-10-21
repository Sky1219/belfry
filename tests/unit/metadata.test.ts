import { describe, expect, it } from "vitest";
import { metadataFinding, readMetadata } from "../../src/tools/photo/metadata";
import { exifSegment, jpeg, png, tiff, webp, xmpSegment, type Entry } from "./helpers/imageBytes";

const enc = new TextEncoder();
const bytes = (s: string) => enc.encode(s);

const ifd0: Entry[] = [
  { tag: 0x010f, type: 2, value: "Belfry Cam" },
  { tag: 0x0110, type: 2, value: "BX-1" },
  { tag: 0x0112, type: 3, value: 6 },
  { tag: 0x0131, type: 2, value: "GIMP 2.10" },
];
const exif: Entry[] = [
  { tag: 0x9003, type: 2, value: "2026:06:21 15:00:00" },
  { tag: 0x9011, type: 2, value: "+01:00" },
];
const gps: Entry[] = [
  { tag: 1, type: 2, value: "N" },
  { tag: 2, type: 5, value: [[51, 1], [30, 1], [432, 100]] },
  { tag: 3, type: 2, value: "W" },
  { tag: 4, type: 5, value: [[0, 1], [7, 1], [2856, 100]] },
];

describe("readMetadata: EXIF in JPEG", () => {
  for (const endian of ["II", "MM"] as const) {
    it(`reads the camera, software, orientation and date fields (${endian})`, () => {
      const m = readMetadata(jpeg(exifSegment(tiff(endian, { ifd0, exif }))));
      expect(m.format).toBe("jpeg");
      expect(m.make).toBe("Belfry Cam");
      expect(m.model).toBe("BX-1");
      expect(m.software).toBe("GIMP 2.10");
      expect(m.orientation).toBe(6);
      expect(m.dateTimeOriginal).toBe("2026:06:21 15:00:00");
      expect(m.offsetTimeOriginal).toBe("+01:00");
      expect(m.warnings).toEqual([]);
    });
  }

  it("converts the GPS degrees, minutes and seconds with the hemisphere signs", () => {
    for (const endian of ["II", "MM"] as const) {
      const m = readMetadata(jpeg(exifSegment(tiff(endian, { gps }))));
      expect(m.gps!.lat).toBeCloseTo(51.5012, 4);
      expect(m.gps!.lon).toBeCloseTo(-0.1246, 4);
    }
  });

  it("reads the GPS altitude below sea level as negative", () => {
    const withAlt: Entry[] = [
      ...gps,
      { tag: 5, type: 3, value: 1 },
      { tag: 6, type: 5, value: [[125, 10]] },
    ];
    // the spec stores the altitude ref as a BYTE; the helper has no byte type, and the reader accepts a short too
    const m = readMetadata(jpeg(exifSegment(tiff("II", { gps: withAlt }))));
    expect(m.gps!.altitudeM).toBeCloseTo(-12.5, 1);
  });

  it("drops a GPS position that is out of range", () => {
    const bad: Entry[] = [
      { tag: 1, type: 2, value: "N" },
      { tag: 2, type: 5, value: [[95, 1], [0, 1], [0, 1]] },
      { tag: 3, type: 2, value: "E" },
      { tag: 4, type: 5, value: [[10, 1], [0, 1], [0, 1]] },
    ];
    const m = readMetadata(jpeg(exifSegment(tiff("II", { gps: bad }))));
    expect(m.gps).toBeUndefined();
    expect(m.warnings).toHaveLength(1);
  });

  it("drops a GPS position whose rational has a zero denominator", () => {
    const bad: Entry[] = [
      { tag: 1, type: 2, value: "N" },
      { tag: 2, type: 5, value: [[51, 0], [30, 1], [0, 1]] },
      { tag: 3, type: 2, value: "E" },
      { tag: 4, type: 5, value: [[10, 1], [0, 1], [0, 1]] },
    ];
    const m = readMetadata(jpeg(exifSegment(tiff("MM", { gps: bad }))));
    expect(m.gps).toBeUndefined();
    expect(m.warnings.length).toBeGreaterThan(0);
  });
});

describe("readMetadata: XMP", () => {
  const xml =
    `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF><rdf:Description xmp:CreatorTool="Adobe Photoshop 25.0" xmp:ModifyDate="2026-06-22T09:00:00">` +
    `<xmpMM:History><rdf:Seq><rdf:li stEvt:softwareAgent="Adobe Photoshop 25.0" stEvt:action="saved"/>` +
    `<rdf:li><stEvt:softwareAgent>Adobe Lightroom 7.0 &amp; plugins</stEvt:softwareAgent></rdf:li></rdf:Seq></xmpMM:History>` +
    `</rdf:Description></rdf:RDF></x:xmpmeta>`;

  it("reads the creator tool, modify date and history agents", () => {
    const m = readMetadata(jpeg(xmpSegment(xml)));
    expect(m.xmp!.creatorTool).toBe("Adobe Photoshop 25.0");
    expect(m.xmp!.modifyDate).toBe("2026-06-22T09:00:00");
    expect(m.xmp!.history).toEqual(["Adobe Photoshop 25.0", "Adobe Lightroom 7.0 & plugins"]);
  });

  it("reads element-form CreatorTool and ModifyDate", () => {
    const m = readMetadata(
      jpeg(xmpSegment(`<xmp:CreatorTool>Paint.NET</xmp:CreatorTool><xmp:ModifyDate>2026-01-02T03:04:05</xmp:ModifyDate>`)),
    );
    expect(m.xmp).toEqual({ creatorTool: "Paint.NET", modifyDate: "2026-01-02T03:04:05", history: [] });
  });

  it("reads photoshop:History, as an attribute or an element, after the history agents", () => {
    const attr = readMetadata(jpeg(xmpSegment(`<rdf:Description photoshop:History="Opened &amp; resized"/>`)));
    expect(attr.xmp!.history).toEqual(["Opened & resized"]);
    const both = readMetadata(
      jpeg(
        xmpSegment(
          `<rdf:li stEvt:softwareAgent="Adobe Photoshop 25.0"/><photoshop:History>2026-06-22 File IMG_1.jpg opened</photoshop:History>`,
        ),
      ),
    );
    expect(both.xmp!.history).toEqual(["Adobe Photoshop 25.0", "2026-06-22 File IMG_1.jpg opened"]);
  });

  it("reads EXIF and XMP from the same file", () => {
    const m = readMetadata(jpeg(exifSegment(tiff("II", { ifd0 })), xmpSegment(xml)));
    expect(m.make).toBe("Belfry Cam");
    expect(m.xmp!.history).toHaveLength(2);
  });
});

describe("readMetadata: PNG and WebP", () => {
  it("reads a tEXt chunk", () => {
    const m = readMetadata(png([{ type: "tEXt", data: bytes("Software\0Belfry test") }, { type: "IEND", data: new Uint8Array(0) }]));
    expect(m.format).toBe("png");
    expect(m.text.Software).toBe("Belfry test");
  });

  it("reads an uncompressed iTXt chunk and XMP carried in one", () => {
    const itxt = (key: string, text: string) => bytes(`${key}\0\0\0en\0${key}\0${text}`);
    const m = readMetadata(
      png([
        { type: "iTXt", data: itxt("Comment", "héllo") },
        { type: "iTXt", data: itxt("XML:com.adobe.xmp", `<xmp:CreatorTool>Krita</xmp:CreatorTool>`) },
      ]),
    );
    expect(m.text.Comment).toBe("héllo");
    expect(m.xmp!.creatorTool).toBe("Krita");
    expect(m.text["XML:com.adobe.xmp"]).toBeUndefined();
  });

  it("reads an eXIf chunk", () => {
    const m = readMetadata(png([{ type: "eXIf", data: tiff("MM", { ifd0 }) }]));
    expect(m.format).toBe("png");
    expect(m.make).toBe("Belfry Cam");
  });

  it("stops at IEND", () => {
    const m = readMetadata(
      png([
        { type: "IEND", data: new Uint8Array(0) },
        { type: "tEXt", data: bytes("After\0end") },
      ]),
    );
    expect(m.text.After).toBeUndefined();
  });

  it("reads a WebP EXIF chunk, with or without the Exif prefix", () => {
    const t = tiff("II", { ifd0 });
    const m = readMetadata(webp([{ type: "EXIF", data: t }]));
    expect(m.format).toBe("webp");
    expect(m.make).toBe("Belfry Cam");
    const prefixed = new Uint8Array(6 + t.length);
    prefixed.set(bytes("Exif\0\0"));
    prefixed.set(t, 6);
    expect(readMetadata(webp([{ type: "EXIF", data: prefixed }])).make).toBe("Belfry Cam");
  });

  it("reads a WebP XMP chunk", () => {
    const m = readMetadata(webp([{ type: "XMP ", data: bytes(`<xmp:CreatorTool>Canva</xmp:CreatorTool>`) }]));
    expect(m.xmp!.creatorTool).toBe("Canva");
  });

  it("calls anything else 'other' without throwing", () => {
    expect(readMetadata(bytes("not an image at all")).format).toBe("other");
    expect(readMetadata(new Uint8Array(0)).format).toBe("other");
  });
});

describe("readMetadata: corrupt or hostile input", () => {
  it("skips an entry whose offset is past the end, with one warning", () => {
    const t = tiff("II", { ifd0 });
    // entry 0 (Make, 11 bytes, out of line): its value offset sits at 8 + 2 + 8
    new DataView(t.buffer).setUint32(18, 0xffff, true);
    const m = readMetadata(jpeg(exifSegment(t)));
    expect(m.make).toBeUndefined();
    expect(m.model).toBe("BX-1");
    expect(m.warnings).toHaveLength(1);
  });

  it("returns when IFD0's next pointer points back to IFD0", () => {
    const t = tiff("MM", { ifd0: [{ tag: 0x0110, type: 2, value: "BX-1" }] });
    // one entry: the next-IFD pointer sits at 8 + 2 + 12
    new DataView(t.buffer).setUint32(22, 8, false);
    const m = readMetadata(jpeg(exifSegment(t)));
    expect(m.model).toBe("BX-1");
    expect(m.warnings.length).toBeGreaterThan(0);
  });

  it("returns when the Exif pointer points back to IFD0", () => {
    const t = tiff("II", { ifd0, exif });
    const dv = new DataView(t.buffer);
    // the pointer entry is the last of IFD0; its value is at 10 + 12 * ifd0.length + 8
    dv.setUint32(10 + 12 * ifd0.length + 8, 8, true);
    const m = readMetadata(jpeg(exifSegment(t)));
    expect(m.make).toBe("Belfry Cam");
    expect(m.dateTimeOriginal).toBeUndefined();
    expect(m.warnings.length).toBeGreaterThan(0);
  });

  it("caps an IFD that claims 65535 entries", () => {
    const t = tiff("II", { ifd0 });
    new DataView(t.buffer).setUint16(8, 0xffff, true);
    const m = readMetadata(jpeg(exifSegment(t)));
    expect(m.format).toBe("jpeg");
    expect(m.warnings.length).toBeGreaterThan(0);
  });

  it("returns format jpeg with a warning when the file stops inside APP1", () => {
    const full = jpeg(exifSegment(tiff("II", { ifd0 })));
    const m = readMetadata(full.slice(0, 2 + 4 + 20));
    expect(m.format).toBe("jpeg");
    expect(m.warnings.length).toBeGreaterThan(0);
  });

  it("returns a warning for a PNG that stops inside a chunk", () => {
    const full = png([{ type: "tEXt", data: bytes("Software\0Belfry test") }]);
    const m = readMetadata(full.slice(0, 8 + 8 + 5));
    expect(m.format).toBe("png");
    expect(m.warnings.length).toBeGreaterThan(0);
  });

  it("returns a warning for a WebP that stops inside a chunk", () => {
    const full = webp([{ type: "EXIF", data: tiff("II", { ifd0 }) }]);
    const m = readMetadata(full.slice(0, 20 + 10));
    expect(m.format).toBe("webp");
    expect(m.warnings.length).toBeGreaterThan(0);
  });

  it("keeps a text key named __proto__ as plain data", () => {
    const m = readMetadata(png([{ type: "tEXt", data: bytes("__proto__\0x") }]));
    expect(Object.keys(m.text)).toEqual(["__proto__"]);
    expect(({} as Record<string, unknown>).x).toBeUndefined();
  });
});

describe("readMetadata: hostile XMP", () => {
  // the first three used to be quadratic: every restart scanned to the end of the packet
  const MiB = 1 << 20;
  const repeated = (unit: string) => unit.repeat(Math.ceil(MiB / unit.length));
  const hostile: Record<string, string> = {
    "repeated <xmp:CreatorTool with no >": repeated("<xmp:CreatorTool "),
    "repeated <xmp:ModifyDate with no >": repeated("<xmp:ModifyDate "),
    "repeated <stEvt:softwareAgent with no >": repeated("<stEvt:softwareAgent "),
    "repeated <photoshop:History with no >": repeated("<photoshop:History "),
    "repeated empty <xmp:CreatorTool> elements": repeated("<xmp:CreatorTool>"),
    "an attribute whose quote never closes": `xmp:CreatorTool="${"a".repeat(MiB)}`,
    "an attribute value over the length bound": `xmp:CreatorTool="${"a".repeat(MiB)}"`,
  };
  for (const [name, xml] of Object.entries(hostile)) {
    it(`reads a 1 MiB packet of ${name} in well under a second`, () => {
      const t0 = performance.now();
      const m = readMetadata(webp([{ type: "XMP ", data: bytes(xml) }]));
      expect(performance.now() - t0).toBeLessThan(500);
      expect(m.format).toBe("webp");
      expect(m.xmp).toBeUndefined();
    });
  }
});

describe("metadataFinding", () => {
  const xml = `<rdf:Description xmp:CreatorTool="Adobe Photoshop 25.0" xmp:ModifyDate="2026-06-22T09:00:00"><rdf:li stEvt:softwareAgent="Adobe Photoshop 25.0"/><rdf:li stEvt:softwareAgent="Adobe Photoshop 25.0"/></rdf:Description>`;

  it("lists the fields as Label: value, and software and XMP tools on one line", () => {
    const m = readMetadata(jpeg(exifSegment(tiff("II", { ifd0, exif, gps })), xmpSegment(xml)));
    const f = metadataFinding(m);
    expect(f.body).toContain("Software: GIMP 2.10, Adobe Photoshop 25.0");
    expect(f.body).toContain("XMP history: Adobe Photoshop 25.0");
    expect(f.body).not.toMatch(/^Edited with/m);
    expect(f.body).toContain("Make: Belfry Cam");
    expect(f.body).toContain("Model: BX-1");
    expect(f.body).toContain("Date taken: 2026:06:21 15:00:00");
    expect(f.title).toMatch(/^Metadata: \d+ fields$/);
    expect(f.body).not.toMatch(/manipulat|fake|forg|tamper|edited by/i);
    expect(f.body).not.toMatch(/\bedited\b/i);
  });

  it("lists photoshop:History text on the XMP history line, not as software", () => {
    const f = metadataFinding(
      readMetadata(jpeg(xmpSegment(`<xmp:CreatorTool>Krita</xmp:CreatorTool><photoshop:History>File IMG_1.jpg opened</photoshop:History>`))),
    );
    expect(f.body).toContain("Software: Krita");
    expect(f.body).not.toMatch(/^Software:.*opened/m);
    expect(f.body).toContain("XMP history: File IMG_1.jpg opened");
  });

  it("counts the fields it lists", () => {
    const f = metadataFinding(readMetadata(jpeg(exifSegment(tiff("II", { ifd0: [{ tag: 0x010f, type: 2, value: "Belfry Cam" }] })))));
    expect(f.title).toBe("Metadata: 1 field");
  });

  it("gives a location detail for a GPS position", () => {
    const f = metadataFinding(readMetadata(jpeg(exifSegment(tiff("MM", { gps })))));
    expect(f.detail!.kind).toBe("location");
    if (f.detail!.kind === "location") {
      expect(f.detail!.lat).toBeCloseTo(51.5012, 4);
      expect(f.detail!.lon).toBeCloseTo(-0.1246, 4);
    }
  });

  it("gives no detail without GPS", () => {
    expect(metadataFinding(readMetadata(jpeg(exifSegment(tiff("II", { ifd0 }))))).detail).toBeUndefined();
  });

  it("says plainly when nothing was found", () => {
    const f = metadataFinding(readMetadata(jpeg()));
    expect(f.title).toBe("Metadata: none found");
    expect(f.body).toBe("No EXIF, XMP or text chunks. Many apps strip metadata on export, so its absence says little.");
  });

  it("joins the PNG Software keyword into one Software line", () => {
    const f = metadataFinding(
      readMetadata(
        png([
          { type: "tEXt", data: bytes("Software\0Belfry test") },
          { type: "iTXt", data: bytes("XML:com.adobe.xmp\0\0\0en\0\0<xmp:CreatorTool>Krita</xmp:CreatorTool>") },
        ]),
      ),
    );
    expect(f.body.match(/^Software:/gm)).toHaveLength(1);
    expect(f.body).toContain("Software: Belfry test, Krita");
  });

  it("lists PNG text chunks and trims long values", () => {
    const f = metadataFinding(readMetadata(png([{ type: "tEXt", data: bytes(`Comment\0${"x".repeat(500)}`) }])));
    expect(f.title).toBe("Metadata: 1 field");
    expect(f.body.length).toBeLessThan(300);
    expect(f.body).toMatch(/^Comment: x+…/);
  });

  it("mentions warnings in the body", () => {
    const t = tiff("II", { ifd0 });
    new DataView(t.buffer).setUint32(18, 0xffff, true);
    const f = metadataFinding(readMetadata(jpeg(exifSegment(t))));
    expect(f.body).toMatch(/Could not read/);
  });
});
