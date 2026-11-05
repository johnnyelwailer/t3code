/**
 * What the dictation status says while a recording runs, for screen readers: the latest partial,
 * a note while committed utterances are written down (the recording stays open), then finalizing.
 * The partial itself is visible inside the draft as ghost text.
 */
import type { VoiceInputPhase } from "@t3tools/client-runtime/voice-input";

export function voiceStreamStatusText(
  phase: VoiceInputPhase,
  partial: string,
  writing = 0,
): string | null {
  if (phase === "recording") {
    if (partial !== "") return partial;
    return writing > 0 ? "Transcribing…" : "Listening…";
  }
  if (phase === "transcribing") return "Finalizing…";
  return null;
}
