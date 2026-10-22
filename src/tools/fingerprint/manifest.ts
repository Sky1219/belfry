import type { ToolManifest } from "../types";

export const fingerprintManifest: ToolManifest = {
  id: "fingerprint-lab",
  name: "Fingerprint lab",
  shortName: "Fingerprint",
  blurb: "Ridge enhancement, minutiae and a match score for two prints",
  icon: "fingerprint",
  accepts: ["image"],
  demo: { label: "Run the demo prints" },
  load: () => import("./FingerprintView").then((m) => m.FingerprintView),
};
