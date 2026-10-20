/// <reference lib="webworker" />
import { handleRequest, ops, transferablesOf } from "./ops";
import type { Request } from "./pool";

/** A compute worker: runs named ops from `ops.ts` for the shared pool. */
self.onmessage = async (e: MessageEvent<Request>) => {
  const reply = await handleRequest(ops, e.data);
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(reply, reply.ok ? transferablesOf(reply.result) : []);
};
