/**
 * `packs/` is exempt from the runtime budget; so is `server-compile-cache/`, which upstream's afterPack
 * hook writes: 19 server chunks + manifest.json = 20 files (2026-11-02), with its own budget for drift.
 */
export const PREPARED_SERVER_CACHE_DIR = "server-compile-cache";
export const PREPARED_SERVER_CACHE_FILE_LIMIT = 32;

export interface WindowsPayloadBudgetViolation {
  readonly fileCount: number;
  readonly fileLimit: number;
  readonly detail: string;
}

export function windowsPayloadBudgetViolation(input: {
  readonly totalFileCount: number;
  readonly bundledPackFileCount: number;
  readonly preparedCacheFileCount: number;
  readonly fileLimit: number;
}): WindowsPayloadBudgetViolation | undefined {
  const guarded = input.totalFileCount - input.bundledPackFileCount - input.preparedCacheFileCount;
  if (input.preparedCacheFileCount > PREPARED_SERVER_CACHE_FILE_LIMIT) {
    return {
      fileCount: input.preparedCacheFileCount,
      fileLimit: PREPARED_SERVER_CACHE_FILE_LIMIT,
      detail: `${PREPARED_SERVER_CACHE_DIR}/ holds ${String(input.preparedCacheFileCount)} files; its budget is ${String(PREPARED_SERVER_CACHE_FILE_LIMIT)}.`,
    };
  }
  if (guarded > input.fileLimit) {
    return {
      fileCount: guarded,
      fileLimit: input.fileLimit,
      detail: `${String(guarded)} files outside packs/ and ${PREPARED_SERVER_CACHE_DIR}/; the budget is ${String(input.fileLimit)}.`,
    };
  }
  return undefined;
}
