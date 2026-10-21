/**
 * Results of the project-workspace bootstrap and context-file writes.
 *
 * Split from `t3team-types.ts` so that file stays the backend's connection/API surface. These
 * three describe one flow — materialising a workspace and seeding its context files — and are
 * re-exported from there, so existing importers are unaffected.
 */
import type {
  ProjectMainRepository,
  ProjectMainRepositoryCandidate,
  ProjectMainRepositorySelection,
} from "@t3tools/contracts";

import type { LinkedRepositorySyncResult } from "~/t3team/backend/t3team-types";

export type ProjectWorkspaceBootstrapMainRepository = {
  readonly url?: string;
  readonly localPath: string;
  readonly status: ProjectMainRepositorySelection;
};

export type ProjectWorkspaceBootstrapResult = {
  readonly workspaceRoot: string;
  readonly workspaceRepositoryInitialized: boolean;
  readonly referencesRoot: string;
  readonly linkedRepositories: ReadonlyArray<LinkedRepositorySyncResult>;
  /** Present when the workspace root is itself a git repository adopted as the main repository
   * (monorepo-as-metarepo, GHE #42): sub-work happens in worktrees of this repository. */
  readonly mainRepository?: ProjectWorkspaceBootstrapMainRepository;
  /** Linked clones that already carry a project state dir (main-repository auto-detection). */
  readonly mainRepositoryCandidates?: ReadonlyArray<ProjectMainRepositoryCandidate>;
};

/** Progress of the background state migration a main-repository switch starts (the state is
 * linked into the new checkout at once; the real files follow). Also on the linked-repository
 * status response as `stateMigration`. */
export type ProjectStateMigrationSummary = {
  readonly status: "running" | "done";
  readonly pending: number;
  readonly lost: number;
  readonly failed: number;
  readonly copiedFiles: number;
};

/** Result of `POST /api/t3team/project/main-repository`. Answers at once. */
export type ProjectMainRepositorySwitchResult = {
  readonly changed: boolean;
  readonly workspaceRoot: string;
  readonly mainRepository?: ProjectMainRepository;
  /** Always empty on current servers: state moves in the background. */
  readonly migratedPaths: ReadonlyArray<string>;
  readonly stateMigration?: ProjectStateMigrationSummary;
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
