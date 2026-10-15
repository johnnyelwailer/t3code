// @effect-diagnostics globalTimers:off - flushes promise callbacks.
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { installRecognition } from "./t3team-fakeRecognition.ts";
import {
  NativeBridgeRecognition,
  toWebSpeechError,
  type NativeTranscriptionBridge,
  type NativeTranscriptionEvent,
} from "./t3team-nativeRecognition.ts";
import { VoiceRecognitionSession } from "./t3team-recognition.ts";

function fakeBridge(
  startResult: Awaited<ReturnType<NativeTranscriptionBridge["start"]>> = {
    ok: true,
    sessionId: "s1",
    engineId: "macos-speech",
  },
) {
  let listener: ((p: { sessionId: string; event: NativeTranscriptionEvent }) => void) | null = null;
  const bridge = {
    getStatus: vi.fn(async () => ({ available: true, engineId: "macos-speech", engines: [] })),
    start: vi.fn(async () => startResult),
    stop: vi.fn(async () => true),
    abort: vi.fn(async () => true),
    onEvent: vi.fn((l: typeof listener) => {
      listener = l;
      return () => {
        listener = null;
      };
    }),
  } satisfies NativeTranscriptionBridge;
  const emit = (event: NativeTranscriptionEvent, sessionId = "s1") =>
    listener?.({ sessionId, event });
  return { bridge, emit, hasListener: () => listener !== null };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("NativeBridgeRecognition", () => {
  it("maps native partial/final events to Web Speech results for its own session only", async () => {
    const { bridge, emit } = fakeBridge();
    const rec = new NativeBridgeRecognition(bridge);
    rec.lang = "de-CH";
    const results: Array<[string, boolean]> = [];
    rec.onresult = (ev) => {
      const r = ev.results[0]!;
      results.push([r[0].transcript, r.isFinal]);
    };
    rec.start();
    await tick();
    expect(bridge.start).toHaveBeenCalledWith("de-CH");
    emit({ type: "partial", text: "hal" });
    emit({ type: "final", text: "Hallo." });
    emit({ type: "final", text: "other" }, "s2");
    expect(results).toEqual([
      ["hal", false],
      ["Hallo.", true],
    ]);
  });

  it("surfaces permission errors as not-allowed and ends", async () => {
    const { bridge, emit, hasListener } = fakeBridge();
    const rec = new NativeBridgeRecognition(bridge);
    const errors: string[] = [];
    const onend = vi.fn();
    rec.onerror = (ev) => errors.push(ev.error);
    rec.onend = onend;
    rec.start();
    await tick();
    emit({ type: "error", code: "permission-denied", message: "denied" });
    expect(errors).toEqual(["not-allowed"]);
    expect(onend).toHaveBeenCalledTimes(1);
    expect(hasListener()).toBe(false);
  });

  it("reports a failed start (no engine) and defers stop until the session id is known", async () => {
    const failing = fakeBridge({ ok: false, code: "unavailable", message: "none" });
    const rec = new NativeBridgeRecognition(failing.bridge);
    const errors: string[] = [];
    rec.onerror = (ev) => errors.push(ev.error);
    rec.start();
    await tick();
    expect(errors).toEqual(["service-not-allowed"]);

    const ok = fakeBridge();
    const rec2 = new NativeBridgeRecognition(ok.bridge);
    rec2.start();
    rec2.stop();
    await tick();
    expect(ok.bridge.stop).toHaveBeenCalledWith("s1");
  });

  it("maps error codes", () => {
    expect(toWebSpeechError("unsupported-locale")).toBe("language-not-supported");
    expect(toWebSpeechError("no-microphone")).toBe("audio-capture");
    expect(toWebSpeechError("unsupported-os")).toBe("service-not-allowed");
  });
});

describe("VoiceRecognitionSession with the desktop bridge", () => {
  let bridgeHandle: ReturnType<typeof fakeBridge>;
  beforeEach(() => {
    installRecognition(); // Chromium-in-Electron still exposes (a non-working) Web Speech API
    bridgeHandle = fakeBridge();
    (globalThis as Record<string, unknown>).t3teamTranscription = bridgeHandle.bridge;
  });
  afterEach(() => {
    delete (globalThis as Record<string, unknown>).t3teamTranscription;
  });

  it("prefers the native bridge over Web Speech and flushes the in-flight hypothesis on stop", async () => {
    expect(VoiceRecognitionSession.isSupported()).toBe(true);
    const chunks: string[] = [];
    const session = new VoiceRecognitionSession("fr-CH", {
      onFinalChunk: (c) => chunks.push(c),
      onPermissionDenied: () => {},
      onOtherError: () => {},
      onStartFailed: () => {},
    });
    expect(session.start()).toBe(true);
    await tick();
    expect(bridgeHandle.bridge.start).toHaveBeenCalledWith("fr-CH");
    bridgeHandle.emit({ type: "final", text: "Bonjour." });
    bridgeHandle.emit({ type: "partial", text: "ça va" });
    session.stop();
    expect(chunks).toEqual(["Bonjour.", "ça va"]);
    expect(bridgeHandle.bridge.stop).toHaveBeenCalledWith("s1");
  });
});
