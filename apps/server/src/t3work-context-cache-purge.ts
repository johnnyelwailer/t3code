import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";

import {
  countT3workContextBlobReferences,
  listT3workContextPurgeCandidates,
  markT3workContextBlobPurged,
  sumT3workContextBlobBytes,
} from "./t3work-context-blob-store-tables.ts";
import type { T3workContextCacheBudget } from "./t3work-context-cache-budget.ts";
import {
  isT3workContextCacheSoftPressure,
  shouldRunT3workContextCachePurge,
} from "./t3work-context-cache-budget.ts";
import { WorkspacePaths } from "./workspace/WorkspacePaths.ts";

export type T3workContextCachePurgeResult = {
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
    const references = yield* countT3workContextBlobReferences(input.sha256);
    if (references > 0) {
      return 0;
    }
    yield* removeBlobFile(input.workspaceRoot, input.path);
    yield* markT3workContextBlobPurged(input.sha256);
    return 1;
  });
}

export function purgeT3workContextCache(input: {
  readonly workspaceRoot: string;
  readonly budget: T3workContextCacheBudget;
  readonly maxBlobs?: number;
}) {
  return Effect.gen(function* () {
    const cacheBytes = yield* sumT3workContextBlobBytes();
    if (!shouldRunT3workContextCachePurge({ budget: input.budget, cacheBytes })) {
      return { purgedBlobCount: 0, reclaimedBytes: 0, remainingCacheBytes: cacheBytes };
    }
    const candidates = yield* listT3workContextPurgeCandidates(input.maxBlobs ?? 8);
    let purgedBlobCount = 0;
    let reclaimedBytes = 0;
    for (const candidate of candidates) {
      const budget = input.budget;
      const cacheBytes = yield* sumT3workContextBlobBytes();
      if (!isT3workContextCacheSoftPressure({ budget, cacheBytes })) {
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
    const remainingCacheBytes = yield* sumT3workContextBlobBytes();
    return {
      purgedBlobCount,
      reclaimedBytes,
      remainingCacheBytes,
    } satisfies T3workContextCachePurgeResult;
  });
}

export function reclaimT3workContextCacheIfNeeded(input: {
  readonly workspaceRoot: string;
  readonly budget: T3workContextCacheBudget;
}) {
  return Effect.gen(function* () {
    const cacheBytes = yield* sumT3workContextBlobBytes();
    if (!isT3workContextCacheSoftPressure({ budget: input.budget, cacheBytes })) {
      return { purgedBlobCount: 0, reclaimedBytes: 0, remainingCacheBytes: cacheBytes };
    }
    return yield* purgeT3workContextCache(input);
  });
}
