import { afterEach, vi } from "vite-plus/test";

/**
 * Test double for the Web Speech recognition constructor.
 * Records instances and lets tests emit events through the handler slots.
 */
export class FakeRecognition {
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
  aborted = false;

  constructor() {
    FakeRecognition.instances.push(this);
  }

  start(): void {
    this.startCount += 1;
  }

  stop(): void {}

  abort(): void {
    this.aborted = true;
  }

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

  emitError(error: string): void {
    this.onerror?.({ error });
  }

  emitEnd(): void {
    this.onend?.();
  }
}

/** Install `window` + the SpeechRecognition constructor for node tests. */
export function installRecognition(): void {
  (globalThis as Record<string, unknown>).window = globalThis;
  Object.defineProperty(globalThis, "SpeechRecognition", {
    configurable: true,
    value: FakeRecognition,
  });
}

export function uninstallRecognition(): void {
  delete (globalThis as Record<string, unknown>).window;
  delete (globalThis as Record<string, unknown>).SpeechRecognition;
  FakeRecognition.instances = [];
}

afterEach(() => {
  uninstallRecognition();
  vi.useRealTimers();
});
