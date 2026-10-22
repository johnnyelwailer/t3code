import { useEffect, type RefObject } from "react";

import { toWidgetSnapshot } from "./t3team-voiceWidgetSnapshot";
import { useVoiceUiStore } from "./surface/t3team-voiceUiStore";
import { useVoiceHotkeyKeys } from "./surface/t3team-useVoiceHotkeyKeys";

/**
 * Desktop main window: tells the floating widget what the session shows, and ends the recording
 * when the widget's Stop is pressed. Whether the widget is on screen is the main process's call.
 */
export function useVoiceWidgetPublisher(toggleRef: RefObject<(() => void) | null>): void {
  const snapshot = useVoiceUiStore((store) => store.snapshot);
  const keys = useVoiceHotkeyKeys();

  useEffect(() => {
    void window.desktopBridge
      ?.publishVoiceWidget?.(toWidgetSnapshot(snapshot, keys))
      .catch(() => undefined);
  }, [snapshot, keys]);

  useEffect(
    () =>
      window.desktopBridge?.onVoiceWidgetCommand?.((command) => {
        const recording = useVoiceUiStore.getState().snapshot.state === "recording";
        if (command === "stop" && recording) toggleRef.current?.();
      }),
    [toggleRef],
  );
}
