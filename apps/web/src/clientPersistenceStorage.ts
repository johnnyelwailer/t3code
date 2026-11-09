import {
  ClientSettingsSchema,
  type ClientSettings,
  migrateLegacyT3TeamClientSettingsJson,
} from "@t3tools/contracts";
import { fromLenientJson } from "@t3tools/shared/schemaJson";
import * as Schema from "effect/Schema";

import { LocalStorageOperationError, setLocalStorageItem } from "./hooks/useLocalStorage";

const CLIENT_SETTINGS_STORAGE_KEY = "t3code:client-settings:v1";

const decodeMigratedClientSettings = Schema.decodeSync(fromLenientJson(ClientSettingsSchema));

function hasWindow(): boolean {
  return typeof window !== "undefined";
}

export function readBrowserClientSettings(): ClientSettings | null {
  if (!hasWindow()) {
    return null;
  }

  // The raw document is read so legacy flat `t3team*` keys can migrate into the `t3team`
  // namespace before decoding; see `packages/contracts/src/t3team-settings.ts`.
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(CLIENT_SETTINGS_STORAGE_KEY);
  } catch (cause) {
    throw new LocalStorageOperationError({
      operation: "read",
      storageKey: CLIENT_SETTINGS_STORAGE_KEY,
      cause,
    });
  }
  if (raw === null) {
    return null;
  }
  try {
    return decodeMigratedClientSettings(
      JSON.stringify(migrateLegacyT3TeamClientSettingsJson(JSON.parse(raw))),
    );
  } catch (cause) {
    throw new LocalStorageOperationError({
      operation: "decode",
      storageKey: CLIENT_SETTINGS_STORAGE_KEY,
      cause,
    });
  }
}

export function writeBrowserClientSettings(settings: ClientSettings): void {
  if (!hasWindow()) {
    return;
  }

  setLocalStorageItem(CLIENT_SETTINGS_STORAGE_KEY, settings, ClientSettingsSchema);
}
