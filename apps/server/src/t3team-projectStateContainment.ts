// @effect-diagnostics nodeBuiltinImport:off -- the node-fs variant serves callers that run on plain node fs.
/**
 * The one check every writer of the project state dir runs first: the state dir must be a real
 * directory chain inside the workspace. A symlinked `.agents` or `.agents/nexi` (committed by a
 * repository, or made by anyone) would otherwise send the write outside the workspace, or into
 * `.git` or another in-workspace directory.
 */
import { PROJECT_STATE_DIR } from "@t3tools/project-context/t3teamProjectStateDir";
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

export class ProjectStateDirNotContained extends Schema.TaggedError<ProjectStateDirNotContained>()(
  "ProjectStateDirNotContained",
  { stateDir: Schema.String, reason: Schema.String },
) {
  override get message(): string {
    return `The project state dir ${this.stateDir} ${this.reason}.`;
  }
}

/** Whether every existing part of `PROJECT_STATE_DIR` is a real directory under `workspaceRoot`
 * (no symlink anywhere on the chain). Parts that do not exist yet are fine: they are created
 * under a verified parent. */
export const projectStateDirIsContained = Effect.fn("projectStateDirIsContained")(function* (
  workspaceRoot: string,
) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const realWorkspace = yield* fileSystem.realPath(workspaceRoot).pipe(Effect.option);
  if (realWorkspace._tag === "None") return false;
  const segments = PROJECT_STATE_DIR.split("/");
  for (let depth = 1; depth <= segments.length; depth += 1) {
    const relative = segments.slice(0, depth);
    const lexical = path.join(workspaceRoot, ...relative);
    if (!(yield* fileSystem.exists(lexical).pipe(Effect.orElseSucceed(() => false)))) return true;
    const real = yield* fileSystem.realPath(lexical).pipe(Effect.option);
    if (real._tag === "None" || real.value !== path.join(realWorkspace.value, ...relative)) {
      return false;
    }
  }
  return true;
});

export const assertProjectStateDirContained = Effect.fn("assertProjectStateDirContained")(
  function* (workspaceRoot: string) {
    if (!(yield* projectStateDirIsContained(workspaceRoot))) {
      return yield* new ProjectStateDirNotContained({
        stateDir: PROJECT_STATE_DIR,
        reason: "is a symlink or leaves the workspace; nothing was written",
      });
    }
  },
);

/** `projectStateDirIsContained` for callers that use node fs instead of the Effect services. */
export async function projectStateDirIsContainedNode(workspaceRoot: string): Promise<boolean> {
  let realWorkspace: string;
  try {
    realWorkspace = await NodeFSP.realpath(workspaceRoot);
  } catch {
    return false;
  }
  const segments = PROJECT_STATE_DIR.split("/");
  for (let depth = 1; depth <= segments.length; depth += 1) {
    const relative = segments.slice(0, depth);
    const real = await NodeFSP.realpath(NodePath.join(workspaceRoot, ...relative)).catch(
      (error: NodeJS.ErrnoException) => (error.code === "ENOENT" ? null : undefined),
    );
    if (real === null) return true;
    if (real === undefined || real !== NodePath.join(realWorkspace, ...relative)) return false;
  }
  return true;
}
