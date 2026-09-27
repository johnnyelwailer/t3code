/**
 * Raw audio capture (MediaRecorder): mime picking, stop semantics, and the
 * stuck-recorder timeout bound. Node-only, with a fake MediaRecorder — the
 * same style as the recognition tests.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import {
  pickVoiceMime,
  startAudioCapture,
  type RecordedVoiceAudio,
} from "./t3team-audioCapture.ts";

/** Fake recorder: emits one chunk + onstop on stop() unless flagged off. */
class FakeMediaRecorder {
  static instances: FakeMediaRecorder[] = [];
  static supportedMimes: readonly string[] = ["audio/webm;codecs=opus", "audio/webm"];
  /** When set, isTypeSupported throws (older-engine path). */
  static probeThrows = false;
  static isTypeSupported(mime: string): boolean {
    if (FakeMediaRecorder.probeThrows) throw new Error("not implemented");
    return FakeMediaRecorder.supportedMimes.includes(mime);
  }
  static reset(): void {
    FakeMediaRecorder.instances = [];
    FakeMediaRecorder.supportedMimes = ["audio/webm;codecs=opus", "audio/webm"];
    FakeMediaRecorder.probeThrows = false;
  }

  state: "inactive" | "recording" = "inactive";
  mimeType = "";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  /** Real engines always deliver onstop after stop(); off = stuck recorder. */
  deliverOnStop = true;
  emitChunks = true;

  constructor(_stream: unknown, options?: { mimeType?: string }) {
    this.mimeType = options?.mimeType ?? "";
    FakeMediaRecorder.instances.push(this);
  }

  start(_timeslice?: number): void {
    this.state = "recording";
  }

  stop(): void {
    if (this.state === "inactive" || !this.deliverOnStop) {
      this.state = "inactive";
      return;
    }
    this.state = "inactive";
    if (this.emitChunks) this.ondataavailable?.({ data: new Blob(["voice-bytes"]) });
    this.onstop?.();
  }
}

function flushMicrotasks(): Promise<void> {
  let pending = Promise.resolve();
  for (let i = 0; i < 16; i += 1) pending = pending.then(() => {});
  return pending;
}

/** The capture API only needs "a stream" — the recorder is faked. */
function fakeStream(): MediaStream {
  return {} as MediaStream;
}

beforeEach(() => {
  vi.useFakeTimers();
  FakeMediaRecorder.reset();
  (globalThis as Record<string, unknown>).window = globalThis;
  vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  delete (globalThis as Record<string, unknown>).window;
});

describe("pickVoiceMime", () => {
  it("picks the first supported candidate", () => {
    expect(pickVoiceMime()).toBe("audio/webm;codecs=opus");
  });

  it("falls back to later candidates when the earlier ones are unsupported", () => {
    FakeMediaRecorder.supportedMimes = ["audio/webm"];
    expect(pickVoiceMime()).toBe("audio/webm");
    FakeMediaRecorder.supportedMimes = ["audio/mp4"];
    expect(pickVoiceMime()).toBe("audio/mp4");
  });

  it("returns null when no candidate is supported", () => {
    FakeMediaRecorder.supportedMimes = [];
    expect(pickVoiceMime()).toBeNull();
  });

  it("swallows throwing isTypeSupported (older engines) and returns null", () => {
    FakeMediaRecorder.probeThrows = true;
    expect(pickVoiceMime()).toBeNull();
  });

  it("returns null when MediaRecorder does not exist", () => {
    vi.unstubAllGlobals();
    expect(pickVoiceMime()).toBeNull();
    expect(startAudioCapture(fakeStream())).toBeNull();
  });
});

describe("startAudioCapture", () => {
  it("returns null when no mime is supported", () => {
    FakeMediaRecorder.supportedMimes = [];
    expect(startAudioCapture(fakeStream())).toBeNull();
    expect(FakeMediaRecorder.instances).toHaveLength(0);
  });

  it("stop resolves the recorded blob with mime type and duration", async () => {
    const handle = startAudioCapture(fakeStream());
    expect(handle).not.toBeNull();
    expect(handle!.hasAudio()).toBe(false);

    const recording = await handle!.stop();
    expect(recording).not.toBeNull();
    expect(recording!.mimeType).toBe("audio/webm;codecs=opus");
    expect(recording!.blob.size).toBeGreaterThan(0);
    expect(recording!.durationMs).toBeGreaterThanOrEqual(0);
    expect(handle!.hasAudio()).toBe(true);
    expect(FakeMediaRecorder.instances.at(-1)!.state).toBe("inactive");
  });

  it("stop resolves null when the recorder never delivered chunks", async () => {
    const handle = startAudioCapture(fakeStream());
    expect(handle!.hasAudio()).toBe(false);
    FakeMediaRecorder.instances.at(-1)!.emitChunks = false;

    const recording = await handle!.stop();
    expect(recording).toBeNull();
    expect(handle!.hasAudio()).toBe(false);
  });

  it("stop is idempotent: the second call resolves null", async () => {
    const handle = startAudioCapture(fakeStream());
    const first = await handle!.stop();
    expect(first).not.toBeNull();

    const second = await handle!.stop();
    expect(second).toBeNull();
    expect(FakeMediaRecorder.instances).toHaveLength(1);
  });

  it("a stuck recorder resolves null at the 1500ms bound, never earlier", async () => {
    const handle = startAudioCapture(fakeStream());
    FakeMediaRecorder.instances.at(-1)!.deliverOnStop = false;

    let result: RecordedVoiceAudio | null | undefined;
    const pending = handle!.stop().then((recording) => {
      result = recording;
    });

    vi.advanceTimersByTime(1499);
    await flushMicrotasks();
    expect(result).toBeUndefined();

    vi.advanceTimersByTime(1);
    await pending;
    expect(result).toBeNull();
  });
});
