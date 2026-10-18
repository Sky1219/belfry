import { useRef, useState } from "react";
import { downloadBytes, useStore, useStoreQuery } from "../app/storeContext";
import type { Route } from "../app/router";
import { exportCase } from "../store/exportImport";
import type { Case } from "../store/schema";
import type { CaseSummary } from "../store/store";
import { HudButton, Panel } from "../ui/components";
import { useDialogs } from "../ui/dialogs";
import { Icon } from "../ui/icons";
import { useToast } from "../ui/toasts";
import { demoCaseId, stageDemoCase } from "./demoCase";
import { useImportCase } from "./useImportCase";

const fmtDate = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
const fmtWhen = (ms: number) => {
  const d = new Date(ms);
  return d.toDateString() === new Date().toDateString()
    ? `today ${d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false })}`
    : fmtDate(ms);
};
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "case";
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function CaseList(props: { navigate: (r: Route) => void; onSettings?: () => void }) {
  const store = useStore();
  const dialogs = useDialogs();
  const toast = useToast();
  // newest case first
  const cases = useStoreQuery((s) => s.listCases().then((cs) => cs.reverse()), "*", [] as Case[]);
  const stats = useStoreQuery((s) => s.caseSummaries(), "*", new Map<string, CaseSummary>());
  const [title, setTitle] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const importCase = useImportCase();
  const demoId = demoCaseId();
  const demo = cases.find((c) => c.id === demoId);

  const create = async () => {
    const t = title.trim() || `Case ${cases.length + 1}`;
    const c = await store.createCase(t);
    setTitle("");
    props.navigate({ name: "board", caseId: c.id });
  };

  const openDemo = async () => {
    const c = demo ?? (await stageDemoCase(store));
    props.navigate({ name: "board", caseId: c.id });
  };

  const open = cases.filter((c) => c.status === "open");
  const closed = cases.filter((c) => c.status === "closed");

  const row = (c: Case) => {
    const s = stats.get(c.id);
    return (
      <li key={c.id} className="case-row" data-testid="case-row">
        <button className="case-open" data-testid="open-case" onClick={() => props.navigate({ name: "board", caseId: c.id })}>
          <span className="case-row-no">Nº {String(s?.number ?? 0).padStart(3, "0")}</span>
          <span className="case-title">{c.title}</span>
          <span className="case-meta">
            {s ? `${plural(s.evidence, "exhibit")} · ${plural(s.links, "link")} · last activity ${fmtWhen(s.lastActivity)}` : ""}
            <span className="case-opened"> · opened {fmtDate(c.createdAt)}</span>
          </span>
        </button>
        <div className="case-actions">
          <HudButton small onClick={() => store.updateCase(c.id, { status: c.status === "open" ? "closed" : "open" })}>
            {c.status === "open" ? "Close" : "Reopen"}
          </HudButton>
          <HudButton
            small
            className="with-icon"
            data-testid="export-case"
            onClick={async () => downloadBytes(await exportCase(store, c.id), `${slug(c.title)}.belfry`)}
          >
            <Icon name="export" size={12} /> Export
          </HudButton>
          <HudButton
            small
            danger
            data-testid="delete-case"
            onClick={async () => {
              const n = s?.evidence ?? 0;
              const ok = await dialogs.confirm(
                "Delete case",
                `Delete “${c.title}” and its ${plural(n, "exhibit")}? You can undo this for a few seconds; after that, only an exported file brings it back.`,
                { danger: true, confirmLabel: "Delete case" },
              );
              if (!ok) return;
              const receipt = await store.deleteCase(c.id);
              toast({ message: `Deleted “${c.title}”`, action: { label: "Undo", run: () => store.restoreCase(c.id, receipt) } });
            }}
          >
            Delete
          </HudButton>
        </div>
      </li>
    );
  };

  return (
    <div className="case-list">
      <header className="case-list-header">
        <div className="case-list-brand">
          <h1 className="wordmark">BELFRY</h1>
          <p className="case-list-pitch">
            A detective&rsquo;s console that runs in your browser. Pin evidence to a case, send it to a tool, and the findings come back
            linked to what they came from.
          </p>
        </div>
        <div className="case-list-tools">
          <HudButton small className="with-icon" onClick={openDemo} data-testid="open-demo">
            <Icon name="demo" size={12} /> {demo ? "Open the demo case" : "Stage the demo case"}
          </HudButton>
          {props.onSettings && (
            <HudButton small className="with-icon" onClick={props.onSettings} data-testid="open-settings">
              <Icon name="gear" size={12} /> Settings
            </HudButton>
          )}
        </div>
      </header>

      <Panel title="Open a new case">
        <form
          className="new-case"
          onSubmit={(e) => {
            e.preventDefault();
            create();
          }}
        >
          <input
            className="hud-input"
            placeholder="Name the case, e.g. The Clocktower Job"
            aria-label="Case name"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            data-testid="new-case-title"
          />
          <button type="submit" className="hud-btn active" data-testid="create-case">
            Open case
          </button>
          <HudButton className="with-icon" onClick={() => fileRef.current?.click()} title="Import a .belfry case file">
            <Icon name="upload" size={14} /> Import
          </HudButton>
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
        {open.length === 0 ? (
          <p className="dim">No open cases. Name one above, or stage the demo case to see how a finished one looks.</p>
        ) : (
          <ul className="case-ul">{open.map(row)}</ul>
        )}
      </Panel>
      {closed.length > 0 && (
        <Panel title={`Closed · ${closed.length}`}>
          <ul className="case-ul">{closed.map(row)}</ul>
        </Panel>
      )}
    </div>
  );
}
