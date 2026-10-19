import { VOICE_HOTKEY_TOGGLE_ACTION } from "@t3tools/contracts";
import { useEffect, useRef } from "react";

/**
 * Desktop only: the main process owns the global shortcut and sends a toggle when it is pressed,
 * even while the app is unfocused. A shortcut the OS refused surfaces once, as a failure message.
 */
export function useVoiceHotkey(handlers: {
  readonly onToggle: () => void;
  readonly onUnavailable: (message: string) => void;
}): void {
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    const bridge = window.desktopBridge;
    if (bridge === undefined) return;
    let active = true;
    void bridge
      .getVoiceHotkeyState?.()
      .then((state) => {
        if (active && !state.registered && state.message !== null) {
          handlersRef.current.onUnavailable(state.message);
        }
      })
      .catch(() => undefined);
    const unsubscribe = bridge.onMenuAction((action) => {
      if (action === VOICE_HOTKEY_TOGGLE_ACTION) handlersRef.current.onToggle();
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);
}
