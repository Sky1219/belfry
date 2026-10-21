import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import type { BoardExtensions } from "../board/Board";
import { CaseList } from "../board/CaseList";
import { stageDemoOnFirstVisit } from "../board/demoCase";
import { EvidenceStore } from "../store/store";
import type { Evidence } from "../store/schema";
import { defaultInput } from "../tools/inputs";
import { encodeInput, inputForEvidence, listTools, toolsAccepting } from "../tools/registry";
import { ToolHost } from "../tools/ToolHost";
import { DialogProvider } from "../ui/dialogs";
import { ToastProvider } from "../ui/toasts";
import "../ui/app.css";
import { parseRoute, useRoute, type Route } from "./router";
import { loadSettings, saveSettings, SettingsContext, type Settings } from "./settings";
import { SettingsPanel } from "./SettingsPanel";
import { StoreContext } from "./storeContext";

// The board (and React Flow with it) loads on first use, so the case list doesn't wait for it.
const Board = lazy(() => import("../board/Board").then((m) => ({ default: m.Board })));

function useStorageWarning(store: EvidenceStore | null): boolean {
  const [nearlyFull, setNearlyFull] = useState(false);
  useEffect(() => {
    if (!store) return;
    const check = () =>
      navigator.storage
        ?.estimate?.()
        .then((e) => setNearlyFull(!!e.quota && (e.usage ?? 0) / e.quota > 0.9))
        .catch(() => {});
    check();
    const off = store.subscribe("*", check);
    return off;
  }, [store]);
  return nearlyFull;
}

export function App() {
  const [store, setStore] = useState<EvidenceStore | null>(null);
  const [route, navigate] = useRoute();
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [showSettings, setShowSettings] = useState(false);
  const nearlyFull = useStorageWarning(store);

  useEffect(() => {
    EvidenceStore.open().then(async (s) => {
      // A first-time visitor lands on a staged case that shows the whole loop.
      const demo = await stageDemoOnFirstVisit(s).catch(() => null);
      if (demo && parseRoute(window.location.hash).name === "cases") navigate({ name: "board", caseId: demo.id });
      setStore(s);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = useCallback((next: Settings) => {
    saveSettings(next);
    setSettings(loadSettings());
  }, []);
  const settingsValue = useMemo(() => ({ settings, update }), [settings, update]);

  const openSettings = useCallback(() => setShowSettings(true), []);
  const boardExt = useBoardExtensions(route, navigate);

  if (!store) return <div className="boot">BELFRY · INITIALIZING</div>;

  return (
    <StoreContext.Provider value={store}>
      <SettingsContext.Provider value={settingsValue}>
        <ToastProvider>
        <DialogProvider>
          <div className="app">
            {!store.persistent && <div className="banner">Cases won't be saved in this browser: storage is blocked</div>}
            {nearlyFull && <div className="banner">Storage almost full. Export old cases to make room.</div>}
            <main className="app-main">
              {route.name === "cases" && <CaseList navigate={navigate} onSettings={openSettings} />}
              {route.name !== "cases" && (
                // While a tool covers the board, the board leaves the tab order and the reading order.
                <div className="board-host" inert={route.name === "tool"}>
                  <Suspense fallback={<div className="boot">OPENING CASE</div>}>
                  <Board
                    key={route.caseId}
                    caseId={route.caseId}
                    navigate={navigate}
                    ext={boardExt}
                    onSettings={openSettings}
                    active={route.name === "board"}
                  />
                  </Suspense>
                </div>
              )}
              {route.name === "tool" && (
                <ToolHost
                  key={`${route.toolId}/${route.input}`}
                  caseId={route.caseId}
                  toolId={route.toolId}
                  input={route.input}
                  navigate={navigate}
                />
              )}
            </main>
            {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
          </div>
        </DialogProvider>
        </ToastProvider>
      </SettingsContext.Provider>
    </StoreContext.Provider>
  );
}

/** Wires the tool registry into the board: "Send to →" card items and the tools it can launch. */
function useBoardExtensions(route: Route, navigate: (r: Route) => void): BoardExtensions | undefined {
  const caseId = route.name === "cases" ? null : route.caseId;
  return useMemo(() => {
    if (!caseId) return undefined;
    const open = (toolId: string, input: string) => navigate({ name: "tool", caseId, toolId, input });
    return {
      cardMenu: (e: Evidence) => {
        const input = inputForEvidence(e.type);
        if (!input) return [];
        return toolsAccepting(input).map((t) => ({
          label: `Send to ${t.name}`,
          testId: `send-to-${t.id}`,
          onSelect: () => open(t.id, encodeInput({ kind: "evidence", id: e.id })),
        }));
      },
      // every tool, not only camera ones: a tool that takes no camera opens on its picker
      tools: listTools().map((t) => ({
        id: t.id,
        name: t.name,
        blurb: t.blurb,
        icon: t.icon,
        open: () => open(t.id, defaultInput(t)),
      })),
    };
  }, [caseId, navigate]);
}
