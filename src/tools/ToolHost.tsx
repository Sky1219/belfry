import { useEffect, useMemo, useRef, useState } from "react";
import type { Route } from "../app/router";
import { useSettings } from "../app/settings";
import { useStore } from "../app/storeContext";
import { LlmClient } from "../platform/llm";
import { HudButton } from "../ui/components";
import { getTool } from "./registry";
import type { ToolComponent, ToolContext, ToolInput } from "./types";

type State =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "ready"; Component: ToolComponent; input: ToolInput };

/** Full-screen layer over the board that lazily loads and runs one tool. */
export function ToolHost(props: { caseId: string; toolId: string; input: string; navigate: (r: Route) => void }) {
  const store = useStore();
  const { settings, update } = useSettings();
  const [state, setState] = useState<State>({ phase: "loading" });
  const tool = getTool(props.toolId);

  // The key is read at call time, so updating it in settings takes effect immediately.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const llm = useMemo(() => new LlmClient(() => settingsRef.current.apiKey), []);

  const close = () => props.navigate({ name: "board", caseId: props.caseId });

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!tool) return setState({ phase: "error", message: `Unknown tool “${props.toolId}”.` });
      let input: ToolInput;
      if (props.input === "live-camera") {
        input = { kind: "live-camera" };
      } else if (props.input.startsWith("ev:")) {
        const ev = await store.getEvidence(props.input.slice(3));
        if (!ev) return alive && setState({ phase: "error", message: "That evidence no longer exists." });
        input = { kind: "evidence", evidence: ev };
      } else {
        return setState({ phase: "error", message: "Unrecognized tool input." });
      }
      try {
        const Component = await tool.load();
        if (alive) setState({ phase: "ready", Component, input });
      } catch (e) {
        if (alive) setState({ phase: "error", message: `The tool failed to load: ${(e as Error).message}` });
      }
    })();
    return () => {
      alive = false;
    };
  }, [tool, props.input, props.toolId, store]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const ctx: ToolContext | null =
    state.phase === "ready"
      ? { caseId: props.caseId, input: state.input, store, llm, settings, updateSettings: update, close }
      : null;

  return (
    <div className="tool-layer" data-testid="tool-layer" data-tool={props.toolId}>
      {state.phase !== "ready" && (
        <div className="tool-status">
          <div className="label">{tool?.name ?? "Tool"}</div>
          <p>{state.phase === "loading" ? "LOADING TOOL" : state.message}</p>
          <HudButton onClick={close}>Back to board</HudButton>
        </div>
      )}
      {state.phase === "ready" && ctx && <state.Component ctx={ctx} />}
    </div>
  );
}
