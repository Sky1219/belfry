import { binarize, gaborEnhance, ridgeFrequency } from "./enhance";
import { extractMinutiae, type Minutia } from "./minutiae";
import { normalize, orientationField, segmentMask } from "./orientation";
import { zhangSuen } from "./thin";

export type { Minutia };

export interface PrintAnalysis {
  minutiae: Minutia[];
  /** One-pixel ridge skeleton, 1 = ridge, same size as the input. */
  skeleton: Uint8Array;
  width: number;
  height: number;
}

/**
 * The whole pipeline on a grayscale print (already scaled by the caller):
 * normalise, mask, orientation, frequency, Gabor, binarise, thin, minutiae.
 */
export function analysePrint(gray: Float32Array, w: number, h: number): PrintAnalysis {
  const norm = normalize(gray);
  const { mask, bw } = segmentMask(norm, w, h);
  const field = orientationField(norm, w, h);
  const freq = ridgeFrequency(norm, w, h, field, mask);
  const skeleton = zhangSuen(binarize(gaborEnhance(norm, w, h, field, freq, mask)), w, h);
  return { minutiae: extractMinutiae(skeleton, w, h, mask, bw), skeleton, width: w, height: h };
}
