/**
 * Maps between source-image coordinates and screen coordinates when a video is
 * drawn "cover"-fitted (filling the destination, cropping the overflow, never
 * stretching) and optionally mirrored. The shader and the 2D overlay both use
 * this so boxes, skeletons and click targets line up with the pixels.
 *
 * Normalized source coordinates (nx, ny) are in [0,1] over the *unmirrored* image,
 * origin top-left. Screen coordinates are CSS pixels in the destination, origin top-left.
 */
export interface Viewport {
  /** Source pixels → screen pixels. */
  scale: number;
  /** Screen position of the displayed image's top-left corner (may be negative). */
  offsetX: number;
  offsetY: number;
  mirror: boolean;
  srcW: number;
  srcH: number;
  dstW: number;
  dstH: number;
}

export function coverFit(srcW: number, srcH: number, dstW: number, dstH: number, mirror: boolean): Viewport {
  const scale = Math.max(dstW / Math.max(srcW, 1), dstH / Math.max(srcH, 1));
  return {
    scale,
    offsetX: (dstW - srcW * scale) / 2,
    offsetY: (dstH - srcH * scale) / 2,
    mirror,
    srcW,
    srcH,
    dstW,
    dstH,
  };
}

export function toScreen(v: Viewport, nx: number, ny: number): { x: number; y: number } {
  const u = v.mirror ? 1 - nx : nx;
  return { x: v.offsetX + u * v.srcW * v.scale, y: v.offsetY + ny * v.srcH * v.scale };
}

export function toSource(v: Viewport, x: number, y: number): { nx: number; ny: number } {
  const u = (x - v.offsetX) / (v.srcW * v.scale);
  return { nx: v.mirror ? 1 - u : u, ny: (y - v.offsetY) / (v.srcH * v.scale) };
}

/** Converts a normalized source box [x0,y0,x1,y1] to a screen rectangle. */
export function boxToScreen(v: Viewport, box: [number, number, number, number]) {
  const a = toScreen(v, box[0], box[1]);
  const b = toScreen(v, box[2], box[3]);
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
}

/**
 * Uniforms for the shader: srcUv = screenUv * scale + offset (screenUv origin
 * top-left), then the shader flips x when mirrored.
 */
export function shaderUv(v: Viewport): { scale: [number, number]; offset: [number, number] } {
  const dispW = v.srcW * v.scale;
  const dispH = v.srcH * v.scale;
  return {
    scale: [v.dstW / dispW, v.dstH / dispH],
    offset: [-v.offsetX / dispW, -v.offsetY / dispH],
  };
}
