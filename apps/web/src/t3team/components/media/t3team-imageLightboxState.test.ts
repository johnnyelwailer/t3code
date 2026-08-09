import { describe, expect, it } from "vite-plus/test";

import {
  t3teamLightboxNextIndex,
  t3teamLightboxPrevIndex,
  t3teamLightboxReducer,
  type T3TeamLightboxState,
} from "./t3team-imageLightboxState";

describe("t3teamLightboxNextIndex / t3teamLightboxPrevIndex", () => {
  it("wraps forward past the last image to the first", () => {
    expect(t3teamLightboxNextIndex(0, 3)).toBe(1);
    expect(t3teamLightboxNextIndex(2, 3)).toBe(0);
  });

  it("wraps backward past the first image to the last", () => {
    expect(t3teamLightboxPrevIndex(1, 3)).toBe(0);
    expect(t3teamLightboxPrevIndex(0, 3)).toBe(2);
  });

  it("is a no-op for a single-image gallery", () => {
    expect(t3teamLightboxNextIndex(0, 1)).toBe(0);
    expect(t3teamLightboxPrevIndex(0, 1)).toBe(0);
  });

  it("never throws or goes negative for an empty gallery", () => {
    expect(t3teamLightboxNextIndex(0, 0)).toBe(0);
    expect(t3teamLightboxPrevIndex(0, 0)).toBe(0);
  });
});

describe("t3teamLightboxReducer", () => {
  const closed: T3TeamLightboxState = { index: undefined };

  it("opens at the given index", () => {
    expect(t3teamLightboxReducer(closed, { type: "open", index: 2 })).toEqual({ index: 2 });
  });

  it("closes back to undefined", () => {
    expect(t3teamLightboxReducer({ index: 2 }, { type: "close" })).toEqual({ index: undefined });
  });

  it("navigates next/prev with wrapping while open", () => {
    expect(t3teamLightboxReducer({ index: 2 }, { type: "next", total: 3 })).toEqual({ index: 0 });
    expect(t3teamLightboxReducer({ index: 0 }, { type: "prev", total: 3 })).toEqual({ index: 2 });
  });

  it("ignores next/prev while closed instead of opening at index 0", () => {
    expect(t3teamLightboxReducer(closed, { type: "next", total: 3 })).toEqual(closed);
    expect(t3teamLightboxReducer(closed, { type: "prev", total: 3 })).toEqual(closed);
  });
});
