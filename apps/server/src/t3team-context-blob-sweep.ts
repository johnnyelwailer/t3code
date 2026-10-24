import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import {
  countT3TeamContextBlobReferences,
  markT3TeamContextBlobPurged,
} from "./t3team-context-blob-store-tables.ts";
import { T3TEAM_CONTEXT_BLOB_ROOT } from "./t3team-context-blob-store-utils.ts";

/** A fresh blob has nlink 1 until its artifact is linked, so a young blob is never swept. */
const DEFAULT_MIN_AGE_MS = 5 * 60 * 1000;
const DEFAULT_MAX_REMOVED = 5_000;
const BLOB_FILE_NAME = /^[0-9a-f]{64}$/;

const sweepsInFlight = new Set<string>();

/**
 * Removes blobs no artifact file links to. Artifacts are hardlinks into the blob cache, so a blob
 * with a link count of 1 is referenced by nothing on disk: every rewrite of a context file leaves
 * its superseded blob behind, and nothing else reclaims it unless the disk is under budget
 * pressure (`purgeT3TeamContextCache`). The scan is per workspace root because blobs live under
 * each root's own state dir while `t3team_context_blobs` is one table keyed by sha256 alone.
 * A removed blob is rewritten by the next write of the same content, so a lost race with a link
 * only costs a copy.
 */
export const sweepOrphanT3TeamContextBlobs = Effect.fn("t3team.contextCache.sweepOrphanBlobs")(
  function* (input: {
    readonly workspaceRoot: string;
    readonly minAgeMs?: number;
    readonly maxRemoved?: number;
  }) {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const now = yield* Clock.currentTimeMillis;
    const minAgeMs = input.minAgeMs ?? DEFAULT_MIN_AGE_MS;
    const maxRemoved = input.maxRemoved ?? DEFAULT_MAX_REMOVED;
    const blobRoot = path.join(input.workspaceRoot, T3TEAM_CONTEXT_BLOB_ROOT);
    const listDirectory = (directory: string) =>
      fileSystem
        .readDirectory(directory)
        .pipe(Effect.orElseSucceed((): ReadonlyArray<string> => []));

    let removedBlobCount = 0;
    let reclaimedBytes = 0;
    for (const shard of yield* listDirectory(blobRoot)) {
      for (const name of yield* listDirectory(path.join(blobRoot, shard))) {
        if (removedBlobCount >= maxRemoved) {
          return { removedBlobCount, reclaimedBytes };
        }
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
        if ((yield* countT3TeamContextBlobReferences(name)) === 0) {
          yield* markT3TeamContextBlobPurged(name);
        }
      }
    }
    return { removedBlobCount, reclaimedBytes };
  },
);

/** Runs a sweep for `workspaceRoot` in the background, one at a time per root. Failures only
 * log: the sweep is housekeeping and must never fail the write that triggered it. */
export function scheduleOrphanT3TeamContextBlobSweep(workspaceRoot: string) {
  return Effect.suspend(() => {
    if (sweepsInFlight.has(workspaceRoot)) return Effect.void;
    sweepsInFlight.add(workspaceRoot);
    return sweepOrphanT3TeamContextBlobs({ workspaceRoot }).pipe(
      Effect.catchCause((cause) =>
        Effect.logWarning("t3team.contextCache.sweepOrphanBlobs failed", { workspaceRoot, cause }),
      ),
      Effect.ensuring(Effect.sync(() => sweepsInFlight.delete(workspaceRoot))),
      Effect.forkDetach,
      Effect.asVoid,
    );
  });
}
