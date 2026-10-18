import { useRef, useState } from "react";
import { useStore, useStoreQuery, downloadBytes } from "../app/storeContext";
import type { Route } from "../app/router";
import { exportCase } from "../store/exportImport";
import type { Case } from "../store/schema";
import { HudButton, Panel } from "../ui/components";
import { useDialogs } from "../ui/dialogs";
import { useImportCase } from "./useImportCase";

const fmtDate = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "case";

export function CaseList(props: { navigate: (r: Route) => void }) {
  const store = useStore();
  const dialogs = useDialogs();
  const cases = useStoreQuery((s) => s.listCases(), "*", [] as Case[]);
  const [title, setTitle] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const importCase = useImportCase();

  const create = async () => {
    const t = title.trim() || `Case ${cases.length + 1}`;
    await store.createCase(t);
    setTitle("");
  };

  const open = cases.filter((c) => c.status === "open");
  const closed = cases.filter((c) => c.status === "closed");

  const row = (c: Case) => (
    <li key={c.id} className="case-row" data-testid="case-row">
      <button className="case-open" data-testid="open-case" onClick={() => props.navigate({ name: "board", caseId: c.id })}>
        <span className="case-title">{c.title}</span>
        <span className="dim">opened {fmtDate(c.createdAt)}</span>
      </button>
      <div className="row" style={{ gap: 6 }}>
        <HudButton small onClick={() => store.updateCase(c.id, { status: c.status === "open" ? "closed" : "open" })}>
          {c.status === "open" ? "Close" : "Reopen"}
        </HudButton>
        <HudButton small data-testid="export-case" onClick={async () => downloadBytes(await exportCase(store, c.id), `${slug(c.title)}.belfry`)}>
          Export
        </HudButton>
        <HudButton
          small
          danger
          data-testid="delete-case"
          onClick={async () => {
            if (await dialogs.confirm("Delete case", `Delete “${c.title}” and all of its evidence?`, { danger: true })) {
              await store.deleteCase(c.id);
            }
          }}
        >
          Delete
        </HudButton>
      </div>
    </li>
  );

  return (
    <div className="case-list">
      <header className="case-list-header">
        <h1 className="wordmark">BELFRY</h1>
        <span className="dim">Case files</span>
      </header>

      <Panel title="Open a new case">
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            create();
          }}
        >
          <input
            className="hud-input"
            placeholder="Case title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            data-testid="new-case-title"
          />
          <button type="submit" className="hud-btn active" data-testid="create-case">
            Create
          </button>
          <HudButton onClick={() => fileRef.current?.click()}>Import</HudButton>
          <input
            ref={fileRef}
            type="file"
            accept=".belfry,application/zip"
            hidden
            data-testid="import-file"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) await importCase(f);
            }}
          />
        </form>
      </Panel>

      <Panel title={`Open cases · ${open.length}`}>
        {open.length === 0 ? <p className="dim">No open cases.</p> : <ul className="case-ul">{open.map(row)}</ul>}
      </Panel>
      {closed.length > 0 && (
        <Panel title={`Closed · ${closed.length}`}>
          <ul className="case-ul">{closed.map(row)}</ul>
        </Panel>
      )}
    </div>
  );
}
