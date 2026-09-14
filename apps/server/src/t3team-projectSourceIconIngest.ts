/**
 * Ingests a bound Jira project's avatar and persists it locally so it can
 * serve as the project's `faviconPath` (the Jira avatar previously only
 * lived in the t3team context layer's `source.raw`).
 *
 * The download deliberately lives OUTSIDE the orchestration command-decide
 * path: `t3team-projectSourceIconReactor` runs this off the command queue
 * and, on success, dispatches a follow-up `project.meta.update` carrying
 * the stored path (normal dispatch: queue-backed, receipt-emitting). Gated
 * by the `t3teamProjectSourceIconIngestEnabled` server setting (on by
 * default, fail-open). Any failure — including missing platform services —
 * yields `null` and the project keeps its fallback icon.
 */
import type { ProjectSourceBinding } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import * as ServerConfig from "./config.ts";
import * as ServerSettings from "./serverSettings.ts";
import { providerForAccount } from "./t3team-atlassian-auth-store.ts";
import { tryAtlassianPromise } from "./t3team-atlassian-http.ts";
import { t3teamRandomUUID } from "./t3team-random.ts";

const AVATAR_MAX_BYTES = 1024 * 1024;
const PROJECT_ICON_DIR_NAME = "project-icons";

const AVATAR_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

function avatarExtension(mimeType: string | undefined): string {
  return (mimeType && AVATAR_EXTENSIONS[mimeType]) || "png";
}

export type AvatarProvider = {
  readonly listProjects: (account: {
    readonly id: string;
    readonly provider: "atlassian";
  }) => Promise<ReadonlyArray<{ readonly id: string; readonly iconUrl?: string }>>;
  readonly downloadAsset: (
    url: string,
  ) => Promise<{ readonly bytes: Uint8Array; readonly mimeType?: string }>;
};

export type AtlassianBinding = {
  readonly provider: "atlassian";
  readonly accountId: string;
  readonly externalProjectId: string;
};

export function isAtlassianBinding(
  source: ProjectSourceBinding | undefined,
): source is AtlassianBinding {
  return source !== undefined && source.provider === "atlassian";
}

// Test seam (never set in production): when configured,
// `ingestProjectSourceIcon` uses this provider instead of resolving the
// persisted Atlassian auths.
let testProvider: AvatarProvider | undefined;
export const setIngestProjectSourceIconTestProvider = (
  provider: AvatarProvider | undefined,
): void => {
  testProvider = provider;
};

export const ingestFlagEnabled = Effect.fn("ProjectSourceIconIngest.flagEnabled")(function* () {
  const serverSettings = yield* Effect.serviceOption(ServerSettings.ServerSettingsService);
  if (Option.isNone(serverSettings)) return false;
  const enabled = yield* serverSettings.value.getSettings.pipe(
    Effect.map((settings) => settings.t3teamProjectSourceIconIngestEnabled !== false),
    Effect.orElseSucceed(() => false),
  );
  return enabled;
});

/** Downloads the bound Jira project's avatar and persists it locally;
 *  returns the absolute stored path, or `null` when there is nothing to
 *  store (never fails). */
export const ingestProjectSourceIcon = Effect.fn("ProjectSourceIconIngest.ingest")(
  function* (input: {
    readonly projectId: string;
    readonly source: AtlassianBinding;
    readonly provider?: AvatarProvider;
  }) {
    return yield* Effect.gen(function* () {
      const fileSystemOption = yield* Effect.serviceOption(FileSystem.FileSystem);
      const pathOption = yield* Effect.serviceOption(Path.Path);
      const serverConfigOption = yield* Effect.serviceOption(ServerConfig.ServerConfig);
      const fileSystem = Option.isNone(fileSystemOption) ? null : fileSystemOption.value;
      const path = Option.isNone(pathOption) ? null : pathOption.value;
      const serverConfig = Option.isNone(serverConfigOption) ? null : serverConfigOption.value;
      if (fileSystem === null || path === null || serverConfig === null) return null;
      // `providerForAccount` resolves persisted auths through the platform
      // services; satisfy its requirements from the values above so this
      // module stays usable from service-free contexts (fail-open there).
      const provider: AvatarProvider =
        input.provider ??
        testProvider ??
        ((yield* providerForAccount(input.source.accountId).pipe(
          Effect.provideService(FileSystem.FileSystem, fileSystem),
          Effect.provideService(Path.Path, path),
          Effect.provideService(ServerConfig.ServerConfig, serverConfig),
        )) as unknown as AvatarProvider);
      const projects = yield* tryAtlassianPromise(
        () => provider.listProjects({ id: input.source.accountId, provider: "atlassian" }),
        "Failed to list Jira projects for the project icon.",
      );
      const iconUrl = projects.find(
        (project) => project.id === input.source.externalProjectId,
      )?.iconUrl;
      if (iconUrl === undefined || iconUrl === null) return null;
      const asset = yield* tryAtlassianPromise(
        () => provider.downloadAsset(iconUrl),
        "Failed to download the Jira project avatar.",
      );
      if (asset.bytes.byteLength === 0 || asset.bytes.byteLength > AVATAR_MAX_BYTES) return null;
      const directory = path.join(serverConfig.stateDir, PROJECT_ICON_DIR_NAME);
      yield* fileSystem.makeDirectory(directory, { recursive: true });
      const target = path.join(directory, `${input.projectId}.${avatarExtension(asset.mimeType)}`);
      const temp = `${target}.${t3teamRandomUUID()}.tmp`;
      yield* fileSystem.writeFile(temp, asset.bytes);
      yield* fileSystem.rename(temp, target).pipe(
        Effect.catch((cause) =>
          fileSystem.remove(temp).pipe(
            Effect.ignoreCause,
            Effect.andThen(() => Effect.fail(cause)),
          ),
        ),
      );
      return target;
    }).pipe(
      Effect.catch((cause) =>
        Effect.logDebug("project source icon ingest failed; keeping the fallback icon", {
          cause,
        }).pipe(Effect.map(() => null)),
      ),
    );
  },
);
