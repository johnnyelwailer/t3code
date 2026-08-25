import { useCallback, useEffect, useRef, useState } from "react";
import { startVoiceBars } from "./audioLevel.ts";
import { frameFromClock } from "./waveform.ts";
import { VoiceRecognitionSession } from "./recognition.ts";
import { SilenceAutoStop } from "./autoSend.ts";
import { BAR_COUNT, type StopMode, type VoiceState } from "./types.ts";

export interface VoiceInputOptions {
  onTranscript: (text: string) => void;
  onPartialTranscript?: (text: string) => void;
  onAutoSubmit?: () => void;
  /** Observes every state transition (used for app-side UI, e.g. clearing live text). */
  onStateChange?: (state: VoiceState) => void;
  /**
   * Per-frame voice level 0..1 while recording (0 on idle).
   * Fires every animation frame — the app must handle it without
   * re-rendering (e.g. writing a CSS variable or shadow).
   */
  onLevel?: (level: number) => void;
  initialLanguage: string;
}

export interface VoiceInput {
  supported: boolean;
  state: VoiceState;
  currentLang: string;
  stopMode: StopMode;
  pickStopMode: (mode: StopMode) => void;
  toggle: () => void;
  switchLang: (code: string) => void;
  /** Ref callback for the i-th waveform bar element. */
  setBarEl: (index: number, el: HTMLSpanElement | null) => void;
}

/**
 * All state and side effects of the composer voice input, separated from the
 * rendering so the component files stay thin and the logic stays testable.
 */
export function useVoiceInput(options: VoiceInputOptions): VoiceInput {
  const {
    onTranscript,
    onPartialTranscript,
    onAutoSubmit,
    onStateChange,
    initialLanguage,
    onLevel,
  } = options;

  const [state, setState] = useState<VoiceState>("idle");
  const [supported, setSupported] = useState(true);
  const [currentLang, setCurrentLang] = useState(initialLanguage);
  const [stopMode, setStopMode] = useState<StopMode>("manual");

  const stateRef = useRef<VoiceState>("idle");
  const sessionRef = useRef<VoiceRecognitionSession | null>(null);
  const autoStopRef = useRef<SilenceAutoStop | null>(null);
  const barsStopRef = useRef<(() => void) | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const accumulatedRef = useRef("");
  const barElsRef = useRef<Array<HTMLSpanElement | null>>([]);
  const autoResumeRef = useRef(false);
  const startRecordingRef = useRef<() => void>(() => {});

  const transition = useCallback(
    (next: VoiceState) => {
      stateRef.current = next;
      setState(next);
      onStateChange?.(next);
    },
    [onStateChange],
  );

  const setBarEl = useCallback((index: number, el: HTMLSpanElement | null) => {
    barElsRef.current[index] = el;
  }, []);

  // Stop the recording: tear down bars/ctx/session, then commit or discard.
  const stopRecording = useCallback(
    (cancelled: boolean, autoSubmit?: boolean) => {
      if (stateRef.current === "idle") return;
      transition("idle");

      barsStopRef.current?.();
      barsStopRef.current = null;
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }
      sessionRef.current?.stop();
      sessionRef.current = null;

      const text = accumulatedRef.current;
      accumulatedRef.current = "";
      onLevel?.(0);
      if (cancelled) return;
      if (!text) console.info("[voice-input] Aufnahme beendet, kein Transkript erhalten");
      onTranscript(text);
      if (autoSubmit) {
        onAutoSubmit?.();
        // Stay in voice mode: right after the auto-send, start listening
        // again (new session, new silence clock). Only a manual tap or Esc
        // actually leaves voice mode. The ref breaks the callback cycle
        // between stopRecording and startRecording.
        autoResumeRef.current = true;
        window.setTimeout(() => {
          if (!autoResumeRef.current) return;
          autoResumeRef.current = false;
          if (stateRef.current !== "idle") return;
          startRecordingRef.current();
        }, 150);
      }
    },
    [onLevel, onTranscript, onAutoSubmit, transition],
  );

  // Start: permission state, then recognition + waveform.
  const startRecording = useCallback(() => {
    transition("waiting");
    accumulatedRef.current = "";

    const autoStop = new SilenceAutoStop(stopMode);
    autoStopRef.current = autoStop;

    const session = new VoiceRecognitionSession(currentLang, {
      onFinalChunk: (chunk) => {
        // Final chunks arrive word-by-word without separators — join with a
        // single space so "hallo" + "welt" reads "hallo welt".
        accumulatedRef.current = accumulatedRef.current
          ? `${accumulatedRef.current} ${chunk}`
          : chunk;
        onPartialTranscript?.(accumulatedRef.current);
      },
      onPermissionDenied: () => {
        console.warn("[voice-input] Mikrofon-Zugriff verweigert");
        stopRecording(true);
        transition("denied");
      },
      onOtherError: () => stopRecording(false),
      onStartFailed: () => transition("denied"),
    });
    sessionRef.current = session;

    let audioCtx: AudioContext | null = null;
    try {
      audioCtx = new AudioContext();
      // Browsers may create the context suspended (autoplay policy); the
      // analyser stays flat and the bars never move unless it is resumed.
      void audioCtx.resume().catch(() => {});
    } catch {
      /* CSS fallback */
    }
    audioCtxRef.current = audioCtx;

    if (!session.start()) {
      if (audioCtx) audioCtx.close().catch(() => {});
      audioCtxRef.current = null;
      transition("denied");
      return;
    }
    autoStop.prime(Date.now());
    transition("recording");

    barsStopRef.current = startVoiceBars({
      audioContext: audioCtx,
      bars: () => barElsRef.current,
      clock: () => performance.now(),
      cssFrame: () => frameFromClock(Date.now(), BAR_COUNT),
      onEnergy: (level) => {
        onLevel?.(level);
        if (autoStop.observe(level, Date.now())) {
          if (accumulatedRef.current.trim()) {
            // Something was said: commit + send, then stay in voice mode.
            stopRecording(false, true);
          } else {
            // Nothing to send yet: keep listening, reset the silence clock.
            autoStop.prime(Date.now());
          }
        }
      },
      onFrameError: (error) => {
        console.warn("[voice-input] Waveform/Analyse-Fehler (CSS-Fallback aktiv):", error);
      },
      onAudioActive: () => {
        console.info("[voice-input] Audio-Analyse aktiv — Bars & Glow reagieren auf die Stimme");
      },
    });
  }, [currentLang, onLevel, onPartialTranscript, stopMode, stopRecording, transition]);
  startRecordingRef.current = startRecording;

  // Support detection + full teardown on unmount.
  useEffect(() => {
    setSupported(VoiceRecognitionSession.isSupported());
    return () => {
      autoResumeRef.current = false;
      sessionRef.current?.stop();
      sessionRef.current = null;
      barsStopRef.current?.();
      barsStopRef.current = null;
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }
    };
  }, []);

  // Language switch while recording (restarts the recognition stream).
  const switchLang = useCallback(
    (code: string) => {
      setCurrentLang(code);
      if (state !== "recording" || !sessionRef.current) return;
      sessionRef.current.switchLanguage(code);
    },
    [state],
  );

  // Esc cancels (discards the transcript).
  useEffect(() => {
    if (state !== "recording") return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") stopRecording(true);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [state, stopRecording]);

  // Pick a stop mode: UI state + the live silence detector.
  const pickStopMode = useCallback((mode: StopMode) => {
    setStopMode(mode);
    autoStopRef.current?.setMode(mode);
  }, []);

  const toggle = useCallback(() => {
    if (state === "recording") stopRecording(false);
    else startRecording();
  }, [state, startRecording, stopRecording]);

  return {
    supported,
    state,
    currentLang,
    stopMode,
    pickStopMode,
    toggle,
    switchLang,
    setBarEl,
  };
}
