/**
 * The viewer's on/off switch for `surface.companion`, per device. Off by default: a pack's
 * companion (Nexi's 3D pet) costs a WebGL stage and a model download on every empty surface,
 * so it shows only for viewers who turn it on in Settings → Appearance.
 */
import * as Schema from "effect/Schema";

import { useLocalStorage } from "~/hooks/useLocalStorage";

export const T3TEAM_COMPANION_ENABLED_STORAGE_KEY = "t3team:companion-enabled";
export const DEFAULT_T3TEAM_COMPANION_ENABLED = false;

export function useT3TeamCompanionEnabled(): [boolean, (enabled: boolean) => void] {
  return useLocalStorage(
    T3TEAM_COMPANION_ENABLED_STORAGE_KEY,
    DEFAULT_T3TEAM_COMPANION_ENABLED,
    Schema.Boolean,
  );
}
