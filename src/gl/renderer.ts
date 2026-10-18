import { VERT, FRAG } from "./shaders";

export interface FrameParams {
  time: number;
  pulse: number;
  mirror: boolean;
}

/** WebGL2 renderer: uploads the video frame + segmentation mask and runs the detective-vision pass. */
export class Renderer {
  private gl: WebGL2RenderingContext;
  private prog: WebGLProgram;
  private videoTex: WebGLTexture;
  private maskTex: WebGLTexture;
  private hasMask = false;
  private u: Record<string, WebGLUniformLocation | null> = {};

  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", { antialias: false, alpha: false });
    if (!gl) throw new Error("WebGL2 is not supported in this browser.");
    this.gl = gl;
    this.prog = link(gl, VERT, FRAG);
    this.videoTex = makeTex(gl);
    this.maskTex = makeTex(gl);
    for (const name of ["u_video", "u_mask", "u_texel", "u_time", "u_pulse", "u_mirror", "u_hasMask"]) {
      this.u[name] = gl.getUniformLocation(this.prog, name);
    }
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  }

  /** Upload a confidence mask (values 0..1). */
  setMask(data: Float32Array, width: number, height: number) {
    const gl = this.gl;
    const bytes = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i++) bytes[i] = data[i] * 255;
    gl.bindTexture(gl.TEXTURE_2D, this.maskTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, width, height, 0, gl.RED, gl.UNSIGNED_BYTE, bytes);
    this.hasMask = true;
  }

  draw(video: HTMLVideoElement, p: FrameParams) {
    const gl = this.gl;
    this.resize();

    gl.bindTexture(gl.TEXTURE_2D, this.videoTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);

    gl.useProgram(this.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.videoTex);
    gl.uniform1i(this.u.u_video, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.maskTex);
    gl.uniform1i(this.u.u_mask, 1);

    gl.uniform2f(this.u.u_texel, 1 / video.videoWidth, 1 / video.videoHeight);
    gl.uniform1f(this.u.u_time, p.time);
    gl.uniform1f(this.u.u_pulse, p.pulse);
    gl.uniform1f(this.u.u_mirror, p.mirror ? 1 : 0);
    gl.uniform1f(this.u.u_hasMask, this.hasMask ? 1 : 0);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private resize() {
    const dpr = Math.min(window.devicePixelRatio, 2);
    const w = Math.floor(this.canvas.clientWidth * dpr);
    const h = Math.floor(this.canvas.clientHeight * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.gl.viewport(0, 0, w, h);
  }
}

function makeTex(gl: WebGL2RenderingContext): WebGLTexture {
  const t = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  // 1x1 placeholder so sampling is valid before the first upload.
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
  return t;
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    throw new Error("Shader compile error:\n" + gl.getShaderInfoLog(s));
  }
  return s;
}

function link(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const p = gl.createProgram()!;
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error("Program link error:\n" + gl.getProgramInfoLog(p));
  }
  return p;
}
