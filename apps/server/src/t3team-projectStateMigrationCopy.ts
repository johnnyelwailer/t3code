// @effect-diagnostics nodeBuiltinImport:off -- the copy follows links (stat, copyFile, rename).
/**
 * File and tree copies of the background state migration (`t3team-projectStateMigrationRun.ts`):
 * every file lands as `*.nexi-part` and is then renamed, so a crash never leaves a half file.
 *
 * @module t3team-projectStateMigrationCopy
 */
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";

import * as Data from "effect/Data";
import * as Effect from "effect/Effect";

import {
  io,
  isStateMigrationExcluded,
  PART_SUFFIX,
  type StateMigrationIoError,
} from "./t3team-projectStateMigration.ts";

/** Test seam failure: stands in for the process dying mid-copy. */
export class StateMigrationCrash extends Data.TaggedError("StateMigrationCrash")<{}> {}

export const lstatOrUndefined = (target: string) =>
  io(() => NodeFSP.lstat(target)).pipe(Effect.orElseSucceed(() => undefined));
export const statOrUndefined = (target: string) =>
  io(() => NodeFSP.stat(target)).pipe(Effect.orElseSucceed(() => undefined));

const copyThroughPart = (from: string, to: string) =>
  io(async () => {
    await NodeFSP.mkdir(NodePath.dirname(to), { recursive: true });
    await NodeFSP.copyFile(from, `${to}${PART_SUFFIX}`);
    await NodeFSP.rename(`${to}${PART_SUFFIX}`, to);
  });

/** A copier for one run. `afterCopy` runs after each copied file (progress and throttling);
 * `crashAfterFiles` is the crash test seam. */
export const makeStateMigrationCopier = <E>(options: {
  readonly crashAfterFiles?: number | undefined;
  readonly afterCopy: (copiedThisRun: number) => Effect.Effect<void, E>;
}) => {
  let copiedThisRun = 0;
  const stat = statOrUndefined;
  const lstat = lstatOrUndefined;

  const copyFile = (source: string, target: string, overwrite: boolean) =>
    Effect.gen(function* () {
      const sourceInfo = yield* stat(source);
      if (!sourceInfo?.isFile()) return;
      const targetInfo = yield* lstat(target);
      if (targetInfo && (!overwrite || targetInfo.size === sourceInfo.size)) return;
      if (options.crashAfterFiles !== undefined && copiedThisRun >= options.crashAfterFiles) {
        return yield* Effect.fail(new StateMigrationCrash());
      }
      yield* copyThroughPart(source, target);
      copiedThisRun += 1;
      yield* options.afterCopy(copiedThisRun);
    });

  /** Copies `source` over `target` when the target is missing or older than the source (a
   * replaced file gets a fresh mtime, so a rerun skips it; a target written since wins). */
  const copyFileIfNewer = (source: string, target: string) =>
    Effect.gen(function* () {
      const sourceInfo = yield* stat(source);
      if (!sourceInfo?.isFile()) return;
      const targetInfo = yield* stat(target);
      if (targetInfo && targetInfo.mtimeMs >= sourceInfo.mtimeMs) return;
      if (options.crashAfterFiles !== undefined && copiedThisRun >= options.crashAfterFiles) {
        return yield* Effect.fail(new StateMigrationCrash());
      }
      yield* copyThroughPart(source, target);
      copiedThisRun += 1;
      yield* options.afterCopy(copiedThisRun);
    });

  /** Copies `source` (followed through links) into `target`. `overwrite`: replace files whose
   * size differs (the job's own folder); otherwise existing target files win. `newerOnly`: the
   * catch-up pass, copying only files changed after the target copy was made. */
  const copyTree = (
    source: string,
    target: string,
    segments: ReadonlyArray<string>,
    mode: { readonly overwrite: boolean; readonly newerOnly?: boolean },
  ): Effect.Effect<void, StateMigrationIoError | StateMigrationCrash | E> =>
    Effect.gen(function* () {
      const names = yield* io(() => NodeFSP.readdir(source));
      for (const name of names) {
        const childSegments = [...segments, name];
        if (isStateMigrationExcluded(childSegments)) continue;
        const from = NodePath.join(source, name);
        const to = NodePath.join(target, name);
        const info = yield* stat(from);
        if (!info) continue;
        if (info.isDirectory()) {
          yield* copyTree(from, to, childSegments, mode);
        } else if (mode.newerOnly) {
          const existing = yield* stat(to);
          if (!existing || info.mtimeMs > existing.mtimeMs) {
            yield* copyThroughPart(from, to);
          }
        } else {
          yield* copyFile(from, to, mode.overwrite);
        }
      }
    });

  return { copyFile, copyFileIfNewer, copyTree };
};
