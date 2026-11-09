/**
 * The delete's provider-side steps: stop the run, wait for its teardown to finish, refuse while
 * another run of the workspace is live, and read and remove the workspace's snapshot caches.
 */
import { CloudSessionFailedError } from "@t3tools/contracts";
import * as Clock from "effect/Clock";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Ref from "effect/Ref";

import {
  cancelRunRequest,
  deleteCacheRequest,
  listCachesRequest,
} from "./t3team-githubActionsSessionClient.ts";
import { parseCachesResponse } from "./t3team-githubActionsSessionParse.ts";
import {
  parseSessionRunIdentity,
  parseSnapshotCacheKey,
  type SnapshotCacheKey,
} from "./t3team-CloudSessionDelete.ts";
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

export interface SnapshotScan {
  /** Every session snapshot entry the scan read, with its parsed key. */
  readonly entries: ReadonlyArray<{ readonly id: number } & SnapshotCacheKey>;
  /** False when the fleet holds more caches than one delete reads. */
  readonly complete: boolean;
}

/** Read the fleet's session snapshot caches, bounded at `CACHE_PAGE_LIMIT` pages. */
export const scanSnapshotCaches = Effect.fn("cloud.session.delete.caches.scan")(function* (
  flow: DeleteFlow,
) {
  const entries: Array<{ readonly id: number } & SnapshotCacheKey> = [];
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
      const key = parseSnapshotCacheKey(entry.key);
      if (key !== null) entries.push({ id: entry.id, ...key });
    }
    if (!parsed.hasMore) return { entries, complete: true } satisfies SnapshotScan;
  }
  return { entries, complete: false } satisfies SnapshotScan;
});

/** Remove cache entries by id; one the fleet already dropped is not a failure. */
export const removeCaches = Effect.fn("cloud.session.delete.caches.remove")(function* (
  flow: DeleteFlow,
  ids: ReadonlyArray<number>,
) {
  for (const id of ids) {
    yield* flow.gh.runInteractive(deleteCacheRequest(flow.repoRef, id));
  }
});

/**
 * Refuse while another run of this workspace is live: it could restore what the delete is
 * removing, or push its resume branch again right after.
 */
export const assertNoOtherLiveRun = Effect.fn("cloud.session.delete.live")(function* (
  flow: DeleteFlow,
  runId: number,
  workspace: string,
) {
  const login = yield* flow.gh.resolveLogin({ allowReserve: true });
  const listed = (yield* flow.gh.listRunsFor(login, { allowReserve: true }))
    .filter((run) => parseSessionRunIdentity(run.name).workspace === workspace)
    .map((run) => ({ id: run.id, status: run.status }));
  const claimed = [...(yield* Ref.get(flow.claims)).entries()]
    .filter(([, entry]) => entry.login === login && entry.workspace === workspace)
    .map(([id]) => Number(id));
  for (const id of claimed) {
    if (id !== runId && !listed.some((run) => run.id === id)) {
      listed.push({ id, status: (yield* flow.gh.getRun(id, { allowReserve: true })).status });
    }
  }
  const live = listed.find((run) => run.id !== runId && run.status !== "completed");
  if (live !== undefined) {
    return yield* new CloudSessionFailedError({
      reason: "delete_blocked",
      message: `Another session of this machine is still running (run ${live.id}). Stop it first, then delete.`,
    });
  }
});
