export const LLM_MODEL = "claude-haiku-5-5";
const ENDPOINT = "https://api.anthropic.com/v1/messages";

export type LlmErrorKind = "no-key" | "auth" | "rate-limit" | "network" | "bad-response" | "server" | "aborted";

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

export type ImageMediaType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: ImageMediaType; data: string } }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };

export interface LlmMessageParam {
  role: "user" | "assistant";
  content: string | ContentBlock[];
}

/** A tool the model may call; `input_schema` is a JSON Schema object. */
export interface LlmTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface LlmRequest {
  system?: string;
  messages: LlmMessageParam[];
  maxTokens?: number;
  tools?: LlmTool[];
  model?: string;
  /** Aborting fails the call with an "aborted" LlmError. */
  signal?: AbortSignal;
}

export interface LlmReply {
  content: ContentBlock[];
  /** "end_turn", "max_tokens", "tool_use", … or null when the API didn't say. */
  stopReason: string | null;
  /** Every text block joined and trimmed. */
  text: string;
}

/** Runs one tool call and returns what to tell the model. Throwing reports the error back to the model. */
export type ToolHandler = (input: unknown) => string | Promise<string>;

const textOf = (content: ContentBlock[]) =>
  content
    .filter((b): b is Extract<ContentBlock, { type: "text" }> => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text)
    .join("")
    .trim();

/** An HTTP status → the error a caller can act on. */
function statusError(status: number): LlmError | null {
  if (status === 401 || status === 403) return new LlmError("auth", "The API key was rejected.");
  if (status === 429) return new LlmError("rate-limit", "Rate limited — try again shortly.");
  if (status >= 500) return new LlmError("server", `The API returned ${status}.`);
  if (status < 200 || status >= 300) return new LlmError("bad-response", `The API returned ${status}.`);
  return null;
}

/** An error event inside a stream → the same kinds as HTTP errors. */
function streamError(err: { type?: string; message?: string } | undefined): LlmError {
  const msg = err?.message ? `The API reported an error: ${err.message}` : "The API reported an error.";
  if (err?.type === "rate_limit_error") return new LlmError("rate-limit", "Rate limited — try again shortly.");
  if (err?.type === "authentication_error" || err?.type === "permission_error") return new LlmError("auth", "The API key was rejected.");
  if (err?.type === "invalid_request_error") return new LlmError("bad-response", msg);
  return new LlmError("server", msg);
}

/**
 * The deadline and cancellation for one call. The timeout is an idle timeout:
 * `touch()` restarts it, so a long stream that keeps sending never times out.
 */
class CallGuard {
  readonly ctrl = new AbortController();
  private timer: ReturnType<typeof setTimeout> | undefined;
  timedOut = false;
  cancelled = false;
  private onAbort = () => {
    this.cancelled = true;
    this.ctrl.abort();
  };

  constructor(
    private timeoutMs: number,
    private outer?: AbortSignal,
  ) {
    if (outer?.aborted) this.onAbort();
    outer?.addEventListener("abort", this.onAbort, { once: true });
    this.touch();
  }

  touch() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timedOut = true;
      this.ctrl.abort();
    }, this.timeoutMs);
  }

  /** The error for a failure that may have been our own abort. */
  explain(e: unknown): LlmError {
    if (e instanceof LlmError) return e;
    if (this.cancelled) return new LlmError("aborted", "The request was cancelled.");
    if (this.timedOut) return new LlmError("network", "The request timed out.");
    return new LlmError("network", `Network error: ${(e as Error)?.message ?? String(e)}`);
  }

  done() {
    clearTimeout(this.timer);
    this.outer?.removeEventListener("abort", this.onAbort);
  }
}

/**
 * Claude Messages API client, called directly from the browser with the
 * user's own key. Every failure surfaces as an LlmError so callers can fall
 * back: every LLM feature keeps a non-LLM path (PRODUCT.md).
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

  /** One request, one reply: text, images and tool calls. */
  async message(req: LlmRequest): Promise<LlmReply> {
    const guard = new CallGuard(this.opts.timeoutMs, req.signal);
    try {
      const res = await this.post(req, false, guard);
      let body: { content?: ContentBlock[]; stop_reason?: string | null };
      try {
        body = await res.json();
      } catch (e) {
        if (guard.cancelled || guard.timedOut) throw guard.explain(e);
        throw new LlmError("bad-response", "The API response was not JSON.");
      }
      const content = Array.isArray(body.content) ? body.content : [];
      return { content, stopReason: body.stop_reason ?? null, text: textOf(content) };
    } catch (e) {
      throw guard.explain(e);
    } finally {
      guard.done();
    }
  }

  /** A single prompt answered in text. No text in the reply is an error. */
  async text(args: { system?: string; prompt: string; maxTokens?: number; signal?: AbortSignal }): Promise<string> {
    const reply = await this.message({
      system: args.system,
      maxTokens: args.maxTokens,
      signal: args.signal,
      messages: [{ role: "user", content: args.prompt }],
    });
    if (!reply.text) throw new LlmError("bad-response", "The API returned no text.");
    return reply.text;
  }

  /** A short description of a JPEG (the scan path). */
  async describeImage(args: { jpegBase64: string; system: string; prompt: string; maxTokens?: number }): Promise<string> {
    const reply = await this.message({
      system: args.system,
      maxTokens: args.maxTokens ?? 120,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: args.jpegBase64 } },
            { type: "text", text: args.prompt },
          ],
        },
      ],
    });
    if (!reply.text) throw new LlmError("bad-response", "The API returned no text.");
    return reply.text;
  }

  /**
   * Streams a reply: `onText` gets each piece of text as it arrives, and the
   * promise resolves to the whole reply (tool calls included) at the end.
   */
  async stream(req: LlmRequest, onText?: (delta: string) => void): Promise<LlmReply> {
    const guard = new CallGuard(this.opts.timeoutMs, req.signal);
    try {
      const res = await this.post(req, true, guard);
      if (!res.body) throw new LlmError("bad-response", "The API sent no stream.");
      return await readStream(res.body, guard, onText);
    } catch (e) {
      throw guard.explain(e);
    } finally {
      guard.done();
    }
  }

  /**
   * Lets the model call tools until it answers: each `tool_use` runs its
   * handler and the result goes back as a `tool_result`. A tool with no handler,
   * or a handler that throws, is reported to the model as an error, never run.
   * Handlers own any confirmation: nothing irreversible may happen without the
   * user's say-so (the Butler rule).
   */
  async toolLoop(
    req: LlmRequest & { tools: LlmTool[] },
    handlers: Record<string, ToolHandler>,
    opts: { maxTurns?: number } = {},
  ): Promise<{ reply: LlmReply; messages: LlmMessageParam[]; hitTurnLimit: boolean }> {
    const maxTurns = opts.maxTurns ?? 5;
    const messages = [...req.messages];
    for (let turn = 1; ; turn++) {
      const reply = await this.message({ ...req, messages });
      messages.push({ role: "assistant", content: reply.content });
      const calls = reply.content.filter((b): b is Extract<ContentBlock, { type: "tool_use" }> => b.type === "tool_use");
      if (reply.stopReason !== "tool_use" || !calls.length) return { reply, messages, hitTurnLimit: false };
      if (turn >= maxTurns) return { reply, messages, hitTurnLimit: true };
      const results: ContentBlock[] = [];
      for (const call of calls) {
        const handler = Object.hasOwn(handlers, call.name) ? handlers[call.name] : undefined;
        if (!handler) {
          results.push({ type: "tool_result", tool_use_id: call.id, content: `No tool named “${call.name}”.`, is_error: true });
          continue;
        }
        try {
          results.push({ type: "tool_result", tool_use_id: call.id, content: await handler(call.input) });
        } catch (e) {
          results.push({ type: "tool_result", tool_use_id: call.id, content: (e as Error)?.message ?? String(e), is_error: true });
        }
      }
      messages.push({ role: "user", content: results });
    }
  }

  private async post(req: LlmRequest, stream: boolean, guard: CallGuard): Promise<Response> {
    const key = this.getKey().trim();
    if (!key) throw new LlmError("no-key", "No API key set.");
    if (guard.cancelled) throw new LlmError("aborted", "The request was cancelled.");
    const res = await this.fetchImpl(ENDPOINT, {
      method: "POST",
      signal: guard.ctrl.signal,
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: req.model ?? LLM_MODEL,
        max_tokens: req.maxTokens ?? 1024,
        ...(req.system ? { system: req.system } : {}),
        ...(req.tools?.length ? { tools: req.tools } : {}),
        ...(stream ? { stream: true } : {}),
        messages: req.messages,
      }),
    });
    const err = statusError(res.status);
    if (err) throw err;
    guard.touch();
    return res;
  }
}

/** Reads a Messages API event stream into a reply. */
async function readStream(body: ReadableStream<Uint8Array>, guard: CallGuard, onText?: (delta: string) => void): Promise<LlmReply> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const blocks: ContentBlock[] = [];
  const partialJson = new Map<number, string>();
  let stopReason: string | null = null;
  let buffer = "";
  let finished = false;

  const handle = (event: string, data: string) => {
    let msg: Record<string, any>;
    try {
      msg = JSON.parse(data);
    } catch {
      throw new LlmError("bad-response", "The API stream sent malformed data.");
    }
    const type = (msg.type as string | undefined) ?? event;
    switch (type) {
      case "content_block_start": {
        const b = msg.content_block as ContentBlock;
        blocks[msg.index] = b.type === "tool_use" ? { ...b, input: {} } : b.type === "text" ? { ...b, text: b.text ?? "" } : b;
        break;
      }
      case "content_block_delta": {
        const b = blocks[msg.index];
        if (msg.delta?.type === "text_delta" && b?.type === "text") {
          b.text += msg.delta.text;
          onText?.(msg.delta.text);
        } else if (msg.delta?.type === "input_json_delta") {
          partialJson.set(msg.index, (partialJson.get(msg.index) ?? "") + (msg.delta.partial_json ?? ""));
        }
        break;
      }
      case "content_block_stop": {
        const b = blocks[msg.index];
        if (b?.type === "tool_use") {
          const json = partialJson.get(msg.index) ?? "";
          try {
            b.input = json.trim() ? JSON.parse(json) : {};
          } catch {
            throw new LlmError("bad-response", `The API sent unreadable input for the tool “${b.name}”.`);
          }
        }
        break;
      }
      case "message_delta":
        if (msg.delta && "stop_reason" in msg.delta) stopReason = msg.delta.stop_reason ?? null;
        break;
      case "message_stop":
        finished = true;
        break;
      case "error":
        throw streamError(msg.error);
      // message_start, ping and unknown events carry nothing we need
    }
  };

  const drain = (final: boolean) => {
    const parts = buffer.split(/\r?\n\r?\n/);
    buffer = final ? "" : (parts.pop() ?? "");
    for (const part of parts) {
      let event = "";
      const data: string[] = [];
      for (const line of part.split(/\r?\n/)) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
      }
      if (data.length) handle(event, data.join("\n"));
    }
  };

  // a stream that stalls must still fail on the idle timeout or a cancel, whatever the body does with the signal
  const stopped = new Promise<never>((_, reject) => {
    const sig = guard.ctrl.signal;
    if (sig.aborted) reject(new Error("aborted"));
    sig.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
  });
  stopped.catch(() => {});
  try {
    for (;;) {
      const { value, done } = await Promise.race([reader.read(), stopped]);
      if (done) break;
      guard.touch();
      buffer += decoder.decode(value, { stream: true });
      drain(false);
      if (finished) break;
    }
    buffer += decoder.decode();
    drain(true);
  } finally {
    reader.cancel().catch(() => {});
  }
  if (!finished) throw new LlmError("network", "The stream ended early.");
  const content = blocks.filter(Boolean);
  return { content, stopReason, text: textOf(content) };
}
