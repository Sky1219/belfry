import type { FrameSource } from "../../platform/media/frameSource";
import type { LlmClient } from "../../platform/llm";
import type { ModelScheduler, TaskStats } from "../../platform/scheduler";
import { coverFit, toSource, type Viewport } from "../../platform/viewport";
import type { Evidence } from "../../store/schema";
import type { EvidenceStore } from "../../store/store";
import { ClipRecorder, compositeFrame, saveClip, snapshot } from "./capture";
import { dominantColorName } from "./features/color";
import { recordScan } from "./features/forensics";
import { faceRois, HeartRateEstimator, sampleRgb } from "./features/rppg";
import { centerRegion, cropRect, ScanController } from "./features/scan";
import { Tracker, type Track } from "./features/tracker";
import { Transition } from "./features/transition";
import { BlinkCounter, eyeAspectRatio, gazeDirection, GazeTracker, type Gaze } from "./features/vitals";
import { Renderer } from "./gl/renderer";
import type { ModelManager, ModelStatus } from "./models/manager";
import { MOCK_PULSE_BPM } from "./models/mock";
import type { Box, DepthMap, Detection, FaceResult, Mask, PoseResult } from "./models/types";
import { drawOverlay, ElevationTracker, hitTestTrack, type OverlayVitals } from "./overlay/overlay";
import {
  requiredModels,
  type HudDensity,
  type ModelName,
  type Overlay,
  type PresetDef,
  type ThermalPalette,
  type VisionMode,
} from "./presets";

export interface EngineState {
  fps: number;
  mode: VisionMode;
  overlays: Overlay[];
  palette: ThermalPalette;
  hud: HudDensity;
  presetId: string | null;
  modelStatus: Record<ModelName, ModelStatus>;
  schedulerStats: TaskStats[];
  recording: boolean;
  recordingMs: number;
  scanning: boolean;
  lastFinding?: Evidence;
  signal: "ok" | "lost";
  perfHint?: string;
  toasts: Array<{ id: number; text: string; at: number }>;
}

export interface EngineDeps {
  source: FrameSource;
  glCanvas: HTMLCanvasElement;
  overlayCanvas: HTMLCanvasElement;
  manager: ModelManager;
  scheduler: ModelScheduler;
  store: EvidenceStore;
  llm: LlmClient;
  caseId: string;
  depthEnabled: boolean;
  /** Mock mode: heart rate comes from the mock face instead of camera pixels. */
  mock?: boolean;
  now?: () => number;
  /** True when the visitor asked for less motion: mode changes cut, grain and throb hold still. */
  reducedMotion?: () => boolean;
}

const TRANSITION_S = 0.9;
const TASKS: Array<{ name: ModelName; priority: number; defaultInterval: number; maxInterval: number }> = [
  { name: "segmentation", priority: 5, defaultInterval: 1, maxInterval: 3 },
  { name: "face", priority: 4, defaultInterval: 1, maxInterval: 3 },
  { name: "pose", priority: 3, defaultInterval: 2, maxInterval: 6 },
  { name: "detection", priority: 2, defaultInterval: 3, maxInterval: 10 },
  { name: "depth", priority: 1, defaultInterval: 10, maxInterval: 40 },
];

/**
 * Runs Detective Vision: one requestAnimationFrame loop that pulls camera
 * frames, schedules the models, feeds their outputs to the renderer and the
 * signal-processing features, drives scanning and capture, and draws the HUD.
 */
export class DetectiveEngine {
  private renderer: Renderer;
  private overlayCtx: CanvasRenderingContext2D;
  private sampleCtx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;
  private raf = 0;
  private t0: number;
  private now: () => number;
  private lastFrameId = -1;
  private lastTick = 0;
  private fps = 0;
  private slowSince: number | null = null;
  private viewport: Viewport | null = null;
  private listeners = new Set<(s: EngineState) => void>();
  private lastEmit = 0;
  private disposed = false;

  // look
  private mode: VisionMode = "detective";
  private prevMode: VisionMode = "normal";
  private transition = new Transition(TRANSITION_S * 1000);
  private overlays = new Set<Overlay>();
  private palette: ThermalPalette = "ironbow";
  private hud: HudDensity = "full";
  private presetId: string | null = null;

  // model outputs and features
  private tracker = new Tracker();
  private tracks: Track[] = [];
  private pose: PoseResult = null;
  private face: FaceResult = null;
  private faceSeenAt: number | null = null;
  private heart = new HeartRateEstimator();
  private heartReading: { bpm: number; confidence: number } | null = null;
  private lastHeartCall = 0;
  private elevation = new ElevationTracker();
  private blinks = new BlinkCounter();
  private gaze = new GazeTracker();
  private gazeNow: Gaze | null = null;

  // scanning, capture, status
  private scan = new ScanController();
  private scanView = { trackId: null as number | null, progress01: 0, centerScan: false };
  private scanning = false;
  private lastFinding?: Evidence;
  private clip: ClipRecorder | null = null;
  private clipStartedAt = 0;
  private captureCanvas = document.createElement("canvas");
  private toasts: Array<{ id: number; text: string; at: number }> = [];
  private toastId = 0;
  private signal: "ok" | "lost" = "ok";
  private perfHint?: string;
  private offStatus: () => void;
  private offModels: () => void;

  constructor(private deps: EngineDeps) {
    this.now = deps.now ?? (() => performance.now());
    this.t0 = this.now();
    this.renderer = new Renderer(deps.glCanvas);
    this.renderer.setSource(deps.source.element);
    this.overlayCtx = deps.overlayCanvas.getContext("2d")!;
    this.sampleCtx =
      typeof OffscreenCanvas !== "undefined"
        ? new OffscreenCanvas(32, 16).getContext("2d", { willReadFrequently: true })!
        : document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
    this.offStatus = deps.source.onStatus((s) => {
      this.signal = s;
      this.emit(true);
    });
    this.offModels = deps.manager.onStatus(() => this.emit(true));
    this.registerTasks();
  }

  // ---------- public controls ----------

  onState(fn: (s: EngineState) => void): () => void {
    this.listeners.add(fn);
    fn(this.state());
    return () => this.listeners.delete(fn);
  }

  start(): void {
    const loop = () => {
      if (this.disposed) return;
      this.tick();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  setPreset(p: PresetDef): void {
    this.setMode(p.mode);
    this.overlays = new Set(p.overlays);
    this.palette = p.palette;
    this.hud = p.hud;
    this.presetId = p.id;
    this.applyRequirements();
    this.emit(true);
  }

  setMode(m: VisionMode): void {
    if (m === this.mode) return;
    this.prevMode = this.mode;
    this.mode = m;
    this.transition.start(this.t(), { instant: this.stillMotion() });
    this.presetId = null;
    this.applyRequirements();
    this.emit(true);
  }

  toggleOverlay(o: Overlay): void {
    if (this.overlays.has(o)) this.overlays.delete(o);
    else this.overlays.add(o);
    this.presetId = null;
    this.applyRequirements();
    this.emit(true);
  }

  setPalette(p: ThermalPalette): void {
    this.palette = p;
    this.emit(true);
  }

  setHud(h: HudDensity): void {
    this.hud = h;
    this.emit(true);
  }

  setDepthEnabled(on: boolean): void {
    this.deps.depthEnabled = on;
    this.applyRequirements();
  }

  /** `S`: scan whatever is in the center region. */
  scanCenter(): void {
    const t = this.t();
    const center = this.centerSource();
    const hit = this.tracks
      .filter((tr) => tr.box[0] <= center.nx && center.nx <= tr.box[2] && tr.box[1] <= center.ny && center.ny <= tr.box[3])
      .sort((a, b) => (a.box[2] - a.box[0]) * (a.box[3] - a.box[1]) - (b.box[2] - b.box[0]) * (b.box[3] - b.box[1]))[0];
    if (hit) this.runScan(this.scan.clickScan(hit, t));
    else this.runScan(null);
  }

  /** Click/tap on the view (CSS px relative to the canvas). */
  click(x: number, y: number): boolean {
    if (!this.viewport) return false;
    const id = hitTestTrack(this.overlayFrame(), x, y);
    const tr = id !== null ? this.tracks.find((t) => t.id === id) : undefined;
    if (!tr) return false;
    this.runScan(this.scan.clickScan(tr, this.t()));
    return true;
  }

  async snapshot(): Promise<Evidence | null> {
    try {
      const e = await snapshot(
        { store: this.deps.store, caseId: this.deps.caseId, nowMs: Date.now() },
        { gl: this.deps.glCanvas, overlay: this.deps.overlayCanvas },
      );
      this.setToast("Snapshot pinned to the board");
      return e;
    } catch (err) {
      this.setToast(`Snapshot failed: ${(err as Error).message}`);
      return null;
    }
  }

  startClip(): void {
    if (this.clip?.recording) return;
    try {
      compositeFrame(this.deps.glCanvas, this.deps.overlayCanvas, this.captureCanvas);
      this.clip = new ClipRecorder(this.captureCanvas, { onAutoStop: (p) => this.finishClip(p) });
      this.clip.start();
      this.clipStartedAt = Date.now();
      this.emit(true);
    } catch (err) {
      this.clip = null;
      this.setToast(`Recording unavailable: ${(err as Error).message}`);
    }
  }

  stopClip(): void {
    if (!this.clip?.recording) return;
    this.finishClip(this.clip.stop());
  }

  retryModel(name: ModelName): void {
    this.deps.manager.retry(name);
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    if (this.clip?.recording) this.clip.stop();
    this.offStatus();
    this.offModels();
    this.listeners.clear();
    for (const t of TASKS) this.deps.scheduler.remove(t.name);
    this.renderer.dispose();
  }

  // ---------- loop ----------

  private t(): number {
    return this.now() - this.t0;
  }

  private tick() {
    const now = this.now();
    const t = now - this.t0;
    const dt = this.lastTick ? now - this.lastTick : 16;
    this.lastTick = now;
    this.fps = this.fps ? this.fps * 0.9 + (1000 / Math.max(dt, 1)) * 0.1 : 1000 / Math.max(dt, 1);

    const src = this.deps.source;
    const canvas = this.deps.glCanvas;
    const cssW = canvas.clientWidth || 1;
    const cssH = canvas.clientHeight || 1;
    if (src.width && src.height) {
      this.viewport = coverFit(src.width, src.height, cssW, cssH, src.kind === "live");
      this.renderer.setViewport(this.viewport);
    }

    const fid = src.frameId();
    const hasNewFrame = fid !== this.lastFrameId && this.signal === "ok";
    if (hasNewFrame) {
      this.lastFrameId = fid;
      this.deps.scheduler.onNewFrame(fid, t);
    }

    this.tracks = this.tracker.tracks(t);
    this.renderer.setBoxes(this.overlays.has("evidence") ? this.tracks.map((x) => x.box) : []);
    this.updateVitals(t);
    const still = this.stillMotion();
    this.renderer.setFace(this.face?.box ?? null, still ? 0.5 : this.pulsePhase(t));

    // scanning (detection is always on while the tool is open)
    if (!this.scanning && this.viewport && this.deps.manager.status("detection") === "ready") {
      const u = this.scan.update(t, this.tracks, this.centerSource());
      this.scanView = { trackId: u.targetId, progress01: u.progress01, centerScan: false };
      if (u.fire) this.runScan(u.fire);
    }

    const transition01 = this.transition.progress(t);
    // once the pulse finishes, the previous mode's models are no longer needed
    if (this.transition.consumeEnd(t)) this.applyRequirements();
    this.renderer.render({
      mode: this.mode,
      prevMode: this.prevMode,
      transition01,
      overlays: this.overlays,
      palette: this.palette,
      timeS: t / 1000,
      still,
      hasNewFrame,
    });
    this.drawHud();
    if (this.clip?.recording) compositeFrame(this.deps.glCanvas, this.deps.overlayCanvas, this.captureCanvas);

    this.deps.scheduler.reportFrameTime(dt);
    this.updatePerfHint(t);
    this.emit(false);
  }

  private drawHud() {
    if (!this.viewport) return;
    const oc = this.deps.overlayCanvas;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.floor(oc.clientWidth * dpr);
    const h = Math.floor(oc.clientHeight * dpr);
    if (oc.width !== w || oc.height !== h) {
      oc.width = w;
      oc.height = h;
    }
    this.overlayCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawOverlay(this.overlayCtx, this.overlayFrame());
  }

  private overlayFrame() {
    const vit: OverlayVitals = {
      bpm: this.heartReading?.bpm ?? null,
      confidence: this.heartReading?.confidence ?? 0,
      elevated: this.heartReading ? this.elevation.elevated(this.heartReading.bpm) : false,
      blinksPerMin: this.face ? this.blinks.blinksPerMinute(this.t()) : null,
      gaze: this.face ? this.gazeNow : null,
      awayPct: this.face ? this.gaze.awayPercent(this.t()) : null,
    };
    return {
      viewport: this.viewport!,
      overlays: this.overlays,
      hud: this.hud,
      pose: this.pose,
      tracks: this.tracks,
      scan: this.scanView,
      vitals: vit,
      faceBox: this.overlays.has("vitals") ? (this.face?.box ?? null) : null,
      reticle: this.hud !== "off",
    };
  }

  // ---------- models ----------

  private registerTasks() {
    const { scheduler, manager, source } = this.deps;
    const video = source.element;
    const run: Record<ModelName, (t: number) => void | Promise<void>> = {
      segmentation: (t) => {
        const m = manager.get<Mask | null>("segmentation")?.infer(video, t) as Mask | null | undefined;
        if (m) this.renderer.setMask(m.data, m.width, m.height);
      },
      face: (t) => {
        const f = manager.get<FaceResult>("face")?.infer(video, t) as FaceResult | undefined;
        if (f === undefined) return;
        this.face = f;
        if (!f) {
          this.faceSeenAt = null;
          return;
        }
        this.faceSeenAt ??= t;
        const ear = (eyeAspectRatio(f, "left") + eyeAspectRatio(f, "right")) / 2;
        this.blinks.push(t, ear);
        this.gazeNow = gazeDirection(f);
        this.gaze.push(t, this.gazeNow);
        if (!this.deps.mock && (this.overlays.has("vitals") || this.mode === "thermal")) {
          const rgb = sampleRgb(this.sampleCtx, video, faceRois(f));
          if (rgb) this.heart.push(t, rgb);
        }
      },
      pose: (t) => {
        const p = manager.get<PoseResult>("pose")?.infer(video, t) as PoseResult | undefined;
        if (p !== undefined) this.pose = p;
      },
      detection: (t) => {
        const d = manager.get<Detection[]>("detection")?.infer(video, t) as Detection[] | undefined;
        if (d) this.tracks = this.tracker.update(d, t);
      },
      depth: async (t) => {
        const d = (await manager.get<DepthMap | null>("depth")?.infer(video, t)) as DepthMap | null | undefined;
        if (d && !this.disposed) this.renderer.setDepth(d.data, d.width, d.height);
      },
    };
    for (const spec of TASKS) scheduler.add({ ...spec, run: (_f, t) => run[spec.name](t) });
    this.applyRequirements();
  }

  private applyRequirements() {
    const need = requiredModels(this.mode, this.overlays, this.deps.depthEnabled);
    if (this.transition.running(this.t())) {
      for (const n of requiredModels(this.prevMode, this.overlays, this.deps.depthEnabled)) need.add(n);
    }
    this.deps.manager.ensure(need);
    for (const t of TASKS) this.deps.scheduler.setActive(t.name, need.has(t.name));
    if (!need.has("depth")) this.renderer.clearDepth();
    if (!need.has("segmentation")) this.renderer.clearMask();
    if (!need.has("face")) {
      this.face = null;
      this.heart.reset();
      this.heartReading = null;
    }
    if (!need.has("pose")) this.pose = null;
  }

  // ---------- vitals ----------

  private updateVitals(t: number) {
    if (!this.overlays.has("vitals") && this.mode !== "thermal") return;
    if (t - this.lastHeartCall < 500) return;
    this.lastHeartCall = t;
    if (this.deps.mock) {
      this.heartReading =
        this.face && this.faceSeenAt !== null && t - this.faceSeenAt > 6000 ? { bpm: MOCK_PULSE_BPM, confidence: 0.8 } : null;
    } else {
      this.heartReading = this.heart.reading(t);
    }
    if (this.heartReading) this.elevation.push(t, this.heartReading.bpm);
  }

  private stillMotion(): boolean {
    return this.deps.reducedMotion?.() ?? false;
  }

  /** 0..1 heartbeat intensity, used by thermal to make the face throb. */
  private pulsePhase(t: number): number {
    if (!this.heartReading) return 0.5;
    return 0.5 + 0.5 * Math.sin((2 * Math.PI * this.heartReading.bpm * t) / 60_000);
  }

  // ---------- scanning ----------

  private centerSource() {
    const v = this.viewport;
    return v ? toSource(v, v.dstW / 2, v.dstH / 2) : { nx: 0.5, ny: 0.5 };
  }

  private runScan(track: Track | null) {
    if (this.scanning) return;
    const video = this.deps.source.element;
    if (!video.videoWidth) return;
    this.scanning = true;
    this.scanView = { trackId: track?.id ?? null, progress01: 1, centerScan: !track };
    this.emit(true);
    const box: Box = track?.box ?? centerRegion();
    const r = cropRect(box, video.videoWidth, video.videoHeight);
    const c = document.createElement("canvas");
    c.width = r.outW;
    c.height = r.outH;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(video, r.sx, r.sy, r.sw, r.sh, 0, 0, r.outW, r.outH);
    const color = dominantColorName(ctx.getImageData(0, 0, r.outW, r.outH).data, r.outW, r.outH);
    const tVisibleS = track ? (this.t() - track.firstSeenMs) / 1000 : 0;
    new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("crop failed"))), "image/jpeg", 0.88))
      .then(async (blob) =>
        recordScan(
          { store: this.deps.store, llm: this.deps.llm, caseId: this.deps.caseId, nowMs: Date.now() },
          { jpeg: new Uint8Array(await blob.arrayBuffer()), track, color, tVisibleS },
        ),
      )
      .then((res) => {
        this.lastFinding = res.finding;
        this.setToast(res.reason ? `Scan saved with a local note (${res.reason})` : "Scan pinned to the board");
      })
      .catch((err) => this.setToast(`Scan failed: ${(err as Error).message}`))
      .finally(() => {
        this.scanning = false;
        this.scanView = { trackId: null, progress01: 0, centerScan: false };
        this.emit(true);
      });
  }

  private finishClip(p: Promise<Blob>) {
    const startedAt = this.clipStartedAt;
    this.emit(true);
    p.then((blob) =>
      saveClip({ store: this.deps.store, caseId: this.deps.caseId, nowMs: Date.now() }, blob, (Date.now() - startedAt) / 1000),
    )
      .then(() => this.setToast("Clip saved to the board"))
      .catch((err) => this.setToast(`Clip failed: ${(err as Error).message}`))
      .finally(() => {
        this.clip = null;
        this.emit(true);
      });
  }

  // ---------- status ----------

  private updatePerfHint(t: number) {
    const s = this.deps.scheduler;
    if (this.fps < 27 && s.saturated()) {
      this.slowSince ??= t;
      if (t - this.slowSince > 5000) {
        const heaviest = s
          .stats()
          .filter((x) => x.active)
          .sort((a, b) => b.avgMs / b.interval - a.avgMs / a.interval)[0];
        this.perfHint = heaviest ? `Running slow — try turning off features that use ${heaviest.name}` : undefined;
      }
    } else {
      this.slowSince = null;
      this.perfHint = undefined;
    }
  }

  /** Short confirmations; the last three stay visible for 4 s each. */
  private setToast(text: string) {
    const now = Date.now();
    this.toasts = [...this.toasts.filter((t) => now - t.at < 4000), { id: ++this.toastId, text, at: now }].slice(-3);
    this.emit(true);
  }

  private state(): EngineState {
    return {
      fps: this.fps,
      mode: this.mode,
      overlays: [...this.overlays],
      palette: this.palette,
      hud: this.hud,
      presetId: this.presetId,
      modelStatus: this.deps.manager.statuses(),
      schedulerStats: this.deps.scheduler.stats(),
      recording: !!this.clip?.recording,
      recordingMs: this.clip?.elapsedMs() ?? 0,
      scanning: this.scanning,
      lastFinding: this.lastFinding,
      signal: this.signal,
      perfHint: this.perfHint,
      toasts: this.toasts.filter((t) => Date.now() - t.at < 4000),
    };
  }

  /** Pushes state to the UI: immediately when forced, otherwise ~4 times a second. */
  private emit(force: boolean) {
    const now = this.now();
    if (!force && now - this.lastEmit < 250) return;
    this.lastEmit = now;
    const s = this.state();
    for (const fn of this.listeners) fn(s);
  }
}
