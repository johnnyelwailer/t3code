import { useRef } from "react";

import { cn } from "~/lib/utils";
import { VoiceOrb } from "./t3team-VoiceOrb";
import { VoiceRowAux, VoiceRowMid } from "./t3team-VoiceRowParts";
import { VOICE_CLASS } from "./t3team-voiceClasses";
import { useVoiceCanvas } from "./t3team-useVoiceCanvas";
import { useVoiceSessionNote } from "./t3team-useVoiceSessionNote";
import { useVoiceUiStore } from "./t3team-voiceUiStore";
import "~/t3team/voice/surface/t3team-voice.css";

/**
 * The sidebar row of the voice thread: the record control lives on it, and it carries the live
 * state (waveform and timer while listening, a running count while a pass writes, a "heard"
 * moment, a failure with its retry). The whole row is one click target: it opens the thread, or,
 * when the thread is already open (or there is none yet), starts and stops the recording, so a
 * click never lands on nothing. The orb and the end button keep their own actions.
 */
export function VoiceThreadRow(props: {
  readonly title: string;
  readonly isActive: boolean;
  readonly keys: readonly string[];
  readonly onOpen?: () => void;
}) {
  const { title, isActive, keys, onOpen } = props;
  const state = useVoiceUiStore((store) => store.snapshot.state);
  const controls = useVoiceUiStore((store) => store.controls);
  const { note, writingLabel } = useVoiceSessionNote();
  const rowRef = useRef<HTMLDivElement>(null);
  const canvasRef = useVoiceCanvas({
    kind: "bars",
    active: state === "recording" && note.kind === "listening",
    glowRef: rowRef,
  });

  const activate = () => {
    if (onOpen !== undefined && !isActive) onOpen();
    else controls?.toggle();
  };

  return (
    <div
      ref={rowRef}
      data-testid="voice-thread-row"
      data-state={state}
      data-active={isActive}
      className={cn(
        VOICE_CLASS.scope,
        VOICE_CLASS.row,
        "relative flex h-8 min-w-0 select-none items-center gap-2 rounded-lg border border-border bg-card px-1.25 pr-2 text-xs",
      )}
    >
      <span className="relative z-10 grid shrink-0">
        <VoiceOrb state={state} onClick={() => controls?.toggle()} />
      </span>
      <button
        type="button"
        aria-current={isActive ? "page" : undefined}
        onClick={activate}
        className="flex min-w-0 flex-1 cursor-pointer items-center bg-transparent p-0 text-left outline-hidden after:absolute after:inset-0 after:rounded-lg after:content-[''] focus-visible:after:ring-1 focus-visible:after:ring-inset focus-visible:after:ring-ring"
      >
        <VoiceRowMid
          state={state}
          title={title}
          note={note}
          writingLabel={writingLabel}
          canvasRef={canvasRef}
        />
      </button>
      <span className="pointer-events-none relative z-10 flex shrink-0 items-center justify-end">
        <VoiceRowAux state={state} keys={keys} controls={controls} />
      </span>
    </div>
  );
}
