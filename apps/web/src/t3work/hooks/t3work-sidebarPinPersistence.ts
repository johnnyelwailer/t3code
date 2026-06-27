import {
  DEFAULT_CLIENT_SETTINGS,
  type ClientSettings,
  type ServerSettings,
} from "@t3tools/contracts";

import { readLocalApi } from "~/localApi";
import { applySettingsUpdated, getServerConfig } from "~/t3work/t3work-serverStateCompat";
import type { T3WorkSidebarPinnedItem } from "~/t3work/t3work-sidebarPinningTypes";

const SIDEBAR_PIN_PERSISTENCE_ERROR_SCOPE = "[SIDEBAR_PINS]";

function dedupePinnedItems(
  items: ReadonlyArray<T3WorkSidebarPinnedItem>,
): T3WorkSidebarPinnedItem[] {
  const byId = new Map<string, T3WorkSidebarPinnedItem>();
  for (const item of items) {
    byId.set(item.id, item);
  }
  return [...byId.values()].sort((left, right) => right.pinnedAt.localeCompare(left.pinnedAt));
}

function encodePinnedItems(items: ReadonlyArray<T3WorkSidebarPinnedItem>): string {
  return JSON.stringify(dedupePinnedItems(items));
}

function parsePinnedItems(raw: string | undefined): T3WorkSidebarPinnedItem[] {
  try {
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? dedupePinnedItems(parsed as T3WorkSidebarPinnedItem[]) : [];
  } catch {
    return [];
  }
}

export function readStoredSidebarPinsFromClientSettings(
  settings: ClientSettings | null | undefined,
): T3WorkSidebarPinnedItem[] {
  return parsePinnedItems(settings?.t3workStoredSidebarPinsJson);
}

export function readStoredSidebarPinsFromServerSettings(
  settings: Pick<ServerSettings, "t3workStoredSidebarPinsJson"> | null | undefined,
): T3WorkSidebarPinnedItem[] {
  return parsePinnedItems(settings?.t3workStoredSidebarPinsJson);
}

export async function hydrateStoredSidebarPins(): Promise<T3WorkSidebarPinnedItem[]> {
  const localApi = readLocalApi();
  if (!localApi) {
    return [];
  }

  try {
    const serverSettings = await localApi.server.getSettings();
    const pinnedItems = readStoredSidebarPinsFromServerSettings(serverSettings);
    const nextJson = encodePinnedItems(pinnedItems);
    const currentJson = serverSettings.t3workStoredSidebarPinsJson ?? "";

    if (currentJson !== nextJson && (currentJson.length > 0 || pinnedItems.length > 0)) {
      await localApi.server.updateSettings({
        t3workStoredSidebarPinsJson: nextJson,
      });
    }

    return pinnedItems;
  } catch {
    return [];
  }
}

export async function migrateLegacyStoredSidebarPinsToServer(): Promise<
  readonly T3WorkSidebarPinnedItem[] | null
> {
  const localApi = readLocalApi();
  if (!localApi) {
    return null;
  }

  try {
    const [serverSettings, clientSettings] = await Promise.all([
      localApi.server.getSettings(),
      localApi.persistence.getClientSettings(),
    ]);
    const serverPinnedItems = readStoredSidebarPinsFromServerSettings(serverSettings);
    if (
      serverPinnedItems.length > 0 ||
      (serverSettings.t3workStoredSidebarPinsJson ?? "").length > 0
    ) {
      return serverPinnedItems;
    }

    const legacyPinnedItems = readStoredSidebarPinsFromClientSettings(clientSettings);
    if (legacyPinnedItems.length === 0) {
      return null;
    }

    const nextJson = encodePinnedItems(legacyPinnedItems);
    await localApi.server.updateSettings({
      t3workStoredSidebarPinsJson: nextJson,
    });
    applyOptimisticServerSidebarPins(nextJson);

    const currentClientSettings = clientSettings ?? DEFAULT_CLIENT_SETTINGS;
    await localApi.persistence.setClientSettings({
      ...DEFAULT_CLIENT_SETTINGS,
      ...currentClientSettings,
      t3workStoredSidebarPinsJson: "",
    });

    return legacyPinnedItems;
  } catch (error) {
    console.error(`${SIDEBAR_PIN_PERSISTENCE_ERROR_SCOPE} legacy migration failed`, error);
    return null;
  }
}

let persistStoredSidebarPinsQueue: Promise<void> = Promise.resolve();

function applyOptimisticServerSidebarPins(nextJson: string): void {
  const currentServerConfig = getServerConfig();
  if (!currentServerConfig) {
    return;
  }

  applySettingsUpdated({
    ...currentServerConfig.settings,
    t3workStoredSidebarPinsJson: nextJson,
  });
}

export function persistStoredSidebarPins(items: ReadonlyArray<T3WorkSidebarPinnedItem>): void {
  const localApi = readLocalApi();
  if (!localApi) {
    return;
  }

  const nextJson = encodePinnedItems(items);
  applyOptimisticServerSidebarPins(nextJson);
  persistStoredSidebarPinsQueue = persistStoredSidebarPinsQueue
    .catch(() => undefined)
    .then(async () => {
      await localApi.server.updateSettings({ t3workStoredSidebarPinsJson: nextJson });
    })
    .catch((error) => {
      console.error(`${SIDEBAR_PIN_PERSISTENCE_ERROR_SCOPE} persist failed`, error);
    });
}
