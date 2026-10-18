import { useEffect, useRef } from "react";
import { coverFit } from "../../../platform/viewport";
import { Renderer } from "../gl/renderer";
import type { Overlay, VisionMode } from "../presets";

declare global {
  interface Window {
    __shaderErrors?: string[];
    __ready?: boolean;
    __setMode?: (m: VisionMode, overlays?: Overlay[]) => void;
    __thumb?: () => number[];
  }
}

/**
 * Dev-only page (`?mock#/dev/shaders`): renders the camera with synthetic model
 * outputs so every vision mode can be compiled, screenshotted and compared in
 * browser tests without downloading any models.
 */
export function ShaderHarness() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let raf = 0;
    let stream: MediaStream | null = null;
    let renderer: Renderer | null = null;
    let mode: VisionMode = "normal";
    let overlays = new Set<Overlay>();
    const canvas = canvasRef.current!;
    const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true });
    window.__shaderErrors = gl ? Renderer.compileAll(gl) : ["WebGL2 unavailable"];

    (async () => {
      stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      await video.play();
      renderer = new Renderer(canvas);
      renderer.setSource(video);

      const mw = 160;
      const mh = 120;
      const mask = new Float32Array(mw * mh);
      const depth = new Uint8Array(mw * mh);
      for (let y = 0; y < mh; y++) {
        for (let x = 0; x < mw; x++) {
          const dx = (x / mw - 0.5) / 0.18;
          const dy = (y / mh - 0.55) / 0.38;
          mask[y * mw + x] = dx * dx + dy * dy < 1 ? 1 : 0;
          depth[y * mw + x] = Math.round((1 - x / mw) * 255);
        }
      }
      renderer.setMask(mask, mw, mh);
      renderer.setDepth(depth, mw, mh);
      renderer.setBoxes([[0.68, 0.55, 0.85, 0.8]]);
      renderer.setFace([0.43, 0.2, 0.57, 0.38], 0.6);

      window.__setMode = (m, o = ["xray", "evidence", "depthFog"]) => {
        mode = m;
        overlays = new Set(o);
      };
      window.__thumb = () => {
        const img = renderer!.readPixels();
        const out: number[] = [];
        const gw = 32;
        const gh = 18;
        for (let j = 0; j < gh; j++) {
          for (let i = 0; i < gw; i++) {
            const x = Math.floor(((i + 0.5) / gw) * img.width);
            const y = Math.floor(((j + 0.5) / gh) * img.height);
            const k = (y * img.width + x) * 4;
            out.push(img.data[k], img.data[k + 1], img.data[k + 2]);
          }
        }
        return out;
      };

      const loop = (t: number) => {
        const r = canvas.getBoundingClientRect();
        renderer!.setViewport(coverFit(video.videoWidth, video.videoHeight, r.width, r.height, true));
        renderer!.render({
          mode,
          prevMode: mode,
          transition01: 1,
          overlays,
          palette: "ironbow",
          timeS: t / 1000,
          hasNewFrame: true,
        });
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
      window.__ready = true;
    })().catch((e) => {
      window.__shaderErrors = [...(window.__shaderErrors ?? []), String(e)];
      window.__ready = true;
    });

    return () => {
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      renderer?.dispose();
    };
  }, []);

  return <canvas ref={canvasRef} style={{ position: "fixed", inset: 0, width: "100%", height: "100%" }} data-testid="harness" />;
}
