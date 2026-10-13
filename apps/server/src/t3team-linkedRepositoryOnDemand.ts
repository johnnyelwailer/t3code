/**
 * Syncs ONE linked repository on demand: clones it when absent, fetches it when present, through
 * the shared `T3TeamLinkedRepositorySync` (so it joins a sync of the same checkout in flight).
 * The one entry point for every caller that decides a repository is needed now — an agent's
 * `t3_linked_repository_sync`, a user's "Sync now", a delegation into a linked repository.
 *
 * @module t3team-linkedRepositoryOnDemand
 */
import * as Effect from "effect/Effect";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import {
  describeLinkedRepositoryForAgent,
  type LinkedRepositoryAgentView,
} from "./t3team-linkedRepositoryAgentView.ts";
import { T3TeamLinkedRepositorySync } from "./t3team-linkedRepositorySync.ts";
import { readPreservedReferenceManifest } from "./t3team-project-repository-routesBootstrap.ts";
import {
  HIDDEN_T3TEAM_DIR,
  MANIFEST_FILE_NAME,
  REFERENCES_DIR_NAME,
  type LinkedRepositoryBootstrapResult,
} from "./t3team-project-repository-utils.ts";
import { findLinkedRepository } from "./t3team-toolBrokerStartChildLinkedRepository.ts";

/** The repository is not among the project's recorded linked repositories. */
export class LinkedRepositoryNotLinkedError extends Schema.TaggedError<LinkedRepositoryNotLinkedError>()(
  "LinkedRepositoryNotLinkedError",
  { repository: Schema.String, linked: Schema.Array(Schema.String) },
) {
  override get message(): string {
    return this.linked.length === 0
      ? `'${this.repository}' is not a linked repository: this project records none yet.`
      : `'${this.repository}' is not a linked repository of this project. Linked: ${this.linked.join(", ")}.`;
  }
}

export type LinkedRepositoryOnDemandResult = {
  /** The manifest entry once the sync settled (or as queued, without `wait`). */
  readonly entry: LinkedRepositoryBootstrapResult;
  readonly view: LinkedRepositoryAgentView;
};

export const syncLinkedRepositoryOnDemand = Effect.fn("syncLinkedRepositoryOnDemand")(
  function* (input: {
    readonly workspaceRoot: string;
    /** The repository as the project lists it: a clone URL, or `owner/repo`. */
    readonly repository: string;
    /** Resolve once the clone/fetch settled; otherwise return as soon as it is queued. */
    readonly wait: boolean;
  }) {
    const path = yield* Path.Path;
    const sync = yield* T3TeamLinkedRepositorySync;
    const referencesRoot = path.join(input.workspaceRoot, HIDDEN_T3TEAM_DIR, REFERENCES_DIR_NAME);
    const readEntry = readPreservedReferenceManifest(
      path.join(referencesRoot, MANIFEST_FILE_NAME),
    ).pipe(
      Effect.map((manifest) => ({
        manifest,
        entry: findLinkedRepository(manifest.linkedRepositories, input.repository),
      })),
    );
    const { manifest, entry } = yield* readEntry;
    if (!entry || entry.localPath.trim() === "") {
      return yield* new LinkedRepositoryNotLinkedError({
        repository: input.repository,
        linked: manifest.linkedRepositories.map((linked) => linked.url),
      });
    }
    yield* sync.request({
      referencesRoot,
      url: entry.url,
      localPath: entry.localPath,
      ...(entry.branch ? { branch: entry.branch } : {}),
    });
    if (!input.wait) {
      return {
        entry,
        view: describeLinkedRepositoryForAgent(entry, sync.phase(entry.localPath)),
      } satisfies LinkedRepositoryOnDemandResult;
    }
    // A job records its outcome before it leaves the registry and before `awaitSettled` resolves,
    // so a job that settled before this call is already in the manifest. The re-read takes the
    // manifest lock so it never interleaves with a bootstrap rewriting the file.
    yield* sync.awaitSettled(entry.localPath);
    const settled = (yield* sync.withManifestLock(readEntry)).entry ?? entry;
    return {
      entry: settled,
      view: describeLinkedRepositoryForAgent(settled, sync.phase(settled.localPath)),
    } satisfies LinkedRepositoryOnDemandResult;
  },
);
