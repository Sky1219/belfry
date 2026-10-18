import { describe, expect, test, vi } from "vitest";
import { ModelScheduler, type TaskSpec } from "../../src/platform/scheduler";

function setup() {
  let t = 0;
  const s = new ModelScheduler({ targetFps: 30, adaptEveryMs: 1000, now: () => t });
  return { s, advance: (ms: number) => (t += ms), now: () => t };
}

const task = (name: string, priority: number, defaultInterval: number, run: TaskSpec["run"] = () => {}, maxInterval = 8): TaskSpec => ({
  name,
  priority,
  defaultInterval,
  maxInterval,
  run,
});

/** Feeds `seconds` of frames at `frameMs` per frame. */
function feed(s: ModelScheduler, advance: (ms: number) => void, frameMs: number, seconds: number, start = 0) {
  const n = Math.round((seconds * 1000) / frameMs);
  for (let i = 0; i < n; i++) {
    s.onNewFrame(start + i, i * frameMs);
    advance(frameMs);
    s.reportFrameTime(frameMs);
  }
  return start + n;
}

const interval = (s: ModelScheduler, name: string) => s.stats().find((x) => x.name === name)!.interval;

describe("ModelScheduler", () => {
  test("runs each task at its interval", () => {
    const { s } = setup();
    const a = vi.fn();
    const b = vi.fn();
    s.add(task("a", 3, 1, a));
    s.add(task("b", 1, 3, b));
    for (let f = 0; f < 9; f++) s.onNewFrame(f, f * 33);
    expect(a).toHaveBeenCalledTimes(9);
    expect(b).toHaveBeenCalledTimes(3);
    expect(b.mock.calls.map((c) => c[0])).toEqual([0, 3, 6]);
  });

  test("inactive tasks never run", () => {
    const { s } = setup();
    const a = vi.fn();
    s.add(task("a", 1, 1, a));
    s.setActive("a", false);
    for (let f = 0; f < 5; f++) s.onNewFrame(f, f * 33);
    expect(a).not.toHaveBeenCalled();
    s.setActive("a", true);
    s.onNewFrame(5, 165);
    expect(a).toHaveBeenCalledTimes(1);
  });

  test("async task is not re-entered while in flight", async () => {
    const { s } = setup();
    let resolve!: () => void;
    const run = vi.fn(() => new Promise<void>((r) => (resolve = r)));
    s.add(task("depth", 1, 1, run));
    s.onNewFrame(0, 0);
    s.onNewFrame(1, 33);
    s.onNewFrame(2, 66);
    expect(run).toHaveBeenCalledTimes(1);
    expect(s.stats()[0].inFlight).toBe(true);
    resolve();
    await Promise.resolve();
    await Promise.resolve();
    s.onNewFrame(3, 99);
    expect(run).toHaveBeenCalledTimes(2);
  });

  test("backs off the lowest-priority task when frames are slow", () => {
    const { s, advance } = setup();
    s.add(task("seg", 5, 1));
    s.add(task("depth", 1, 10, () => {}, 30));
    feed(s, advance, 50, 1.2); // 20 fps, budget is 33 ms
    expect(interval(s, "depth")).toBe(11);
    expect(interval(s, "seg")).toBe(1);
  });

  test("recovers the highest-priority task when frames are fast, never below default", () => {
    const { s, advance } = setup();
    s.add(task("seg", 5, 1, () => {}, 4));
    s.add(task("pose", 3, 2, () => {}, 6));
    // slow for a while: lowest-priority backs off first, until capped
    let f = feed(s, advance, 60, 6);
    expect(interval(s, "pose")).toBe(6);
    expect(interval(s, "seg")).toBeGreaterThan(1);
    // fast again: highest-priority recovers first, then the next
    f = feed(s, advance, 16, 12, f);
    expect(interval(s, "seg")).toBe(1);
    expect(interval(s, "pose")).toBe(2);
    feed(s, advance, 16, 5, f);
    expect(interval(s, "seg")).toBe(1);
    expect(interval(s, "pose")).toBe(2);
  });

  test("never exceeds maxInterval", () => {
    const { s, advance } = setup();
    s.add(task("only", 1, 1, () => {}, 3));
    feed(s, advance, 100, 10);
    expect(interval(s, "only")).toBe(3);
  });

  test("rejected async run is treated as finished", async () => {
    const { s } = setup();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const run = vi.fn(() => Promise.reject(new Error("model crashed")));
    s.add(task("bad", 1, 1, run));
    s.onNewFrame(0, 0);
    await Promise.resolve();
    await Promise.resolve();
    s.onNewFrame(1, 33);
    await Promise.resolve();
    await Promise.resolve();
    expect(run).toHaveBeenCalledTimes(2);
    expect(s.stats()[0].inFlight).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1); // logged once per task
    warn.mockRestore();
  });
});
