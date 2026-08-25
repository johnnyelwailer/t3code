import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { installRecognition, FakeRecognition } from "./fakeRecognition.ts";
import { VoiceRecognitionSession } from "./recognition.ts";

describe("VoiceRecognitionSession language switching", () => {
  beforeEach(() => {
    installRecognition();
    vi.useFakeTimers();
  });

  it("switches language by aborting and restarting after the delay", () => {
    const session = new VoiceRecognitionSession("de-CH", {
      onFinalChunk: () => {},
      onPermissionDenied: () => {},
      onOtherError: () => {},
      onStartFailed: () => {},
    });
    session.start();
    const first = FakeRecognition.instances.at(-1)!;

    session.switchLanguage("fr-CH");
    expect(first.aborted).toBe(true);
    expect(FakeRecognition.instances).toHaveLength(1);

    vi.advanceTimersByTime(150);
    const second = FakeRecognition.instances.at(-1)!;
    expect(second).not.toBe(first);
    expect(second.lang).toBe("fr-CH");
    expect(second.startCount).toBe(1);
  });

  it("cancels a pending language-switch restart on stop()", () => {
    const session = new VoiceRecognitionSession("de-CH", {
      onFinalChunk: () => {},
      onPermissionDenied: () => {},
      onOtherError: () => {},
      onStartFailed: () => {},
    });
    session.start();
    session.switchLanguage("fr-CH");
    session.stop();
    vi.advanceTimersByTime(1000);
    expect(FakeRecognition.instances).toHaveLength(1);
  });
});
