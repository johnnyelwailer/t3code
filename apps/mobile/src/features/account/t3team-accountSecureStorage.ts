import * as Effect from "effect/Effect";
import * as SecureStore from "expo-secure-store";

import type { AccountSecretStorage } from "./t3team-accountTokenStore";

/**
 * The account grant in the platform keychain (iOS Keychain / Android Keystore). Readable only
 * after the first unlock, so a background refresh after a reboot still works once unlocked. A
 * keychain failure reads as "no grant" (sign in again) rather than crashing the app.
 */
const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

const logged = (operation: string, key: string) => (cause: unknown) =>
  Effect.logWarning("Account secure storage operation failed.", { operation, key, cause });

export const accountSecureStorage: AccountSecretStorage = {
  get: (key) =>
    Effect.tryPromise(() => SecureStore.getItemAsync(key, OPTIONS)).pipe(
      Effect.tapError(logged("read", key)),
      Effect.orElseSucceed(() => null),
    ),
  set: (key, value) =>
    Effect.tryPromise(() => SecureStore.setItemAsync(key, value, OPTIONS)).pipe(
      Effect.tapError(logged("write", key)),
      Effect.ignore,
    ),
  remove: (key) =>
    Effect.tryPromise(() => SecureStore.deleteItemAsync(key, OPTIONS)).pipe(
      Effect.tapError(logged("clear", key)),
      Effect.ignore,
    ),
};
