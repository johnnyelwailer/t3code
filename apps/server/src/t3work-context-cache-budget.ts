// @effect-diagnostics nodeBuiltinImport:off - statfs is used for free-space cache budgeting.
import * as NodeFSP from "node:fs/promises";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";

const gib = 1024 * 1024 * 1024;
const defaultReserveBytes = 20 * gib;

export type T3workContextCacheBudget = {
  readonly totalBytes: number;
  readonly freeBytes: number;
  readonly reserveBytes: number;
  readonly softBudgetBytes: number;
  readonly hardStop: boolean;
};

export class T3workContextCacheBudgetError extends Data.TaggedError(
  "T3workContextCacheBudgetError",
)<{
  readonly path: string;
  readonly cause: unknown;
}> {}

export function calculateT3workContextCacheBudget(input: {
  readonly totalBytes: number;
  readonly freeBytes: number;
  readonly reserveBytesOverride?: number;
}): T3workContextCacheBudget {
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

export function isT3workContextCacheSoftPressure(input: {
  readonly budget: T3workContextCacheBudget;
  readonly cacheBytes: number;
}): boolean {
  return input.cacheBytes >= input.budget.softBudgetBytes;
}

export function shouldRunT3workContextCachePurge(input: {
  readonly budget: T3workContextCacheBudget;
  readonly cacheBytes: number;
}): boolean {
  return input.budget.hardStop || isT3workContextCacheSoftPressure(input);
}

export function readT3workContextCacheBudget(path: string) {
  return Effect.tryPromise({
    try: async () => {
      const stats = await NodeFSP.statfs(path);
      return calculateT3workContextCacheBudget({
        totalBytes: Number(stats.blocks) * Number(stats.bsize),
        freeBytes: Number(stats.bavail) * Number(stats.bsize),
      });
    },
    catch: (cause) => new T3workContextCacheBudgetError({ path, cause }),
  });
}
