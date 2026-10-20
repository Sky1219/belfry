/** Timing for the pulse transition between vision modes. */
export class Transition {
  private startedAt = -Infinity;
  private duration: number;
  private ended = true;

  constructor(private durationMs: number) {
    this.duration = durationMs;
  }

  /** `instant` (for reduced motion) cuts straight to the new mode with no pulse. */
  start(tMs: number, opts?: { instant?: boolean }): void {
    this.startedAt = tMs;
    this.duration = opts?.instant ? 0 : this.durationMs;
    this.ended = false;
  }

  progress(tMs: number): number {
    if (this.duration <= 0) return 1;
    return Math.min(1, Math.max(0, (tMs - this.startedAt) / this.duration));
  }

  running(tMs: number): boolean {
    return this.progress(tMs) < 1;
  }

  /** True once, on the first call after the transition has finished. */
  consumeEnd(tMs: number): boolean {
    if (this.ended || this.running(tMs)) return false;
    this.ended = true;
    return true;
  }
}
