/**
 * Renames a directory, retrying while Windows holds it. Right after a large clone, antivirus and
 * the search indexer keep handles open inside the new tree, and `rename` of the directory then
 * fails with EPERM/EBUSY/EACCES until they let go — a rename that would succeed seconds later.
 * Any other failure (missing source, existing target) is not transient and surfaces at once.
 *
 * @module t3team-renameWithRetry
 */
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";

const TRANSIENT_CODES: ReadonlySet<string> = new Set(["EPERM", "EBUSY", "EACCES"]);
const RETRY_DELAY_MS = 2_000;
/** About three minutes: a multi-gigabyte tree can take that long to be released. */
const RENAME_MAX_ATTEMPTS = 90;

/** The errno code behind a platform error (`error.reason.cause.code`), when there is one. */
const platformErrorCode = (error: unknown): string | undefined => {
  if (typeof error !== "object" || error === null || !("reason" in error)) return undefined;
  const { reason } = error;
  if (typeof reason !== "object" || reason === null || !("cause" in reason)) return undefined;
  const { cause } = reason;
  if (typeof cause !== "object" || cause === null || !("code" in cause)) return undefined;
  return typeof cause.code === "string" ? cause.code : undefined;
};

const isTransientRenameError = (error: unknown): boolean => {
  const code = platformErrorCode(error);
  return code !== undefined && TRANSIENT_CODES.has(code);
};

export const renameDirectoryWithRetry = Effect.fn("renameDirectoryWithRetry")(function* (
  from: string,
  to: string,
  options: { readonly maxAttempts?: number; readonly delayMs?: number } = {},
) {
  const fileSystem = yield* FileSystem.FileSystem;
  const maxAttempts = options.maxAttempts ?? RENAME_MAX_ATTEMPTS;
  const delayMs = options.delayMs ?? RETRY_DELAY_MS;
  const attempt = (number: number): ReturnType<typeof fileSystem.rename> =>
    fileSystem
      .rename(from, to)
      .pipe(
        Effect.catch((error) =>
          number >= maxAttempts || !isTransientRenameError(error)
            ? Effect.fail(error)
            : Effect.sleep(delayMs).pipe(Effect.andThen(attempt(number + 1))),
        ),
      );
  return yield* attempt(1);
});
