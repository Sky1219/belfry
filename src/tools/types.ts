import type { ComponentType } from "react";
import type { Settings } from "../app/settings";
import type { LlmClient } from "../platform/llm";
import type { Evidence } from "../store/schema";
import type { EvidenceStore } from "../store/store";

/** What a tool can be pointed at. */
export type EvidenceInput = "live-camera" | "image" | "video" | "audio";

/**
 * "demo" is the tool's own synthetic input (the demo feed, a demo photo) for
 * visitors without the hardware or a file; every tool has one.
 */
export type ToolInput = { kind: "live-camera" } | { kind: "demo" } | { kind: "evidence"; evidence: Evidence };

export interface ToolContext {
  caseId: string;
  input: ToolInput;
  store: EvidenceStore;
  llm: LlmClient;
  settings: Settings;
  updateSettings(next: Settings): void;
  /** Reopens this tool on another input (a route input: "live-camera", "demo", "pick" or "ev:<id>"). */
  openInput(input: string): void;
  close(): void;
}

export type ToolComponent = ComponentType<{ ctx: ToolContext }>;

/**
 * A tool registers a manifest. The board offers the tool for evidence whose
 * type it accepts and opens it full screen; the tool reports results by
 * writing new evidence through `ctx.store`.
 */
export interface ToolManifest {
  id: string;
  name: string;
  /** One-line description shown in menus. */
  blurb?: string;
  accepts: EvidenceInput[];
  /** The tool's synthetic input, run when the input is `{ kind: "demo" }`. Required: every tool works for a visitor with nothing to point it at. */
  demo: { label: string };
  load(): Promise<ToolComponent>;
  loadSettingsSection?(): Promise<ComponentType<{ settings: Settings; updateSettings(next: Settings): void }>>;
}
