export const doneStatusKeywords = [
  "done",
  "closed",
  "resolved",
  "cancelled",
  "canceled",
  "complete",
  "completed",
];

/** Past code review: someone checks the built thing (QA, acceptance, test). */
export const testStatusKeywords = ["qa", "uat", "verification", "verify", "testing", "test"];

/** The kanban's review lane: code review and test both (the digest tells them apart). */
export const reviewStatusKeywords = ["review", ...testStatusKeywords];

export const todoStatusKeywords = [
  "to do",
  "todo",
  "open",
  "backlog",
  "selected",
  "ready",
  "triage",
  "planned",
];

export const inProgressStatusKeywords = [
  "in progress",
  "progress",
  "in development",
  "development",
  "accepted",
  "doing",
  "blocked",
  "on hold",
  "wip",
  "implement",
  "coding",
  "working",
];

export const requirementsEngineerOnlyStatusKeywords = ["accepted"];

export function normalizeProjectTicketStatus(status: string): string {
  return status.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

export function formatProjectTicketKanbanStatusTitle(status: string): string {
  const trimmed = status.trim();
  return trimmed.length > 0 ? trimmed : "No status";
}

export function includesStatusKeyword(status: string, keywords: ReadonlyArray<string>): boolean {
  return keywords.some((keyword) => status.includes(keyword));
}
