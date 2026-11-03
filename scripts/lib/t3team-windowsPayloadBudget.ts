/**
 * File budget for the packaged Windows payload (validateWindowsPackagedPayload).
 *
 * The fixed-runtime budget (WINDOWS_PACKAGED_PAYLOAD_FILE_LIMIT) catches loose-file growth in
 * Electron and native payloads. Two directories are loose by design and accounted separately:
 *
 * - `packs/`: distribution packs; their count varies by distro, so they are not budgeted.
 * - `server-compile-cache/`: prepared V8 bytecode that upstream's afterPack hook
 *   (scripts/prepare-server-compile-cache.cjs) writes on a native Windows build: one file per
 *   statically imported server chunk (19 at the sync of 2026-11-02) plus manifest.json = 20.
 *   Its count follows upstream's chunking, so it has its own budget with headroom for drift.
 *
 * Without the second exemption the 62 other files of rc.7 became 82 and failed the 80 budget.
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
