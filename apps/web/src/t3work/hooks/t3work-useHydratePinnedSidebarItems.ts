import { useEffect } from "react";

import { DEFAULT_CLIENT_SETTINGS } from "@t3tools/contracts";

import { readLocalApi } from "~/localApi";
import { useServerConfig } from "~/t3work/t3work-serverState";
import { hydrateStoredSidebarNavPreferences } from "~/t3work/hooks/t3work-sidebarNavPreferencesPersistence";
import {
  readStoredSidebarPinsFromClientSettings,
  readStoredSidebarPinsFromServerSettings,
} from "~/t3work/hooks/t3work-sidebarPinPersistence";
import {
  configurePinnedSidebarPersister,
  useT3WorkPinnedSidebarStore,
} from "~/t3work/t3work-pinnedSidebarStore";
import { useT3WorkSidebarNavPreferencesStore } from "~/t3work/t3work-sidebarNavPreferencesStore";
import { usePrimaryEnvironmentId } from "~/state/environments";
import { serverEnvironment } from "~/state/server";
import { useAtomCommand } from "~/state/use-atom-command";

export function useHydratePinnedSidebarItems() {
  const serverConfig = useServerConfig();
  const environmentId = usePrimaryEnvironmentId();
  const updateServerSettings = useAtomCommand(serverEnvironment.updateSettings, {
    label: "t3work.sidebarPins.updateSettings",
  });
  const hydratePins = useT3WorkPinnedSidebarStore((state) => state.hydrate);
  const hydrateNavPreferences = useT3WorkSidebarNavPreferencesStore((state) => state.hydrate);

  useEffect(() => {
    if (environmentId === null) {
      return;
    }
    return configurePinnedSidebarPersister((items) => {
      void updateServerSettings({
        environmentId,
        input: { patch: { t3workStoredSidebarPinsJson: JSON.stringify(items) } },
      });
    });
  }, [environmentId, updateServerSettings]);

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

    const localApi = readLocalApi();
    if (!localApi) {
      return;
    }

    void localApi.persistence.getClientSettings().then(async (clientSettings) => {
      const items = readStoredSidebarPinsFromClientSettings(clientSettings);
      if (cancelled || !items) {
        return;
      }
      if (items.length === 0 || environmentId === null) {
        return;
      }
      await updateServerSettings({
        environmentId,
        input: { patch: { t3workStoredSidebarPinsJson: JSON.stringify(items) } },
      });
      await localApi.persistence.setClientSettings({
        ...DEFAULT_CLIENT_SETTINGS,
        ...(clientSettings ?? DEFAULT_CLIENT_SETTINGS),
        t3workStoredSidebarPinsJson: "",
      });
      hydratePins(items);
    });

    return () => {
      cancelled = true;
    };
  }, [
    environmentId,
    hydratePins,
    serverConfig?.settings.t3workStoredSidebarPinsJson,
    updateServerSettings,
  ]);
}
