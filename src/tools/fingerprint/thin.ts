/**
 * Zhang-Suen thinning: peels ridge pixels (1) off a binary image, two
 * sub-iterations at a time, until each ridge is one pixel wide. The 1 px border
 * is never touched, so a ridge running off the edge is not eaten by wrap-around.
 * Returns a new image; the input is left alone.
 */
export function zhangSuen(bin: Uint8Array, w: number, h: number): Uint8Array {
  const img = Uint8Array.from(bin);
  const doomed: number[] = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (let pass = 0; pass < 2; pass++) {
      doomed.length = 0;
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const i = y * w + x;
          if (!img[i]) continue;
          // Neighbours clockwise from north: P2..P9.
          const p2 = img[i - w];
          const p3 = img[i - w + 1];
          const p4 = img[i + 1];
          const p5 = img[i + w + 1];
          const p6 = img[i + w];
          const p7 = img[i + w - 1];
          const p8 = img[i - 1];
          const p9 = img[i - w - 1];
          const b = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
          if (b < 2 || b > 6) continue;
          const a =
            (!p2 && p3 ? 1 : 0) + (!p3 && p4 ? 1 : 0) + (!p4 && p5 ? 1 : 0) + (!p5 && p6 ? 1 : 0) +
            (!p6 && p7 ? 1 : 0) + (!p7 && p8 ? 1 : 0) + (!p8 && p9 ? 1 : 0) + (!p9 && p2 ? 1 : 0);
          if (a !== 1) continue;
          const keep =
            pass === 0 ? p2 * p4 * p6 === 0 && p4 * p6 * p8 === 0 : p2 * p4 * p8 === 0 && p2 * p6 * p8 === 0;
          if (keep) doomed.push(i);
        }
      }
      for (const i of doomed) img[i] = 0;
      if (doomed.length > 0) changed = true;
    }
  }
  return img;
}
