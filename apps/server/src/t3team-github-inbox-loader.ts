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

    let repositoriesAttempt =
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

    // Search is the fast path, but GHE search can omit private/organization-visible repos on some
    // installations. Fall back to the authenticated repository list only when the fast search has
    // no candidates, so a valid repo is not hidden behind a provider-specific search quirk.
    if (repositoriesOnly && repositoriesAttempt.items.length === 0) {
      repositoriesAttempt =
        readCached(repositoriesCache, host) ??
        (yield* loadRepositoriesAttempt(vcs, host).pipe(
          Effect.tap((value) =>
            Effect.sync(() => {
              writeCached(
                repositorySearchCache,
                responseCacheKey,
                value,
                REPOSITORIES_CACHE_TTL_MS,
              );
              writeCached(repositoriesCache, host, value, REPOSITORIES_CACHE_TTL_MS);
            }),
          ),
        ));
    }

    const collectSuggestions = (repositories: typeof repositoriesAttempt.items) =>
      collectSuggestedRepositoryUrls({
        repositories,
        ...(input.projectKey ? { projectKey: input.projectKey } : {}),
        ...(input.projectTitle ? { projectTitle: input.projectTitle } : {}),
        // Repository discovery should still show a match after the wizard has auto-linked it.
        // Linked URLs are only relevant to inbox filtering, not to finding the project match.
        ...(repositoriesOnly
          ? {}
          : input.linkedRepositoryUrls
            ? { linkedRepositoryUrls: input.linkedRepositoryUrls }
            : {}),
      });

    let suggestedRepositoryUrls = collectSuggestions(repositoriesAttempt.items);

    // A provider search can return repositories but still omit the matching private or
    // organization-visible repository. If the fast result produces no actual match, retry once
    // against the authenticated repository list before reporting an empty discovery result.
    if (repositoriesOnly && suggestedRepositoryUrls.length === 0) {
      const completeRepositoriesAttempt =
        readCached(repositoriesCache, host) ??
        (yield* loadRepositoriesAttempt(vcs, host).pipe(
          Effect.tap((value) =>
            Effect.sync(() => {
              writeCached(repositoriesCache, host, value, REPOSITORIES_CACHE_TTL_MS);
            }),
          ),
        ));
      repositoriesAttempt = completeRepositoriesAttempt;
      suggestedRepositoryUrls = collectSuggestions(repositoriesAttempt.items);
    }

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
