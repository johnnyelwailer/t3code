/**
 * Where a project's state is READ from. New state is written under `PROJECT_STATE_DIR`
 * (`.agents/nexi`); a project that still has the legacy `.nexi` keeps working because every
 * reader asks here instead of joining one directory. The first root wins on conflict.
 *
 * @module t3team-projectStateReadRoots
 */
import {
  NEXI_PROJECT_STATE_DIR,
  PROJECT_STATE_DIR,
} from "@t3tools/project-context/t3teamProjectStateDir";
import {
  LEGACY_NEXI_PROJECT_STATE_DIR,
  projectStateReadDirNames,
} from "@t3tools/project-context/t3team-projectStateLayout";
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
export const resolveStateReadPathWith = Effect.fn("resolveStateReadPathWith")(function* (
  fileSystem: FileSystem.FileSystem,
  pathService: Path.Path,
  workspaceRoot: string,
  workspaceRelative: string,
) {
  const candidates = projectStateReadCandidates(pathService, workspaceRoot, workspaceRelative);
  for (const candidate of candidates) {
    if (yield* fileSystem.exists(candidate).pipe(Effect.orElseSucceed(() => false))) {
      return candidate;
    }
  }
  return candidates[0]!;
});

export const resolveProjectStateReadPath = Effect.fn("resolveProjectStateReadPath")(function* (
  workspaceRoot: string,
  workspaceRelative: string,
) {
  const fileSystem = yield* FileSystem.FileSystem;
  const pathService = yield* Path.Path;
  return yield* resolveStateReadPathWith(fileSystem, pathService, workspaceRoot, workspaceRelative);
});

const NEW_SEGMENT = /^(.*)([\\/])\.agents[\\/]nexi(?=[\\/])/s;
const LEGACY_SEGMENT = /[\\/]\.nexi[\\/]/;

/** The legacy sibling of an absolute path inside the new state dir (`/ws/.agents/nexi/x` becomes
 * `/ws/.nexi/x`); undefined for any other path, and when `.agents/nexi` is not the write dir. */
export const legacyStatePathOf = (absolutePath: string): string | undefined => {
  if (PROJECT_STATE_DIR !== NEXI_PROJECT_STATE_DIR) return undefined;
  const match = NEW_SEGMENT.exec(absolutePath);
  if (match === null) return undefined;
  return `${match[1]}${match[2]}${LEGACY_NEXI_PROJECT_STATE_DIR}${absolutePath.slice(match[0].length)}`;
};

/** Whether the path is a legacy `.nexi` file the product only reads, never rewrites in place. */
export const isLegacyStatePath = (absolutePath: string): boolean =>
  PROJECT_STATE_DIR === NEXI_PROJECT_STATE_DIR &&
  LEGACY_SEGMENT.test(absolutePath) &&
  legacyStatePathOf(absolutePath) === undefined;
