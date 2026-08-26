/**
 * ComposerVoiceInput host availability gate (`available` prop) — GHE #232 interim.
 *
 * `useVoiceInput` is mocked so the gate can be observed in both supported and
 * unsupported hosts without a DOM or a real recognition backend (the
 * controller's own support detection is covered by voiceInput.test.ts and the
 * recognition tests). The component renders via react-dom/server, where no
 * effects run — `voice.supported` is exactly what the mock reports.
 */
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";

import { ComposerVoiceInput } from "./voiceInputUi.tsx";
import { useVoiceInput, type VoiceInput } from "./voiceInputUi/useVoiceInput.ts";

vi.mock("./voiceInputUi/useVoiceInput.ts");

function mockVoice(overrides: Partial<VoiceInput> = {}): void {
  vi.mocked(useVoiceInput).mockImplementation(() => ({
    supported: true,
    state: "idle",
    currentLang: "en-US",
    stopMode: "manual",
    pickStopMode: () => {},
    toggle: () => {},
    stop: () => "",
    switchLang: () => {},
    setBarEl: () => {},
    ...overrides,
  }));
}

function renderVoiceInput(props: Record<string, unknown> = {}): string {
  return renderToString(createElement(ComposerVoiceInput, { onTranscript: () => {}, ...props }));
}

beforeEach(() => {
  mockVoice();
});

describe("ComposerVoiceInput host availability gate", () => {
  it("renders nothing when available={false}, even though the host exposes SpeechRecognition", () => {
    mockVoice({ supported: true });
    expect(renderVoiceInput({ available: false })).toBe("");
  });

  it("renders the input when available is omitted (default) and voice is supported", () => {
    mockVoice({ supported: true });
    expect(renderVoiceInput()).toContain("data-voice-input");
  });

  it("renders the input when available={true} is passed explicitly", () => {
    mockVoice({ supported: true });
    expect(renderVoiceInput({ available: true })).toContain("data-voice-input");
  });

  it("still renders nothing when voice is unsupported (regression)", () => {
    mockVoice({ supported: false });
    expect(renderVoiceInput()).toBe("");
  });
});
