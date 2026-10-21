import { useRef } from "react";

import { isElectron } from "../../env";
import { DesktopVoiceSession } from "./t3team-DesktopVoiceSession";
import { isShortcutRecorderOpen } from "./t3team-shortcutRecorderGate";
import { notifyVoiceFailure, useVoiceCommit } from "./t3team-useVoiceCommit";
import { useVoiceHotkey } from "./t3team-useVoiceHotkey";
import { useVoiceWidgetPublisher } from "./t3team-useVoiceWidgetPublisher";
import { WebVoiceSession } from "./t3team-WebVoiceSession";
import { WebVoiceWidget } from "./t3team-WebVoiceWidget";

/**
 * Owns the one voice recorder of this window, headless: every surface (the sidebar row, the
 * in-thread card, the floating widget) reads the session it publishes. Desktop transcribes
 * on-device with whisper (Web Speech is unreachable on-prem); the browser keeps Web Speech.
 */
export function T3TeamVoiceSessionHost() {
  const onTranscript = useVoiceCommit();
  const toggleRef = useRef<(() => void) | null>(null);

  useVoiceHotkey({
    onToggle: () => {
      if (!isShortcutRecorderOpen()) toggleRef.current?.();
    },
    onUnavailable: (detail) => notifyVoiceFailure("hotkey-unavailable", detail),
  });
  useVoiceWidgetPublisher(toggleRef);

  return isElectron ? (
    <DesktopVoiceSession onTranscript={onTranscript} toggleRef={toggleRef} />
  ) : (
    <>
      <WebVoiceSession onTranscript={onTranscript} toggleRef={toggleRef} />
      <WebVoiceWidget />
    </>
  );
}
