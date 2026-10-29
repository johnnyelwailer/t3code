/**
 * The pull requests a definition search looks at: open ones, and ones closed (or merged) within
 * the window, newest first. A pull request from a fork is not searched: the provider's list does
 * not carry its head commit, and the host keeps a fork's commits out of this repository's refs.
 *
 * @module t3team-machineDefinitionPulls
 */
import type { ProviderChangeRequest } from "@t3tools/source-control-core/server/PullRequestProvider";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";

import { PullRequestProviderRegistry } from "../pullRequest/PullRequestProviderRegistry.ts";
import { providerCall } from "./t3team-machineDefinitionProviderCall.ts";
import { RemoteUnavailable } from "./t3team-machineDefinitionReader.ts";
import type { RemoteMachineTarget } from "./t3team-remoteMachineScan.ts";

export const CLOSED_PULL_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const PAGE_SIZE = 40;

export interface SearchedPulls {
  readonly open: ReadonlyArray<ProviderChangeRequest>;
  readonly closed: ReadonlyArray<ProviderChangeRequest>;
  readonly forks: ReadonlyArray<number>;
}

const closedAt = (pull: ProviderChangeRequest) =>
  Date.parse(pull.closedAt ?? pull.mergedAt ?? pull.updatedAt);

export const listSearchedPulls = Effect.fn("machineSearch.listPulls")(function* (
  target: RemoteMachineTarget,
) {
  const provider = (yield* PullRequestProviderRegistry).get(target.kind);
  if (!provider)
    return yield* new RemoteUnavailable({ reason: "This host has no pull request support." });
  const now = yield* Clock.currentTimeMillis;
  const page = yield* providerCall(
    target,
    provider.listChangeRequests({
      cwd: target.cwd,
      repository: target.repository,
      host: target.host,
      state: "all",
      // "all" involvement never reads the viewer; asking who it is would be one more call.
      involvement: "all",
      viewer: "",
      limit: PAGE_SIZE,
    }),
  );
  const isFork = (pull: ProviderChangeRequest) =>
    pull.headRepositoryNameWithOwner != null &&
    pull.headRepositoryNameWithOwner.toLowerCase() !== target.repository.toLowerCase();
  const inScope = (pull: ProviderChangeRequest) =>
    pull.state === "open" || now - closedAt(pull) <= CLOSED_PULL_WINDOW_MS;
  const byNewest = page.items
    .filter(inScope)
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  const forks = byNewest.filter(isFork).map((pull) => pull.number);
  const own = byNewest.filter((pull) => !isFork(pull));
  return {
    open: own.filter((pull) => pull.state === "open"),
    closed: own.filter((pull) => pull.state !== "open"),
    forks,
  } satisfies SearchedPulls;
});
