import { makeThumbnail } from "../store/blobs";
import type { Case } from "../store/schema";
import type { EvidenceStore } from "../store/store";

/** localStorage key: the demo case's id once staged, or "skip". */
export const DEMO_KEY = "belfry.demo.v1";

const read = (): string | null => {
  try {
    return localStorage.getItem(DEMO_KEY);
  } catch {
    return null;
  }
};
const write = (v: string) => {
  try {
    localStorage.setItem(DEMO_KEY, v);
  } catch {
    /* private mode: the demo is simply staged again next visit */
  }
};

/** The staged demo case's id, if it was staged in this browser. */
export const demoCaseId = (): string | null => {
  const v = read();
  return v && v !== "skip" ? v : null;
};

let firstVisit: Promise<Case | null> | undefined;

/**
 * First visit (nothing stored, no cases): stage the demo case and return it
 * so the app can open it. Every later visit returns null.
 */
export function stageDemoOnFirstVisit(store: EvidenceStore): Promise<Case | null> {
  // One attempt per page load, however many times the app mounts (React dev mode mounts twice).
  firstVisit ??= (async () => {
    if (read() !== null) return null;
    if ((await store.listCases()).length > 0) {
      write("skip");
      return null;
    }
    return stageDemoCase(store);
  })();
  return firstVisit;
}

/**
 * A small finished-looking case that shows the loop: notes, a photo, a finding
 * derived from a note, labelled links, and a last note that hands the visitor
 * to Detective Vision. Everything is tagged #demo and marked as staged.
 */
export async function stageDemoCase(store: EvidenceStore): Promise<Case> {
  const c = await store.createCase("The Silent Bell");
  write(c.id);
  const t0 = Date.now() - 1000 * 60 * 47;
  const at = (min: number) => ({ createdAt: t0 + min * 60_000 });
  const tags = ["demo"];

  const bell = await store.addEvidence({
    caseId: c.id,
    type: "note",
    title: "Bell missed midnight",
    body: "The tower bell skipped its midnight strike. The caretaker heard the mechanism seize at 11:52, then nothing.",
    tags,
    provenance: at(0),
    position: { x: 0, y: 0 },
  });
  const rope = await store.addEvidence({
    caseId: c.id,
    type: "note",
    title: "Rope worn, not cut",
    body: "Fibres splay outward along four centimetres. Worn through by weeks of friction, not a blade.",
    tags,
    provenance: at(9),
    position: { x: 400, y: 0 },
  });
  const photo = await stagePhoto(store);
  const clockwork = await store.addEvidence({
    caseId: c.id,
    type: "image",
    title: "Clockwork, east face",
    tags,
    blobHash: photo?.blobHash,
    thumbHash: photo?.thumbHash,
    provenance: at(16),
    position: { x: 800, y: 300 },
  });
  const finding = await store.addEvidence({
    caseId: c.id,
    type: "finding",
    title: "Pulley runs off true",
    body: "The wear pattern matches a pulley turning about 3° off its axis. Check the east bracket.",
    tags,
    provenance: { ...at(31), sourceEvidenceId: rope.id },
    position: { x: 0, y: 320 },
  });
  await store.addEvidence({
    caseId: c.id,
    type: "note",
    title: "Your move",
    body: "Open Detective Vision. No camera? Run the demo feed, hold the cup under the reticle for two seconds, and the scan lands here, linked to its crop.",
    tags,
    provenance: at(40),
    position: { x: 800, y: 0 },
  });

  await store.addLink({ caseId: c.id, fromId: bell.id, toId: rope.id, kind: "user", label: "why it stopped?" });
  await store.addLink({ caseId: c.id, fromId: finding.id, toId: rope.id, kind: "derived-from" });
  await store.addLink({ caseId: c.id, fromId: finding.id, toId: clockwork.id, kind: "user", label: "east bracket" });
  return c;
}

/** Draws a dim photo of brass clockwork for the demo case. */
async function stagePhoto(store: EvidenceStore): Promise<{ blobHash: string; thumbHash: string } | null> {
  try {
    const W = 640;
    const H = 420;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const g = canvas.getContext("2d")!;
    const bg = g.createRadialGradient(W * 0.6, H * 0.35, 30, W * 0.5, H * 0.5, W * 0.7);
    bg.addColorStop(0, "#3b3326");
    bg.addColorStop(1, "#0c0b09");
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    gear(g, 250, 220, 120, 22, "#8c6a2f");
    gear(g, 430, 150, 70, 14, "#a07a35");
    gear(g, 470, 300, 50, 11, "#6f5426");
    // the bracket, slightly askew
    g.save();
    g.translate(430, 150);
    g.rotate((3 * Math.PI) / 180);
    g.fillStyle = "#2a2622";
    g.fillRect(-12, -110, 24, 220);
    g.restore();
    const vig = g.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.65);
    vig.addColorStop(0, "rgba(0,0,0,0)");
    vig.addColorStop(1, "rgba(0,0,0,0.7)");
    g.fillStyle = vig;
    g.fillRect(0, 0, W, H);
    const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("no canvas"))), "image/jpeg", 0.85));
    const blobHash = await store.putBlob(new Uint8Array(await blob.arrayBuffer()), "image/jpeg");
    const thumbHash = await store.putBlob(await makeThumbnail(blob), "image/jpeg");
    return { blobHash, thumbHash };
  } catch {
    return null;
  }
}

function gear(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, teeth: number, color: string) {
  g.save();
  g.translate(cx, cy);
  g.fillStyle = color;
  g.beginPath();
  for (let i = 0; i < teeth * 2; i++) {
    const a = (i / (teeth * 2)) * Math.PI * 2;
    const rr = i % 2 ? r : r * 1.12;
    const a2 = ((i + 1) / (teeth * 2)) * Math.PI * 2;
    g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    g.lineTo(Math.cos(a2) * rr, Math.sin(a2) * rr);
  }
  g.closePath();
  g.fill();
  g.globalCompositeOperation = "destination-out";
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 0.4;
    g.beginPath();
    g.arc(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55, r * 0.22, 0, Math.PI * 2);
    g.fill();
  }
  g.globalCompositeOperation = "source-over";
  g.fillStyle = "rgba(255,230,170,0.18)";
  g.beginPath();
  g.arc(-r * 0.2, -r * 0.25, r * 0.5, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#1a1612";
  g.beginPath();
  g.arc(0, 0, r * 0.12, 0, Math.PI * 2);
  g.fill();
  g.restore();
}
