/**
 * A small pool of module workers for heavy maths (FFT, FEM, super-resolution),
 * so no tool blocks the board. Workers spawn on demand up to `size`; tasks
 * queue first in, first out. Framework-free: it takes a factory, so tests run
 * it on fake workers.
 *
 * Wire format: request `{ id, op, payload }` → reply `{ id, ok: true, result }`
 * or `{ id, ok: false, error }`.
 */

/** The part of `Worker` the pool uses. */
export interface WorkerLike {
  postMessage(message: unknown, transfer: Transferable[]): void;
  terminate(): void;
  onmessage: ((ev: MessageEvent) => void) | null;
  onerror: ((ev: ErrorEvent) => void) | null;
}

export interface Request {
  id: number;
  op: string;
  payload: unknown;
}

export type Reply = { id: number; ok: true; result: unknown } | { id: number; ok: false; error: string };

export interface RunOptions {
  /** Buffers to move to the worker instead of copying (the caller's copies become unusable). */
  transfer?: Transferable[];
  /** Aborting drops a queued task, or stops (and replaces) the worker running it. */
  signal?: AbortSignal;
}

export class TaskAbortedError extends Error {
  constructor() {
    super("The task was cancelled.");
    this.name = "AbortError";
  }
}

interface Task {
  id: number;
  op: string;
  payload: unknown;
  transfer: Transferable[];
  resolve(v: unknown): void;
  reject(e: Error): void;
  signal?: AbortSignal;
  onAbort?: () => void;
}

interface Slot {
  worker: WorkerLike;
  task: Task | null;
}

/** One worker per spare core, at most four: the main thread keeps one for the board and the video. */
export function defaultPoolSize(cores = globalThis.navigator?.hardwareConcurrency ?? 2): number {
  return Math.max(1, Math.min(4, cores - 1));
}

export class WorkerPool {
  private slots: Slot[] = [];
  private queue: Task[] = [];
  private nextId = 1;
  private disposed = false;

  constructor(
    private spawn: () => WorkerLike,
    readonly size = defaultPoolSize(),
  ) {}

  run<R>(op: string, payload: unknown, opts: RunOptions = {}): Promise<R> {
    if (this.disposed) return Promise.reject(new Error("The worker pool was shut down."));
    if (opts.signal?.aborted) return Promise.reject(new TaskAbortedError());
    return new Promise<R>((resolve, reject) => {
      const task: Task = {
        id: this.nextId++,
        op,
        payload,
        transfer: opts.transfer ?? [],
        resolve: resolve as (v: unknown) => void,
        reject,
        signal: opts.signal,
      };
      if (opts.signal) {
        task.onAbort = () => this.abort(task);
        opts.signal.addEventListener("abort", task.onAbort, { once: true });
      }
      this.queue.push(task);
      this.pump();
    });
  }

  /** Workers alive, workers busy, tasks waiting. */
  stats(): { workers: number; busy: number; queued: number } {
    return { workers: this.slots.length, busy: this.slots.filter((s) => s.task).length, queued: this.queue.length };
  }

  /** Stops every worker; running and queued tasks fail. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const pending = [...this.slots.flatMap((s) => (s.task ? [s.task] : [])), ...this.queue];
    for (const s of [...this.slots]) this.retire(s);
    this.queue = [];
    for (const t of pending) this.fail(t, new Error("The worker pool was shut down."));
  }

  private pump(): void {
    while (this.queue.length && !this.disposed) {
      const slot = this.slots.find((s) => !s.task) ?? (this.slots.length < this.size ? this.addSlot() : null);
      if (!slot) return;
      const task = this.queue.shift()!;
      slot.task = task;
      const req: Request = { id: task.id, op: task.op, payload: task.payload };
      try {
        slot.worker.postMessage(req, task.transfer);
      } catch (e) {
        // e.g. a payload that can't be cloned: this task fails, the worker is fine
        slot.task = null;
        this.fail(task, e as Error);
      }
    }
  }

  private addSlot(): Slot {
    const slot: Slot = { worker: this.spawn(), task: null };
    slot.worker.onmessage = (ev) => {
      const reply = ev.data as Reply;
      const task = slot.task;
      if (!task || reply?.id !== task.id) return; // a reply for a task that was already given up on
      slot.task = null;
      this.unlisten(task);
      if (reply.ok) task.resolve(reply.result);
      else task.reject(new Error(reply.error));
      this.pump();
    };
    slot.worker.onerror = (ev) => {
      ev.preventDefault?.();
      // a crashed worker is replaced; only the task it was running fails
      const task = slot.task;
      this.retire(slot);
      if (task) this.fail(task, new Error(`The worker crashed: ${ev.message || "unknown error"}`));
      this.pump();
    };
    this.slots.push(slot);
    return slot;
  }

  private abort(task: Task): void {
    const queued = this.queue.indexOf(task);
    if (queued >= 0) this.queue.splice(queued, 1);
    else {
      // a running op can't be interrupted, so its worker goes and a fresh one spawns when needed
      const slot = this.slots.find((s) => s.task === task);
      if (!slot) return;
      this.retire(slot);
    }
    this.fail(task, new TaskAbortedError());
    this.pump();
  }

  private retire(slot: Slot): void {
    slot.worker.onmessage = null;
    slot.worker.onerror = null;
    slot.worker.terminate();
    slot.task = null;
    this.slots = this.slots.filter((s) => s !== slot);
  }

  private fail(task: Task, e: Error): void {
    this.unlisten(task);
    task.reject(e);
  }

  private unlisten(task: Task): void {
    if (task.onAbort) task.signal?.removeEventListener("abort", task.onAbort);
  }
}
