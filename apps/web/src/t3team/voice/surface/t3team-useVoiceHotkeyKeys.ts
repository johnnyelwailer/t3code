import { DEFAULT_VOICE_HOTKEY_CHORD } from "@t3tools/contracts";

import { useClientSettings } from "~/hooks/useSettings";
import { isElectron } from "~/env";
import { snapShotShortcutKeyLabels } from "~/lib/snapShotShortcut";

/** The key labels of the global voice shortcut, or none where the browser has no such shortcut. */
export function useVoiceHotkeyKeys(): readonly string[] {
  const chord = useClientSettings((settings) => settings.voiceHotkeyChord);
  if (!isElectron) return [];
  return snapShotShortcutKeyLabels(chord ?? DEFAULT_VOICE_HOTKEY_CHORD, navigator.platform);
}
