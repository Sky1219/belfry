import type { ToolManifest } from "../types";
import { DETECTIVE_TOOL_ID } from "./presets";

export const detectiveManifest: ToolManifest = {
  id: DETECTIVE_TOOL_ID,
  name: "Detective Vision",
  blurb: "Forensic camera view: x-ray people, evidence highlighting, vitals, scanning",
  accepts: ["live-camera", "video"],
  load: () => import("./DetectiveView").then((m) => m.DetectiveView),
  loadSettingsSection: () => import("./DetectiveSettings").then((m) => m.DetectiveSettings),
};
