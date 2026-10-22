import type { VoiceUiState } from "./t3team-voiceUiModel";
import type { VoiceUiLive } from "./t3team-voiceUiStore";

/** How long "heard" stays on a recording that goes on listening. */
export const VOICE_HEARD_FLASH_MS = 1800;

/**
 * What a recording session is doing right now. A session stays open across utterances, so besides
 * `listening` there is `writing` (an utterance was committed and its text is still being written,
 * with the time it has taken) and `heard` (it just came back; the recording goes on).
 */
export type VoiceSessionNote =
  | { readonly kind: "listening" }
  | { readonly kind: "writing"; readonly sinceMs: number }
  | { readonly kind: "heard" };

export function voiceSessionNote(input: {
  readonly state: VoiceUiState;
  readonly endedAtMs: number | null;
  readonly live: Pick<VoiceUiLive, "writing" | "writingSinceMs" | "heard">;
  readonly now: number;
}): VoiceSessionNote {
  const { state, endedAtMs, live, now } = input;
  if (state === "transcribing") return { kind: "writing", sinceMs: endedAtMs ?? now };
  if (state !== "recording") return { kind: "listening" };
  if (live.writing > 0) return { kind: "writing", sinceMs: live.writingSinceMs ?? now };
  if (live.heard !== null && now - live.heard.atMs < VOICE_HEARD_FLASH_MS) return { kind: "heard" };
  return { kind: "listening" };
}

/** `Transcribing…` that starts counting once it has run for a second, so it never looks frozen. */
export function voiceWritingLabel(sinceMs: number, now: number): string {
  const seconds = Math.floor(Math.max(0, now - sinceMs) / 1000);
  return seconds < 1 ? "Transcribing…" : `Transcribing… ${seconds} s`;
}

/** When a note next changes by itself: the next whole second of a count, or the end of the heard flash. */
export function voiceSessionNoteExpiresAt(
  note: VoiceSessionNote,
  live: Pick<VoiceUiLive, "heard">,
  now: number,
): number | null {
  if (note.kind === "writing") return now + 1000 - ((now - note.sinceMs) % 1000);
  if (note.kind === "heard" && live.heard !== null) return live.heard.atMs + VOICE_HEARD_FLASH_MS;
  return null;
}
