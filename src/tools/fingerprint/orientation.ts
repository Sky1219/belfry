/** Shift to mean 0 and variance 1. A flat image has no variance to scale by, so it comes back all zeros. */
export function normalize(gray: Float32Array): Float32Array {
  const n = gray.length;
  let mean = 0;
  for (let i = 0; i < n; i++) mean += gray[i];
  mean /= n;
  let variance = 0;
  for (let i = 0; i < n; i++) variance += (gray[i] - mean) * (gray[i] - mean);
  variance /= n;
  const out = new Float32Array(n);
  if (variance < 1e-12) return out;
  const inv = 1 / Math.sqrt(variance);
  for (let i = 0; i < n; i++) out[i] = (gray[i] - mean) * inv;
  return out;
}

/**
 * Marks each full `block` x `block` square whose variance is at least `minVar`
 * (on the normalised image) as print. Partial blocks at the right and bottom
 * edges are left out, so the grid is bw x bh, row-major.
 */
export function segmentMask(
  norm: Float32Array,
  w: number,
  h: number,
  block = 16,
  minVar = 0.1,
): { mask: Uint8Array; bw: number; bh: number } {
  const bw = Math.floor(w / block);
  const bh = Math.floor(h / block);
  const mask = new Uint8Array(bw * bh);
  const area = block * block;
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      let sum = 0;
      let sumSq = 0;
      for (let y = by * block; y < (by + 1) * block; y++) {
        for (let x = bx * block; x < (bx + 1) * block; x++) {
          const v = norm[y * w + x];
          sum += v;
          sumSq += v * v;
        }
      }
      const mean = sum / area;
      mask[by * bw + bx] = sumSq / area - mean * mean >= minVar ? 1 : 0;
    }
  }
  return { mask, bw, bh };
}

/**
 * Block-wise ridge direction theta in [0, pi) from Sobel gradients, with
 * coherence in [0, 1] (1 = all gradients agree). The doubled-angle vectors are
 * smoothed with a 3x3 average before the angle is taken, so a block with no
 * gradient of its own borrows its neighbours' direction.
 */
export function orientationField(
  norm: Float32Array,
  w: number,
  h: number,
  block = 16,
): { theta: Float32Array; coherence: Float32Array; bw: number; bh: number } {
  const bw = Math.floor(w / block);
  const bh = Math.floor(h / block);
  const at = (x: number, y: number) => norm[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];

  // Per block: Σ(Gx² − Gy²), Σ 2GxGy, Σ(Gx² + Gy²).
  const vx = new Float64Array(bw * bh);
  const vy = new Float64Array(bw * bh);
  const energy = new Float64Array(bw * bh);
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      let sxx = 0;
      let syy = 0;
      let sxy = 0;
      for (let y = by * block; y < (by + 1) * block; y++) {
        for (let x = bx * block; x < (bx + 1) * block; x++) {
          const gx =
            at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) -
            at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1);
          const gy =
            at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) -
            at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1);
          sxx += gx * gx;
          syy += gy * gy;
          sxy += gx * gy;
        }
      }
      const i = by * bw + bx;
      vx[i] = sxx - syy;
      vy[i] = 2 * sxy;
      energy[i] = sxx + syy;
    }
  }

  const theta = new Float32Array(bw * bh);
  const coherence = new Float32Array(bw * bh);
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      const i = by * bw + bx;
      coherence[i] = energy[i] > 0 ? Math.hypot(vx[i], vy[i]) / energy[i] : 0;
      let sx = 0;
      let sy = 0;
      for (let j = Math.max(0, by - 1); j <= Math.min(bh - 1, by + 1); j++) {
        for (let k = Math.max(0, bx - 1); k <= Math.min(bw - 1, bx + 1); k++) {
          sx += vx[j * bw + k];
          sy += vy[j * bw + k];
        }
      }
      // The gradient points across the ridge; the ridge runs a quarter turn from it.
      const t = (0.5 * Math.atan2(sy, sx) + Math.PI / 2) % Math.PI;
      theta[i] = t < 0 ? t + Math.PI : t;
    }
  }
  return { theta, coherence, bw, bh };
}
