import { useSyncExternalStore } from "react";
import {
  DEFAULT_T3TEAM_PROJECT_SETUP_PROFILE_ID,
  resolveT3TeamProjectSetupProfileId,
  type T3TeamProjectSetupProfileId,
} from "~/t3team/t3team-projectSetup";

export type { T3TeamProjectSetupProfileId };

export const T3TEAM_PROJECT_SETUP_PROFILE_STORAGE_KEY = "t3team:project-setup-profile";
export const T3TEAM_PROJECT_SETUP_PROFILE_CHANGED_EVENT = "t3team:project-setup-profile-changed";

export function readT3TeamProjectSetupProfile(): T3TeamProjectSetupProfileId {
  if (typeof window === "undefined") {
    return DEFAULT_T3TEAM_PROJECT_SETUP_PROFILE_ID;
  }
  return resolveT3TeamProjectSetupProfileId(
    window.localStorage.getItem(T3TEAM_PROJECT_SETUP_PROFILE_STORAGE_KEY) ?? undefined,
  );
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
  return useSyncExternalStore(
    subscribeT3TeamProjectSetupProfile,
    readT3TeamProjectSetupProfile,
    () => DEFAULT_T3TEAM_PROJECT_SETUP_PROFILE_ID,
  );
}
