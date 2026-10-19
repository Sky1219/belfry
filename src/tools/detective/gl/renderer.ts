import { shaderUv, type Viewport } from "../../../platform/viewport";
import type { Overlay, ThermalPalette, VisionMode } from "../presets";
import { MAX_BOXES, VERT } from "./shaders/common";
import { COMPOSITE, GHOST_HISTORY, MOTION_HISTORY, NIGHT_ACCUM } from "./shaders/history";
import { MODE_SOURCES } from "./shaders/modes";

export type Box = [number, number, number, number];

export interface RenderState {
  mode: VisionMode;
  prevMode: VisionMode;
  /** 0..1 progress of the pulse transition from prevMode to mode (1 = done). */
  transition01: number;
  overlays: Set<Overlay>;
  palette: ThermalPalette;
  timeS: number;
  /** Reduced motion: grain and shimmer freeze (u_time holds at 0). */
  still?: boolean;
  hasNewFrame: boolean;
}

const PROGRAM_SOURCES: Record<string, string> = {
  ...MODE_SOURCES,
  nightAccum: NIGHT_ACCUM,
  motionHistory: MOTION_HISTORY,
  ghostHistory: GHOST_HISTORY,
  composite: COMPOSITE,
};

type ProgramName = keyof typeof PROGRAM_SOURCES;

interface Program {
  prog: WebGLProgram;
  loc: Map<string, WebGLUniformLocation | null>;
}

const HISTORY_MAX_W = 640;
const PALETTE_INDEX: Record<ThermalPalette, number> = { ironbow: 0, "white-hot": 1, "black-hot": 2 };

/** A pair of framebuffers that swap roles each update. */
class PingPong {
  w = 0;
  h = 0;
  private tex: [WebGLTexture, WebGLTexture];
  private fbo: [WebGLFramebuffer, WebGLFramebuffer];
  private i = 0;
  needsReset = true;

  constructor(
    private gl: WebGL2RenderingContext,
    private mipmapped: boolean,
  ) {
    this.tex = [makeTex(gl, mipmapped), makeTex(gl, mipmapped)];
    this.fbo = [gl.createFramebuffer()!, gl.createFramebuffer()!];
  }

  ensureSize(w: number, h: number) {
    if (w === this.w && h === this.h) return;
    const gl = this.gl;
    this.w = w;
    this.h = h;
    for (let k = 0; k < 2; k++) {
      gl.bindTexture(gl.TEXTURE_2D, this.tex[k]);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      if (this.mipmapped) gl.generateMipmap(gl.TEXTURE_2D);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo[k]);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.tex[k], 0);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.needsReset = true;
  }

  read(): WebGLTexture {
    return this.tex[this.i];
  }
  writeFbo(): WebGLFramebuffer {
    return this.fbo[1 - this.i];
  }
  swap() {
    this.i = 1 - this.i;
    if (this.mipmapped) {
      this.gl.bindTexture(this.gl.TEXTURE_2D, this.read());
      this.gl.generateMipmap(this.gl.TEXTURE_2D);
    }
  }
  dispose() {
    this.tex.forEach((t) => this.gl.deleteTexture(t));
    this.fbo.forEach((f) => this.gl.deleteFramebuffer(f));
  }
}

/**
 * Detective Vision's WebGL2 renderer. Uploads the camera frame and model
 * outputs as textures, maintains multi-frame history buffers (night-vision
 * denoising, motion heat, ghost trails), and draws one of five vision modes,
 * cross-fading between modes with a radial pulse.
 */
export class Renderer {
  readonly gl: WebGL2RenderingContext;
  private programs: Record<string, Program>;
  private videoTex: WebGLTexture;
  private maskTex: WebGLTexture;
  private depthTex: [WebGLTexture, WebGLTexture];
  private depthChangedAt = -Infinity;
  private hasMask = false;
  private hasDepth = false;
  private boxes: Box[] = [];
  private face: Box | null = null;
  private pulse = 0;
  private source: HTMLVideoElement | null = null;
  private viewport: Viewport | null = null;
  private night: PingPong;
  private motion: PingPong;
  private ghost: PingPong;
  private transitionFbo: Array<{ tex: WebGLTexture; fbo: WebGLFramebuffer; w: number; h: number }>;
  private videoSize = { w: 1, h: 1 };
  private nowS = 0;

  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, preserveDrawingBuffer: true });
    if (!gl) throw new Error("WebGL2 is not available in this browser.");
    this.gl = gl;
    const { programs, errors } = Renderer.build(gl);
    if (errors.length) throw new Error(`Shader errors:\n${errors.join("\n")}`);
    this.programs = programs;
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    this.videoTex = makeTex(gl);
    this.maskTex = makeTex(gl);
    this.depthTex = [makeTex(gl), makeTex(gl)];
    this.night = new PingPong(gl, true);
    this.motion = new PingPong(gl, false);
    this.ghost = new PingPong(gl, false);
    this.transitionFbo = [0, 1].map(() => ({ tex: makeTex(gl), fbo: gl.createFramebuffer()!, w: 0, h: 0 }));
  }

  /** Compiles every program; returns the error log of each one that fails. */
  static compileAll(gl: WebGL2RenderingContext): string[] {
    const { programs, errors } = Renderer.build(gl);
    Object.values(programs).forEach((p) => gl.deleteProgram(p.prog));
    return errors;
  }

  private static build(gl: WebGL2RenderingContext): { programs: Record<string, Program>; errors: string[] } {
    const programs: Record<string, Program> = {};
    const errors: string[] = [];
    for (const [name, frag] of Object.entries(PROGRAM_SOURCES)) {
      try {
        programs[name] = { prog: link(gl, VERT, frag), loc: new Map() };
      } catch (e) {
        errors.push(`[${name}] ${(e as Error).message}`);
      }
    }
    return { programs, errors };
  }

  setSource(el: HTMLVideoElement) {
    this.source = el;
  }

  setViewport(v: Viewport) {
    this.viewport = v;
  }

  setMask(data: Float32Array, w: number, h: number) {
    const bytes = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i++) bytes[i] = Math.max(0, Math.min(255, data[i] * 255));
    this.uploadR8(this.maskTex, bytes, w, h);
    this.hasMask = true;
  }

  clearMask() {
    this.hasMask = false;
  }

  setDepth(data: Uint8Array, w: number, h: number) {
    // previous "current" becomes the fade-from texture
    this.depthTex = [this.depthTex[1], this.depthTex[0]];
    this.uploadR8(this.depthTex[1], data, w, h);
    if (!this.hasDepth) this.uploadR8(this.depthTex[0], data, w, h);
    this.hasDepth = true;
    this.depthChangedAt = this.nowS;
  }

  clearDepth() {
    this.hasDepth = false;
  }

  setBoxes(boxes: Box[]) {
    this.boxes = boxes.slice(0, MAX_BOXES);
  }

  setFace(box: Box | null, pulse01: number) {
    this.face = box;
    this.pulse = pulse01;
  }

  render(state: RenderState) {
    const gl = this.gl;
    this.nowS = state.timeS;
    this.resize();
    const src = this.source;
    if (!src || src.readyState < 2 || !src.videoWidth) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.clearColor(0.008, 0.024, 0.05, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      return;
    }
    this.videoSize = { w: src.videoWidth, h: src.videoHeight };

    const modes = new Set([state.mode, state.transition01 < 1 ? state.prevMode : state.mode]);
    if (state.hasNewFrame) {
      gl.bindTexture(gl.TEXTURE_2D, this.videoTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
      this.updateHistory(this.night, "nightAccum", modes.has("night"));
      this.updateHistory(this.motion, "motionHistory", modes.has("motion"));
      this.updateHistory(this.ghost, "ghostHistory", state.overlays.has("ghostTrails"));
    }

    const W = this.canvas.width;
    const H = this.canvas.height;
    if (state.transition01 < 1 && state.prevMode !== state.mode) {
      const [a, b] = this.transitionFbo.map((t) => this.ensureTarget(t, W, H));
      this.drawMode(state.prevMode, state, a.fbo, W, H);
      this.drawMode(state.mode, state, b.fbo, W, H);
      const p = this.use("composite");
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, W, H);
      this.bindTex(p, "u_from", 0, a.tex);
      this.bindTex(p, "u_to", 1, b.tex);
      gl.uniform1f(this.u(p, "u_t"), easeOut(state.transition01));
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    } else {
      this.drawMode(state.mode, state, null, W, H);
    }
  }

  /** Reads the current canvas contents (top row first). */
  readPixels(): ImageData {
    const gl = this.gl;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const buf = new Uint8ClampedArray(w * h * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    const out = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) out.set(buf.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
    return new ImageData(out, w, h);
  }

  dispose() {
    const gl = this.gl;
    Object.values(this.programs).forEach((p) => gl.deleteProgram(p.prog));
    [this.videoTex, this.maskTex, ...this.depthTex].forEach((t) => gl.deleteTexture(t));
    [this.night, this.motion, this.ghost].forEach((pp) => pp.dispose());
    this.transitionFbo.forEach((t) => {
      gl.deleteTexture(t.tex);
      gl.deleteFramebuffer(t.fbo);
    });
    // Free the context now rather than waiting for GC; browsers cap live WebGL contexts.
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  }

  // ---------- internals ----------

  private drawMode(mode: VisionMode, s: RenderState, fbo: WebGLFramebuffer | null, W: number, H: number) {
    const gl = this.gl;
    const p = this.use(mode);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.viewport(0, 0, W, H);
    this.bindTex(p, "u_video", 0, this.videoTex);
    this.bindTex(p, "u_mask", 1, this.maskTex);
    this.bindTex(p, "u_depthA", 2, this.depthTex[0]);
    this.bindTex(p, "u_depthB", 3, this.depthTex[1]);
    this.bindTex(p, "u_hist", 4, mode === "night" ? this.night.read() : this.motion.read());
    this.bindTex(p, "u_ghost", 5, this.ghost.read());

    const v = this.viewport;
    const uv = v ? shaderUv(v) : { scale: [1, 1] as [number, number], offset: [0, 0] as [number, number] };
    gl.uniform2f(this.u(p, "u_uvScale"), uv.scale[0], uv.scale[1]);
    gl.uniform2f(this.u(p, "u_uvOffset"), uv.offset[0], uv.offset[1]);
    gl.uniform1f(this.u(p, "u_mirror"), v?.mirror ? 1 : 0);
    gl.uniform2f(this.u(p, "u_texel"), 1 / this.videoSize.w, 1 / this.videoSize.h);
    gl.uniform1f(this.u(p, "u_time"), s.still ? 0 : s.timeS);
    gl.uniform1f(this.u(p, "u_depthMix"), Math.min(1, Math.max(0, (s.timeS - this.depthChangedAt) / 0.3)));
    gl.uniform1f(this.u(p, "u_hasMask"), this.hasMask ? 1 : 0);
    gl.uniform1f(this.u(p, "u_hasDepth"), this.hasDepth ? 1 : 0);
    gl.uniform1f(this.u(p, "u_hasFace"), this.face ? 1 : 0);
    const f = this.face ?? [0, 0, 0, 0];
    gl.uniform4f(this.u(p, "u_face"), f[0], f[1], f[2], f[3]);
    gl.uniform1f(this.u(p, "u_pulse"), this.pulse);
    const flat = new Float32Array(MAX_BOXES * 4);
    this.boxes.forEach((b, i) => flat.set(b, i * 4));
    gl.uniform4fv(this.u(p, "u_boxes[0]"), flat);
    gl.uniform1i(this.u(p, "u_boxCount"), this.boxes.length);
    gl.uniform1i(this.u(p, "u_palette"), PALETTE_INDEX[s.palette]);
    gl.uniform1f(this.u(p, "u_xray"), s.overlays.has("xray") ? 1 : 0);
    gl.uniform1f(this.u(p, "u_xrayFill"), mode === "thermal" ? 0.0 : 0.85);
    gl.uniform1f(this.u(p, "u_fog"), s.overlays.has("depthFog") ? 1 : 0);
    gl.uniform1f(this.u(p, "u_ghostOn"), s.overlays.has("ghostTrails") ? 1 : 0);
    gl.uniform1f(this.u(p, "u_evidence"), s.overlays.has("evidence") ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private updateHistory(pp: PingPong, prog: ProgramName, active: boolean) {
    if (!active) {
      pp.needsReset = true;
      return;
    }
    const gl = this.gl;
    const s = Math.min(1, HISTORY_MAX_W / this.videoSize.w);
    pp.ensureSize(Math.max(1, Math.round(this.videoSize.w * s)), Math.max(1, Math.round(this.videoSize.h * s)));
    const p = this.use(prog);
    gl.bindFramebuffer(gl.FRAMEBUFFER, pp.writeFbo());
    gl.viewport(0, 0, pp.w, pp.h);
    this.bindTex(p, "u_video", 0, this.videoTex);
    this.bindTex(p, "u_mask", 1, this.maskTex);
    this.bindTex(p, "u_prev", 2, pp.read());
    gl.uniform1f(this.u(p, "u_hasMask"), this.hasMask ? 1 : 0);
    gl.uniform1f(this.u(p, "u_reset"), pp.needsReset ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    pp.swap();
    pp.needsReset = false;
  }

  private ensureTarget(t: { tex: WebGLTexture; fbo: WebGLFramebuffer; w: number; h: number }, w: number, h: number) {
    if (t.w !== w || t.h !== h) {
      const gl = this.gl;
      gl.bindTexture(gl.TEXTURE_2D, t.tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t.tex, 0);
      t.w = w;
      t.h = h;
    }
    return t;
  }

  private uploadR8(tex: WebGLTexture, data: Uint8Array, w: number, h: number) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, w, h, 0, gl.RED, gl.UNSIGNED_BYTE, data);
  }

  private use(name: ProgramName): Program {
    const p = this.programs[name];
    this.gl.useProgram(p.prog);
    return p;
  }

  private u(p: Program, name: string): WebGLUniformLocation | null {
    if (!p.loc.has(name)) p.loc.set(name, this.gl.getUniformLocation(p.prog, name));
    return p.loc.get(name)!;
  }

  private bindTex(p: Program, name: string, unit: number, tex: WebGLTexture) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(this.u(p, name), unit);
  }

  private resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.floor(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }
}

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

function makeTex(gl: WebGL2RenderingContext, mipmapped = false): WebGLTexture {
  const t = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mipmapped ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
  if (mipmapped) gl.generateMipmap(gl.TEXTURE_2D);
  return t;
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s);
    gl.deleteShader(s);
    throw new Error(log ?? "compile failed");
  }
  return s;
}

function link(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const p = gl.createProgram()!;
  const v = compile(gl, gl.VERTEX_SHADER, vs);
  const f = compile(gl, gl.FRAGMENT_SHADER, fs);
  gl.attachShader(p, v);
  gl.attachShader(p, f);
  gl.linkProgram(p);
  gl.deleteShader(v);
  gl.deleteShader(f);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? "link failed");
  return p;
}
