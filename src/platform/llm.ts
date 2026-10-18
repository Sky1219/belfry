export const LLM_MODEL = "claude-haiku-5-5";
const ENDPOINT = "https://api.anthropic.com/v1/messages";

export type LlmErrorKind = "no-key" | "auth" | "rate-limit" | "network" | "bad-response" | "server";

export class LlmError extends Error {
  constructor(
    readonly kind: LlmErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "LlmError";
  }
}

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/**
 * Minimal Claude Messages API client, called directly from the browser with the
 * user's own key. Every failure surfaces as an LlmError so callers can fall back.
 */
export class LlmClient {
  constructor(
    private getKey: () => string,
    private fetchImpl: FetchLike = (i, init) => fetch(i, init),
    private opts: { timeoutMs: number } = { timeoutMs: 15_000 },
  ) {}

  available(): boolean {
    return this.getKey().trim().length > 0;
  }

  async describeImage(args: { jpegBase64: string; system: string; prompt: string; maxTokens?: number }): Promise<string> {
    const key = this.getKey().trim();
    if (!key) throw new LlmError("no-key", "No API key set.");

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.opts.timeoutMs);
    let res: Response;
    try {
      res = await this.fetchImpl(ENDPOINT, {
        method: "POST",
        signal: ctrl.signal,
        headers: {
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: LLM_MODEL,
          max_tokens: args.maxTokens ?? 120,
          system: args.system,
          messages: [
            {
              role: "user",
              content: [
                { type: "image", source: { type: "base64", media_type: "image/jpeg", data: args.jpegBase64 } },
                { type: "text", text: args.prompt },
              ],
            },
          ],
        }),
      });
    } catch (e) {
      const timedOut = ctrl.signal.aborted;
      throw new LlmError("network", timedOut ? "The request timed out." : `Network error: ${(e as Error).message}`);
    } finally {
      clearTimeout(timer);
    }

    if (res.status === 401 || res.status === 403) throw new LlmError("auth", "The API key was rejected.");
    if (res.status === 429) throw new LlmError("rate-limit", "Rate limited — try again shortly.");
    if (res.status >= 500 || res.status === 529) throw new LlmError("server", `The API returned ${res.status}.`);
    if (!res.ok) throw new LlmError("bad-response", `The API returned ${res.status}.`);

    let body: { content?: Array<{ type: string; text?: string }> };
    try {
      body = await res.json();
    } catch {
      throw new LlmError("bad-response", "The API response was not JSON.");
    }
    const text = (body.content ?? [])
      .filter((b) => b.type === "text" && typeof b.text === "string")
      .map((b) => b.text)
      .join("")
      .trim();
    if (!text) throw new LlmError("bad-response", "The API returned no text.");
    return text;
  }
}
