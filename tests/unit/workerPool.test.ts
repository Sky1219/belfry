import { describe, expect, test } from "vitest";
import { handleRequest, ops, transferablesOf } from "../../src/platform/workers/ops";
import { defaultPoolSize, TaskAbortedError, WorkerPool, type Request, type WorkerLike } from "../../src/platform/workers/pool";

type Table = Record<string, (p: never) => unknown>;

/** A fake worker that runs requests against an op table on a later tick, like a real one. */
class FakeWorker implements WorkerLike {
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: ((ev: ErrorEvent) => void) | null = null;
  terminated = false;
  posted: Array<{ req: Request; transfer: Transferable[] }> = [];
  /** When set, requests wait here instead of running, so tests control timing. */
  held: Request[] | null = null;

  constructor(private table: Table) {}

  postMessage(message: unknown, transfer: Transferable[]): void {
    const req = message as Request;
    this.posted.push({ req, transfer });
    if (this.held) this.held.push(req);
    else void this.reply(req);
  }

  async reply(req: Request) {
    const r = await handleRequest(this.table, req);
    await Promise.resolve();
    if (!this.terminated) this.onmessage?.({ data: r } as MessageEvent);
  }

  crash(message: string) {
    this.onerror?.({ message, preventDefault() {} } as ErrorEvent);
  }

  terminate(): void {
    this.terminated = true;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function poolOf(size: number, table: Table = ops as unknown as Table, hold = false) {
  const workers: FakeWorker[] = [];
  const pool = new WorkerPool(() => {
    const w = new FakeWorker(table);
    if (hold) w.held = [];
    workers.push(w);
    return w;
  }, size);
  return { pool, workers };
}

describe("worker pool", () => {
  test("runs an op and returns its result", async () => {
    const { pool } = poolOf(2);
    const re = new Float64Array([1, 0, 0, 0]);
    const out = await pool.run<{ re: Float64Array; im: Float64Array }>("fft", { re });
    expect(Array.from(out.re)).toEqual([1, 1, 1, 1]);
  });

  test("spawns lazily, never more than its size, and queues the rest", async () => {
    const { pool, workers } = poolOf(2, ops as unknown as Table, true);
    expect(workers).toHaveLength(0);
    const tasks = [1, 2, 3, 4, 5].map(() => pool.run("fft", { re: new Float64Array(2) }));
    expect(workers).toHaveLength(2);
    expect(pool.stats()).toEqual({ workers: 2, busy: 2, queued: 3 });
    // let them all run
    for (const w of workers) {
      const reqs = w.held!;
      w.held = null;
      reqs.forEach((r) => void w.reply(r));
    }
    await Promise.all(tasks);
    expect(workers).toHaveLength(2);
    expect(pool.stats()).toEqual({ workers: 2, busy: 0, queued: 0 });
  });

  test("passes transfer lists through to the worker", async () => {
    const { pool, workers } = poolOf(1);
    const re = new Float64Array(4);
    await pool.run("fft", { re }, { transfer: [re.buffer] });
    expect(workers[0].posted[0].transfer).toEqual([re.buffer]);
  });

  test("an op that throws, or an unknown op, rejects with the message", async () => {
    const { pool } = poolOf(1, { boom: () => { throw new Error("bad input"); } });
    await expect(pool.run("boom", null)).rejects.toThrow("bad input");
    await expect(pool.run("nope", null)).rejects.toThrow("Unknown op “nope”.");
  });

  test("aborting a queued task drops it; aborting a running one replaces its worker", async () => {
    const { pool, workers } = poolOf(1, { slow: async () => { await sleep(5); return "done"; } }, true);
    const running = new AbortController();
    const queued = new AbortController();
    const a = pool.run("slow", null, { signal: running.signal });
    const b = pool.run("slow", null, { signal: queued.signal });
    const c = pool.run("slow", null);
    queued.abort();
    await expect(b).rejects.toBeInstanceOf(TaskAbortedError);
    expect(pool.stats().queued).toBe(1);

    running.abort();
    await expect(a).rejects.toBeInstanceOf(TaskAbortedError);
    expect(workers[0].terminated).toBe(true);
    // c moved to a fresh worker
    expect(workers).toHaveLength(2);
    const w = workers[1];
    w.held = null;
    void w.reply(w.posted[0].req);
    await expect(c).resolves.toBe("done");
  });

  test("an already-aborted signal never starts the task", async () => {
    const { pool, workers } = poolOf(1);
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(pool.run("fft", { re: new Float64Array(2) }, { signal: ctrl.signal })).rejects.toBeInstanceOf(TaskAbortedError);
    expect(workers).toHaveLength(0);
  });

  test("a crashed worker fails only its task and is replaced", async () => {
    const { pool, workers } = poolOf(1, { echo: (p: never) => p }, true);
    const a = pool.run("echo", 1);
    const b = pool.run("echo", 2);
    workers[0].crash("out of memory");
    await expect(a).rejects.toThrow("The worker crashed: out of memory");
    expect(workers[0].terminated).toBe(true);
    const w = workers[1];
    w.held = null;
    void w.reply(w.posted[0].req);
    await expect(b).resolves.toBe(2);
  });

  test("dispose fails running and queued tasks and refuses new ones", async () => {
    const { pool, workers } = poolOf(1, { echo: (p: never) => p }, true);
    const a = pool.run("echo", 1);
    const b = pool.run("echo", 2);
    pool.dispose();
    await expect(a).rejects.toThrow("shut down");
    await expect(b).rejects.toThrow("shut down");
    expect(workers[0].terminated).toBe(true);
    await expect(pool.run("echo", 3)).rejects.toThrow("shut down");
  });

  test("default size leaves a core for the main thread, capped at four", () => {
    expect(defaultPoolSize(1)).toBe(1);
    expect(defaultPoolSize(2)).toBe(1);
    expect(defaultPoolSize(4)).toBe(3);
    expect(defaultPoolSize(16)).toBe(4);
  });

  test("results' typed arrays are transferred back", () => {
    const re = new Float64Array(2);
    const im = new Float64Array(2);
    expect(transferablesOf({ re, im })).toEqual([re.buffer, im.buffer]);
    expect(transferablesOf(re)).toEqual([re.buffer]);
    expect(transferablesOf("text")).toEqual([]);
  });
});
