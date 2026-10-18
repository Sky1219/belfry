// Fullscreen triangle — no vertex buffer needed.
export const VERT = /* glsl */ `#version 300 es
out vec2 v_uv;
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  v_uv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

// Single post-processing pass:
//   background -> desaturated blue + Sobel edge outlines
//   person     -> glowing "x-ray" fill with a bright rim from the mask gradient
//   activation -> radial pulse that sweeps detective mode on/off
export const FRAG = /* glsl */ `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 outColor;

uniform sampler2D u_video;
uniform sampler2D u_mask;      // person confidence, 0..1 in .r
uniform vec2  u_texel;         // 1 / video size
uniform float u_time;
uniform float u_pulse;         // 0 = off, 1 = fully on
uniform float u_mirror;        // 1 = mirror horizontally
uniform float u_hasMask;

const vec3 BLUE  = vec3(0.10, 0.32, 0.70);
const vec3 CYAN  = vec3(0.35, 0.85, 1.00);
const vec3 XRAY  = vec3(0.45, 0.80, 1.00);

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
float L(vec2 uv)   { return luma(texture(u_video, uv).rgb); }
float M(vec2 uv)   { return texture(u_mask, uv).r * u_hasMask; }

float sobel(vec2 uv) {
  vec2 t = u_texel;
  float tl = L(uv + t * vec2(-1, -1)), tc = L(uv + t * vec2(0, -1)), tr = L(uv + t * vec2(1, -1));
  float ml = L(uv + t * vec2(-1,  0)),                                mr = L(uv + t * vec2(1,  0));
  float bl = L(uv + t * vec2(-1,  1)), bc = L(uv + t * vec2(0,  1)), br = L(uv + t * vec2(1,  1));
  float gx = -tl - 2.0 * ml - bl + tr + 2.0 * mr + br;
  float gy = -tl - 2.0 * tc - tr + bl + 2.0 * bc + br;
  return length(vec2(gx, gy));
}

// Blurred mask + its gradient magnitude (used for the silhouette rim).
vec2 maskAndRim(vec2 uv) {
  vec2 t = u_texel * 3.0;
  float c = M(uv);
  float l = M(uv - vec2(t.x, 0.0)), r = M(uv + vec2(t.x, 0.0));
  float u = M(uv - vec2(0.0, t.y)), d = M(uv + vec2(0.0, t.y));
  float soft = (c * 2.0 + l + r + u + d) / 6.0;
  float rim  = length(vec2(r - l, d - u));
  return vec2(soft, rim);
}

void main() {
  vec2 uv = vec2(v_uv.x, 1.0 - v_uv.y);
  if (u_mirror > 0.5) uv.x = 1.0 - uv.x;

  vec3 src = texture(u_video, uv).rgb;
  float lum = luma(src);

  // --- background: dark blue world with glowing outlines
  float edge = smoothstep(0.12, 0.5, sobel(uv));
  vec3 bg = BLUE * (0.12 + lum * 0.55) + CYAN * edge * 0.55;

  // --- people: x-ray silhouette
  vec2 mr = maskAndRim(uv);
  float person = smoothstep(0.35, 0.75, mr.x);
  float rim = clamp(mr.y * 2.5, 0.0, 1.0);
  float shimmer = 0.85 + 0.15 * sin(u_time * 3.0 + uv.y * 60.0);
  vec3 body = XRAY * (0.35 + lum * 0.45) * shimmer + CYAN * edge * 0.8;
  vec3 col = mix(bg, body, person) + CYAN * rim * 1.4;

  // --- screen treatment: scanlines + vignette + faint noise
  float scan = 0.92 + 0.08 * sin(v_uv.y * 900.0);
  vec2 q = v_uv - 0.5;
  float vig = smoothstep(0.85, 0.25, length(q * vec2(1.1, 1.0)));
  float n = fract(sin(dot(v_uv * (u_time + 1.0), vec2(12.9898, 78.233))) * 43758.5453);
  col = col * scan * vig + (n - 0.5) * 0.03;

  // --- activation pulse: detective mode spreads out from the center
  float dist = length(q * vec2(1.6, 1.0));
  float radius = u_pulse * 1.2;
  float inside = 1.0 - smoothstep(radius - 0.02, radius, dist);
  float ring = exp(-pow((dist - radius) * 28.0, 2.0)) * step(0.001, u_pulse) * step(u_pulse, 0.999);
  vec3 outc = mix(src, col, inside) + CYAN * ring * 1.5;

  outColor = vec4(outc, 1.0);
}`;
