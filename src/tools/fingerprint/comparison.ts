import type { Verdict } from "../imagekit/verdict";
import type { MinutiaeMatch } from "./match";
import type { PrintAnalysis } from "./pipeline";

// mirrored from the theme for the canvas drawing
const AMBER = "#ffa733";
const BONE = "#ece6dc";
const BONE_RGB = [236, 230, 220] as const;
const STEEL = "#9aa3ad";
const GLASS = "#07090c";
/** Space between the two prints in the comparison image, px. */
const GUTTER = 16;

/** A print as the lab analysed it: the pipeline's result and the gray it ran on, for drawing. */
export interface Print {
  analysis: PrintAnalysis;
  gray: Float32Array;
}

/** How the comparison shows the best alignment's pairs, and the key line that explains it. */
export interface PairStyle {
  lines: "amber" | "steel" | "none";
  key: string;
}

/**
 * Decides how the pairs are drawn (Ruling P2-R7). Amber marks a finding, so
 * pairs are amber only on a "consistent" verdict; otherwise they are steel and
 * the key doesn't call them matches. With too little ridge detail to score
 * (`score` null) no pairs are drawn and no count is given, since the finding
 * disclaims any comparison.
 */
export function pairStyle(f: { verdict: Verdict; score: number | null }, pairs: number): PairStyle {
  if (f.score === null) return { lines: "none", key: "Not enough ridge detail to pair minutiae" };
  const one = pairs === 1;
  if (f.verdict === "consistent") return { lines: "amber", key: `${pairs} matched ${one ? "pair" : "pairs"} joined in amber` };
  return { lines: "steel", key: `${pairs} ${one ? "pair lines" : "pairs line"} up under the best alignment, drawn in steel` };
}

/**
 * Both prints side by side on black glass: each one dimmed, its ridge skeleton
 * in dim bone over it, every minutia a small square, and the best alignment's
 * pairs joined as `style` says (amber pairs mark their minutiae amber too).
 */
export function drawComparison(a: Print, b: Print, m: MinutiaeMatch, style: PairStyle): OffscreenCanvas {
  const A = a.analysis;
  const B = b.analysis;
  const width = A.width + GUTTER + B.width;
  const height = Math.max(A.height, B.height);
  const canvas = new OffscreenCanvas(width, height);
  const g = canvas.getContext("2d")!;
  g.fillStyle = GLASS;
  g.fillRect(0, 0, width, height);

  const offsets = [0, A.width + GUTTER];
  [a, b].forEach((p, k) => {
    const { width: w, height: h, skeleton } = p.analysis;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      // ridges at a little over half strength, so the pairs read over them at column width
      if (skeleton[i]) data.set([BONE_RGB[0] * 0.55, BONE_RGB[1] * 0.55, BONE_RGB[2] * 0.55, 255], i * 4);
      else {
        const v = p.gray[i] * 0.2;
        data.set([v, v, v, 255], i * 4);
      }
    }
    g.putImageData(new ImageData(data, w, h), offsets[k], 0);
  });

  const pairs = style.lines === "none" ? [] : m.pairs;
  const lit = style.lines === "amber";
  const matchedA = new Set(pairs.map(([i]) => i));
  const matchedB = new Set(pairs.map(([, j]) => j));
  // 2 px strokes: the panel shows the comparison at about a quarter of its size on a desktop column
  g.lineWidth = 2;
  g.strokeStyle = lit ? AMBER : STEEL;
  g.beginPath();
  for (const [i, j] of pairs) {
    g.moveTo(A.minutiae[i].x, A.minutiae[i].y);
    g.lineTo(offsets[1] + B.minutiae[j].x, B.minutiae[j].y);
  }
  g.stroke();
  const square = (x: number, y: number, matched: boolean) => {
    g.strokeStyle = matched && lit ? AMBER : BONE;
    g.strokeRect(Math.round(x) - 4, Math.round(y) - 4, 8, 8);
  };
  A.minutiae.forEach((q, i) => square(q.x, q.y, matchedA.has(i)));
  B.minutiae.forEach((q, j) => square(offsets[1] + q.x, q.y, matchedB.has(j)));
  return canvas;
}
