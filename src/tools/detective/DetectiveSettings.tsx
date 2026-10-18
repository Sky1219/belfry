import { getToolSettings, setToolSettings, type Settings } from "../../app/settings";
import { Toggle } from "../../ui/components";
import { BUILTIN_PRESETS, defaultDetectiveSettings, DETECTIVE_TOOL_ID, type DetectiveSettings as DS } from "./presets";

/** Detective Vision's section in the Settings panel. */
export function DetectiveSettings({ settings, updateSettings }: { settings: Settings; updateSettings(next: Settings): void }) {
  const s = getToolSettings<DS>(settings, DETECTIVE_TOOL_ID, defaultDetectiveSettings());
  const save = (patch: Partial<DS>) => updateSettings(setToolSettings(settings, DETECTIVE_TOOL_ID, { ...s, ...patch }));
  const hasWebGpu = typeof navigator !== "undefined" && "gpu" in navigator;
  const presets = [...BUILTIN_PRESETS, ...s.customPresets];

  return (
    <div className="col" style={{ gap: 10 }}>
      <label className="col" style={{ gap: 4 }}>
        <span className="label">Default preset</span>
        <select className="hud-input" value={s.defaultPresetId} onChange={(e) => save({ defaultPresetId: e.target.value })} data-testid="default-preset">
          {presets.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <Toggle on={s.depthEnabled} label="Depth estimation" onChange={(on) => save({ depthEnabled: on })} />
      <span className="help">
        {hasWebGpu
          ? "Downloads a ~50 MB depth model the first time it's used."
          : "WebGPU isn't available in this browser, so depth will be slow."}
      </span>
      {s.customPresets.length > 0 && (
        <div className="col" style={{ gap: 4 }}>
          <span className="label">Saved presets</span>
          {s.customPresets.map((p) => (
            <div key={p.id} className="row" style={{ justifyContent: "space-between" }}>
              <span>{p.name}</span>
              <button
                className="hud-btn small danger"
                onClick={() =>
                  save({
                    customPresets: s.customPresets.filter((x) => x.id !== p.id),
                    defaultPresetId: s.defaultPresetId === p.id ? "investigate" : s.defaultPresetId,
                  })
                }
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
