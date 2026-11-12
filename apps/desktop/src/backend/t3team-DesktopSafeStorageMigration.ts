import * as Effect from "effect/Effect";

import * as ElectronDialog from "../electron/ElectronDialog.ts";
import * as ElectronSafeStorage from "../electron/ElectronSafeStorage.ts";
import * as DesktopEnvironment from "../app/DesktopEnvironment.ts";
import {
  finalizeSafeStorageMigration,
  markSafeStorageWarningShown,
  shouldPresentSignInWarning,
  type SafeStorageBackend,
} from "./t3team-safeStorageMigration.ts";

const adapt = (
  safeStorage: ElectronSafeStorage.ElectronSafeStorage["Service"],
): SafeStorageBackend => ({
  isEncryptionAvailable: () =>
    Effect.runSync(safeStorage.isEncryptionAvailable.pipe(Effect.orElseSucceed(() => false))),
  encryptString: (value) => {
    try {
      return Effect.runSync(safeStorage.encryptString(value));
    } catch {
      return undefined;
    }
  },
  decryptString: (value) => {
    try {
      return Effect.runSync(safeStorage.decryptString(value));
    } catch {
      return undefined;
    }
  },
});

/**
 * After Electron is ready, verify (and if needed re-encrypt) migrated
 * safeStorage payloads, then show a re-sign-in prompt when that is impossible.
 */
export const runDesktopSafeStorageMigration = Effect.fn("desktop.safeStorageMigration.run")(
  function* (profileDir: string) {
    const safeStorage = yield* ElectronSafeStorage.ElectronSafeStorage;
    const environment = yield* DesktopEnvironment.DesktopEnvironment;
    const electronDialog = yield* ElectronDialog.ElectronDialog;

    const result = finalizeSafeStorageMigration({
      stateDir: environment.stateDir,
      homeDir: environment.baseDir,
      profileDir,
      join: environment.path.join,
      platform: environment.platform,
      current: adapt(safeStorage),
    });

    if (!shouldPresentSignInWarning(result) || result.warning === undefined) {
      return result;
    }

    yield* electronDialog
      .showMessageBox({
        type: "warning",
        title: "Sign in again",
        message: result.warning,
        buttons: ["OK"],
      })
      .pipe(Effect.ignore);
    markSafeStorageWarningShown(environment.baseDir, profileDir, environment.path.join);
    return { ...result, warningShown: true };
  },
);
