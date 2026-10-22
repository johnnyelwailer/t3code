import type { VoiceInputPhase } from "@t3tools/client-runtime/voice-input";

import type { VoiceStreamView } from "~/voice/t3team-useVoiceStream";

/**
 * What the dictation pill says while a recording runs: input level, the latest partial, a note
 * while committed utterances are written down (the recording stays open), then finalizing.
 */
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

export function VoiceStreamStatus({
  phase,
  stream,
}: {
  readonly phase: VoiceInputPhase;
  readonly stream: VoiceStreamView;
}) {
  const text = voiceStreamStatusText(phase, stream.partial, stream.writing);
  if (text === null) return null;
  return (
    <>
      {phase === "recording" && (
        <span
          aria-hidden
          data-testid="voice-level"
          className="size-2 shrink-0 rounded-full bg-destructive"
          style={{ opacity: 0.35 + 0.65 * stream.level }}
        />
      )}
      <span role="status" className="max-w-xs truncate text-xs text-muted-foreground">
        {text}
      </span>
    </>
  );
}
