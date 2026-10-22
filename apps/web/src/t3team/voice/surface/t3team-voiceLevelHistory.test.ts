import { describe, expect, it } from "vite-plus/test";

import { VoiceLevelHistory } from "./t3team-voiceLevelHistory";

describe("VoiceLevelHistory", () => {
  it("rises faster than it falls", () => {
    const rising = new VoiceLevelHistory();
    rising.step(1, 0.05);
    const falling = new VoiceLevelHistory();
    for (let i = 0; i < 40; i++) falling.step(1, 0.05);
    const peak = falling.current;
    falling.step(0, 0.05);
    expect(rising.current).toBeGreaterThan(0.7);
    expect(peak - falling.current).toBeLessThan(rising.current);
  });

  it("clamps loudness outside 0-1", () => {
    const history = new VoiceLevelHistory();
    for (let i = 0; i < 100; i++) history.step(5, 0.05);
    expect(history.current).toBeLessThanOrEqual(1);
    for (let i = 0; i < 200; i++) history.step(-5, 0.05);
    expect(history.current).toBeGreaterThanOrEqual(0);
  });

  it("reads the recent past oldest to newest", () => {
    const history = new VoiceLevelHistory(8);
    for (let i = 0; i < 8; i++) history.step(i < 4 ? 0 : 1, 10);
    expect(history.at(0)).toBeCloseTo(0, 2);
    expect(history.at(1)).toBeCloseTo(1, 2);
    expect(history.at(0.5)).toBeGreaterThan(history.at(0));
    expect(history.at(0.5)).toBeLessThan(history.at(1));
  });
});
