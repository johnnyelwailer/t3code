import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";

import {
  countT3TeamContextBlobReferences,
  listT3TeamContextPurgeCandidates,
  markT3TeamContextBlobPurged,
  sumT3TeamContextBlobBytes,
} from "./t3team-context-blob-store-tables.ts";
import type { T3TeamContextCacheBudget } from "./t3team-context-cache-budget.ts";
import {
  isT3TeamContextCacheSoftPressure,
  shouldRunT3TeamContextCachePurge,
} from "./t3team-context-cache-budget.ts";
import { WorkspacePaths } from "./workspace/WorkspacePaths.ts";

export type T3TeamContextCachePurgeResult = {
  readonly purgedBlobCount: number;
  readonly reclaimedBytes: number;
  readonly remainingCacheBytes: number;
};

function removeBlobFile(workspaceRoot: string, blobRelativePath: string) {
  return Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const workspacePaths = yield* WorkspacePaths;
    const resolved = yield* workspacePaths.resolveRelativePathWithinRoot({
      workspaceRoot,
      relativePath: blobRelativePath,
    });
    yield* fileSystem.remove(resolved.absolutePath, { force: true }).pipe(Effect.ignore);
  });
}

function purgeBlob(input: {
  readonly workspaceRoot: string;
  readonly sha256: string;
  readonly path: string;
}) {
  return Effect.gen(function* () {
    const references = yield* countT3TeamContextBlobReferences(input.sha256);
    if (references > 0) {
      return 0;
    }
    yield* removeBlobFile(input.workspaceRoot, input.path);
    yield* markT3TeamContextBlobPurged(input.sha256);
    return 1;
  });
}

export function purgeT3TeamContextCache(input: {
  readonly workspaceRoot: string;
  readonly budget: T3TeamContextCacheBudget;
  readonly maxBlobs?: number;
}) {
  return Effect.gen(function* () {
    const cacheBytes = yield* sumT3TeamContextBlobBytes();
    if (!shouldRunT3TeamContextCachePurge({ budget: input.budget, cacheBytes })) {
      return { purgedBlobCount: 0, reclaimedBytes: 0, remainingCacheBytes: cacheBytes };
    }
    const candidates = yield* listT3TeamContextPurgeCandidates(input.maxBlobs ?? 8);
    let purgedBlobCount = 0;
    let reclaimedBytes = 0;
    for (const candidate of candidates) {
      const budget = input.budget;
      const cacheBytes = yield* sumT3TeamContextBlobBytes();
      if (!isT3TeamContextCacheSoftPressure({ budget, cacheBytes })) {
        break;
      }
      const purged = yield* purgeBlob({
        workspaceRoot: input.workspaceRoot,
        sha256: candidate.sha256,
        path: candidate.path,
      });
      if (purged > 0) {
        purgedBlobCount += purged;
        reclaimedBytes += candidate.size_bytes;
      }
    }
    const remainingCacheBytes = yield* sumT3TeamContextBlobBytes();
    return {
      purgedBlobCount,
      reclaimedBytes,
      remainingCacheBytes,
    } satisfies T3TeamContextCachePurgeResult;
  });
}

export function reclaimT3TeamContextCacheIfNeeded(input: {
  readonly workspaceRoot: string;
  readonly budget: T3TeamContextCacheBudget;
}) {
  return Effect.gen(function* () {
    const cacheBytes = yield* sumT3TeamContextBlobBytes();
    if (!isT3TeamContextCacheSoftPressure({ budget: input.budget, cacheBytes })) {
      return { purgedBlobCount: 0, reclaimedBytes: 0, remainingCacheBytes: cacheBytes };
    }
    return yield* purgeT3TeamContextCache(input);
  });
}
