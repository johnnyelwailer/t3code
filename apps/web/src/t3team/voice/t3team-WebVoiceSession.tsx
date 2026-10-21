import type { VoiceInputPhase } from "@t3tools/client-runtime/voice-input";
import {
  ComposerVoiceInput,
  type ComposerVoiceInputHandle,
  type ComposerVoiceInputProps,
} from "@t3tools/shared/voiceInputUi";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";

import { useVoiceUiPublisher } from "./surface/t3team-useVoiceUiPublisher";
import { dispatchVoiceUi, useVoiceUiStore } from "./surface/t3team-voiceUiStore";

type WebVoiceState = Parameters<NonNullable<ComposerVoiceInputProps["onStateChange"]>>[0];

const PHASE_OF_WEB_STATE: Readonly<Record<WebVoiceState, VoiceInputPhase>> = {
  idle: "idle",
  waiting: "preparing",
  recording: "recording",
  denied: "error",
};

const speechRecognitionSupported = () =>
  "SpeechRecognition" in window || "webkitSpeechRecognition" in window;

const noSession = () => null;

/**
 * The browser recorder (Web Speech), headless: the shared input runs unchanged and only its
 * state, level and transcript are published to the voice surfaces.
 */
export function WebVoiceSession(props: {
  readonly onTranscript: (text: string) => void;
  readonly toggleRef: RefObject<(() => void) | null>;
}) {
  const { onTranscript, toggleRef } = props;
  const handleRef = useRef<ComposerVoiceInputHandle>(null);
  const [webState, setWebState] = useState<WebVoiceState>("idle");
  const supported = useMemo(speechRecognitionSupported, []);

  const controls = useMemo(
    () =>
      supported
        ? {
            toggle: () => handleRef.current?.toggle(),
            dismiss: () => dispatchVoiceUi({ type: "dismiss" }),
            openMicrophoneSettings: null,
          }
        : null,
    [supported],
  );

  useVoiceUiPublisher({
    phase: PHASE_OF_WEB_STATE[webState],
    errorAction: webState === "denied" ? "settings" : null,
    error: null,
    downloadPercent: null,
    sessionId: noSession,
    controls,
  });

  useEffect(() => {
    toggleRef.current = controls === null ? null : controls.toggle;
    return () => {
      toggleRef.current = null;
    };
  }, [controls, toggleRef]);

  return (
    <div hidden>
      <ComposerVoiceInput
        ref={handleRef}
        onTranscript={onTranscript}
        onStateChange={setWebState}
        onPartialTranscript={(partial) => useVoiceUiStore.getState().setLive({ partial })}
        onLevel={(level) => useVoiceUiStore.getState().setLive({ level })}
      />
    </div>
  );
}
