import { describe, expect, test, vi } from "vitest";
import { ModelManager, type ModelAdapter } from "../../src/tools/detective/models/manager";
import type { ModelName } from "../../src/tools/detective/presets";

const NAMES: ModelName[] = ["segmentation", "face", "pose", "detection", "depth"];

function fakeAdapters(failing: ModelName[] = []) {
  const loads: Record<string, number> = {};
  const resolvers: Record<string, Array<() => void>> = {};
  const adapters = Object.fromEntries(
    NAMES.map((name) => [
      name,
      {
        name,
        load: vi.fn(() => {
          loads[name] = (loads[name] ?? 0) + 1;
          return failing.includes(name) && loads[name] === 1 ? Promise.reject(new Error("download failed")) : Promise.resolve();
        }),
        infer: () => null,
        dispose: () => {},
      } satisfies ModelAdapter<null>,
    ]),
  ) as unknown as Record<ModelName, ModelAdapter<null>>;
  return { adapters, loads, resolvers };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("ModelManager", () => {
  test("ensure loads only requested models", async () => {
    const { adapters, loads } = fakeAdapters();
    const m = new ModelManager(adapters);
    m.ensure(new Set<ModelName>(["detection", "face"]));
    m.ensure(new Set<ModelName>(["detection"])); // no double load
    await flush();
    expect(loads).toEqual({ detection: 1, face: 1 });
    expect(m.status("detection")).toBe("ready");
    expect(m.status("pose")).toBe("off");
  });

  test("a failed load marks only that model offline", async () => {
    const { adapters } = fakeAdapters(["depth"]);
    const m = new ModelManager(adapters);
    const seen: string[] = [];
    m.onStatus((name, s) => seen.push(`${name}:${s}`));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    m.ensure(new Set<ModelName>(["depth", "segmentation"]));
    await flush();
    expect(m.status("depth")).toBe("offline");
    expect(m.status("segmentation")).toBe("ready");
    expect(seen).toContain("depth:loading");
    expect(seen).toContain("depth:offline");
  });

  test("retry reloads", async () => {
    const { adapters, loads } = fakeAdapters(["pose"]);
    const m = new ModelManager(adapters);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    m.ensure(new Set<ModelName>(["pose"]));
    await flush();
    expect(m.status("pose")).toBe("offline");
    m.retry("pose");
    expect(m.status("pose")).toBe("loading");
    await flush();
    expect(m.status("pose")).toBe("ready");
    expect(loads.pose).toBe(2);
  });

  test("get returns undefined until ready", async () => {
    const { adapters } = fakeAdapters();
    const m = new ModelManager(adapters);
    expect(m.get("face")).toBeUndefined();
    m.ensure(new Set<ModelName>(["face"]));
    expect(m.get("face")).toBeUndefined();
    await flush();
    expect(m.get("face")).toBe(adapters.face);
  });
});
