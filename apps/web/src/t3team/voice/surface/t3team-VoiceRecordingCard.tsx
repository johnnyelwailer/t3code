import { SquareIcon } from "lucide-react";
import { useRef } from "react";

import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";
import { VoiceClock } from "./t3team-VoiceClock";
import { VoiceHotkeyHint } from "./t3team-VoiceHotkeyHint";
import { VoiceOrb } from "./t3team-VoiceOrb";
import { VoiceTranscript } from "./t3team-VoiceTranscript";
import { VOICE_CLASS } from "./t3team-voiceClasses";
import { useVoiceCanvas } from "./t3team-useVoiceCanvas";
import { useVoiceSessionNote } from "./t3team-useVoiceSessionNote";
import { useVoiceUiStore } from "./t3team-voiceUiStore";
import { useVoiceView } from "./t3team-voiceView";
import "~/t3team/voice/surface/t3team-voice.css";

/**
 * The live recording: layered ribbon waveform, the transcript as it streams in, the timer and a
 * Stop. `compact` is the floating widget's smaller cut of the same card.
 */
export function VoiceRecordingCard(props: {
  readonly keys: readonly string[];
  readonly compact?: boolean;
  /** A glow behind the card that breathes with the voice (the floating widget's). */
  readonly ambient?: boolean;
  /** Part of the composer's dock: no card of its own, the dock is the surface. */
  readonly docked?: boolean;
  /** The transcript to show instead of the live one, while a collapsing dock holds its face. */
  readonly transcript?: string;
}) {
  const { keys, compact = false, ambient = false, docked = false } = props;
  const state = useVoiceView((view) => view.snapshot.state);
  const livePartial = useVoiceView((view) => view.live.partial);
  const partial = props.transcript ?? livePartial;
  const controls = useVoiceUiStore((store) => store.controls);
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useVoiceCanvas({ kind: "ribbon", active: true, glowRef: rootRef });
  const writing = state === "transcribing";
  const { note, writingLabel } = useVoiceSessionNote();

  return (
    <div ref={rootRef} className={cn(VOICE_CLASS.scope, "relative")}>
      {ambient && !writing ? <div aria-hidden className={VOICE_CLASS.glow} /> : null}
      <div
        data-testid="voice-recording-card"
        data-state={state}
        data-tone={writing || docked ? undefined : "live"}
        className={cn(!docked && VOICE_CLASS.card, "relative")}
      >
        <div className="mb-2.5 flex items-center gap-2.5">
          <VoiceOrb state={state} size="lg" onClick={() => controls?.toggle()} />
          <span className="flex flex-1 items-center gap-2 font-medium text-xs">
            {writing ? (
              <span className="text-muted-foreground">{writingLabel}</span>
            ) : (
              <>
                <i className={VOICE_CLASS.dot} />
                {note.kind === "heard" ? "Heard, still listening" : "Listening"}
                {note.kind === "writing" ? (
                  <span className="font-normal text-muted-foreground">· {writingLabel}</span>
                ) : null}
              </>
            )}
          </span>
          <VoiceClock tenths className="font-mono text-xs tabular-nums" />
        </div>
        <div
          className={VOICE_CLASS.wave}
          data-dim={writing ? "" : undefined}
          data-compact={compact ? "" : undefined}
        >
          <canvas ref={canvasRef} aria-hidden />
          {writing ? (
            <span className={cn(VOICE_CLASS.shimmer, "absolute inset-x-0 bottom-0")} />
          ) : null}
        </div>
        <div className={cn("my-3 px-0.5", compact && "max-h-16 overflow-hidden")}>
          <VoiceTranscript
            text={partial}
            live={!writing}
            placeholder="Say something…"
            className={compact ? "text-sm" : "text-base"}
          />
        </div>
        <div className="flex items-center gap-3">
          <Button size="sm" disabled={writing} onClick={() => controls?.toggle()}>
            <SquareIcon className="fill-current" aria-hidden />
            Stop
          </Button>
          {writing ? null : <VoiceHotkeyHint keys={keys} lead="or press" suffix="again" />}
        </div>
      </div>
    </div>
  );
}
