/**
 * ComposerVoiceInput - voice input with live waveform, language switch, and auto-send.
 *
 * Shared UI component (one source of truth) consumed by BOTH nexi-work
 * (t3code web, via @t3tools/shared) and nexi-portal (via the Vite/tsconfig
 * alias to this file).
 *
 * Behavior (the approved design):
 *   - idle: neutral round mic button in the composer
 *   - recording: ONE connected red-tinted pill — circle with 6 live bars
 *     (slow idle drift, voice adds amplitude) + attached chevron tab
 *     opening the stop-mode menu; language chips to its left
 *   - tap the circle again (or Esc) to stop; transcript appends to the draft
 *   - optional onLevel callback lets the app drive composer-level effects
 *     (e.g. a reactive glow) without re-rendering
 *
 * Structure (one module per concern, all in ./voiceInputUi/):
 *   useVoiceInput.ts    - state machine + side effects (the hook)
 *   recognition.ts      - Web Speech stream lifecycle
 *   waveform.ts         - level frames + bar animation loop
 *   audioLevel.ts       - mic analyser wiring + start-with-fallback
 *   autoSend.ts         - silence -> auto-send decision
 *   LanguageChips.tsx   - language switcher (presentational)
 *   RecordingPill.tsx   - connected record/stop pill + stop-mode menu
 *   VoiceBars.tsx       - the six live bars (presentational)
 *   types.ts            - shared types + tuning constants
 */
import { useImperativeHandle, type Ref } from "react";
import { LanguageChips } from "./voiceInputUi/LanguageChips.tsx";
import { RecordingPill } from "./voiceInputUi/RecordingPill.tsx";
import { VoiceBars } from "./voiceInputUi/VoiceBars.tsx";
import { useVoiceInput } from "./voiceInputUi/useVoiceInput.ts";
import {
  DEFAULT_LANGUAGE_CODE,
  DEFAULT_VOICE_LANGUAGES,
  type VoiceLanguageOption,
  type VoiceState,
} from "./voiceInputUi/types.ts";

export interface ComposerVoiceInputHandle {
  /**
   * Stop the recording, commit the transcript and leave voice mode —
   * without the auto-resume that auto-sends trigger. Apps call this on a
   * NORMAL (typed) send, which ends the voice conversation.
   * Returns the committed text ("" when idle).
   */
  stop: () => string;
}

export interface ComposerVoiceInputProps {
  /**
   * Host override for whether voice input is usable at all; when false the
   * component renders nothing. Default true.
   *
   * Browsers expose `SpeechRecognition` even without a reachable backend
   * (Electron on-prem: Chromium API present, Google STT network unreachable),
   * so hosts that know voice can never work gate on this instead of
   * `voice.supported`.
   */
  available?: boolean;
  onTranscript: (text: string) => void;
  onPartialTranscript?: (text: string) => void;
  onAutoSubmit?: () => void;
  /** Observes every state transition (idle | waiting | recording | denied). */
  onStateChange?: (state: VoiceState) => void;
  /**
   * Per-frame voice level 0..1 while recording (0 when idle).
   * Fires every animation frame — handle without re-rendering.
   */
  onLevel?: (level: number) => void;
  disabled?: boolean;
  className?: string;
  /** Language chips shown while recording (default: DE/FR/EN). */
  languages?: readonly VoiceLanguageOption[];
  /** Recognition language to start with (default: "en-US"). */
  initialLanguage?: string;
  /** Imperative handle: stop the recording and exit voice mode. */
  ref?: Ref<ComposerVoiceInputHandle>;
}

export function ComposerVoiceInput({
  available = true,
  onTranscript,
  onPartialTranscript,
  onAutoSubmit,
  onStateChange,
  onLevel,
  disabled = false,
  className,
  languages = DEFAULT_VOICE_LANGUAGES,
  initialLanguage = DEFAULT_LANGUAGE_CODE,
  ref,
}: ComposerVoiceInputProps) {
  const voice = useVoiceInput({
    onTranscript,
    ...(onPartialTranscript !== undefined ? { onPartialTranscript } : {}),
    ...(onAutoSubmit !== undefined ? { onAutoSubmit } : {}),
    ...(onStateChange !== undefined ? { onStateChange } : {}),
    ...(onLevel !== undefined ? { onLevel } : {}),
    initialLanguage,
  });

  useImperativeHandle(ref, () => ({ stop: voice.stop }), [voice.stop]);

  if (available === false || !voice.supported) return null;

  const isRecording = voice.state === "recording";

  return (
    <div
      className={"flex items-center gap-2 " + (className ?? "")}
      data-voice-input
      data-state={voice.state}
    >
      {isRecording && (
        <LanguageChips
          languages={languages}
          currentLang={voice.currentLang}
          onPick={voice.switchLang}
        />
      )}

      <RecordingPill
        state={voice.state}
        disabled={disabled}
        onToggle={voice.toggle}
        stopMode={voice.stopMode}
        onPickStopMode={voice.pickStopMode}
      >
        <VoiceBars registerBar={voice.setBarEl} />
      </RecordingPill>
    </div>
  );
}

export default ComposerVoiceInput;
