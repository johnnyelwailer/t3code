import * as Effect from "effect/Effect";
import { HttpRouter } from "effect/unstable/http";
import { VcsProcess } from "./vcs/VcsProcess.ts";
import { errorResponse, okJson, readJsonBody } from "./t3work-atlassian-http.ts";
import {
  collectSuggestedRepositoryUrls,
  filterInboxItemsToLinkedRepositories,
  hydrateInboxRepositoryUrls,
  mergeGitHubActivityItems,
} from "./t3work-github-routes-suggestions.ts";
import { loadInboxAttempt, loadRepositoriesAttempt } from "./t3work-github-routes-loaders.ts";
import { loadAccount } from "./t3work-github-routes-account.ts";
import { loadLinkedPullRequestsAttempt } from "./t3work-github-routes-linked-prs.ts";
import {
  ACCOUNT_CACHE_TTL_MS,
  accountCache,
  EMPTY_RESPONSE,
  inboxCache,
  INBOX_CACHE_TTL_MS,
  makeResponseCacheKey,
  readCached,
  readTrimmedString,
  repositoriesCache,
  REPOSITORIES_CACHE_TTL_MS,
  responseCache,
  RESPONSE_CACHE_TTL_MS,
  UNAUTHENTICATED_ACCOUNT_CACHE_TTL_MS,
  writeCached,
} from "./t3work-github-routes-shared.ts";
import type {
  GitHubInboxDiscoverRequest,
  GitHubInboxDiscoverResponse,
} from "./t3work-github-routes-shared.ts";
import { toT3workError } from "./t3work-project-repository-utils.ts";

export const t3workGitHubInboxRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3work/github/inbox",
  Effect.gen(function* () {
    const vcs = yield* VcsProcess;
    const input = yield* readJsonBody<GitHubInboxDiscoverRequest>();
    const host = readTrimmedString(input.host) ?? "github.com";

    const responseCacheKey = makeResponseCacheKey({
      host,
      ...(input.projectKey ? { projectKey: input.projectKey } : {}),
      ...(input.projectTitle ? { projectTitle: input.projectTitle } : {}),
      ...(input.linkedRepositoryUrls ? { linkedRepositoryUrls: input.linkedRepositoryUrls } : {}),
    });

    const cachedResponse = readCached(responseCache, responseCacheKey);
    if (cachedResponse) return okJson(cachedResponse);

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
      return okJson(response);
    }

    const repositoriesAttempt =
      readCached(repositoriesCache, host) ??
      (yield* loadRepositoriesAttempt(vcs, host).pipe(
        Effect.tap((value) =>
          Effect.sync(() => {
            writeCached(repositoriesCache, host, value, REPOSITORIES_CACHE_TTL_MS);
          }),
        ),
      ));

    const inboxAttempt =
      readCached(inboxCache, host) ??
      (yield* loadInboxAttempt(vcs, host, account).pipe(
        Effect.tap((value) =>
          Effect.sync(() => {
            writeCached(inboxCache, host, value, INBOX_CACHE_TTL_MS);
          }),
        ),
      ));

    const linkedPullRequestsAttempt = yield* loadLinkedPullRequestsAttempt({
      vcs,
      host,
      account,
      ...(input.linkedRepositoryUrls ? { linkedRepositoryUrls: input.linkedRepositoryUrls } : {}),
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
    return okJson(response);
  }).pipe(
    Effect.mapError((cause) => toT3workError(cause, "Failed to load GitHub repository inbox.")),
    Effect.catch(errorResponse),
  ),
);
