/**
 * What the "Project ready" step of a queued cloud send is waiting on, and how loudly to say so.
 *
 * The step is the client's, not the machine's: it ends when this app lists the project the draft
 * belongs to on the session's environment (`resolveCloudQueuedSendFacts`). The machine can be
 * finished long before that, so a spinner alone hides what is missing. `classifyCloudProjectWait`
 * names the unmet condition from the facts the app already has; the wording and its escalation by
 * elapsed time are in `t3team-cloudProjectWaitPresentation`. Pure.
 */
import type { EnvironmentId } from "@t3tools/contracts";
import { normalizeProjectPathForComparison } from "@t3tools/shared/path";

import { type ComposerProject, projectMismatchOf } from "./t3team-cloudSessionOwnProject";

export type CloudProjectWaitReason =
  | "machine-settings-pending"
  | "scratch-folder-unknown"
  | "scratch-opening"
  | "project-list-pending"
  | "project-not-listed"
  | "different-repository"
  | "different-folder"
  | "no-matching-project";

export interface CloudProjectWait {
  readonly reason: CloudProjectWaitReason;
  readonly environmentId: string;
  /**
   * The folder the machine's server registers as its project, when it registers one and the send
   * binds by it (its Run-on target follows this project); null otherwise, so no reason names it.
   */
  readonly expectedCwd: string | null;
  /** How many projects this app lists on that environment. */
  readonly projectsSeen: number;
  /** The draft's project, as the composer names it. */
  readonly projectTitle: string | null;
  /** The machine's project at the expected folder, when one is listed there. */
  readonly machineProjectTitle: string | null;
}

export interface CloudProjectWaitInput {
  readonly environmentId: EnvironmentId;
  readonly scratch: boolean;
  /** The environment's server settings have reached this app. */
  readonly machineSettingsLoaded: boolean;
  readonly expectedCwd: string | null;
  readonly scratchRoot: string | null;
  readonly composer: ComposerProject | null;
  readonly projects: ReadonlyArray<Omit<ComposerProject, "id">>;
}

/** Why the draft's project is not on the session's machine yet. */
export function classifyCloudProjectWait(input: CloudProjectWaitInput): CloudProjectWait {
  const wait = (
    reason: CloudProjectWaitReason,
    machineProjectTitle: string | null = null,
  ): CloudProjectWait => ({
    reason,
    environmentId: String(input.environmentId),
    expectedCwd: input.expectedCwd,
    projectsSeen: input.projects.length,
    projectTitle: input.composer?.title ?? null,
    machineProjectTitle,
  });
  if (!input.machineSettingsLoaded) return wait("machine-settings-pending");
  if (input.scratch) {
    return wait(input.scratchRoot === null ? "scratch-folder-unknown" : "scratch-opening");
  }
  if (input.projects.length === 0) return wait("project-list-pending");
  if (input.expectedCwd === null) return wait("no-matching-project");
  const root = normalizeProjectPathForComparison(input.expectedCwd);
  const own = input.projects.find(
    (project) => normalizeProjectPathForComparison(project.workspaceRoot) === root,
  );
  if (own === undefined) return wait("project-not-listed");
  const mismatch = input.composer === null ? null : projectMismatchOf(input.composer, own);
  if (mismatch === null) return wait("no-matching-project", own.title);
  return wait(mismatch === "repository" ? "different-repository" : "different-folder", own.title);
}
