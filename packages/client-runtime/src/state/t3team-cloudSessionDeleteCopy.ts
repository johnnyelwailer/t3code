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
