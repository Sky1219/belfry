import { createContext, useContext } from "react";

export interface Settings {
  apiKey: string;
  /**
   * Keep the API key across browser sessions (localStorage). When false it lives
   * only in sessionStorage and is gone when the tab closes — safer on a shared
   * origin such as <user>.github.io, where other project pages can read localStorage.
   */
  rememberKey: boolean;
  /** Per-tool settings, keyed by tool id. */
  tools: Record<string, unknown>;
}

const KEY = "belfry.settings.v1";
const SESSION_KEY = "belfry.apiKey.session";
let memory: string | null = null; // used when localStorage is unavailable or throws
let sessionMemory: string | null = null;

function readSession(): string | null {
  try {
    return globalThis.sessionStorage?.getItem(SESSION_KEY) ?? sessionMemory;
  } catch {
    return sessionMemory;
  }
}

function writeSession(v: string | null) {
  sessionMemory = v;
  try {
    if (v === null) globalThis.sessionStorage?.removeItem(SESSION_KEY);
    else globalThis.sessionStorage?.setItem(SESSION_KEY, v);
  } catch {
    /* keep the in-memory copy */
  }
}

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
  let p: Partial<Settings> = {};
  try {
    if (raw) p = JSON.parse(raw) as Partial<Settings>;
  } catch {
    p = {};
  }
  // Off unless chosen: browser storage is shared by every page on the same origin (e.g. other github.io projects).
  const rememberKey = p.rememberKey === true;
  return {
    apiKey: rememberKey ? (typeof p.apiKey === "string" ? p.apiKey : "") : (readSession() ?? ""),
    rememberKey,
    tools: p.tools && typeof p.tools === "object" ? p.tools : {},
  };
}

export function saveSettings(s: Settings): void {
  const key = s.apiKey.trim();
  if (s.rememberKey) {
    writeSession(null);
    write(JSON.stringify({ ...s, apiKey: key }));
  } else {
    writeSession(key);
    write(JSON.stringify({ ...s, apiKey: "" }));
  }
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
