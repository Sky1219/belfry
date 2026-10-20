import { createContext, useContext, useEffect, useState } from "react";
import type { EvidenceStore } from "../store/store";

export const StoreContext = createContext<EvidenceStore | null>(null);

export function useStore(): EvidenceStore {
  const s = useContext(StoreContext);
  if (!s) throw new Error("useStore outside StoreContext");
  return s;
}

/** Re-runs `load` whenever the given case (or "*" for all) changes. */
export function useStoreQuery<T>(load: (s: EvidenceStore) => Promise<T>, caseId: string, initial: T): T {
  const store = useStore();
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    let alive = true;
    const run = () => load(store).then((v) => alive && setValue(v));
    run();
    const off = store.subscribe(caseId, run);
    return () => {
      alive = false;
      off();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, caseId]);
  return value;
}

/** Object URL for a stored blob (revoked on change/unmount). */
export function useBlobUrl(hash: string | undefined): string | undefined {
  const store = useStore();
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!hash) return setUrl(undefined);
    let u: string | undefined;
    let alive = true;
    store.getBlob(hash).then((b) => {
      if (!alive || !b) return;
      u = URL.createObjectURL(new Blob([b.bytes as BlobPart], { type: b.mime }));
      setUrl(u);
    });
    return () => {
      alive = false;
      if (u) URL.revokeObjectURL(u);
    };
  }, [store, hash]);
  return url;
}

/** Triggers a browser download of bytes. */
export function downloadBytes(bytes: Uint8Array, filename: string, mime = "application/octet-stream") {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
