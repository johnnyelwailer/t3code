import { CheckIcon, ExternalLinkIcon, RotateCcwIcon } from "lucide-react";
import type { MouseEvent, RefObject } from "react";

import { cn } from "~/lib/utils";
import { VoiceClock } from "./t3team-VoiceClock";
import { VOICE_CLASS } from "./t3team-voiceClasses";
import { failedTitle } from "./t3team-voiceFailureCopy";
import type { VoiceUiState } from "./t3team-voiceUiModel";
import { useVoiceUiStore, type VoiceUiControls } from "./t3team-voiceUiStore";

export function VoiceProgress(props: { readonly label: string }) {
  const percent = useVoiceUiStore((store) => store.snapshot.downloadPercent);
  return (
    <span
      role="progressbar"
      aria-label={props.label}
      aria-valuenow={percent ?? undefined}
      className={VOICE_CLASS.progress}
    >
      <i style={{ width: `${percent ?? 8}%` }} />
    </span>
  );
}

const quiet = (text: string) => (
  <span className="truncate text-2xs text-muted-foreground">{text}</span>
);

/** The middle of the row: exactly one thing per state, entering as the state changes. */
export function VoiceRowMid(props: {
  readonly state: VoiceUiState;
  readonly canvasRef: RefObject<HTMLCanvasElement | null>;
}) {
  const { state, canvasRef } = props;
  const failureDetail = useVoiceUiStore((store) => store.snapshot.failureDetail);
  return (
    <span key={state} className={cn(VOICE_CLASS.enter, "flex h-8 min-w-0 items-center")}>
      {state === "recording" ? (
        <canvas ref={canvasRef} aria-hidden className="block h-4 w-full" />
      ) : state === "transcribing" ? (
        <span className={cn(VOICE_CLASS.shimmer, "w-full")} aria-label="Writing it down" />
      ) : state === "committed" ? (
        <span className="inline-flex items-center gap-1 font-medium text-2xs text-success-foreground">
          <CheckIcon className="size-3" aria-hidden />
          heard
        </span>
      ) : state === "preparing" ? (
        <span className="w-full">
          <VoiceProgress label="Preparing voice model" />
        </span>
      ) : state === "denied" ? (
        quiet("microphone blocked")
      ) : state === "failed" ? (
        quiet(failedTitle(failureDetail).toLowerCase())
      ) : null}
    </span>
  );
}

const roundAction =
  "grid size-5 cursor-pointer place-items-center rounded-full bg-primary/10 text-primary outline-hidden hover:bg-primary/16 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring";

/** The end of the row: the shortcut at rest, the timer while recording, the retry or settings after a failure. */
export function VoiceRowAux(props: {
  readonly state: VoiceUiState;
  readonly keys: readonly string[];
  readonly controls: VoiceUiControls | null;
}) {
  const { state, keys, controls } = props;
  const percent = useVoiceUiStore((store) => store.snapshot.downloadPercent);
  const act = (action: (() => void) | null | undefined) => (event: MouseEvent) => {
    event.stopPropagation();
    action?.();
  };
  if (state === "recording" || state === "transcribing") {
    return (
      <VoiceClock
        className={cn(
          "font-mono text-2xs tabular-nums",
          state === "recording" ? "text-foreground" : "text-muted-foreground/60",
        )}
      />
    );
  }
  if (state === "failed") {
    return (
      <button
        type="button"
        aria-label="Try again"
        className={roundAction}
        onClick={act(controls?.toggle)}
      >
        <RotateCcwIcon className="size-3" aria-hidden />
      </button>
    );
  }
  if (state === "denied") {
    return (
      <button
        type="button"
        aria-label="Open microphone settings"
        className={roundAction}
        onClick={act(controls?.openMicrophoneSettings)}
      >
        <ExternalLinkIcon className="size-3" aria-hidden />
      </button>
    );
  }
  if (state === "preparing") {
    return percent === null ? null : (
      <span className="font-mono text-2xs tabular-nums text-muted-foreground">{percent}%</span>
    );
  }
  return keys.length === 0 ? null : (
    <span className={cn(VOICE_CLASS.hotkey, "font-mono text-3xs text-muted-foreground")}>
      {keys.join("·")}
    </span>
  );
}
