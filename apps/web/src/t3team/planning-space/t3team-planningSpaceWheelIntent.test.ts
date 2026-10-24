import { describe, expect, it } from "vite-plus/test";

import {
  type WheelSample,
  classifyWheelDevice,
  createWheelClassifier,
  wheelIntent,
} from "./t3team-planningSpaceWheelIntent";

function s(p: Partial<WheelSample>): WheelSample {
  return {
    deltaX: 0,
    deltaY: 0,
    deltaMode: 0,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    timeStamp: 0,
    ...p,
  };
}

describe("classifyWheelDevice", () => {
  it("treats Windows Chrome wheel notches as mouse", () => {
    expect(classifyWheelDevice(s({ deltaY: 100, wheelDeltaY: -120 }))).toBe("mouse");
    expect(classifyWheelDevice(s({ deltaY: -200, wheelDeltaY: 240 }))).toBe("mouse");
  });
  it("treats 125% scaled notches as mouse", () => {
    expect(classifyWheelDevice(s({ deltaY: 125, wheelDeltaY: -150 }))).toBe("mouse");
  });
  it("treats Firefox line mode as mouse", () => {
    expect(classifyWheelDevice(s({ deltaY: 3, deltaMode: 1 }))).toBe("mouse");
  });
  it("treats fractional / diagonal / small deltas as trackpad", () => {
    expect(classifyWheelDevice(s({ deltaY: 4.5, wheelDeltaY: -13 }))).toBe("trackpad");
    expect(classifyWheelDevice(s({ deltaY: 12, deltaX: 3 }))).toBe("trackpad");
    expect(classifyWheelDevice(s({ deltaY: 6, wheelDeltaY: -18 }))).toBe("trackpad");
    expect(classifyWheelDevice(s({ deltaY: 1.3, ctrlKey: true }))).toBe("trackpad");
  });
  it("treats Shift+wheel moved onto deltaX as mouse", () => {
    expect(classifyWheelDevice(s({ deltaX: 100, wheelDeltaX: -120, shiftKey: true }))).toBe(
      "mouse",
    );
  });
});

describe("createWheelClassifier", () => {
  it("keeps a trackpad stream sticky across an integer-looking momentum event", () => {
    const c = createWheelClassifier();
    expect(c.device(s({ deltaY: 3.2, timeStamp: 0 }))).toBe("trackpad");
    expect(c.device(s({ deltaY: 60, timeStamp: 16 }))).toBe("trackpad");
  });
  it("lets a decisive notch override the stream", () => {
    const c = createWheelClassifier();
    c.device(s({ deltaY: 3.2, timeStamp: 0 }));
    expect(c.device(s({ deltaY: 100, wheelDeltaY: -120, timeStamp: 50 }))).toBe("mouse");
  });
});

describe("wheelIntent", () => {
  it("mouse wheel zooms, Shift pans x, Ctrl/Cmd pans y", () => {
    expect(wheelIntent(s({ deltaY: 100 }), "mouse")).toEqual({ kind: "zoom", delta: 400 });
    expect(wheelIntent(s({ deltaY: 100, shiftKey: true }), "mouse")).toEqual({
      kind: "pan",
      dx: -100,
      dy: 0,
    });
    expect(wheelIntent(s({ deltaX: 100, shiftKey: true }), "mouse")).toEqual({
      kind: "pan",
      dx: -100,
      dy: 0,
    });
    expect(wheelIntent(s({ deltaY: 100, ctrlKey: true }), "mouse")).toEqual({
      kind: "pan",
      dx: 0,
      dy: -100,
    });
    expect(wheelIntent(s({ deltaY: -100, metaKey: true }), "mouse")).toEqual({
      kind: "pan",
      dx: 0,
      dy: 100,
    });
  });
  it("normalizes line mode", () => {
    expect(wheelIntent(s({ deltaY: 3, deltaMode: 1 }), "mouse")).toEqual({
      kind: "zoom",
      delta: 480,
    });
  });
  it("trackpad scroll pans and pinch zooms", () => {
    expect(wheelIntent(s({ deltaX: 2, deltaY: 5 }), "trackpad")).toEqual({
      kind: "pan",
      dx: -2,
      dy: -5,
    });
    expect(wheelIntent(s({ deltaY: 2, ctrlKey: true }), "trackpad")).toEqual({
      kind: "zoom",
      delta: 28,
    });
  });
});
