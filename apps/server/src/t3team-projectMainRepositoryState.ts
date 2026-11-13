/**
 * Filesystem side of the project main repository (flag `NEXI_FF_MAIN_REPOSITORY`):
 * auto-detection candidates (linked clones that already carry a project state dir, looking at
 * `.agents/nexi` first, then `.nexi`, then `.t3team`) and the best-effort state-dir migration
 * a main-repository switch performs. A one-time copy moves older `.nexi` and `.t3team` state
 * into `.agents/nexi` without overwriting or deleting user data.
 *
 * @module t3team-projectMainRepositoryState
 */
import {
  decideMachineFileMigration,
  LEGACY_NEXI_PROJECT_STATE_DIR,
  NEXI_PROJECT_STATE_DIR,
  PROJECT_STATE_DIR,
  projectMachineFilePath,
  projectMachineFilePathLookupOrder,
  projectStateDirLookupOrder,
  T3TEAM_PROJECT_STATE_DIR,
} from "@t3tools/project-context/t3teamProjectStateDir";
import type { ProjectMainRepositoryCandidate } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { T3TEAM_CONTEXT_BLOB_DIR_SEGMENTS } from "./t3team-context-blob-store-utils.ts";
import { normalizeProjectContextStateFile } from "./t3team-projectContextStatePaths.ts";

import {
  CHILD_WORKTREES_DIR_NAME,
  MANIFEST_FILE_NAME,
  REFERENCES_DIR_NAME,
  hasProjectStateEntries,
  isLinkedRepositoryReady,
  type LinkedRepositoryBootstrapResult,
} from "./t3team-project-repository-utils.ts";

/** Linked clones (ready, real git checkouts) whose working tree already holds project state. A
 * state dir with only machine-local entries (`references/`, `child-session-worktrees/`) does not
 * count: a shared repository that committed its reference manifest (or a clone a past switch
 * left a manifest in) is not a project's home, and as the only candidate it would be
 * auto-detected as the main repository of every project that links it. */
export const detectMainRepositoryCandidates = Effect.fn("detectMainRepositoryCandidates")(
  function* (linkedRepositories: ReadonlyArray<LinkedRepositoryBootstrapResult>) {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const exists = (target: string) =>
      fileSystem.exists(target).pipe(Effect.orElseSucceed(() => false));
    const candidates: ProjectMainRepositoryCandidate[] = [];
    for (const entry of linkedRepositories) {
      const checkoutPath = entry.localPath?.trim();
      if (!isLinkedRepositoryReady(entry) || !checkoutPath) continue;
      if (candidates.some((candidate) => candidate.checkoutPath === checkoutPath)) continue;
      yield* ensureNexiProjectStateDir(checkoutPath);
      const isClone = yield* exists(path.join(checkoutPath, ".git"));
      if (!isClone) continue;
      let hasState = false;
      for (const dir of projectStateDirLookupOrder()) {
        const stateEntries = yield* fileSystem
          .readDirectory(path.join(checkoutPath, dir))
          .pipe(Effect.orElseSucceed((): ReadonlyArray<string> => []));
        if (hasProjectStateEntries(stateEntries)) {
          hasState = true;
          break;
        }
      }
      if (hasState) {
        candidates.push({ url: entry.url, checkoutPath });
      }
    }
    return candidates;
  },
);

/** Entries never copied by a migration: reference clones and child worktrees stay where they
 * are (the copied reference manifest keeps pointing at them by absolute path), and copying a
 * git worktree would orphan it. The context blob cache is skipped too: it is re-creatable,
 * purgeable cache that can hold tens of thousands of files and gigabytes (a real project had
 * 70k blobs / 5.5 GB), and copying it inline made every switch outlast the request. */
const isMigrationExcluded = (relativeSegments: ReadonlyArray<string>): boolean => {
  const [top, second] = relativeSegments;
  if (top === CHILD_WORKTREES_DIR_NAME) return true;
  if (top === T3TEAM_CONTEXT_BLOB_DIR_SEGMENTS[0] && second === T3TEAM_CONTEXT_BLOB_DIR_SEGMENTS[1])
    return true;
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
      if (yield* fileSystem.exists(target).pipe(Effect.orElseSucceed(() => true))) {
        if (input.sourceDir !== input.targetDir) {
          const sourceContents = yield* fileSystem
            .readFileString(source)
            .pipe(Effect.orElseSucceed(() => ""));
          const targetContents = yield* fileSystem
            .readFileString(target)
            .pipe(Effect.orElseSucceed(() => ""));
          if (sourceContents !== targetContents) {
            yield* Effect.logWarning(
              "Project state migration kept the existing file and left the older copy in place.",
              {
                path: segments.join("/"),
                sourceDir: input.sourceDir,
                targetDir: input.targetDir,
              },
            );
          }
        }
        return;
      }
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

/** Copy `machine.json` into `.agents/nexi` when the target file is missing. Runs even when
 * the target directory already exists (the full-dir migration returns early in that case).
 * Never overwrites or deletes; the target wins. Sources stay as a fallback. */
export const ensureNexiMachineFile = Effect.fn("ensureNexiMachineFile")(function* (
  workspaceRoot: string,
) {
  if (PROJECT_STATE_DIR !== NEXI_PROJECT_STATE_DIR) return false;
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const targetRelative = projectMachineFilePath(NEXI_PROJECT_STATE_DIR);
  const target = path.join(workspaceRoot, targetRelative);
  const targetExists = yield* fileSystem.exists(target);
  const sources: Array<{ path: string; exists: boolean }> = [];
  for (const relative of projectMachineFilePathLookupOrder(NEXI_PROJECT_STATE_DIR)) {
    if (relative === targetRelative) continue;
    const source = path.join(workspaceRoot, relative);
    const present = yield* fileSystem.exists(source);
    const info = present
      ? yield* fileSystem.stat(source).pipe(Effect.option)
      : ({ _tag: "None" } as const);
    sources.push({
      path: relative,
      exists: present && info._tag === "Some" && info.value.type === "File",
    });
  }
  const decision = decideMachineFileMigration({
    targetPath: targetRelative,
    targetExists,
    sources,
  });
  if (decision.action === "noop") return false;
  const source = path.join(workspaceRoot, decision.source);
  return yield* fileSystem.makeDirectory(path.dirname(target), { recursive: true }).pipe(
    Effect.andThen(fileSystem.copyFile(source, target)),
    Effect.as(true),
    Effect.orElseSucceed(() => false),
  );
});

/** One-time additive normalization when a process selects `.agents/nexi`. Sources are the
 * older `.nexi` (preferred, as the previous default) then `.t3team`. An existing target
 * wins and is not touched again (idempotent). Conflicting files keep the target copy, log,
 * and leave the older file in place as a fallback. A failed attempt that created an empty
 * or partial target is removed so the next call retries; sources are never deleted. */
export const ensureNexiProjectStateDir = Effect.fn("ensureNexiProjectStateDir")(function* (
  workspaceRoot: string,
) {
  if (PROJECT_STATE_DIR !== NEXI_PROJECT_STATE_DIR) return [];
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const targetDir = NEXI_PROJECT_STATE_DIR;
  const targetPath = path.join(workspaceRoot, targetDir);
  if (yield* fileSystem.exists(targetPath)) {
    yield* ensureNexiMachineFile(workspaceRoot);
    return [];
  }
  const sources = [LEGACY_NEXI_PROJECT_STATE_DIR, T3TEAM_PROJECT_STATE_DIR].filter(
    (dir) => dir !== targetDir,
  );
  const existingSources: string[] = [];
  for (const sourceDir of sources) {
    if (yield* fileSystem.exists(path.join(workspaceRoot, sourceDir))) {
      existingSources.push(sourceDir);
    }
  }
  if (existingSources.length === 0) return [];
  const copied: string[] = [];
  let failed = false;
  for (const sourceDir of existingSources) {
    const outcome = yield* copyProjectStateDir({
      fromRoot: workspaceRoot,
      toRoot: workspaceRoot,
      sourceDir,
      targetDir,
    });
    for (const file of outcome.copied) {
      if (!copied.includes(file)) copied.push(file);
    }
    if (outcome.failed) failed = true;
  }
  if (!failed && copied.length > 0) {
    yield* ensureNexiMachineFile(workspaceRoot);
    return copied;
  }
  yield* fileSystem.remove(targetPath, { recursive: true, force: true }).pipe(Effect.ignore);
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
