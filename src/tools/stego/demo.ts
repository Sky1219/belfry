import { encodeImage } from "../imagekit/decode";
import type { Pixels } from "../imagekit/pixels";
import { DEMO_MESSAGE, embed, randomEmbed, syntheticCover } from "./lsb";

/** The cover's seed and size; the clean cover reads "no sign" (pinned in the unit tests). */
const SEED = 21;
const W = 512;
const H = 384;
/** The share of the low bits filled with random bits, and their seed (Ruling P3-R11). */
const NOISE_SHARE = 0.6;
const NOISE_SEED = 9;

/**
 * The demo image's pixels: the seeded synthetic cover with its first 60% of
 * low bits randomised, then the demo message written over the start. A 52-byte
 * message alone moves no chi-square bar, so the noise lets a visitor see both
 * detectors work: the bars read embedded to 60%, then fall, and RS reads about 0.57.
 */
export function stegoDemoPixels(): Pixels {
  return embed(randomEmbed(syntheticCover(SEED, W, H), NOISE_SHARE, NOISE_SEED), DEMO_MESSAGE);
}

/** The demo image (browser only), saved as PNG: a JPEG save would erase the message. */
export async function makeStegoDemo(): Promise<{ bytes: Uint8Array; mime: "image/png"; title: "Demo image — harbour" }> {
  return { bytes: await encodeImage(stegoDemoPixels(), "image/png"), mime: "image/png", title: "Demo image — harbour" };
}
