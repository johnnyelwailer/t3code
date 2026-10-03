/**
 * Filesystem side of the project main repository (flag `NEXI_FF_MAIN_REPOSITORY`):
 * auto-detection candidates (linked clones that already carry a project state dir) and the
 * best-effort state-dir migration a main-repository switch performs.
 *
 * @module t3team-projectMainRepositoryState
 */
import type { ProjectMainRepositoryCandidate } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import {
  CHILD_WORKTREES_DIR_NAME,
  HIDDEN_T3TEAM_DIR,
  MANIFEST_FILE_NAME,
  REFERENCES_DIR_NAME,
  type LinkedRepositoryBootstrapResult,
} from "./t3team-project-repository-utils.ts";

/** Linked clones (ready, real git checkouts) whose working tree already holds a state dir. */
export const detectMainRepositoryCandidates = Effect.fn("detectMainRepositoryCandidates")(
  function* (linkedRepositories: ReadonlyArray<LinkedRepositoryBootstrapResult>) {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const exists = (target: string) =>
      fileSystem.exists(target).pipe(Effect.orElseSucceed(() => false));
    const candidates: ProjectMainRepositoryCandidate[] = [];
    for (const entry of linkedRepositories) {
      const checkoutPath = entry.localPath?.trim();
      if (entry.status === "failed" || !checkoutPath) continue;
      if (candidates.some((candidate) => candidate.checkoutPath === checkoutPath)) continue;
      const isClone = yield* exists(path.join(checkoutPath, ".git"));
      if (isClone && (yield* exists(path.join(checkoutPath, HIDDEN_T3TEAM_DIR)))) {
        candidates.push({ url: entry.url, checkoutPath });
      }
    }
    return candidates;
  },
);

/** Entries never copied by a migration: reference clones and child worktrees stay where they
 * are (the copied reference manifest keeps pointing at them by absolute path), and copying a
 * git worktree would orphan it. */
const isMigrationExcluded = (relativeSegments: ReadonlyArray<string>): boolean => {
  const [top, second] = relativeSegments;
  if (top === CHILD_WORKTREES_DIR_NAME) return true;
  return top === REFERENCES_DIR_NAME && second !== undefined && second !== MANIFEST_FILE_NAME;
};

/**
 * Copies the state dir of `fromRoot` into `toRoot`'s state dir. Best-effort and additive: an
 * existing target file always wins (a detected main repository's committed state is never
 * overwritten), unreadable entries are skipped, and the source is left untouched. Returns the
 * state-dir-relative paths that were copied.
 */
export const migrateProjectStateDir = Effect.fn("migrateProjectStateDir")(function* (input: {
  readonly fromRoot: string;
  readonly toRoot: string;
}) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const sourceRoot = path.join(input.fromRoot, HIDDEN_T3TEAM_DIR);
  const targetRoot = path.join(input.toRoot, HIDDEN_T3TEAM_DIR);
  const copied: string[] = [];
  if (path.resolve(sourceRoot) === path.resolve(targetRoot)) return copied;

  const visit = (segments: ReadonlyArray<string>): Effect.Effect<void> =>
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
      const target = path.join(targetRoot, ...segments);
      if (yield* fileSystem.exists(target).pipe(Effect.orElseSucceed(() => true))) return;
      const done = yield* fileSystem.makeDirectory(path.dirname(target), { recursive: true }).pipe(
        Effect.andThen(fileSystem.copyFile(source, target)),
        Effect.as(true),
        Effect.orElseSucceed(() => false),
      );
      if (done) copied.push(segments.join("/"));
    });

  yield* visit([]);
  return copied;
});
