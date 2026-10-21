/** Zigzag index to natural (row-major) index, as JPEG stores a quantization table. */
export const ZIGZAG: readonly number[] = [
  0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13, 6, 7, 14, 21,
  28, 35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51, 58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61,
  54, 47, 55, 62, 63,
];

/** BASIS[u * 8 + x] = c(u) / 2 * cos((2x + 1) u pi / 16), the orthonormal type-II basis. */
const BASIS = (() => {
  const t = new Float64Array(64);
  for (let u = 0; u < 8; u++) {
    const c = u === 0 ? Math.SQRT1_2 : 1;
    for (let x = 0; x < 8; x++) t[u * 8 + x] = (c / 2) * Math.cos(((2 * x + 1) * u * Math.PI) / 16);
  }
  return t;
})();

/** Applies the 1-D transform along rows, then columns: out = B in B^T (forward) or B^T in B (inverse). */
function transform(input: Float64Array, inverse: boolean): Float64Array {
  const tmp = new Float64Array(64);
  const out = new Float64Array(64);
  for (let r = 0; r < 8; r++) {
    for (let k = 0; k < 8; k++) {
      let s = 0;
      for (let j = 0; j < 8; j++) s += input[r * 8 + j] * (inverse ? BASIS[j * 8 + k] : BASIS[k * 8 + j]);
      tmp[r * 8 + k] = s;
    }
  }
  for (let c = 0; c < 8; c++) {
    for (let k = 0; k < 8; k++) {
      let s = 0;
      for (let j = 0; j < 8; j++) s += tmp[j * 8 + c] * (inverse ? BASIS[j * 8 + k] : BASIS[k * 8 + j]);
      out[k * 8 + c] = s;
    }
  }
  return out;
}

/** Orthonormal 8x8 DCT-II of a row-major block. A constant block of v gives DC = 8v. */
export function dct8x8(block: Float64Array): Float64Array {
  return transform(block, false);
}

/** Inverse of `dct8x8`. */
export function idct8x8(coeffs: Float64Array): Float64Array {
  return transform(coeffs, true);
}
