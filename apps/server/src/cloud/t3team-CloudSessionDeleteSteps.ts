/**
 * The delete's provider-side steps: stop the run, wait for its teardown and check it saved,
 * and read and remove snapshot caches.
 */
import { CloudSessionFailedError } from "@t3tools/contracts";
import * as Clock from "effect/Clock";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";

import {
  cancelRunRequest,
  deleteCacheRequest,
  jobStepsRequest,
  listCachesRequest,
} from "./t3team-githubActionsSessionClient.ts";
import { parseCachesResponse, parseJobStepsResponse } from "./t3team-githubActionsSessionParse.ts";
import { parseSnapshotCacheKey, type SnapshotCacheKey } from "./t3team-CloudSessionDelete.ts";
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
  /** Every session snapshot entry under the prefix, with its parsed key. */
  readonly entries: ReadonlyArray<{ readonly id: number } & SnapshotCacheKey>;
  /** False when more entries match than one delete reads. */
  readonly complete: boolean;
}

/** Read the fleet's snapshot caches under `keyPrefix`, bounded at `CACHE_PAGE_LIMIT` pages. */
export const scanSnapshotCaches = Effect.fn("cloud.session.delete.caches.scan")(function* (
  flow: DeleteFlow,
  keyPrefix: string,
) {
  const entries: Array<{ readonly id: number } & SnapshotCacheKey> = [];
  for (let page = 1; page <= CACHE_PAGE_LIMIT; page++) {
    const result = yield* flow.gh.runInteractive(listCachesRequest(flow.repoRef, page, keyPrefix));
    const parsed = parseCachesResponse(result.body);
    if (parsed === null || result.truncated) {
      return yield* new CloudSessionFailedError({
        reason: "unreachable",
        message: "The provider returned an unreadable cache list; the delete was not done.",
      });
    }
    for (const entry of parsed.entries) {
      const key = parseSnapshotCacheKey(entry.key);
      if (key !== null && entry.key.startsWith(keyPrefix)) entries.push({ id: entry.id, ...key });
    }
    if (!parsed.hasMore) return { entries, complete: true } satisfies SnapshotScan;
  }
  return { entries, complete: false } satisfies SnapshotScan;
});

/**
 * Remove cache entries by id, then read the prefix again: an entry no longer listed is removed
 * (a 404 from a race included), one still listed is not. Answers the ids still there.
 */
export const removeCaches = Effect.fn("cloud.session.delete.caches.remove")(function* (
  flow: DeleteFlow,
  ids: ReadonlyArray<number>,
  keyPrefix: string,
) {
  for (const id of ids) {
    yield* flow.gh.runInteractive(deleteCacheRequest(flow.repoRef, id)).pipe(Effect.ignore);
  }
  const after = yield* scanSnapshotCaches(flow, keyPrefix);
  return ids.filter((id) => after.entries.some((entry) => entry.id === id));
});

/** session.yml's teardown steps a delete relies on (hive's session-delete-names test pins them). */
export const TEARDOWN_STEPS = {
  handoffSave: "Save session snapshot (workspace continuity)",
  stageFinal: "Stage the final snapshot",
  finalSave: "Save the final session snapshot (workspace continuity)",
  preserve: "Preserve the project machine's checkout for the next session",
} as const;

/**
 * Refuse unless the ended run saved its last state: the final snapshot (or, on an idle release
 * that skips it, the handoff save) and, for a session with a repository, its checkout. Without
 * them the snapshots and the resume branch hold older work than the machine had.
 */
export const assertTeardownSaved = Effect.fn("cloud.session.delete.teardown")(function* (
  flow: DeleteFlow,
  runId: number,
  hasCheckout: boolean,
) {
  const result = yield* flow.gh.runInteractive(jobStepsRequest(flow.repoRef, runId));
  const steps = parseJobStepsResponse(result.body);
  if (steps === null) {
    return yield* new CloudSessionFailedError({
      reason: "unreachable",
      message: "The provider returned unreadable job steps; the delete was not done.",
    });
  }
  const outcome = (name: string) =>
    steps.find((step) => step.name === name)?.conclusion ?? "missing";
  const final = outcome(TEARDOWN_STEPS.finalSave);
  const saved =
    outcome(TEARDOWN_STEPS.stageFinal) === "success" &&
    (final === "success" ||
      (final === "skipped" && outcome(TEARDOWN_STEPS.handoffSave) === "success"));
  const unsaved = !saved
    ? `"${TEARDOWN_STEPS.finalSave}" ended ${final}`
    : hasCheckout && outcome(TEARDOWN_STEPS.preserve) !== "success"
      ? `"${TEARDOWN_STEPS.preserve}" ended ${outcome(TEARDOWN_STEPS.preserve)}`
      : null;
  if (unsaved !== null) {
    return yield* new CloudSessionFailedError({
      reason: "delete_blocked",
      message: `The machine did not save its last state when it stopped (${unsaved}), so deleting would lose work. Nothing was deleted.`,
    });
  }
});
