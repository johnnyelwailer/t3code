import {
  DEFAULT_VOICE_HOTKEY_CHORD,
  type DesktopVoiceHotkeyState,
  type VoiceHotkeyChord,
} from "@t3tools/contracts";

import { toElectronAccelerator } from "../snapShot/snapShot.ts";
import type { VoiceHotkeyRegistration } from "./t3team-voiceHotkeyRegistration.ts";

interface VoiceHotkeyController {
  /** Moves the global shortcut to `chord`; a no-op when it is already the live one. */
  readonly apply: (chord: VoiceHotkeyChord) => void;
  readonly state: () => DesktopVoiceHotkeyState;
  readonly close: () => void;
}

/**
 * Owns the one live registration. Registration is not awaited, so a newer chord must win over an
 * older registration that resolves late (a Wayland portal can sit on a consent prompt).
 */
export function makeVoiceHotkeyController(
  register: (chord: VoiceHotkeyChord) => Promise<VoiceHotkeyRegistration>,
): VoiceHotkeyController {
  let activeAccelerator: string | undefined;
  let registration: VoiceHotkeyRegistration | undefined;
  let generation = 0;

  return {
    apply: (chord) => {
      const accelerator = toElectronAccelerator(chord);
      if (accelerator === activeAccelerator) return;
      activeAccelerator = accelerator;
      registration?.close();
      registration = undefined;
      const mine = ++generation;
      void register(chord).then((registered) => {
        if (mine === generation) registration = registered;
        else registered.close();
      });
    },
    state: () =>
      registration?.state() ?? {
        registered: false,
        accelerator: activeAccelerator ?? toElectronAccelerator(DEFAULT_VOICE_HOTKEY_CHORD),
        message: null,
      },
    close: () => {
      generation++;
      registration?.close();
      registration = undefined;
    },
  };
}
