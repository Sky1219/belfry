import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  useReactFlow,
  type Edge,
  type NodeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Route } from "../app/router";
import { useStore, useStoreQuery } from "../app/storeContext";
import type { Case, Evidence, Link } from "../store/schema";
import { HudButton } from "../ui/components";
import { useDialogs } from "../ui/dialogs";
import { EvidenceCard, type CardMenuItem, type CardNode } from "./EvidenceCard";
import { mergeNodes } from "./nodes";
import { nextPosition } from "./placement";
import { Sidebar } from "./Sidebar";

const nodeTypes = { evidence: EvidenceCard };

export interface BoardExtensions {
  /** Extra card-menu items for a piece of evidence (e.g. "Send to → tool"). */
  cardMenu?: (e: Evidence) => CardMenuItem[];
  /** Extra toolbar content (e.g. "Open tool"). */
  toolbar?: ReactNode;
}

export function Board(props: { caseId: string; navigate: (r: Route) => void; ext?: BoardExtensions }) {
  return (
    <ReactFlowProvider>
      <BoardInner {...props} />
    </ReactFlowProvider>
  );
}

function BoardInner({ caseId, navigate, ext }: { caseId: string; navigate: (r: Route) => void; ext?: BoardExtensions }) {
  const store = useStore();
  const dialogs = useDialogs();
  const rf = useReactFlow();
  const theCase = useStoreQuery((s) => s.getCase(caseId), caseId, undefined as Case | undefined);
  const evidence = useStoreQuery((s) => s.listEvidence(caseId), caseId, [] as Evidence[]);
  const links = useStoreQuery((s) => s.listLinks(caseId), caseId, [] as Link[]);

  const editEvidence = useCallback(
    async (e: Evidence) => {
      const fields = [
        { name: "title", label: "Title", value: e.title, testId: "edit-title" },
        ...(e.type === "note" || e.type === "finding" ? [{ name: "body", label: "Text", value: e.body ?? "", multiline: true }] : []),
        { name: "tags", label: "Tags (comma separated)", value: e.tags.join(", ") },
      ];
      const r = await dialogs.form("Edit evidence", fields, { submitTestId: "save-edit" });
      if (!r) return;
      await store.updateEvidence(e.id, {
        title: r.title.trim() || e.title,
        ...(r.body !== undefined ? { body: r.body } : {}),
        tags: r.tags.split(",").map((t) => t.trim().replace(/^#/, "")).filter(Boolean),
      });
    },
    [dialogs, store],
  );

  const menuFor = useCallback(
    (e: Evidence): CardMenuItem[] => [
      ...(ext?.cardMenu?.(e) ?? []),
      { label: "Edit", testId: "menu-edit", onSelect: () => editEvidence(e) },
      {
        label: "Delete",
        danger: true,
        testId: "menu-delete",
        onSelect: async () => {
          if (await dialogs.confirm("Delete evidence", `Delete “${e.title}”?`, { danger: true })) await store.deleteEvidence(e.id);
        },
      },
    ],
    [ext, editEvidence, dialogs, store],
  );

  // Nodes are derived from the store, but kept in local state so dragging is smooth.
  const [nodes, setNodes] = useState<CardNode[]>([]);
  useEffect(() => {
    setNodes((prev) => mergeNodes(prev, evidence, menuFor));
  }, [evidence, menuFor]);

  const edges: Edge[] = useMemo(
    () =>
      links.map((l) => ({
        id: l.id,
        source: l.fromId,
        target: l.toId,
        label: l.label,
        className: `link-${l.kind}`,
        markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
        deletable: true,
      })),
    [links],
  );

  const onNodesChange = useCallback((changes: NodeChange<CardNode>[]) => {
    // Deletions go through the card menu so they are confirmed; ignore keyboard node deletes.
    setNodes((ns) => applyNodeChanges(changes.filter((c) => c.type !== "remove"), ns));
  }, []);

  const addNote = async () => {
    const r = await dialogs.form(
      "New note",
      [
        { name: "title", label: "Title", testId: "note-title" },
        { name: "body", label: "Text", multiline: true, testId: "note-body" },
      ],
      { submitLabel: "Pin note", submitTestId: "save-note" },
    );
    if (!r) return;
    const center = rf.screenToFlowPosition({ x: window.innerWidth / 2 - 150, y: window.innerHeight / 2 });
    const position = nextPosition(
      evidence.map((e) => e.position),
      { x: Math.round(center.x / 20) * 20, y: Math.round(center.y / 20) * 20 },
    );
    await store.addEvidence({
      caseId,
      type: "note",
      title: r.title.trim() || "Untitled note",
      body: r.body.trim() || undefined,
      provenance: { createdAt: Date.now() },
      position,
    });
    revealIfHidden(position);
  };

  /** Pans so a card at `p` is on screen if it landed outside the visible canvas. */
  const revealIfHidden = (p: { x: number; y: number }) => {
    const canvas = document.querySelector(".board-canvas")?.getBoundingClientRect();
    if (!canvas) return;
    const tl = rf.flowToScreenPosition(p);
    const br = rf.flowToScreenPosition({ x: p.x + 220, y: p.y + 120 });
    if (tl.x < canvas.left || tl.y < canvas.top || br.x > canvas.right || br.y > canvas.bottom) {
      rf.setCenter(p.x + 110, p.y + 60, { zoom: rf.getZoom(), duration: 300 });
    }
  };

  if (theCase === undefined && evidence.length === 0) {
    return (
      <div className="board-shell">
        <div className="board-toolbar">
          <HudButton data-testid="back-to-cases" onClick={() => navigate({ name: "cases" })}>
            ← Cases
          </HudButton>
        </div>
      </div>
    );
  }

  return (
    <div className="board-shell" data-testid="board">
      <div className="board-toolbar">
        <HudButton data-testid="back-to-cases" onClick={() => navigate({ name: "cases" })}>
          ← Cases
        </HudButton>
        <div className="board-title">
          <span className="label">Case</span>
          <span>{theCase?.title}</span>
        </div>
        <div className="row" style={{ marginLeft: "auto", gap: 8 }}>
          {ext?.toolbar}
          <HudButton data-testid="add-note" onClick={addNote}>
            + Note
          </HudButton>
        </div>
      </div>
      <div className="board-body">
        <Sidebar
          evidence={evidence}
          onPick={(e) => {
            rf.setCenter(e.position.x + 110, e.position.y + 70, { zoom: 1, duration: 400 });
            setNodes((ns) => ns.map((n) => ({ ...n, selected: n.id === e.id })));
          }}
        />
        <div className="board-canvas">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onNodeDragStop={(_, node) => store.updateEvidence(node.id, { position: { x: Math.round(node.position.x), y: Math.round(node.position.y) } })}
            onConnect={(c) => {
              if (c.source && c.target && c.source !== c.target) {
                store.addLink({ caseId, fromId: c.source, toId: c.target, kind: "user" });
              }
            }}
            onEdgesDelete={(es) => es.forEach((e) => store.deleteLink(e.id))}
            onEdgeDoubleClick={async (_, edge) => {
              const r = await dialogs.form("Label link", [{ name: "label", label: "Label", value: String(edge.label ?? "") }]);
              if (r) {
                const l = links.find((x) => x.id === edge.id);
                if (l) {
                  await store.deleteLink(l.id);
                  await store.addLink({ caseId, fromId: l.fromId, toId: l.toId, kind: l.kind, label: r.label.trim() || undefined });
                }
              }
            }}
            fitView
            fitViewOptions={{ maxZoom: 1 }}
            minZoom={0.15}
            proOptions={{ hideAttribution: true }}
            colorMode="dark"
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="rgba(89,217,255,0.18)" />
            <Controls showInteractive={false} />
          </ReactFlow>
          {evidence.length === 0 && (
            <div className="board-empty">
              <p>This board is empty.</p>
              <p className="dim">Pin a note, or open a tool to start collecting evidence.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
