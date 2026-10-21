import { useEffect, useMemo, useRef, useState } from "react";
import type { Route } from "../app/router";
import { useSettings } from "../app/settings";
import { useStore } from "../app/storeContext";
import { LlmClient } from "../platform/llm";
import { HudButton } from "../ui/components";
import { markToolUsed } from "../board/demoCase";
import { parseToolInput } from "./inputs";
import { NoSignal } from "./NoSignal";
import { getTool } from "./registry";
import type { ToolComponent, ToolContext, ToolInput } from "./types";

type State =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "pick" }
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
  const openInput = (input: string) => props.navigate({ name: "tool", caseId: props.caseId, toolId: props.toolId, input });
  useEffect(markToolUsed, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!tool) return setState({ phase: "error", message: `Unknown tool “${props.toolId}”.` });
      const resolved = await parseToolInput(store, props.input);
      if (!alive) return;
      if (resolved.kind === "error") return setState({ phase: "error", message: resolved.message });
      if (resolved.kind === "pick") return setState({ phase: "pick" });
      try {
        const Component = await tool.load();
        if (alive) setState({ phase: "ready", Component, input: resolved.input });
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
      ? { caseId: props.caseId, toolId: props.toolId, input: state.input, store, llm, settings, updateSettings: update, openInput, close }
      : null;

  return (
    <div className="tool-layer" data-testid="tool-layer" data-tool={props.toolId}>
      {state.phase === "pick" && tool && (
        <NoSignal tool={tool} caseId={props.caseId} store={store} openInput={openInput} close={close} />
      )}
      {(state.phase === "loading" || state.phase === "error") && (
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
