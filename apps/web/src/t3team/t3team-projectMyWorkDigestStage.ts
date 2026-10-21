import { getProjectTicketKanbanLane } from "~/t3team/t3team-projectTicketStatus";
import {
  includesStatusKeyword,
  normalizeProjectTicketStatus,
} from "~/t3team/t3team-projectTicketStatusKeywords";

/**
 * Where a ticket stands for the digest: the kanban lane, with its review lane split in two.
 * "Code Review" still waits on the developer's PR; "In Test" (QA, UAT, verification) is past it —
 * the developer has handed the work on.
 */
export type DigestTicketStage = "todo" | "inProgress" | "review" | "test" | "done";

export function getDigestTicketStage(status: string): DigestTicketStage {
  const lane = getProjectTicketKanbanLane(status);
  if (lane !== "review") return lane;
  return includesStatusKeyword(normalizeProjectTicketStatus(status), ["review"])
    ? "review"
    : "test";
}

/** Before review: the assignee is still building it. */
export function isDigestStageInDevelopment(stage: DigestTicketStage): boolean {
  return stage === "todo" || stage === "inProgress";
}

/** In review or test: built and handed on, though not done yet. */
export function isDigestStageHandedOn(stage: DigestTicketStage): boolean {
  return stage === "review" || stage === "test";
}
