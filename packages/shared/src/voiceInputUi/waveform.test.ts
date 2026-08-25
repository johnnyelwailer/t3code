import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  animateBars,
  frameFromAudioLevel,
  frameFromClock,
  resetBars,
  type WaveformBars,
} from "./waveform.ts";

function makeBars(count: number): WaveformBars {
  const entries: Array<[number, HTMLSpanElement]> = Array.from({ length: count }, (_, i) => [
    i,
    { style: {} as CSSStyleDeclaration } as unknown as HTMLSpanElement,
  ]);
  return Object.fromEntries(entries) as unknown as WaveformBars;
}

/** rAF stub that records callbacks so tests can step frames manually. */
function stubRaf(): { step: () => void; cancelCount: () => number } {
  let queue: Array<() => void> = [];
  vi.stubGlobal("requestAnimationFrame", (cb: () => void) => {
    queue = [cb];
    return queue.length;
  });
  let cancelled = 0;
  vi.stubGlobal("cancelAnimationFrame", () => {
    cancelled += 1;
    queue = [];
  });
  return {
    step: () => {
      const [cb] = queue;
      queue = [];
      cb?.();
    },
    cancelCount: () => cancelled,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("frameFromAudioLevel", () => {
  it("reports a normalized level from sample energy", () => {
    const silence = new Uint8Array(64).fill(128);
    expect(frameFromAudioLevel(silence, 6).level).toBeCloseTo(0, 5);

    const loud = new Uint8Array(64);
    loud.fill(0, 0, 32);
    loud.fill(255, 32, 64);
    expect(frameFromAudioLevel(loud, 6).level).toBeGreaterThan(0.5);
  });

  it("clamps the level to 0..1", () => {
    const max = new Uint8Array(64).fill(0);
    expect(frameFromAudioLevel(max, 6).level).toBeLessThanOrEqual(1);
    expect(frameFromAudioLevel(max, 6).level).toBeGreaterThan(0);
  });
});

describe("frameFromClock", () => {
  it("produces a deterministic, small level without energy", () => {
    const a = frameFromClock(1234, 6);
    const b = frameFromClock(1234, 6);
    expect(a.level).toBe(b.level);
    expect(a.level).toBeGreaterThanOrEqual(0);
    expect(a.level).toBeLessThan(0.15);
  });
});

describe("animateBars", () => {
  it("always keeps the bars alive with the idle drift, even at level 0", () => {
    const bars = makeBars(6);
    const raf = stubRaf();
    const stop = animateBars({
      bars: () => bars,
      barCount: 6,
      clock: () => 1000,
      frame: () => ({ level: 0 }),
    });
    raf.step();
    for (let i = 0; i < 6; i++) {
      const px = parseFloat(bars[i]!.style.height);
      expect(px).toBeGreaterThan(3.0); // idle drift on top of the base
    }
    stop();
  });

  it("reports the raw level per frame and stops the loop", () => {
    const bars = makeBars(6);
    const raf = stubRaf();
    const levels: number[] = [];
    const stop = animateBars({
      bars: () => bars,
      barCount: 6,
      clock: () => 1000,
      frame: () => ({ level: 0.42 }),
      onEnergy: (level) => levels.push(level),
    });
    raf.step();
    expect(levels).toEqual([0.42]);
    stop();
    expect(raf.cancelCount()).toBe(1);
  });

  it("stops the loop and reports when the frame throws", () => {
    const raf = stubRaf();
    const errors: unknown[] = [];
    const stop = animateBars({
      bars: () => makeBars(6),
      barCount: 6,
      clock: () => 1000,
      frame: () => {
        throw new Error("boom");
      },
      onFrameError: (error) => errors.push(error),
    });
    raf.step();
    expect(errors).toHaveLength(1);
    expect(raf.cancelCount()).toBe(1);
    stop();
  });
});

describe("resetBars", () => {
  it("sets every bar to the resting height and skips missing elements", () => {
    const bars: WaveformBars = {
      0: makeBars(1)[0]!,
      2: makeBars(1)[0]!,
    };
    bars[0]!.style.height = "18px";
    bars[2]!.style.height = "18px";
    resetBars(bars, 3);
    expect(bars[0]!.style.height).toBe("3.2px");
    expect(bars[2]!.style.height).toBe("3.2px");
  });
});
