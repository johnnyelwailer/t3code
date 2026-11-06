/**
 * The delete's provider-side steps: stop the run, wait for its teardown to finish, and
 * remove the run's snapshot caches from the fleet repository.
 */
import { CloudSessionFailedError } from "@t3tools/contracts";
import * as Clock from "effect/Clock";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";

import {
  cancelRunRequest,
  deleteCacheRequest,
  listCachesRequest,
} from "./t3team-githubActionsSessionClient.ts";
import { parseCachesResponse } from "./t3team-githubActionsSessionParse.ts";
import { isSessionSnapshotKeyForRun } from "./t3team-CloudSessionDelete.ts";
import type { DeleteFlow } from "./t3team-CloudSessionDeleteFlow.ts";

/** How long a delete may wait for a stopped run's teardown before giving up (retryable). */
const STOP_WAIT_LIMIT = Duration.minutes(5);
const STOP_WAIT_FIRST_DELAY = Duration.seconds(2);
const STOP_WAIT_MAX_DELAY = Duration.seconds(15);

/** The cache pages one delete may read: a fleet with thousands of caches is not an error. */
const CACHE_PAGE_LIMIT = 20;

/**
 * Wait until the stopped run is `completed` — its teardown (snapshot save, machine preserve)
 * runs on cancel, and deleting before it finished would race the preserve.
 */
export const waitForRunEnd = Effect.fn("cloud.session.delete.wait")(function* (
  flow: DeleteFlow,
  runId: number,
) {
  const start = yield* Clock.currentTimeMillis;
  let delay = STOP_WAIT_FIRST_DELAY;
  while (true) {
    const run = yield* flow.gh.getRun(runId, { allowReserve: false });
    if (run.status === "completed") return;
    const elapsed = (yield* Clock.currentTimeMillis) - start;
    if (Duration.toMillis(elapsed) >= Duration.toMillis(STOP_WAIT_LIMIT)) {
      return yield* new CloudSessionFailedError({
        reason: "delete_blocked",
        message:
          "The session did not stop in time, so its work may not be saved yet. Try deleting it again.",
      });
    }
    yield* Effect.sleep(delay);
    delay = Duration.min(Duration.times(delay, 2), STOP_WAIT_MAX_DELAY);
  }
});

/** Cancel a still-running session the way `cancel` does (race-tolerant). */
export const cancelSessionRun = Effect.fn("cloud.session.delete.stop")(function* (
  flow: DeleteFlow,
  runId: number,
) {
  const { gh } = flow;
  return yield* gh.runInteractive(cancelRunRequest(flow.repoRef, runId)).pipe(
    Effect.asVoid,
    // It can end between the listing and the cancel; only a run still going is a failure.
    Effect.catch((error) =>
      gh
        .getRun(runId, { allowReserve: true })
        .pipe(
          Effect.flatMap((run) => (run.status === "completed" ? Effect.void : Effect.fail(error))),
        ),
    ),
  );
});

/**
 * Remove this run's snapshot cache entries from the fleet repository. A cache the fleet has
 * not stored for the run is not a failure: the session simply never saved one.
 */
export const removeSnapshotCaches = Effect.fn("cloud.session.delete.caches")(function* (
  flow: DeleteFlow,
  runId: number,
) {
  const ids: number[] = [];
  for (let page = 1; page <= CACHE_PAGE_LIMIT; page++) {
    const result = yield* flow.gh.runInteractive(listCachesRequest(flow.repoRef, page));
    const parsed = parseCachesResponse(result.body);
    if (parsed === null || result.truncated) {
      return yield* new CloudSessionFailedError({
        reason: "unreachable",
        message: "The provider returned an unreadable cache list; the delete was not done.",
      });
    }
    for (const entry of parsed.entries) {
      if (isSessionSnapshotKeyForRun(entry.key, runId)) ids.push(entry.id);
    }
    if (!parsed.hasMore) break;
  }
  for (const id of ids) {
    yield* flow.gh.runInteractive(deleteCacheRequest(flow.repoRef, id));
  }
  return ids.length;
});
