import { makePixels, type Pixels } from "../imagekit/pixels";
import { mulberry32 } from "../imagekit/rng";

/** The hidden message the demo image carries; Task 4's demo and e2e use it. */
export const DEMO_MESSAGE = "The bell was stopped at 04:10 from the east bracket.";

/** "BLFY": the four bytes every Belfry LSB payload opens with. */
export const MAGIC = Uint8Array.of(0x42, 0x4c, 0x46, 0x59);

/** Magic plus the uint32 big-endian payload length. */
const HEADER_BYTES = 8;

/**
 * The message needs more room than the image has. Both sizes are in bytes with
 * the 8-byte header counted, so they share units (Ruling P3-R5).
 */
export class CapacityError extends Error {
  constructor(
    /** Header plus payload bytes. */
    public needed: number,
    /** The image's total bytes, header included: opaque channels / 8, floored. */
    public capacity: number,
  ) {
    super(`That message needs ${needed} bytes; this image holds ${capacity}.`);
    this.name = "CapacityError";
  }
}

export function opaqueChannels(p: Pixels): number {
  let opaque = 0;
  for (let i = 3; i < p.data.length; i += 4) if (p.data[i] === 255) opaque++;
  return opaque * 3;
}

/** Every byte the image's opaque channels can carry, the 8-byte header included. */
export function totalBytes(p: Pixels): number {
  return Math.floor(opaqueChannels(p) / 8);
}

/** Payload bytes the image can carry after the 8-byte header; 0 when it can't hold even that. */
export function capacityBytes(p: Pixels): number {
  return Math.max(0, totalBytes(p) - HEADER_BYTES);
}

/**
 * Index into `data` of each opaque R, G, B channel in stream order (row-major,
 * alpha skipped, pixels with alpha < 255 skipped), limited to the first `limit`.
 */
export function channelIndices(p: Pixels, limit: number): Int32Array {
  const out = new Int32Array(limit);
  let n = 0;
  for (let i = 0; i < p.data.length && n < limit; i += 4) {
    if (p.data[i + 3] !== 255) continue;
    for (let c = 0; c < 3 && n < limit; c++) out[n++] = i + c;
  }
  return out.subarray(0, n);
}

/**
 * The same stream as `channelIndices`, walked one channel at a time with no
 * index array, so a full-capacity payload at 24 MP costs no extra 290 MB
 * (Ruling P3-R9). Each call returns the next index into `data`, or -1 past the end.
 */
function channelStream(p: Pixels): () => number {
  let pos = 0; // start of the current pixel in p.data
  let ch = 0; // next channel (0-2) within that pixel
  return () => {
    if (ch === 0) while (pos < p.data.length && p.data[pos + 3] !== 255) pos += 4;
    if (pos >= p.data.length) return -1;
    const i = pos + ch;
    if (++ch === 3) {
      ch = 0;
      pos += 4;
    }
    return i;
  };
}

/** Reads `n` bytes, MSB-first, from the LSBs of the stream's next n x 8 channels. The caller checks they exist. */
function readBytes(p: Pixels, next: () => number, n: number): Uint8Array {
  const out = new Uint8Array(n);
  for (let bit = 0; bit < n * 8; bit++) out[bit >> 3] |= (p.data[next()] & 1) << (7 - (bit & 7));
  return out;
}

/** Writes `bytes`, MSB-first, into the LSBs of `p` along the stream. The caller checks the room. */
function writeBytes(p: Pixels, bytes: Uint8Array): void {
  const next = channelStream(p);
  for (let bit = 0; bit < bytes.length * 8; bit++) {
    const i = next();
    p.data[i] = (p.data[i] & 0xfe) | ((bytes[bit >> 3] >> (7 - (bit & 7))) & 1);
  }
}

/** `n` bytes from the platform's secure generator, in the 64 KB pieces it allows per call. */
function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  for (let at = 0; at < n; at += 65536) crypto.getRandomValues(out.subarray(at, Math.min(n, at + 65536)));
  return out;
}

/**
 * Reads the header along `next`: the payload length when the magic matches and
 * the length fits the image, else null. `next` is left at the payload's first bit.
 */
function readHeader(p: Pixels, next: () => number): number | null {
  const total = opaqueChannels(p);
  if (total < HEADER_BYTES * 8) return null;
  const head = readBytes(p, next, HEADER_BYTES);
  for (let i = 0; i < MAGIC.length; i++) if (head[i] !== MAGIC[i]) return null;
  const length = new DataView(head.buffer).getUint32(4);
  return length > Math.floor(total / 8) - HEADER_BYTES ? null : length;
}

/**
 * Hides `message` in the LSBs of `p`'s opaque channels. Returns a new image; throws CapacityError if it won't fit.
 * When `p` already carries a message, its header and payload bits are first overwritten with random bits,
 * so a shorter new message can't leave the old one's tail readable (Ruling P3-R12).
 */
export function embed(p: Pixels, message: string): Pixels {
  const payload = new TextEncoder().encode(message);
  // both sides count the header, so an image too small for the header alone fails here too
  const total = totalBytes(p);
  if (HEADER_BYTES + payload.length > total) throw new CapacityError(HEADER_BYTES + payload.length, total);

  const bytes = new Uint8Array(HEADER_BYTES + payload.length);
  bytes.set(MAGIC, 0);
  new DataView(bytes.buffer).setUint32(4, payload.length);
  bytes.set(payload, HEADER_BYTES);

  const out: Pixels = { width: p.width, height: p.height, data: p.data.slice() };
  const old = readHeader(p, channelStream(p));
  if (old !== null) writeBytes(out, randomBytes(HEADER_BYTES + old));
  writeBytes(out, bytes);
  return out;
}

/** Reads a Belfry LSB message back, or null when `p` doesn't carry a well-formed one. */
export function extract(p: Pixels): string | null {
  const next = channelStream(p);
  const length = readHeader(p, next);
  if (length === null) return null;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(readBytes(p, next, length));
  } catch {
    return null;
  }
}

/** Shown, verbatim, when the saved PNG doesn't read back the message (Ruling P3-R8). */
export const LOST_IN_SAVE =
  "This browser changed the picture while saving it, so the message did not survive. Try another browser, or turn off fingerprinting protection for this page.";

/**
 * Decodes the saved PNG and reads its message back. Canvas-noise defences
 * (Brave, Safari Private, Firefox's fingerprinting resistance) nudge pixels as
 * they're read out, which silently destroys a message; this catches that
 * before the PNG is pinned. `decode` is the browser's image decoder.
 */
export async function verifyEmbedded(
  png: Uint8Array,
  message: string,
  decode: (png: Uint8Array) => Promise<Pixels>,
): Promise<{ ok: true } | { ok: false; problem: string }> {
  return extract(await decode(png)) === message ? { ok: true } : { ok: false, problem: LOST_IN_SAVE };
}

/** One draw of a standard normal from the seeded generator (Box-Muller). */
function gaussian(rnd: () => number): number {
  const u = 1 - rnd(); // (0, 1], so the log is finite
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd());
}

/**
 * A smooth seeded scene (a few sinusoidal waves per channel) with Gaussian
 * noise (sigma 2), then a contrast stretch round((v - 128) * 1.3 + 128).
 * The stretch skips about one value in four, so the histogram is comb-like,
 * as a real edited photo's is. Tasks 2-3 read it as the clean reference.
 */
export function syntheticCover(seed: number, w = 256, h = 256): Pixels {
  const rnd = mulberry32(seed);
  const waves = [0, 1, 2].map(() =>
    [0, 1, 2, 3].map(() => ({
      fx: (0.5 + rnd() * 2.5) / 256,
      fy: (0.5 + rnd() * 2.5) / 256,
      phase: rnd() * 2 * Math.PI,
      amp: 12 + rnd() * 14,
    })),
  );
  const p = makePixels(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        let v = 128;
        for (const k of waves[c]) v += k.amp * Math.sin(2 * Math.PI * (k.fx * x + k.fy * y) + k.phase);
        v = Math.min(255, Math.max(0, Math.round(v + 2 * gaussian(rnd))));
        p.data[i + c] = Math.round((v - 128) * 1.3 + 128); // Uint8ClampedArray clamps to 0-255
      }
      p.data[i + 3] = 255;
    }
  }
  return p;
}

/**
 * Replaces the LSBs of the first `rate` (0-1) share of the opaque channel
 * stream with seeded random bits. A test and demo helper, not the real format.
 */
export function randomEmbed(p: Pixels, rate: number, seed: number): Pixels {
  const rnd = mulberry32(seed);
  const out: Pixels = { width: p.width, height: p.height, data: p.data.slice() };
  const idx = channelIndices(p, Math.floor(opaqueChannels(p) * Math.min(1, Math.max(0, rate))));
  for (let k = 0; k < idx.length; k++) {
    out.data[idx[k]] = (out.data[idx[k]] & 0xfe) | (rnd() < 0.5 ? 0 : 1);
  }
  return out;
}
