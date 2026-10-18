import { useEffect, useState } from "react";
import { Board } from "../board/Board";
import { CaseList } from "../board/CaseList";
import { EvidenceStore } from "../store/store";
import { DialogProvider } from "../ui/dialogs";
import "../ui/app.css";
import { useRoute } from "./router";
import { StoreContext } from "./storeContext";

export function App() {
  const [store, setStore] = useState<EvidenceStore | null>(null);
  const [route, navigate] = useRoute();

  useEffect(() => {
    EvidenceStore.open().then(setStore);
  }, []);

  if (!store) return <div className="boot">BELFRY · INITIALIZING</div>;

  return (
    <StoreContext.Provider value={store}>
      <DialogProvider>
        <div className="app">
          {!store.persistent && <div className="banner">Storage unavailable — cases won't be saved in this browser</div>}
          <main className="app-main">
            {route.name === "cases" && <CaseList navigate={navigate} />}
            {route.name !== "cases" && <Board key={route.caseId} caseId={route.caseId} navigate={navigate} />}
          </main>
        </div>
      </DialogProvider>
    </StoreContext.Provider>
  );
}
