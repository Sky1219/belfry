import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "./icons";

export interface Toast {
  message: string;
  /** e.g. Undo. Runs once, then the toast closes. */
  action?: { label: string; run: () => void | Promise<void> };
  tone?: "info" | "warn";
}

type Shown = Toast & { id: number };

const Ctx = createContext<((t: Toast) => void) | null>(null);

export function useToast(): (t: Toast) => void {
  const show = useContext(Ctx);
  if (!show) throw new Error("useToast outside ToastProvider");
  return show;
}

const LIFETIME_MS = 7000;

/** One-line status reports at the foot of the screen, read out politely by screen readers. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Shown[]>([]);
  const next = useRef(1);
  const timers = useRef(new Map<number, number>());

  const dismiss = useCallback((id: number) => {
    setItems((xs) => xs.filter((x) => x.id !== id));
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
  }, []);

  const show = useCallback(
    (t: Toast) => {
      const id = next.current++;
      setItems((xs) => [...xs.slice(-2), { ...t, id }]);
      timers.current.set(id, window.setTimeout(() => dismiss(id), LIFETIME_MS));
    },
    [dismiss],
  );

  useEffect(() => {
    const all = timers.current;
    return () => all.forEach((h) => clearTimeout(h));
  }, []);

  return (
    <Ctx.Provider value={show}>
      {children}
      <div className="toast-dock" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.tone === "warn" ? "warn" : ""}`} data-testid="toast">
            <span>{t.message}</span>
            {t.action && (
              <button
                type="button"
                className="toast-action"
                data-testid="toast-action"
                onClick={async () => {
                  dismiss(t.id);
                  await t.action!.run();
                }}
              >
                {t.action.label}
              </button>
            )}
            <button type="button" className="toast-close" aria-label="Dismiss" onClick={() => dismiss(t.id)}>
              <Icon name="close" size={12} />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
