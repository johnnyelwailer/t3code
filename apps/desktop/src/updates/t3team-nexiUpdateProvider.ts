/**
 * electron-updater's feed for the interim Nexi Work updater: a custom `Provider` that asks the
 * local backend (which holds the GHE sign-in) what is newest and hands electron-updater a
 * manifest-shaped answer. electron-updater then does the part it is good at: version compare,
 * download progress, sha512 verification, install. Swapping this class for the proper update
 * channel later changes nothing else.
 */
import { Provider, type ResolvedUpdateFileInfo, type UpdateInfo } from "electron-updater";

import type { NexiUpdateCheck } from "@t3tools/shared/t3team-nexiUpdateWire";

export type NexiUpdateIssueKind = "signed-out" | "unreachable" | "unsupported";

/** A state the update check ends in that is not an update and not a crash. */
export class NexiUpdateIssue extends Error {
  readonly kind: NexiUpdateIssueKind;
  constructor(kind: NexiUpdateIssueKind, message: string) {
    super(message);
    this.name = "NexiUpdateIssue";
    this.kind = kind;
  }
}

/**
 * What the update notice lists from a release body: the generated "What's changed" list when there
 * is one, else the body's bullet lines. The install blurb and the asset table around it are for people
 * reading the release page, not for a notice.
 */
export function releaseNotesForNotice(body: string): string {
  const heading = /^#{1,3}\s*what'?s changed\s*$/imu.exec(body);
  if (heading !== null) return body.slice(heading.index);
  return body
    .split("\n")
    .filter((line) => /^\s*[-*]\s+\S/u.test(line))
    .join("\n");
}

export interface NexiUpdateProviderDeps {
  readonly currentVersion: string;
  readonly check: () => Promise<NexiUpdateCheck>;
  /** Absolute backend URL of the vetted asset; its path ends in the file name. */
  readonly assetUrl: (assetId: number, name: string) => Promise<string>;
  /** The desktop's own backend session, never the GHE credential. */
  readonly bearer: () => Promise<string>;
}

type RuntimeOptions = object;

export function makeNexiUpdateProviderClass(deps: NexiUpdateProviderDeps) {
  return class NexiUpdateProvider extends Provider<UpdateInfo> {
    private url: string | null = null;
    private authorization: string | null = null;

    constructor(_options: unknown, _updater: unknown, runtimeOptions: RuntimeOptions) {
      // electron-updater does not export ProviderRuntimeOptions; it passes its own, untouched.
      super(runtimeOptions as never);
    }

    override get fileExtraDownloadHeaders(): Provider<UpdateInfo>["fileExtraDownloadHeaders"] {
      return this.authorization === null
        ? null
        : { accept: "*/*", authorization: this.authorization };
    }

    // The release carries no blockmaps; skipping the probe avoids a request that can only fail.
    override getBlockMapFiles(): URL[] {
      return [];
    }

    async getLatestVersion(): Promise<UpdateInfo> {
      const check = await deps.check();
      switch (check.kind) {
        case "up-to-date":
          return { version: deps.currentVersion, files: [], path: "", sha512: "", releaseDate: "" };
        case "signed-out":
        case "unreachable":
        case "unsupported":
          throw new NexiUpdateIssue(check.kind, check.message);
        case "available": {
          const { file } = check;
          this.url = await deps.assetUrl(file.assetId, file.name);
          this.authorization = `Bearer ${await deps.bearer()}`;
          return {
            version: check.version,
            files: [{ url: file.name, sha512: file.sha512, size: file.size }],
            path: file.name,
            sha512: file.sha512,
            releaseName: `Nexi Work ${check.version}`,
            releaseNotes: releaseNotesForNotice(check.notes),
            releaseDate: check.publishedAt ?? "",
          };
        }
      }
    }

    resolveFiles(updateInfo: UpdateInfo): Array<ResolvedUpdateFileInfo> {
      const { url } = this;
      if (url === null) return [];
      return updateInfo.files.map((info) => ({ url: new URL(url), info }));
    }
  };
}
