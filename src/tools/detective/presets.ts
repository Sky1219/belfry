export type ModelName = "segmentation" | "face" | "pose" | "detection" | "depth";
export type VisionMode = "detective" | "thermal" | "night" | "motion" | "normal";
export type Overlay = "xray" | "skeleton" | "evidence" | "vitals" | "depthFog" | "ghostTrails";
export type HudDensity = "full" | "minimal" | "off";
export type ThermalPalette = "ironbow" | "white-hot" | "black-hot";

export const VISION_MODES: Array<{ id: VisionMode; label: string }> = [
  { id: "detective", label: "Detective" },
  { id: "thermal", label: "Thermal" },
  { id: "night", label: "Night vision" },
  { id: "motion", label: "Motion" },
  { id: "normal", label: "Normal" },
];

export const OVERLAYS: Array<{ id: Overlay; label: string }> = [
  { id: "xray", label: "X-ray" },
  { id: "skeleton", label: "Skeleton" },
  { id: "evidence", label: "Evidence" },
  { id: "vitals", label: "Vitals" },
  { id: "depthFog", label: "Depth fog" },
  { id: "ghostTrails", label: "Ghost trails" },
];

export const PALETTES: ThermalPalette[] = ["ironbow", "white-hot", "black-hot"];
export const HUD_DENSITIES: HudDensity[] = ["full", "minimal", "off"];

export interface PresetDef {
  id: string;
  name: string;
  mode: VisionMode;
  overlays: Overlay[];
  palette: ThermalPalette;
  hud: HudDensity;
}

export const BUILTIN_PRESETS: PresetDef[] = [
  { id: "investigate", name: "Investigate", mode: "detective", overlays: ["xray", "evidence", "depthFog"], palette: "ironbow", hud: "full" },
  { id: "interrogation", name: "Interrogation", mode: "normal", overlays: ["vitals", "skeleton"], palette: "ironbow", hud: "full" },
  { id: "stakeout", name: "Stakeout", mode: "night", overlays: ["evidence", "ghostTrails"], palette: "ironbow", hud: "full" },
  { id: "heat", name: "Heat", mode: "thermal", overlays: ["vitals"], palette: "ironbow", hud: "full" },
];

/**
 * The models a mode + overlay combination needs. Detection is always needed
 * while the tool is open because scanning depends on it.
 */
export function requiredModels(mode: VisionMode, overlays: Set<Overlay>, depthEnabled: boolean): Set<ModelName> {
  const need = new Set<ModelName>(["detection"]);
  if (overlays.has("xray") || overlays.has("ghostTrails") || mode === "thermal") need.add("segmentation");
  if (overlays.has("vitals") || mode === "thermal") need.add("face");
  if (overlays.has("skeleton")) need.add("pose");
  if (depthEnabled && (overlays.has("depthFog") || mode === "thermal")) need.add("depth");
  return need;
}

export interface DetectiveSettings {
  defaultPresetId: string;
  customPresets: PresetDef[];
  depthEnabled: boolean;
}

export const DETECTIVE_TOOL_ID = "detective-vision";

export function defaultDetectiveSettings(): DetectiveSettings {
  return {
    defaultPresetId: "investigate",
    customPresets: [],
    depthEnabled: typeof navigator !== "undefined" && "gpu" in navigator,
  };
}
