// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import {
  IDLE_VOICE_UI,
  type VoiceUiSnapshot,
  type VoiceUiState,
} from "./surface/t3team-voiceUiModel";
import { IDLE_VOICE_LIVE, useVoiceUiStore } from "./surface/t3team-voiceUiStore";
import { VoiceWidgetStage } from "./t3team-VoiceWidgetStage";

class StubResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function show(state: VoiceUiState, extra: Partial<VoiceUiSnapshot> = {}, partial = "") {
  act(() =>
    useVoiceUiStore.setState({
      snapshot: { ...IDLE_VOICE_UI, state, ...extra },
      live: { ...IDLE_VOICE_LIVE, partial },
    }),
  );
}

const advance = (ms: number) => act(() => void vi.advanceTimersByTime(ms));
const widget = () => container!.querySelector('[data-testid="voice-widget"]');
const faces = () =>
  [...container!.querySelectorAll("[data-phase]")].map((face) => face.getAttribute("data-phase"));

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", StubResizeObserver);
  Object.defineProperty(window, "matchMedia", {
    value: () => ({ matches: true }),
    configurable: true,
  });
  useVoiceUiStore.setState({ snapshot: IDLE_VOICE_UI, live: IDLE_VOICE_LIVE, controls: null });
  container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container!);
    root.render(<VoiceWidgetStage keys={[]} />);
  });
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("VoiceWidgetStage", () => {
  it("is not there at all while nothing is live", () => {
    expect(widget()).toBeNull();
  });

  it("mounts collapsed and eases open on the next frames", () => {
    show("recording", { startedAtMs: Date.now() }, "open the board");
    expect(widget()).not.toBeNull();
    expect(widget()!.hasAttribute("data-expanded")).toBe(false);
    advance(50);
    expect(widget()!.hasAttribute("data-expanded")).toBe(true);
    expect(container!.textContent).toContain("open the board");
  });

  it("cross-fades from the recording to the heard card instead of cutting", () => {
    show("recording", { startedAtMs: 0 }, "open the board");
    advance(50);
    show("committed", { heardText: "open the board", startedAtMs: 0, endedAtMs: 4_000 });
    expect(faces()).toEqual(["exit", "enter"]);
    advance(260);
    expect(faces()).toEqual(["enter"]);
    expect(container!.textContent).toContain("Heard");
  });

  it("keeps its face while it eases out, then goes", () => {
    show("committed", { heardText: "open the board", startedAtMs: 0, endedAtMs: 4_000 });
    advance(50);
    show("idle");
    expect(widget()!.hasAttribute("data-expanded")).toBe(false);
    expect(container!.textContent).toContain("open the board");
    advance(300);
    expect(widget()).toBeNull();
  });
});
