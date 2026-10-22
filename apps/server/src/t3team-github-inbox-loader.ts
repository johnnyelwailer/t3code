import * as Effect from "effect/Effect";

import * as GitHubApi from "@t3tools/source-control-github/server/t3team-GitHubApi";
import * as SourceControlRateLimit from "@t3tools/source-control-core/server/SourceControlRateLimit";
import { loadAccount } from "./t3team-github-routes-account.ts";
import {
  loadFullRepositoryList,
  loadRepositoryListing,
} from "./t3team-github-repositoryListing.ts";
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
  responseCache,
  RESPONSE_CACHE_TTL_MS,
  UNAUTHENTICATED_ACCOUNT_CACHE_TTL_MS,
  writeCached,
  writeCachedUnlessPaused,
} from "./t3team-github-routes-shared.ts";
import type {
  GitHubInboxDiscoverRequest,
  GitHubInboxDiscoverResponse,
} from "./t3team-github-routes-shared.ts";

export function loadGitHubInboxResponse(input: GitHubInboxDiscoverRequest) {
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

    const cachedAccount = readCached(accountCache, host);
    const accountRead =
      cachedAccount !== undefined ? { account: cachedAccount } : yield* loadAccount(host);
    const account = accountRead.account;
    // A read held back by the rate limit says nothing about who is signed in: it is not cached,
    // and its answer is the pause rather than a prompt to sign in again.
    if (cachedAccount === undefined && accountRead.pausedMessage === undefined) {
      writeCached(
        accountCache,
        host,
        account,
        account ? ACCOUNT_CACHE_TTL_MS : UNAUTHENTICATED_ACCOUNT_CACHE_TTL_MS,
      );
    }

    if (!account) {
      const response = {
        host,
        ...EMPTY_RESPONSE,
        inboxWarning:
          accountRead.pausedMessage ??
          `Authenticate GitHub CLI for ${host} via gh auth login --hostname ${host}.`,
      } satisfies GitHubInboxDiscoverResponse;
      // A pause says nothing about who is signed in: serving it after the reset would be wrong.
      if (accountRead.pausedMessage === undefined) {
        writeCached(responseCache, responseCacheKey, response, RESPONSE_CACHE_TTL_MS);
      }
      return response;
    }

    const useAuthenticatedRepositoryList = !repositoriesOnly || host.toLowerCase() === "github.com";
    const listing = yield* loadRepositoryListing({
      host,
      account,
      authenticatedList: useAuthenticatedRepositoryList,
      searchCacheKey: responseCacheKey,
      ...(input.projectKey ? { projectKey: input.projectKey } : {}),
      ...(input.projectTitle ? { projectTitle: input.projectTitle } : {}),
      refresh: input.refresh === true,
    });
    let repositoriesAttempt = listing.attempt;

    // GHE search is the fast path, but it can omit private/organization-visible repos on some
    // installations. Fall back to the authenticated repository list only when the fast search has
    // no candidates, so a valid repo is not hidden behind a provider-specific search quirk. GitHub
    // uses the authenticated list directly so public repositories outside the user's account or
    // organizations never become setup suggestions.
    if (
      repositoriesOnly &&
      !useAuthenticatedRepositoryList &&
      repositoriesAttempt.items.length === 0
    ) {
      repositoriesAttempt = yield* loadFullRepositoryList(host, account);
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
      const completeRepositoriesAttempt = yield* loadFullRepositoryList(host, account);
      repositoriesAttempt = completeRepositoriesAttempt;
      suggestedRepositoryUrls = collectSuggestions(repositoriesAttempt.items);
    }

    const inboxAttempt = repositoriesOnly
      ? { items: [] as ReadonlyArray<GitHubInboxDiscoverResponse["inboxItems"][number]> }
      : (readCached(inboxCache, host) ??
        (yield* loadInboxAttempt(host, account).pipe(
          Effect.tap((value) =>
            Effect.sync(() => {
              writeCachedUnlessPaused(inboxCache, host, value, INBOX_CACHE_TTL_MS);
            }),
          ),
        )));

    const linkedPullRequestsAttempt = repositoriesOnly
      ? { items: [] as ReadonlyArray<GitHubInboxDiscoverResponse["inboxItems"][number]> }
      : yield* loadLinkedPullRequestsAttempt({
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

    // One rate-limit pause holds back every read, so it would otherwise be said once per source.
    const warningParts = [
      ...new Set(
        [
          repositoriesAttempt.warning,
          listing.attempt.warning,
          inboxAttempt.warning,
          linkedPullRequestsAttempt.warning,
        ].filter((part): part is string => typeof part === "string" && part.trim().length > 0),
      ),
    ];

    const response = {
      host,
      account,
      repositories: repositoriesAttempt.items,
      inboxItems,
      suggestedRepositoryUrls,
      ...(listing.fetchedAt ? { repositoriesFetchedAt: listing.fetchedAt } : {}),
      ...(listing.refreshing ? { repositoriesRefreshing: true as const } : {}),
      ...(warningParts.length > 0 ? { inboxWarning: warningParts.join(" ") } : {}),
    } satisfies GitHubInboxDiscoverResponse;

    // Whatever the rate limit cut short is not remembered: after the reset it would still be
    // served as the answer, empty or stale.
    const paused = [repositoriesAttempt, inboxAttempt, linkedPullRequestsAttempt].some(
      (attempt) => "paused" in attempt && attempt.paused === true,
    );
    if (!paused) writeCached(responseCache, responseCacheKey, response, RESPONSE_CACHE_TTL_MS);
    return response;
    // An explicit refresh or open is a user waiting on this answer and may spend the reserve; the
    // palette's automatic fan-out (no `trigger`) must honour a pause and leave the reserve alone.
  }).pipe(Effect.provideService(SourceControlRateLimit.Interactive, input.trigger === "user"));
}
