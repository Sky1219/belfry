import { useEffect, useRef, useState } from "react";

export type Run<T> = { state: "working" } | { state: "done"; value: T } | { state: "failed"; message: string };

/**
 * Runs one job off the render path whenever `key` changes. A newer key or
 * unmounting aborts the old run, and its result is dropped.
 */
export function useRun<T>(key: unknown, run: (signal: AbortSignal) => Promise<T>): Run<T> {
  const [result, setResult] = useState<Run<T>>({ state: "working" });
  const latest = useRef(run);
  latest.current = run;
  useEffect(() => {
    const ctl = new AbortController();
    setResult({ state: "working" });
    latest.current(ctl.signal).then(
      (value) => !ctl.signal.aborted && setResult({ state: "done", value }),
      (e: Error) => !ctl.signal.aborted && setResult({ state: "failed", message: e.message }),
    );
    return () => ctl.abort();
  }, [key]);
  return result;
}
