/**
 * Tools on the roadmap that aren't built yet (README "Roadmap"). The board's
 * tools rack shows them as OFFLINE so visitors can see where the suite is going;
 * nothing here pretends to work.
 */
export interface PlannedTool {
  id: string;
  name: string;
  /** Which sub-project will build it. */
  phase: string;
}

export const PLANNED_TOOLS: PlannedTool[] = [
  { id: "photo-forensics", name: "Photo forensics", phase: "Image forensics" },
  { id: "signal-decoder", name: "Signal decoder", phase: "Audio" },
  { id: "enhance", name: "Enhance", phase: "Video" },
  { id: "watchtower", name: "Watchtower", phase: "Devices" },
];
