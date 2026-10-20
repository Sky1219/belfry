export interface TaskSpec {
  name: string;
  /** Higher = more important; low-priority tasks are slowed first under load. */
  priority: number;
  /** Run every N new frames when there is headroom. */
  defaultInterval: number;
  /** Never slow this task beyond every N frames. */
  maxInterval: number;
  run(frame: number, timeMs: number): void | Promise<void>;
}

interface TaskState extends TaskSpec {
  interval: number;
  lastRunFrame: number;
  avgMs: number | null;
  active: boolean;
  inFlight: boolean;
  warned: boolean;
}

export interface TaskStats {
  name: string;
  interval: number;
  avgMs: number;
  active: boolean;
  inFlight: boolean;
}

/**
 * Runs each model at its own rate so several can share one frame budget.
 * Async tasks (e.g. a worker) are never started again while still running.
 * Every `adaptEveryMs` it nudges intervals to hold `targetFps`: slowing the
 * least important task when frames run long, and speeding the most important
 * one back up (never past its default) when there is headroom.
 */
export class ModelScheduler {
  private tasks: TaskState[] = [];
  private frameMsEma: number | null = null;
  private lastAdapt: number;
  private targetFps: number;
  private adaptEveryMs: number;
  private now: () => number;

  constructor(opts: { targetFps?: number; adaptEveryMs?: number; now?: () => number } = {}) {
    this.targetFps = opts.targetFps ?? 30;
    this.adaptEveryMs = opts.adaptEveryMs ?? 1000;
    this.now = opts.now ?? (() => performance.now());
    this.lastAdapt = this.now();
  }

  add(spec: TaskSpec): void {
    this.remove(spec.name);
    this.tasks.push({
      ...spec,
      interval: spec.defaultInterval,
      lastRunFrame: -Infinity,
      avgMs: null,
      active: true,
      inFlight: false,
      warned: false,
    });
  }

  remove(name: string): void {
    this.tasks = this.tasks.filter((t) => t.name !== name);
  }

  has(name: string): boolean {
    return this.tasks.some((t) => t.name === name);
  }

  setActive(name: string, active: boolean): void {
    const t = this.tasks.find((x) => x.name === name);
    if (t) t.active = active;
  }

  onNewFrame(frame: number, timeMs: number): void {
    for (const t of this.tasks) {
      if (!t.active || t.inFlight || frame - t.lastRunFrame < t.interval) continue;
      t.lastRunFrame = frame;
      const start = this.now();
      let result: void | Promise<void>;
      try {
        result = t.run(frame, timeMs);
      } catch (e) {
        this.warnOnce(t, e);
        this.record(t, start);
        continue;
      }
      if (result && typeof (result as Promise<void>).then === "function") {
        t.inFlight = true;
        (result as Promise<void>).then(
          () => this.finish(t, start),
          (e) => {
            this.warnOnce(t, e);
            this.finish(t, start);
          },
        );
      } else {
        this.record(t, start);
      }
    }
  }

  reportFrameTime(ms: number): void {
    this.frameMsEma = this.frameMsEma === null ? ms : this.frameMsEma * 0.9 + ms * 0.1;
    const now = this.now();
    if (now - this.lastAdapt < this.adaptEveryMs) return;
    this.lastAdapt = now;
    this.adapt();
  }

  /** Smoothed frame time in ms (null before the first report). */
  frameTime(): number | null {
    return this.frameMsEma;
  }

  /** True when every active task is already at its slowest allowed rate. */
  saturated(): boolean {
    const active = this.tasks.filter((t) => t.active);
    return active.length > 0 && active.every((t) => t.interval >= t.maxInterval);
  }

  stats(): TaskStats[] {
    return this.tasks.map((t) => ({
      name: t.name,
      interval: t.interval,
      avgMs: t.avgMs ?? 0,
      active: t.active,
      inFlight: t.inFlight,
    }));
  }

  private adapt() {
    if (this.frameMsEma === null) return;
    const budget = 1000 / this.targetFps;
    const active = this.tasks.filter((t) => t.active);
    if (this.frameMsEma > budget * 1.1) {
      const victim = active
        .filter((t) => t.interval < t.maxInterval)
        .sort((a, b) => a.priority - b.priority)[0];
      if (victim) victim.interval += 1;
    } else if (this.frameMsEma < budget * 0.8) {
      const lucky = active
        .filter((t) => t.interval > t.defaultInterval)
        .sort((a, b) => b.priority - a.priority)[0];
      if (lucky) lucky.interval -= 1;
    }
  }

  private finish(t: TaskState, start: number) {
    t.inFlight = false;
    this.record(t, start);
  }

  private record(t: TaskState, start: number) {
    const dt = this.now() - start;
    t.avgMs = t.avgMs === null ? dt : t.avgMs * 0.9 + dt * 0.1;
  }

  private warnOnce(t: TaskState, e: unknown) {
    if (t.warned) return;
    t.warned = true;
    console.warn(`[scheduler] task "${t.name}" failed:`, e);
  }
}
