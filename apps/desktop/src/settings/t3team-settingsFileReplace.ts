/**
 * Replacing a settings file on Windows, and cleaning up after the attempts that failed.
 *
 * `rename` over a file another process has open (a virus scanner, the search indexer, a backup
 * agent) fails with EPERM/EBUSY/EACCES for a moment. Without a retry that failure lost the write
 * AND left its temp file behind: on one machine 19,102 of them, 6.45 GB, in the state directory.
 *
 * @module t3team-settingsFileReplace
 */
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

const TRANSIENT_CODES: ReadonlySet<string> = new Set(["EPERM", "EBUSY", "EACCES"]);
/** Waits between attempts: about 1.5 s in all, well under the settings caller's own timeouts. */
const RETRY_DELAYS_MS: ReadonlyArray<number> = [25, 50, 100, 200, 400, 800];
/** A temp file this old is not an in-flight write, whoever wrote it. */
export const STALE_TEMP_FILE_AGE_MS = 10 * 60_000;

const errnoCode = (error: unknown): string | undefined => {
  if (typeof error !== "object" || error === null || !("reason" in error)) return undefined;
  const { reason } = error;
  if (typeof reason !== "object" || reason === null || !("cause" in reason)) return undefined;
  const { cause } = reason;
  if (typeof cause !== "object" || cause === null || !("code" in cause)) return undefined;
  return typeof cause.code === "string" ? cause.code : undefined;
};

const isTransientReplaceError = (error: unknown): boolean => {
  const code = errnoCode(error);
  return code !== undefined && TRANSIENT_CODES.has(code);
};

/**
 * Renames `tempPath` over `targetPath`, retrying while the target is held. When the replace cannot
 * be done the temp file is removed, so a failed write never leaves one behind.
 */
export const replaceFileWithRetry = (
  fileSystem: FileSystem.FileSystem,
  tempPath: string,
  targetPath: string,
  delaysMs: ReadonlyArray<number> = RETRY_DELAYS_MS,
) => {
  /** Windows also reports EPERM for a file renamed onto a directory, which no wait will fix. */
  const targetIsDirectory = fileSystem.stat(targetPath).pipe(
    Effect.map((info) => info.type === "Directory"),
    Effect.orElseSucceed(() => false),
  );
  const attempt = (index: number): ReturnType<typeof fileSystem.rename> =>
    fileSystem.rename(tempPath, targetPath).pipe(
      Effect.catch((error) => {
        const delay = delaysMs[index];
        if (delay === undefined || !isTransientReplaceError(error)) return Effect.fail(error);
        return targetIsDirectory.pipe(
          Effect.flatMap((isDirectory) =>
            isDirectory
              ? Effect.fail(error)
              : Effect.sleep(delay).pipe(Effect.andThen(attempt(index + 1))),
          ),
        );
      }),
    );
  return attempt(0).pipe(
    Effect.tapError(() => fileSystem.remove(tempPath, { force: true }).pipe(Effect.ignore)),
  );
};

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Removes `<baseName>.<pid>.<32 hex>.tmp` files older than {@link STALE_TEMP_FILE_AGE_MS} from
 * `directory`: what earlier failed writes left behind. Best effort and sequential, so a backlog of
 * thousands is cleared without a burst of disk work; anything that cannot be removed is skipped.
 */
export const removeStaleSettingsTempFiles = Effect.fn("removeStaleSettingsTempFiles")(function* (
  fileSystem: FileSystem.FileSystem,
  path: Path.Path,
  directory: string,
  baseName: string,
) {
  const pattern = new RegExp(`^${escapeRegExp(baseName)}\\.\\d+\\.[0-9a-f]{32}\\.tmp$`);
  const names = yield* fileSystem
    .readDirectory(directory)
    .pipe(Effect.orElseSucceed((): ReadonlyArray<string> => []));
  const nowMs = yield* Clock.currentTimeMillis;
  let removed = 0;
  for (const name of names) {
    if (!pattern.test(name)) continue;
    const file = path.join(directory, name);
    const info = yield* fileSystem.stat(file).pipe(Effect.option);
    if (info._tag === "None") continue;
    const modifiedMs =
      info.value.mtime._tag === "Some" ? info.value.mtime.value.getTime() : undefined;
    if (modifiedMs === undefined || nowMs - modifiedMs < STALE_TEMP_FILE_AGE_MS) continue;
    const gone = yield* fileSystem.remove(file, { force: true }).pipe(Effect.option);
    if (gone._tag === "Some") removed += 1;
  }
  return removed;
});
