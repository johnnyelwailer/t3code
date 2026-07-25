import { useCallback, useSyncExternalStore } from "react";
import { useT3workPackDefaultSetupProfileId } from "~/t3work/t3work-packSetupProfiles";
import {
  DEFAULT_T3WORK_PROJECT_SETUP_PROFILE_ID,
  resolveT3WorkProjectSetupProfileId,
  type T3WorkProjectSetupProfileId,
} from "~/t3work/t3work-projectSetup";

export type T3workProjectSetupProfileId = T3WorkProjectSetupProfileId;

export const T3WORK_PROJECT_SETUP_PROFILE_STORAGE_KEY = "t3work:project-setup-profile";
export const T3WORK_PROJECT_SETUP_PROFILE_CHANGED_EVENT = "t3work:project-setup-profile-changed";

/**
 * Stored profile id wins over everything. With nothing stored, a pack-declared
 * default (`packDefaultProfileId`) outranks the bundled default.
 */
export function readT3workProjectSetupProfile(
  packDefaultProfileId?: string,
): T3workProjectSetupProfileId {
  if (typeof window === "undefined") {
    return packDefaultProfileId ?? DEFAULT_T3WORK_PROJECT_SETUP_PROFILE_ID;
  }
  const stored = window.localStorage.getItem(T3WORK_PROJECT_SETUP_PROFILE_STORAGE_KEY);
  if (!stored?.trim() && packDefaultProfileId) return packDefaultProfileId;
  return resolveT3WorkProjectSetupProfileId(stored ?? undefined);
}

export function writeT3workProjectSetupProfile(mode: T3workProjectSetupProfileId): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(T3WORK_PROJECT_SETUP_PROFILE_STORAGE_KEY, mode);
  window.dispatchEvent(
    new CustomEvent<T3workProjectSetupProfileId>(T3WORK_PROJECT_SETUP_PROFILE_CHANGED_EVENT, {
      detail: mode,
    }),
  );
}

export function subscribeT3workProjectSetupProfile(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") {
    return () => {
      // No-op outside the browser runtime.
    };
  }

  const onStorage = (event: StorageEvent) => {
    if (event.key === T3WORK_PROJECT_SETUP_PROFILE_STORAGE_KEY) {
      onStoreChange();
    }
  };

  const onProfileChanged = () => {
    onStoreChange();
  };

  window.addEventListener("storage", onStorage);
  window.addEventListener(T3WORK_PROJECT_SETUP_PROFILE_CHANGED_EVENT, onProfileChanged);

  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(T3WORK_PROJECT_SETUP_PROFILE_CHANGED_EVENT, onProfileChanged);
  };
}

export function useT3workProjectSetupProfile(): T3workProjectSetupProfileId {
  const packDefaultProfileId = useT3workPackDefaultSetupProfileId();
  const getSnapshot = useCallback(
    () => readT3workProjectSetupProfile(packDefaultProfileId),
    [packDefaultProfileId],
  );
  const getServerSnapshot = useCallback(
    () => packDefaultProfileId ?? DEFAULT_T3WORK_PROJECT_SETUP_PROFILE_ID,
    [packDefaultProfileId],
  );
  return useSyncExternalStore(subscribeT3workProjectSetupProfile, getSnapshot, getServerSnapshot);
}
