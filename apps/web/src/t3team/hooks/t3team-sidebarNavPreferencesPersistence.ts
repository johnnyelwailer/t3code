import { DEFAULT_CLIENT_SETTINGS, type ClientSettings } from "@t3tools/contracts";

import { readLocalApi } from "~/localApi";
import {
  normalizeSidebarNavPreferences,
  type T3TeamSidebarNavPreferences,
} from "~/t3team/t3team-sidebarNavPreferences";

function encodeSidebarNavPreferences(preferencesByProjectId: T3TeamSidebarNavPreferences): string {
  return JSON.stringify(normalizeSidebarNavPreferences(preferencesByProjectId));
}

function parseSidebarNavPreferences(raw: string | undefined): T3TeamSidebarNavPreferences {
  try {
    if (!raw) {
      return {};
    }

    return normalizeSidebarNavPreferences(JSON.parse(raw));
  } catch {
    return {};
  }
}

export function readStoredSidebarNavPreferencesFromClientSettings(
  settings: ClientSettings | null | undefined,
): T3TeamSidebarNavPreferences {
  return parseSidebarNavPreferences(settings?.t3teamStoredSidebarNavPreferencesJson);
}

export async function hydrateStoredSidebarNavPreferences(): Promise<T3TeamSidebarNavPreferences> {
  const localApi = readLocalApi();
  if (!localApi) {
    return {};
  }

  try {
    const settings = await localApi.persistence.getClientSettings();
    const currentSettings = settings ?? DEFAULT_CLIENT_SETTINGS;
    const preferencesByProjectId = readStoredSidebarNavPreferencesFromClientSettings(settings);
    const nextJson = encodeSidebarNavPreferences(preferencesByProjectId);
    const currentJson = settings?.t3teamStoredSidebarNavPreferencesJson ?? "";

    if (currentJson !== nextJson && (currentJson.length > 0 || nextJson.length > 2)) {
      await localApi.persistence.setClientSettings({
        ...DEFAULT_CLIENT_SETTINGS,
        ...currentSettings,
        t3teamStoredSidebarNavPreferencesJson: nextJson,
      });
    }

    return preferencesByProjectId;
  } catch {
    return {};
  }
}

export function persistStoredSidebarNavPreferences(
  preferencesByProjectId: T3TeamSidebarNavPreferences,
): void {
  const localApi = readLocalApi();
  if (!localApi) {
    return;
  }

  const nextJson = encodeSidebarNavPreferences(preferencesByProjectId);
  void localApi.persistence
    .getClientSettings()
    .then((settings) => {
      const currentSettings = settings ?? DEFAULT_CLIENT_SETTINGS;
      return localApi.persistence.setClientSettings({
        ...DEFAULT_CLIENT_SETTINGS,
        ...currentSettings,
        t3teamStoredSidebarNavPreferencesJson: nextJson,
      });
    })
    .catch(() => {
      // Ignore persistence failures and keep the optimistic renderer state.
    });
}
