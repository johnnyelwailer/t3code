import type { CloudSessionDeleteInfo } from "@t3tools/contracts";

/**
 * The delete confirmation and result text, shared by web and the Android rows so both promise
 * the same: the wip/ branch holds what the machine preserved when it stopped, nothing more.
 */
export function cloudSessionDeleteConfirmation(
  info: CloudSessionDeleteInfo | null,
): ReadonlyArray<string> {
  const others = info?.otherSessions ?? 0;
  return [
    "The machine stops now. Its saved state is removed: threads on it stop, and the next session starts clean.",
    ...(info?.repository ? [`Machine: ${info.repository}`] : []),
    ...(info !== null && info.projects.length > 0
      ? [`Projects that use it: ${info.projects.join(", ")}`]
      : []),
    snapshotOnlyLine(info?.snapshotOnlyProjects),
    ...(others > 0
      ? [
          `This also removes the saved state of ${others} earlier session${others === 1 ? "" : "s"} of this machine.`,
        ]
      : []),
    "Work the machine preserved when it stopped goes to a wip/ branch on the project's remote first. If the machine did not save its last state, or that save fails, nothing is deleted.",
  ];
}

export function cloudSessionDeletedTitle(wipBranch: string | null): string {
  return wipBranch === null
    ? "Machine deleted."
    : `Machine deleted. Its preserved work is on ${wipBranch}.`;
}

/** Named when the session listed them; a plain warning when it never said (older sessions). */
function snapshotOnlyLine(projects: ReadonlyArray<string> | null | undefined): string {
  if (projects === null || projects === undefined) {
    return "Projects made in this session without a git remote exist only in its snapshot, and the delete removes them.";
  }
  return projects.length === 0
    ? "Every project of this session has a git remote."
    : `These projects have no git remote; their only copy is this session's snapshot, and the delete removes it: ${projects.join(", ")}.`;
}

/** The second confirmation, naming what is lost for good; null when there is nothing to name. */
export function cloudSessionSnapshotOnlyConfirmation(
  info: CloudSessionDeleteInfo | null,
): string | null {
  const projects = info?.snapshotOnlyProjects ?? [];
  if (projects.length === 0) return null;
  const named =
    projects.length === 1
      ? projects[0]
      : `${projects.slice(0, -1).join(", ")} and ${projects.at(-1)}`;
  return `Delete ${named} for good? They have no git remote and exist nowhere else.`;
}
