/**
 * The project-rooted file access a recipe module is handed: `visible.ts` evaluation and every
 * workflow run's script `ctx.workspace` (`ToolWorkspace` in `@t3team/sdk`).
 *
 * One implementation so both surfaces share the SAME path guard: every relative path is resolved
 * through {@link resolveWithinRoot}, which proves containment on canonical (realpath) forms, so
 * `..`, an absolute path, or a symlink out of the root throws instead of touching the file. A
 * symlink INSIDE the root that points at a reserved entry is not caught by the name rule.
 */
import type { ToolWorkspace } from "@t3team/sdk";
import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import type * as Path from "effect/Path";

import { resolveWithinRoot } from "./t3team-projectRecipeDiscoveryShared.ts";

/** Top-level entries a workspace never reads or writes: git internals, the runs scratch dir (it
 * holds other runs' ephemeral `workflow.ts`, which a failed-run resume re-baselines) and the
 * project's own `.t3` state. `.github/`, `.devcontainer/` and `.nexi/` stay writable. */
export const WORKSPACE_RESERVED_ENTRIES: ReadonlyArray<string> = [".git", ".t3team-runs", ".t3"];

/** `resolveWithinRoot` plus the reserved-entry rule, judged on the RESOLVED path relative to the
 * root so `a/../.git/x` cannot slip past a prefix check on the raw string. */
function resolveWorkspacePath(
  pathService: Path.Path,
  rootPath: string,
  requestedPath: string,
): string {
  const resolved = resolveWithinRoot(pathService, rootPath, requestedPath);
  const [first] = pathService.relative(pathService.resolve(rootPath), resolved).split(/[\\/]/);
  if (first !== undefined && WORKSPACE_RESERVED_ENTRIES.includes(first)) {
    throw new Error(
      `Path '${requestedPath}' is inside '${first}', which a workflow workspace cannot access ` +
        `(reserved: ${WORKSPACE_RESERVED_ENTRIES.join(", ")}).`,
    );
  }
  return resolved;
}

export interface WorkspaceFileAccessInput {
  readonly fileSystem: FileSystem.FileSystem;
  readonly pathService: Path.Path;
  readonly rootPath: string;
  /** Runs a platform effect to a promise; defaults to `Effect.runPromise`. */
  readonly runPromise?: <A, E>(effect: Effect.Effect<A, E>) => Promise<A>;
}

export function createWorkspaceFileAccess(input: WorkspaceFileAccessInput): ToolWorkspace {
  const { fileSystem, pathService, rootPath } = input;
  const runPromise = input.runPromise ?? Effect.runPromise;
  return {
    readText: async (relativePath) =>
      runPromise(
        fileSystem.readFileString(resolveWorkspacePath(pathService, rootPath, relativePath)),
      ),
    writeText: async (relativePath, content) => {
      const targetPath = resolveWorkspacePath(pathService, rootPath, relativePath);
      await runPromise(
        fileSystem
          .makeDirectory(pathService.dirname(targetPath), { recursive: true })
          .pipe(Effect.andThen(fileSystem.writeFileString(targetPath, content))),
      );
    },
    exists: async (relativePath) =>
      runPromise(
        fileSystem
          .exists(resolveWorkspacePath(pathService, rootPath, relativePath))
          .pipe(Effect.orElseSucceed(() => false)),
      ),
  };
}

/** The `workspace` + `workspaceRoot` launch fields for a run rooted at `workspaceRoot`. Empty when
 * the root or the filesystem services are unknown, leaving the SDK's "started without a workspace
 * filesystem" error in place for a headless run rather than guessing a root. */
export function workspaceLaunchFields(input: {
  readonly fileSystem: FileSystem.FileSystem | undefined;
  readonly pathService: Path.Path | undefined;
  readonly workspaceRoot: string | null | undefined;
}): { readonly workspace?: ToolWorkspace; readonly workspaceRoot?: string } {
  const { fileSystem, pathService, workspaceRoot } = input;
  if (fileSystem === undefined || pathService === undefined) return {};
  if (workspaceRoot === undefined || workspaceRoot === null || workspaceRoot.length === 0) {
    return {};
  }
  return {
    workspaceRoot,
    workspace: createWorkspaceFileAccess({ fileSystem, pathService, rootPath: workspaceRoot }),
  };
}
