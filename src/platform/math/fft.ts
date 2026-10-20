/**
 * In-place iterative radix-2 FFT. `re` and `im` must have the same
 * power-of-two length. `inverse` runs the inverse transform, scaled by 1/n so
 * that fft then inverse fft gives back the input.
 */
export function fft(re: Float64Array, im: Float64Array, inverse = false): void {
  const n = re.length;
  if (im.length !== n) throw new RangeError("fft: re and im differ in length");
  if (n === 0 || (n & (n - 1)) !== 0) throw new RangeError(`fft: length ${n} is not a power of two`);
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  const sign = inverse ? 1 : -1;
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (sign * 2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    const half = len / 2;
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < half; k++) {
        const ar = re[i + k + half] * cr - im[i + k + half] * ci;
        const ai = re[i + k + half] * ci + im[i + k + half] * cr;
        re[i + k + half] = re[i + k] - ar;
        im[i + k + half] = im[i + k] - ai;
        re[i + k] += ar;
        im[i + k] += ai;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
  if (inverse) {
    for (let i = 0; i < n; i++) {
      re[i] /= n;
      im[i] /= n;
    }
  }
}
