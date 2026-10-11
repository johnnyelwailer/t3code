/**
 * Where a pull request is checked out, for projects whose pull requests live in LINKED
 * repositories: the project's workspace root is then a container with no remote of its own, so
 * the provider and the git clone for the pull request are the linked repository's, not the
 * root's. The linked repository's local clone comes from the same reference manifest
 * `delegate_task` workspace isolation reads (`t3team-toolBrokerStartChildLinkedWorktree.ts`).
 *
 * @module t3team-pullRequestCheckoutRoot
 */
import { GitManagerError } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import type { SourceControlProviderRegistry } from "./sourceControl/SourceControlProviderRegistry.ts";
import {
  HIDDEN_T3TEAM_DIR,
  isLinkedRepositoryReady,
  MANIFEST_FILE_NAME,
  REFERENCES_DIR_NAME,
  type LinkedRepositoryBootstrapResult,
} from "./t3team-project-repository-utils.ts";
import { ensureNexiProjectStateDir } from "./t3team-projectMainRepositoryState.ts";
import { readNormalizedReferenceManifest } from "./t3team-referenceManifestNormalization.ts";
import {
  readLinkedRepositories,
  repositoryLookupCandidates,
} from "./t3team-toolBrokerStartChildLinkedRepository.ts";

const WEB_URL = /^https?:\/\//i;

const LinkedRepositoryManifestJson = Schema.Struct({
  linkedRepositories: Schema.optional(Schema.Array(Schema.Unknown)),
});
const decodeLinkedRepositoryManifest = Schema.decodeEffect(
  Schema.fromJsonString(LinkedRepositoryManifestJson),
);

/** Whether a repository (any clone-URL spelling) contains the pull request at `pullRequestUrl`.
 * A pull request URL is the repository's URL plus a provider-specific tail, so containment is a
 * path-segment prefix, which holds for every provider without parsing any of their URL shapes. */
export const repositoryContainsPullRequest = (
  repositoryUrl: string,
  pullRequestUrl: string,
): boolean => {
  const repository = (repositoryLookupCandidates(repositoryUrl)[0] ?? "").replace(/\/+$/, "");
  const pullRequest = repositoryLookupCandidates(pullRequestUrl)[0] ?? "";
  return (
    repository !== "" && (pullRequest === repository || pullRequest.startsWith(`${repository}/`))
  );
};

/** The linked repositories recorded in the project's reference manifest; none when it is absent. */
const readLinkedRepositoriesAt = (workspaceRoot: string) =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    yield* ensureNexiProjectStateDir(workspaceRoot).pipe(Effect.ignore);
    const manifestPath = path.join(
      workspaceRoot,
      HIDDEN_T3TEAM_DIR,
      REFERENCES_DIR_NAME,
      MANIFEST_FILE_NAME,
    );
    const exists = yield* fileSystem.exists(manifestPath).pipe(Effect.orElseSucceed(() => false));
    if (!exists) return [];
    const text = yield* readNormalizedReferenceManifest(fileSystem, manifestPath);
    const manifest = yield* decodeLinkedRepositoryManifest(text).pipe(Effect.option);
    return readLinkedRepositories(Option.getOrUndefined(manifest)?.linkedRepositories);
  });

const linkedRepositoryFor = (
  entries: ReadonlyArray<LinkedRepositoryBootstrapResult>,
  pullRequestUrl: string,
): LinkedRepositoryBootstrapResult | undefined =>
  entries
    .filter((entry) => repositoryContainsPullRequest(entry.url, pullRequestUrl))
    // Nested namespaces: the most specific repository wins.
    .toSorted((left, right) => right.url.length - left.url.length)[0];

/**
 * The directory a pull request operation runs in. `cwd` itself when the pull request is its own
 * repository's (or the reference names no repository, as a bare number does); otherwise the
 * local clone of the project's linked repository the pull request belongs to. Fails, saying what
 * to do, when that repository has no usable clone. A reference no linked repository claims falls
 * through to `cwd` when it has a remote of its own, which keeps the behavior of a plain
 * repository.
 */
export const resolvePullRequestCheckoutRoot = (input: {
  readonly operation: string;
  readonly cwd: string;
  readonly reference: string;
  readonly sourceControlProviders: SourceControlProviderRegistry["Service"];
}): Effect.Effect<string, GitManagerError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const reference = input.reference.trim();
    if (!WEB_URL.test(reference)) return input.cwd;

    const ownRemoteUrl = yield* input.sourceControlProviders.resolveHandle({ cwd: input.cwd }).pipe(
      Effect.map((handle) => handle.context?.remoteUrl ?? null),
      Effect.orElseSucceed(() => null),
    );
    if (ownRemoteUrl !== null && repositoryContainsPullRequest(ownRemoteUrl, reference)) {
      return input.cwd;
    }

    const fail = (detail: string) =>
      new GitManagerError({ operation: input.operation, cwd: input.cwd, detail });
    const linked = linkedRepositoryFor(yield* readLinkedRepositoriesAt(input.cwd), reference);
    if (linked === undefined) {
      if (ownRemoteUrl !== null) return input.cwd;
      return yield* fail(
        `This project's folder has no git remote, and none of its linked repositories contains ${reference}. Link the repository the pull request belongs to, then try again.`,
      );
    }
    const localPath = linked.localPath.trim();
    if (!isLinkedRepositoryReady(linked) || localPath === "") {
      return yield* fail(
        `${linked.url} is linked to this project but has no local clone yet (${linked.error ?? (linked.status === "pending" ? "it is still being cloned" : "its clone failed")}). Refresh the project's linked repositories, then try again.`,
      );
    }
    const exists = yield* fileSystem.exists(localPath).pipe(Effect.orElseSucceed(() => false));
    if (!exists) {
      return yield* fail(
        `The local clone of ${linked.url} is missing at '${localPath}'. Refresh the project's linked repositories to clone it again.`,
      );
    }
    return localPath;
  });
