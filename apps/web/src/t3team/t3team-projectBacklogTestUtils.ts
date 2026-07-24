import type { ProjectTicket } from "./t3team-types";

export function createProjectBacklogTestTicket(
  overrides: Omit<Partial<ProjectTicket>, "ref"> & {
    ref?: Partial<ProjectTicket["ref"]>;
  } & Pick<ProjectTicket, "id">,
): ProjectTicket {
  return {
    id: overrides.id,
    projectId: overrides.projectId ?? "project-1",
    ref: {
      provider: "atlassian",
      kind: "issue",
      id: overrides.id,
      displayId: overrides.ref?.displayId ?? overrides.id.toUpperCase(),
      title: overrides.ref?.title ?? overrides.id,
      url: overrides.ref?.url ?? "https://example.test",
      projectId: overrides.ref?.projectId ?? "external-1",
      ...(overrides.ref?.type ? { type: overrides.ref.type } : {}),
    },
    ...(overrides.issueType ? { issueType: overrides.issueType } : {}),
    ...(overrides.issueTypeIsSubtask ? { issueTypeIsSubtask: overrides.issueTypeIsSubtask } : {}),
    status: overrides.status ?? "Backlog",
    ...(overrides.priority ? { priority: overrides.priority } : {}),
    ...(overrides.assignee ? { assignee: overrides.assignee } : {}),
    ...(overrides.assigneeAccountId ? { assigneeAccountId: overrides.assigneeAccountId } : {}),
    ...(overrides.description ? { description: overrides.description } : {}),
    ...(overrides.estimateValue !== undefined ? { estimateValue: overrides.estimateValue } : {}),
    ...(overrides.timeOriginalEstimateSeconds !== undefined
      ? { timeOriginalEstimateSeconds: overrides.timeOriginalEstimateSeconds }
      : {}),
    ...(overrides.timeRemainingEstimateSeconds !== undefined
      ? { timeRemainingEstimateSeconds: overrides.timeRemainingEstimateSeconds }
      : {}),
    ...(overrides.aggregateTimeOriginalEstimateSeconds !== undefined
      ? { aggregateTimeOriginalEstimateSeconds: overrides.aggregateTimeOriginalEstimateSeconds }
      : {}),
    ...(overrides.aggregateTimeRemainingEstimateSeconds !== undefined
      ? { aggregateTimeRemainingEstimateSeconds: overrides.aggregateTimeRemainingEstimateSeconds }
      : {}),
    ...(overrides.subtaskCount !== undefined ? { subtaskCount: overrides.subtaskCount } : {}),
    ...(overrides.sprintId ? { sprintId: overrides.sprintId } : {}),
    ...(overrides.sprintName ? { sprintName: overrides.sprintName } : {}),
    ...(overrides.sprintState ? { sprintState: overrides.sprintState } : {}),
    ...(overrides.sprintStartDate ? { sprintStartDate: overrides.sprintStartDate } : {}),
    ...(overrides.sprintEndDate ? { sprintEndDate: overrides.sprintEndDate } : {}),
    ...(overrides.sprintCompleteDate ? { sprintCompleteDate: overrides.sprintCompleteDate } : {}),
    updatedAt: overrides.updatedAt ?? "2026-05-21T00:00:00.000Z",
    ...(overrides.parentId ? { parentId: overrides.parentId } : {}),
    ...(overrides.labels ? { labels: overrides.labels } : {}),
  };
}
