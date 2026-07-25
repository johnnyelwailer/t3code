import { useEffect } from "react";

import { DEFAULT_CLIENT_SETTINGS } from "@t3tools/contracts";

import { readLocalApi } from "~/localApi";
import { useServerConfig } from "~/t3team/t3team-serverState";
import { hydrateStoredSidebarNavPreferences } from "~/t3team/hooks/t3team-sidebarNavPreferencesPersistence";
import {
  readStoredSidebarPinsFromClientSettings,
  readStoredSidebarPinsFromServerSettings,
} from "~/t3team/hooks/t3team-sidebarPinPersistence";
import {
  configurePinnedSidebarPersister,
  useT3TeamPinnedSidebarStore,
} from "~/t3team/t3team-pinnedSidebarStore";
import { useT3TeamSidebarNavPreferencesStore } from "~/t3team/t3team-sidebarNavPreferencesStore";
import { usePrimaryEnvironmentId } from "~/state/environments";
import { serverEnvironment } from "~/state/server";
import { useAtomCommand } from "~/state/use-atom-command";

export function useHydratePinnedSidebarItems() {
  const serverConfig = useServerConfig();
  const environmentId = usePrimaryEnvironmentId();
  const updateServerSettings = useAtomCommand(serverEnvironment.updateSettings, {
    label: "t3team.sidebarPins.updateSettings",
  });
  const hydratePins = useT3TeamPinnedSidebarStore((state) => state.hydrate);
  const hydrateNavPreferences = useT3TeamSidebarNavPreferencesStore((state) => state.hydrate);

  useEffect(() => {
    if (environmentId === null) {
      return;
    }
    return configurePinnedSidebarPersister((items) => {
      void updateServerSettings({
        environmentId,
        input: { patch: { t3teamStoredSidebarPinsJson: JSON.stringify(items) } },
      });
    });
  }, [environmentId, updateServerSettings]);

  useEffect(() => {
    if (!serverConfig) {
      return;
    }

    hydratePins(readStoredSidebarPinsFromServerSettings(serverConfig.settings));
  }, [hydratePins, serverConfig?.settings.t3teamStoredSidebarPinsJson]);

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
    if ((serverConfig.settings.t3teamStoredSidebarPinsJson ?? "").length > 0) {
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
        input: { patch: { t3teamStoredSidebarPinsJson: JSON.stringify(items) } },
      });
      await localApi.persistence.setClientSettings({
        ...DEFAULT_CLIENT_SETTINGS,
        ...(clientSettings ?? DEFAULT_CLIENT_SETTINGS),
        t3teamStoredSidebarPinsJson: "",
      });
      hydratePins(items);
    });

    return () => {
      cancelled = true;
    };
  }, [
    environmentId,
    hydratePins,
    serverConfig?.settings.t3teamStoredSidebarPinsJson,
    updateServerSettings,
  ]);
}
