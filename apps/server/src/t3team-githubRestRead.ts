/**
 * The REST reads the repository-discovery flow makes, over `GitHubApi` rather than a `gh api`
 * subprocess: the credential, the quota admission and the rate-limit pause all live there, so
 * nothing in `t3team-github-*` talks to GitHub on its own.
 */

import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";

import * as GitHubApi from "./sourceControl/GitHubApi.ts";
import { parseJsonArray } from "./t3team-github-routes-shared.ts";

/**
 * A paginated read stops here even when GitHub still offers a next page: 30 pages of 100 is 3000
 * rows, far past what a picker shows, and a runaway list must never keep spending quota.
 */
export const MAX_REST_PAGES = 30;

/** The body of one REST `GET`. */
export function readRestBody(input: {
  readonly host: string;
  readonly operation: string;
  readonly path: string;
}): Effect.Effect<string, GitHubApi.GitHubApiError, GitHubApi.GitHubApi> {
  return Effect.gen(function* () {
    const api = yield* GitHubApi.GitHubApi;
    return (yield* api.rest(input)).body;
  });
}

/**
 * Every row of a list endpoint, following `Link: rel="next"` the way `gh api --paginate` did.
 * A page that fails fails the whole read, as it did under `gh`.
 */
export function readRestPages<T>(input: {
  readonly host: string;
  readonly operation: string;
  /** Relative to the API root, query string included (`user/repos?per_page=100`). */
  readonly path: string;
}): Effect.Effect<ReadonlyArray<T>, GitHubApi.GitHubApiError, GitHubApi.GitHubApi> {
  return Effect.gen(function* () {
    const api = yield* GitHubApi.GitHubApi;
    const separator = input.path.includes("?") ? "&" : "?";
    const items: Array<T> = [];
    for (let page = 1; page <= MAX_REST_PAGES; page += 1) {
      const response = yield* api.rest({
        host: input.host,
        operation: input.operation,
        path: `${input.path}${separator}page=${page}`,
      });
      items.push(...parseJsonArray<T>(response.body, []));
      if (!/rel="?next"?/i.test(response.headers["link"] ?? "")) break;
    }
    return items;
  });
}

/** Whether GitHub refused the read for the rate limit, or the client is holding reads back for it. */
export function isGitHubRateLimit(
  error: unknown,
): error is GitHubApi.GitHubApiRateLimitError | SourceControlRateLimitPaused {
  const tag = (error as { readonly _tag?: unknown } | null)?._tag;
  return tag === "GitHubApiRateLimitError" || tag === "SourceControlRateLimitPausedError";
}

type SourceControlRateLimitPaused = Extract<
  GitHubApi.GitHubApiError,
  { readonly _tag: "SourceControlRateLimitPausedError" }
>;

/** What a user sees for a read that hit the rate limit, in place of a generic "could not load". */
export function rateLimitMessage(
  error: GitHubApi.GitHubApiRateLimitError | SourceControlRateLimitPaused,
): string {
  const until =
    typeof error.retryAt === "number"
      ? `until ${DateTime.formatIso(DateTime.makeUnsafe(error.retryAt)).slice(0, 16).replace("T", " ")} UTC`
      : "until the rate limit resets";
  return `GitHub requests to ${error.host} are paused ${until} because of the rate limit.`;
}

/** The rate-limit message for an error, or undefined when it is something else. */
export function rateLimitMessageOf(error: unknown): string | undefined {
  return isGitHubRateLimit(error) ? rateLimitMessage(error) : undefined;
}
