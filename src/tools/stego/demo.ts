import { encodeImage } from "../imagekit/decode";
import type { Pixels } from "../imagekit/pixels";
import { DEMO_MESSAGE, embed, syntheticCover } from "./lsb";

/** The cover's seed and size; the clean cover reads "no sign" (pinned in the unit tests). */
const SEED = 21;
const W = 512;
const H = 384;

/** The demo image's pixels: the seeded synthetic cover with the demo message hidden in it. */
export function stegoDemoPixels(): Pixels {
  return embed(syntheticCover(SEED, W, H), DEMO_MESSAGE);
}

/** The demo image (browser only), saved as PNG: a JPEG save would erase the message. */
export async function makeStegoDemo(): Promise<{ bytes: Uint8Array; mime: "image/png"; title: "Demo image — harbour" }> {
  return { bytes: await encodeImage(stegoDemoPixels(), "image/png"), mime: "image/png", title: "Demo image — harbour" };
}
