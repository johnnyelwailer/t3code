import { LoaderCircleIcon, MicIcon, SquareIcon } from "lucide-react";
import { useEffect } from "react";

import { toastManager } from "~/components/ui/toast";
import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { useDesktopVoiceInput } from "~/voice/t3team-useDesktopVoiceInput";

/** Composer mic for the Electron desktop app: records, then transcribes on-device with whisper. */
export function DesktopComposerVoiceInput(props: {
  readonly onTranscript: (text: string) => void;
  readonly disabled: boolean;
}) {
  const { available, state, toggle } = useDesktopVoiceInput(props.onTranscript);
  const { phase, error } = state;

  useEffect(() => {
    if (phase === "error" && error) {
      toastManager.add({ type: "error", title: "Voice input", description: error });
    }
  }, [phase, error]);

  if (!available) return null;
  const busy = phase === "preparing" || phase === "transcribing";
  const label =
    phase === "recording"
      ? "Stop recording"
      : phase === "preparing"
        ? "Preparing voice input"
        : phase === "transcribing"
          ? "Transcribing"
          : "Dictate";

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={props.disabled || busy}
            onPointerDown={(event) => event.preventDefault()}
            onClick={toggle}
            aria-label={label}
          />
        }
      >
        {busy ? (
          <LoaderCircleIcon className="animate-spin" />
        ) : phase === "recording" ? (
          <SquareIcon className="fill-current text-destructive" />
        ) : (
          <MicIcon />
        )}
      </TooltipTrigger>
      <TooltipPopup>{label}</TooltipPopup>
    </Tooltip>
  );
}
