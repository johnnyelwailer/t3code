import { useEffect, useImperativeHandle, useRef, type Ref } from "react";

import { toastManager } from "~/components/ui/toast";
import { useDesktopVoiceInput } from "~/voice/t3team-useDesktopVoiceInput";
import { voicePreparingLabel } from "~/voice/t3team-voiceModelProgress";
import {
  DesktopComposerVoiceControl,
  dictationGhostText,
} from "./t3team-DesktopComposerVoiceControl";
import { voiceStreamStatusText } from "./t3team-voiceStreamStatusText";

export interface DesktopVoiceInputHandle {
  /** Start recording when idle, stop and transcribe when recording (the global-hotkey toggle). */
  toggle: () => void;
}

/** Composer mic for the Electron desktop app: records, then transcribes on-device with whisper. */
export function DesktopComposerVoiceInput({
  onTranscript,
  onPartial,
  disabled,
  sessionKey,
  className,
  ref,
}: {
  readonly onTranscript: (text: string) => void;
  /** The live preview lands in the draft as ghost text; "" clears it. */
  readonly onPartial?: (text: string) => void;
  readonly disabled: boolean;
  /** The draft the transcript lands in; a change cancels any recording in progress. */
  readonly sessionKey?: string;
  readonly className?: string;
  readonly ref?: Ref<DesktopVoiceInputHandle>;
}) {
  const { available, state, downloadPercent, stream, toggle, cancel } = useDesktopVoiceInput(
    onTranscript,
    (message) => toastManager.add({ type: "error", title: "Voice input", description: message }),
    sessionKey,
  );
  useImperativeHandle(ref, () => ({ toggle }), [toggle]);
  const { phase, error } = state;
  const onPartialRef = useRef(onPartial);
  useEffect(() => {
    onPartialRef.current = onPartial;
  });
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- pushes the ghost into the ProseMirror view
  useEffect(() => {
    onPartialRef.current?.(dictationGhostText(phase, stream.partial));
  }, [phase, stream.partial]);

  useEffect(() => {
    if (phase === "error" && error) {
      toastManager.add({ type: "error", title: "Voice input", description: error });
    }
  }, [phase, error]);

  if (!available) return null;
  const label =
    phase === "preparing"
      ? voicePreparingLabel(downloadPercent)
      : phase === "transcribing"
        ? "Transcribing"
        : "Dictate";

  return (
    <>
      <DesktopComposerVoiceControl
        phase={phase}
        label={label}
        disabled={disabled}
        onToggle={toggle}
        onCancel={cancel}
        {...(className !== undefined ? { className } : {})}
      />
      <span role="status" className="sr-only">
        {voiceStreamStatusText(phase, stream.partial, stream.writing)}
      </span>
      {downloadPercent !== null && (
        <span role="status" className="text-xs tabular-nums text-muted-foreground">
          {label}
        </span>
      )}
    </>
  );
}
