import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Schedule from "effect/Schedule";

import type { GitHubApiError } from "./t3team-GitHubApi.ts";

/** Two more tries after the first, so a flaky read costs a few seconds, never a minute. */
const RETRIES = 2;
const BASE_DELAY = "300 millis";
const GATEWAY_STATUSES: ReadonlySet<number> = new Set([502, 503, 504]);

/**
 * A failure that says GitHub or the network hiccupped rather than that the request was wrong:
 * a dropped connection or a gateway error. A timeout is not retried, since the read already spent
 * its whole deadline and a slow query is slow again; a rate limit, a refused credential and a
 * missing resource are answers, not hiccups.
 */
function isTransientGitHubFailure(error: GitHubApiError): boolean {
  if (error._tag === "GitHubApiRequestError") return !Cause.isTimeoutError(error.cause);
  return error._tag === "GitHubApiResponseError" && GATEWAY_STATUSES.has(error.status);
}

/** A GraphQL document that only reads; a mutation is sent once, because a retry could repeat it. */
export function isGraphQlQuery(document: string): boolean {
  return !/^\s*mutation\b/.test(document);
}

/** A REST request that only reads. */
export function isIdempotentRestMethod(method: string | undefined): boolean {
  return method === undefined || method === "GET" || method === "HEAD";
}

/**
 * Sends again, with a growing and jittered pause, when a read failed transiently. Applied to a
 * whole attempt, so each retry asks the quota and the rate-limit pause again before it goes out.
 */
export function retryTransientRead<A, R>(
  attempt: Effect.Effect<A, GitHubApiError, R>,
  idempotent: boolean,
): Effect.Effect<A, GitHubApiError, R> {
  if (!idempotent) return attempt;
  return attempt.pipe(
    Effect.retry({
      schedule: Schedule.jittered(Schedule.exponential(BASE_DELAY)),
      times: RETRIES,
      while: isTransientGitHubFailure,
    }),
  );
}
