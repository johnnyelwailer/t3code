// @effect-diagnostics nodeBuiltinImport:off - written once at startup, before the Effect runtime has a service for it.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

/**
 * electron-updater reads `updaterCacheDirName` from an app-update.yml before it will download
 * anything. Our builds ship none (no publish config, and its absence is what turns the interim
 * feed on), and the app bundle cannot be written to, so the same two lines live in the app's own
 * data directory and are handed to electron-updater by path.
 */
export const NEXI_UPDATE_CONFIG = "provider: custom\nupdaterCacheDirName: nexi-work-updater\n";

/** Writes the config into `directory` when it differs, and returns the file's path. */
export function ensureNexiUpdateConfig(directory: string): string {
  const file = NodePath.join(directory, "app-update.yml");
  let current: string | undefined;
  try {
    current = NodeFS.readFileSync(file, "utf8");
  } catch {
    current = undefined;
  }
  if (current !== NEXI_UPDATE_CONFIG) {
    NodeFS.mkdirSync(directory, { recursive: true });
    NodeFS.writeFileSync(file, NEXI_UPDATE_CONFIG);
  }
  return file;
}
