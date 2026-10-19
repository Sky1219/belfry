import { COMMON } from "./common";

/** Detective: a cold grayscale surveillance grade with bone edge lines. */
export const DETECTIVE = COMMON + /* glsl */ `
void main() {
  vec2 uv = srcUv();
  float lum = L(uv);
  float edge = smoothstep(0.12, 0.5, sobel(uv));
  vec3 col = vec3(0.035, 0.04, 0.045) + vec3(0.50, 0.51, 0.53) * lum * lum + LINE * edge * 0.6;
  col = applyOverlays(col, uv, edge);
  outColor = vec4(screenTreatment(col, 1.0), 1.0);
}`;

/** Normal: the camera as-is, with overlays. */
export const NORMAL = COMMON + /* glsl */ `
void main() {
  vec2 uv = srcUv();
  float edge = smoothstep(0.12, 0.5, sobel(uv));
  vec3 col = applyOverlays(video(uv), uv, edge);
  outColor = vec4(col, 1.0);
}`;

/**
 * Thermal: synthetic heat built from model outputs, not raw brightness.
 * People (segmentation) read warm, the face reads hottest and pulses with the
 * measured heartbeat, and the background cools with distance when depth exists.
 */
export const THERMAL = COMMON + /* glsl */ `
void main() {
  vec2 uv = srcUv();
  float lum = L(uv);
  float near = u_hasDepth > 0.5 ? depthAt(uv) : 0.5;
  float heat = (0.10 + lum * 0.22) * mix(0.55, 1.15, near);
  if (u_hasMask > 0.5) {
    vec2 mr = maskAndRim(uv);
    float person = smoothstep(0.3, 0.8, mr.x);
    heat = mix(heat, 0.58 + lum * 0.18, person);
  }
  float face = faceMask(uv);
  heat = mix(heat, 0.90 * (0.85 + 0.15 * u_pulse), face);
  float edge = smoothstep(0.12, 0.5, sobel(uv));
  vec3 col = palette(heat);
  // keep x-ray/fog/ghost/evidence readable over the palette
  col = applyOverlays(col, uv, edge * 0.5);
  outColor = vec4(screenTreatment(col, 0.6), 1.0);
}`;

/**
 * Night vision: reads the temporally denoised accumulation buffer, applies
 * automatic gain (mean luma from the buffer's smallest mip) and gamma, then a
 * green phosphor tint, grain and bloom around bright points.
 */
export const NIGHT = COMMON + /* glsl */ `
void main() {
  vec2 uv = srcUv();
  vec3 acc = texture(u_hist, uv).rgb;
  float mean = luma(textureLod(u_hist, vec2(0.5), 12.0).rgb);
  float gain = clamp(0.45 / max(mean, 0.02), 1.0, 8.0);
  float lum = pow(clamp(luma(acc) * gain, 0.0, 1.0), 0.8);
  // bloom: 9-tap blur of the over-bright parts
  float bloom = 0.0;
  vec2 r = u_texel * 6.0;
  for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) {
    float b = luma(texture(u_hist, uv + vec2(float(i), float(j)) * r).rgb) * gain;
    bloom += max(b - 0.8, 0.0);
  }
  bloom /= 9.0;
  float grain = (hash(uv * 900.0 + u_time * 13.0) - 0.5) * 0.12;
  vec3 col = vec3(0.22, 1.0, 0.38) * (lum + grain) + vec3(0.6, 1.0, 0.7) * bloom * 1.5;
  float edge = smoothstep(0.12, 0.5, sobel(uv));
  col = applyOverlays(col, uv, edge);
  vec2 q = v_uv - 0.5;
  col *= smoothstep(0.78, 0.35, length(q * vec2(1.25, 1.0)));
  outColor = vec4(col, 1.0);
}`;

/** Motion: only change is visible, as heat that fades slowly. */
export const MOTION = COMMON + /* glsl */ `
void main() {
  vec2 uv = srcUv();
  float heat = texture(u_hist, uv).r;
  float edge = smoothstep(0.12, 0.5, sobel(uv));
  vec3 base = vec3(0.04, 0.07, 0.10) + vec3(0.10, 0.14, 0.18) * L(uv) + LINE * edge * 0.08;
  vec3 col = mix(base, ironbow(0.35 + heat * 0.65), smoothstep(0.02, 0.25, heat));
  col = applyOverlays(col, uv, edge);
  outColor = vec4(screenTreatment(col, 0.7), 1.0);
}`;

export const MODE_SOURCES = {
  detective: DETECTIVE,
  normal: NORMAL,
  thermal: THERMAL,
  night: NIGHT,
  motion: MOTION,
} as const;
