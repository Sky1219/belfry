/** Plain color name for the average color of the central 60% of an RGBA image. */
export function dominantColorName(rgba: Uint8ClampedArray, w: number, h: number): string {
  let r = 0, g = 0, b = 0, n = 0;
  const x0 = Math.floor(w * 0.2), x1 = Math.ceil(w * 0.8);
  const y0 = Math.floor(h * 0.2), y1 = Math.ceil(h * 0.8);
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * w + x) * 4;
      r += rgba[i];
      g += rgba[i + 1];
      b += rgba[i + 2];
      n++;
    }
  }
  if (!n) return "unknown";
  return nameColor(r / n / 255, g / n / 255, b / n / 255);
}

export function nameColor(r: number, g: number, b: number): string {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const v = max;
  const s = max === 0 ? 0 : (max - min) / max;
  if (v < 0.2) return "black";
  if (s < 0.18) return v > 0.85 ? "white" : "gray";
  let hue = 0;
  const d = max - min;
  if (max === r) hue = 60 * (((g - b) / d) % 6);
  else if (max === g) hue = 60 * ((b - r) / d + 2);
  else hue = 60 * ((r - g) / d + 4);
  if (hue < 0) hue += 360;
  if ((hue < 40 || hue >= 345) && v < 0.6) return "brown";
  if (hue < 15 || hue >= 345) return "red";
  if (hue < 40) return "orange";
  if (hue < 70) return "yellow";
  if (hue < 165) return "green";
  if (hue < 200) return "cyan";
  if (hue < 260) return "blue";
  if (hue < 290) return "purple";
  return "pink";
}
