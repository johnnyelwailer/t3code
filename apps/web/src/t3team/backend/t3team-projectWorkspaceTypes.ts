/**
 * Results of the project-workspace bootstrap and context-file writes.
 *
 * Split from `t3team-types.ts` so that file stays the backend's connection/API surface. These
 * three describe one flow — materialising a workspace and seeding its context files — and are
 * re-exported from there, so existing importers are unaffected.
 */
import type { LinkedRepositorySyncResult } from "~/t3team/backend/t3team-types";

export type ProjectWorkspaceBootstrapResult = {
  readonly workspaceRoot: string;
  readonly workspaceRepositoryInitialized: boolean;
  readonly referencesRoot: string;
  readonly linkedRepositories: ReadonlyArray<LinkedRepositorySyncResult>;
};

export type ProjectWorkspaceContextFile = {
  readonly relativePath: string;
  readonly contents: string;
  readonly encoding?: "utf8" | "base64";
};

export type ProjectWorkspaceWriteContextFilesResult = {
  readonly workspaceRoot: string;
  readonly writtenFiles: ReadonlyArray<string>;
};
