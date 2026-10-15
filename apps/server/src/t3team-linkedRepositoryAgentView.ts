/**
 * What an agent is told about a project's linked repositories: per repository, whether a usable
 * checkout exists on this machine, where, and when it was last synced. Linked repositories sync on
 * demand, so most may be `not-cloned`; the agent decides which to sync through
 * `t3_linked_repository_sync`. Shared by that tool's result and the project context file
 * `linked-repositories.json`, so both describe a checkout the same way.
 *
 * @module t3team-linkedRepositoryAgentView
 */
import type {
  LinkedRepositoryBootstrapResult,
  LinkedRepositorySyncPhase,
  MainRepositoryBootstrapResult,
} from "./t3team-project-repository-utils.ts";
import { isLinkedRepositoryReady } from "./t3team-project-repository-utils.ts";
import {
  findLinkedRepository,
  isSameRepository,
} from "./t3team-toolBrokerStartChildLinkedRepository.ts";

/** The MCP name of the tool that syncs one linked repository. */
export const LINKED_REPOSITORY_SYNC_MCP_TOOL = "t3_linked_repository_sync";

export type LinkedRepositoryAgentView = {
  readonly url: string;
  /** `cloned`: a usable checkout is at `localPath`. `not-cloned`: sync it before reading it. */
  readonly state: "cloned" | "not-cloned" | "failed";
  /** Absolute path of the usable checkout; only present when `state` is `cloned`. */
  readonly localPath?: string;
  /** When the last clone/fetch settled. */
  readonly syncedAt?: string;
  /** Why the last sync failed (a `cloned` checkout may carry a failed refresh). */
  readonly error?: string;
  /** A clone or fetch is queued or running right now. */
  readonly syncing?: LinkedRepositorySyncPhase;
  /** This repository is the project's main repository: the workspace itself, not a reference. */
  readonly mainRepository?: true;
};

export const describeLinkedRepositoryForAgent = (
  entry: LinkedRepositoryBootstrapResult,
  phase?: LinkedRepositorySyncPhase,
): LinkedRepositoryAgentView => {
  const ready = isLinkedRepositoryReady(entry) && entry.localPath.trim() !== "";
  return {
    url: entry.url,
    state: ready ? "cloned" : entry.status === "failed" ? "failed" : "not-cloned",
    ...(ready ? { localPath: entry.localPath } : {}),
    ...(entry.syncedAt ? { syncedAt: entry.syncedAt } : {}),
    ...(entry.error ? { error: entry.error } : {}),
    ...(phase ? { syncing: phase } : {}),
  };
};

/** Every linked URL in list order, described from the reference manifest. A URL the manifest does
 * not record yet (no bootstrap since it was linked) is `not-cloned`. */
export const describeLinkedRepositoriesForAgent = (input: {
  readonly urls: ReadonlyArray<string>;
  readonly linkedRepositories: ReadonlyArray<LinkedRepositoryBootstrapResult>;
  readonly mainRepository?: MainRepositoryBootstrapResult;
}): ReadonlyArray<LinkedRepositoryAgentView> =>
  input.urls.map((url) => {
    const main = input.mainRepository;
    if (main?.url && isSameRepository(main.url, url)) {
      return { url, state: "cloned", localPath: main.localPath, mainRepository: true };
    }
    const entry = findLinkedRepository(input.linkedRepositories, url);
    return entry
      ? describeLinkedRepositoryForAgent({ ...entry, url })
      : { url, state: "not-cloned" };
  });
