import { afterEach, describe, expect, test, vi } from "vitest";
import { LlmClient, LlmError } from "../../src/platform/llm";

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
const textReply = (text: string) => ok({ content: [{ type: "text", text }] });
const args = { jpegBase64: "AAAA", system: "Be terse.", prompt: "Describe the object." };

async function kindOf(p: Promise<unknown>): Promise<string> {
  const e = await p.then(() => null, (err) => err);
  expect(e).toBeInstanceOf(LlmError);
  return (e as LlmError).kind;
}

afterEach(() => vi.useRealTimers());

describe("LlmClient", () => {
  test("sends the exact headers, model and image block", async () => {
    const fetchImpl = vi.fn(async (..._a: Parameters<typeof fetch>) => textReply("  A white ceramic mug.  "));
    const llm = new LlmClient(() => "sk-test", fetchImpl);
    expect(await llm.describeImage(args)).toBe("A white ceramic mug.");
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(init?.method).toBe("POST");
    const h = init?.headers as Record<string, string>;
    expect(h["x-api-key"]).toBe("sk-test");
    expect(h["anthropic-version"]).toBe("2023-06-01");
    expect(h["anthropic-dangerous-direct-browser-access"]).toBe("true");
    expect(h["content-type"]).toBe("application/json");
    const body = JSON.parse(String(init?.body));
    expect(body.model).toBe("claude-haiku-5-5");
    expect(body.max_tokens).toBe(120);
    expect(body.system).toBe("Be terse.");
    expect(body.messages).toEqual([
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: "AAAA" } },
          { type: "text", text: "Describe the object." },
        ],
      },
    ]);
  });

  test("available() is false for empty or whitespace key", async () => {
    expect(new LlmClient(() => "").available()).toBe(false);
    expect(new LlmClient(() => "   ").available()).toBe(false);
    expect(new LlmClient(() => "sk-x").available()).toBe(true);
    expect(await kindOf(new LlmClient(() => " ").describeImage(args))).toBe("no-key");
  });

  test("trims the key in the header", async () => {
    const fetchImpl = vi.fn(async (..._a: Parameters<typeof fetch>) => textReply("ok"));
    await new LlmClient(() => "  sk-padded \n", fetchImpl).describeImage(args);
    expect((fetchImpl.mock.calls[0][1]?.headers as Record<string, string>)["x-api-key"]).toBe("sk-padded");
  });

  test("401 → auth", async () => {
    const llm = new LlmClient(() => "k", async () => new Response("{}", { status: 401 }));
    expect(await kindOf(llm.describeImage(args))).toBe("auth");
  });

  test("429 → rate-limit", async () => {
    const llm = new LlmClient(() => "k", async () => new Response("{}", { status: 429 }));
    expect(await kindOf(llm.describeImage(args))).toBe("rate-limit");
  });

  test("500 → server", async () => {
    const llm = new LlmClient(() => "k", async () => new Response("{}", { status: 500 }));
    expect(await kindOf(llm.describeImage(args))).toBe("server");
  });

  test("fetch throws → network", async () => {
    const llm = new LlmClient(() => "k", async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(await kindOf(llm.describeImage(args))).toBe("network");
  });

  test("timeout → network", async () => {
    vi.useFakeTimers();
    const hang = (_u: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
    const p = kindOf(new LlmClient(() => "k", hang).describeImage(args));
    await vi.advanceTimersByTimeAsync(15_001);
    expect(await p).toBe("network");
  });

  test("no text blocks or empty text → bad-response", async () => {
    expect(await kindOf(new LlmClient(() => "k", async () => ok({ content: [] })).describeImage(args))).toBe("bad-response");
    expect(await kindOf(new LlmClient(() => "k", async () => textReply("   ")).describeImage(args))).toBe("bad-response");
    expect(await kindOf(new LlmClient(() => "k", async () => new Response("not json", { status: 200 })).describeImage(args))).toBe(
      "bad-response",
    );
  });
});
