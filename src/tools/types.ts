import type { ComponentType } from "react";
import type { Settings } from "../app/settings";
import type { LlmClient } from "../platform/llm";
import type { Evidence } from "../store/schema";
import type { EvidenceStore } from "../store/store";

/** What a tool can be pointed at. */
export type EvidenceInput = "live-camera" | "image" | "video" | "audio";

/** "demo-feed" is a synthetic camera for visitors without one; tools that accept "live-camera" accept it too. */
export type ToolInput = { kind: "live-camera" } | { kind: "demo-feed" } | { kind: "evidence"; evidence: Evidence };

export interface ToolContext {
  caseId: string;
  input: ToolInput;
  store: EvidenceStore;
  llm: LlmClient;
  settings: Settings;
  updateSettings(next: Settings): void;
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
  load(): Promise<ToolComponent>;
  loadSettingsSection?(): Promise<ComponentType<{ settings: Settings; updateSettings(next: Settings): void }>>;
}
