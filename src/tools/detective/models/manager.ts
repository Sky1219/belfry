import type { ModelName } from "../presets";
import type { ModelAdapter } from "./types";

export type { ModelAdapter } from "./types";
export type ModelStatus = "off" | "loading" | "ready" | "offline";

/**
 * Loads models lazily — only when a feature that needs them is switched on —
 * and tracks each one's status independently, so one failed download disables
 * only the features that depend on it.
 */
export class ModelManager {
  private state = new Map<ModelName, ModelStatus>();
  private listeners = new Set<(name: ModelName, s: ModelStatus) => void>();

  constructor(private adapters: Record<ModelName, ModelAdapter<unknown>>) {}

  ensure(names: Set<ModelName>): void {
    for (const n of names) {
      const s = this.status(n);
      if (s === "off") this.load(n);
    }
  }

  status(name: ModelName): ModelStatus {
    return this.state.get(name) ?? "off";
  }

  statuses(): Record<ModelName, ModelStatus> {
    const names = Object.keys(this.adapters) as ModelName[];
    return Object.fromEntries(names.map((n) => [n, this.status(n)])) as Record<ModelName, ModelStatus>;
  }

  onStatus(fn: (name: ModelName, s: ModelStatus) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  retry(name: ModelName): void {
    if (this.status(name) === "offline") this.load(name);
  }

  get<T>(name: ModelName): ModelAdapter<T> | undefined {
    return this.status(name) === "ready" ? (this.adapters[name] as ModelAdapter<T>) : undefined;
  }

  dispose(): void {
    for (const a of Object.values(this.adapters)) {
      try {
        a.dispose();
      } catch {
        /* ignore */
      }
    }
    this.listeners.clear();
  }

  private load(name: ModelName) {
    this.set(name, "loading");
    this.adapters[name].load().then(
      () => this.set(name, "ready"),
      (e) => {
        console.warn(`[models] ${name} failed to load:`, e);
        this.set(name, "offline");
      },
    );
  }

  private set(name: ModelName, s: ModelStatus) {
    this.state.set(name, s);
    for (const fn of this.listeners) fn(name, s);
  }
}
