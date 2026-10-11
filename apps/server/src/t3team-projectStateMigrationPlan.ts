/**
 * Whether a main-repository switch copies the project state dir inline or hands it to a
 * migration thread (flag `NEXI_FF_MAIN_REPOSITORY`).
 *
 * The scan is bounded: it stops once it has seen more than {@link STATE_MIGRATION_SCAN_BUDGET}
 * source files or more than {@link STATE_MIGRATION_INLINE_LIMIT} files the target lacks, so
 * deciding never costs more than a few thousand stats however large the state dir is. Only a
 * migration the scan saw to its end, with at most the inline limit to copy, stays inline.
 *
 * @module t3team-projectStateMigrationPlan
 */
import { PROJECT_STATE_DIR } from "@t3tools/project-context/t3teamProjectStateDir";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import {
  ensureNexiProjectStateDir,
  isMigrationExcluded,
} from "./t3team-projectMainRepositoryState.ts";

/** At most this many missing files are copied inline. */
const STATE_MIGRATION_INLINE_LIMIT = 200;
/** Source files the scan visits before it stops and hands the migration off. */
const STATE_MIGRATION_SCAN_BUDGET = 2_000;

export type ProjectStateMigrationPlan =
  | { readonly kind: "none" }
  | { readonly kind: "inline"; readonly missingFiles: number }
  | { readonly kind: "handoff"; readonly missingFilesAtLeast: number; readonly scanned: number };

class ScanStop extends Data.TaggedError("ScanStop")<{}> {}

export const planProjectStateMigration = Effect.fn("planProjectStateMigration")(function* (input: {
  readonly fromRoot: string;
  readonly toRoot: string;
  readonly scanBudget?: number;
  readonly inlineLimit?: number;
}) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const scanBudget = input.scanBudget ?? STATE_MIGRATION_SCAN_BUDGET;
  const inlineLimit = input.inlineLimit ?? STATE_MIGRATION_INLINE_LIMIT;
  yield* ensureNexiProjectStateDir(input.fromRoot);
  yield* ensureNexiProjectStateDir(input.toRoot);
  const sourceRoot = path.join(input.fromRoot, PROJECT_STATE_DIR);
  const targetRoot = path.join(input.toRoot, PROJECT_STATE_DIR);
  if (path.resolve(sourceRoot) === path.resolve(targetRoot)) {
    return { kind: "none" } satisfies ProjectStateMigrationPlan;
  }

  let scanned = 0;
  let missing = 0;
  const visit = (segments: ReadonlyArray<string>): Effect.Effect<void, ScanStop> =>
    Effect.gen(function* () {
      if (isMigrationExcluded(segments)) return;
      const source = path.join(sourceRoot, ...segments);
      const info = yield* fileSystem.stat(source).pipe(Effect.option);
      if (info._tag === "None") return;
      if (info.value.type === "Directory") {
        const children = yield* fileSystem
          .readDirectory(source)
          .pipe(Effect.orElseSucceed((): ReadonlyArray<string> => []));
        for (const child of children) yield* visit([...segments, child]);
        return;
      }
      if (info.value.type !== "File") return;
      scanned += 1;
      const present = yield* fileSystem
        .exists(path.join(targetRoot, ...segments))
        .pipe(Effect.orElseSucceed(() => true));
      if (!present) missing += 1;
      if (scanned > scanBudget || missing > inlineLimit) {
        return yield* new ScanStop();
      }
    });

  const stopped = yield* visit([]).pipe(
    Effect.as(false),
    Effect.catchTags({ ScanStop: () => Effect.succeed(true) }),
  );
  if (stopped) {
    return {
      kind: "handoff",
      missingFilesAtLeast: missing,
      scanned,
    } satisfies ProjectStateMigrationPlan;
  }
  return (
    missing === 0 ? { kind: "none" } : { kind: "inline", missingFiles: missing }
  ) satisfies ProjectStateMigrationPlan;
});
