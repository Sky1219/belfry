import { describe, expect, test } from "vitest";
import { Tracker } from "../../src/tools/detective/features/tracker";
import type { Box, Detection } from "../../src/tools/detective/models/types";

const det = (label: string, box: Box, score = 0.8): Detection => ({ label, score, box });

describe("Tracker", () => {
  test("ignores person and non-evidence classes", () => {
    const t = new Tracker();
    const tracks = t.update([det("person", [0, 0, 0.5, 1]), det("dining table", [0, 0.5, 1, 1]), det("cup", [0.4, 0.4, 0.5, 0.5])], 0);
    expect(tracks.map((x) => x.label)).toEqual(["cup"]);
  });

  test("keeps the same id for a moving object", () => {
    const t = new Tracker();
    const [a] = t.update([det("cup", [0.4, 0.4, 0.5, 0.5])], 0);
    let ids = new Set([a.id]);
    for (let i = 1; i <= 10; i++) {
      const dx = i * 0.01;
      ids = new Set([...ids, ...t.update([det("cup", [0.4 + dx, 0.4, 0.5 + dx, 0.5])], i * 100).map((x) => x.id)]);
    }
    expect(ids.size).toBe(1);
  });

  test("smooths box jitter", () => {
    const t = new Tracker({ smoothing: 0.5 });
    t.update([det("cup", [0.4, 0.4, 0.5, 0.5])], 0);
    const [tr] = t.update([det("cup", [0.44, 0.4, 0.54, 0.5])], 100);
    expect(tr.box[0]).toBeCloseTo(0.42, 9); // halfway toward the new detection
    expect(tr.box[2]).toBeCloseTo(0.52, 9);
  });

  test("two same-class objects keep separate ids", () => {
    const t = new Tracker();
    const first = t.update([det("bottle", [0.1, 0.4, 0.2, 0.7]), det("bottle", [0.7, 0.4, 0.8, 0.7])], 0);
    // swap detection order; ids follow position, not order
    const second = t.update([det("bottle", [0.71, 0.4, 0.81, 0.7]), det("bottle", [0.11, 0.4, 0.21, 0.7])], 100);
    const idAt = (ts: typeof first, x: number) => ts.find((tr) => Math.abs(tr.box[0] - x) < 0.05)!.id;
    expect(idAt(second, 0.1)).toBe(idAt(first, 0.1));
    expect(idAt(second, 0.7)).toBe(idAt(first, 0.7));
    expect(idAt(first, 0.1)).not.toBe(idAt(first, 0.7));
  });

  test("drops a track after 500 ms unseen but not before", () => {
    const t = new Tracker({ dropAfterMs: 500 });
    t.update([det("keyboard", [0.2, 0.6, 0.6, 0.8])], 1000);
    expect(t.update([], 1200)).toHaveLength(1); // one miss
    expect(t.update([], 1400)).toHaveLength(1); // two misses, but only 400 ms unseen
    expect(t.tracks(1499)).toHaveLength(1);
    expect(t.tracks(1501)).toHaveLength(0);
  });

  test("keeps ids when the detector runs slower than the drop time", () => {
    // detector throttled to once every 1.1 s (slow machine); the same cup must keep its id
    const t = new Tracker({ dropAfterMs: 500 });
    const ids = new Set<number>();
    for (let k = 0; k < 6; k++) {
      const now = k * 1100;
      for (const tr of t.update([det("cup", [0.4, 0.4, 0.5, 0.5])], now)) ids.add(tr.id);
      expect(t.tracks(now + 1000)).toHaveLength(1); // still there just before the next run
    }
    expect(ids.size).toBe(1);
  });

  test("re-associates an object that moved more than its width between detector runs", () => {
    const t = new Tracker();
    const [a] = t.update([det("cell phone", [0.4, 0.4, 0.5, 0.5])], 0);
    const after = t.update([det("cell phone", [0.52, 0.42, 0.62, 0.52])], 1000); // no overlap, nearby
    expect(after).toHaveLength(1); // matched, not a second track
    expect(after[0].id).toBe(a.id);
    // but an object far away is a different object
    const far = t.update([det("cell phone", [0.53, 0.42, 0.63, 0.52]), det("cell phone", [0.05, 0.85, 0.12, 0.95])], 1100);
    expect(far).toHaveLength(2);
    expect(far.filter((x) => x.id === a.id)).toHaveLength(1);
  });

  test("tracks stay while no detector run happens (e.g. paused video)", () => {
    const t = new Tracker({ dropAfterMs: 500 });
    t.update([det("cup", [0.4, 0.4, 0.5, 0.5])], 0);
    expect(t.tracks(3100)).toHaveLength(1);
    expect(t.tracks(60_000)).toHaveLength(1);
    // once the detector runs again and misses it twice, it goes
    t.update([], 60_100);
    t.update([], 60_200);
    expect(t.tracks(60_300)).toHaveLength(0);
  });

  test("tags are EV-01, EV-02…", () => {
    const t = new Tracker();
    const tracks = t.update([det("cup", [0.1, 0.1, 0.2, 0.2]), det("book", [0.5, 0.5, 0.7, 0.7])], 0);
    expect(tracks.map((x) => x.tag).sort()).toEqual(["EV-01", "EV-02"]);
    const later = t.update([det("cell phone", [0.8, 0.1, 0.9, 0.3])], 2000);
    expect(later.find((x) => x.label === "cell phone")!.tag).toBe("EV-03");
  });
});
