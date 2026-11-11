import * as Schema from "effect/Schema";

import { TrimmedNonEmptyString } from "./baseSchemas.ts";

/**
 * Syncs one Open in target's multi-root workspace: two or more folders write a
 * `.code-workspace` under the state dir, fewer remove it. Never written into a repository.
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
