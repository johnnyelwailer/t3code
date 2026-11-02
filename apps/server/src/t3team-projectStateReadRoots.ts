/**
 * Where a project's state is READ from. New state is written under `PROJECT_STATE_DIR`
 * (`.agents/nexi`); a project that still has the legacy `.nexi` keeps working because every
 * reader asks here instead of joining one directory. The first root wins on conflict.
 *
 * @module t3team-projectStateReadRoots
 */
import {
  PROJECT_STATE_DIR,
  projectStateReadDirNames,
} from "@t3tools/project-context/t3teamProjectStateDir";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

/** `<workspaceRoot>/<state dir>[/<stateRelative>]` for every state dir that is read, newest
 * first. `stateRelative` is relative to the state dir (`recipes`, `setup/profile.json`). */
export const projectStateReadPaths = (
  pathService: Path.Path,
  workspaceRoot: string,
  stateRelative?: string,
): ReadonlyArray<string> =>
  projectStateReadDirNames().map((name) =>
    stateRelative === undefined
      ? pathService.join(workspaceRoot, name)
      : pathService.join(workspaceRoot, name, stateRelative),
  );

/** The read candidates for a workspace-relative path that starts with `PROJECT_STATE_DIR`
 * (the `T3TEAM_PROJECT_*` constants); any other path has exactly one candidate. */
const projectStateReadCandidates = (
  pathService: Path.Path,
  workspaceRoot: string,
  workspaceRelative: string,
): ReadonlyArray<string> => {
  const prefix = `${PROJECT_STATE_DIR}/`;
  return workspaceRelative.startsWith(prefix)
    ? projectStateReadPaths(pathService, workspaceRoot, workspaceRelative.slice(prefix.length))
    : [pathService.join(workspaceRoot, workspaceRelative)];
};

/** The first existing candidate for `workspaceRelative`; when none exists, the write-dir one, so
 * a caller that creates the file lands in the new location. */
export const resolveProjectStateReadPath = Effect.fn("resolveProjectStateReadPath")(function* (
  workspaceRoot: string,
  workspaceRelative: string,
) {
  const fileSystem = yield* FileSystem.FileSystem;
  const pathService = yield* Path.Path;
  const candidates = projectStateReadCandidates(pathService, workspaceRoot, workspaceRelative);
  for (const candidate of candidates) {
    if (yield* fileSystem.exists(candidate).pipe(Effect.orElseSucceed(() => false))) {
      return candidate;
    }
  }
  return candidates[0]!;
});
