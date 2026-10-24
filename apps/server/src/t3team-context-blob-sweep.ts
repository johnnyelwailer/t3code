import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import { markT3TeamContextBlobPurgedIfUnreferenced } from "./t3team-context-blob-store-tables.ts";
import { T3TEAM_CONTEXT_BLOB_ROOT } from "./t3team-context-blob-store-utils.ts";

/** A fresh blob has nlink 1 until its artifact is linked, so a young blob is never swept. */
const DEFAULT_MIN_AGE_MS = 5 * 60 * 1000;
const DEFAULT_MAX_REMOVED = 5_000;
/** Bounds stat calls per sweep: a cache of young or linked blobs removes nothing, so the removal cap alone never ends a scan. */
const DEFAULT_MAX_INSPECTED = 5_000;
const MIN_SWEEP_INTERVAL_MS = 30_000;
const BLOB_FILE_NAME = /^[0-9a-f]{64}$/;

type SweepState = { running: boolean; lastStartedAt: number; cursor: string | undefined };
const sweepStates = new Map<string, SweepState>();

/** Claims the root's next sweep slot, or returns undefined while one runs or ran under `MIN_SWEEP_INTERVAL_MS` ago. */
export function claimOrphanT3TeamContextBlobSweep(workspaceRoot: string, now: number) {
  const state = sweepStates.get(workspaceRoot) ?? {
    running: false,
    lastStartedAt: Number.NEGATIVE_INFINITY,
    cursor: undefined,
  };
  if (state.running || now - state.lastStartedAt < MIN_SWEEP_INTERVAL_MS) return undefined;
  state.running = true;
  state.lastStartedAt = now;
  sweepStates.set(workspaceRoot, state);
  return state;
}

/**
 * Removes blobs no artifact file links to. Artifacts are hardlinks into the blob cache, so a blob
 * with a link count of 1 is referenced by nothing on disk: every rewrite of a context file leaves
 * its superseded blob behind, and nothing else reclaims it unless the disk is under budget
 * pressure (`purgeT3TeamContextCache`). The scan is per workspace root because blobs live under
 * each root's own state dir while `t3team_context_blobs` is one table keyed by sha256 alone.
 * A sweep inspects at most `maxInspected` entries and returns `nextCursor` (the last inspected
 * `shard/name`) to resume after, or undefined once the whole cache has been walked.
 * A removed blob is rewritten by the next write of the same content, so a lost race with a link
 * only costs a copy.
 */
export const sweepOrphanT3TeamContextBlobs = Effect.fn("t3team.contextCache.sweepOrphanBlobs")(
  function* (input: {
    readonly workspaceRoot: string;
    readonly minAgeMs?: number;
    readonly maxRemoved?: number;
    readonly maxInspected?: number;
    readonly after?: string;
  }) {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const now = yield* Clock.currentTimeMillis;
    const minAgeMs = input.minAgeMs ?? DEFAULT_MIN_AGE_MS;
    const maxRemoved = input.maxRemoved ?? DEFAULT_MAX_REMOVED;
    const maxInspected = input.maxInspected ?? DEFAULT_MAX_INSPECTED;
    const blobRoot = path.join(input.workspaceRoot, T3TEAM_CONTEXT_BLOB_ROOT);
    const listDirectory = (directory: string) =>
      fileSystem
        .readDirectory(directory)
        .pipe(Effect.orElseSucceed((): ReadonlyArray<string> => []));

    let removedBlobCount = 0;
    let reclaimedBytes = 0;
    let inspected = 0;
    let lastKey = input.after;
    const afterShard = input.after?.split("/")[0];
    for (const shard of (yield* listDirectory(blobRoot)).toSorted()) {
      if (afterShard !== undefined && shard < afterShard) continue;
      for (const name of (yield* listDirectory(path.join(blobRoot, shard))).toSorted()) {
        const key = `${shard}/${name}`;
        if (input.after !== undefined && key <= input.after) continue;
        if (removedBlobCount >= maxRemoved || inspected >= maxInspected) {
          return { removedBlobCount, reclaimedBytes, inspected, nextCursor: lastKey };
        }
        lastKey = key;
        inspected += 1;
        if (!BLOB_FILE_NAME.test(name)) continue;
        const blobPath = path.join(blobRoot, shard, name);
        const info = yield* fileSystem.stat(blobPath).pipe(Effect.option);
        if (Option.isNone(info) || info.value.type !== "File") continue;
        // Unknown link count or age: keep the blob rather than guess. Node reports `nlink` as a
        // bigint at runtime although `FileSystem.File.Info` types it as a number.
        const nlink = Option.map(info.value.nlink, Number).pipe(Option.getOrUndefined);
        const mtime = Option.getOrUndefined(info.value.mtime);
        if (nlink !== 1 || mtime === undefined || now - mtime.getTime() < minAgeMs) continue;
        const removed = yield* fileSystem.remove(blobPath, { force: true }).pipe(Effect.option);
        if (Option.isNone(removed)) continue;
        removedBlobCount += 1;
        reclaimedBytes += Number(info.value.size);
        // Another root may still reference the same content; its row stays live.
        yield* markT3TeamContextBlobPurgedIfUnreferenced(name);
      }
    }
    return { removedBlobCount, reclaimedBytes, inspected, nextCursor: undefined };
  },
);

/** Runs a sweep for `workspaceRoot` in the background, resuming where the root's last one stopped.
 * At most one runs per root and at most one per `MIN_SWEEP_INTERVAL_MS`. Failures only log: the
 * sweep is housekeeping and must never fail the write that triggered it. */
export const scheduleOrphanT3TeamContextBlobSweep = Effect.fn(
  "t3team.contextCache.scheduleOrphanBlobSweep",
)(function* (workspaceRoot: string) {
  const state = claimOrphanT3TeamContextBlobSweep(workspaceRoot, yield* Clock.currentTimeMillis);
  if (state === undefined) return;
  yield* sweepOrphanT3TeamContextBlobs({
    workspaceRoot,
    ...(state.cursor === undefined ? {} : { after: state.cursor }),
  }).pipe(
    Effect.tap((result) => Effect.sync(() => (state.cursor = result.nextCursor))),
    Effect.catchCause((cause) =>
      Effect.logWarning("t3team.contextCache.sweepOrphanBlobs failed", { workspaceRoot, cause }),
    ),
    Effect.ensuring(Effect.sync(() => (state.running = false))),
    Effect.forkDetach,
  );
});
