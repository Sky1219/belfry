/**
 * Which confidence mask is the person. MediaPipe's selfie segmenter outputs
 * two categories — background at index 0, person at index 1 — so we look for a
 * label naming the person and otherwise assume that order.
 */
export function personMaskIndex(labels: string[], maskCount: number): number {
  const i = labels.findIndex((l) => /person|selfie|human|foreground/i.test(l));
  if (i >= 0 && i < maskCount) return i;
  return maskCount >= 2 ? 1 : 0;
}
