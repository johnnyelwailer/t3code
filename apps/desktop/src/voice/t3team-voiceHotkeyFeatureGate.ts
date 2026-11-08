/**
 * `DESKTOP_VOICE_HOTKEY`: the shell reads it from its env and the release preset at startup (it runs
 * before the backend's database, so no user value applies). While off the global shortcut is never
 * registered, and the hotkey state says why instead of reporting a pending registration.
 */
import type { VoiceHotkeyChord } from "@t3tools/contracts";
import { readFeatureFlag } from "@t3tools/project-context/t3teamFeatureFlags";

import { toElectronAccelerator } from "../snapShot/snapShot.ts";
import type { VoiceHotkeyRegistration } from "./t3team-voiceHotkeyRegistration.ts";

export const VOICE_HOTKEY_OFF_MESSAGE = "The global voice hotkey is turned off in this build.";

type RegisterVoiceHotkey = (chord: VoiceHotkeyChord) => Promise<VoiceHotkeyRegistration>;

const unregistered = (chord: VoiceHotkeyChord): Promise<VoiceHotkeyRegistration> =>
  Promise.resolve({
    state: () => ({
      registered: false,
      accelerator: toElectronAccelerator(chord),
      message: VOICE_HOTKEY_OFF_MESSAGE,
    }),
    close: () => undefined,
  });

export function gateVoiceHotkeyRegistration(
  register: RegisterVoiceHotkey,
  env: Readonly<Record<string, string | undefined>>,
): RegisterVoiceHotkey {
  return readFeatureFlag("DESKTOP_VOICE_HOTKEY", (key) => env[key]) ? register : unregistered;
}
