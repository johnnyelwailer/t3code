import type { VoiceInputState } from "@t3tools/client-runtime/voice-input";
import { CheckIcon, LoaderCircleIcon, MicIcon, XIcon } from "lucide-react";
import type { PointerEvent, ReactElement } from "react";

import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

const keepFocus = (event: PointerEvent) => event.preventDefault();

/** The draft's ghost: the heard words, or an ellipsis holding the insertion point before them. */
export function dictationGhostText(phase: VoiceInputState["phase"], partial: string): string {
  if (phase !== "recording") return "";
  return partial || "…";
}

function LabelledButton(props: { readonly label: string; readonly children: ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger render={props.children} />
      <TooltipPopup>{props.label}</TooltipPopup>
    </Tooltip>
  );
}

/**
 * The composer's dictation control. While recording it follows upstream's speech pill (cancel,
 * then finish with a check) so it never reads as the run's red stop button beside it.
 */
export function DesktopComposerVoiceControl(props: {
  readonly phase: VoiceInputState["phase"];
  readonly label: string;
  readonly disabled: boolean;
  readonly className?: string;
  readonly onToggle: () => void;
  readonly onCancel: () => void;
}) {
  if (props.phase === "recording") {
    return (
      <div
        data-testid="composer-dictation-recording"
        className="flex shrink-0 items-center gap-0.5 rounded-full border border-border bg-muted/60 ps-2"
      >
        <span aria-hidden className="me-1 size-2 shrink-0 rounded-full bg-destructive" />
        <LabelledButton label="Cancel voice input">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Cancel voice input"
            onPointerDown={keepFocus}
            onClick={props.onCancel}
          >
            <XIcon />
          </Button>
        </LabelledButton>
        <LabelledButton label="Finish voice input">
          <Button
            type="button"
            size="icon-sm"
            aria-label="Finish voice input"
            disabled={props.disabled}
            onPointerDown={keepFocus}
            onClick={props.onToggle}
          >
            <CheckIcon />
          </Button>
        </LabelledButton>
      </div>
    );
  }
  const busy = props.phase === "preparing" || props.phase === "transcribing";
  return (
    <LabelledButton label={props.label}>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className={props.className}
        disabled={props.disabled || busy}
        onPointerDown={keepFocus}
        onClick={props.onToggle}
        aria-label={props.label}
      >
        {busy ? <LoaderCircleIcon className="animate-spin" /> : <MicIcon />}
      </Button>
    </LabelledButton>
  );
}
