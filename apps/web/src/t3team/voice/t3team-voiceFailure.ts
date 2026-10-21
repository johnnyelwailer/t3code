import type { VoiceTranscriptionErrorCode } from "@t3tools/client-runtime/voice-input";

export type VoiceFailureCode =
  | Exclude<VoiceTranscriptionErrorCode, "cancelled">
  | "mic-denied"
  | "hotkey-unavailable"
  | "no-project"
  | "send-failed";

const MESSAGES: Readonly<Record<VoiceFailureCode, string>> = {
  unavailable: "Speech recognition isn't available on this device.",
  "unsupported-locale": "This language isn't supported for speech recognition.",
  "preparation-failed": "Speech recognition couldn't start. Try again in a moment.",
  "model-unavailable": "The speech model isn't available. Check the voice settings.",
  "transcription-failed": "Couldn't understand that recording. Please say it again.",
  "mic-denied": "The microphone is unavailable or in use by another app.",
  "hotkey-unavailable": "The voice shortcut is taken by another app, so it can't be used.",
  "no-project": "Open a project first so voice has a place to live.",
  "send-failed": "The voice message couldn't be sent.",
};

export const voiceFailureMessage = (code: VoiceFailureCode, detail?: string): string =>
  detail === undefined || detail === "" || code === "no-project"
    ? MESSAGES[code]
    : `${MESSAGES[code]} (${detail})`;
