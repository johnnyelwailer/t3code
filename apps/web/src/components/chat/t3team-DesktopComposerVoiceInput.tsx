import { LoaderCircleIcon, MicIcon, SquareIcon } from "lucide-react";
import { useEffect, useImperativeHandle, type Ref } from "react";

import { toastManager } from "~/components/ui/toast";
import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { useDesktopVoiceInput } from "~/voice/t3team-useDesktopVoiceInput";
import { voicePreparingLabel } from "~/voice/t3team-voiceModelProgress";

export interface DesktopVoiceInputHandle {
  /** Start recording when idle, stop and transcribe when recording (the global-hotkey toggle). */
  toggle: () => void;
}

/** Composer mic for the Electron desktop app: records, then transcribes on-device with whisper. */
export function DesktopComposerVoiceInput({
  onTranscript,
  disabled,
  className,
  ref,
}: {
  readonly onTranscript: (text: string) => void;
  readonly disabled: boolean;
  readonly className?: string;
  readonly ref?: Ref<DesktopVoiceInputHandle>;
}) {
  const { available, state, downloadPercent, toggle } = useDesktopVoiceInput(onTranscript);
  useImperativeHandle(ref, () => ({ toggle }), [toggle]);
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
        ? voicePreparingLabel(downloadPercent)
        : phase === "transcribing"
          ? "Transcribing"
          : "Dictate";

  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className={className}
              disabled={disabled || busy}
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
      {downloadPercent !== null && (
        <span role="status" className="text-xs tabular-nums text-muted-foreground">
          {label}
        </span>
      )}
    </>
  );
}
