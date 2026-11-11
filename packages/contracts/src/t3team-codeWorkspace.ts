import * as Schema from "effect/Schema";

import { TrimmedNonEmptyString } from "./baseSchemas.ts";

/**
 * Keeps the multi-root editor workspace of one Open in target current. The client sends the
 * thread's active roots whenever they change; with two or more folders the server writes
 * `<state dir>/t3team-code-workspaces/<name>.code-workspace`, with fewer it removes the file.
 * Opening `cwd` in a VS Code family editor then opens that workspace instead of the folder.
 * Nothing is ever written into a repository.
 */
export const T3TeamCodeWorkspaceFolder = Schema.Struct({
  path: TrimmedNonEmptyString.check(Schema.isMaxLength(1024)),
  name: TrimmedNonEmptyString.check(Schema.isMaxLength(120)),
});
export type T3TeamCodeWorkspaceFolder = typeof T3TeamCodeWorkspaceFolder.Type;

export const T3TeamSyncCodeWorkspaceInput = Schema.Struct({
  /** The Open in target the workspace replaces: the thread's cwd or followed root. */
  cwd: TrimmedNonEmptyString.check(Schema.isMaxLength(1024)),
  /** The thread's active roots, at most the hard cap of 12. */
  folders: Schema.Array(T3TeamCodeWorkspaceFolder).check(Schema.isMaxLength(12)),
});
export type T3TeamSyncCodeWorkspaceInput = typeof T3TeamSyncCodeWorkspaceInput.Type;

export const T3TeamSyncCodeWorkspaceResult = Schema.Struct({
  /** The written workspace file, or null when the target opens as a plain folder. */
  workspacePath: Schema.NullOr(Schema.String),
});
export type T3TeamSyncCodeWorkspaceResult = typeof T3TeamSyncCodeWorkspaceResult.Type;
