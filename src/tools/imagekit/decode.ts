import { fitWithin, type Pixels } from "./pixels";

export const TOO_LARGE_MESSAGE = "This photo is over 40 megapixels; Belfry can't analyse it in the browser.";
export const HEIC_MESSAGE = "This browser can't decode HEIC. Convert it to JPEG first.";

/** The photo is bigger than Belfry will decode (see `MAX_PIXELS`). */
export class ImageTooLargeError extends Error {
  constructor() {
    super(TOO_LARGE_MESSAGE);
    this.name = "ImageTooLargeError";
  }
}

/**
 * Decodes an image blob to RGBA pixels at full resolution (browser only). The
 * EXIF orientation is applied, so pixels match the photo as displayed.
 */
export async function decodeImage(blob: Blob): Promise<Pixels> {
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(blob, { imageOrientation: "from-image" });
  } catch {
    throw new Error(/^image\/hei[cf]$/i.test(blob.type) ? HEIC_MESSAGE : "This file couldn't be decoded as an image.");
  }
  try {
    if (!fitWithin(bmp.width, bmp.height)) throw new ImageTooLargeError();
    const g = new OffscreenCanvas(bmp.width, bmp.height).getContext("2d", { willReadFrequently: true })!;
    g.drawImage(bmp, 0, 0);
    const { data } = g.getImageData(0, 0, bmp.width, bmp.height);
    return { width: bmp.width, height: bmp.height, data };
  } finally {
    bmp.close();
  }
}

/** Encodes pixels as a PNG or JPEG file (browser only). */
export async function encodeImage(p: Pixels, mime: "image/png" | "image/jpeg", quality = 0.92): Promise<Uint8Array> {
  const canvas = new OffscreenCanvas(p.width, p.height);
  canvas.getContext("2d")!.putImageData(new ImageData(p.data as Uint8ClampedArray<ArrayBuffer>, p.width, p.height), 0, 0);
  const out = await canvas.convertToBlob({ type: mime, quality });
  return new Uint8Array(await out.arrayBuffer());
}
