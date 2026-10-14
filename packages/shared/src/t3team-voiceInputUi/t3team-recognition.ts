import type {
  SpeechRecognitionErrorEvent,
  SpeechRecognitionEvent,
  SpeechRecognitionLike,
  SpeechRecognitionWindow,
} from "../t3team-voiceInput.ts";
import { LANGUAGE_SWITCH_DELAY_MS } from "./t3team-types.ts";
import {
  getNativeTranscriptionBridge,
  NativeBridgeRecognition,
} from "./t3team-nativeRecognition.ts";

/**
 * Recognition engine for this host: the desktop app's native bridge (OS speech-to-text or a
 * configured custom engine) when present, else the browser's Web Speech API.
 */
function resolveRecognitionCtor(): (new () => SpeechRecognitionLike) | undefined {
  if (getNativeTranscriptionBridge()) return NativeBridgeRecognition;
  const win = window as SpeechRecognitionWindow;
  return win.SpeechRecognition || win.webkitSpeechRecognition;
}

export interface VoiceRecognitionCallbacks {
  /** A final transcript chunk landed (interim results are ignored). */
  onFinalChunk: (chunk: string) => void;
  /** Mic permission denied / service not allowed — caller should cancel. */
  onPermissionDenied: () => void;
  /** Any other recognition error — caller should commit what it has. */
  onOtherError: () => void;
  /** recognition.start() threw — caller should surface the denied state. */
  onStartFailed: () => void;
}

/**
 * One continuous Web Speech recognition stream, independent of React.
 *
 * - auto-restarts when the stream ends mid-recording (standard Web Speech
 *   behavior for `continuous` recognition)
 * - `switchLanguage` aborts the current stream and restarts 150 ms later
 *   with the new language, without losing already-accumulated text (chunks
 *   are reported out, never stored here)
 */
export class VoiceRecognitionSession {
  private recognition: SpeechRecognitionLike | null = null;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private language: string;
  private readonly callbacks: VoiceRecognitionCallbacks;

  constructor(language: string, callbacks: VoiceRecognitionCallbacks) {
    this.language = language;
    this.callbacks = callbacks;
  }

  static isSupported(): boolean {
    return !!resolveRecognitionCtor();
  }

  /** Begin recognition. @returns false when no recognition API is available. */
  start(): boolean {
    return this.attach(this.language);
  }

  /** Abort the live stream and restart it with `language` after a short pause. */
  switchLanguage(language: string): void {
    this.language = language;
    const previous = this.recognition;
    if (!previous) return;
    this.recognition = null;
    previous.onresult = null;
    previous.onerror = null;
    previous.onend = null;
    try {
      previous.abort();
    } catch {
      /* already ended */
    }
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      this.attach(language);
    }, LANGUAGE_SWITCH_DELAY_MS);
  }

  /** Tear down: detach handlers, stop pending restarts, stop the stream. */
  stop(): void {
    if (this.restartTimer !== null) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    const recognition = this.recognition;
    this.recognition = null;
    if (!recognition) return;
    // Native engines commit the in-flight hypothesis before the handlers are detached.
    (recognition as { flushPending?: () => void }).flushPending?.();
    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
    try {
      recognition.stop();
    } catch {
      /* already ended */
    }
  }

  private attach(language: string): boolean {
    const Ctor = resolveRecognitionCtor();
    if (!Ctor) return false;

    const recognition = new Ctor();
    recognition.lang = language;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (ev: SpeechRecognitionEvent) => {
      let final = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const result = ev.results[i];
        if (result?.isFinal) final += result[0].transcript;
      }
      if (final) this.callbacks.onFinalChunk(final);
    };

    recognition.onerror = (ev: SpeechRecognitionErrorEvent) => {
      if (ev.error === "not-allowed" || ev.error === "service-not-allowed") {
        this.callbacks.onPermissionDenied();
      } else if (ev.error !== "no-speech") {
        console.warn("[voice-input] Erkennungsfehler:", ev.error);
        this.callbacks.onOtherError();
      }
    };

    recognition.onend = () => {
      if (this.recognition !== recognition) return;
      try {
        recognition.start();
      } catch {
        this.callbacks.onOtherError();
      }
    };

    this.recognition = recognition;
    try {
      recognition.start();
    } catch {
      this.recognition = null;
      this.callbacks.onStartFailed();
      return false;
    }
    return true;
  }
}
