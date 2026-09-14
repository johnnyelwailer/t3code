import { useCallback, useEffect, useRef, useState } from "react";

import { startVoiceBars } from "./t3team-audioLevel.ts";
import { frameFromClock } from "./t3team-waveform.ts";
import { VoiceRecognitionSession } from "./t3team-recognition.ts";
import { SilenceAutoStop } from "./t3team-autoSend.ts";
import {
  BAR_COUNT,
  type StopMode,
  type VoiceState,
  type VoiceInput,
  type VoiceInputOptions,
} from "./t3team-types.ts";
import { useVoiceInputControls } from "./t3team-useVoiceInputControls.ts";

export type { VoiceInput, VoiceInputOptions } from "./t3team-types.ts";

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
  const silenceTimerRef = useRef(0);
  const levelNowRef = useRef(0);

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
      window.clearInterval(silenceTimerRef.current);
      silenceTimerRef.current = 0;
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

    // Silence auto-stop runs on a 250ms timer, NOT on the rAF loop: rAF is
    // throttled or paused when the tab loses focus, and auto-send must keep
    // working even when the user alt-tabs away mid-recording.
    window.clearInterval(silenceTimerRef.current);
    silenceTimerRef.current = window.setInterval(() => {
      if (stateRef.current !== "recording") return;
      if (autoStop.observe(levelNowRef.current, Date.now())) {
        if (accumulatedRef.current.trim()) {
          // Something was said: commit + send, then stay in voice mode.
          stopRecording(false, true);
        } else {
          // Nothing to send yet: keep listening, reset the silence clock.
          autoStop.prime(Date.now());
        }
      }
    }, 250);

    barsStopRef.current = startVoiceBars({
      audioContext: audioCtx,
      bars: () => barElsRef.current,
      clock: () => performance.now(),
      cssFrame: () => frameFromClock(Date.now(), BAR_COUNT),
      onEnergy: (level) => {
        levelNowRef.current = level;
        onLevel?.(level);
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

  // Support detection.
  useEffect(() => {
    setSupported(VoiceRecognitionSession.isSupported());
  }, []);

  // switchLang / pickStopMode / toggle / stop + Esc handling + unmount
  // teardown live in useVoiceInputControls (guard LOC ceiling).
  const { switchLang, pickStopMode, toggle, stop } = useVoiceInputControls(
    {
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
    },
    setStopMode,
    setCurrentLang,
  );

  return {
    supported,
    state,
    currentLang,
    stopMode,
    pickStopMode,
    toggle,
    switchLang,
    setBarEl,
    stop,
  };
}
