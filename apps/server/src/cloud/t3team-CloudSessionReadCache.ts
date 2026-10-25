import { CloudSessionFailedError } from "@t3tools/contracts";
import * as Cache from "effect/Cache";
import * as Data from "effect/Data";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";

import type {
  GitHubActionsRequest,
  GitHubActionsResponse,
} from "@t3tools/shared/t3team-cloudSessionActionsRequests";
import { jobsMatchAttempt } from "@t3tools/shared/t3team-cloudSessionActionsParse";

/**
 * How the cloud session list spends fewer GHE calls on data it already read.
 *
 * Two shapes, both on `effect/Cache` (concurrent `get`s for one key share a
 * single lookup, and a lookup is only abandoned when every waiter has left):
 *
 * - `makeSingleFlight` collapses concurrent callers of one effect (every tab,
 *   menu and poll asking for the list at once) onto a single execution. It
 *   remembers nothing once that execution ends.
 * - `makeSessionReadCache` keeps a GET's answer: briefly while its run is live,
 *   and for good once the run has settled, since a finished run never changes.
 */

/** A live run's detail moves on the client poll cadence; a few seconds shares one call. */
const LIVE_READ_TTL = Duration.seconds(5);

/** Settled data is immutable; the capacity bound, not time, is what retires it. */
const SETTLED_READ_TTL = Duration.infinity;

/** Comfortably more than the displayed list (and its failed runs) a server instance serves. */
const READ_CACHE_CAPACITY = 256;

/** Bounds the distinct identities in flight at once; a flight is removed the moment it ends. */
const SINGLE_FLIGHT_CAPACITY = 64;

/**
 * Runs `effect` once for however many callers *of the same identity* ask while it is in flight.
 * `identityOf` names whose answer this is (the credential the request will carry): callers under
 * different credentials never share a flight, since their answers are different users' data.
 * The flight runs under the first caller's context, which is right because it shares that
 * caller's identity. When the identity cannot be resolved nothing is shared — each caller runs
 * (and fails, or not) on its own.
 */
export const makeSingleFlight = <A, E, E2>(
  effect: Effect.Effect<A, E>,
  identityOf: Effect.Effect<string, E2>,
) =>
  Cache.makeWith((_identity: string) => effect, {
    capacity: SINGLE_FLIGHT_CAPACITY,
    timeToLive: () => Duration.zero,
  }).pipe(
    Effect.map((cache) =>
      identityOf.pipe(
        Effect.matchEffect({
          onFailure: () => effect,
          onSuccess: (identity) => Cache.get(cache, identity),
        }),
      ),
    ),
  );

class ReadKey extends Data.Class<{
  readonly operation: string;
  readonly path: string;
  readonly lifetime: "live" | "settled";
  /** Which attempt of the run: a re-run keeps the run id, so it must not read the first one's. */
  readonly attempt: number;
}> {}

/** What a GET's answer is worth keeping, given how it ended. */
const timeToLive = (exit: Exit.Exit<GitHubActionsResponse, unknown>, key: ReadKey) => {
  if (Exit.isFailure(exit)) return Duration.zero;
  return key.lifetime === "settled" ? SETTLED_READ_TTL : LIVE_READ_TTL;
};

/**
 * A settled read is only kept (and only believed) when its answer is demonstrably the key's
 * attempt: the jobs endpoint answers for the latest attempt, so a re-run that started after the
 * listing would otherwise be cached as the finished attempt's steps for good. Anything else
 * fails — read as "steps unreadable" by the caller, and retried — rather than cached.
 */
const readSettled = (
  key: ReadKey,
  answer: GitHubActionsResponse,
): Effect.Effect<GitHubActionsResponse, CloudSessionFailedError> =>
  key.lifetime !== "settled" || (!answer.truncated && jobsMatchAttempt(answer.body, key.attempt))
    ? Effect.succeed(answer)
    : Effect.fail(
        new CloudSessionFailedError({
          reason: "unreachable",
          message: "The provider returned steps for a different run attempt.",
        }),
      );

/** The request kinds this cache serves: a REST GET that declared a `lifetime`. */
export const isCacheableRead = (
  request: GitHubActionsRequest,
): request is Extract<GitHubActionsRequest, { kind: "rest" }> & {
  readonly lifetime: "live" | "settled";
} =>
  request.kind === "rest" &&
  request.lifetime !== undefined &&
  (request.method === undefined || request.method === "GET");

/**
 * A cache over `execute` for the reads that opt in with a `lifetime`. Failures
 * are never kept, so a rate-limit pause or a flaky call is retried at once.
 */
export const makeSessionReadCache = (
  execute: (
    request: GitHubActionsRequest,
  ) => Effect.Effect<GitHubActionsResponse, CloudSessionFailedError>,
) =>
  Cache.makeWith(
    (key: ReadKey) =>
      execute({ kind: "rest", operation: key.operation, path: key.path }).pipe(
        Effect.flatMap((answer) => readSettled(key, answer)),
      ),
    { capacity: READ_CACHE_CAPACITY, timeToLive },
  ).pipe(
    Effect.map(
      (cache) => (request: Extract<GitHubActionsRequest, { kind: "rest" }>) =>
        Cache.get(
          cache,
          new ReadKey({
            operation: request.operation,
            path: request.path,
            lifetime: request.lifetime ?? "live",
            attempt: request.attempt ?? 1,
          }),
        ),
    ),
  );
