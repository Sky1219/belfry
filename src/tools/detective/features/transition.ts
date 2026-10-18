/** Timing for the pulse transition between vision modes. */
export class Transition {
  private startedAt = -Infinity;
  private ended = true;

  constructor(private durationMs: number) {}

  start(tMs: number): void {
    this.startedAt = tMs;
    this.ended = false;
  }

  progress(tMs: number): number {
    return Math.min(1, Math.max(0, (tMs - this.startedAt) / this.durationMs));
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
