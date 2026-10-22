import { useCallback, useRef } from "react";

/**
 * Every pin a tool makes waits for the one before, so each is placed clear of it. A job that
 * fails doesn't hold up the next; the caller still sees its own failure.
 */
export function usePinQueue(): <T>(job: () => Promise<T>) => Promise<T> {
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  return useCallback(<T>(job: () => Promise<T>) => {
    const run = queue.current.catch(() => undefined).then(job);
    queue.current = run;
    return run;
  }, []);
}
