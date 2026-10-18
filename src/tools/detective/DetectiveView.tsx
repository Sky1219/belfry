import { useEffect, useMemo, useRef, useState } from "react";
import { getToolSettings, setToolSettings } from "../../app/settings";
import { formatRoute } from "../../app/router";
import type { FrameSource } from "../../platform/media/frameSource";
import { openVideo } from "../../platform/media/videoFile";
import { CameraError, openWebcam } from "../../platform/media/webcam";
import { ModelScheduler } from "../../platform/scheduler";
import type { Evidence } from "../../store/schema";
import { HudButton, ProgressRing, StatusChip, Toggle } from "../../ui/components";
import { useDialogs } from "../../ui/dialogs";
import type { ToolContext } from "../types";
import { DetectiveEngine, type EngineState } from "./engine";
import { ModelManager } from "./models/manager";
import { createMockAdapters } from "./models/mock";
import {
  BUILTIN_PRESETS,
  defaultDetectiveSettings,
  DETECTIVE_TOOL_ID,
  HUD_DENSITIES,
  OVERLAYS,
  PALETTES,
  VISION_MODES,
  type DetectiveSettings,
  type ModelName,
  type PresetDef,
} from "./presets";
import "./detective.css";

type Phase =
  | { kind: "starting" }
  | { kind: "error"; message: string; videos: Evidence[] }
  | { kind: "running" };

const isMock = () => new URLSearchParams(window.location.search).has("mock");
const MODEL_LABEL: Record<ModelName, string> = {
  segmentation: "SEG",
  face: "FACE",
  pose: "POSE",
  detection: "DETECT",
  depth: "DEPTH",
};

export function DetectiveView({ ctx }: { ctx: ToolContext }) {
  const glRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<DetectiveEngine | null>(null);
  const sourceRef = useRef<FrameSource | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "starting" });
  const [st, setSt] = useState<EngineState | null>(null);
  const [showPerf, setShowPerf] = useState(false);
  const dialogs = useDialogs();

  const dvSettings = getToolSettings<DetectiveSettings>(ctx.settings, DETECTIVE_TOOL_ID, defaultDetectiveSettings());
  const presets: PresetDef[] = useMemo(() => [...BUILTIN_PRESETS, ...dvSettings.customPresets], [dvSettings.customPresets]);
  const settingsRef = useRef(dvSettings);
  settingsRef.current = dvSettings;

  // start: open the source, models, scheduler and engine
  useEffect(() => {
    let cancelled = false;
    let engine: DetectiveEngine | null = null;
    let manager: ModelManager | null = null;
    let source: FrameSource | null = null;
    (async () => {
      try {
        if (ctx.input.kind === "live-camera") {
          source = await openWebcam();
        } else {
          const ev = ctx.input.evidence;
          const blob = ev.blobHash ? await ctx.store.getBlob(ev.blobHash) : undefined;
          if (!blob) throw new Error("This video's file is missing.");
          source = await openVideo(new Blob([blob.bytes as BlobPart], { type: blob.mime }));
        }
        if (cancelled) return source.dispose();
        sourceRef.current = source;
        const adapters = isMock() ? createMockAdapters() : (await import("./models")).createRealAdapters();
        manager = new ModelManager(adapters);
        engine = new DetectiveEngine({
          source,
          glCanvas: glRef.current!,
          overlayCanvas: overlayRef.current!,
          manager,
          scheduler: new ModelScheduler(),
          store: ctx.store,
          llm: ctx.llm,
          caseId: ctx.caseId,
          depthEnabled: settingsRef.current.depthEnabled,
          mock: isMock(),
        });
        engineRef.current = engine;
        const initial = presets.find((p) => p.id === settingsRef.current.defaultPresetId) ?? BUILTIN_PRESETS[0];
        engine.setPreset(initial);
        engine.onState(setSt);
        engine.start();
        setPhase({ kind: "running" });
      } catch (e) {
        if (cancelled) return;
        const videos = (await ctx.store.listEvidence(ctx.caseId)).filter((x) => x.type === "video");
        const message =
          e instanceof CameraError
            ? e.reason === "denied"
              ? "Camera permission was denied."
              : e.reason === "not-found"
                ? "No camera was found."
                : e.message
            : (e as Error).message;
        setPhase({ kind: "error", message, videos });
      }
    })();
    return () => {
      cancelled = true;
      engine?.dispose();
      manager?.dispose();
      source?.dispose();
      engineRef.current = null;
      sourceRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.input, ctx.caseId]);

  // depth on/off from settings while running
  useEffect(() => {
    engineRef.current?.setDepthEnabled(dvSettings.depthEnabled);
  }, [dvSettings.depthEnabled]);

  // keyboard: 1–9 presets, S scan, H HUD density, space play/pause
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.metaKey || e.ctrlKey) return;
      const eng = engineRef.current;
      if (!eng) return;
      if (/^[1-9]$/.test(e.key)) {
        const p = presets[Number(e.key) - 1];
        if (p) eng.setPreset(p);
      } else if (e.key === "s" || e.key === "S") {
        eng.scanCenter();
      } else if (e.key === "h" || e.key === "H") {
        const i = HUD_DENSITIES.indexOf(st?.hud ?? "full");
        eng.setHud(HUD_DENSITIES[(i + 1) % HUD_DENSITIES.length]);
      } else if (e.key === " " && sourceRef.current?.kind === "file") {
        e.preventDefault();
        const s = sourceRef.current;
        if (s.paused?.()) s.play?.();
        else s.pause?.();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [presets, st?.hud]);

  const savePreset = async () => {
    if (!st) return;
    const r = await dialogs.form("Save preset", [{ name: "name", label: "Preset name", testId: "preset-name" }], { submitLabel: "Save" });
    if (!r?.name.trim()) return;
    const p: PresetDef = {
      id: `custom-${Date.now().toString(36)}`,
      name: r.name.trim(),
      mode: st.mode,
      overlays: st.overlays,
      palette: st.palette,
      hud: st.hud,
    };
    ctx.updateSettings(setToolSettings(ctx.settings, DETECTIVE_TOOL_ID, { ...dvSettings, customPresets: [...dvSettings.customPresets, p] }));
    engineRef.current?.setPreset(p);
  };

  const eng = engineRef.current;
  const hudOff = st?.hud === "off";

  return (
    <div className={`dv-root ${hudOff ? "hud-off" : ""}`} data-testid="dv-root">
      <div
        className="dv-stage"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          eng?.click(e.clientX - r.left, e.clientY - r.top);
        }}
      >
        <canvas ref={glRef} className="dv-canvas" />
        <canvas ref={overlayRef} className="dv-canvas" />
      </div>

      {phase.kind === "starting" && <div className="dv-center label">Starting camera…</div>}
      {phase.kind === "error" && (
        <div className="dv-center">
          <div className="panel dv-error" data-testid="camera-error">
            <div className="panel-title">No signal</div>
            <div className="panel-body col">
              <p style={{ margin: 0 }}>{phase.message}</p>
              {phase.videos.length ? (
                <>
                  <span className="label">Open a video from this case</span>
                  {phase.videos.map((v) => (
                    <HudButton
                      key={v.id}
                      data-testid={`open-video-${v.id}`}
                      onClick={() =>
                        (window.location.hash = formatRoute({ name: "tool", caseId: ctx.caseId, toolId: DETECTIVE_TOOL_ID, input: `ev:${v.id}` }))
                      }
                    >
                      ▶ {v.title}
                    </HudButton>
                  ))}
                </>
              ) : (
                <p className="dim" style={{ margin: 0 }}>
                  There are no videos in this case yet. Add a clip from another device, or allow camera access and reopen the tool.
                </p>
              )}
              <HudButton onClick={ctx.close}>Back to board</HudButton>
            </div>
          </div>
        </div>
      )}

      {/* top bar */}
      <div className="dv-top">
        <div className="dv-title">
          <span className="dv-name">DETECTIVE VISION</span>
          <span className={`dv-status ${st?.signal === "lost" ? "lost" : ""}`} data-testid="dv-signal">
            {st?.signal === "lost" ? "SIGNAL LOST" : st ? `${st.mode.toUpperCase()} · ${Math.round(st.fps)} FPS` : "STANDBY"}
            {st?.recording ? ` · REC ${Math.floor(st.recordingMs / 1000)}s` : ""}
          </span>
        </div>
        <div className="dv-chips">
          {st &&
            (Object.keys(MODEL_LABEL) as ModelName[]).map((m) => (
              <button
                key={m}
                className="chip-btn"
                data-testid={`model-chip-${m}`}
                data-state={st.modelStatus[m]}
                title={st.modelStatus[m] === "offline" ? "Failed to load — click to retry" : m}
                onClick={() => st.modelStatus[m] === "offline" && eng?.retryModel(m)}
              >
                <StatusChip state={st.modelStatus[m]} label={MODEL_LABEL[m]} />
              </button>
            ))}
          <HudButton small onClick={() => setShowPerf((v) => !v)} data-testid="toggle-perf">
            Perf
          </HudButton>
          <HudButton small onClick={ctx.close} data-testid="dv-close">
            ✕ Board
          </HudButton>
        </div>
      </div>

      {showPerf && st && (
        <div className="panel dv-perf" data-testid="perf-panel">
          <div className="panel-title">Scheduler</div>
          <div className="panel-body">
            <table>
              <tbody>
                {st.schedulerStats.map((s) => (
                  <tr key={s.name} className={s.active ? "" : "dim"}>
                    <td>{s.name}</td>
                    <td>every {s.interval}f</td>
                    <td>{s.avgMs.toFixed(1)} ms</td>
                    <td>{s.inFlight ? "…" : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {st?.perfHint && <div className="dv-hint">{st.perfHint}</div>}
      {!!st?.toasts.length && (
        <div className="dv-toasts">
          {st.toasts.map((t) => (
            <div key={t.id} className="dv-toast" data-testid="dv-toast">
              {t.text}
            </div>
          ))}
        </div>
      )}

      <CaseFile finding={st?.lastFinding} />

      {st && phase.kind === "running" && (
        <div className="dv-controls" data-testid="dv-controls">
          {sourceRef.current?.kind === "file" && <VideoControls source={sourceRef.current} />}
          <div className="dv-row">
            <span className="label">Mode</span>
            {VISION_MODES.map((m) => (
              <HudButton key={m.id} small active={st.mode === m.id} data-testid={`mode-${m.id}`} onClick={() => eng?.setMode(m.id)}>
                {m.label}
              </HudButton>
            ))}
            {st.mode === "thermal" &&
              PALETTES.map((p) => (
                <HudButton key={p} small active={st.palette === p} onClick={() => eng?.setPalette(p)} data-testid={`palette-${p}`}>
                  {p}
                </HudButton>
              ))}
          </div>
          <div className="dv-row">
            <span className="label">Overlays</span>
            {OVERLAYS.map((o) => (
              <span key={o.id} data-testid={`overlay-${o.id}`}>
                <Toggle on={st.overlays.includes(o.id)} label={o.label} onChange={() => eng?.toggleOverlay(o.id)} />
              </span>
            ))}
          </div>
          <div className="dv-row">
            <span className="label">Presets</span>
            {presets.map((p, i) => (
              <HudButton key={p.id} small active={st.presetId === p.id} data-testid={`preset-${p.id}`} onClick={() => eng?.setPreset(p)} title={i < 9 ? `Key ${i + 1}` : undefined}>
                {i < 9 ? `${i + 1} · ` : ""}
                {p.name}
              </HudButton>
            ))}
            <HudButton small onClick={savePreset} data-testid="save-preset">
              + Save
            </HudButton>
            <span className="dv-spacer" />
            <span className="label">HUD</span>
            {HUD_DENSITIES.map((h) => (
              <HudButton key={h} small active={st.hud === h} onClick={() => eng?.setHud(h)} data-testid={`hud-${h}`}>
                {h}
              </HudButton>
            ))}
          </div>
          <div className="dv-row">
            <HudButton onClick={() => eng?.scanCenter()} disabled={st.scanning} data-testid="dv-scan" title="Key S">
              {st.scanning ? "Analyzing…" : "⌖ Scan center"}
            </HudButton>
            <HudButton onClick={() => eng?.snapshot()} data-testid="dv-snapshot">
              ▣ Snapshot
            </HudButton>
            <HudButton
              danger={st.recording}
              onClick={() => (st.recording ? eng?.stopClip() : eng?.startClip())}
              data-testid="dv-record"
            >
              {st.recording ? `■ Stop (${Math.floor(st.recordingMs / 1000)}s / 30s)` : "● Record"}
            </HudButton>
            <span className="dim" style={{ fontSize: 11 }}>
              Hold an object under the reticle for 2 s, or click it, to scan.
            </span>
          </div>
        </div>
      )}
      {hudOff && (
        <button className="dv-show-hud" onClick={() => eng?.setHud("full")} data-testid="show-hud">
          HUD
        </button>
      )}
      {st?.scanning && (
        <div className="dv-analyzing">
          <ProgressRing value={1} size={18} /> ANALYZING
        </div>
      )}
    </div>
  );
}

/** The latest finding, revealed like a teleprinter. */
function CaseFile({ finding }: { finding?: Evidence }) {
  const [shown, setShown] = useState(0);
  const text = finding ? `${finding.title}\n${finding.body ?? ""}` : "";
  useEffect(() => {
    setShown(0);
    if (!text) return;
    const id = setInterval(() => setShown((n) => (n >= text.length ? (clearInterval(id), n) : n + 2)), 18);
    return () => clearInterval(id);
  }, [text]);
  if (!finding) return null;
  return (
    <div className="panel dv-casefile" data-testid="case-file">
      <div className="panel-title">Case file</div>
      <div className="panel-body">
        <pre>{text.slice(0, shown)}</pre>
      </div>
    </div>
  );
}

function VideoControls({ source }: { source: FrameSource }) {
  const [pos, setPos] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    const id = setInterval(() => {
      const d = source.duration ?? 0;
      if (d > 0 && Number.isFinite(d)) setPos(source.currentTime() / d);
      setPaused(!!source.paused?.());
    }, 250);
    return () => clearInterval(id);
  }, [source]);
  return (
    <div className="dv-row">
      <HudButton
        small
        data-testid="video-play"
        onClick={() => {
          if (source.paused?.()) source.play?.();
          else source.pause?.();
        }}
      >
        {paused ? "▶ Play" : "❚❚ Pause"}
      </HudButton>
      <input
        className="dv-scrub"
        type="range"
        min={0}
        max={1}
        step={0.001}
        value={pos}
        data-testid="video-scrub"
        onChange={(e) => {
          const v = Number(e.target.value);
          setPos(v);
          const d = source.duration ?? 0;
          if (d > 0 && Number.isFinite(d)) source.seek?.(v * d);
        }}
      />
    </div>
  );
}
