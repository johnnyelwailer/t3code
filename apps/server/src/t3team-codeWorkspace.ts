/**
 * The multi-root editor workspace behind Open in (`@t3tools/shared/t3team-codeWorkspace`).
 * `syncCodeWorkspace` keeps one `.code-workspace` file per Open in target in the server's state
 * directory, written when the client reports two or more active roots and removed otherwise.
 * `codeWorkspaceLaunchInput` swaps a VS Code family open of that target for the workspace file.
 * Never writes into a repository; a failure leaves Open in on the plain folder.
 *
 * @module t3team-codeWorkspace
 */
import type {
  LaunchEditorInput,
  T3TeamSyncCodeWorkspaceInput,
  T3TeamSyncCodeWorkspaceResult,
} from "@t3tools/contracts";
import { isNetworkPath } from "@t3tools/shared/path";
import {
  CODE_WORKSPACE_EDITOR_IDS,
  codeWorkspaceFileName,
  renderCodeWorkspace,
} from "@t3tools/shared/t3team-codeWorkspace";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

const WORKSPACES_DIRECTORY = "t3team-code-workspaces";

const workspaceFile = Effect.fnUntraced(function* (stateDir: string, cwd: string) {
  const path = yield* Path.Path;
  const directory = path.join(stateDir, WORKSPACES_DIRECTORY);
  return { directory, file: path.join(directory, codeWorkspaceFileName(cwd)) };
});

export const syncCodeWorkspace = Effect.fn("t3team.codeWorkspace.sync")(
  function* (stateDir: string, input: T3TeamSyncCodeWorkspaceInput) {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const { directory, file } = yield* workspaceFile(stateDir, input.cwd);
    // Only local absolute folders: a network path would make the editor sign in to its host.
    const folders = input.folders.filter(
      (folder) => path.isAbsolute(folder.path) && !isNetworkPath(folder.path),
    );
    if (folders.length < 2) {
      yield* fileSystem.remove(file).pipe(Effect.ignore);
      return { workspacePath: null } satisfies T3TeamSyncCodeWorkspaceResult;
    }
    const contents = renderCodeWorkspace(folders);
    const current = yield* fileSystem.readFileString(file).pipe(Effect.orElseSucceed(() => null));
    if (current !== contents) {
      yield* fileSystem.makeDirectory(directory, { recursive: true });
      yield* fileSystem.writeFileString(file, contents);
    }
    return { workspacePath: file } satisfies T3TeamSyncCodeWorkspaceResult;
  },
  Effect.orElseSucceed((): T3TeamSyncCodeWorkspaceResult => ({ workspacePath: null })),
);

export const codeWorkspaceLaunchInput = Effect.fn("t3team.codeWorkspace.launchInput")(function* (
  stateDir: string,
  input: LaunchEditorInput,
) {
  if (!CODE_WORKSPACE_EDITOR_IDS.has(input.editor) || input.reveal === true) return input;
  const fileSystem = yield* FileSystem.FileSystem;
  const { file } = yield* workspaceFile(stateDir, input.cwd);
  const exists = yield* fileSystem.exists(file).pipe(Effect.orElseSucceed(() => false));
  return exists ? { ...input, cwd: file } : input;
});
