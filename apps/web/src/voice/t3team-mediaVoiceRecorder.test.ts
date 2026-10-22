import { VOICE_RECORDING_LIMIT_SECONDS } from "@t3tools/client-runtime/voice-input";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { MediaVoiceRecorder } from "./t3team-mediaVoiceRecorder";

class FakeMediaRecorder {
  state: "inactive" | "recording" = "inactive";
  mimeType = "audio/webm";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  start() {
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["audio"]) });
    this.onstop?.();
  }
}

function fakeTap() {
  return {
    start: vi.fn(async () => undefined),
    stop: vi.fn(),
    finish: vi.fn(async () => null),
    discard: vi.fn(),
  };
}

const track = { stop: vi.fn() };

beforeEach(() => {
  vi.useFakeTimers();
  track.stop.mockClear();
  vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
  vi.stubGlobal("navigator", {
    mediaDevices: { getUserMedia: async () => ({ getTracks: () => [track] }) },
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("MediaVoiceRecorder recording limit", () => {
  it("stops, releases the microphone and hands over the recording exactly at the limit", async () => {
    const onLimitReached = vi.fn();
    const tap = fakeTap();
    const recorder = new MediaVoiceRecorder(onLimitReached, tap);
    await recorder.prepareToRecordAsync();
    recorder.record({ forDuration: VOICE_RECORDING_LIMIT_SECONDS });

    await vi.advanceTimersByTimeAsync(VOICE_RECORDING_LIMIT_SECONDS * 1000 - 1);
    expect(onLimitReached).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(onLimitReached).toHaveBeenCalledTimes(1);
    expect(onLimitReached).toHaveBeenCalledWith(recorder.uri);
    expect(tap.stop).toHaveBeenCalledTimes(1);
    expect(track.stop).toHaveBeenCalledTimes(1);
  });

  it("does not fire the limit after a manual stop", async () => {
    const onLimitReached = vi.fn();
    const recorder = new MediaVoiceRecorder(onLimitReached, fakeTap());
    await recorder.prepareToRecordAsync();
    recorder.record({ forDuration: VOICE_RECORDING_LIMIT_SECONDS });

    await recorder.stop();
    await vi.advanceTimersByTimeAsync(VOICE_RECORDING_LIMIT_SECONDS * 1000 * 2);

    expect(recorder.uri).not.toBeNull();
    expect(onLimitReached).not.toHaveBeenCalled();
  });
});
