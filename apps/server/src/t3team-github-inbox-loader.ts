import * as Effect from "effect/Effect";

import type { VcsProcessShape } from "./t3team-vcsProcessShape.ts";
import { loadAccount } from "./t3team-github-routes-account.ts";
import {
  loadInboxAttempt,
  loadRepositoriesAttempt,
  loadRepositorySearchAttempt,
} from "./t3team-github-routes-loaders.ts";
import { loadLinkedPullRequestsAttempt } from "./t3team-github-routes-linked-prs.ts";
import {
  collectSuggestedRepositoryUrls,
  filterInboxItemsToLinkedRepositories,
  hydrateInboxRepositoryUrls,
  mergeGitHubActivityItems,
} from "./t3team-github-routes-suggestions.ts";
import {
  ACCOUNT_CACHE_TTL_MS,
  accountCache,
  EMPTY_RESPONSE,
  inboxCache,
  INBOX_CACHE_TTL_MS,
  makeResponseCacheKey,
  readCached,
  readTrimmedString,
  repositorySearchCache,
  repositoriesCache,
  REPOSITORIES_CACHE_TTL_MS,
  responseCache,
  RESPONSE_CACHE_TTL_MS,
  UNAUTHENTICATED_ACCOUNT_CACHE_TTL_MS,
  writeCached,
} from "./t3team-github-routes-shared.ts";
import type {
  GitHubInboxDiscoverRequest,
  GitHubInboxDiscoverResponse,
} from "./t3team-github-routes-shared.ts";

export function loadGitHubInboxResponse(vcs: VcsProcessShape, input: GitHubInboxDiscoverRequest) {
  return Effect.gen(function* () {
    const host = readTrimmedString(input.host) ?? "github.com";
    const repositoriesOnly = input.discoveryMode === "repositories";

    const responseCacheKey = makeResponseCacheKey({
      host,
      ...(input.projectKey ? { projectKey: input.projectKey } : {}),
      ...(input.projectTitle ? { projectTitle: input.projectTitle } : {}),
      ...(input.linkedRepositoryUrls ? { linkedRepositoryUrls: input.linkedRepositoryUrls } : {}),
      ...(repositoriesOnly ? { discoveryMode: "repositories" as const } : {}),
    });

    const cachedResponse = readCached(responseCache, responseCacheKey);
    if (cachedResponse) {
      return cachedResponse;
    }

    const account =
      readCached(accountCache, host) ??
      (yield* loadAccount(vcs, host).pipe(
        Effect.tap((value) =>
          Effect.sync(() => {
            writeCached(
              accountCache,
              host,
              value,
              value ? ACCOUNT_CACHE_TTL_MS : UNAUTHENTICATED_ACCOUNT_CACHE_TTL_MS,
            );
          }),
        ),
      ));

    if (!account) {
      const response = {
        host,
        ...EMPTY_RESPONSE,
        inboxWarning: `Authenticate GitHub CLI for ${host} via gh auth login --hostname ${host}.`,
      } satisfies GitHubInboxDiscoverResponse;
      writeCached(responseCache, responseCacheKey, response, RESPONSE_CACHE_TTL_MS);
      return response;
    }

    const repositoriesAttempt =
      (repositoriesOnly
        ? readCached(repositorySearchCache, responseCacheKey)
        : readCached(repositoriesCache, host)) ??
      (yield* (
        repositoriesOnly
          ? loadRepositorySearchAttempt(vcs, host, {
              ...(input.projectKey ? { projectKey: input.projectKey } : {}),
              ...(input.projectTitle ? { projectTitle: input.projectTitle } : {}),
            })
          : loadRepositoriesAttempt(vcs, host)
      ).pipe(
        Effect.tap((value) =>
          Effect.sync(() => {
            writeCached(
              repositoriesOnly ? repositorySearchCache : repositoriesCache,
              repositoriesOnly ? responseCacheKey : host,
              value,
              REPOSITORIES_CACHE_TTL_MS,
            );
          }),
        ),
      ));

    const inboxAttempt = repositoriesOnly
      ? { items: [] as ReadonlyArray<GitHubInboxDiscoverResponse["inboxItems"][number]> }
      : (readCached(inboxCache, host) ??
        (yield* loadInboxAttempt(vcs, host, account).pipe(
          Effect.tap((value) =>
            Effect.sync(() => {
              writeCached(inboxCache, host, value, INBOX_CACHE_TTL_MS);
            }),
          ),
        )));

    const linkedPullRequestsAttempt = repositoriesOnly
      ? { items: [] as ReadonlyArray<GitHubInboxDiscoverResponse["inboxItems"][number]> }
      : yield* loadLinkedPullRequestsAttempt({
          vcs,
          host,
          account,
          ...(input.linkedRepositoryUrls
            ? { linkedRepositoryUrls: input.linkedRepositoryUrls }
            : {}),
        });

    const mergedInboxItems = mergeGitHubActivityItems({
      notifications: hydrateInboxRepositoryUrls(host, inboxAttempt.items),
      linkedPullRequests: linkedPullRequestsAttempt.items,
    });

    const suggestedRepositoryUrls = collectSuggestedRepositoryUrls({
      repositories: repositoriesAttempt.items,
      ...(input.projectKey ? { projectKey: input.projectKey } : {}),
      ...(input.projectTitle ? { projectTitle: input.projectTitle } : {}),
      ...(input.linkedRepositoryUrls ? { linkedRepositoryUrls: input.linkedRepositoryUrls } : {}),
    });

    const inboxItems = filterInboxItemsToLinkedRepositories({
      host,
      inboxItems: mergedInboxItems,
      ...(input.linkedRepositoryUrls ? { linkedRepositoryUrls: input.linkedRepositoryUrls } : {}),
    });

    const warningParts = [
      repositoriesAttempt.warning,
      inboxAttempt.warning,
      linkedPullRequestsAttempt.warning,
    ].filter((part): part is string => typeof part === "string" && part.trim().length > 0);

    const response = {
      host,
      account,
      repositories: repositoriesAttempt.items,
      inboxItems,
      suggestedRepositoryUrls,
      ...(warningParts.length > 0 ? { inboxWarning: warningParts.join(" ") } : {}),
    } satisfies GitHubInboxDiscoverResponse;

    writeCached(responseCache, responseCacheKey, response, RESPONSE_CACHE_TTL_MS);
    return response;
  });
}
