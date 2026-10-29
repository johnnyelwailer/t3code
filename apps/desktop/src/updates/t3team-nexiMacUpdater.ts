// @effect-diagnostics nodeBuiltinImport:off - electron-updater's BaseUpdater API is Node callbacks and promises.
/**
 * electron-updater's updater for Nexi Work on macOS. It reuses electron-updater's download (sha512
 * checked against the manifest, progress, cache) and its quit-and-install flow, and replaces the one
 * step Squirrel.Mac cannot do for ad hoc signed builds: putting the new bundle in place. The ZIP is
 * unpacked and checked while the old app is still running, so a bad update is reported in the UI and
 * the app stays as it was; only a verified bundle reaches the swap helper.
 */
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import { BaseUpdater } from "electron-updater";
import type { UpdateInfo } from "electron-updater";

import { NEXI_MAC_SWAP_SCRIPT } from "./t3team-nexiMacSwapScript.ts";

interface DownloadFile {
  readonly url: URL;
  readonly info: { readonly url: string; readonly sha512?: string };
}
interface UpdaterInternals {
  readonly updateInfoAndProvider: {
    readonly info: UpdateInfo;
    readonly provider: { resolveFiles(info: UpdateInfo): ReadonlyArray<DownloadFile> };
  } | null;
  executeDownload(task: {
    fileExtension: string;
    fileInfo: DownloadFile;
    downloadUpdateOptions: unknown;
    task: (updateFile: string, downloadOptions: unknown) => Promise<void>;
  }): Promise<Array<string>>;
  readonly httpExecutor: {
    download(url: URL, destination: string, options: unknown): Promise<string>;
  };
}

const plist = (bundle: string, key: string) =>
  NodeChildProcess.execFileSync(
    "/usr/bin/plutil",
    ["-extract", key, "raw", "-o", "-", NodePath.join(bundle, "Contents/Info.plist")],
    { encoding: "utf8" },
  ).trim();

export interface NexiMacUpdaterOptions {
  /** The running app bundle, e.g. `/Applications/Nexi Work.app`. */
  readonly appBundlePath: string;
  readonly logFile: string;
  readonly launcher?: string;
  /** Starts the swap helper; detached `/bin/bash` by default. A seam for tests only. */
  readonly spawnHelper?: (args: ReadonlyArray<string>) => void;
  /** electron-updater's AppAdapter (a fake in tests); the real Electron one when absent. */
  readonly app?: object;
}

/** The bundle that contains `execPath` (`…/X.app/Contents/MacOS/X`), or null outside a bundle. */
export function appBundleOf(execPath: string): string | null {
  const bundle = NodePath.resolve(execPath, "../../..");
  return bundle.endsWith(".app") ? bundle : null;
}

export class NexiMacUpdater extends BaseUpdater {
  private readonly options: NexiMacUpdaterOptions;

  constructor(options: NexiMacUpdaterOptions) {
    super(null, options.app as never);
    this.options = options;
  }

  // Not Squirrel's differential or proxy download: the plain verified ZIP download.
  protected override doDownloadUpdate(downloadUpdateOptions: never): Promise<Array<string>> {
    const self = this as unknown as UpdaterInternals;
    const { info, provider } = (
      downloadUpdateOptions as {
        updateInfoAndProvider: NonNullable<UpdaterInternals["updateInfoAndProvider"]>;
      }
    ).updateInfoAndProvider;
    const fileInfo = provider
      .resolveFiles(info)
      .find((file) => file.info.url.toLowerCase().endsWith(".zip"));
    if (fileInfo === undefined) {
      return Promise.reject(new Error("The update has no macOS ZIP to install."));
    }
    return self.executeDownload({
      fileExtension: "zip",
      fileInfo,
      downloadUpdateOptions,
      task: async (updateFile, downloadOptions) => {
        await self.httpExecutor.download(fileInfo.url, updateFile, downloadOptions);
      },
    });
  }

  /** Unpacks next to the app (same volume, so the swap is two renames), checks it, starts the helper. */
  protected override doInstall(): boolean {
    const zip = this.installerPath;
    const expected = (this as unknown as UpdaterInternals).updateInfoAndProvider?.info.version;
    if (zip === null || expected === undefined) {
      this.dispatchError(new Error("No downloaded update to install."));
      return false;
    }
    const { appBundlePath, logFile, launcher = "/usr/bin/open" } = this.options;
    const parent = NodePath.dirname(appBundlePath);
    const stage = NodePath.join(
      parent,
      `.${NodePath.basename(appBundlePath)}.update-${process.pid}`,
    );
    try {
      NodeFS.accessSync(parent, NodeFS.constants.W_OK);
      NodeFS.rmSync(stage, { recursive: true, force: true });
      NodeFS.mkdirSync(stage);
      NodeChildProcess.execFileSync("/usr/bin/ditto", ["-x", "-k", zip, stage]);
      const staged = stagedBundle(stage, appBundlePath, expected);
      NodeFS.mkdirSync(NodePath.dirname(logFile), { recursive: true });
      const helper = NodePath.join(stage, "swap.sh");
      NodeFS.writeFileSync(helper, NEXI_MAC_SWAP_SCRIPT, { mode: 0o700 });
      (this.options.spawnHelper ?? spawnDetachedHelper)([
        helper,
        String(process.pid),
        staged,
        appBundlePath,
        `${appBundlePath}.nexi-backup`,
        stage,
        logFile,
        launcher,
      ]);
      return true;
    } catch (error) {
      NodeFS.rmSync(stage, { recursive: true, force: true });
      this.dispatchError(
        error instanceof Error ? error : new Error("The update could not be prepared."),
      );
      return false;
    }
  }
}

function spawnDetachedHelper(args: ReadonlyArray<string>): void {
  NodeChildProcess.spawn("/bin/bash", [...args], { detached: true, stdio: "ignore" }).unref();
}

/** The one .app in the unpacked update, if it is this app at the version the manifest promised. */
export function stagedBundle(stage: string, running: string, expectedVersion: string): string {
  const bundles = NodeFS.readdirSync(stage).filter((name) => name.endsWith(".app"));
  if (bundles.length !== 1) throw new Error("The update archive does not hold exactly one app.");
  const bundle = NodePath.join(stage, bundles[0] ?? "");
  if (plist(bundle, "CFBundleIdentifier") !== plist(running, "CFBundleIdentifier")) {
    throw new Error("The update is for a different app than the one running.");
  }
  if (plist(bundle, "CFBundleShortVersionString") !== expectedVersion) {
    throw new Error("The update's version is not the version the release announced.");
  }
  return bundle;
}
