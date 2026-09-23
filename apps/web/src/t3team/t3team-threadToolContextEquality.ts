import type { ProjectThread, T3TeamKickoffWorkflow } from "~/t3team/t3team-types";

function kickoffWorkflowParametersEqual(
  left: Readonly<Record<string, unknown>> | undefined,
  right: Readonly<Record<string, unknown>> | undefined,
): boolean {
  if (left === right) {
    return true;
  }

  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function kickoffWorkflowValueEqual(left: unknown, right: unknown): boolean {
  if (left === right) {
    return true;
  }

  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function kickoffWorkflowEqual(
  left: T3TeamKickoffWorkflow | undefined,
  right: T3TeamKickoffWorkflow | undefined,
): boolean {
  if (left === right) {
    return true;
  }

  if (!left || !right) {
    return false;
  }

  return (
    left.kind === right.kind &&
    left.recipeId === right.recipeId &&
    left.recipeVersion === right.recipeVersion &&
    kickoffWorkflowParametersEqual(left.parameters, right.parameters) &&
    left.title === right.title &&
    left.description === right.description &&
    left.source === right.source &&
    left.surface === right.surface &&
    kickoffWorkflowValueEqual(left.kickoff, right.kickoff) &&
    left.reason === right.reason &&
    left.recipePath === right.recipePath &&
    left.promptPath === right.promptPath &&
    left.workflowPath === right.workflowPath &&
    projectThreadArraysEqual(left.allowedToolGroups, right.allowedToolGroups) &&
    kickoffWorkflowValueEqual(left.launchContext, right.launchContext)
  );
}

function projectThreadArraysEqual(
  left: ReadonlyArray<string> | undefined,
  right: ReadonlyArray<string> | undefined,
): boolean {
  if (left === right) {
    return true;
  }

  if (!left || !right || left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

export function projectThreadsEqual(left: ProjectThread, right: ProjectThread): boolean {
  return (
    left.id === right.id &&
    left.projectId === right.projectId &&
    left.parentThreadId === right.parentThreadId &&
    left.ticketId === right.ticketId &&
    left.ticketDisplayId === right.ticketDisplayId &&
    left.dashboardMode === right.dashboardMode &&
    left.displayMode === right.displayMode &&
    left.title === right.title &&
    left.messageCount === right.messageCount &&
    left.lastMessageAt === right.lastMessageAt &&
    left.createdAt === right.createdAt &&
    left.kickoffMessage === right.kickoffMessage &&
    left.kickoffPending === right.kickoffPending &&
    left.kickoffModelSelection?.instanceId === right.kickoffModelSelection?.instanceId &&
    left.kickoffModelSelection?.model === right.kickoffModelSelection?.model &&
    left.kickoffRuntimeMode === right.kickoffRuntimeMode &&
    left.kickoffInteractionMode === right.kickoffInteractionMode &&
    kickoffWorkflowEqual(left.kickoffWorkflow, right.kickoffWorkflow) &&
    left.status === right.status &&
    // GHE #304 follow-up: the real settle state must diff through the equality
    // gate or a thread settling in the background would not move out of the
    // visible sub-run roster into the "Settled (N)" fold.
    left.settled === right.settled &&
    left.sleepingUntil === right.sleepingUntil &&
    // GHE #40/#208 live pills: the enrichment label and the deterministic
    // state word must diff through the equality gate or state transitions
    // would not re-render the row.
    left.activityLabel === right.activityLabel &&
    left.activityState === right.activityState &&
    // Pending-question indicator: a question docking or clearing must diff
    // through the equality gate or the sub-run row would not update.
    left.pendingUserInput === right.pendingUserInput &&
    // Waiting-on-children indicator: a child starting or settling must diff
    // through the equality gate or the parent row would not update.
    left.waitingOnChildren === right.waitingOnChildren &&
    projectThreadArraysEqual(left.selectedToolIds, right.selectedToolIds)
  );
}
