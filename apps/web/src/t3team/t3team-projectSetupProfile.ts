import { useCallback, useSyncExternalStore } from "react";
import type { EnvironmentSetupProfile } from "@t3tools/contracts";

import {
  readT3TeamPackSetupProfiles,
  useT3TeamPackSetupProfiles,
} from "~/t3team/t3team-packSetupProfiles";
import type { T3TeamProjectSetupProfileId } from "~/t3team/t3team-projectSetup";
import {
  readT3TeamWorkProfileChooserEnabled,
  resolveT3TeamEffectiveSetupProfileId,
  useT3TeamWorkProfileChooserEnabled,
} from "~/t3team/t3team-workProfileChooser";

export type { T3TeamProjectSetupProfileId };

export const T3TEAM_PROJECT_SETUP_PROFILE_STORAGE_KEY = "t3team:project-setup-profile";
export const T3TEAM_PROJECT_SETUP_PROFILE_CHANGED_EVENT = "t3team:project-setup-profile-changed";

/** Raw stored choice, or null outside the browser / when nothing was ever picked. */
export function readStoredT3TeamProjectSetupProfile(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(T3TEAM_PROJECT_SETUP_PROFILE_STORAGE_KEY);
}

/**
 * The profile that applies right now. With the work profile chooser disabled this is always the
 * developer profile and the stored choice is left alone — see `t3team-workProfileChooser.ts`.
 * Arguments exist so React call sites can pass their live values (and tests their fixtures);
 * omitting them reads the current client state.
 */
export function readT3TeamProjectSetupProfile(
  packProfiles: readonly EnvironmentSetupProfile[] | undefined = readT3TeamPackSetupProfiles(),
  workProfileChooserEnabled: boolean = readT3TeamWorkProfileChooserEnabled(),
): T3TeamProjectSetupProfileId {
  return resolveT3TeamEffectiveSetupProfileId({
    workProfileChooserEnabled,
    storedProfileId: readStoredT3TeamProjectSetupProfile(),
    packProfiles,
  });
}

export function writeT3TeamProjectSetupProfile(mode: T3TeamProjectSetupProfileId): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(T3TEAM_PROJECT_SETUP_PROFILE_STORAGE_KEY, mode);
  window.dispatchEvent(
    new CustomEvent<T3TeamProjectSetupProfileId>(T3TEAM_PROJECT_SETUP_PROFILE_CHANGED_EVENT, {
      detail: mode,
    }),
  );
}

export function subscribeT3TeamProjectSetupProfile(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") {
    return () => {
      // No-op outside the browser runtime.
    };
  }

  const onStorage = (event: StorageEvent) => {
    if (event.key === T3TEAM_PROJECT_SETUP_PROFILE_STORAGE_KEY) {
      onStoreChange();
    }
  };

  const onProfileChanged = () => {
    onStoreChange();
  };

  window.addEventListener("storage", onStorage);
  window.addEventListener(T3TEAM_PROJECT_SETUP_PROFILE_CHANGED_EVENT, onProfileChanged);

  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(T3TEAM_PROJECT_SETUP_PROFILE_CHANGED_EVENT, onProfileChanged);
  };
}

export function useT3TeamProjectSetupProfile(): T3TeamProjectSetupProfileId {
  const packProfiles = useT3TeamPackSetupProfiles();
  const workProfileChooserEnabled = useT3TeamWorkProfileChooserEnabled();
  const resolve = useCallback(
    (storedProfileId: string | null) =>
      resolveT3TeamEffectiveSetupProfileId({
        workProfileChooserEnabled,
        storedProfileId,
        packProfiles,
      }),
    [packProfiles, workProfileChooserEnabled],
  );
  const getSnapshot = useCallback(() => resolve(readStoredT3TeamProjectSetupProfile()), [resolve]);
  // Server render has no localStorage, so it resolves exactly as "nothing stored yet".
  const getServerSnapshot = useCallback(() => resolve(null), [resolve]);
  return useSyncExternalStore(subscribeT3TeamProjectSetupProfile, getSnapshot, getServerSnapshot);
}
