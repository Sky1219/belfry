import { binarize, gaborEnhance, medianKnown, ridgeFrequency } from "./enhance";
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
  /** Median ridge frequency over the known blocks, px^-1; 0 when no block's frequency is known. */
  medianFrequency: number;
}

/**
 * The whole pipeline on a grayscale print (already scaled by the caller):
 * normalise, orientation, mask, frequency, Gabor, binarise, thin, minutiae.
 * A block is print only where it has both contrast and a ridge direction
 * (Ruling P2-R9), so a blank photo's noise is not read as ridges.
 */
export function analysePrint(gray: Float32Array, w: number, h: number): PrintAnalysis {
  const norm = normalize(gray);
  const field = orientationField(norm, w, h);
  const { mask, bw } = segmentMask(norm, w, h, 16, 0.1, field.coherence);
  const freq = ridgeFrequency(norm, w, h, field, mask);
  const skeleton = zhangSuen(binarize(gaborEnhance(norm, w, h, field, freq, mask)), w, h);
  return {
    minutiae: extractMinutiae(skeleton, w, h, mask, bw),
    skeleton,
    width: w,
    height: h,
    medianFrequency: medianKnown(freq),
  };
}
