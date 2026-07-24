// @effect-diagnostics nodeBuiltinImport:off - statfs is used for free-space cache budgeting.
import * as NodeFSP from "node:fs/promises";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";

const gib = 1024 * 1024 * 1024;
const defaultReserveBytes = 20 * gib;

export type T3TeamContextCacheBudget = {
  readonly totalBytes: number;
  readonly freeBytes: number;
  readonly reserveBytes: number;
  readonly softBudgetBytes: number;
  readonly hardStop: boolean;
};

export class T3TeamContextCacheBudgetError extends Data.TaggedError(
  "T3TeamContextCacheBudgetError",
)<{
  readonly path: string;
  readonly cause: unknown;
}> {}

export function calculateT3TeamContextCacheBudget(input: {
  readonly totalBytes: number;
  readonly freeBytes: number;
  readonly reserveBytesOverride?: number;
}): T3TeamContextCacheBudget {
  const reserveBytes =
    input.reserveBytesOverride ?? Math.max(defaultReserveBytes, Math.floor(input.totalBytes * 0.1));
  const freeAboveReserve = Math.max(0, input.freeBytes - reserveBytes);
  const softBudgetBytes = Math.floor(freeAboveReserve * 0.5);
  const hardStop = input.freeBytes <= reserveBytes;
  return {
    totalBytes: input.totalBytes,
    freeBytes: input.freeBytes,
    reserveBytes,
    softBudgetBytes,
    hardStop,
  };
}

export function isT3TeamContextCacheSoftPressure(input: {
  readonly budget: T3TeamContextCacheBudget;
  readonly cacheBytes: number;
}): boolean {
  return input.cacheBytes >= input.budget.softBudgetBytes;
}

export function shouldRunT3TeamContextCachePurge(input: {
  readonly budget: T3TeamContextCacheBudget;
  readonly cacheBytes: number;
}): boolean {
  return input.budget.hardStop || isT3TeamContextCacheSoftPressure(input);
}

export function readT3TeamContextCacheBudget(path: string) {
  return Effect.tryPromise({
    try: async () => {
      const stats = await NodeFSP.statfs(path);
      return calculateT3TeamContextCacheBudget({
        totalBytes: Number(stats.blocks) * Number(stats.bsize),
        freeBytes: Number(stats.bavail) * Number(stats.bsize),
      });
    },
    catch: (cause) => new T3TeamContextCacheBudgetError({ path, cause }),
  });
}
