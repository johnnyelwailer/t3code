import { useEffect } from "react";

import { useServerConfig } from "~/t3work/t3work-serverStateCompat";
import { hydrateStoredSidebarNavPreferences } from "~/t3work/hooks/t3work-sidebarNavPreferencesPersistence";
import {
  migrateLegacyStoredSidebarPinsToServer,
  readStoredSidebarPinsFromServerSettings,
} from "~/t3work/hooks/t3work-sidebarPinPersistence";
import { useT3WorkPinnedSidebarStore } from "~/t3work/t3work-pinnedSidebarStore";
import { useT3WorkSidebarNavPreferencesStore } from "~/t3work/t3work-sidebarNavPreferencesStore";

export function useHydratePinnedSidebarItems() {
  const serverConfig = useServerConfig();
  const hydratePins = useT3WorkPinnedSidebarStore((state) => state.hydrate);
  const hydrateNavPreferences = useT3WorkSidebarNavPreferencesStore((state) => state.hydrate);

  useEffect(() => {
    if (!serverConfig) {
      return;
    }

    hydratePins(readStoredSidebarPinsFromServerSettings(serverConfig.settings));
  }, [hydratePins, serverConfig?.settings.t3workStoredSidebarPinsJson]);

  useEffect(() => {
    let cancelled = false;

    void hydrateStoredSidebarNavPreferences().then((preferences) => {
      if (!cancelled) {
        hydrateNavPreferences(preferences);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [hydrateNavPreferences]);

  useEffect(() => {
    if (!serverConfig) {
      return;
    }
    if ((serverConfig.settings.t3workStoredSidebarPinsJson ?? "").length > 0) {
      return;
    }

    let cancelled = false;

    void migrateLegacyStoredSidebarPinsToServer().then((items) => {
      if (cancelled || !items) {
        return;
      }
      hydratePins(items);
    });

    return () => {
      cancelled = true;
    };
  }, [hydratePins, serverConfig?.settings.t3workStoredSidebarPinsJson]);
}
