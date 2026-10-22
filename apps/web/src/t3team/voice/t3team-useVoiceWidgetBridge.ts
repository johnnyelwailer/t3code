import { useEffect, useRef, useState } from "react";

import { useVoiceStream } from "~/voice/t3team-useVoiceStream";
import { fromWidgetSnapshot, widgetHotkeyKeys } from "./t3team-voiceWidgetSnapshot";
import { useVoiceUiStore } from "./surface/t3team-voiceUiStore";

const noop = () => undefined;

/**
 * Floating widget window: mirrors the main window's session into this window's voice store. The
 * snapshot comes from the main window; level and partial transcript come from the same stream
 * events every window receives.
 */
export function useVoiceWidgetBridge(): readonly string[] {
  const [keys, setKeys] = useState<readonly string[]>([]);
  const sessionIdRef = useRef<string | null>(null);
  const state = useVoiceUiStore((store) => store.snapshot.state);

  useEffect(() => {
    const bridge = window.desktopBridge;
    const unsubscribe = bridge?.onVoiceWidgetSnapshot?.((widget) => {
      sessionIdRef.current = widget.sessionId;
      setKeys(widgetHotkeyKeys(widget));
      useVoiceUiStore.getState().setSnapshot(fromWidgetSnapshot(widget));
    });
    useVoiceUiStore.getState().setControls({
      toggle: () => void bridge?.sendVoiceWidgetCommand?.("stop").catch(noop),
      dismiss: noop,
      openMicrophoneSettings: null,
    });
    void bridge?.sendVoiceWidgetCommand?.("ready").catch(noop);
    return () => {
      unsubscribe?.();
      useVoiceUiStore.getState().setControls(null);
    };
  }, []);

  const live = useVoiceStream({
    active: state === "recording" || state === "transcribing",
    sessionIdRef,
  });
  useEffect(() => useVoiceUiStore.getState().setLive(live), [live]);

  return keys;
}
