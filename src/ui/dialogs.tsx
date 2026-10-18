import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { HudButton } from "./components";
import { Modal } from "./Modal";

export interface FormField {
  name: string;
  label: string;
  value?: string;
  multiline?: boolean;
  placeholder?: string;
  testId?: string;
  /** Renders a select instead of a text field. */
  options?: Array<{ value: string; label: string }>;
}

export interface ChoiceOption {
  id: string;
  label: string;
  danger?: boolean;
}

/** A second way out of a form, e.g. "Remove link". The result carries `__action: id`. */
export interface FormAction {
  id: string;
  label: string;
  danger?: boolean;
  testId?: string;
}

type Request =
  | { kind: "confirm"; title: string; message: string; danger?: boolean; confirmLabel: string; resolve: (v: boolean) => void }
  | { kind: "choose"; title: string; message: string; options: ChoiceOption[]; resolve: (v: string | null) => void }
  | {
      kind: "form";
      title: string;
      fields: FormField[];
      submitLabel: string;
      submitTestId?: string;
      extraAction?: FormAction;
      resolve: (v: Record<string, string> | null) => void;
    }
  | { kind: "alert"; title: string; message: string; resolve: () => void };

interface Dialogs {
  confirm(title: string, message: string, opts?: { danger?: boolean; confirmLabel?: string }): Promise<boolean>;
  choose(title: string, message: string, options: ChoiceOption[]): Promise<string | null>;
  form(
    title: string,
    fields: FormField[],
    opts?: { submitLabel?: string; submitTestId?: string; extraAction?: FormAction },
  ): Promise<Record<string, string> | null>;
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
  // Each request gets a fresh Modal, so focus and the trap reset even when one dialog follows another.
  const seq = useRef(0);
  const open = useCallback((r: Request) => {
    seq.current++;
    setReq(r);
  }, []);

  const api: Dialogs = {
    confirm: useCallback(
      (title, message, opts) =>
        new Promise<boolean>((resolve) =>
          open({ kind: "confirm", title, message, danger: opts?.danger, confirmLabel: opts?.confirmLabel ?? "Confirm", resolve }),
        ),
      [],
    ),
    choose: useCallback(
      (title, message, options) => new Promise<string | null>((resolve) => open({ kind: "choose", title, message, options, resolve })),
      [],
    ),
    form: useCallback(
      (title, fields, opts) =>
        new Promise<Record<string, string> | null>((resolve) =>
          open({
            kind: "form",
            title,
            fields,
            submitLabel: opts?.submitLabel ?? "Save",
            submitTestId: opts?.submitTestId,
            extraAction: opts?.extraAction,
            resolve,
          }),
        ),
      [],
    ),
    alert: useCallback((title, message) => new Promise<void>((resolve) => open({ kind: "alert", title, message, resolve })), []),
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
        <Modal key={seq.current} title={req.title} onClose={cancel} testId="dialog">
          {req.kind === "form" ? (
            <form
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
                <label key={f.name} className="col field">
                  <span className="label">{f.label}</span>
                  {f.options ? (
                    <select className="hud-input" name={f.name} defaultValue={f.value} autoFocus={i === 0} data-testid={f.testId}>
                      {f.options.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : f.multiline ? (
                    <textarea
                      className="hud-input"
                      name={f.name}
                      defaultValue={f.value}
                      placeholder={f.placeholder}
                      rows={4}
                      autoFocus={i === 0}
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
              <div className="row dialog-actions">
                {req.extraAction && (
                  <HudButton
                    danger={req.extraAction.danger}
                    data-testid={req.extraAction.testId}
                    className="dialog-extra"
                    onClick={() => close(() => req.resolve({ __action: req.extraAction!.id }))}
                  >
                    {req.extraAction.label}
                  </HudButton>
                )}
                <HudButton onClick={cancel}>Cancel</HudButton>
                <button type="submit" className="hud-btn active" data-testid={req.submitTestId}>
                  {req.submitLabel}
                </button>
              </div>
            </form>
          ) : (
            <div className="col">
              <p className="dialog-message">{req.message}</p>
              <div className="row dialog-actions">
                {req.kind === "confirm" && (
                  <>
                    {/* A destructive prompt lands on Cancel, so a stray Enter never destroys anything. */}
                    <HudButton onClick={cancel} autoFocus={req.danger} data-testid="confirm-no">
                      Cancel
                    </HudButton>
                    <HudButton
                      danger={req.danger}
                      active={!req.danger}
                      autoFocus={!req.danger}
                      data-testid="confirm-yes"
                      onClick={() => close(() => req.resolve(true))}
                    >
                      {req.confirmLabel}
                    </HudButton>
                  </>
                )}
                {req.kind === "choose" && (
                  <>
                    <HudButton onClick={cancel} autoFocus>
                      Cancel
                    </HudButton>
                    {req.options.map((o) => (
                      <HudButton key={o.id} danger={o.danger} data-testid={`choose-${o.id}`} onClick={() => close(() => req.resolve(o.id))}>
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
        </Modal>
      )}
    </Ctx.Provider>
  );
}
