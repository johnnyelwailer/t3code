/**
 * Filesystem side of the project main repository (flag `NEXI_FF_MAIN_REPOSITORY`):
 * auto-detection candidates (linked clones that already carry a project state dir) and the
 * best-effort state-dir migration a main-repository switch performs.
 *
 * @module t3team-projectMainRepositoryState
 */
import {
  NEXI_PROJECT_STATE_DIR,
  PROJECT_STATE_DIR,
  T3TEAM_PROJECT_STATE_DIR,
} from "@t3tools/project-context/t3teamProjectStateDir";
import type { ProjectMainRepositoryCandidate } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { normalizeProjectContextStateFile } from "./t3team-projectContextStatePaths.ts";

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
      yield* ensureNexiProjectStateDir(checkoutPath);
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

/** Copies `fromRoot`'s state dir into `toRoot`. Existing target files win; the source is
 * untouched. `failed` is set when a copy or context-JSON rewrite did not land. */
const copyProjectStateDir = Effect.fn("copyProjectStateDir")(function* (input: {
  readonly fromRoot: string;
  readonly toRoot: string;
  readonly sourceDir: string;
  readonly targetDir: string;
}) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const sourceRoot = path.join(input.fromRoot, input.sourceDir);
  const targetRoot = path.join(input.toRoot, input.targetDir);
  const copied: string[] = [];
  let failed = false;
  if (path.resolve(sourceRoot) === path.resolve(targetRoot)) return { copied, failed };

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
      const relativePath = segments.join("/");
      let landed = done;
      if (
        done &&
        input.sourceDir !== input.targetDir &&
        segments[0] === "context" &&
        target.endsWith(".json")
      ) {
        landed = yield* fileSystem.readFileString(target).pipe(
          Effect.flatMap((contents) =>
            fileSystem.writeFileString(
              target,
              normalizeProjectContextStateFile({ relativePath, contents }, input.targetDir)
                .contents,
            ),
          ),
          Effect.as(true),
          Effect.orElseSucceed(() => false),
        );
      }
      if (landed) copied.push(relativePath);
      else failed = true;
    });

  yield* visit([]);
  return { copied, failed };
});

/** One-time additive normalization when a process selects .nexi. An existing target wins;
 * a failed attempt is removed so the next call retries instead of reading an empty dir. */
export const ensureNexiProjectStateDir = Effect.fn("ensureNexiProjectStateDir")(function* (
  workspaceRoot: string,
) {
  if (PROJECT_STATE_DIR !== NEXI_PROJECT_STATE_DIR) return [];
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const nexiDir = path.join(workspaceRoot, NEXI_PROJECT_STATE_DIR);
  if (yield* fileSystem.exists(nexiDir)) return [];
  if (!(yield* fileSystem.exists(path.join(workspaceRoot, T3TEAM_PROJECT_STATE_DIR)))) return [];
  const outcome = yield* copyProjectStateDir({
    fromRoot: workspaceRoot,
    toRoot: workspaceRoot,
    sourceDir: T3TEAM_PROJECT_STATE_DIR,
    targetDir: NEXI_PROJECT_STATE_DIR,
  });
  if (!outcome.failed && outcome.copied.length > 0) return outcome.copied;
  yield* fileSystem.remove(nexiDir, { recursive: true, force: true }).pipe(Effect.ignore);
  return [];
});

export const migrateProjectStateDir = Effect.fn("migrateProjectStateDir")(function* (input: {
  readonly fromRoot: string;
  readonly toRoot: string;
}) {
  yield* ensureNexiProjectStateDir(input.fromRoot);
  yield* ensureNexiProjectStateDir(input.toRoot);
  const { copied } = yield* copyProjectStateDir({
    ...input,
    sourceDir: PROJECT_STATE_DIR,
    targetDir: PROJECT_STATE_DIR,
  });
  return copied;
});
