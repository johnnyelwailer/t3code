import { useRef, type MouseEvent } from "react";

import { cn } from "~/lib/utils";
import { VoiceOrb } from "./t3team-VoiceOrb";
import { VoiceRowAux, VoiceRowMid } from "./t3team-VoiceRowParts";
import { VOICE_CLASS } from "./t3team-voiceClasses";
import { useVoiceCanvas } from "./t3team-useVoiceCanvas";
import { useVoiceUiStore } from "./t3team-voiceUiStore";
import "~/t3team/voice/surface/t3team-voice.css";

/**
 * The sidebar row of the voice thread: the record control lives on it, and it carries the live
 * state (waveform and timer, shimmer while writing, a "heard" moment, a failure with its retry).
 * Without a thread yet (`onOpen` absent) it is the way in to the first recording.
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
  const rowRef = useRef<HTMLDivElement>(null);
  const canvasRef = useVoiceCanvas({
    kind: "bars",
    active: state === "recording",
    glowRef: rowRef,
  });

  const toggle = (event: MouseEvent) => {
    event.stopPropagation();
    controls?.toggle();
  };

  return (
    <div
      ref={rowRef}
      data-testid="voice-thread-row"
      data-state={state}
      data-active={isActive}
      onClick={onOpen}
      className={cn(
        VOICE_CLASS.scope,
        VOICE_CLASS.row,
        "relative grid h-8 select-none grid-cols-[1.25rem_auto_minmax(0,1fr)_auto] items-center gap-2 rounded-lg border border-border bg-card px-1.25 pr-2 text-xs",
        onOpen && "cursor-pointer",
      )}
    >
      <VoiceOrb state={state} onClick={toggle} />
      <button
        type="button"
        tabIndex={onOpen ? 0 : -1}
        className="cursor-[inherit] bg-transparent p-0 text-left font-medium text-foreground outline-hidden focus-visible:underline"
      >
        {title}
      </button>
      <VoiceRowMid state={state} canvasRef={canvasRef} />
      <VoiceRowAux state={state} keys={keys} controls={controls} />
    </div>
  );
}
