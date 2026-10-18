import "fake-indexeddb/auto";
import { describe, expect, test } from "vitest";
import { LlmClient } from "../../src/platform/llm";
import type { Track } from "../../src/tools/detective/features/tracker";
import { recordScan } from "../../src/tools/detective/features/forensics";
import { EvidenceStore } from "../../src/store/store";

let n = 0;
async function setup(fetchImpl: (u: RequestInfo | URL, i?: RequestInit) => Promise<Response>, key = "sk-test") {
  const store = await EvidenceStore.open(`test-forensics-${++n}-${Date.now()}`);
  const c = await store.createCase("Scan case");
  const llm = new LlmClient(() => key, fetchImpl);
  return { store, caseId: c.id, llm };
}

const reply = (text: string) => async () =>
  new Response(JSON.stringify({ content: [{ type: "text", text }] }), { status: 200 });
const status = (code: number) => async () => new Response("{}", { status: code });
const track: Track = { id: 3, tag: "EV-03", label: "cup", score: 0.82, box: [0.4, 0.4, 0.6, 0.6], firstSeenMs: 0, lastSeenMs: 0 };
const scan = { jpeg: new Uint8Array([255, 216, 255, 1, 2, 3]), track, color: "red", tVisibleS: 14 };

describe("recordScan", () => {
  test("with a working LLM the finding body is the model text and source is llm", async () => {
    const d = await setup(reply("White ceramic mug, chipped rim, coffee residue."));
    const r = await recordScan({ ...d, nowMs: 1 }, scan);
    expect(r.source).toBe("llm");
    expect(r.finding.body).toBe("White ceramic mug, chipped rim, coffee residue.");
    expect(r.finding.title).toBe("EV-03 · cup — note");
    expect(r.image.title).toBe("EV-03 · cup");
    expect(r.image.blobHash).toMatch(/^[0-9a-f]{64}$/);
    expect(r.finding.meta.source).toBe("llm");
  });

  test("with no key the finding is local and not prefixed", async () => {
    const d = await setup(reply("unused"), "");
    const r = await recordScan({ ...d, nowMs: 1 }, scan);
    expect(r.source).toBe("local");
    expect(r.reason).toBeUndefined();
    expect(r.finding.title.startsWith("LOCAL ANALYSIS")).toBe(false);
    expect(r.finding.body).toContain("CUP — red");
  });

  test("auth error → local note prefixed LOCAL ANALYSIS with reason auth", async () => {
    const d = await setup(status(401));
    const r = await recordScan({ ...d, nowMs: 1 }, scan);
    expect(r.source).toBe("local");
    expect(r.reason).toBe("auth");
    expect(r.finding.title.startsWith("LOCAL ANALYSIS — ")).toBe(true);
    expect(r.finding.meta.reason).toBe("auth");
  });

  test("bad-response → local note", async () => {
    const d = await setup(reply("   "));
    const r = await recordScan({ ...d, nowMs: 1 }, scan);
    expect(r.source).toBe("local");
    expect(r.reason).toBe("bad-response");
  });

  test("finding is linked derived-from the image", async () => {
    const d = await setup(reply("A mug."));
    const r = await recordScan({ ...d, nowMs: 1 }, scan);
    const links = await d.store.listLinks(d.caseId);
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ fromId: r.finding.id, toId: r.image.id, kind: "derived-from" });
    expect(r.finding.provenance.sourceEvidenceId).toBe(r.image.id);
    expect(r.image.position).not.toEqual(r.finding.position);
  });

  test("long model output is truncated to 30 words", async () => {
    const long = Array.from({ length: 50 }, (_, i) => `word${i}`).join(" ");
    const d = await setup(reply(long));
    const r = await recordScan({ ...d, nowMs: 1 }, scan);
    expect(r.finding.body!.replace(/…$/, "").split(/\s+/)).toHaveLength(30);
  });
});
