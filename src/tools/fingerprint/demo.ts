import { encodeImage } from "../imagekit/decode";
import { makePixels } from "../imagekit/pixels";
import { synthPrint, type SynthOptions } from "./synth";

export interface DemoImage {
  bytes: Uint8Array;
  mime: "image/png";
  title: string;
}

const SEED = 3;
/** Print B is print A turned and moved (spec §4); its noise is drawn over the moved print, so it falls differently on the ridges. */
const B_POSE = { rotateDeg: 15, dx: 30, dy: -20 };

/** A synthetic print as a gray PNG (browser only); PNG keeps every ridge as drawn. */
async function printPng(o: SynthOptions, title: string): Promise<DemoImage> {
  const p = synthPrint(o);
  const px = makePixels(p.width, p.height);
  for (let i = 0; i < p.gray.length; i++) {
    const v = p.gray[i];
    px.data.set([v, v, v, 255], i * 4);
  }
  return { bytes: await encodeImage(px, "image/png"), mime: "image/png", title };
}

/**
 * The demo pair (browser only): one seeded synthetic loop pattern, and the
 * same finger rotated 15° and shifted (30, −20) px. Both are 320×400, under
 * the 640 px analysis size, so the lab reads them as drawn.
 */
export async function makeFingerprintDemo(): Promise<{ a: DemoImage; b: DemoImage }> {
  const [a, b] = await Promise.all([
    printPng({ seed: SEED }, "Demo print A"),
    printPng({ seed: SEED, ...B_POSE }, "Demo print B"),
  ]);
  return { a, b };
}
