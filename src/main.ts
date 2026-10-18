import "./style.css";
import { Renderer } from "./gl/renderer";
import { PersonSegmenter } from "./models/segmenter";
import { ModelScheduler } from "./models/scheduler";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const canvas = $<HTMLCanvasElement>("view");
const startScreen = $("start");
const startBtn = $<HTMLButtonElement>("startBtn");
const errEl = $("err");
const statusEl = $("status");
const fpsEl = $("fps");
const segEl = $("segms");

const PULSE_SECONDS = 0.9;

let active = false;
let mirror = true;
let pulse = 0; // animated 0..1
let modelStatus = "";

async function startCamera(): Promise<HTMLVideoElement> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
    audio: false,
  });
  const video = document.createElement("video");
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  await video.play();
  return video;
}

async function boot() {
  startBtn.disabled = true;
  startBtn.textContent = "INITIALIZING...";
  try {
    const video = await startCamera();
    const renderer = new Renderer(canvas);
    const scheduler = new ModelScheduler();

    startScreen.remove();
    setActive(true);
    loop(video, renderer, scheduler);

    // The effect runs immediately; models attach to the scheduler as they finish loading.
    modelStatus = "LOADING MODELS";
    PersonSegmenter.create()
      .then((segmenter) => {
        scheduler.add({
          name: "segmentation",
          everyNFrames: 1,
          run: (_frame, now) => {
            const mask = segmenter.segment(video, now);
            if (mask) renderer.setMask(mask.data, mask.width, mask.height);
          },
        });
        modelStatus = "";
      })
      .catch((e) => {
        modelStatus = "SEGMENTER OFFLINE";
        console.error("Segmenter failed to load:", e);
      });
  } catch (e) {
    startBtn.disabled = false;
    startBtn.textContent = "RETRY";
    errEl.textContent = describeError(e);
    console.error(e);
  }
}

function describeError(e: unknown): string {
  if (e instanceof DOMException && e.name === "NotAllowedError") return "Camera permission was denied.";
  if (e instanceof DOMException && e.name === "NotFoundError") return "No camera was found.";
  if (e instanceof Error) return e.message;
  return "Something failed to load. Check your connection and try again.";
}

function loop(video: HTMLVideoElement, renderer: Renderer, scheduler: ModelScheduler) {
  let last = performance.now();
  let fps = 0;
  let lastVideoTime = -1;
  let hudTimer = 0;

  const frame = (now: number) => {
    const dt = (now - last) / 1000;
    last = now;
    fps = fps * 0.9 + (1 / Math.max(dt, 1e-3)) * 0.1;

    // Ease the activation pulse toward its target.
    const target = active ? 1 : 0;
    const step = dt / PULSE_SECONDS;
    pulse = target > pulse ? Math.min(1, pulse + step) : Math.max(0, pulse - step);

    // Only run models on new camera frames (camera is often 30fps on a 60/120Hz display).
    if (video.currentTime !== lastVideoTime && pulse > 0) {
      lastVideoTime = video.currentTime;
      scheduler.tick(now);
    }

    renderer.draw(video, { time: now / 1000, pulse: easeOut(pulse), mirror });

    hudTimer += dt;
    if (hudTimer > 0.25) {
      hudTimer = 0;
      fpsEl.textContent = `${fps.toFixed(0)} FPS`;
      renderStatus();
      const seg = scheduler.latencyMs.get("segmentation");
      segEl.textContent = seg === undefined ? "SEG -- ms" : `SEG ${seg.toFixed(1)} ms`;
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

function renderStatus() {
  const base = active ? "ACTIVE // SCANNING" : "STANDBY";
  statusEl.textContent = modelStatus ? `${base} // ${modelStatus}` : base;
}

function setActive(on: boolean) {
  active = on;
  renderStatus();
  document.body.classList.toggle("active", on);
}

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

startBtn.addEventListener("click", boot);
window.addEventListener("keydown", (e) => {
  if (e.key === "v" || e.key === "V") setActive(!active);
  if (e.key === "m" || e.key === "M") mirror = !mirror;
});
canvas.addEventListener("click", () => setActive(!active));
