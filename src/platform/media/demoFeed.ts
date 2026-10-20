import { VideoElementSource, type FrameSource } from "./frameSource";

const W = 640;
const H = 480;

/**
 * A synthetic camera for visitors without one: a figure seated at a desk under
 * a lamp, a cup drifting across the desk and a phone beside it. The geometry
 * follows the mock models (see tools/detective/models/mock.ts), so with mock
 * models the detections line up with what is drawn.
 */
export async function openDemoFeed(): Promise<FrameSource> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const grain = makeGrain();
  const start = performance.now();
  let raf = 0;
  const loop = () => {
    drawScene(ctx, performance.now() - start, grain);
    raf = requestAnimationFrame(loop);
  };
  loop();

  const stream = canvas.captureStream(30);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  await video.play();
  return new VideoElementSource(video, "live", () => {
    cancelAnimationFrame(raf);
    stream.getTracks().forEach((t) => t.stop());
    video.srcObject = null;
  });
}

const sway = (t: number) => 0.5 + 0.08 * Math.sin((t / 1000) * 0.8);

function cupX(t: number): number {
  const s = (t / 1000) % 20;
  const speed = 0.07 / 3;
  return s < 10 ? 0.5 + speed * (s - 5) : 0.5 - speed * (s - 15);
}

function makeGrain(): HTMLCanvasElement {
  const g = document.createElement("canvas");
  g.width = 128;
  g.height = 128;
  const gx = g.getContext("2d")!;
  const img = gx.createImageData(128, 128);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() * 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 18;
  }
  gx.putImageData(img, 0, 0);
  return g;
}

function drawScene(ctx: CanvasRenderingContext2D, t: number, grain: HTMLCanvasElement) {
  // back wall, lit from a lamp above the desk
  const wall = ctx.createRadialGradient(W * 0.5, H * 0.1, 20, W * 0.5, H * 0.35, W * 0.75);
  wall.addColorStop(0, "#5a5446");
  wall.addColorStop(0.5, "#2b2a27");
  wall.addColorStop(1, "#0d0e10");
  ctx.fillStyle = wall;
  ctx.fillRect(0, 0, W, H);

  // wainscot rail on the wall
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.fillRect(0, H * 0.46, W, 4);

  // the figure (behind the desk)
  const cx = sway(t) * W;
  ctx.fillStyle = "#1c1d22";
  ctx.beginPath();
  ctx.ellipse(cx, H * 0.72, W * 0.16, H * 0.36, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#8a6a55";
  ctx.beginPath();
  ctx.ellipse(cx, H * 0.27, W * 0.07, H * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#2a201b"; // hair
  ctx.beginPath();
  ctx.ellipse(cx, H * 0.2, W * 0.072, H * 0.05, 0, Math.PI, Math.PI * 2);
  ctx.fill();
  // collar
  ctx.strokeStyle = "#3a3c44";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(cx - W * 0.05, H * 0.38);
  ctx.lineTo(cx, H * 0.45);
  ctx.lineTo(cx + W * 0.05, H * 0.38);
  ctx.stroke();

  // desk top and front
  const deskTop = H * 0.58;
  const desk = ctx.createLinearGradient(0, deskTop, 0, H);
  desk.addColorStop(0, "#4b3626");
  desk.addColorStop(0.08, "#3a2a1e");
  desk.addColorStop(1, "#140e0a");
  ctx.fillStyle = desk;
  ctx.fillRect(0, deskTop, W, H - deskTop);
  ctx.fillStyle = "rgba(255,220,170,0.12)";
  ctx.fillRect(0, deskTop, W, 2);

  // phone, face down
  const wob = 0.01 * Math.sin(t / 700);
  ctx.fillStyle = "#101114";
  roundRect(ctx, (0.14 + wob) * W, 0.7 * H, 0.12 * W, 0.14 * H, 6);
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fillRect((0.15 + wob) * W, 0.71 * H, 0.1 * W, 2);

  // the cup, resting on the desk
  const x = cupX(t) * W;
  const top = H * 0.44;
  const bottom = deskTop;
  ctx.fillStyle = "#d9d4c8";
  ctx.beginPath();
  ctx.moveTo(x - W * 0.055, top);
  ctx.lineTo(x + W * 0.055, top);
  ctx.lineTo(x + W * 0.045, bottom);
  ctx.lineTo(x - W * 0.045, bottom);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#d9d4c8";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(x + W * 0.06, (top + bottom) / 2, H * 0.03, -Math.PI / 2, Math.PI / 2);
  ctx.stroke();
  ctx.fillStyle = "#2b1a10";
  ctx.beginPath();
  ctx.ellipse(x, top + 3, W * 0.05, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // lamp falloff, vignette and sensor grain
  const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.7);
  vig.addColorStop(0, "rgba(0,0,0,0)");
  vig.addColorStop(1, "rgba(0,0,0,0.6)");
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);
  const pattern = ctx.createPattern(grain, "repeat");
  if (pattern) {
    ctx.save();
    ctx.translate(-Math.floor(Math.random() * 128), -Math.floor(Math.random() * 128));
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, W + 128, H + 128);
    ctx.restore();
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fill();
}
