import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { HudButton, Panel } from "./components";

export interface FormField {
  name: string;
  label: string;
  value?: string;
  multiline?: boolean;
  placeholder?: string;
  testId?: string;
}

type Request =
  | { kind: "confirm"; title: string; message: string; danger?: boolean; resolve: (v: boolean) => void }
  | { kind: "choose"; title: string; message: string; options: Array<{ id: string; label: string }>; resolve: (v: string | null) => void }
  | { kind: "form"; title: string; fields: FormField[]; submitLabel: string; submitTestId?: string; resolve: (v: Record<string, string> | null) => void }
  | { kind: "alert"; title: string; message: string; resolve: () => void };

interface Dialogs {
  confirm(title: string, message: string, opts?: { danger?: boolean }): Promise<boolean>;
  choose(title: string, message: string, options: Array<{ id: string; label: string }>): Promise<string | null>;
  form(title: string, fields: FormField[], opts?: { submitLabel?: string; submitTestId?: string }): Promise<Record<string, string> | null>;
  alert(title: string, message: string): Promise<void>;
}

const Ctx = createContext<Dialogs | null>(null);

export function useDialogs(): Dialogs {
  const d = useContext(Ctx);
  if (!d) throw new Error("useDialogs outside DialogProvider");
  return d;
}

/** In-app modal dialogs (confirm / choose / form / alert) styled like the HUD. */
export function DialogProvider({ children }: { children: ReactNode }) {
  const [req, setReq] = useState<Request | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const api: Dialogs = {
    confirm: useCallback(
      (title, message, opts) => new Promise<boolean>((resolve) => setReq({ kind: "confirm", title, message, danger: opts?.danger, resolve })),
      [],
    ),
    choose: useCallback(
      (title, message, options) => new Promise<string | null>((resolve) => setReq({ kind: "choose", title, message, options, resolve })),
      [],
    ),
    form: useCallback(
      (title, fields, opts) =>
        new Promise<Record<string, string> | null>((resolve) =>
          setReq({ kind: "form", title, fields, submitLabel: opts?.submitLabel ?? "Save", submitTestId: opts?.submitTestId, resolve }),
        ),
      [],
    ),
    alert: useCallback((title, message) => new Promise<void>((resolve) => setReq({ kind: "alert", title, message, resolve })), []),
  };

  const close = (finish: () => void) => {
    setReq(null);
    finish();
  };

  const cancel = () => {
    if (!req) return;
    if (req.kind === "confirm") close(() => req.resolve(false));
    else if (req.kind === "alert") close(() => req.resolve());
    else close(() => req.resolve(null));
  };

  return (
    <Ctx.Provider value={api}>
      {children}
      {req && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => e.target === e.currentTarget && cancel()}
          onKeyDown={(e) => e.key === "Escape" && cancel()}
        >
          <Panel title={req.title} className="modal">
            {req.kind === "form" ? (
              <form
                ref={formRef}
                className="col"
                onSubmit={(e) => {
                  e.preventDefault();
                  const data = new FormData(e.currentTarget);
                  const out: Record<string, string> = {};
                  for (const f of req.fields) out[f.name] = String(data.get(f.name) ?? "");
                  close(() => req.resolve(out));
                }}
              >
                {req.fields.map((f, i) => (
                  <label key={f.name} className="col" style={{ gap: 4 }}>
                    <span className="label">{f.label}</span>
                    {f.multiline ? (
                      <textarea
                        className="hud-input"
                        name={f.name}
                        defaultValue={f.value}
                        placeholder={f.placeholder}
                        rows={4}
                        data-testid={f.testId}
                      />
                    ) : (
                      <input
                        className="hud-input"
                        name={f.name}
                        defaultValue={f.value}
                        placeholder={f.placeholder}
                        autoFocus={i === 0}
                        data-testid={f.testId}
                      />
                    )}
                  </label>
                ))}
                <div className="row" style={{ justifyContent: "flex-end" }}>
                  <HudButton onClick={cancel}>Cancel</HudButton>
                  <button type="submit" className="hud-btn active" data-testid={req.submitTestId}>
                    {req.submitLabel}
                  </button>
                </div>
              </form>
            ) : (
              <div className="col">
                <p style={{ margin: 0, lineHeight: 1.5 }}>{req.message}</p>
                <div className="row" style={{ justifyContent: "flex-end", flexWrap: "wrap" }}>
                  {req.kind === "confirm" && (
                    <>
                      <HudButton onClick={cancel} data-testid="confirm-no">
                        Cancel
                      </HudButton>
                      <HudButton
                        danger={req.danger}
                        active={!req.danger}
                        autoFocus
                        data-testid="confirm-yes"
                        onClick={() => close(() => req.resolve(true))}
                      >
                        Confirm
                      </HudButton>
                    </>
                  )}
                  {req.kind === "choose" && (
                    <>
                      <HudButton onClick={cancel}>Cancel</HudButton>
                      {req.options.map((o) => (
                        <HudButton key={o.id} data-testid={`choose-${o.id}`} onClick={() => close(() => req.resolve(o.id))}>
                          {o.label}
                        </HudButton>
                      ))}
                    </>
                  )}
                  {req.kind === "alert" && (
                    <HudButton active autoFocus onClick={() => close(() => req.resolve())}>
                      OK
                    </HudButton>
                  )}
                </div>
              </div>
            )}
          </Panel>
        </div>
      )}
    </Ctx.Provider>
  );
}
