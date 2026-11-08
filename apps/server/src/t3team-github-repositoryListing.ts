/**
 * Loads the repository list for the picker: memory, then the on-disk store, then GitHub. A stored
 * list is served at once even when old (stale-while-revalidate) and refreshed in the background
 * without the quota reserve, so opening the picker never waits on GitHub and an automatic refresh
 * never takes the last of a rate-limit budget. An explicit refresh asks GitHub now, but falls back
 * to the stored list when the rate limit holds it back.
 *
 * @module t3team-github-repositoryListing
 */
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";

import * as SourceControlRateLimit from "@t3tools/source-control-core/server/SourceControlRateLimit";
import {
  loadRepositoriesAttempt,
  loadRepositorySearchAttempt,
} from "./t3team-github-routes-loaders.ts";
import {
  readCached,
  repositoriesCache,
  REPOSITORIES_CACHE_TTL_MS,
  repositorySearchCache,
  writeCachedUnlessPaused,
  type GitHubRepositoriesAttempt,
} from "./t3team-github-routes-shared.ts";
import {
  readStoredRepositoryList,
  storedRepositoryListIsStale,
  writeStoredRepositoryList,
} from "./t3team-githubRepositoryListStore.ts";

export type RepositoryListing = {
  readonly attempt: GitHubRepositoriesAttempt;
  /** When the list shown was fetched from GitHub; absent when it never was (rate-limited, empty). */
  readonly fetchedAt?: string;
  /** A refresh of a stale stored list is running in the background. */
  readonly refreshing: boolean;
};

const refreshesInFlight = new Set<string>();

/** Pins every return of the loader to one shape, so callers see `warning` and the rest. */
const listing = (value: RepositoryListing): RepositoryListing => value;

/** Writes a finished attempt to the memory cache and, unless the rate limit cut it short, the store. */
const remember = (
  cache: typeof repositoriesCache,
  cacheKey: string,
  storeKey: string,
  attempt: GitHubRepositoriesAttempt,
) =>
  Effect.gen(function* () {
    writeCachedUnlessPaused(cache, cacheKey, attempt, REPOSITORIES_CACHE_TTL_MS);
    if (attempt.paused !== true) yield* writeStoredRepositoryList(storeKey, attempt.items);
  });

export const loadRepositoryListing = Effect.fn("loadRepositoryListing")(function* (input: {
  readonly host: string;
  readonly account: string | undefined;
  /** The signed-in user's own list; otherwise a project-scoped search (GitHub Enterprise). */
  readonly authenticatedList: boolean;
  readonly searchCacheKey: string;
  readonly projectKey?: string;
  readonly projectTitle?: string;
  readonly refresh: boolean;
}) {
  const { host, authenticatedList } = input;
  const cache = authenticatedList ? repositoriesCache : repositorySearchCache;
  const cacheKey = authenticatedList ? host : input.searchCacheKey;
  const storeKey = authenticatedList
    ? `repos:${host}:${input.account ?? ""}`
    : `search:${host}:${input.account ?? ""}:${input.projectKey ?? ""}:${input.projectTitle ?? ""}`;
  const fetchNow = (
    authenticatedList
      ? loadRepositoriesAttempt(host)
      : loadRepositorySearchAttempt(host, {
          ...(input.projectKey ? { projectKey: input.projectKey } : {}),
          ...(input.projectTitle ? { projectTitle: input.projectTitle } : {}),
        })
  ).pipe(Effect.tap((attempt) => remember(cache, cacheKey, storeKey, attempt)));

  const stored = yield* readStoredRepositoryList(storeKey);
  if (!input.refresh) {
    const memory = readCached(cache, cacheKey);
    if (memory) {
      return {
        attempt: memory,
        ...(stored ? { fetchedAt: stored.fetchedAt } : {}),
        refreshing: false,
      };
    }
    if (stored) {
      const stale = storedRepositoryListIsStale(
        stored,
        DateTime.toEpochMillis(yield* DateTime.now),
      );
      if (stale && !refreshesInFlight.has(storeKey)) {
        refreshesInFlight.add(storeKey);
        yield* Effect.forkDetach(
          fetchNow.pipe(
            Effect.provideService(SourceControlRateLimit.Interactive, false),
            Effect.ignore,
            Effect.ensuring(Effect.sync(() => refreshesInFlight.delete(storeKey))),
          ),
        );
      }
      return listing({
        attempt: { items: stored.items },
        fetchedAt: stored.fetchedAt,
        refreshing: stale,
      });
    }
  }

  const attempt = yield* fetchNow;
  if (attempt.paused === true && stored) {
    return listing({
      attempt: { items: stored.items, ...(attempt.warning ? { warning: attempt.warning } : {}) },
      fetchedAt: stored.fetchedAt,
      refreshing: false,
    });
  }
  return listing({
    attempt,
    ...(attempt.paused === true ? {} : { fetchedAt: DateTime.formatIso(yield* DateTime.now) }),
    refreshing: false,
  });
});

/**
 * The complete authenticated list for a host: memory, then the stored list (never refreshed from
 * here), then GitHub. Used when a project-scoped search found nothing and the full list is the
 * second opinion, so it must not turn a stored list into a request.
 */
export const loadFullRepositoryList = (host: string, account: string | undefined) =>
  Effect.gen(function* () {
    const cached = readCached(repositoriesCache, host);
    if (cached) return cached;
    const storeKey = `repos:${host}:${account ?? ""}`;
    const stored = yield* readStoredRepositoryList(storeKey);
    if (stored) return { items: stored.items } satisfies GitHubRepositoriesAttempt;
    const attempt = yield* loadRepositoriesAttempt(host);
    yield* remember(repositoriesCache, host, storeKey, attempt);
    return attempt;
  });
