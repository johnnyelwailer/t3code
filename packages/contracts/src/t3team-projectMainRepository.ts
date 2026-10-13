/**
 * The project's MAIN repository: the one repository whose checkout is the project's shared
 * workspace (`OrchestrationProject.workspaceRoot`) and holds the project state dir (context,
 * recipes, reference manifest, child worktrees).
 *
 * Generalizes the earlier "meta repository" (a workspace root that was itself a git
 * repository): an adopted workspace repository, a user-picked linked repository and an
 * auto-detected one are the same concept, distinguished only by `selection`.
 *
 * Every field beyond `checkoutPath` is optional so web, desktop, mobile and external hosts
 * decode records from any server version.
 */
import * as Schema from "effect/Schema";

import { TrimmedNonEmptyString } from "./baseSchemas.ts";

/** How the main repository was chosen. `adopted`: the workspace root was already a git
 * repository. `detected`: exactly one linked clone already carried a project state dir.
 * `user`: picked explicitly — an explicit choice always wins over detection. */
export const ProjectMainRepositorySelection = Schema.Literals(["adopted", "detected", "user"]);
export type ProjectMainRepositorySelection = typeof ProjectMainRepositorySelection.Type;

export const ProjectMainRepository = Schema.Struct({
  /** Remote URL identifying the repository; absent for a local repository without a remote. */
  url: Schema.optional(TrimmedNonEmptyString),
  /** The local checkout that serves as the project's shared workspace. */
  checkoutPath: TrimmedNonEmptyString,
  /** The project's original workspace, where the linked-repository clones live. */
  projectRoot: Schema.optional(TrimmedNonEmptyString),
  selection: Schema.optional(ProjectMainRepositorySelection),
});
export type ProjectMainRepository = typeof ProjectMainRepository.Type;

/** A linked clone that already carries a project state dir — an auto-detection candidate. */
export const ProjectMainRepositoryCandidate = Schema.Struct({
  url: TrimmedNonEmptyString,
  checkoutPath: TrimmedNonEmptyString,
});
export type ProjectMainRepositoryCandidate = typeof ProjectMainRepositoryCandidate.Type;

/** `pending`: recorded, its thread is being launched. `running`: the migration recipe runs on
 * that thread. `completed` / `failed`: written by the recipe's outcome script, or by the server
 * when the launch or the run itself ended without one. */
export const ProjectStateMigrationStatus = Schema.Literals([
  "pending",
  "running",
  "completed",
  "failed",
]);
export type ProjectStateMigrationStatus = typeof ProjectStateMigrationStatus.Type;

/**
 * A state-dir migration a main-repository switch handed to an agent thread, persisted in the
 * receiving checkout's machine-local references dir (never committed, never migrated itself).
 */
export const ProjectStateMigration = Schema.Struct({
  migrationId: TrimmedNonEmptyString,
  status: ProjectStateMigrationStatus,
  /** The workspace whose state dir is copied, and the checkout receiving it. */
  fromRoot: TrimmedNonEmptyString,
  toRoot: TrimmedNonEmptyString,
  stateDir: TrimmedNonEmptyString,
  /** State-dir-relative entries never copied; everything else is copied, target wins. */
  excludes: Schema.Array(Schema.String),
  /** Lower bound from the bounded scan that decided the handoff. */
  missingFilesAtLeast: Schema.optional(Schema.Number),
  threadId: Schema.optional(TrimmedNonEmptyString),
  runId: Schema.optional(TrimmedNonEmptyString),
  startedAt: Schema.String,
  updatedAt: Schema.String,
  summary: Schema.optional(Schema.String),
  error: Schema.optional(Schema.String),
  conflicts: Schema.optional(Schema.Number),
  pullRequestUrl: Schema.optional(Schema.String),
});
export type ProjectStateMigration = typeof ProjectStateMigration.Type;
