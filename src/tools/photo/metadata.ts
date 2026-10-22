import type { FindingDetail } from "../../store/schema";

export interface PhotoMetadata {
  format: "jpeg" | "png" | "webp" | "other";
  orientation?: number;
  make?: string;
  model?: string;
  software?: string;
  /** EXIF "YYYY:MM:DD HH:MM:SS", as written (no zone). */
  dateTimeOriginal?: string;
  /** EXIF "+HH:MM". */
  offsetTimeOriginal?: string;
  gps?: { lat: number; lon: number; altitudeM?: number };
  xmp?: { creatorTool?: string; modifyDate?: string; history: string[] };
  /** PNG text chunks by keyword. */
  text: Record<string, string>;
  /** What could not be read. The reader never throws. */
  warnings: string[];
}

/** Hostile files can claim any number of entries; stop here. */
const MAX_ENTRIES = 1000;
const MAX_TEXT_CHUNKS = 64;
const MAX_HISTORY = 50;
/** Real packets are a few KB to ~30 KB; a hostile one is cut here before any scanning. */
const MAX_XMP_CHARS = 256 * 1024;
/** Longest attribute value, element value or tag attribute run the XMP scan looks across. */
const XMP_RUN = 1000;

const utf8 = new TextDecoder("utf-8");
const latin1 = new TextDecoder("latin1");

/**
 * Reads what a JPEG, PNG or WebP says about itself: camera, software, date,
 * GPS, XMP edit history and PNG text. Anything unreadable becomes a warning
 * and the fields read so far are kept.
 */
export function readMetadata(bytes: Uint8Array): PhotoMetadata {
  const m: PhotoMetadata = { format: "other", text: Object.create(null), warnings: [] };
  try {
    if (bytes[0] === 0xff && bytes[1] === 0xd8) {
      m.format = "jpeg";
      readJpeg(bytes, m);
    } else if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
      m.format = "png";
      readPng(bytes, m);
    } else if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && ascii(bytes, 8, 4) === "WEBP") {
      m.format = "webp";
      readWebp(bytes, m);
    }
  } catch (e) {
    m.warnings.push(`Stopped reading: ${e instanceof Error ? e.message : String(e)}`);
  }
  return m;
}

function startsWith(b: Uint8Array, prefix: number[]): boolean {
  return b.length >= prefix.length && prefix.every((v, i) => b[i] === v);
}

function ascii(b: Uint8Array, at: number, n: number): string {
  let s = "";
  for (let i = at; i < Math.min(at + n, b.length); i++) s += String.fromCharCode(b[i]);
  return s;
}

const be16 = (b: Uint8Array, o: number) => (b[o] << 8) | b[o + 1];
const be32 = (b: Uint8Array, o: number) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const le32 = (b: Uint8Array, o: number) => ((b[o + 3] << 24) | (b[o + 2] << 16) | (b[o + 1] << 8) | b[o]) >>> 0;

const XMP_NS = "http://ns.adobe.com/xap/1.0/\0";
const EXIF_HEAD = "Exif\0\0";

// --- JPEG ---

function readJpeg(b: Uint8Array, m: PhotoMetadata): void {
  let sawExif = false;
  let sawXmp = false;
  let p = 2;
  while (p + 4 <= b.length) {
    if (b[p] !== 0xff) {
      m.warnings.push(`Unexpected byte at offset ${p} between JPEG segments`);
      return;
    }
    const marker = b[p + 1];
    if (marker === 0xff) {
      p++; // fill byte
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) return; // EOI, or SOS: the pixels start here
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      p += 2; // markers without a length
      continue;
    }
    const len = be16(b, p + 2);
    const end = p + 2 + len;
    if (len < 2) {
      m.warnings.push(`JPEG segment at offset ${p} has an impossible length`);
      return;
    }
    if (end > b.length) {
      m.warnings.push("The file ends inside a JPEG segment");
      return;
    }
    if (marker === 0xe1) {
      const body = b.subarray(p + 4, end);
      if (!sawExif && ascii(body, 0, 6) === EXIF_HEAD) {
        sawExif = true;
        readTiff(body.subarray(6), m);
      } else if (!sawXmp && ascii(body, 0, XMP_NS.length) === XMP_NS) {
        sawXmp = true;
        readXmp(decode(body.subarray(XMP_NS.length)), m);
      }
    }
    p = end;
  }
}

// --- PNG ---

function readPng(b: Uint8Array, m: PhotoMetadata): void {
  let sawExif = false;
  let texts = 0;
  let p = 8;
  while (p + 8 <= b.length) {
    const len = be32(b, p);
    const type = ascii(b, p + 4, 4);
    const start = p + 8;
    const end = start + len;
    if (type === "IEND") return;
    if (end > b.length) {
      m.warnings.push(`The file ends inside a PNG ${type} chunk`);
      return;
    }
    const data = b.subarray(start, end);
    if (type === "eXIf" && !sawExif) {
      sawExif = true;
      readTiff(data, m);
    } else if (type === "tEXt" || type === "iTXt") {
      if (++texts > MAX_TEXT_CHUNKS) {
        m.warnings.push(`More than ${MAX_TEXT_CHUNKS} PNG text chunks; the rest were skipped`);
        return;
      }
      readPngText(type, data, m);
    }
    p = end + 4; // data, then the CRC
  }
}

function readPngText(type: string, data: Uint8Array, m: PhotoMetadata): void {
  const nul = data.indexOf(0);
  if (nul < 1) return;
  const key = ascii(data, 0, nul);
  let value: string;
  if (type === "tEXt") {
    value = latin1.decode(data.subarray(nul + 1));
  } else {
    // iTXt: keyword NUL, compression flag, method, language NUL, translated keyword NUL, text
    if (data[nul + 1] !== 0) return; // compressed text can't be inflated synchronously
    const langEnd = data.indexOf(0, nul + 3);
    const transEnd = langEnd < 0 ? -1 : data.indexOf(0, langEnd + 1);
    if (transEnd < 0) return;
    value = utf8.decode(data.subarray(transEnd + 1));
  }
  if (key === "XML:com.adobe.xmp") readXmp(value, m);
  else if (!(key in m.text)) m.text[key] = value;
}

// --- WebP ---

function readWebp(b: Uint8Array, m: PhotoMetadata): void {
  let sawExif = false;
  let sawXmp = false;
  let p = 12;
  while (p + 8 <= b.length) {
    const type = ascii(b, p, 4);
    const size = le32(b, p + 4);
    const end = p + 8 + size;
    if (end > b.length) {
      m.warnings.push(`The file ends inside a WebP ${type.trim()} chunk`);
      return;
    }
    const data = b.subarray(p + 8, end);
    if (type === "EXIF" && !sawExif) {
      sawExif = true;
      readTiff(ascii(data, 0, 6) === EXIF_HEAD ? data.subarray(6) : data, m);
    } else if (type === "XMP " && !sawXmp) {
      sawXmp = true;
      readXmp(decode(data), m);
    }
    p = end + (size & 1); // chunks are padded to even length
  }
}

// --- TIFF / EXIF ---

/** Bytes per value for the TIFF types this reader handles; others are skipped. */
const TYPE_SIZE: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1 };

interface GpsParts {
  latRef?: string;
  lat?: number;
  lonRef?: string;
  lon?: number;
  altRef?: number;
  alt?: number;
}

function readTiff(t: Uint8Array, m: PhotoMetadata): void {
  const le = t[0] === 0x49 && t[1] === 0x49;
  if (t.length < 8 || (!le && !(t[0] === 0x4d && t[1] === 0x4d))) {
    m.warnings.push("The EXIF block has no valid TIFF header");
    return;
  }
  const dv = new DataView(t.buffer, t.byteOffset, t.byteLength);
  const visited = new Set<number>();
  let budget = MAX_ENTRIES;
  const gps: GpsParts = {};

  const uint = (o: number, type: number) => (type === 3 ? dv.getUint16(o, le) : type === 4 ? dv.getUint32(o, le) : t[o]);
  const rational = (o: number) => {
    const den = dv.getUint32(o + 4, le);
    return den === 0 ? NaN : dv.getUint32(o, le) / den;
  };
  const text = (o: number, count: number) => clean(latin1.decode(t.subarray(o, o + count)).split("\0")[0]);

  /** Reads one IFD and returns its next-IFD pointer (0 for none). Sub-IFD pointers are returned too. */
  function readIfd(offset: number, kind: "ifd0" | "exif" | "gps" | "other") {
    const out = { next: 0, exif: 0, gps: 0 };
    if (visited.has(offset)) {
      m.warnings.push(`An EXIF directory at offset ${offset} points back to one already read`);
      return out;
    }
    visited.add(offset);
    if (offset + 2 > t.length) {
      m.warnings.push(`An EXIF directory at offset ${offset} lies past the end of the block`);
      return out;
    }
    let n = dv.getUint16(offset, le);
    const room = Math.floor((t.length - offset - 2) / 12);
    if (n > room || n > budget) {
      m.warnings.push(`An EXIF directory claims ${n} entries; reading ${Math.min(room, budget)}`);
      n = Math.min(room, budget);
    }
    budget -= n;
    for (let i = 0; i < n; i++) {
      const p = offset + 2 + 12 * i;
      const tag = dv.getUint16(p, le);
      const type = dv.getUint16(p + 2, le);
      const count = dv.getUint32(p + 4, le);
      const size = (TYPE_SIZE[type] ?? 0) * count;
      if (size === 0) continue;
      const at = size <= 4 ? p + 8 : dv.getUint32(p + 8, le);
      if (at + size > t.length) {
        m.warnings.push(`EXIF tag 0x${tag.toString(16)} points past the end of the block`);
        continue;
      }
      if (kind === "ifd0") {
        if (tag === 0x010f && type === 2) m.make = text(at, count) || undefined;
        else if (tag === 0x0110 && type === 2) m.model = text(at, count) || undefined;
        else if (tag === 0x0131 && type === 2) m.software = text(at, count) || undefined;
        else if (tag === 0x0112 && type === 3) {
          const o = uint(at, type);
          if (o >= 1 && o <= 8) m.orientation = o;
        } else if (tag === 0x8769 && type === 4) out.exif = uint(at, type);
        else if (tag === 0x8825 && type === 4) out.gps = uint(at, type);
      } else if (kind === "exif") {
        if (tag === 0x9003 && type === 2) m.dateTimeOriginal = text(at, count) || undefined;
        else if (tag === 0x9011 && type === 2) m.offsetTimeOriginal = text(at, count) || undefined;
      } else if (kind === "gps") {
        if (tag === 1 && type === 2) gps.latRef = text(at, count);
        else if (tag === 3 && type === 2) gps.lonRef = text(at, count);
        else if (tag === 2 && type === 5 && count >= 1) gps.lat = dms(at, Math.min(count, 3), rational);
        else if (tag === 4 && type === 5 && count >= 1) gps.lon = dms(at, Math.min(count, 3), rational);
        else if (tag === 5 && (type === 1 || type === 3 || type === 7)) gps.altRef = uint(at, type);
        else if (tag === 6 && type === 5) gps.alt = rational(at);
      }
    }
    const nextAt = offset + 2 + 12 * n;
    if (kind === "ifd0" && nextAt + 4 <= t.length) out.next = dv.getUint32(nextAt, le);
    return out;
  }

  const first = readIfd(dv.getUint32(4, le), "ifd0");
  if (first.exif) readIfd(first.exif, "exif");
  if (first.gps) readIfd(first.gps, "gps");
  if (first.next) readIfd(first.next, "other"); // the thumbnail's directory; only read to catch loops
  setGps(gps, m);
}

/** Degrees, minutes, seconds from consecutive rationals. */
function dms(at: number, count: number, rational: (o: number) => number): number {
  let deg = 0;
  for (let i = 0; i < count; i++) deg += rational(at + 8 * i) / 60 ** i;
  return deg;
}

function setGps(g: GpsParts, m: PhotoMetadata): void {
  if (g.lat === undefined && g.lon === undefined) return;
  const latSign = g.latRef?.toUpperCase() === "N" ? 1 : g.latRef?.toUpperCase() === "S" ? -1 : 0;
  const lonSign = g.lonRef?.toUpperCase() === "E" ? 1 : g.lonRef?.toUpperCase() === "W" ? -1 : 0;
  const lat = g.lat! * latSign;
  const lon = g.lon! * lonSign;
  if (!latSign || !lonSign || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    m.warnings.push("The GPS position is incomplete or out of range, so it was ignored");
    return;
  }
  m.gps = { lat, lon };
  if (g.alt !== undefined && Number.isFinite(g.alt)) m.gps.altitudeM = g.altRef === 1 ? -g.alt : g.alt;
}

// --- XMP ---

function decode(b: Uint8Array): string {
  return utf8.decode(b);
}

const ENTITIES: Record<string, string> = { lt: "<", gt: ">", quot: '"', apos: "'", amp: "&" };

function unescapeXml(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|lt|gt|quot|apos|amp);/gi, (whole, name: string) => {
    if (name[0] !== "#") return ENTITIES[name.toLowerCase()];
    const cp = name[1].toLowerCase() === "x" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
    return cp <= 0x10ffff ? String.fromCodePoint(cp) : whole;
  });
}

/**
 * Every value of `prefix:name` in `xml`, written as an attribute or as an element.
 * Every run is bounded, so each match attempt costs at most a constant and the
 * scan stays linear in the packet even when the text is hostile.
 */
function xmpValues(xml: string, qname: string, max: number): string[] {
  const re = new RegExp(
    `\\b${qname}\\s{0,20}=\\s{0,20}(?:"([^"]{0,${XMP_RUN}})"|'([^']{0,${XMP_RUN}})')` +
      `|<${qname}(?:\\s[^>]{0,${XMP_RUN}})?>([^<]{0,${XMP_RUN}})</${qname}\\s{0,20}>`,
    "g",
  );
  const out: string[] = [];
  for (const match of xml.matchAll(re)) {
    const v = clean(unescapeXml(match[1] ?? match[2] ?? match[3] ?? ""));
    if (v) out.push(v);
    if (out.length >= max) break;
  }
  return out;
}

function readXmp(xml: string, m: PhotoMetadata): void {
  if (m.xmp) return;
  const packet = xml.length > MAX_XMP_CHARS ? xml.slice(0, MAX_XMP_CHARS) : xml;
  const creatorTool = xmpValues(packet, "xmp:CreatorTool", 1)[0];
  const modifyDate = xmpValues(packet, "xmp:ModifyDate", 1)[0];
  // the agents from xmpMM:History, then Photoshop's own free-text log
  const agents = xmpValues(packet, "stEvt:softwareAgent", MAX_HISTORY);
  const log = agents.length < MAX_HISTORY ? xmpValues(packet, "photoshop:History", MAX_HISTORY - agents.length) : [];
  const history = [...agents, ...log];
  if (creatorTool || modifyDate || history.length) m.xmp = { creatorTool, modifyDate, history };
}

/** Drops control characters and surrounding space. */
function clean(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim();
}

// --- Finding ---

const MAX_VALUE_CHARS = 120;

function shorten(s: string): string {
  const flat = s.replace(/\s+/g, " ").trim();
  return flat.length > MAX_VALUE_CHARS ? `${flat.slice(0, MAX_VALUE_CHARS)}…` : flat;
}

function degrees(v: number, pos: string, neg: string): string {
  return `${Math.abs(v).toFixed(4)}° ${v < 0 ? neg : pos}`;
}

/** The facts the file states, as plain `Label: value` lines. */
export function metadataFinding(m: PhotoMetadata): { title: string; body: string; detail?: FindingDetail } {
  const lines: string[] = [];
  const add = (label: string, value: string | number | undefined) => {
    if (value !== undefined && value !== "") lines.push(`${label}: ${shorten(String(value))}`);
  };
  add("Make", m.make);
  add("Model", m.model);
  add("Orientation", m.orientation);
  add("Date taken", m.dateTimeOriginal);
  add("Time zone offset", m.offsetTimeOriginal);
  if (m.gps) {
    add("Position", `${degrees(m.gps.lat, "N", "S")}, ${degrees(m.gps.lon, "E", "W")}`);
    if (m.gps.altitudeM !== undefined) add("Altitude", `${Math.round(m.gps.altitudeM)} m`);
  }
  add("XMP modified", m.xmp?.modifyDate);
  // the PNG Software keyword joins the software line below instead of repeating it
  for (const [key, value] of Object.entries(m.text)) if (key !== "Software") add(shorten(key), value);
  // EXIF Software may be camera firmware, so the line states what the file says without calling it an edit
  const tools = [...new Set([m.software, m.text.Software, m.xmp?.creatorTool].filter((s): s is string => !!s))];
  if (tools.length) add("Software", tools.join(", "));
  // the history holds agent names and Photoshop's free-text log, so it gets its own line rather than "Software"
  const history = [...new Set(m.xmp?.history ?? [])];
  if (history.length) add("XMP history", history.join("; "));

  const notes = m.warnings.length ? `\nCould not read part of the metadata: ${m.warnings.join("; ")}.` : "";
  if (!lines.length) {
    return {
      title: "Metadata: none found",
      body: `No EXIF, XMP or text chunks. Many apps strip metadata on export, so its absence says little.${notes}`,
    };
  }
  return {
    title: `Metadata: ${lines.length} ${lines.length === 1 ? "field" : "fields"}`,
    body: lines.join("\n") + notes,
    detail: m.gps ? { kind: "location", lat: m.gps.lat, lon: m.gps.lon } : undefined,
  };
}
