import { beforeEach, describe, expect, it } from "vite-plus/test";

import { installRecognition, FakeRecognition } from "./fakeRecognition.ts";
import { VoiceRecognitionSession } from "./recognition.ts";

describe("VoiceRecognitionSession", () => {
  beforeEach(() => {
    installRecognition();
  });

  it("reports supported when the Web Speech API exists", () => {
    expect(VoiceRecognitionSession.isSupported()).toBe(true);
  });

  it("starts a continuous recognition in the requested language", () => {
    const session = new VoiceRecognitionSession("de-CH", {
      onFinalChunk: () => {},
      onPermissionDenied: () => {},
      onOtherError: () => {},
      onStartFailed: () => {},
    });
    expect(session.start()).toBe(true);
    const rec = FakeRecognition.instances.at(-1)!;
    expect(rec.lang).toBe("de-CH");
    expect(rec.continuous).toBe(true);
    expect(rec.interimResults).toBe(true);
    expect(rec.maxAlternatives).toBe(1);
    expect(rec.startCount).toBe(1);
  });

  it("emits final chunks only (interim results ignored)", () => {
    const chunks: string[] = [];
    const session = new VoiceRecognitionSession("en-US", {
      onFinalChunk: (chunk) => chunks.push(chunk),
      onPermissionDenied: () => {},
      onOtherError: () => {},
      onStartFailed: () => {},
    });
    session.start();
    const rec = FakeRecognition.instances.at(-1)!;
    rec.emitInterim("hal");
    rec.emitFinal("hallo");
    rec.emitFinal(" welt");
    rec.emitInterim("we");
    expect(chunks).toEqual(["hallo", " welt"]);
  });

  it("auto-restarts when the stream ends mid-recording", () => {
    const session = new VoiceRecognitionSession("en-US", {
      onFinalChunk: () => {},
      onPermissionDenied: () => {},
      onOtherError: () => {},
      onStartFailed: () => {},
    });
    session.start();
    const rec = FakeRecognition.instances.at(-1)!;
    rec.emitEnd();
    expect(rec.startCount).toBe(2);
  });

  it("maps permission errors to onPermissionDenied and others to onOtherError", () => {
    let permission = 0;
    let other = 0;
    const session = new VoiceRecognitionSession("en-US", {
      onFinalChunk: () => {},
      onPermissionDenied: () => permission++,
      onOtherError: () => other++,
      onStartFailed: () => {},
    });
    session.start();
    const rec = FakeRecognition.instances.at(-1)!;
    rec.emitError("not-allowed");
    expect(permission).toBe(1);
    rec.emitError("service-not-allowed");
    expect(permission).toBe(2);
    rec.emitError("audio-capture");
    expect(other).toBe(1);
    rec.emitError("no-speech");
    expect(other).toBe(1); // transient: ignored
  });

  it("stop() detaches handlers so late events cannot re-enter", () => {
    let other = 0;
    const session = new VoiceRecognitionSession("en-US", {
      onFinalChunk: () => {},
      onPermissionDenied: () => {},
      onOtherError: () => other++,
      onStartFailed: () => {},
    });
    session.start();
    const rec = FakeRecognition.instances.at(-1)!;
    session.stop();
    rec.emitError("audio-capture");
    rec.emitFinal("zu spaet");
    rec.emitEnd();
    expect(other).toBe(0);
    expect(rec.startCount).toBe(1); // no auto-restart after stop
  });

  it("reports start failures instead of throwing", () => {
    const realStart = FakeRecognition.prototype.start;
    FakeRecognition.prototype.start = () => {
      throw new Error("could not start");
    };
    try {
      let failed = 0;
      const session = new VoiceRecognitionSession("en-US", {
        onFinalChunk: () => {},
        onPermissionDenied: () => {},
        onOtherError: () => {},
        onStartFailed: () => failed++,
      });
      expect(session.start()).toBe(false);
      expect(failed).toBe(1);
    } finally {
      FakeRecognition.prototype.start = realStart;
    }
  });
});
