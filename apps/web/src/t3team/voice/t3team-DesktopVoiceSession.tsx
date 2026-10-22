import type { VoiceTranscriptMetadata } from "@t3tools/contracts";
import { useEffect, useMemo, type RefObject } from "react";

import { useDesktopVoiceInput } from "~/voice/t3team-useDesktopVoiceInput";
import { useVoiceUiPublisher } from "./surface/t3team-useVoiceUiPublisher";
import { dispatchVoiceUi } from "./surface/t3team-voiceUiStore";

const openMicrophoneSettings = (): (() => void) | null => {
  const open = window.desktopBridge?.openMicrophoneSettings;
  return open === undefined ? null : () => void open().catch(() => undefined);
};

/**
 * The desktop recorder, headless: it owns the whisper-backed session and publishes it to the
 * voice surfaces. `toggleRef` is how the global hotkey and the widget's Stop reach it.
 */
export function DesktopVoiceSession(props: {
  readonly onTranscript: (text: string, metadata?: VoiceTranscriptMetadata) => void;
  readonly onUtteranceFailed: (message: string) => void;
  readonly toggleRef: RefObject<(() => void) | null>;
}) {
  const { onTranscript, onUtteranceFailed, toggleRef } = props;
  const { available, state, downloadPercent, stream, toggle, cancel, sessionId } =
    useDesktopVoiceInput(onTranscript, onUtteranceFailed);

  const controls = useMemo(
    () =>
      available
        ? {
            toggle,
            dismiss: () => {
              cancel();
              dispatchVoiceUi({ type: "dismiss" });
            },
            openMicrophoneSettings: openMicrophoneSettings(),
          }
        : null,
    [available, toggle, cancel],
  );

  useVoiceUiPublisher({
    phase: state.phase,
    errorAction: state.errorAction,
    error: state.error,
    downloadPercent,
    sessionId,
    live: stream,
    controls,
  });

  useEffect(() => {
    toggleRef.current = available ? toggle : null;
    return () => {
      toggleRef.current = null;
    };
  }, [available, toggle, toggleRef]);

  return null;
}
