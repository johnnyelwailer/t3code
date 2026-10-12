import type { CloudSessionFailedError } from "@t3tools/contracts";
import * as Cache from "effect/Cache";
import * as Data from "effect/Data";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";

import type {
  GitHubActionsRequest,
  GitHubActionsResponse,
} from "./t3team-githubActionsSessionClient.ts";

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
export const LIVE_READ_TTL = Duration.seconds(5);

/** Settled data is immutable; the capacity bound, not time, is what retires it. */
const SETTLED_READ_TTL = Duration.infinity;

/** Comfortably more than the displayed list (and its failed runs) a server instance serves. */
const READ_CACHE_CAPACITY = 256;

/** Runs `effect` once for however many callers ask while it is in flight. */
export const makeSingleFlight = <A, E>(effect: Effect.Effect<A, E>) =>
  Cache.makeWith((_key: void) => effect, {
    capacity: 1,
    timeToLive: () => Duration.zero,
  }).pipe(Effect.map((cache) => Cache.get(cache, undefined)));

class ReadKey extends Data.Class<{
  readonly operation: string;
  readonly path: string;
  readonly lifetime: "live" | "settled";
}> {}

/** What a GET's answer is worth keeping, given how it ended. */
const timeToLive = (exit: Exit.Exit<GitHubActionsResponse, unknown>, key: ReadKey) => {
  if (Exit.isFailure(exit)) return Duration.zero;
  // A cut-off answer is not the final word even for a settled run.
  return key.lifetime === "settled" && !exit.value.truncated ? SETTLED_READ_TTL : LIVE_READ_TTL;
};

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
    (key: ReadKey) => execute({ kind: "rest", operation: key.operation, path: key.path }),
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
          }),
        ),
    ),
  );
