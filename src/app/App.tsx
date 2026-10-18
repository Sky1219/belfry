import { useCallback, useEffect, useMemo, useState } from "react";
import { Board, type BoardExtensions } from "../board/Board";
import { CaseList } from "../board/CaseList";
import { EvidenceStore } from "../store/store";
import type { Evidence } from "../store/schema";
import { encodeInput, inputForEvidence, toolsAccepting } from "../tools/registry";
import { ToolHost } from "../tools/ToolHost";
import { HudButton } from "../ui/components";
import { DialogProvider } from "../ui/dialogs";
import "../ui/app.css";
import { useRoute, type Route } from "./router";
import { loadSettings, saveSettings, SettingsContext, type Settings } from "./settings";
import { SettingsPanel } from "./SettingsPanel";
import { StoreContext } from "./storeContext";

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
    EvidenceStore.open().then(setStore);
  }, []);

  const update = useCallback((next: Settings) => {
    saveSettings(next);
    setSettings(loadSettings());
  }, []);
  const settingsValue = useMemo(() => ({ settings, update }), [settings, update]);

  const boardExt = useBoardExtensions(route, navigate, () => setShowSettings(true));

  if (!store) return <div className="boot">BELFRY · INITIALIZING</div>;

  return (
    <StoreContext.Provider value={store}>
      <SettingsContext.Provider value={settingsValue}>
        <DialogProvider>
          <div className="app">
            {!store.persistent && <div className="banner">Cases won't be saved in this browser — storage is blocked</div>}
            {nearlyFull && <div className="banner">Storage almost full — export old cases</div>}
            <main className="app-main">
              {route.name === "cases" && <CaseList navigate={navigate} onSettings={() => setShowSettings(true)} />}
              {route.name !== "cases" && <Board key={route.caseId} caseId={route.caseId} navigate={navigate} ext={boardExt} />}
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
      </SettingsContext.Provider>
    </StoreContext.Provider>
  );
}

/** Wires the tool registry into the board: "Send to →" card items and an "Open tool" toolbar. */
function useBoardExtensions(route: Route, navigate: (r: Route) => void, openSettings: () => void): BoardExtensions | undefined {
  const caseId = route.name === "cases" ? null : route.caseId;
  return useMemo(() => {
    if (!caseId) return undefined;
    const open = (toolId: string, input: string) => navigate({ name: "tool", caseId, toolId, input });
    return {
      cardMenu: (e: Evidence) => {
        const input = inputForEvidence(e.type);
        if (!input) return [];
        return toolsAccepting(input).map((t) => ({
          label: `Send to → ${t.name}`,
          testId: `send-to-${t.id}`,
          onSelect: () => open(t.id, encodeInput({ kind: "evidence", id: e.id })),
        }));
      },
      toolbar: (
        <>
          {toolsAccepting("live-camera").map((t) => (
            <HudButton key={t.id} data-testid={`open-tool-${t.id}`} onClick={() => open(t.id, "live-camera")} title={t.blurb}>
              ◉ {t.name}
            </HudButton>
          ))}
          <HudButton onClick={openSettings} title="Settings" data-testid="open-settings">
            ⚙
          </HudButton>
        </>
      ),
    };
  }, [caseId, navigate, openSettings]);
}
