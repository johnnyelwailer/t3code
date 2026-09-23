import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import {
  pullRequestHostOf,
  type OrchestrationProjectShell,
  type SourceControlProviderKind,
} from "@t3tools/contracts";
import { T3TEAM_PROJECT_CONTEXT_ROOT } from "@t3tools/project-context/t3teamContextPaths";
import { detectSourceControlProviderFromRemoteUrl } from "@t3tools/shared/sourceControl";

import { WorkspacePaths } from "../workspace/WorkspacePaths.ts";
import { sourceControlRepositorySelector } from "@t3tools/shared/sourceControl";

/**
 * One of a project's linked repositories, resolved the same way the project's own remote is:
 * a host boundary, a provider-native repository selector, and a provider kind the registry can
 * be asked about.
 */
export interface LinkedRepository {
  readonly host: string;
  readonly repository: string;
  readonly kind: SourceControlProviderKind;
}

const LINKED_REPOSITORIES_PATH = `${T3TEAM_PROJECT_CONTEXT_ROOT}/linked-repositories.json`;
const SCP_REMOTE_PATTERN = /^[a-zA-Z0-9._-]+@([^:/]+):(.+)$/;

/** Tolerant read of the project context's linked-repository list; non-string entries are dropped. */
const LinkedRepositoryContextJson = Schema.Struct({
  linkedRepositoryUrls: Schema.optional(Schema.Array(Schema.Unknown)),
});
const decodeLinkedRepositoryContext = Schema.decodeEffect(
  Schema.fromJsonString(LinkedRepositoryContextJson),
);

function splitRemoteUrl(
  remoteUrl: string,
): { readonly host: string; readonly repository: string } | null {
  const trimmed = remoteUrl.trim();
  const scp = SCP_REMOTE_PATTERN.exec(trimmed);
  if (scp !== null) {
    const host = (scp[1] ?? "").toLowerCase();
    const repository = (scp[2] ?? "").replace(/\.git$/i, "").replace(/^\/+/, "");
    return host !== "" && repository !== "" ? { host, repository } : null;
  }
  try {
    const url = new URL(trimmed);
    const host = url.host.toLowerCase();
    const repository = url.pathname.replace(/^\/+/, "").replace(/\.git$/i, "");
    return host !== "" && repository !== "" ? { host, repository } : null;
  } catch {
    return null;
  }
}

/**
 * The linked repositories as recorded, without a parse failing on the file: a missing, empty,
 * or corrupt file is simply no linked repositories, and a URL that reads as nothing is dropped
 * rather than failing the listing the project's own remote is about to read.
 */
export function parseLinkedRepositoryUrls(
  urls: ReadonlyArray<string>,
): ReadonlyArray<LinkedRepository> {
  const seen = new Set<string>();
  const parsed: LinkedRepository[] = [];
  for (const url of urls) {
    const trimmed = url.trim();
    if (trimmed.length === 0) continue;
    const provider = detectSourceControlProviderFromRemoteUrl(trimmed);
    const split = splitRemoteUrl(trimmed);
    if (provider === null || split === null) continue;
    const host = pullRequestHostOf(
      { canonicalKey: `${split.host}/${split.repository}` },
      provider.kind,
    );
    // The same identity a recorded remote carries, so Azure DevOps' `_git` path and the
    // owner/name fallback resolve exactly the way the project's own repository does.
    const repository = sourceControlRepositorySelector({
      displayName: split.repository,
      provider: provider.kind,
    });
    if (repository === null) continue;
    const key = `${host} ${repository.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    parsed.push({ host, repository, kind: provider.kind });
  }
  return parsed;
}

export function readProjectLinkedRepositories(
  project: OrchestrationProjectShell,
  deps: {
    readonly fileSystem: FileSystem.FileSystem;
    readonly workspacePaths: WorkspacePaths["Service"];
  },
): Effect.Effect<ReadonlyArray<LinkedRepository>, never> {
  return Effect.gen(function* () {
    const resolved = yield* deps.workspacePaths
      .resolveRelativePathWithinRoot({
        workspaceRoot: project.workspaceRoot,
        relativePath: LINKED_REPOSITORIES_PATH,
      })
      .pipe(Effect.orElseSucceed(() => null));
    if (resolved === null) return [];
    const contents = yield* deps.fileSystem
      .readFileString(resolved.absolutePath)
      .pipe(Effect.orElseSucceed(() => ""));
    const parsed = Option.getOrUndefined(
      yield* decodeLinkedRepositoryContext(contents).pipe(Effect.option),
    );
    const urls = Array.isArray(parsed?.linkedRepositoryUrls)
      ? parsed!.linkedRepositoryUrls.filter((url): url is string => typeof url === "string")
      : [];
    return parseLinkedRepositoryUrls(urls);
  });
}
