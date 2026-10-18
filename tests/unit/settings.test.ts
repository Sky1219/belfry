import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { getToolSettings, loadSettings, saveSettings, setToolSettings } from "../../src/app/settings";

function memoryStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: () => null,
    length: 0,
  };
}

beforeEach(() => vi.stubGlobal("localStorage", memoryStorage()));
afterEach(() => vi.unstubAllGlobals());

describe("settings", () => {
  test("settings round-trip", () => {
    expect(loadSettings()).toEqual({ apiKey: "", tools: {} });
    saveSettings({ apiKey: "sk-1", tools: { x: { a: 1 } } });
    expect(loadSettings()).toEqual({ apiKey: "sk-1", tools: { x: { a: 1 } } });
  });

  test("apiKey is trimmed", () => {
    saveSettings({ apiKey: "  sk-2 \n", tools: {} });
    expect(loadSettings().apiKey).toBe("sk-2");
  });

  test("settings survive a throwing localStorage", () => {
    const boom = () => {
      throw new Error("SecurityError");
    };
    vi.stubGlobal("localStorage", { getItem: boom, setItem: boom, removeItem: boom });
    expect(() => saveSettings({ apiKey: "sk-3", tools: {} })).not.toThrow();
    expect(loadSettings().apiKey).toBe("sk-3"); // served from the in-memory fallback
  });

  test("getToolSettings merges stored values over defaults", () => {
    const s = setToolSettings({ apiKey: "", tools: {} }, "dv", { depthEnabled: false });
    expect(getToolSettings(s, "dv", { depthEnabled: true, defaultPresetId: "investigate" })).toEqual({
      depthEnabled: false,
      defaultPresetId: "investigate",
    });
    expect(getToolSettings(s, "other", { a: 1 })).toEqual({ a: 1 });
  });
});
