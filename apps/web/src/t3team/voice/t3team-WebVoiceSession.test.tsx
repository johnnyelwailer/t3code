// @vitest-environment jsdom
import { act, type RefObject } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { IDLE_VOICE_UI } from "./surface/t3team-voiceUiModel";
import { IDLE_VOICE_LIVE, useVoiceUiStore } from "./surface/t3team-voiceUiStore";
import { WebVoiceSession } from "./t3team-WebVoiceSession";

class FakeSpeechRecognition {
  static current: FakeSpeechRecognition | null = null;
  lang = "";
  continuous = false;
  interimResults = false;
  maxAlternatives = 0;
  onstart: (() => void) | null = null;
  onresult: ((event: unknown) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;

  constructor() {
    FakeSpeechRecognition.current = this;
  }
  start() {}
  stop() {}
  abort() {}

  say(transcript: string) {
    const results = { 0: { isFinal: true, 0: { transcript, confidence: 1 } }, length: 1 };
    this.onresult?.({ resultIndex: 0, results });
  }
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function mount(onTranscript: (text: string) => void) {
  const toggleRef: RefObject<(() => void) | null> = { current: null };
  container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container!);
    root.render(<WebVoiceSession onTranscript={onTranscript} toggleRef={toggleRef} />);
  });
  return toggleRef;
}

const state = () => useVoiceUiStore.getState().snapshot.state;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  useVoiceUiStore.setState({ snapshot: IDLE_VOICE_UI, live: IDLE_VOICE_LIVE, controls: null });
  Object.defineProperty(window, "SpeechRecognition", {
    value: FakeSpeechRecognition,
    configurable: true,
  });
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
  Reflect.deleteProperty(window, "SpeechRecognition");
  FakeSpeechRecognition.current = null;
  vi.unstubAllGlobals();
});

describe("WebVoiceSession", () => {
  it("publishes the browser recording to the voice surfaces and commits what was said", () => {
    const onTranscript = vi.fn();
    const toggleRef = mount(onTranscript);
    expect(useVoiceUiStore.getState().controls).not.toBeNull();
    expect(state()).toBe("idle");

    act(() => toggleRef.current?.());
    expect(state()).toBe("recording");
    expect(useVoiceUiStore.getState().snapshot.startedAtMs).not.toBeNull();

    act(() => FakeSpeechRecognition.current?.say("open the board"));
    expect(useVoiceUiStore.getState().live.partial).toBe("open the board");

    act(() => toggleRef.current?.());
    expect(onTranscript).toHaveBeenCalledExactlyOnceWith("open the board");
    expect(state()).toBe("idle");
  });

  it("reports a blocked microphone", () => {
    const toggleRef = mount(vi.fn());
    act(() => toggleRef.current?.());
    act(() => FakeSpeechRecognition.current?.onerror?.({ error: "not-allowed" }));
    expect(state()).toBe("denied");
    act(() => useVoiceUiStore.getState().controls?.dismiss());
    expect(state()).toBe("idle");
  });

  it("offers no recorder where the browser has no speech recognition", () => {
    Reflect.deleteProperty(window, "SpeechRecognition");
    const toggleRef = mount(vi.fn());
    expect(useVoiceUiStore.getState().controls).toBeNull();
    expect(toggleRef.current).toBeNull();
  });
});
