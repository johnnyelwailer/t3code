/**
 * useVoiceInput raw audio capture ("attach mode"): onRecorded fires with the
 * recording on manual stop, with null on cancel, and keeps the recording
 * alive when STT is unavailable.
 *
 * The hook is driven through a minimal fake React dispatcher (the hook only
 * uses useState/useRef/useCallback/useEffect) plus browser-global stubs —
 * node-only, mirroring the recognition tests.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { RecordedVoiceAudio } from "./t3team-audioCapture.ts";
import {
  useVoiceInput,
  type VoiceInput,
  type VoiceInputOptions,
} from "./t3team-useVoiceInput.ts";

// -- fake browser globals ----------------------------------------------------

/** Web Speech double: recording starts fine, no chunks ever arrive. */
class FakeRecognition {
  static instances: FakeRecognition[] = [];
  lang = "";
  continuous = false;
  interimResults = false;
  maxAlternatives = 0;
  onstart: (() => void) | null = null;
  onresult: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onend: (() => void) | null = null;

  constructor() {
    FakeRecognition.instances.push(this);
  }

  start(): void {}
  stop(): void {}
  abort(): void {}
}

/** MediaRecorder double: delivers one chunk + onstop on stop() by default. */
class FakeMediaRecorder {
  static instances: FakeMediaRecorder[] = [];
  static isTypeSupported(mime: string): boolean {
    return mime === "audio/webm;codecs=opus";
  }

  state: "inactive" | "recording" = "inactive";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;

  constructor(_stream: unknown, _options?: { mimeType?: string }) {
    FakeMediaRecorder.instances.push(this);
  }

  start(_timeslice?: number): void {
    this.state = "recording";
  }

  stop(): void {
    if (this.state === "inactive") return;
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["voice-bytes"]) });
    this.onstop?.();
  }
}

/** AudioContext double: running state, inert analyser wiring. */
class FakeAudioContext {
  state = "running" as const;
  close(): Promise<void> {
    return Promise.resolve();
  }
  resume(): Promise<void> {
    return Promise.resolve();
  }
  createMediaStreamSource(_stream: unknown): { connect(target: unknown): void } {
    return { connect: () => {} };
  }
  createAnalyser(): {
    fftSize: number;
    connect(source: unknown): void;
    getByteTimeDomainData(buffer: unknown): void;
  } {
    return { fftSize: 0, connect: () => {}, getByteTimeDomainData: () => {} };
  }
}

let fakeStream: unknown = {};

function installBrowserGlobals(): void {
  // EventTarget-backed window: the hook listens for Esc on window, while
  // timers/lookups fall through to globalThis (so vi's fake timers apply).
  const win = new Proxy(new EventTarget(), {
    get(target, prop, receiver) {
      if (prop in target) return Reflect.get(target, prop, receiver);
      return (globalThis as Record<PropertyKey, unknown>)[prop];
    },
  });
  (globalThis as Record<string, unknown>).window = win;
  Object.defineProperty(globalThis, "SpeechRecognition", {
    configurable: true,
    value: FakeRecognition,
  });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { mediaDevices: { getUserMedia: async (): Promise<unknown> => fakeStream } },
  });
  vi.stubGlobal("AudioContext", FakeAudioContext);
  vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
  vi.stubGlobal("requestAnimationFrame", () => 1);
  vi.stubGlobal("cancelAnimationFrame", () => {});
}

function pressEscape(): void {
  const event = new Event("keydown");
  Object.assign(event, { key: "Escape" });
  (window as unknown as EventTarget).dispatchEvent(event);
}

function flushMicrotasks(): Promise<void> {
  let pending = Promise.resolve();
  for (let i = 0; i < 32; i += 1) pending = pending.then(() => {});
  return pending;
}

// -- fake React dispatcher ---------------------------------------------------

const h = vi.hoisted(() => ({
  cells: [] as Array<{ value: unknown }>,
  cursor: 0,
  effectSlots: [] as Array<{
    deps: readonly unknown[] | undefined;
    cleanup: (() => void) | null;
  }>,
  pendingEffects: [] as Array<{
    fn: () => void | (() => void);
    deps: readonly unknown[] | undefined;
  }>,
  options: null as null | Record<string, unknown>,
  api: null as unknown,
}));

vi.mock("react", () => ({
  useState: (initial: unknown) => {
    let cell = h.cells[h.cursor];
    if (!cell) {
      cell = { value: initial };
      h.cells[h.cursor] = cell;
    }
    h.cursor += 1;
    const value = cell.value;
    const setter = (next: unknown): void => {
      const resolved =
        typeof next === "function" ? (next as (prev: unknown) => unknown)(cell.value) : next;
      if (Object.is(resolved, cell.value)) return;
      cell.value = resolved;
      reRender();
    };
    return [value, setter] as const;
  },
  useRef: (initial: unknown) => {
    let cell = h.cells[h.cursor];
    if (!cell) {
      cell = { value: { current: initial } };
      h.cells[h.cursor] = cell;
    }
    h.cursor += 1;
    return cell.value as { current: unknown };
  },
  useCallback: (fn: unknown) => fn,
  useEffect: (fn: () => void | (() => void), deps?: readonly unknown[]) => {
    h.pendingEffects.push({ fn, deps });
  },
}));

function flushEffects(): void {
  const list = h.pendingEffects.splice(0, h.pendingEffects.length);
  list.forEach((entry, index) => {
    const slot = h.effectSlots[index];
    const depsChanged =
      !slot ||
      entry.deps === undefined ||
      slot.deps === undefined ||
      entry.deps.length !== slot.deps.length ||
      entry.deps.some((dep, i) => !Object.is(dep, slot.deps?.[i]));
    if (!depsChanged) return;
    slot?.cleanup?.();
    const result = entry.fn();
    h.effectSlots[index] = {
      deps: entry.deps,
      cleanup: typeof result === "function" ? result : null,
    };
  });
}

function reRender(): void {
  if (h.options === null) return;
  h.cursor = 0;
  h.api = useVoiceInput(h.options as VoiceInputOptions);
  flushEffects();
}

function render(options: VoiceInputOptions): VoiceInput {
  h.options = options as Record<string, unknown>;
  h.cells = [];
  h.cursor = 0;
  h.api = useVoiceInput(options);
  flushEffects();
  return h.api as VoiceInput;
}

function latest(): VoiceInput {
  return h.api as VoiceInput;
}

function unmount(): void {
  for (const slot of h.effectSlots) slot.cleanup?.();
  h.effectSlots = [];
  h.api = null;
}

// -- tests ---------------------------------------------------------------------

beforeEach(() => {
  h.cells = [];
  h.cursor = 0;
  h.effectSlots = [];
  h.pendingEffects = [];
  h.options = null;
  h.api = null;
  FakeRecognition.instances = [];
  FakeMediaRecorder.instances = [];
  fakeStream = {};
  vi.useFakeTimers();
  installBrowserGlobals();
});

afterEach(() => {
  unmount();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  delete (globalThis as Record<string, unknown>).window;
  delete (globalThis as Record<string, unknown>).SpeechRecognition;
});

describe("useVoiceInput raw audio capture (onRecorded)", () => {
  it("fires onRecorded with the recorded audio on manual stop", async () => {
    const recorded: Array<RecordedVoiceAudio | null> = [];
    const transcripts: string[] = [];
    render({
      onTranscript: (text) => transcripts.push(text),
      onRecorded: (recording) => recorded.push(recording),
      initialLanguage: "en-US",
    });

    latest().toggle();
    expect(latest().state).toBe("recording");
    await flushMicrotasks(); // mic stream attached -> capture started
    expect(FakeMediaRecorder.instances).toHaveLength(1);
    expect(latest().state).toBe("recording");

    latest().toggle(); // manual stop
    await flushMicrotasks(); // capture.stop() resolves via the fake onstop

    expect(recorded).toHaveLength(1);
    const recording = recorded[0]!;
    expect(recording).not.toBeNull();
    expect(recording!.mimeType).toBe("audio/webm;codecs=opus");
    expect(recording!.blob.size).toBeGreaterThan(0);
    expect(recording!.durationMs).toBeGreaterThanOrEqual(0);
    expect(transcripts).toEqual([""]);
    expect(latest().state).toBe("idle");
  });

  it("fires onRecorded(null) on cancel and discards the recording", async () => {
    const recorded: Array<RecordedVoiceAudio | null> = [];
    render({
      onTranscript: () => {},
      onRecorded: (recording) => recorded.push(recording),
      initialLanguage: "en-US",
    });

    latest().toggle();
    await flushMicrotasks();
    expect(FakeMediaRecorder.instances).toHaveLength(1);

    pressEscape(); // cancel
    expect(latest().state).toBe("idle");
    expect(recorded).toEqual([null]);
  });

  it("stays in attach mode when STT is unavailable but capture was requested", async () => {
    delete (globalThis as Record<string, unknown>).SpeechRecognition;
    const recorded: Array<RecordedVoiceAudio | null> = [];
    render({
      onTranscript: () => {},
      onRecorded: (recording) => recorded.push(recording),
      initialLanguage: "en-US",
    });

    expect(latest().supported).toBe(true); // raw capture is enough
    latest().toggle();
    expect(latest().state).toBe("recording"); // NOT "denied"
    await flushMicrotasks();
    expect(FakeMediaRecorder.instances).toHaveLength(1);

    latest().toggle();
    await flushMicrotasks();
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).not.toBeNull();
  });

  it("is unsupported without STT when no capture was requested", () => {
    delete (globalThis as Record<string, unknown>).SpeechRecognition;
    render({ onTranscript: () => {}, initialLanguage: "en-US" });
    expect(latest().supported).toBe(false);
  });

  it("does not record when onRecorded is not provided", async () => {
    render({ onTranscript: () => {}, initialLanguage: "en-US" });
    latest().toggle();
    await flushMicrotasks();
    expect(FakeMediaRecorder.instances).toHaveLength(0);

    latest().toggle();
    await flushMicrotasks();
  });
});
