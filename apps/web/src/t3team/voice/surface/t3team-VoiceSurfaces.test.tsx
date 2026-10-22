// @vitest-environment jsdom
import { ProjectId, ThreadId } from "@t3tools/contracts";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { VoiceComposerDock } from "../t3team-VoiceComposerDock";
import { VoiceComposerInline } from "../t3team-VoiceComposerInline";
import { VoiceComposerMic } from "../t3team-VoiceComposerMic";
import { useVoiceThreadStore } from "../t3team-voiceThreadStore";
import { VoiceThreadRow } from "./t3team-VoiceThreadRow";
import { IDLE_VOICE_UI, type VoiceUiSnapshot, type VoiceUiState } from "./t3team-voiceUiModel";
import { IDLE_VOICE_LIVE, useVoiceUiStore, type VoiceUiLive } from "./t3team-voiceUiStore";

const controls = {
  toggle: vi.fn(),
  dismiss: vi.fn(),
  openMicrophoneSettings: vi.fn(),
};

const ENV = "env-1";
const VOICE_THREAD = "voice-thread";

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function show(
  state: VoiceUiState,
  extra: Partial<VoiceUiSnapshot> = {},
  live: Partial<VoiceUiLive> = {},
) {
  act(() =>
    useVoiceUiStore.setState({
      snapshot: { ...IDLE_VOICE_UI, state, ...extra },
      live: { ...IDLE_VOICE_LIVE, ...live },
    }),
  );
}

function mount(node: React.ReactNode) {
  container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container!);
    root.render(node);
  });
  return container;
}

const button = (name: string) =>
  [...container!.querySelectorAll("button")].find(
    (candidate) =>
      candidate.getAttribute("aria-label") === name || candidate.textContent?.trim() === name,
  );

const dock = (threadId = VOICE_THREAD) => (
  <VoiceComposerDock environmentId={ENV} threadId={threadId} />
);

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  Object.values(controls).forEach((fn) => fn.mockReset());
  Object.defineProperty(window, "matchMedia", {
    value: () => ({ matches: true }),
    configurable: true,
  });
  useVoiceUiStore.setState({ snapshot: IDLE_VOICE_UI, live: IDLE_VOICE_LIVE, controls });
  useVoiceThreadStore.setState({
    homeByEnvironmentId: {
      [ENV]: { threadId: ThreadId.make(VOICE_THREAD), projectId: ProjectId.make("p1") },
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
  useVoiceThreadStore.setState({ homeByEnvironmentId: {} });
});

describe("VoiceComposerDock", () => {
  it("adds nothing to the thread while the voice agent is at rest", () => {
    mount(dock());
    expect(container!.textContent).toBe("");
  });

  it("shows no card above the composer while recording; that lives inline now", () => {
    show("recording", { startedAtMs: Date.now() }, { level: 0.3, partial: "open the board" });
    mount(dock());
    expect(container!.querySelector('[data-testid="voice-composer-dock"]')).toBeNull();
    expect(container!.textContent).toBe("");
  });

  it("is only the voice thread's", () => {
    show("recording", { startedAtMs: Date.now() });
    mount(dock("another-thread"));
    expect(container!.textContent).toBe("");
  });

  it("explains a blocked microphone and opens the system settings", () => {
    show("denied");
    mount(dock());
    expect(container!.textContent).toContain("Microphone is blocked");
    act(() => button("Open settings")!.click());
    expect(controls.openMicrophoneSettings).toHaveBeenCalledOnce();
    act(() => button("Not now")!.click());
    expect(controls.dismiss).toHaveBeenCalledOnce();
  });

  it("offers to try again after a recording that produced nothing", () => {
    show("failed", { failureDetail: "No speech was detected." });
    mount(dock());
    expect(container!.textContent).toContain("Didn’t catch that");
    expect(container!.textContent).toContain("No speech was detected.");
    act(() => button("Try again")!.click());
    expect(controls.toggle).toHaveBeenCalledOnce();
  });

  it("reports model download progress while preparing", () => {
    show("preparing", { downloadPercent: 43 });
    mount(dock());
    expect(container!.textContent).toContain("Preparing voice model");
    expect(container!.textContent).toContain("43%");
  });

  it("renders nothing where there is no recorder", () => {
    show("recording", { startedAtMs: Date.now() });
    useVoiceUiStore.setState({ controls: null });
    mount(dock());
    expect(container!.textContent).toBe("");
  });
});

describe("VoiceComposerInline", () => {
  const inline = (threadId = VOICE_THREAD) => (
    <VoiceComposerInline environmentId={ENV} threadId={threadId} />
  );

  it("streams the words into the composer with a level dot, a timer and a small stop", () => {
    show("recording", { startedAtMs: Date.now() }, { level: 0.3, partial: "open the board" });
    mount(inline());
    const row = container!.querySelector('[data-testid="voice-composer-inline"]')!;
    expect(row.getAttribute("data-state")).toBe("recording");
    expect(container!.textContent).toContain("open the board");
    expect(container!.querySelector('[data-testid="voice-inline-level"]')).not.toBeNull();
    act(() => button("Stop recording")!.click());
    expect(controls.toggle).toHaveBeenCalledOnce();
  });

  it("says listening before any words, and warming up with its progress while the model loads", () => {
    show("recording", { startedAtMs: Date.now() });
    mount(inline());
    expect(container!.textContent).toContain("Listening…");
    show(
      "recording",
      { startedAtMs: Date.now() },
      { warmup: { stage: "preparing-gpu", percent: 65 } },
    );
    expect(container!.textContent).toContain("Warming up…");
    const bar = container!.querySelector('[role="progressbar"]') as HTMLElement;
    expect(bar.getAttribute("aria-valuenow")).toBe("65");
  });

  it("counts the final pass after stop and drops the stop button", () => {
    show("transcribing", { startedAtMs: 0, endedAtMs: Date.now() - 3_000 }, { partial: "" });
    mount(inline());
    expect(container!.textContent).toContain("Transcribing… 3 s");
    expect(button("Stop recording")).toBeUndefined();
  });

  it("is only the voice thread's and absent at rest", () => {
    show("recording", { startedAtMs: Date.now() });
    mount(inline("another-thread"));
    expect(container!.textContent).toBe("");
    show("idle");
    act(() => root!.render(inline()));
    expect(container!.textContent).toBe("");
  });
});

describe("VoiceComposerMic", () => {
  it("starts the voice recording from the composer", () => {
    mount(<VoiceComposerMic />);
    act(() => button("Talk")!.click());
    expect(controls.toggle).toHaveBeenCalledOnce();
  });

  it("stops it while recording and is disabled while writing it down", () => {
    show("recording", { startedAtMs: Date.now() });
    mount(<VoiceComposerMic />);
    act(() => button("Stop recording")!.click());
    expect(controls.toggle).toHaveBeenCalledOnce();
    show("transcribing", { startedAtMs: 0, endedAtMs: 1 });
    expect((button("Writing it down") as HTMLButtonElement).disabled).toBe(true);
  });

  it("is absent where there is no recorder", () => {
    useVoiceUiStore.setState({ controls: null });
    mount(<VoiceComposerMic />);
    expect(container!.textContent).toBe("");
    expect(container!.querySelector("button")).toBeNull();
  });
});

describe("VoiceThreadRow", () => {
  it("records from the row's orb without opening the thread", () => {
    const onOpen = vi.fn();
    mount(<VoiceThreadRow title="Voice" isActive={false} keys={[]} onOpen={onOpen} />);
    act(() => button("Talk")!.click());
    expect(controls.toggle).toHaveBeenCalledOnce();
    expect(onOpen).not.toHaveBeenCalled();
    act(() => button("Voice")!.click());
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("carries the state on the row and shows the timer while recording", () => {
    show("recording", { startedAtMs: Date.now() - 65_000 });
    mount(<VoiceThreadRow title="Voice" isActive={false} keys={[]} />);
    const row = container!.querySelector('[data-testid="voice-thread-row"]')!;
    expect(row.getAttribute("data-state")).toBe("recording");
    expect(container!.querySelector('[data-testid="voice-clock"]')?.textContent).toMatch(/^1:0\d$/);
    expect(button("Stop recording")).toBeDefined();
  });

  it("offers the retry on a failed row and the settings on a blocked one", () => {
    show("failed");
    mount(<VoiceThreadRow title="Voice" isActive={false} keys={[]} />);
    expect(container!.textContent).toContain("didn’t catch that");
    act(() => button("Try again")!.click());
    expect(controls.toggle).toHaveBeenCalledOnce();

    show("denied");
    expect(container!.textContent).toContain("microphone blocked");
    act(() => button("Open microphone settings")!.click());
    expect(controls.openMicrophoneSettings).toHaveBeenCalledOnce();
  });

  it("says heard for a moment after a commit", () => {
    show("committed", { heardText: "hi", startedAtMs: 0, endedAtMs: 1_000 });
    mount(<VoiceThreadRow title="Voice" isActive={false} keys={[]} />);
    expect(container!.textContent).toContain("heard");
  });
});

describe("VoiceThreadRow warm-up", () => {
  it("says warming up with a thin bar while the model loads, then goes back to the level", () => {
    show("recording", { startedAtMs: Date.now() }, { warmup: { stage: "loading", percent: 15 } });
    mount(<VoiceThreadRow title="Voice" isActive={false} keys={[]} />);
    expect(container!.textContent).toContain("warming up…");
    expect(container!.querySelector('[role="progressbar"]')).not.toBeNull();
    show("recording", { startedAtMs: Date.now() }, { warmup: null });
    expect(container!.textContent).not.toContain("warming up");
  });
});
