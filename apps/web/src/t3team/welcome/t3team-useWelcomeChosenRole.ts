import { useSyncExternalStore } from "react";

import {
  readStoredT3TeamProjectSetupProfile,
  subscribeT3TeamProjectSetupProfile,
} from "~/t3team/t3team-projectSetupProfile";

/**
 * The role the user picked, or null before any pick. Unlike the effective profile this never
 * falls back to a pack default, so a role is shown as selected only after the user chose it.
 */
export function useWelcomeChosenRole(): string | null {
  return useSyncExternalStore(
    subscribeT3TeamProjectSetupProfile,
    () => readStoredT3TeamProjectSetupProfile()?.trim() || null,
    () => null,
  );
}
