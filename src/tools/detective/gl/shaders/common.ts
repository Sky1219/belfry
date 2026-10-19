/** Fullscreen triangle; v_uv is (0,0) bottom-left … (1,1) top-right of the target. */
export const VERT = /* glsl */ `#version 300 es
out vec2 v_uv;
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  v_uv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

export const MAX_BOXES = 8;

/**
 * Shared header for every vision-mode program: uniforms, sampling helpers and
 * the per-pixel overlays (x-ray, depth fog, ghost trails, evidence tint) that
 * work in every mode. All image-space textures use a top-left origin.
 */
export const COMMON = /* glsl */ `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;

uniform sampler2D u_video;
uniform sampler2D u_mask;      // person confidence in .r
uniform sampler2D u_depthA;    // previous depth (bright = near)
uniform sampler2D u_depthB;    // current depth
uniform sampler2D u_hist;      // mode history (night accumulation / motion heat)
uniform sampler2D u_ghost;     // person-mask history in .r
uniform float u_depthMix;
uniform vec2 u_texel;          // 1 / video size
uniform vec2 u_uvScale;
uniform vec2 u_uvOffset;
uniform float u_mirror;
uniform float u_time;
uniform float u_hasMask;
uniform float u_hasDepth;
uniform float u_hasFace;
uniform vec4 u_face;           // x0, y0, x1, y1 (normalized, image space)
uniform float u_pulse;         // 0..1 heartbeat phase intensity
uniform vec4 u_boxes[${MAX_BOXES}];
uniform int u_boxCount;
uniform int u_palette;         // 0 ironbow, 1 white-hot, 2 black-hot
uniform float u_xray;
uniform float u_xrayFill;     // how strongly x-ray replaces the mode's own look (thermal keeps its heat)
uniform float u_fog;
uniform float u_ghostOn;
uniform float u_evidence;

// Line work (bone) and signal red, the same pair the HUD uses.
const vec3 LINE = vec3(0.93, 0.90, 0.86);
const vec3 SIGNAL = vec3(1.0, 0.27, 0.20);
const vec3 ORANGE = vec3(1.0, 0.655, 0.2); // #ffa733, the HUD's amber

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

/** Screen (top-left origin) → image uv. */
vec2 srcUv() {
  vec2 s = vec2(v_uv.x, 1.0 - v_uv.y);
  vec2 uv = s * u_uvScale + u_uvOffset;
  if (u_mirror > 0.5) uv.x = 1.0 - uv.x;
  return uv;
}

vec3 video(vec2 uv) { return texture(u_video, uv).rgb; }
float L(vec2 uv) { return luma(video(uv)); }
float maskAt(vec2 uv) { return texture(u_mask, uv).r * u_hasMask; }
float depthAt(vec2 uv) { return mix(texture(u_depthA, uv).r, texture(u_depthB, uv).r, u_depthMix); }

float sobel(vec2 uv) {
  vec2 t = u_texel;
  float tl = L(uv + t * vec2(-1, -1)), tc = L(uv + t * vec2(0, -1)), tr = L(uv + t * vec2(1, -1));
  float ml = L(uv + t * vec2(-1, 0)), mr = L(uv + t * vec2(1, 0));
  float bl = L(uv + t * vec2(-1, 1)), bc = L(uv + t * vec2(0, 1)), br = L(uv + t * vec2(1, 1));
  float gx = -tl - 2.0 * ml - bl + tr + 2.0 * mr + br;
  float gy = -tl - 2.0 * tc - tr + bl + 2.0 * bc + br;
  return length(vec2(gx, gy));
}

/** Soft person mask and the magnitude of its gradient (for a glowing rim). */
vec2 maskAndRim(vec2 uv) {
  vec2 t = u_texel * 3.0;
  float c = maskAt(uv);
  float l = maskAt(uv - vec2(t.x, 0.0)), r = maskAt(uv + vec2(t.x, 0.0));
  float u = maskAt(uv - vec2(0.0, t.y)), d = maskAt(uv + vec2(0.0, t.y));
  return vec2((c * 2.0 + l + r + u + d) / 6.0, length(vec2(r - l, d - u)));
}

/** 1 inside any evidence box (soft-edged), 0 outside. */
float inBoxes(vec2 uv) {
  float m = 0.0;
  for (int i = 0; i < ${MAX_BOXES}; i++) {
    if (i >= u_boxCount) break;
    vec4 b = u_boxes[i];
    vec2 lo = smoothstep(b.xy - 0.004, b.xy + 0.004, uv);
    vec2 hi = 1.0 - smoothstep(b.zw - 0.004, b.zw + 0.004, uv);
    m = max(m, lo.x * lo.y * hi.x * hi.y);
  }
  return m;
}

/** Soft ellipse over the face box. */
float faceMask(vec2 uv) {
  if (u_hasFace < 0.5) return 0.0;
  vec2 c = (u_face.xy + u_face.zw) * 0.5;
  vec2 r = max((u_face.zw - u_face.xy) * vec2(0.55, 0.62), vec2(1e-3));
  float d = length((uv - c) / r);
  return 1.0 - smoothstep(0.75, 1.0, d);
}

vec3 ironbow(float t) {
  t = clamp(t, 0.0, 1.0);
  vec3 c0 = vec3(0.0, 0.0, 0.05);
  vec3 c1 = vec3(0.25, 0.0, 0.45);
  vec3 c2 = vec3(0.80, 0.10, 0.35);
  vec3 c3 = vec3(1.0, 0.55, 0.0);
  vec3 c4 = vec3(1.0, 0.95, 0.65);
  if (t < 0.25) return mix(c0, c1, t / 0.25);
  if (t < 0.5) return mix(c1, c2, (t - 0.25) / 0.25);
  if (t < 0.78) return mix(c2, c3, (t - 0.5) / 0.28);
  return mix(c3, c4, (t - 0.78) / 0.22);
}

vec3 palette(float t) {
  if (u_palette == 1) return vec3(clamp(t, 0.0, 1.0));
  if (u_palette == 2) return vec3(1.0 - clamp(t, 0.0, 1.0));
  return ironbow(t);
}

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

/** Scanlines, vignette and faint grain shared by stylized modes. */
vec3 screenTreatment(vec3 col, float amount) {
  float scan = 1.0 - amount * 0.08 * (0.5 + 0.5 * sin(v_uv.y * 900.0));
  vec2 q = v_uv - 0.5;
  float vig = mix(1.0, smoothstep(0.85, 0.25, length(q * vec2(1.1, 1.0))), amount);
  float n = hash(v_uv * (u_time + 1.0)) - 0.5;
  return col * scan * vig + n * 0.03 * amount;
}

/** Per-pixel overlays common to every mode. */
vec3 applyOverlays(vec3 col, vec2 uv, float edge) {
  if (u_fog > 0.5 && u_hasDepth > 0.5) {
    float near = depthAt(uv);
    col *= mix(0.18, 1.0, smoothstep(0.15, 0.65, near));
  }
  if (u_ghostOn > 0.5) {
    float trail = clamp(texture(u_ghost, uv).r - maskAt(uv) * 1.2, 0.0, 1.0);
    col += LINE * trail * 0.45;
  }
  if (u_xray > 0.5 && u_hasMask > 0.5) {
    vec2 mr = maskAndRim(uv);
    float person = smoothstep(0.35, 0.75, mr.x);
    float shimmer = 0.85 + 0.15 * sin(u_time * 3.0 + uv.y * 60.0);
    vec3 body = SIGNAL * (0.28 + L(uv) * 0.45) * shimmer + SIGNAL * edge * 0.8;
    col = mix(col, body, person * u_xrayFill) + SIGNAL * clamp(mr.y * 2.5, 0.0, 1.0) * 1.3;
  }
  if (u_evidence > 0.5 && u_boxCount > 0) {
    float b = inBoxes(uv);
    col = mix(col, col * 0.6 + ORANGE * (0.12 + edge * 1.1), b);
  }
  return col;
}
`;
