// @effect-diagnostics nodeBuiltinImport:off - the updater is chosen once, before the Effect runtime has a service for it.
/**
 * Which electron-updater instance the desktop uses. Upstream builds and every non-live flavor keep
 * electron-updater's own (NsisUpdater on Windows, Squirrel's MacUpdater on a signed Mac build). The
 * live flavor on macOS gets {@link NexiMacUpdater}: Squirrel.Mac rejects the ad hoc signature of our
 * builds. On Windows the stock NsisUpdater stays, and `installDirectory` is never set, so it runs
 * `<installer> --updated /S --force-run` and the installer reuses the existing install location.
 */
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import * as Layer from "effect/Layer";
import { app } from "electron";
import { autoUpdater } from "electron-updater";

import * as ElectronUpdater from "../electron/ElectronUpdater.ts";
import { NexiMacUpdater, appBundleOf } from "./t3team-nexiMacUpdater.ts";
import { isLiveFlavorPreset } from "./t3team-nexiUpdateFlavor.ts";

let macUpdater: NexiMacUpdater | undefined;

function isLiveBuild(): boolean {
  for (const candidate of ["flag-preset.json", "resources/flag-preset.json"]) {
    try {
      return isLiveFlavorPreset(
        NodeFS.readFileSync(NodePath.join(process.resourcesPath, candidate), "utf8"),
      );
    } catch {
      // try the next location
    }
  }
  return false;
}

function pickUpdater(): typeof autoUpdater {
  // oxlint-disable-next-line t3code/no-global-process-runtime -- chosen once at startup, before any Effect runtime exists.
  if (NodeOS.platform() !== "darwin" || !app.isPackaged || !isLiveBuild()) return autoUpdater;
  const appBundlePath = appBundleOf(process.execPath);
  if (appBundlePath === null) return autoUpdater;
  macUpdater ??= new NexiMacUpdater({
    appBundlePath,
    logFile: NodePath.join(app.getPath("userData"), "updates", "nexi-swap.log"),
    // Tests and proofs relaunch through a wrapper that carries an isolated environment.
    ...(process.env.T3CODE_NEXI_UPDATE_LAUNCHER
      ? { launcher: process.env.T3CODE_NEXI_UPDATE_LAUNCHER }
      : {}),
  });
  return macUpdater as unknown as typeof autoUpdater;
}

export const layer = Layer.succeed(
  ElectronUpdater.ElectronUpdater,
  ElectronUpdater.makeFor(pickUpdater),
);
