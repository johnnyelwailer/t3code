// @effect-diagnostics globalConsole:off - browser UI adapter; logs like the rest of the voice UI.
/**
 * Web-Speech-shaped adapter over the desktop app's native transcription bridge
 * (`window.t3teamTranscription`, exposed by apps/desktop/src/transcription/t3team-transcriptionPreload.ts).
 *
 * Chromium's Web Speech API does not work inside Electron (no Google STT backend), so on desktop
 * the voice UI drives the OS speech-to-text engines (macOS Speech / Windows speech) — or a
 * user-configured custom engine — through this adapter instead. It implements
 * `SpeechRecognitionLike`, so VoiceRecognitionSession and the whole voice UI (waveform, language
 * switch, auto-send, stop()) work unchanged.
 */
import type {
  SpeechRecognitionErrorEvent,
  SpeechRecognitionEvent,
  SpeechRecognitionLike,
} from "../t3team-voiceInputTypes.ts";

export type NativeTranscriptionEvent =
  | { type: "ready"; engine: string; locale: string }
  | { type: "partial" | "final"; text: string }
  | { type: "level"; level: number }
  | { type: "warning"; code: string; message: string }
  | { type: "error"; code: string; message: string }
  | { type: "end" };

export interface NativeTranscriptionStatus {
  available: boolean;
  engineId: string | null;
  engines: ReadonlyArray<{
    id: string;
    label: string;
    kind: string;
    available: boolean;
    reason?: string;
  }>;
}

export interface NativeTranscriptionBridge {
  getStatus(locale?: string): Promise<NativeTranscriptionStatus>;
  start(
    locale: string,
    engineId?: string,
  ): Promise<
    { ok: true; sessionId: string; engineId: string } | { ok: false; code: string; message: string }
  >;
  stop(sessionId: string): Promise<boolean>;
  abort(sessionId: string): Promise<boolean>;
  onEvent(
    listener: (payload: { sessionId: string; event: NativeTranscriptionEvent }) => void,
  ): () => void;
}

let lastNativeError: string | null = null;

/** Human-readable reason of the last native engine failure (shown as the denied-mic tooltip). */
export function getLastNativeTranscriptionError(): string | null {
  return lastNativeError;
}

export function getNativeTranscriptionBridge(): NativeTranscriptionBridge | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as { t3teamTranscription?: NativeTranscriptionBridge }).t3teamTranscription;
}

/** Map native error codes onto the Web Speech error names VoiceRecognitionSession understands. */
export function toWebSpeechError(code: string): string {
  switch (code) {
    case "permission-denied":
      return "not-allowed";
    case "unsupported-os":
    case "unavailable":
      return "service-not-allowed";
    case "unsupported-locale":
      return "language-not-supported";
    case "no-microphone":
      return "audio-capture";
    default:
      return "network";
  }
}

const resultEvent = (text: string, isFinal: boolean) =>
  ({
    resultIndex: 0,
    results: { 0: { isFinal, 0: { transcript: text, confidence: 1 } }, length: 1 },
  }) as unknown as SpeechRecognitionEvent;

export class NativeBridgeRecognition implements SpeechRecognitionLike {
  lang = "en-US";
  continuous = true;
  interimResults = true;
  maxAlternatives = 1;
  onresult: ((event: SpeechRecognitionEvent) => void) | null = null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null = null;
  onend: (() => void) | null = null;
  onstart: (() => void) | null = null;

  private sessionId: string | null = null;
  private unsubscribe: (() => void) | null = null;
  private pendingControl: "stop" | "abort" | null = null;
  private lastPartial = "";
  private finished = false;

  private readonly bridge: NativeTranscriptionBridge;

  constructor(bridge: NativeTranscriptionBridge = getNativeTranscriptionBridge()!) {
    this.bridge = bridge;
  }

  start(): void {
    // Web Speech semantics: start() may be called again after `end` (continuous auto-restart).
    this.unsubscribe?.();
    this.sessionId = null;
    this.pendingControl = null;
    this.lastPartial = "";
    this.finished = false;
    this.unsubscribe = this.bridge.onEvent(({ sessionId, event }) => {
      if (sessionId === this.sessionId) this.handle(event);
    });
    this.bridge.start(this.lang).then(
      (result) => {
        if (!result.ok) return this.fail(result.code, result.message);
        this.sessionId = result.sessionId;
        if (this.pendingControl) void this.bridge[this.pendingControl](result.sessionId);
      },
      (error: unknown) => this.fail("failed", String(error)),
    );
  }

  /** Commit the in-flight hypothesis synchronously (called by VoiceRecognitionSession.stop). */
  flushPending(): void {
    if (!this.lastPartial) return;
    const text = this.lastPartial;
    this.lastPartial = "";
    this.onresult?.(resultEvent(text, true));
  }

  stop(): void {
    this.control("stop");
  }

  abort(): void {
    this.control("abort");
  }

  private control(kind: "stop" | "abort"): void {
    if (this.sessionId) void this.bridge[kind](this.sessionId);
    else this.pendingControl = kind;
  }

  private handle(event: NativeTranscriptionEvent): void {
    switch (event.type) {
      case "partial":
        this.lastPartial = event.text;
        this.onresult?.(resultEvent(event.text, false));
        break;
      case "final":
        this.lastPartial = "";
        this.onresult?.(resultEvent(event.text, true));
        break;
      case "ready":
        lastNativeError = null;
        this.onstart?.();
        break;
      case "warning":
        console.info(`[voice-input] ${event.code}: ${event.message}`);
        break;
      case "error":
        this.fail(event.code, event.message);
        break;
      case "end":
        this.finish();
        break;
    }
  }

  private fail(code: string, message: string): void {
    console.warn(`[voice-input] native transcription error (${code}): ${message}`);
    lastNativeError = message || null;
    this.onerror?.({ error: toWebSpeechError(code) } as SpeechRecognitionErrorEvent);
    this.finish();
  }

  private finish(): void {
    if (this.finished) return;
    this.finished = true;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.onend?.();
  }
}
