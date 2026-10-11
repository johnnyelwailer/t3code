import { describe, expect, it } from "vite-plus/test";

import {
  readHistoryIndex,
  resolveBackToChooseDelta,
  resolveCloseDelta,
  resolveCreateOriginIndex,
} from "./t3team-createProjectNavigation.logic";

describe("create-project navigation", () => {
  it("returns to the entry before the flow was opened", () => {
    expect(resolveCreateOriginIndex(4)).toBe(3);
  });

  it("has no origin when the flow was opened cold", () => {
    expect(resolveCreateOriginIndex(0)).toBeNull();
  });

  it("closes from the first screen with one step back", () => {
    expect(resolveCloseDelta({ originIndex: 3, currentIndex: 4 })).toBe(-1);
  });

  it("closes from the second screen with two steps back", () => {
    expect(resolveCloseDelta({ originIndex: 3, currentIndex: 5 })).toBe(-2);
  });

  it("falls back to replace when there is no origin or nothing behind", () => {
    expect(resolveCloseDelta({ originIndex: null, currentIndex: 0 })).toBeNull();
    expect(resolveCloseDelta({ originIndex: 3, currentIndex: 3 })).toBeNull();
  });

  it("treats a missing or broken history index as unknown, never as a distance", () => {
    expect(readHistoryIndex(3)).toBe(3);
    expect(readHistoryIndex(0)).toBe(0);
    for (const broken of [undefined, null, Number.NaN, -1, 1.5, "2"]) {
      expect(readHistoryIndex(broken)).toBeNull();
    }
    expect(resolveCreateOriginIndex(null)).toBeNull();
    expect(resolveCloseDelta({ originIndex: 3, currentIndex: null })).toBeNull();
    expect(resolveBackToChooseDelta({ chooseIndex: 4, currentIndex: null })).toBeNull();
  });

  it("goes back to a pushed choose screen, and replaces for a deep-linked set-up", () => {
    expect(resolveBackToChooseDelta({ chooseIndex: 4, currentIndex: 5 })).toBe(-1);
    expect(resolveBackToChooseDelta({ chooseIndex: null, currentIndex: 5 })).toBeNull();
    expect(resolveBackToChooseDelta({ chooseIndex: 5, currentIndex: 5 })).toBeNull();
  });
});
