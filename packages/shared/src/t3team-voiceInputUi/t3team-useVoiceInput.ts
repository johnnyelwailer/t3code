import { useCallback, useEffect, useRef, useState } from "react";

import { startVoiceBars } from "./t3team-audioLevel.ts";
import { frameFromClock } from "./t3team-waveform.ts";
import { createRecordingSession } from "./t3team-recordingSession.ts";
import { SilenceAutoStop } from "./t3team-autoSend.ts";
import {
  pickVoiceMime,
  startAudioCapture,
  type AudioCaptureHandle,
} from "./t3team-audioCapture.ts";
import {
  BAR_COUNT,
  type StopMode,
  type VoiceState,
  type VoiceInput,
  type VoiceInputOptions,
} from "./t3team-types.ts";
import { useVoiceInputControls } from "./t3team-useVoiceInputControls.ts";
import { scheduleAutoResume, startSilenceWatch } from "./t3team-recordingTimers.ts";
import { VoiceRecognitionSession } from "./t3team-recognition.ts";

export type { VoiceInput, VoiceInputOptions } from "./t3team-types.ts";

export function useVoiceInput(options: VoiceInputOptions): VoiceInput {
  const {
    onTranscript,
    onPartialTranscript,
    onAutoSubmit,
    onStateChange,
    initialLanguage,
    onLevel, onRecorded,
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
  const captureRef = useRef<AudioCaptureHandle | null>(null);
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
      const capture = captureRef.current;
      captureRef.current = null;
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
      if (cancelled) {
        void capture?.stop(); // discard the in-progress recording
        if (onRecorded !== undefined) onRecorded(null);
        return;
      }
      if (!text) console.info("[voice-input] Aufnahme beendet, kein Transkript erhalten");
      onTranscript(text);
      if (onRecorded !== undefined) {
        if (capture) void capture.stop().then((rec) => onRecorded(rec));
        else onRecorded(null);
      }
      if (autoSubmit) {
        onAutoSubmit?.();
        // Stay in voice mode after the auto-send (see scheduleAutoResume).
        scheduleAutoResume({ stateRef, autoResumeRef, startRecordingRef });
      }
    },
    [onLevel, onTranscript, onAutoSubmit, onRecorded, transition],
  );

  // Start: permission state, then recognition + waveform.
  const startRecording = useCallback(() => {
    transition("waiting");
    accumulatedRef.current = "";

    const autoStop = new SilenceAutoStop(stopMode);
    autoStopRef.current = autoStop;

    const session = createRecordingSession(currentLang, {
      accumulatedRef,
      onPartialTranscript,
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
      if (onRecorded === undefined) {
        if (audioCtx) audioCtx.close().catch(() => {});
        audioCtxRef.current = null;
        transition("denied");
        return;
      }
    }
    autoStop.prime(Date.now());
    transition("recording");

    window.clearInterval(silenceTimerRef.current);
    silenceTimerRef.current = startSilenceWatch({
      stateRef,
      levelNowRef,
      autoStop,
      hasContent: () => accumulatedRef.current.trim() !== "" || !!captureRef.current?.hasAudio(),
      onCommit: () => stopRecording(false, true),
    });

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
      onStream: (stream) => {
        if (onRecorded !== undefined) captureRef.current = startAudioCapture(stream);
      },
    });
  }, [currentLang, onLevel, onPartialTranscript, onRecorded, stopMode, stopRecording, transition]);
  startRecordingRef.current = startRecording;

  // Support detection: usable via STT OR via raw audio capture (attach mode).
  useEffect(() => {
    setSupported(
      VoiceRecognitionSession.isSupported() ||
        (onRecorded !== undefined && pickVoiceMime() !== null),
    );
  }, [onRecorded]);
  // switchLang / pickStopMode / toggle / stop + Esc + unmount: useVoiceInputControls.
  const { switchLang, pickStopMode, toggle, stop } = useVoiceInputControls(
    {
      state,
      stateRef,
      sessionRef,
      autoStopRef,
      barsStopRef,
      audioCtxRef,
      captureRef,
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
