/**
 * Framework-agnostic Web Speech API transcription controller.
 *
 * Wraps `SpeechRecognition` / `webkitSpeechRecognition` with a clean
 * state machine and callback surface so both web and mobile (via
 * WebView) can reuse it without React or any UI framework.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type VoiceInputState =
  | "idle"
  | "recording"
  | "processing"
  | "error"
  | "unsupported";

export interface VoiceInputError {
  code: string;
  message: string;
}

export interface VoiceInputCallbacks {
  onStateChange?: (state: VoiceInputState) => void;
  onPartialTranscript?: (text: string) => void;
  onFinalTranscript?: (text: string) => void;
  onError?: (error: VoiceInputError) => void;
}

export interface VoiceInputOptions {
  /** Language for recognition, e.g. "en-US". Defaults to browser locale. */
  lang?: string;
  /** If true, recognition stops after one utterance. Default false. */
  singleUtterance?: boolean;
}

// ---------------------------------------------------------------------------
// Browser globals (typed loosely to avoid needing a DOM lib in shared)
// ---------------------------------------------------------------------------

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}
interface SpeechRecognitionResult {
  isFinal: boolean;
  0: SpeechRecognitionAlternative;
}
interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: {
    [index: number]: SpeechRecognitionResult;
    length: number;
  };
}
interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

export class VoiceInputController {
  private _state: VoiceInputState = "idle";
  private _partial = "";
  private _final = "";
  private _recognition: SpeechRecognitionLike | null = null;
  private _callbacks: VoiceInputCallbacks;
  private _options: VoiceInputOptions;
  private _supported: boolean;

  constructor(callbacks: VoiceInputCallbacks = {}, options: VoiceInputOptions = {}) {
    this._callbacks = callbacks;
    this._options = options;
    this._supported = isVoiceInputSupported();
    if (!this._supported) {
      this._state = "unsupported";
    }
  }

  /** True when the browser exposes a usable SpeechRecognition API. */
  get supported(): boolean {
    return this._supported;
  }

  get state(): VoiceInputState {
    return this._state;
  }

  get partialTranscript(): string {
    return this._partial;
  }

  get finalTranscript(): string {
    return this._final;
  }

  /** Begin recording. No-op if already recording or unsupported. */
  start(): void {
    if (!this._supported || this._state === "recording") return;

    this._partial = "";
    this._final = "";
    this._setState("recording");

    try {
      const Ctor = getSpeechRecognitionCtor();
      const recognition: SpeechRecognitionLike = new Ctor();
      recognition.lang = this._options.lang ?? "en-US";
      recognition.continuous = !this._options.singleUtterance;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        this._setState("recording");
      };

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let interim = "";
        let finalChunk = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            finalChunk += result[0].transcript;
          } else {
            interim += result[0].transcript;
          }
        }
        if (finalChunk) {
          this._final += finalChunk;
          this._callbacks.onFinalTranscript?.(this._final);
        }
        this._partial = interim;
        this._callbacks.onPartialTranscript?.(interim);
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        const { error } = event;
        if (error === "not-allowed" || error === "service-not-allowed") {
          this._setState("error");
          this._callbacks.onError?.({
            code: "permission",
            message: "Microphone access denied. Check browser permissions.",
          });
        } else if (error === "no-speech") {
          // Transient — reset and keep recording if continuous.
          this._partial = "";
          this._callbacks.onPartialTranscript?.("");
        } else {
          this._setState("error");
          this._callbacks.onError?.({
            code: error,
            message: `Speech recognition error: ${error}`,
          });
        }
        this._recognition = null;
      };

      recognition.onend = () => {
        if (this._state === "recording") {
          // Auto-restart if we were continuous and haven't hit an error.
          this._restartIfContinuous(recognition);
        } else {
          this._setState("idle");
        }
        this._recognition = null;
      };

      this._recognition = recognition;
      recognition.start();
    } catch (err) {
      this._setState("error");
      this._callbacks.onError?.({
        code: "start-failed",
        message: err instanceof Error ? err.message : "Failed to start recognition",
      });
      this._recognition = null;
    }
  }

  /** Stop recording and commit the transcript. */
  stop(): void {
    if (this._state !== "recording") return;
    this._recognition?.stop();
    this._recognition = null;
    this._setState("idle");
    // Final transcript is already accumulated in onresult.
    const full = this._final || this._partial;
    if (full) {
      this._final = full;
      this._callbacks.onFinalTranscript?.(full);
    }
  }

  /** Abort without committing any transcript. */
  cancel(): void {
    this._recognition?.abort();
    this._recognition = null;
    this._partial = "";
    this._final = "";
    this._setState("idle");
    this._callbacks.onPartialTranscript?.("");
  }

  // -- internals ------------------------------------------------------------

  private _setState(next: VoiceInputState) {
    if (this._state === next) return;
    this._state = next;
    this._callbacks.onStateChange?.(next);
  }

  private _restartIfContinuous(recognition: SpeechRecognitionLike) {
    if (this._options.singleUtterance) return;
    // Small delay to avoid rapid-fire restart loops on permission loss.
    setTimeout(() => {
      if (this._state !== "recording") return;
      try {
        recognition.start();
      } catch {
        this._setState("idle");
      }
    }, 100);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isVoiceInputSupported(): boolean {
  if (typeof window === "undefined") return false;
  return !!(
    window.SpeechRecognition ||
    (window as any).webkitSpeechRecognition
  );
}

function getSpeechRecognitionCtor(): new () => SpeechRecognitionLike {
  if (typeof window === "undefined") throw new Error("No window");
  const Ctor =
    window.SpeechRecognition ||
    (window as any).webkitSpeechRecognition;
  if (!Ctor) throw new Error("SpeechRecognition not available");
  return Ctor as new () => SpeechRecognitionLike;
}

// ---------------------------------------------------------------------------
// Convenience: one-shot promise
// ---------------------------------------------------------------------------

/**
 * Promise-based helper: resolve with the final transcript,
 * reject 
