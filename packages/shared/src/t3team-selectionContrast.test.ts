import { describe, expect, it } from "vite-plus/test";

import { contrastBetween, needsSolidSelection } from "./t3team-selectionContrast.ts";

const LIGHT_BACKDROPS = ["#faf9fb", "#ffffff", "#f5f3f6"];
const DARK_BACKDROPS = ["#17181c", "#1e2024", "#121316"];

describe("needsSolidSelection", () => {
  it.each([
    ["Signalblau", "#4c3cf6", LIGHT_BACKDROPS, false],
    ["Orange", "#f05a0a", LIGHT_BACKDROPS, false],
    ["Signalblau", "#4c3cf6", DARK_BACKDROPS, false],
    ["Orange", "#f05a0a", DARK_BACKDROPS, false],
    ["Lila", "#e5e0ff", DARK_BACKDROPS, false],
    ["Lila", "#e5e0ff", LIGHT_BACKDROPS, true],
  ])("%s on %j: solid is %s", (_name, accent, backdrops, solid) => {
    expect(needsSolidSelection(accent, backdrops)).toBe(solid);
  });

  it("reads rgb() backdrops the phone variables use", () => {
    expect(needsSolidSelection("#e5e0ff", ["rgba(250, 249, 251, 1)"])).toBe(true);
  });

  it("leaves a colour it cannot read alone", () => {
    expect(needsSolidSelection("oklch(0.9 0.02 290)", LIGHT_BACKDROPS)).toBe(false);
  });
});

describe("solid selection", () => {
  it("keeps Lila's dark text and dark border readable on the light surfaces", () => {
    const lila: [number, number, number] = [229, 224, 255];
    const ink: [number, number, number] = [28, 27, 33];
    expect(contrastBetween(ink, lila)).toBeGreaterThanOrEqual(4.5);
    expect(contrastBetween(ink, [250, 249, 251])).toBeGreaterThanOrEqual(3);
  });
});
