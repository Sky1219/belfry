import type { ComputeOps, OpName } from "./ops";
import { WorkerPool, type RunOptions } from "./pool";

let pool: WorkerPool | null = null;

/** The app-wide compute pool, created on first use. */
export function computePool(): WorkerPool {
  pool ??= new WorkerPool(() => new Worker(new URL("./compute.worker.ts", import.meta.url), { type: "module" }));
  return pool;
}

/** Runs a named op from `ops.ts` on the shared pool, typed by its payload and result. */
export function runOp<K extends OpName>(op: K, payload: Parameters<ComputeOps[K]>[0], opts?: RunOptions): Promise<ReturnType<ComputeOps[K]>> {
  return computePool().run(op, payload, opts);
}

export const compute = {
  /** FFT off the main thread. The arrays are moved to the worker: use the returned ones. */
  fft: (re: Float64Array, im?: Float64Array, opts: { inverse?: boolean; signal?: AbortSignal } = {}) =>
    runOp("fft", { re, im, inverse: opts.inverse }, { signal: opts.signal, transfer: [re.buffer, ...(im ? [im.buffer] : [])] }),
};
