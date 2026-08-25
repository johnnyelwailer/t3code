import { afterEach, describe, expect, it } from "vite-plus/test";

import { VoiceInputController, type VoiceInputState } from "./voiceInput.ts";

class FakeRecognition {
  static instances: FakeRecognition[] = [];
  lang = "";
  continuous = false;
  interimResults = false;
  maxAlternatives = 0;
  onstart: (() => void) | null = null;
  onresult: ((event: { resultIndex: number; results: unknown }) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  startCount = 0;

  constructor() {
    FakeRecognition.instances.push(this);
  }

  start(): void {
    this.startCount += 1;
  }

  stop(): void {}

  abort(): void {}

  emitFinal(transcript: string): void {
    const results = {
      0: { isFinal: true, 0: { transcript, confidence: 1 } },
      length: 1,
    };
    this.onresult?.({ resultIndex: 0, results: results as never });
  }

  emitInterim(transcript: string): void {
    const results = {
      0: { isFinal: false, 0: { transcript, confidence: 0.8 } },
      length: 1,
    };
    this.onresult?.({ resultIndex: 0, results: results as never });
  }
}

function installWindow(withRecognition: boolean): void {
  (globalThis as Record<string, unknown>).window = globalThis;
  Object.defineProperty(globalThis, "SpeechRecognition", {
    configurable: true,
    value: withRecognition ? FakeRecognition : undefined,
  });
}

afterEach(() => {
  delete (globalThis as Record<string, unknown>).window;
  delete (globalThis as Record<string, unknown>).SpeechRecognition;
  FakeRecognition.instances = [];
});

describe("VoiceInputController", () => {
  it("reports unsupported when the API is missing", () => {
    installWindow(false);
    const controller = new VoiceInputController();
    expect(controller.supported).toBe(false);
    expect(controller.state).toBe("unsupported");
    controller.start();
    expect(controller.state).toBe("unsupported");
  });

  it("moves through the recording state machine and commits the transcript on stop", () => {
    installWindow(true);
    const states: VoiceInputState[] = [];
    const controller = new VoiceInputController({
      onStateChange: (state) => states.push(state),
    });
    expect(controller.supported).toBe(true);

    controller.start();
    const recognition = FakeRecognition.instances.at(-1);
    expect(recognition).toBeDefined();
    recognition!.onstart?.();
    recognition!.emitFinal("hello ");
    recognition!.emitInterim("wor");
    expect(controller.state).toBe("recording");
    expect(controller.partialTranscript).toBe("wor");
    expect(controller.finalTranscript).toBe("hello ");

    controller.stop();
    expect(controller.state).toBe("idle");
    expect(controller.finalTranscript).toBe("hello ");
    expect(states).toEqual(["recording", "idle"]);
    expect(recognition!.startCount).toBe(1);
  });

  it("surfaces a permission error and lands in the error state", () => {
    installWindow(true);
    const errors: string[] = [];
    const states: VoiceInputState[] = [];
    const controller = new VoiceInputController({
      onStateChange: (state) => states.push(state),
      onError: (error) => errors.push(error.code),
    });
    controller.start();
    const recognition = FakeRecognition.instances.at(-1);
    recognition!.onerror?.({ error: "not-allowed" });
    expect(controller.state).toBe("error");
    expect(errors).toEqual(["permission"]);
    expect(states).toContain("error");
  });

  it("resets to idle without committing on cancel", () => {
    installWindow(true);
    const controller = new VoiceInputController();
    controller.start();
    const recognition = FakeRecognition.instances.at(-1);
    recognition!.emitFinal("hello ");
    controller.cancel();
    expect(controller.state).toBe("idle");
    expect(controller.finalTranscript).toBe("");
  });
});
