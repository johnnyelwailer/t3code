/**
 * ComposerVoiceInput attach mode (onRecorded): raw-audio hosts hide the
 * STT-only language chips and forward onRecorded to the hook.
 *
 * `useVoiceInput` is mocked so the rendering can be observed without a DOM
 * or a recognition backend — mirroring t3team-voiceInputUi.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";

import { ComposerVoiceInput } from "./t3team-voiceInputUi.tsx";
import { useVoiceInput, type VoiceInput } from "./t3team-voiceInputUi/t3team-useVoiceInput.ts";

vi.mock("./t3team-voiceInputUi/t3team-useVoiceInput.ts");

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
  return renderToString(
    createElement(ComposerVoiceInput, { onTranscript: () => {}, ...props }),
  );
}

beforeEach(() => {
  mockVoice();
});

describe("ComposerVoiceInput attach mode (onRecorded)", () => {
  it("hides the language chips while recording when onRecorded is provided", () => {
    mockVoice({ state: "recording" });
    const html = renderVoiceInput({ onRecorded: () => {} });
    expect(html).toContain("data-voice-input");
    expect(html).not.toContain(">DE<");
  });

  it("keeps the language chips while recording when onRecorded is absent", () => {
    mockVoice({ state: "recording" });
    const html = renderVoiceInput();
    expect(html).toContain(">DE<");
  });

  it("forwards onRecorded to the hook", () => {
    const onRecorded = () => {};
    renderVoiceInput({ onRecorded });
    const call = vi.mocked(useVoiceInput).mock.calls.at(-1)?.[0] as {
      onRecorded?: unknown;
    };
    expect(call.onRecorded).toBe(onRecorded);
  });
});
