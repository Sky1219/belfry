/**
 * Runs each model at its own rate so several models can share one frame budget.
 *
 *   segmentation  -> every frame
 *   detection     -> every ~3 frames   (planned)
 *   depth         -> every ~10 frames  (planned)
 *
 * Each task records a moving-average latency so the HUD (and later, an adaptive
 * policy) can see what each model costs.
 */
export interface Task {
  name: string;
  everyNFrames: number;
  run: (frame: number, nowMs: number) => void;
}

export class ModelScheduler {
  private tasks: Task[] = [];
  private frame = 0;
  readonly latencyMs = new Map<string, number>();

  add(task: Task) {
    this.tasks.push(task);
  }

  tick(nowMs: number) {
    for (const t of this.tasks) {
      if (this.frame % t.everyNFrames !== 0) continue;
      const start = performance.now();
      t.run(this.frame, nowMs);
      const dt = performance.now() - start;
      const prev = this.latencyMs.get(t.name) ?? dt;
      this.latencyMs.set(t.name, prev * 0.9 + dt * 0.1);
    }
    this.frame++;
  }
}
