import {
  Background,
  BackgroundVariant,
  MarkerType,
  Panel as FlowPanel,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  useReactFlow,
  useViewport,
  type Edge,
  type EdgeChange,
  type NodeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Route } from "../app/router";
import { downloadBytes, useStore, useStoreQuery } from "../app/storeContext";
import { exportCase } from "../store/exportImport";
import type { Case, Evidence, Link, Position } from "../store/schema";
import type { DeleteReceipt } from "../store/store";
import { Bezel, DecoCorners, HudButton, prefersReducedMotion } from "../ui/components";
import { useDialogs } from "../ui/dialogs";
import { Icon, type IconName } from "../ui/icons";
import { modalOpen } from "../ui/Modal";
import { useToast } from "../ui/toasts";
import { addEvidenceFiles, EVIDENCE_FILE_ACCEPT } from "./addFiles";
import { EvidenceCard, exhibitTag, type CardMenuItem, type CardNode } from "./EvidenceCard";
import { mergeNodes } from "./nodes";
import { takeDemoTour, toolEverUsed } from "./demoCase";
import { FeedsScreen, ReadoutsScreen, ToolsScreen } from "./Instruments";
import { nextPosition, wallGeometry } from "./placement";
import { Sidebar } from "./Sidebar";

const nodeTypes = { evidence: EvidenceCard };

/** One undoable change on the board (a delete, an edit, a move). */
interface UndoStep {
  label: string;
  run: () => Promise<unknown>;
}
const UNDO_DEPTH = 25;

/** A tool the board can launch: on the live camera when it takes one, otherwise on its input picker. */
export interface BoardTool {
  id: string;
  name: string;
  blurb?: string;
  open(): void;
}

export interface BoardExtensions {
  /** Extra card-menu items for a piece of evidence (e.g. "Send to → tool"). */
  cardMenu?: (e: Evidence) => CardMenuItem[];
  /** Tools to offer in the toolbar and on the empty board. */
  tools?: BoardTool[];
}

const ARIA_LABELS = {
  "node.a11yDescription.default":
    "Press Enter or Space to select this exhibit, then use the arrow keys to move it. Its actions menu links or removes it.",
  "node.a11yDescription.keyboardDisabled": "Its actions menu links or removes it.",
  "node.a11yDescription.ariaLiveMessage": ({ direction }: { direction: string; x: number; y: number }) => `Moved exhibit ${direction}.`,
  "edge.a11yDescription.default": "Press Enter or Space to select this link, then Delete to remove it.",
  "handle.ariaLabel": "Drag to link to another exhibit",
};

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "case";
const pad = (n: number, w = 2) => String(n).padStart(w, "0");
const fmtDay = (ms: number) => new Date(ms).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }).toUpperCase();
function fmtActivity(ms: number): string {
  const d = new Date(ms);
  const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
  return d.toDateString() === new Date().toDateString() ? `TODAY ${time}` : `${fmtDay(ms).slice(0, 6)} ${time}`;
}

export function Board(props: {
  caseId: string;
  navigate: (r: Route) => void;
  ext?: BoardExtensions;
  onSettings?: () => void;
  /** False while a tool covers the board. */
  active?: boolean;
}) {
  return (
    <ReactFlowProvider>
      <BoardInner {...props} active={props.active ?? true} />
    </ReactFlowProvider>
  );
}

function BoardInner({
  caseId,
  navigate,
  ext,
  onSettings,
  active,
}: {
  caseId: string;
  navigate: (r: Route) => void;
  ext?: BoardExtensions;
  onSettings?: () => void;
  active: boolean;
}) {
  const store = useStore();
  const dialogs = useDialogs();
  const toast = useToast();
  const rf = useReactFlow();
  const theCase = useStoreQuery((s) => s.getCase(caseId), caseId, undefined as Case | undefined);
  const evidence = useStoreQuery((s) => s.listEvidence(caseId), caseId, [] as Evidence[]);
  const links = useStoreQuery((s) => s.listLinks(caseId), caseId, [] as Link[]);
  const exhibits = useStoreQuery((s) => s.exhibitNumbers(caseId), caseId, new Map<string, number>());
  const caseNo = useStoreQuery((s) => s.caseNumber(caseId), caseId, 0);
  const fileRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [instrumentsOpen, setInstrumentsOpen] = useState(false);
  useEffect(() => {
    if (!instrumentsOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !modalOpen() && setInstrumentsOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [instrumentsOpen]);
  const [dropping, setDropping] = useState(false);
  const [matches, setMatches] = useState<Set<string> | null>(null);
  // until a visitor has opened a tool once, its key stays lit: it's the next step
  const [toolUsed] = useState(toolEverUsed);
  const motion = (ms: number) => (prefersReducedMotion() ? 0 : ms);

  const byId = useMemo(() => new Map(evidence.map((e) => [e.id, e])), [evidence]);
  const label = useCallback((id: string) => `${exhibitTag(exhibits.get(id))} ${byId.get(id)?.title ?? ""}`.trim(), [exhibits, byId]);

  // ---------- undo ----------

  // Deletes, edits and moves on this board can be undone newest-first with Ctrl/Cmd+Z while it is open;
  // deletes also offer Undo in their toast.
  const undoStack = useRef<UndoStep[]>([]);
  const pushUndo = useCallback((step: UndoStep) => {
    undoStack.current = [...undoStack.current.slice(-(UNDO_DEPTH - 1)), step];
  }, []);
  const undoLast = useCallback(async () => {
    const step = undoStack.current.pop();
    if (!step) return toast({ message: "Nothing to undo" });
    await step.run();
    toast({ message: `Undid: ${step.label}` });
  }, [toast]);

  const undoable = useCallback(
    (message: string, receipt: DeleteReceipt) => {
      const step: UndoStep = { label: message, run: () => store.restoreEvidence(receipt) };
      pushUndo(step);
      toast({
        message,
        action: {
          label: "Undo",
          run: async () => {
            undoStack.current = undoStack.current.filter((s) => s !== step);
            await step.run();
          },
        },
      });
    },
    [toast, store, pushUndo],
  );

  const removeEvidence = useCallback(
    async (e: Evidence) => {
      const ok = await dialogs.confirm(
        "Remove exhibit",
        `Take “${e.title}” off the board? Its links go with it. You can undo this for a few seconds.`,
        { danger: true, confirmLabel: "Remove exhibit" },
      );
      if (ok) undoable(`Removed ${label(e.id)}`, await store.deleteEvidence(e.id));
    },
    [dialogs, store, undoable, label],
  );

  const removeLink = useCallback(
    async (l: Link) => undoable(`Removed the link ${label(l.fromId)} → ${label(l.toId)}`, await store.deleteLink(l.id)),
    [store, undoable, label],
  );

  // ---------- editing ----------

  const editEvidence = useCallback(
    async (e: Evidence) => {
      const fields = [
        { name: "title", label: "Title", value: e.title, testId: "edit-title" },
        ...(e.type === "note" || e.type === "finding" ? [{ name: "body", label: "Text", value: e.body ?? "", multiline: true }] : []),
        { name: "tags", label: "Tags, comma separated", value: e.tags.join(", ") },
      ];
      const r = await dialogs.form(`Edit ${exhibitTag(exhibits.get(e.id))}`, fields, { submitTestId: "save-edit", submitLabel: "Save exhibit" });
      if (!r) return;
      const before = { title: e.title, body: e.body, tags: e.tags };
      await store.updateEvidence(e.id, {
        title: r.title.trim() || e.title,
        ...(r.body !== undefined ? { body: r.body } : {}),
        tags: r.tags.split(",").map((t) => t.trim().replace(/^#/, "")).filter(Boolean),
      });
      pushUndo({ label: `edit to ${exhibitTag(exhibits.get(e.id))}`, run: () => store.updateEvidence(e.id, before) });
    },
    [dialogs, store, exhibits, pushUndo],
  );

  const linkFrom = useCallback(
    async (e: Evidence) => {
      const others = evidence.filter((x) => x.id !== e.id);
      if (!others.length) {
        await dialogs.alert("Nothing to link", "Pin another exhibit first, then link the two.");
        return;
      }
      const r = await dialogs.form(
        `Link ${exhibitTag(exhibits.get(e.id))} to…`,
        [
          { name: "to", label: "Exhibit", options: others.map((o) => ({ value: o.id, label: label(o.id) })), testId: "link-target" },
          { name: "label", label: "Label (optional)", placeholder: "e.g. same handwriting" },
        ],
        { submitLabel: "Link exhibits", submitTestId: "save-link" },
      );
      if (r?.to) await store.addLink({ caseId, fromId: e.id, toId: r.to, kind: "user", label: r.label.trim() || undefined });
    },
    [evidence, dialogs, exhibits, label, store, caseId],
  );

  const editLink = useCallback(
    async (l: Link) => {
      const r = await dialogs.form(
        "Link",
        [{ name: "label", label: `Label · ${label(l.fromId)} → ${label(l.toId)}`, value: l.label ?? "", testId: "link-label" }],
        { submitLabel: "Save label", extraAction: { id: "remove", label: "Remove link", danger: true, testId: "remove-link" } },
      );
      if (!r) return;
      if (r.__action === "remove") return removeLink(l);
      await store.deleteLink(l.id);
      await store.addLink({ caseId, fromId: l.fromId, toId: l.toId, kind: l.kind, label: r.label.trim() || undefined });
    },
    [dialogs, label, removeLink, store, caseId],
  );

  /** The keyboard path to a link: pick one of this exhibit's links, then label or remove it. */
  const linksOf = useCallback(
    async (e: Evidence) => {
      const mine = links.filter((l) => l.fromId === e.id || l.toId === e.id);
      const id = await dialogs.choose(
        `Links of ${exhibitTag(exhibits.get(e.id))}`,
        "Pick a link to label or remove.",
        mine.map((l) => {
          const other = l.fromId === e.id ? l.toId : l.fromId;
          return { id: l.id, label: `${l.fromId === e.id ? "→" : "←"} ${label(other)}${l.label ? ` (${l.label})` : ""}` };
        }),
      );
      const l = mine.find((x) => x.id === id);
      if (l) await editLink(l);
    },
    [links, dialogs, exhibits, label, editLink],
  );

  const menuFor = useCallback(
    (e: Evidence): CardMenuItem[] => [
      ...(ext?.cardMenu?.(e) ?? []),
      { label: "Link to…", testId: "menu-link", onSelect: () => linkFrom(e) },
      ...(links.some((l) => l.fromId === e.id || l.toId === e.id)
        ? [{ label: "Links…", testId: "menu-links", onSelect: () => linksOf(e) }]
        : []),
      { label: "Edit", testId: "menu-edit", onSelect: () => editEvidence(e) },
      { label: "Remove", danger: true, testId: "menu-delete", onSelect: () => removeEvidence(e) },
    ],
    [ext, links, linkFrom, linksOf, editEvidence, removeEvidence],
  );

  // ---------- nodes ----------

  // Evidence that arrives while the board is in view plays the pin-drop once.
  const [arrivalsSince, setArrivalsSince] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = window.setTimeout(() => setArrivalsSince(Date.now()), 1600);
    return () => clearTimeout(t);
  }, [active, evidence]);

  // Keyboard moves arrive as many small steps; save them once the card settles, as one undoable move.
  const pending = useRef(new Map<string, Position>());
  const flushTimer = useRef(0);
  const byIdRef = useRef(byId);
  byIdRef.current = byId;
  const flush = useCallback(() => {
    clearTimeout(flushTimer.current);
    const moves = [...pending.current];
    pending.current.clear();
    const origins = new Map<string, Position>();
    for (const [id, p] of moves) {
      const from = byIdRef.current.get(id)?.position;
      const to = { x: Math.round(p.x), y: Math.round(p.y) };
      if (from && (from.x !== to.x || from.y !== to.y)) origins.set(id, from);
      store.updateEvidence(id, { position: to }).catch(() => {});
    }
    if (origins.size) {
      pushUndo({
        label: origins.size === 1 ? "move" : `move of ${origins.size} exhibits`,
        run: () => Promise.all([...origins].map(([id, position]) => store.updateEvidence(id, { position }))),
      });
    }
  }, [store, pushUndo]);
  useEffect(() => flush, [flush]);

  const [nodes, setNodes] = useState<CardNode[]>([]);
  useEffect(() => {
    setNodes((prev) =>
      mergeNodes(prev, evidence, menuFor, {
        exhibits,
        links,
        arrivingAfter: active ? arrivalsSince : Infinity,
        pendingPositions: pending.current,
        matches,
      }),
    );
  }, [evidence, menuFor, exhibits, links, active, arrivalsSince, matches]);

  const onNodesChange = useCallback(
    (changes: NodeChange<CardNode>[]) => {
      // Removal goes through the card menu (confirmed, undoable); ignore keyboard node deletes.
      const kept = changes.filter((c) => c.type !== "remove");
      for (const c of kept) {
        if (c.type === "position" && c.position && !c.dragging) pending.current.set(c.id, c.position);
      }
      if (pending.current.size) {
        clearTimeout(flushTimer.current);
        flushTimer.current = window.setTimeout(flush, 300);
      }
      setNodes((ns) => applyNodeChanges(kept, ns));
    },
    [flush],
  );

  // Fit the wall to the evidence once it first loads (it arrives after React Flow mounts).
  const fitted = useRef(false);
  useEffect(() => {
    if (fitted.current || nodes.length === 0) return;
    fitted.current = true;
    requestAnimationFrame(async () => {
      await rf.fitView({ maxZoom: 1, padding: 0.12, duration: motion(0) });
      // A whole-case fit can shrink cards past reading size: hold a legible zoom and open on the case's
      // next step instead (the demo's "Your move", otherwise the newest exhibit).
      const floor = window.matchMedia("(max-width: 720px)").matches ? 0.6 : 0.85;
      const tour = takeDemoTour(caseId);
      const cta = tour ? nodes.find((n) => n.data.evidence.title === "Your move") : undefined;
      if (cta) setNodes((ns) => ns.map((n) => ({ ...n, selected: n.id === cta.id })));
      if (rf.getZoom() < floor || cta) {
        const focus = cta ?? [...nodes].sort((a, b) => b.data.evidence.createdAt - a.data.evidence.createdAt)[0];
        await rf.setCenter(focus.position.x + 110, focus.position.y + 90, { zoom: Math.max(floor, Math.min(1, rf.getZoom())), duration: motion(0) });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes.length, rf]);

  // Evidence that arrives after the board opened (a tool's findings, a note, files) is selected and brought into view.
  const seenUntil = useRef(Date.now());
  useEffect(() => {
    if (!active || !evidence.length) return;
    const newest = evidence.reduce((a, b) => (a.createdAt > b.createdAt ? a : b));
    if (newest.createdAt <= seenUntil.current) return;
    seenUntil.current = newest.createdAt;
    setNodes((ns) => ns.map((n) => ({ ...n, selected: n.id === newest.id })));
    requestAnimationFrame(() => revealIfHidden(newest.position));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, evidence]);

  // ---------- edges ----------

  const [selectedEdges, setSelectedEdges] = useState<Set<string>>(new Set());
  const edges: Edge[] = useMemo(
    () =>
      links.map((l) => {
        const derived = l.kind === "derived-from";
        return {
          id: l.id,
          source: l.fromId,
          target: l.toId,
          type: "straight",
          label: l.label,
          className: `link-${l.kind}`,
          selected: selectedEdges.has(l.id),
          // links are reached from a card's Links… menu, so they don't add Tab stops ahead of the cards
          focusable: false,
          markerEnd: derived ? { type: MarkerType.ArrowClosed, width: 12, height: 12, color: "#ffa733" } : undefined,
          ariaLabel: `${derived ? "Derived from" : "Link"}: ${label(l.fromId)} to ${label(l.toId)}${l.label ? `, “${l.label}”` : ""}`,
          deletable: true,
        };
      }),
    [links, selectedEdges, label],
  );

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setSelectedEdges((prev) => {
      const next = new Set(prev);
      for (const c of changes) {
        if (c.type === "select") c.selected ? next.add(c.id) : next.delete(c.id);
        if (c.type === "remove") next.delete(c.id);
      }
      return next;
    });
  }, []);

  // ---------- adding ----------

  /** Free slot near the middle of the visible wall, read fresh from the store. */
  const freeSlotNearCenter = useCallback(async () => {
    const canvas = document.querySelector(".board-canvas")?.getBoundingClientRect();
    const cx = canvas ? canvas.left + canvas.width / 2 - 110 : window.innerWidth / 2;
    const cy = canvas ? canvas.top + canvas.height / 2 - 70 : window.innerHeight / 2;
    const center = rf.screenToFlowPosition({ x: cx, y: cy });
    const { taken, segments } = await wallGeometry(store, caseId);
    return nextPosition(taken, { x: Math.round(center.x / 20) * 20, y: Math.round(center.y / 20) * 20 }, segments);
  }, [rf, store, caseId]);

  /** Pans so a card at `p` is on screen if it landed outside the visible canvas. */
  const revealIfHidden = useCallback(
    (p: { x: number; y: number }) => {
      const canvas = document.querySelector(".board-canvas")?.getBoundingClientRect();
      if (!canvas) return;
      const tl = rf.flowToScreenPosition(p);
      const br = rf.flowToScreenPosition({ x: p.x + 220, y: p.y + 120 });
      if (tl.x < canvas.left || tl.y < canvas.top || br.x > canvas.right || br.y > canvas.bottom) {
        rf.setCenter(p.x + 110, p.y + 60, { zoom: rf.getZoom(), duration: motion(300) });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rf],
  );

  const addNote = useCallback(async () => {
    const r = await dialogs.form(
      "Pin a note",
      [
        { name: "title", label: "Title", testId: "note-title", placeholder: "What did you find?" },
        { name: "body", label: "Text", multiline: true, testId: "note-body" },
      ],
      { submitLabel: "Pin note", submitTestId: "save-note" },
    );
    if (!r) return;
    const position = await freeSlotNearCenter();
    await store.addEvidence({
      caseId,
      type: "note",
      title: r.title.trim() || "Untitled note",
      body: r.body.trim() || undefined,
      provenance: { createdAt: Date.now() },
      position,
    });
    revealIfHidden(position);
  }, [dialogs, freeSlotNearCenter, store, caseId, revealIfHidden]);

  const addFiles = useCallback(
    async (files: File[], near?: Position) => {
      if (!files.length) return;
      const at = near ?? (await freeSlotNearCenter());
      const { added, skipped } = await addEvidenceFiles(store, caseId, files, at);
      if (added[0]) revealIfHidden(added[0].position);
      if (skipped.length) {
        toast({ tone: "warn", message: `Left out ${skipped.map((s) => `${s.name} (${s.reason})`).join(", ")}` });
      } else if (added.length > 1) {
        toast({ message: `Pinned ${added.length} exhibits` });
      }
    },
    [freeSlotNearCenter, store, caseId, toast, revealIfHidden],
  );

  const exportThis = useCallback(async () => {
    if (!theCase) return;
    downloadBytes(await exportCase(store, caseId), `${slug(theCase.title)}.belfry`);
  }, [store, caseId, theCase]);

  // ---------- shortcuts: N note, E add files, / search ----------

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (modalOpen()) return;
      const typing = !!t?.closest("input, textarea, select, [contenteditable=true]");
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && (e.key === "z" || e.key === "Z") && !typing) {
        e.preventDefault();
        undoLast();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (t && (t.closest("input, textarea, select, [contenteditable=true]") || t.closest("[role=menu]"))) return;
      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        addNote();
      } else if (e.key === "e" || e.key === "E") {
        e.preventDefault();
        fileRef.current?.click();
      } else if (e.key === "/") {
        e.preventDefault();
        setDrawerOpen(true);
        requestAnimationFrame(() => searchRef.current?.focus());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, addNote, undoLast]);

  if (theCase === undefined && evidence.length === 0) {
    return (
      <div className="board-shell">
        <div className="board-toolbar">
          <HudButton data-testid="back-to-cases" onClick={() => navigate({ name: "cases" })}>
            <Icon name="back" size={14} /> Cases
          </HudButton>
        </div>
      </div>
    );
  }

  const lastActivity = Math.max(theCase?.updatedAt ?? 0, ...evidence.map((e) => e.updatedAt), ...links.map((l) => l.createdAt));
  const tools = ext?.tools ?? [];
  const toolButton = (t: BoardTool, extra?: { primary?: boolean; testId?: string }) => (
    <HudButton
      key={t.id}
      className={`with-icon ${extra?.primary ? "primary" : ""} ${!extra?.primary && !toolUsed ? "active" : ""}`}
      data-testid={extra?.testId ?? `open-tool-${t.id}`}
      onClick={t.open}
      aria-description={t.blurb}
    >
      <Icon name="vision" size={14} /> <span className="btn-text">{t.name}</span> <span className="btn-short">{t.name.split(" ").pop()}</span>
    </HudButton>
  );

  const selectedId = nodes.find((n) => n.selected)?.id;
  const selectedIds = nodes.filter((n) => n.selected).map((n) => n.id);
  const clearSelection = () => setNodes((ns) => ns.map((n) => ({ ...n, selected: false })));

  // ---------- bulk actions on a multi-selection (Ctrl/Cmd-click or Shift-drag) ----------

  const removeSelected = async () => {
    const ids = selectedIds;
    const ok = await dialogs.confirm(
      "Remove exhibits",
      `Take ${ids.length} exhibits off the board? Their links go with them. You can undo this.`,
      { danger: true, confirmLabel: `Remove ${ids.length} exhibits` },
    );
    if (!ok) return;
    const receipts: DeleteReceipt[] = [];
    for (const id of ids) receipts.push(await store.deleteEvidence(id));
    undoable(`Removed ${ids.length} exhibits`, {
      evidenceIds: receipts.flatMap((r) => r.evidenceIds),
      linkIds: [...new Set(receipts.flatMap((r) => r.linkIds))],
    });
  };

  const tagSelected = async () => {
    const ids = selectedIds;
    const r = await dialogs.form(`Tag ${ids.length} exhibits`, [{ name: "tag", label: "Tag", placeholder: "e.g. east-tower", testId: "bulk-tag" }], {
      submitLabel: "Add tag",
      submitTestId: "save-bulk-tag",
    });
    const tag = r?.tag.trim().replace(/^#/, "").replace(/\s+/g, "-");
    if (!tag) return;
    const before = ids.map((id) => [id, byId.get(id)?.tags ?? []] as const);
    for (const [id, tags] of before) if (!tags.includes(tag)) await store.updateEvidence(id, { tags: [...tags, tag] });
    pushUndo({ label: `#${tag} on ${ids.length} exhibits`, run: () => Promise.all(before.map(([id, tags]) => store.updateEvidence(id, { tags }))) });
    toast({ message: `Tagged ${ids.length} exhibits #${tag}` });
  };
  const pick = (e: Evidence) => {
    // picking the exhibit that is already selected lets go of it (feeds toggle)
    if (e.id === selectedId) {
      setNodes((ns) => ns.map((n) => ({ ...n, selected: false })));
      return;
    }
    setDrawerOpen(false);
    setInstrumentsOpen(false);
    rf.setCenter(e.position.x + 110, e.position.y + 70, { zoom: 1, duration: motion(400) });
    setNodes((ns) => ns.map((n) => ({ ...n, selected: n.id === e.id })));
  };

  return (
    <div className="board-shell" data-testid="board">
      <header className="board-toolbar rail">
        <HudButton className="with-icon" data-testid="back-to-cases" onClick={() => navigate({ name: "cases" })} title="All cases">
          <Icon name="back" size={14} /> <span className="btn-text">Cases</span>
        </HudButton>
        <div className="case-header">
          <span className="case-no num" aria-label={`Case number ${caseNo}`}>
            Nº {pad(caseNo, 3)}
          </span>
          <h1 className="case-name">{theCase?.title}</h1>
          <p className="case-sub num">
            <span>Opened {theCase ? fmtDay(theCase.createdAt) : "—"}</span>
            <span>Last activity {lastActivity ? fmtActivity(lastActivity) : "—"}</span>
          </p>
        </div>
        <div className="toolbar-actions">
          <div className="tool-group labelled" role="group" aria-label="Add evidence">
            <HudButton className="with-icon" data-testid="add-note" onClick={addNote} aria-keyshortcuts="N" title="Pin a note (N)">
              <Icon name="note" size={14} /> <span className="btn-text">Note</span> <span className="btn-short">Note</span>
            </HudButton>
            <HudButton
              className="with-icon"
              data-testid="add-evidence"
              onClick={() => fileRef.current?.click()}
              aria-keyshortcuts="E"
              title="Add photos, footage or audio (E)"
            >
              <Icon name="upload" size={14} /> <span className="btn-text">Evidence</span> <span className="btn-short">Files</span>
            </HudButton>
          </div>
          {tools.length > 0 && (
            <div className="tool-group labelled" role="group" aria-label="Tools">
              {tools.map((t) => toolButton(t))}
            </div>
          )}
        </div>
          {/* Export and settings also live on the case list, so phones drop them here to keep the rail to two rows. */}
          <div className="tool-group case-tools" role="group" aria-label="Case">
            <HudButton className="with-icon icon-only phone-hide" data-testid="export-board" onClick={exportThis} aria-label="Export case file" title="Export case file">
              <Icon name="export" size={14} />
            </HudButton>
            {onSettings && (
              <HudButton className="with-icon icon-only phone-hide" onClick={onSettings} aria-label="Settings" title="Settings" data-testid="open-settings">
                <Icon name="gear" size={14} />
              </HudButton>
            )}
            <HudButton
              className="with-icon icon-only drawer-toggle"
              aria-label="Evidence index"
              aria-expanded={drawerOpen}
              aria-controls="evidence-index"
              data-testid="toggle-index"
              onClick={() => {
                setInstrumentsOpen(false);
                setDrawerOpen((o) => !o);
              }}
            >
              <Icon name="list" size={14} /> <span className="btn-short">Index</span>
            </HudButton>
            <HudButton
              className="with-icon icon-only instruments-toggle"
              aria-label="Instruments: readouts, feeds and tools"
              aria-expanded={instrumentsOpen}
              aria-controls="instruments"
              data-testid="toggle-instruments"
              onClick={() => {
                setDrawerOpen(false);
                setInstrumentsOpen((o) => !o);
              }}
            >
              <Icon name="gauge" size={14} /> <span className="btn-short">Gauges</span>
            </HudButton>
          </div>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept={EVIDENCE_FILE_ACCEPT}
          hidden
          data-testid="evidence-file"
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = "";
            addFiles(files);
          }}
        />
      </header>
      <div className="board-body monitor-wall">
        <Sidebar
          id="evidence-index"
          evidence={evidence}
          exhibits={exhibits}
          selectedId={selectedId}
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          searchRef={searchRef}
          onFilter={setMatches}
          rowAction={(e) => ext?.cardMenu?.(e)[0]}
          onPick={pick}
        />
        <Bezel
          title="Case board"
          titleId="screen-board"
          lamp="on"
          className="board-bezel"
          screenClassName="board-screen"
          meta={
            <>
              <span>EXH {pad(evidence.length)}</span>
              <span>LNK {pad(links.length)}</span>
            </>
          }
        >
        <div
          className={`board-canvas wall ${dropping ? "dropping" : ""}`}
          onDragOver={(e) => {
            if (![...e.dataTransfer.types].includes("Files")) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
            setDropping(true);
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as HTMLElement | null)) setDropping(false);
          }}
          onDrop={(e) => {
            if (!e.dataTransfer.files.length) return;
            e.preventDefault();
            setDropping(false);
            const p = rf.screenToFlowPosition({ x: e.clientX - 110, y: e.clientY - 40 });
            addFiles([...e.dataTransfer.files], { x: Math.round(p.x / 20) * 20, y: Math.round(p.y / 20) * 20 });
          }}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeDragStop={flush}
            onConnect={(c) => {
              if (c.source && c.target && c.source !== c.target) {
                store.addLink({ caseId, fromId: c.source, toId: c.target, kind: "user" });
              }
            }}
            onEdgesDelete={(es) =>
              es.forEach((edge) => {
                const l = links.find((x) => x.id === edge.id);
                if (l) removeLink(l);
              })
            }
            onEdgeDoubleClick={(_, edge) => {
              const l = links.find((x) => x.id === edge.id);
              if (l) editLink(l);
            }}
            fitView
            fitViewOptions={{ maxZoom: 1, padding: 0.15 }}
            minZoom={0.15}
            maxZoom={2}
            proOptions={{ hideAttribution: true }}
            colorMode="dark"
            ariaLabelConfig={ARIA_LABELS}
            deleteKeyCode={["Backspace", "Delete"]}
          >
            <Background id="wall-fine" variant={BackgroundVariant.Dots} gap={18} size={1} color="rgba(236,230,220,0.2)" />
            <Background id="wall-grid" variant={BackgroundVariant.Lines} gap={180} lineWidth={1} color="rgba(236,230,220,0.04)" />
            <FlowPanel position="bottom-right">
              <ZoomReadout />
            </FlowPanel>
          </ReactFlow>
          <div className="wall-vignette" aria-hidden />
          {dropping && (
            <div className="drop-hint" aria-hidden>
              <DecoCorners />
              <Icon name="upload" size={20} />
              <span>Release to pin as evidence</span>
            </div>
          )}
          {selectedIds.length > 1 && (
            <div className="bulk-bar" role="toolbar" aria-label="Selected exhibits" data-testid="bulk-bar">
              <span className="lamp on" aria-hidden />
              <span className="bulk-count num">{pad(selectedIds.length)} selected</span>
              <HudButton small onClick={tagSelected} data-testid="bulk-tag-open">
                Tag…
              </HudButton>
              <HudButton small danger onClick={removeSelected} data-testid="bulk-remove">
                Remove
              </HudButton>
              <HudButton small onClick={clearSelection}>
                Clear
              </HudButton>
            </div>
          )}
          {evidence.length === 0 && theCase && (
            <EmptyWall
              onNote={addNote}
              onFiles={() => fileRef.current?.click()}
              tool={tools[0]}
              renderTool={(t) => toolButton(t, { primary: true, testId: `empty-open-tool-${t.id}` })}
            />
          )}
        </div>
        </Bezel>
        {instrumentsOpen && <div className="drawer-scrim right" onClick={() => setInstrumentsOpen(false)} aria-hidden />}
        <div className={`instruments ${instrumentsOpen ? "open" : ""}`} id="instruments" role="region" aria-label="Instruments">
          <ReadoutsScreen theCase={theCase} evidence={evidence} links={links} lastActivity={lastActivity} />
          <FeedsScreen evidence={evidence} exhibits={exhibits} selectedId={selectedId} onPick={pick} onAdd={() => fileRef.current?.click()} />
          <ToolsScreen tools={tools} />
        </div>
      </div>
    </div>
  );
}

function EmptyWall(props: { onNote: () => void; onFiles: () => void; tool?: BoardTool; renderTool: (t: BoardTool) => React.ReactNode }) {
  const action = (icon: IconName, text: string, onClick: () => void, testId: string) => (
    <HudButton className="with-icon" onClick={onClick} data-testid={testId}>
      <Icon name={icon} size={14} /> {text}
    </HudButton>
  );
  return (
    <section className="board-empty pane" aria-labelledby="empty-wall-title" data-testid="board-empty">
      <DecoCorners />
      <h2 id="empty-wall-title">The wall is bare.</h2>
      <p>Every case starts with one exhibit. Pin what you already know, bring in photos or footage, or point a tool at the scene.</p>
      <div className="empty-actions">
        {action("note", "Pin a note", props.onNote, "empty-add-note")}
        {action("upload", "Add photos or footage", props.onFiles, "empty-add-evidence")}
        {props.tool && props.renderTool(props.tool)}
      </div>
    </section>
  );
}

/** Bracketed zoom readout in place of React Flow's stock controls. */
function ZoomReadout() {
  const rf = useReactFlow();
  const { zoom } = useViewport();
  const d = prefersReducedMotion() ? 0 : 200;
  return (
    <div className="zoom-readout" role="group" aria-label="Zoom">
      <button type="button" onClick={() => rf.zoomOut({ duration: d })} aria-label="Zoom out">
        <Icon name="zoom-out" size={14} />
      </button>
      <output className="zoom-value" aria-live="off">
        {Math.round(zoom * 100)}%
      </output>
      <button type="button" onClick={() => rf.zoomIn({ duration: d })} aria-label="Zoom in">
        <Icon name="zoom-in" size={14} />
      </button>
      <button type="button" onClick={() => rf.fitView({ maxZoom: 1, padding: 0.15, duration: d })} aria-label="Fit all exhibits">
        <Icon name="fit" size={14} />
      </button>
    </div>
  );
}
