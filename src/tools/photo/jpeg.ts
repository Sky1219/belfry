import type { FindingDetail } from "../../store/schema";
import { verdictFor, verdictTitle } from "../imagekit/verdict";
import { ZIGZAG } from "../../platform/math/dct8";

export interface JpegInfo {
  width: number;
  height: number;
  progressive: boolean;
  /** Quantization tables by id, in natural (row-major) order. */
  tables: Map<number, Uint16Array>;
}

/** The standard Annex K luminance table, natural order. */
export const IJG_LUMA: readonly number[] = [
  16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51,
  87, 80, 62, 18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101,
  72, 92, 95, 98, 112, 100, 103, 99,
];

/** The quality scaling libjpeg applies to a base table. */
export function ijgTable(base: readonly number[], quality: number): Uint16Array {
  const q = Math.min(100, Math.max(1, quality));
  const scale = q < 50 ? 5000 / q : 200 - 2 * q;
  return Uint16Array.from(base, (b) => Math.min(255, Math.max(1, Math.floor((b * scale + 50) / 100))));
}

/** The IJG quality whose table is nearest (sum of absolute differences) to `luma`; `ijg` when that is within 64. */
export function estimateQuality(luma: Uint16Array): { quality: number; ijg: boolean } {
  let best = 1;
  let bestDist = Infinity;
  for (let q = 1; q <= 100; q++) {
    const t = ijgTable(IJG_LUMA, q);
    let d = 0;
    for (let i = 0; i < 64; i++) d += Math.abs(luma[i] - t[i]);
    if (d < bestDist) {
      bestDist = d;
      best = q;
    }
  }
  return { quality: best, ijg: bestDist <= 64 };
}

const SOI = 0xd8;
const EOI = 0xd9;
const SOS = 0xda;
const DQT = 0xdb;

/** SOFn markers: C0-CF except DHT (C4), JPG (C8) and DAC (CC). */
const isSof = (m: number) => m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc;
/** Progressive: C2, C6, CA, CE. */
const isProgressive = (m: number) => (m & 0x3) === 2;

/**
 * Reads the size, the SOF kind and the quantization tables. Null when the
 * bytes do not start with a JPEG SOI. Truncated or hostile files give what was
 * read before the problem; this never throws.
 */
export function readJpeg(bytes: Uint8Array): JpegInfo | null {
  if (bytes.length < 2 || bytes[0] !== 0xff || bytes[1] !== SOI) return null;
  const info: JpegInfo = { width: 0, height: 0, progressive: false, tables: new Map() };
  let p = 2;
  while (p + 1 < bytes.length) {
    if (bytes[p] !== 0xff) {
      p++;
      continue;
    }
    const marker = bytes[p + 1];
    if (marker === 0xff) {
      p++; // fill byte
      continue;
    }
    // markers with no length: stuffed zero, TEM, RSTn, SOI
    if (marker === 0x00 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      p += 2;
      continue;
    }
    if (marker === EOI) break;
    if (p + 4 > bytes.length) break;
    const len = (bytes[p + 2] << 8) | bytes[p + 3];
    if (len < 2) break;
    const start = p + 4;
    const end = Math.min(bytes.length, p + 2 + len);
    if (marker === DQT) readDqt(bytes, start, end, info);
    else if (isSof(marker) && end - start >= 5) {
      info.progressive = isProgressive(marker);
      info.height = (bytes[start + 1] << 8) | bytes[start + 2];
      info.width = (bytes[start + 3] << 8) | bytes[start + 4];
    }
    // entropy-coded data follows SOS; the loop above skips it byte by byte up to the next marker
    p = marker === SOS ? end : p + 2 + len;
  }
  return info;
}

function readDqt(bytes: Uint8Array, start: number, end: number, info: JpegInfo): void {
  let p = start;
  while (p < end) {
    const pq = bytes[p] >> 4;
    const id = bytes[p] & 0x0f;
    const size = pq === 0 ? 1 : 2;
    if (pq > 1 || p + 1 + 64 * size > end) return;
    const table = new Uint16Array(64);
    for (let z = 0; z < 64; z++) {
      const at = p + 1 + z * size;
      table[ZIGZAG[z]] = size === 1 ? bytes[at] : (bytes[at] << 8) | bytes[at + 1];
    }
    info.tables.set(id, table);
    p += 1 + 64 * size;
  }
}

const DQ_THRESHOLDS = { inconclusiveAt: 0.3, consistentAt: 0.5 };
const DQ_LIMIT = "A photo saved twice as JPEG shows this whether or not it was edited in between.";

/** The quality and double-quantization findings for the JPEG panel. */
export function jpegFinding(
  info: JpegInfo,
  dq: number | null,
): {
  quality: { title: string; body: string; detail: FindingDetail };
  dq: { title: string; body: string; detail?: FindingDetail };
} {
  const luma = info.tables.get(0);
  let quality: { title: string; body: string; detail: FindingDetail };
  if (!luma) {
    quality = {
      title: "JPEG quality: no luminance table",
      body: "The file has no readable luminance quantization table, so no quality can be estimated.",
      detail: { kind: "measurement", value: null, unit: "quality" },
    };
  } else {
    const est = estimateQuality(luma);
    quality = est.ijg
      ? {
          title: `JPEG quality: about ${est.quality}`,
          body: "The luminance quantization table matches the standard IJG scaling for this quality, to within 1. Lower quality means coarser rounding of image detail.",
          detail: { kind: "measurement", value: est.quality, unit: "quality", uncertainty: 1 },
        }
      : {
          title: "JPEG quality: non-standard tables",
          body: "The luminance quantization table does not follow the standard IJG scaling, so no single quality number applies. Cameras and editors often use their own tables.",
          detail: { kind: "measurement", value: null, unit: "quality" },
        };
  }

  const thresholds = "Consistent at 0.50 or more, inconclusive from 0.30 to 0.49.";
  const dqFinding =
    dq === null || Number.isNaN(dq)
      ? {
          title: verdictTitle("Double quantization", "inconclusive", "two JPEG saves"),
          body: `Too little image to score: no complete 8×8 block, or too few coefficients. ${DQ_LIMIT}`,
        }
      : {
          title: verdictTitle("Double quantization", verdictFor(dq, DQ_THRESHOLDS), "two JPEG saves"),
          body: `Periodicity score ${dq.toFixed(2)} on the low-frequency DCT histograms. ${thresholds} ${DQ_LIMIT}`,
          detail: { kind: "measurement", value: Math.round(dq * 100) / 100, unit: "DQ score" } as FindingDetail,
        };
  return { quality, dq: dqFinding };
}
