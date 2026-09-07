/**
 * Controls + lifecycle for the useVoiceInput hook: language switch, stop-mode
 * picking, toggle, public stop and the unmount teardown. Split out of
 * t3team-useVoiceInput.ts so each file stays under the additive guard's
 * 200 non-empty line ceiling.
 */
import { useCallback, useEffect } from "react";

import type { StopMode, VoiceState } from "./t3team-types.ts";

// Structural stand-ins for the browser-coupled session/auto-stop types: keeping
// this module free of imports from t3team-recognition.ts / t3team-autoSend.ts
// keeps those browser-global modules out of the shared package's Effect-lint
// scope (see packages/shared/tsconfig.json).
interface VoiceRecognitionSessionLike {
  stop(): void;
  switchLanguage(code: string): void;
}
interface SilenceAutoStopLike {
  setMode(mode: StopMode): void;
}

export interface VoiceInputControlsDeps {
  readonly state: VoiceState;
  readonly stateRef: { readonly current: VoiceState };
  readonly sessionRef: { current: VoiceRecognitionSessionLike | null };
  readonly autoStopRef: { current: SilenceAutoStopLike | null };
  readonly barsStopRef: { current: (() => void) | null };
  readonly audioCtxRef: { current: AudioContext | null };
  readonly accumulatedRef: { current: string };
  readonly autoResumeRef: { current: boolean };
  readonly startRecording: () => void;
  readonly stopRecording: (cancelled: boolean, autoSubmit?: boolean) => void;
}

export interface VoiceInputControls {
  readonly switchLang: (code: string) => void;
  readonly pickStopMode: (mode: StopMode) => void;
  readonly toggle: () => void;
  readonly stop: () => string;
}

export function useVoiceInputControls(
  deps: VoiceInputControlsDeps,
  setStopMode: (mode: StopMode) => void,
  setCurrentLang: (code: string) => void,
): VoiceInputControls {
  const {
    state,
    stateRef,
    sessionRef,
    autoStopRef,
    barsStopRef,
    audioCtxRef,
    accumulatedRef,
    autoResumeRef,
    startRecording,
    stopRecording,
  } = deps;

  // Support detection teardown on unmount.
  useEffect(() => {
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

  // Public stop: commits the transcript and exits voice mode WITHOUT the
  // auto-resume that auto-sends trigger (a manual send ends voice mode).
  // Returns the committed text ("" when idle) so callers can send it in
  // the same tick without waiting for the state round-trip.
  const stop = useCallback((): string => {
    const text = stateRef.current === "idle" ? "" : accumulatedRef.current;
    stopRecording(false);
    return text;
  }, [stopRecording]);

  return { switchLang, pickStopMode, toggle, stop };
}
