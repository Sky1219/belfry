import { describe, expect, test, vi } from "vitest";
import { TaskHolder } from "../../src/tools/detective/models/taskHolder";

const task = () => ({ close: vi.fn() });

describe("TaskHolder", () => {
  test("holds a created task until disposed", async () => {
    const h = new TaskHolder<ReturnType<typeof task>>();
    const t = task();
    await h.load(async () => t);
    expect(h.get()).toBe(t);
    h.dispose();
    expect(t.close).toHaveBeenCalledTimes(1);
    expect(h.get()).toBeNull();
  });

  test("a task that finishes loading after dispose is closed, not kept", async () => {
    const h = new TaskHolder<ReturnType<typeof task>>();
    const t = task();
    let resolve!: (v: typeof t) => void;
    const loading = h.load(() => new Promise((r) => (resolve = r)));
    h.dispose(); // tool closed while the model was still downloading
    resolve(t);
    await loading.catch(() => {});
    expect(t.close).toHaveBeenCalledTimes(1);
    expect(h.get()).toBeNull();
  });

  test("reloading closes the previous task", async () => {
    const h = new TaskHolder<ReturnType<typeof task>>();
    const a = task();
    const b = task();
    await h.load(async () => a);
    await h.load(async () => b);
    expect(a.close).toHaveBeenCalledTimes(1);
    expect(h.get()).toBe(b);
  });
});
