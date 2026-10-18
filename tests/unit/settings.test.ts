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

beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage());
  vi.stubGlobal("sessionStorage", memoryStorage());
});
afterEach(() => vi.unstubAllGlobals());

describe("settings", () => {
  test("settings round-trip", () => {
    expect(loadSettings()).toEqual({ apiKey: "", rememberKey: true, tools: {} });
    saveSettings({ apiKey: "sk-1", rememberKey: true, tools: { x: { a: 1 } } });
    expect(loadSettings()).toEqual({ apiKey: "sk-1", rememberKey: true, tools: { x: { a: 1 } } });
  });

  test("apiKey is trimmed", () => {
    saveSettings({ apiKey: "  sk-2 \n", rememberKey: true, tools: {} });
    expect(loadSettings().apiKey).toBe("sk-2");
  });

  test("settings survive a throwing localStorage", () => {
    const boom = () => {
      throw new Error("SecurityError");
    };
    vi.stubGlobal("localStorage", { getItem: boom, setItem: boom, removeItem: boom });
    expect(() => saveSettings({ apiKey: "sk-3", rememberKey: true, tools: {} })).not.toThrow();
    expect(loadSettings().apiKey).toBe("sk-3"); // served from the in-memory fallback
  });

  test("a key that isn't remembered never touches localStorage", () => {
    saveSettings({ apiKey: "sk-secret", rememberKey: false, tools: {} });
    const local = JSON.stringify(Object.fromEntries([["v", localStorage.getItem("belfry.settings.v1")]]));
    expect(local).not.toContain("sk-secret");
    expect(loadSettings()).toMatchObject({ apiKey: "sk-secret", rememberKey: false });
    // turning remembering back on moves it to localStorage and clears the session copy
    saveSettings({ apiKey: "sk-secret", rememberKey: true, tools: {} });
    expect(sessionStorage.getItem("belfry.apiKey.session")).toBeNull();
    expect(loadSettings().apiKey).toBe("sk-secret");
  });

  test("getToolSettings merges stored values over defaults", () => {
    const s = setToolSettings({ apiKey: "", rememberKey: true, tools: {} }, "dv", { depthEnabled: false });
    expect(getToolSettings(s, "dv", { depthEnabled: true, defaultPresetId: "investigate" })).toEqual({
      depthEnabled: false,
      defaultPresetId: "investigate",
    });
    expect(getToolSettings(s, "other", { a: 1 })).toEqual({ a: 1 });
  });
});
