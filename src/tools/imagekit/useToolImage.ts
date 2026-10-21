import { useEffect, useRef, useState } from "react";
import type { Evidence } from "../../store/schema";
import { readEvidenceBlob } from "../inputs";
import type { ToolContext } from "../types";
import { decodeImage } from "./decode";
import { pinDemoInput, type PinImage } from "./pin";
import type { Pixels } from "./pixels";

export type ToolImage =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "ready"; source: Evidence; bytes: Uint8Array; mime: string; pixels: Pixels };

/**
 * Resolves a tool's input to a decoded photo. The demo is pinned to the board
 * first and the tool reopens on that exhibit, so every result links to
 * evidence the case holds; "loading" lasts through that hop.
 */
export function useToolImage(ctx: ToolContext, makeDemo: () => Promise<PinImage>): ToolImage {
  const [state, setState] = useState<ToolImage>({ phase: "loading" });
  // the latest callbacks, read inside the effect without re-running it each render
  const latest = useRef({ makeDemo, openInput: ctx.openInput });
  latest.current = { makeDemo, openInput: ctx.openInput };

  const { store, caseId, toolId, input } = ctx;
  const evidenceId = input.kind === "evidence" ? input.evidence.id : null;

  useEffect(() => {
    let alive = true;
    setState({ phase: "loading" });
    (async () => {
      try {
        if (input.kind === "live-camera") return alive && setState({ phase: "error", message: "This tool needs a photo." });
        if (input.kind === "demo") {
          const demo = await latest.current.makeDemo();
          if (!alive) return;
          const pinned = await pinDemoInput({ store, caseId, toolId }, demo);
          // replace, not push: Back from the exhibit must not land on ".../demo" and pin another demo
          if (alive) latest.current.openInput(`ev:${pinned.id}`, { replace: true });
          return;
        }
        const blob = await readEvidenceBlob(store, input.evidence);
        const bytes = new Uint8Array(await blob.arrayBuffer());
        const pixels = await decodeImage(blob);
        if (alive) setState({ phase: "ready", source: input.evidence, bytes, mime: blob.type, pixels });
      } catch (e) {
        if (alive) setState({ phase: "error", message: (e as Error).message });
      }
    })();
    return () => {
      alive = false;
    };
    // `input` is keyed by its kind and evidence id, not its identity
  },[store, caseId, toolId, input.kind, evidenceId]);

  return state;
}
