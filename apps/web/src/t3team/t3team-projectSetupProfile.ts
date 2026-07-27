import { useCallback, useSyncExternalStore } from "react";
import { useT3TeamPackDefaultSetupProfileId } from "~/t3team/t3team-packSetupProfiles";
import {
  DEFAULT_T3TEAM_PROJECT_SETUP_PROFILE_ID,
  resolveT3TeamProjectSetupProfileId,
  type T3TeamProjectSetupProfileId,
} from "~/t3team/t3team-projectSetup";

export type { T3TeamProjectSetupProfileId };

export const T3TEAM_PROJECT_SETUP_PROFILE_STORAGE_KEY = "t3team:project-setup-profile";
export const T3TEAM_PROJECT_SETUP_PROFILE_CHANGED_EVENT = "t3team:project-setup-profile-changed";

/**
 * Stored profile id wins over everything. With nothing stored, a pack-declared
 * default (`packDefaultProfileId`) outranks the bundled default.
 */
export function readT3TeamProjectSetupProfile(
  packDefaultProfileId?: string,
): T3TeamProjectSetupProfileId {
  if (typeof window === "undefined") {
    return packDefaultProfileId ?? DEFAULT_T3TEAM_PROJECT_SETUP_PROFILE_ID;
  }
  const stored = window.localStorage.getItem(T3TEAM_PROJECT_SETUP_PROFILE_STORAGE_KEY);
  if (!stored?.trim() && packDefaultProfileId) return packDefaultProfileId;
  return resolveT3TeamProjectSetupProfileId(stored ?? undefined);
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
  const packDefaultProfileId = useT3TeamPackDefaultSetupProfileId();
  const getSnapshot = useCallback(
    () => readT3TeamProjectSetupProfile(packDefaultProfileId),
    [packDefaultProfileId],
  );
  const getServerSnapshot = useCallback(
    () => packDefaultProfileId ?? DEFAULT_T3TEAM_PROJECT_SETUP_PROFILE_ID,
    [packDefaultProfileId],
  );
  return useSyncExternalStore(subscribeT3TeamProjectSetupProfile, getSnapshot, getServerSnapshot);
}
