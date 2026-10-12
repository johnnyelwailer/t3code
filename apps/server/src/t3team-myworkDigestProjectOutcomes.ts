/**
 * Settles the per-project reads of one digest round.
 *
 * One Jira site with a dead session must not blank every other site's projects: its projects drop
 * out of this round and the round reports the viewer unresolved. When nothing loaded, the round
 * fails with the typed session error, so the client shows its sign-in panel. Any other failure
 * (an outage, a timeout) fails the whole round: the client keeps its last graph and retries,
 * instead of painting a project's work as gone.
 */
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";

import { JIRA_SESSION_EXPIRED_CODE, T3TeamAtlassianError } from "./t3team-atlassian-http.ts";

function isSessionExpired(error: unknown): boolean {
  return error instanceof T3TeamAtlassianError && error.code === JIRA_SESSION_EXPIRED_CODE;
}

export function settleDigestProjectLoads<A, E>(results: ReadonlyArray<Result.Result<A, E>>) {
  const loaded = results.filter(Result.isSuccess).map((result) => result.success);
  const failures = results.filter(Result.isFailure).map((result) => result.failure);
  const outage = failures.find((error) => !isSessionExpired(error));
  if (outage !== undefined) return Effect.fail(outage);
  const [firstExpired] = failures;
  if (loaded.length === 0 && firstExpired !== undefined) return Effect.fail(firstExpired);
  return Effect.succeed({ loaded, someSessionExpired: failures.length > 0 });
}
