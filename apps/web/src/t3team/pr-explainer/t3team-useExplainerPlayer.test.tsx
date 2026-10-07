// @vitest-environment jsdom

import { act, type KeyboardEvent } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { useExplainerPlayer, type ExplainerPlayerState } from "./t3team-useExplainerPlayer";

let root: Root;
let container: HTMLDivElement;
let reducedMotion = false;
let player: ExplainerPlayerState;

type Input = Parameters<typeof useExplainerPlayer>[0];

function Probe(props: Input) {
  player = useExplainerPlayer(props);
  return null;
}

const render = (props: Input) => act(() => root.render(<Probe {...props} />));
const tick = (ms: number) => act(() => vi.advanceTimersByTime(ms));
const key = (name: string, target: EventTarget = document.body) => {
  const event = {
    key: name,
    target,
    defaultPrevented: false,
    altKey: false,
    metaKey: false,
    ctrlKey: false,
    preventDefault: vi.fn(),
  } as unknown as KeyboardEvent<HTMLElement>;
  let moved = false;
  act(() => {
    moved = player.onKeyDown(event);
  });
  return moved;
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("reduce") ? reducedMotion : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  reducedMotion = false;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useExplainerPlayer", () => {
  it("advances on its own clock and stops at the end", async () => {
    await render({ stepCount: 3, autoPlay: true, stepMs: 1000 });
    tick(999);
    expect(player.index).toBe(0);
    tick(1);
    expect(player.index).toBe(1);
    tick(1000);
    tick(1000);
    expect([player.index, player.playing]).toEqual([2, false]);
  });

  it("runs faster at a higher speed", async () => {
    await render({ stepCount: 3, autoPlay: true, stepMs: 1000 });
    act(() => player.setSpeed(2));
    tick(500);
    expect(player.index).toBe(1);
  });

  it("holds for hover, focus and Ask, and resumes where it was", async () => {
    await render({ stepCount: 3, autoPlay: true, stepMs: 1000 });
    tick(600);
    for (const reason of ["hover", "focus", "ask"] as const) {
      act(() => player.hold(reason, true));
      tick(5000);
      expect([player.index, player.running]).toEqual([0, false]);
      act(() => player.hold(reason, false));
    }
    tick(399);
    expect(player.index).toBe(0);
    tick(1);
    expect(player.index).toBe(1);
  });

  it("stops counting off screen or in a hidden tab", async () => {
    await render({ stepCount: 3, autoPlay: true, stepMs: 1000, inView: false });
    tick(5000);
    expect(player.index).toBe(0);
    await render({ stepCount: 3, autoPlay: true, stepMs: 1000, inView: true });
    tick(1000);
    expect(player.index).toBe(1);
  });

  it("waits at the last step while steps stream in, then moves on", async () => {
    await render({ stepCount: 2, autoPlay: true, stepMs: 1000, streaming: true });
    tick(1000);
    // The last written step still gets its full time before the player waits.
    expect([player.index, player.waitingForStep]).toEqual([1, false]);
    tick(1000);
    expect([player.index, player.waitingForStep]).toEqual([1, true]);
    await render({ stepCount: 3, autoPlay: true, stepMs: 1000, streaming: true });
    tick(0);
    expect(player.index).toBe(2);
  });

  it("takes arrow keys, Home and End, and pauses", async () => {
    await render({ stepCount: 4, autoPlay: true, stepMs: 1000 });
    expect(key("ArrowRight")).toBe(true);
    expect([player.index, player.playing]).toEqual([1, false]);
    key("End");
    expect(player.index).toBe(3);
    key("Home");
    expect(player.index).toBe(0);
    expect(key("ArrowLeft")).toBe(true);
    expect(player.index).toBe(0);
  });

  it("leaves arrow keys to a text field", async () => {
    await render({ stepCount: 4 });
    expect(key("ArrowRight", document.createElement("textarea"))).toBe(false);
    expect(player.index).toBe(0);
  });

  it("never starts on its own under reduced motion, but plays when asked", async () => {
    reducedMotion = true;
    await render({ stepCount: 3, autoPlay: true, stepMs: 1000 });
    tick(5000);
    expect([player.index, player.playing]).toEqual([0, false]);
    act(() => player.togglePlay());
    tick(1000);
    expect(player.index).toBe(1);
  });

  it("starts over when played from the end", async () => {
    await render({ stepCount: 2, initialIndex: 1, stepMs: 1000 });
    act(() => player.togglePlay());
    expect([player.index, player.playing]).toEqual([0, true]);
  });
});
