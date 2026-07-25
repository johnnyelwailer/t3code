import {
  DEFAULT_CLIENT_SETTINGS,
  type ClientSettings,
  type ServerSettings,
} from "@t3tools/contracts";

import { readLocalApi } from "~/localApi";
import type { T3TeamSidebarPinnedItem } from "~/t3team/t3team-sidebarPinningTypes";

const SIDEBAR_PIN_PERSISTENCE_ERROR_SCOPE = "[SIDEBAR_PINS]";

function dedupePinnedItems(
  items: ReadonlyArray<T3TeamSidebarPinnedItem>,
): T3TeamSidebarPinnedItem[] {
  const byId = new Map<string, T3TeamSidebarPinnedItem>();
  for (const item of items) {
    byId.set(item.id, item);
  }
  return [...byId.values()].sort((left, right) => right.pinnedAt.localeCompare(left.pinnedAt));
}

function encodePinnedItems(items: ReadonlyArray<T3TeamSidebarPinnedItem>): string {
  return JSON.stringify(dedupePinnedItems(items));
}

function parsePinnedItems(raw: string | undefined): T3TeamSidebarPinnedItem[] {
  try {
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? dedupePinnedItems(parsed as T3TeamSidebarPinnedItem[]) : [];
  } catch {
    return [];
  }
}

export function readStoredSidebarPinsFromClientSettings(
  settings: ClientSettings | null | undefined,
): T3TeamSidebarPinnedItem[] {
  return parsePinnedItems(settings?.t3teamStoredSidebarPinsJson);
}

export function readStoredSidebarPinsFromServerSettings(
  settings: Pick<ServerSettings, "t3teamStoredSidebarPinsJson"> | null | undefined,
): T3TeamSidebarPinnedItem[] {
  return parsePinnedItems(settings?.t3teamStoredSidebarPinsJson);
}

export async function hydrateStoredSidebarPins(): Promise<T3TeamSidebarPinnedItem[]> {
  const localApi = readLocalApi();
  if (!localApi) {
    return [];
  }

  try {
    const serverSettings = await localApi.server.getSettings();
    const pinnedItems = readStoredSidebarPinsFromServerSettings(serverSettings);
    const nextJson = encodePinnedItems(pinnedItems);
    const currentJson = serverSettings.t3teamStoredSidebarPinsJson ?? "";

    if (currentJson !== nextJson && (currentJson.length > 0 || pinnedItems.length > 0)) {
      await localApi.server.updateSettings({
        t3teamStoredSidebarPinsJson: nextJson,
      });
    }

    return pinnedItems;
  } catch {
    return [];
  }
}

export async function migrateLegacyStoredSidebarPinsToServer(): Promise<
  readonly T3TeamSidebarPinnedItem[] | null
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
      (serverSettings.t3teamStoredSidebarPinsJson ?? "").length > 0
    ) {
      return serverPinnedItems;
    }

    const legacyPinnedItems = readStoredSidebarPinsFromClientSettings(clientSettings);
    if (legacyPinnedItems.length === 0) {
      return null;
    }

    const nextJson = encodePinnedItems(legacyPinnedItems);
    await localApi.server.updateSettings({
      t3teamStoredSidebarPinsJson: nextJson,
    });

    const currentClientSettings = clientSettings ?? DEFAULT_CLIENT_SETTINGS;
    await localApi.persistence.setClientSettings({
      ...DEFAULT_CLIENT_SETTINGS,
      ...currentClientSettings,
      t3teamStoredSidebarPinsJson: "",
    });

    return legacyPinnedItems;
  } catch (error) {
    console.error(`${SIDEBAR_PIN_PERSISTENCE_ERROR_SCOPE} legacy migration failed`, error);
    return null;
  }
}

let persistStoredSidebarPinsQueue: Promise<void> = Promise.resolve();

export function persistStoredSidebarPins(items: ReadonlyArray<T3TeamSidebarPinnedItem>): void {
  const localApi = readLocalApi();
  if (!localApi) {
    return;
  }

  const nextJson = encodePinnedItems(items);
  persistStoredSidebarPinsQueue = persistStoredSidebarPinsQueue
    .catch(() => undefined)
    .then(async () => {
      await localApi.server.updateSettings({ t3teamStoredSidebarPinsJson: nextJson });
    })
    .catch((error) => {
      console.error(`${SIDEBAR_PIN_PERSISTENCE_ERROR_SCOPE} persist failed`, error);
    });
}
