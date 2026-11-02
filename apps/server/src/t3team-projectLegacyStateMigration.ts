/**
 * Moves legacy `.nexi` state into `.agents/nexi`, per file and never over an existing one.
 * Machine-local entries and symlinks stay; a symlinked source or target dir refuses the move.
 */
import {
  LEGACY_NEXI_PROJECT_STATE_DIR,
  NEXI_PROJECT_STATE_DIR,
  PROJECT_STATE_DIR,
} from "@t3tools/project-context/t3teamProjectStateDir";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { isMigrationExcluded } from "./t3team-projectMainRepositoryState.ts";

export interface LegacyStateMigrationResult {
  readonly status: "migrated" | "nothing-to-migrate" | "not-applicable" | "refused";
  /** State-dir-relative paths moved to `.agents/nexi`. */
  readonly moved: ReadonlyArray<string>;
  /** Paths left in `.nexi` because the new location already has the file. */
  readonly conflicts: ReadonlyArray<string>;
  /** Paths left in `.nexi` on purpose: machine-local entries and symlinks. */
  readonly kept: ReadonlyArray<string>;
  readonly reason?: string;
}

const result = (
  status: LegacyStateMigrationResult["status"],
  partial: Partial<LegacyStateMigrationResult> = {},
): LegacyStateMigrationResult => ({ status, moved: [], conflicts: [], kept: [], ...partial });

export const migrateLegacyProjectStateDir = Effect.fn("migrateLegacyProjectStateDir")(function* (
  workspaceRoot: string,
) {
  if (PROJECT_STATE_DIR !== NEXI_PROJECT_STATE_DIR) return result("not-applicable");
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const legacyRoot = path.join(workspaceRoot, LEGACY_NEXI_PROJECT_STATE_DIR);
  const targetRoot = path.join(workspaceRoot, NEXI_PROJECT_STATE_DIR);
  if (!(yield* fileSystem.exists(legacyRoot).pipe(Effect.orElseSucceed(() => false)))) {
    return result("nothing-to-migrate");
  }

  const realOf = (target: string) =>
    fileSystem.realPath(target).pipe(Effect.orElseSucceed(() => null));
  const realWorkspace = yield* realOf(workspaceRoot);
  const realLegacy = yield* realOf(legacyRoot);
  const within = (candidate: string | null, root: string | null) =>
    candidate !== null &&
    root !== null &&
    (candidate === root || candidate.startsWith(root + path.sep));
  if (!within(realLegacy, realWorkspace) || realLegacy === realWorkspace) {
    return result("refused", {
      reason: `${LEGACY_NEXI_PROJECT_STATE_DIR} resolves outside the workspace.`,
    });
  }
  // Every existing ancestor of the new directory must stay inside the workspace too: a symlinked
  // `.agents` would make the move write through it.
  for (const ancestor of [path.dirname(targetRoot), targetRoot]) {
    const real = yield* realOf(ancestor);
    if (real !== null && !within(real, realWorkspace)) {
      return result("refused", {
        reason: `${path.relative(workspaceRoot, ancestor)} resolves outside the workspace.`,
      });
    }
  }

  const moved: string[] = [];
  const conflicts: string[] = [];
  const kept: string[] = [];
  const visit: (segments: ReadonlyArray<string>) => Effect.Effect<void> = Effect.fn(
    "migrateLegacyProjectStateDir.visit",
  )(function* (segments: ReadonlyArray<string>) {
    const relative = segments.join("/");
    if (segments.length > 0 && isMigrationExcluded(segments)) {
      kept.push(relative);
      return;
    }
    const source = path.join(legacyRoot, ...segments);
    const real = yield* realOf(source);
    // Not the walk's own path: a symlink somewhere on it. Leave it where it is.
    if (real === null || real !== path.join(realLegacy!, ...segments)) {
      if (segments.length > 0) kept.push(relative);
      return;
    }
    const info = yield* fileSystem.stat(source).pipe(Effect.option);
    if (info._tag === "None") return;
    if (info.value.type === "Directory") {
      const children = yield* fileSystem
        .readDirectory(source)
        .pipe(Effect.orElseSucceed((): ReadonlyArray<string> => []));
      for (const child of children.toSorted()) yield* visit([...segments, child]);
      if (segments.length > 0) {
        const left = yield* fileSystem
          .readDirectory(source)
          .pipe(Effect.orElseSucceed((): ReadonlyArray<string> => ["?"]));
        if (left.length === 0) {
          yield* fileSystem.remove(source, { recursive: true, force: true }).pipe(Effect.ignore);
        }
      }
      return;
    }
    if (info.value.type !== "File") {
      kept.push(relative);
      return;
    }
    const target = path.join(targetRoot, ...segments);
    if (yield* fileSystem.exists(target).pipe(Effect.orElseSucceed(() => true))) {
      conflicts.push(relative);
      return;
    }
    const done = yield* fileSystem.makeDirectory(path.dirname(target), { recursive: true }).pipe(
      Effect.andThen(fileSystem.rename(source, target)),
      Effect.as(true),
      Effect.orElseSucceed(() => false),
    );
    if (done) moved.push(relative);
    else kept.push(relative);
  });

  yield* visit([]);
  // A legacy dir the move emptied is removed; one that still holds anything stays.
  const remaining = yield* fileSystem
    .readDirectory(legacyRoot)
    .pipe(Effect.orElseSucceed((): ReadonlyArray<string> => ["?"]));
  if (remaining.length === 0) {
    yield* fileSystem.remove(legacyRoot, { recursive: true, force: true }).pipe(Effect.ignore);
  }
  return result(moved.length > 0 ? "migrated" : "nothing-to-migrate", { moved, conflicts, kept });
});
