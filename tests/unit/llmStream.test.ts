import { afterEach, describe, expect, test, vi } from "vitest";
import { LlmClient, LlmError, type LlmTool } from "../../src/platform/llm";

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

async function kindOf(p: Promise<unknown>): Promise<string> {
  const e = await p.then(() => null, (err) => err);
  expect(e).toBeInstanceOf(LlmError);
  return (e as LlmError).kind;
}

/** A server-sent-event body, delivered in chunks split mid-event to exercise buffering. */
function sse(events: Array<[string, unknown]>, opts: { chunk?: number; stall?: boolean } = {}): Response {
  const text = events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join("");
  const bytes = new TextEncoder().encode(text);
  const size = opts.chunk ?? 17;
  let at = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(ctrl) {
      if (at >= bytes.length) {
        if (!opts.stall) ctrl.close();
        return opts.stall ? new Promise(() => {}) : undefined;
      }
      ctrl.enqueue(bytes.slice(at, at + size));
      at += size;
    },
  });
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

const textStream = (...pieces: string[]): Array<[string, unknown]> => [
  ["message_start", { type: "message_start", message: { id: "m", content: [] } }],
  ["content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }],
  ["ping", { type: "ping" }],
  ...pieces.map((t): [string, unknown] => ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: t } }]),
  ["content_block_stop", { type: "content_block_stop", index: 0 }],
  ["message_delta", { type: "message_delta", delta: { stop_reason: "end_turn" } }],
  ["message_stop", { type: "message_stop" }],
];

const lookupTool: LlmTool = { name: "lookup", description: "Look up an exhibit", input_schema: { type: "object" } };

afterEach(() => vi.useRealTimers());

describe("LlmClient.message and text", () => {
  test("sends system, tools and messages; returns content, stop reason and text", async () => {
    const fetchImpl = vi.fn(async (..._a: Parameters<typeof fetch>) =>
      ok({
        content: [
          { type: "text", text: "Checking. " },
          { type: "tool_use", id: "t1", name: "lookup", input: { n: 3 } },
        ],
        stop_reason: "tool_use",
      }),
    );
    const llm = new LlmClient(() => "k", fetchImpl);
    const r = await llm.message({ system: "S", messages: [{ role: "user", content: "hi" }], tools: [lookupTool], maxTokens: 50 });
    expect(r.stopReason).toBe("tool_use");
    expect(r.text).toBe("Checking.");
    expect(r.content[1]).toEqual({ type: "tool_use", id: "t1", name: "lookup", input: { n: 3 } });
    const body = JSON.parse(String(fetchImpl.mock.calls[0][1]?.body));
    expect(body).toEqual({
      model: "claude-haiku-5-5",
      max_tokens: 50,
      system: "S",
      tools: [lookupTool],
      messages: [{ role: "user", content: "hi" }],
    });
  });

  test("text() asks one prompt and needs text back", async () => {
    const llm = new LlmClient(() => "k", async () => ok({ content: [{ type: "text", text: " Two bells. " }], stop_reason: "end_turn" }));
    expect(await llm.text({ prompt: "How many?" })).toBe("Two bells.");
    const empty = new LlmClient(() => "k", async () => ok({ content: [], stop_reason: "end_turn" }));
    expect(await kindOf(empty.text({ prompt: "?" }))).toBe("bad-response");
  });

  test("a cancelled call fails as aborted, before or during the request", async () => {
    const pre = new AbortController();
    pre.abort();
    const never = vi.fn(async () => ok({}));
    expect(await kindOf(new LlmClient(() => "k", never).message({ messages: [], signal: pre.signal }))).toBe("aborted");
    expect(never).not.toHaveBeenCalled();

    const mid = new AbortController();
    const hang = (_u: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
    const p = kindOf(new LlmClient(() => "k", hang).message({ messages: [], signal: mid.signal }));
    mid.abort();
    expect(await p).toBe("aborted");
  });
});

describe("LlmClient.stream", () => {
  test("delivers text deltas in order and the whole reply at the end", async () => {
    const fetchImpl = vi.fn(async (..._a: Parameters<typeof fetch>) => sse(textStream("The rope ", "was cut ", "cleanly.")));
    const deltas: string[] = [];
    const r = await new LlmClient(() => "k", fetchImpl).stream({ messages: [{ role: "user", content: "?" }] }, (d) => deltas.push(d));
    expect(deltas).toEqual(["The rope ", "was cut ", "cleanly."]);
    expect(r.text).toBe("The rope was cut cleanly.");
    expect(r.stopReason).toBe("end_turn");
    expect(JSON.parse(String(fetchImpl.mock.calls[0][1]?.body)).stream).toBe(true);
  });

  test("assembles tool input from JSON deltas", async () => {
    const events: Array<[string, unknown]> = [
      ["message_start", { type: "message_start", message: {} }],
      ["content_block_start", { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "t1", name: "lookup", input: {} } }],
      ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '{"exhibit": ' } }],
      ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '7, "why": "rope"}' } }],
      ["content_block_stop", { type: "content_block_stop", index: 0 }],
      ["content_block_start", { type: "content_block_start", index: 1, content_block: { type: "tool_use", id: "t2", name: "lookup", input: {} } }],
      ["content_block_stop", { type: "content_block_stop", index: 1 }],
      ["message_delta", { type: "message_delta", delta: { stop_reason: "tool_use" } }],
      ["message_stop", { type: "message_stop" }],
    ];
    const r = await new LlmClient(() => "k", async () => sse(events, { chunk: 5 })).stream({ messages: [] });
    expect(r.stopReason).toBe("tool_use");
    expect(r.content).toEqual([
      { type: "tool_use", id: "t1", name: "lookup", input: { exhibit: 7, why: "rope" } },
      { type: "tool_use", id: "t2", name: "lookup", input: {} },
    ]);
  });

  test("an error event mid-stream becomes a typed error", async () => {
    const events: Array<[string, unknown]> = [
      ...textStream("Half").slice(0, 3),
      ["error", { type: "error", error: { type: "overloaded_error", message: "Overloaded" } }],
    ];
    expect(await kindOf(new LlmClient(() => "k", async () => sse(events)).stream({ messages: [] }))).toBe("server");
    const limited: Array<[string, unknown]> = [["error", { type: "error", error: { type: "rate_limit_error", message: "slow down" } }]];
    expect(await kindOf(new LlmClient(() => "k", async () => sse(limited)).stream({ messages: [] }))).toBe("rate-limit");
  });

  test("HTTP errors map as for message()", async () => {
    expect(await kindOf(new LlmClient(() => "k", async () => new Response("", { status: 401 })).stream({ messages: [] }))).toBe("auth");
    expect(await kindOf(new LlmClient(() => "k", async () => new Response("", { status: 529 })).stream({ messages: [] }))).toBe("server");
  });

  test("a stream that ends without message_stop, or sends garbage, fails", async () => {
    const cut = textStream("Half").slice(0, 4);
    expect(await kindOf(new LlmClient(() => "k", async () => sse(cut)).stream({ messages: [] }))).toBe("network");
    const garbage = new Response("event: content_block_delta\ndata: {not json\n\n", { status: 200 });
    expect(await kindOf(new LlmClient(() => "k", async () => garbage).stream({ messages: [] }))).toBe("bad-response");
  });

  test("the timeout is idle time: a stalled stream times out", async () => {
    vi.useFakeTimers();
    const llm = new LlmClient(() => "k", async () => sse(textStream("Still ", "going").slice(0, 4), { stall: true }), { timeoutMs: 1000 });
    const deltas: string[] = [];
    const p = kindOf(llm.stream({ messages: [] }, (d) => deltas.push(d)));
    await vi.advanceTimersByTimeAsync(1001);
    expect(await p).toBe("network");
    expect(deltas).toEqual(["Still "]);
  });

  test("cancelling mid-stream fails as aborted", async () => {
    const ctrl = new AbortController();
    const llm = new LlmClient(() => "k", async () => sse(textStream("a").slice(0, 3), { stall: true }));
    const p = kindOf(llm.stream({ messages: [], signal: ctrl.signal }));
    await new Promise((r) => setTimeout(r, 0));
    ctrl.abort();
    expect(await p).toBe("aborted");
  });
});

describe("LlmClient.toolLoop", () => {
  const toolCall = (id: string, name: string, input: unknown) =>
    ok({ content: [{ type: "tool_use", id, name, input }], stop_reason: "tool_use" });

  test("runs handlers, sends results back, and stops at the answer", async () => {
    const replies = [toolCall("t1", "lookup", { n: 7 }), ok({ content: [{ type: "text", text: "Exhibit 7 is the rope." }], stop_reason: "end_turn" })];
    const fetchImpl = vi.fn(async (..._a: Parameters<typeof fetch>) => replies.shift()!);
    const lookup = vi.fn(async (input: unknown) => `exhibit ${(input as { n: number }).n}: bell rope`);
    const r = await new LlmClient(() => "k", fetchImpl).toolLoop(
      { messages: [{ role: "user", content: "What is 7?" }], tools: [lookupTool] },
      { lookup },
    );
    expect(lookup).toHaveBeenCalledWith({ n: 7 });
    expect(r.reply.text).toBe("Exhibit 7 is the rope.");
    expect(r.hitTurnLimit).toBe(false);
    const second = JSON.parse(String(fetchImpl.mock.calls[1][1]?.body));
    expect(second.messages.at(-1)).toEqual({
      role: "user",
      content: [{ type: "tool_result", tool_use_id: "t1", content: "exhibit 7: bell rope" }],
    });
    expect(r.messages).toHaveLength(4);
  });

  test("unknown tools and handler errors go back as errors, never run", async () => {
    const replies = [
      ok({
        content: [
          { type: "tool_use", id: "a", name: "delete_case", input: {} },
          { type: "tool_use", id: "b", name: "lookup", input: {} },
        ],
        stop_reason: "tool_use",
      }),
      ok({ content: [{ type: "text", text: "I can't." }], stop_reason: "end_turn" }),
    ];
    const fetchImpl = vi.fn(async (..._a: Parameters<typeof fetch>) => replies.shift()!);
    await new LlmClient(() => "k", fetchImpl).toolLoop(
      { messages: [{ role: "user", content: "x" }], tools: [lookupTool] },
      {
        lookup: () => {
          throw new Error("No such exhibit.");
        },
      },
    );
    const sent = JSON.parse(String(fetchImpl.mock.calls[1][1]?.body)).messages.at(-1).content;
    expect(sent).toEqual([
      { type: "tool_result", tool_use_id: "a", content: "No tool named “delete_case”.", is_error: true },
      { type: "tool_result", tool_use_id: "b", content: "No such exhibit.", is_error: true },
    ]);
  });

  test("stops at the turn limit instead of looping forever", async () => {
    const fetchImpl = vi.fn(async () => toolCall("t", "lookup", {}));
    const lookup = vi.fn(() => "again");
    const r = await new LlmClient(() => "k", fetchImpl).toolLoop({ messages: [{ role: "user", content: "x" }], tools: [lookupTool] }, { lookup }, { maxTurns: 3 });
    expect(r.hitTurnLimit).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(lookup).toHaveBeenCalledTimes(2);
  });
});
