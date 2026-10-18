import { createContext, useContext } from "react";

export interface Settings {
  apiKey: string;
  /** Per-tool settings, keyed by tool id. */
  tools: Record<string, unknown>;
}

const KEY = "belfry.settings.v1";
const DEFAULTS: Settings = { apiKey: "", tools: {} };
let memory: string | null = null; // used when localStorage is unavailable or throws

function read(): string | null {
  try {
    return globalThis.localStorage?.getItem(KEY) ?? memory;
  } catch {
    return memory;
  }
}

function write(v: string) {
  memory = v;
  try {
    globalThis.localStorage?.setItem(KEY, v);
  } catch {
    /* keep the in-memory copy */
  }
}

export function loadSettings(): Settings {
  const raw = read();
  if (!raw) return { ...DEFAULTS, tools: {} };
  try {
    const p = JSON.parse(raw) as Partial<Settings>;
    return {
      apiKey: typeof p.apiKey === "string" ? p.apiKey : "",
      tools: p.tools && typeof p.tools === "object" ? p.tools : {},
    };
  } catch {
    return { ...DEFAULTS, tools: {} };
  }
}

export function saveSettings(s: Settings): void {
  write(JSON.stringify({ ...s, apiKey: s.apiKey.trim() }));
}

export function getToolSettings<T extends object>(s: Settings, toolId: string, defaults: T): T {
  const stored = s.tools[toolId];
  return stored && typeof stored === "object" ? { ...defaults, ...(stored as Partial<T>) } : { ...defaults };
}

export function setToolSettings(s: Settings, toolId: string, value: unknown): Settings {
  return { ...s, tools: { ...s.tools, [toolId]: value } };
}

export const SettingsContext = createContext<{ settings: Settings; update(next: Settings): void } | null>(null);

export function useSettings() {
  const c = useContext(SettingsContext);
  if (!c) throw new Error("useSettings outside SettingsContext");
  return c;
}
