import { CheckIcon, DownloadIcon, MicIcon, MicOffIcon, SquareIcon } from "lucide-react";
import type { MouseEvent } from "react";

import { cn } from "~/lib/utils";
import { VOICE_CLASS } from "./t3team-voiceClasses";
import type { VoiceUiState } from "./t3team-voiceUiModel";
import "~/t3team/voice/surface/t3team-voice.css";

export function voiceOrbLabel(state: VoiceUiState): string {
  switch (state) {
    case "recording":
      return "Stop recording";
    case "preparing":
      return "Preparing voice input";
    case "transcribing":
      return "Writing it down";
    case "denied":
      return "Microphone is blocked";
    case "failed":
      return "Try voice again";
    default:
      return "Talk";
  }
}

/** The round record control. Its state decides the glyph, color and glow; the glow follows `--voice-level`. */
export function VoiceOrb(props: {
  readonly state: VoiceUiState;
  readonly onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  readonly size?: "sm" | "lg";
}) {
  const { state, onClick, size = "sm" } = props;
  const busy = state === "preparing" || state === "transcribing";
  return (
    <button
      type="button"
      className={cn(
        VOICE_CLASS.orb,
        "outline-hidden focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring",
      )}
      data-state={state}
      data-size={size}
      aria-label={voiceOrbLabel(state)}
      disabled={busy}
      onPointerDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      <MicIcon data-icon="mic" aria-hidden />
      <SquareIcon data-icon="stop" aria-hidden className="fill-current" />
      <CheckIcon data-icon="check" aria-hidden />
      <MicOffIcon data-icon="mic-off" aria-hidden />
      <DownloadIcon data-icon="download" aria-hidden />
    </button>
  );
}
