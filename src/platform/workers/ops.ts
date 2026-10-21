import { fft } from "../math/fft";
import { detectCopyMove, type CopyMoveResult } from "../../tools/photo/copyMove";
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
};

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
