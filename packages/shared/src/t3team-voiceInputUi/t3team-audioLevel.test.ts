import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { startVoiceBars } from "./t3team-audioLevel.ts";
import { frameFromClock } from "./t3team-waveform.ts";

function stubRaf(steps: number): { raf: () => void; cancelCount: () => number } {
  let queue: Array<() => void> = [];
  vi.stubGlobal("requestAnimationFrame", (cb: () => void) => {
    queue = [cb];
    return 1;
  });
  let cancelled = 0;
  vi.stubGlobal("cancelAnimationFrame", () => {
    cancelled += 1;
    queue = [];
  });
  return {
    raf: () => {
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

describe("startVoiceBars (CSS-first)", () => {
  it("regression: the clock must be a wrapper — detached performance.now throws 'Illegal invocation' and kills the rAF loop on frame 1", () => {
    const detached = performance.now;
    expect(() => detached()).toThrow();
    expect(() => performance.now()).not.toThrow();
  });

  it("animates frames without throwing when the clock is a plain arrow (regression: detached performance.now threw 'Illegal invocation' and killed the loop)", () => {
    const bars: Array<{ style: Record<string, string> }> = [];
    for (let i = 0; i < 6; i++) bars.push({ style: {} });
    const raf = stubRaf(5);
    const stop = startVoiceBars({
      audioContext: null,
      bars: () => bars as never,
      clock: () => 1234,
      cssFrame: () => frameFromClock(1234, 6),
    });
    for (let i = 0; i < 5; i++) raf.raf();
    for (const bar of bars) {
      expect(parseFloat(bar.style.height ?? "0")).toBeGreaterThan(0);
    }
    stop();
    expect(raf.cancelCount()).toBe(1);
  });

  it("keeps the CSS loop running when no audio context is available", () => {
    const heights: number[] = [];
    const raf = stubRaf(3);
    const stop = startVoiceBars({
      audioContext: null,
      bars: () =>
        [0, 1, 2, 3, 4, 5].map(() => ({
          style: { height: "" },
        })) as never,
      clock: () => 999,
      cssFrame: () => frameFromClock(999, 6),
      onEnergy: (level) => heights.push(level),
    });
    for (let i = 0; i < 3; i++) raf.raf();
    expect(heights).toHaveLength(3);
    stop();
  });
});

function stubMicrophone(): {
  tracks: Array<{ stop: ReturnType<typeof vi.fn> }>;
  grant: () => void;
  audioContext: AudioContext;
} {
  const tracks = [{ stop: vi.fn() }, { stop: vi.fn() }];
  let grant: () => void = () => {};
  const pending = new Promise<{ getTracks: () => typeof tracks }>((resolve) => {
    grant = () => resolve({ getTracks: () => tracks });
  });
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: () => pending } });
  const audioContext = {
    state: "running",
    createMediaStreamSource: () => ({ connect: () => {}, disconnect: () => {} }),
    createAnalyser: () => ({ fftSize: 0, getByteTimeDomainData: () => {} }),
  } as unknown as AudioContext;
  return { tracks, grant, audioContext };
}

function startBarsWithMic(audioContext: AudioContext): {
  stop: () => void;
  analyserActive: Promise<void>;
} {
  stubRaf(0);
  let markActive: () => void = () => {};
  const analyserActive = new Promise<void>((resolve) => {
    markActive = resolve;
  });
  const stop = startVoiceBars({
    audioContext,
    bars: () => ({}),
    clock: () => 0,
    cssFrame: () => frameFromClock(0, 6),
    onAudioActive: markActive,
  });
  return { stop, analyserActive };
}

describe("startVoiceBars microphone release", () => {
  it("stops every microphone track when the recording stops", async () => {
    const mic = stubMicrophone();
    const bars = startBarsWithMic(mic.audioContext);
    mic.grant();
    await bars.analyserActive;

    bars.stop();

    for (const track of mic.tracks) expect(track.stop).toHaveBeenCalledTimes(1);
  });

  it("frees a microphone that was granted after the recording already stopped", async () => {
    const mic = stubMicrophone();
    const bars = startBarsWithMic(mic.audioContext);

    bars.stop();
    mic.grant();

    await vi.waitFor(() => {
      for (const track of mic.tracks) expect(track.stop).toHaveBeenCalledTimes(1);
    });
  });
});
