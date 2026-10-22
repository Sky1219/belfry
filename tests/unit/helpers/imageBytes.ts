/** Hand-built image containers for the photo-forensics unit tests. */

export interface Entry {
  tag: number;
  type: 2 | 3 | 4 | 5;
  /** Type 5 takes `[num, den]` pairs, flattened or nested. */
  value: string | number | number[] | number[][];
}

const enc = new TextEncoder();

/** Encodes one entry's value bytes and its count. */
function encodeValue(e: Entry, le: boolean): { bytes: Uint8Array; count: number } {
  if (e.type === 2) {
    const bytes = enc.encode(`${e.value as string}\0`);
    return { bytes, count: bytes.length };
  }
  const nums = (Array.isArray(e.value) ? e.value : [e.value]).flat() as number[];
  const size = e.type === 3 ? 2 : 4; // rationals are two longs
  const bytes = new Uint8Array(nums.length * size);
  const dv = new DataView(bytes.buffer);
  nums.forEach((n, i) => {
    if (size === 2) dv.setUint16(i * 2, n, le);
    else dv.setUint32(i * 4, n, le);
  });
  return { bytes, count: e.type === 5 ? nums.length / 2 : nums.length };
}

/**
 * A TIFF block: header, IFD0, then the Exif and GPS IFDs when given, then the
 * out-of-line values. The pointer entries (0x8769, 0x8825) are added to IFD0.
 * IFD0 starts at offset 8, and entry i of an IFD sits at `ifdOffset + 2 + 12 * i`.
 */
export function tiff(
  endian: "II" | "MM",
  ifds: { ifd0?: Entry[]; exif?: Entry[]; gps?: Entry[] },
): Uint8Array {
  const le = endian === "II";
  const ifd0 = [...(ifds.ifd0 ?? [])];
  if (ifds.exif) ifd0.push({ tag: 0x8769, type: 4, value: 0 });
  if (ifds.gps) ifd0.push({ tag: 0x8825, type: 4, value: 0 });

  const sizeOf = (n: number) => 2 + 12 * n + 4;
  const offsets: Record<string, number> = { ifd0: 8 };
  let next = 8 + sizeOf(ifd0.length);
  for (const k of ["exif", "gps"] as const) {
    if (ifds[k]) {
      offsets[k] = next;
      next += sizeOf(ifds[k]!.length);
    }
  }
  const pointers: Record<number, number> = { 0x8769: offsets.exif, 0x8825: offsets.gps };

  const dataStart = next;
  const data: number[] = [];
  const head = new Uint8Array(dataStart);
  const dv = new DataView(head.buffer);
  dv.setUint16(0, le ? 0x4949 : 0x4d4d, false);
  dv.setUint16(2, 42, le);
  dv.setUint32(4, 8, le);

  const writeIfd = (name: string, entries: Entry[]) => {
    let p = offsets[name];
    dv.setUint16(p, entries.length, le);
    p += 2;
    for (const e of entries) {
      const isPointer = name === "ifd0" && e.type === 4 && pointers[e.tag] !== undefined;
      const { bytes, count } = encodeValue(isPointer ? { ...e, value: pointers[e.tag] } : e, le);
      dv.setUint16(p, e.tag, le);
      dv.setUint16(p + 2, e.type, le);
      dv.setUint32(p + 4, count, le);
      if (bytes.length <= 4) {
        head.set(bytes, p + 8);
      } else {
        dv.setUint32(p + 8, dataStart + data.length, le);
        data.push(...bytes);
        if (data.length % 2) data.push(0);
      }
      p += 12;
    }
    dv.setUint32(p, 0, le); // no next IFD
  };
  writeIfd("ifd0", ifd0);
  if (ifds.exif) writeIfd("exif", ifds.exif);
  if (ifds.gps) writeIfd("gps", ifds.gps);

  const out = new Uint8Array(dataStart + data.length);
  out.set(head);
  out.set(data, dataStart);
  return out;
}

export interface Segment {
  marker: number;
  body: Uint8Array;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/**
 * SOI, the segments, a 1x1 SOF0 and EOI. The default SOF0 is left out when a
 * segment with marker 0xC0, 0xC1 or 0xC2 is passed (so a test can supply a
 * progressive SOF2).
 */
export function jpeg(...segments: Segment[]): Uint8Array {
  const parts: Uint8Array[] = [Uint8Array.of(0xff, 0xd8)];
  const all = [...segments];
  if (!all.some((s) => s.marker >= 0xc0 && s.marker <= 0xc2)) {
    // precision 8, height 1, width 1, one component (id 1, sampling 1x1, table 0)
    all.push({ marker: 0xc0, body: Uint8Array.of(8, 0, 1, 0, 1, 1, 1, 0x11, 0) });
  }
  for (const s of all) {
    const len = s.body.length + 2;
    parts.push(Uint8Array.of(0xff, s.marker, len >> 8, len & 0xff), s.body);
  }
  parts.push(Uint8Array.of(0xff, 0xd9));
  return concat(parts);
}

export function exifSegment(tiffBytes: Uint8Array): Segment {
  return { marker: 0xe1, body: concat([enc.encode("Exif\0\0"), tiffBytes]) };
}

export function xmpSegment(xml: string): Segment {
  return { marker: 0xe1, body: enc.encode(`http://ns.adobe.com/xap/1.0/\0${xml}`) };
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export interface Chunk {
  type: string;
  data: Uint8Array;
}

/** PNG signature plus the chunks, each with a correct CRC-32. */
export function png(chunks: Chunk[]): Uint8Array {
  const parts: Uint8Array[] = [Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)];
  for (const c of chunks) {
    const typeAndData = concat([enc.encode(c.type), c.data]);
    const len = new Uint8Array(4);
    new DataView(len.buffer).setUint32(0, c.data.length, false);
    const crc = new Uint8Array(4);
    new DataView(crc.buffer).setUint32(0, crc32(typeAndData), false);
    parts.push(len, typeAndData, crc);
  }
  return concat(parts);
}

/** RIFF/WEBP container; odd-sized chunks are padded to even length. */
export function webp(chunks: Chunk[]): Uint8Array {
  const body: Uint8Array[] = [enc.encode("WEBP")];
  for (const c of chunks) {
    const head = new Uint8Array(8);
    head.set(enc.encode(c.type));
    new DataView(head.buffer).setUint32(4, c.data.length, true);
    body.push(head, c.data);
    if (c.data.length % 2) body.push(Uint8Array.of(0));
  }
  const inner = concat(body);
  const riff = new Uint8Array(8);
  riff.set(enc.encode("RIFF"));
  new DataView(riff.buffer).setUint32(4, inner.length, true);
  return concat([riff, inner]);
}
