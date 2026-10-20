import { useEffect, useRef, useState, type ComponentType } from "react";
import { useImportCase } from "../board/useImportCase";
import { listTools } from "../tools/registry";
import { HudButton, Toggle } from "../ui/components";
import { Modal } from "../ui/Modal";
import { useSettings, type Settings } from "./settings";
import { useStore } from "./storeContext";

type Section = { id: string; name: string; C: ComponentType<{ settings: Settings; updateSettings(next: Settings): void }> };

const fmtBytes = (n: number) =>
  n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${(n / 1024).toFixed(1)} KB` : n < 1024 ** 3 ? `${(n / 1024 ** 2).toFixed(1)} MB` : `${(n / 1024 ** 3).toFixed(2)} GB`;

export function SettingsPanel(props: { onClose: () => void }) {
  const { settings, update } = useSettings();
  const store = useStore();
  const importCase = useImportCase();
  const fileRef = useRef<HTMLInputElement>(null);
  const [key, setKey] = useState(settings.apiKey);
  const [usage, setUsage] = useState<{ usage: number; quota: number } | null>(null);
  const [sections, setSections] = useState<Section[]>([]);

  useEffect(() => {
    navigator.storage?.estimate?.().then((e) => setUsage({ usage: e.usage ?? 0, quota: e.quota ?? 0 })).catch(() => {});
    Promise.all(
      listTools()
        .filter((t) => t.loadSettingsSection)
        .map(async (t) => ({ id: t.id, name: t.name, C: await t.loadSettingsSection!() })),
    ).then(setSections);
  }, []);

  return (
    <Modal title="Settings" onClose={props.onClose} className="settings-modal" testId="settings">
        <div className="col settings-body">
          <section className="col" style={{ gap: 6 }}>
            <span className="label">Claude API key</span>
            <form
              className="row"
              onSubmit={(e) => {
                e.preventDefault();
                update({ ...settings, apiKey: key.trim() });
              }}
            >
              <input
                className="hud-input"
                type="password"
                autoComplete="off"
                placeholder="sk-ant-…"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                data-testid="api-key"
              />
              <button type="submit" className="hud-btn" data-testid="save-key">
                Save
              </button>
              <HudButton
                onClick={() => {
                  setKey("");
                  update({ ...settings, apiKey: "" });
                }}
              >
                Clear
              </HudButton>
            </form>
            <Toggle
              on={settings.rememberKey}
              label="Remember key on this device"
              onChange={(on) => update({ ...settings, rememberKey: on, apiKey: key.trim() })}
            />
            <span className="help">
              Used to write forensic notes; without a key Belfry writes local notes instead. The key is sent only to
              api.anthropic.com. {settings.rememberKey
                ? "It's saved in this browser's storage, which other pages hosted on the same domain (e.g. other projects on the same github.io account) can read — turn this off to keep it only for this tab."
                : "It's kept only for this tab and forgotten when you close it."}
              {settings.apiKey ? " · Key set." : ""}
            </span>
          </section>

          {sections.map(({ id, name, C }) => (
            <section key={id} className="col" style={{ gap: 6 }}>
              <span className="label">{name}</span>
              <C settings={settings} updateSettings={update} />
            </section>
          ))}

          <section className="col" style={{ gap: 6 }}>
            <span className="label">Storage</span>
            <span className="help">
              {!store.persistent
                ? "This browser is blocking storage — cases will be lost when the tab closes."
                : usage
                  ? `${fmtBytes(usage.usage)} used of ${fmtBytes(usage.quota)} available`
                  : "Usage unavailable"}
            </span>
            <div className="row">
              <HudButton onClick={() => fileRef.current?.click()}>Import case</HudButton>
              <input
                ref={fileRef}
                type="file"
                accept=".belfry,application/zip"
                hidden
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) await importCase(f);
                }}
              />
            </div>
          </section>

          <div className="row dialog-actions">
            <HudButton active onClick={props.onClose} data-testid="close-settings">
              Done
            </HudButton>
          </div>
        </div>
    </Modal>
  );
}
