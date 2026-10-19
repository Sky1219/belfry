/**
 * History update passes. Each writes into one ping-pong buffer stored in image
 * space (row 0 = top of the image), reading its previous contents.
 * Run only when a new camera frame arrives.
 */
const HEAD = /* glsl */ `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_video;
uniform sampler2D u_mask;
uniform sampler2D u_prev;
uniform float u_hasMask;
uniform float u_reset;
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
`;

/** Night vision: exponential accumulation, alpha = 0.25 (1.0 on reset). */
export const NIGHT_ACCUM = HEAD + /* glsl */ `
void main() {
  vec3 cur = texture(u_video, v_uv).rgb;
  vec3 prev = texture(u_prev, v_uv).rgb;
  float a = u_reset > 0.5 ? 1.0 : 0.25;
  outColor = vec4(mix(prev, cur, a), 1.0);
}`;

/** Motion: .r = heat (decays 0.92/frame, set where |Δluma| > 0.06), .g = previous luma. */
export const MOTION_HISTORY = HEAD + /* glsl */ `
void main() {
  float l = luma(texture(u_video, v_uv).rgb);
  vec4 prev = texture(u_prev, v_uv);
  float moved = u_reset > 0.5 ? 0.0 : step(0.06, abs(l - prev.g));
  float heat = max(prev.r * 0.92, moved);
  outColor = vec4(u_reset > 0.5 ? 0.0 : heat, l, 0.0, 1.0);
}`;

/** Ghost trails: .r = max(prev * 0.9, person mask). */
export const GHOST_HISTORY = HEAD + /* glsl */ `
void main() {
  float m = texture(u_mask, v_uv).r * u_hasMask;
  float prev = u_reset > 0.5 ? 0.0 : texture(u_prev, v_uv).r;
  outColor = vec4(max(prev * 0.9, m), 0.0, 0.0, 1.0);
}`;

/** Transition: blends two rendered modes with an expanding radial pulse ring. */
export const COMPOSITE = /* glsl */ `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_from;
uniform sampler2D u_to;
uniform float u_t;
void main() {
  vec2 q = v_uv - 0.5;
  float dist = length(q * vec2(1.6, 1.0));
  float radius = u_t * 1.2;
  float inside = 1.0 - smoothstep(radius - 0.02, radius, dist);
  float ring = exp(-pow((dist - radius) * 28.0, 2.0));
  vec3 col = mix(texture(u_from, v_uv).rgb, texture(u_to, v_uv).rgb, inside);
  outColor = vec4(col + vec3(1.0, 0.27, 0.20) * ring * 1.5, 1.0);
}`;
