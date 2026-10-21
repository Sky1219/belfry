import { fft } from "../math/fft";
import { comparePrints, type MatchInput, type PrintMatch } from "../../tools/fingerprint/match";
import { analysePrint, type PrintAnalysis } from "../../tools/fingerprint/pipeline";
import { displayHeatmap } from "../../tools/imagekit/heatmap";
import { detectCopyMove, type CopyMoveResult } from "../../tools/photo/copyMove";
import { dqScore } from "../../tools/photo/doubleQuant";
import { elaMap } from "../../tools/photo/ela";
import { noiseAnalysis } from "../../tools/photo/noise";
import type { Reply, Request } from "./pool";

/**
 * The ops a compute worker runs, by name. Each takes one payload and returns
 * one result. Shared by the worker and the tests.
 */
export const ops = {
  /** Complex FFT of a power-of-two-length signal; `im` defaults to zeros. */
  fft(p: { re: Float64Array; im?: Float64Array; inverse?: boolean }): { re: Float64Array; im: Float64Array } {
    const re = p.re;
    const im = p.im ?? new Float64Array(re.length);
    fft(re, im, p.inverse);
    return { re, im };
  },
  /** Copy-move detection on a grayscale image (the caller scales it to 512 px or less). */
  copyMove(p: { gray: Float32Array; width: number; height: number }): CopyMoveResult {
    return detectCopyMove(p.gray, p.width, p.height);
  },
  /** Error level map of a photo (RGBA) against its re-saved copy, coloured at display size. */
  ela(p: { original: Uint8ClampedArray; resaved: Uint8ClampedArray; width: number; height: number }): HeatMap {
    const { width, height } = p;
    return heatMap(elaMap({ width, height, data: p.original }, { width, height, data: p.resaved }), width, height);
  },
  /** Noise residual map, coloured at display size, and the block σ inconsistency (null when unmeasurable). */
  noise(p: { gray: Float32Array; width: number; height: number }): HeatMap & { inconsistency: number | null } {
    const { map, inconsistency } = noiseAnalysis(p.gray, p.width, p.height);
    return { ...heatMap(map, p.width, p.height), inconsistency };
  },
  /** Double-quantization score of a grayscale image against its luminance table (natural order). */
  dq(p: { gray: Float32Array; width: number; height: number; luma: Uint16Array }): number | null {
    return dqScore(p.gray, p.width, p.height, p.luma);
  },
  /** Minutiae and ridge skeleton of a grayscale print (the caller scales it to 640 px or less). */
  fingerprint(p: { gray: Float32Array; width: number; height: number }): PrintAnalysis {
    return analysePrint(p.gray, p.width, p.height);
  },
  /** Scale-normalised, rotation-invariant match of two analysed prints (Rulings P2-R10, P2-R11). */
  fingerprintMatch(p: { a: MatchInput; b: MatchInput }): PrintMatch {
    return comparePrints(p.a, p.b);
  },
};

/** A coloured map, long side at most MAP_SIDE; `rgba` is flat so it transfers back without a copy. */
export interface HeatMap {
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
}

function heatMap(values: Float32Array, w: number, h: number): HeatMap {
  const p = displayHeatmap(values, w, h);
  return { width: p.width, height: p.height, rgba: p.data };
}

export type ComputeOps = typeof ops;
export type OpName = keyof ComputeOps;

/** Runs one request against an op table; any failure comes back as an error reply, never a throw. */
export async function handleRequest(table: Record<string, (p: never) => unknown>, req: Request): Promise<Reply> {
  const fn = Object.hasOwn(table, req.op) ? table[req.op] : undefined;
  if (!fn) return { id: req.id, ok: false, error: `Unknown op “${req.op}”.` };
  try {
    return { id: req.id, ok: true, result: await fn(req.payload as never) };
  } catch (e) {
    return { id: req.id, ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** The buffers of typed arrays in a result (top level, or one object deep), to send back without copying. */
export function transferablesOf(result: unknown): Transferable[] {
  const out = new Set<ArrayBuffer>();
  const add = (v: unknown) => {
    if (ArrayBuffer.isView(v) && v.buffer instanceof ArrayBuffer) out.add(v.buffer);
    else if (v instanceof ArrayBuffer) out.add(v);
  };
  add(result);
  if (result && typeof result === "object" && !ArrayBuffer.isView(result)) Object.values(result).forEach(add);
  return [...out];
}
