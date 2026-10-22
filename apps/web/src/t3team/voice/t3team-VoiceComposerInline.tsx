import { SquareIcon } from "lucide-react";

import { cn } from "~/lib/utils";
import { VoiceClock } from "./surface/t3team-VoiceClock";
import { VoiceProgress } from "./surface/t3team-VoiceRowParts";
import { useVoiceSessionNote } from "./surface/t3team-useVoiceSessionNote";
import { VOICE_WARMING_LABEL } from "./surface/t3team-voiceSessionNote";
import { useVoiceUiStore } from "./surface/t3team-voiceUiStore";
import { useIsVoiceThread } from "./t3team-useIsVoiceThread";

/**
 * The voice thread's live recording, inside the composer itself: a small level dot, the words
 * streaming in where the message is typed, a quiet timer and a small stop. No card, border, fill
 * or tint (the plain style of the voice row); the hotkey stops it too. While the speech model
 * warms up it says so with a thin bar, and the microphone is already recording meanwhile.
 */
export function VoiceComposerInline(props: {
  readonly environmentId: string;
  readonly threadId: string | null;
}) {
  const isVoiceThread = useIsVoiceThread(props.environmentId, props.threadId);
  const state = useVoiceUiStore((store) => store.snapshot.state);
  const controls = useVoiceUiStore((store) => store.controls);
  const partial = useVoiceUiStore((store) => store.live.partial);
  const level = useVoiceUiStore((store) => store.live.level);
  const { note, writingLabel } = useVoiceSessionNote();
  const recording = state === "recording";
  if (!isVoiceThread || controls === null || (!recording && state !== "transcribing")) return null;

  const placeholder =
    note.kind === "warming"
      ? VOICE_WARMING_LABEL
      : (writingLabel ?? (note.kind === "heard" ? "Heard, still listening…" : "Listening…"));
  return (
    <div
      data-testid="voice-composer-inline"
      data-state={state}
      className="flex min-w-0 items-start gap-2 pb-2 text-sm"
    >
      <span
        aria-hidden
        data-testid="voice-inline-level"
        className={cn(
          "mt-[0.4rem] size-2 shrink-0 rounded-full",
          recording ? "bg-destructive" : "bg-muted-foreground/40",
        )}
        style={recording ? { opacity: 0.35 + 0.65 * level } : undefined}
      />
      <span
        role="status"
        aria-live="polite"
        className={cn(
          "min-w-0 flex-1 whitespace-pre-wrap break-words",
          partial === "" ? "text-muted-foreground" : "text-foreground",
        )}
      >
        {partial === "" ? placeholder : partial}
        {note.kind === "warming" ? (
          <span className="ms-2 inline-block w-16 align-middle">
            <VoiceProgress label="Warming up the speech model" percent={note.percent} />
          </span>
        ) : null}
      </span>
      <VoiceClock className="mt-[0.15rem] shrink-0 font-mono text-2xs tabular-nums text-muted-foreground/70" />
      {recording ? (
        <button
          type="button"
          aria-label="Stop recording"
          onClick={() => controls.toggle()}
          className="mt-[0.1rem] grid size-5 shrink-0 cursor-pointer place-items-center rounded-md text-muted-foreground outline-hidden hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          <SquareIcon className="size-3 fill-current" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
