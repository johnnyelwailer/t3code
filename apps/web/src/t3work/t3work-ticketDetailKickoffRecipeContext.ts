import type { GitHubWorkActivityItem } from "~/t3work/t3work-githubActivity";
import type { RelationshipKeyGroups } from "~/t3work/t3work-ticketRelationshipKeys";
import type { ProjectTicket } from "~/t3work/t3work-types";

import type { T3workSidecarRecipeTicketContext } from "~/t3work/t3work-sidecarRecipes";

function isPullRequestActivity(item: GitHubWorkActivityItem): boolean {
  return (item.subjectType ?? "").trim().toLowerCase() === "pullrequest";
}

function toHours(seconds: number | undefined): number | undefined {
  if (seconds === undefined) {
    return undefined;
  }

  return Math.round((seconds / 3600) * 100) / 100;
}

function normalizeText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function resolveAssigneeRelation(input: {
  ticket: ProjectTicket | undefined;
  currentUserAccountId?: string;
  currentUserDisplayName?: string;
}): "me" | "other" | "unassigned" {
  const assignee = normalizeText(input.ticket?.assignee);
  const assigneeAccountId = normalizeText(input.ticket?.assigneeAccountId);
  const currentUserAccountId = normalizeText(input.currentUserAccountId);
  const currentUserDisplayName = normalizeText(input.currentUserDisplayName);

  if (!assignee && !assigneeAccountId) {
    return "unassigned";
  }
  if (currentUserAccountId && assigneeAccountId === currentUserAccountId) {
    return "me";
  }
  if (
    currentUserDisplayName &&
    assignee &&
    currentUserDisplayName.toLowerCase() === assignee.toLowerCase()
  ) {
    return "me";
  }

  return "other";
}

function buildTicketGitHubSummary(
  githubActivityItems: ReadonlyArray<GitHubWorkActivityItem>,
): T3workSidecarRecipeTicketContext["github"] {
  let pullRequestCount = 0;
  let openPullRequestCount = 0;
  let draftPullRequestCount = 0;
  let mergedPullRequestCount = 0;
  let closedPullRequestCount = 0;
  let reviewRequestedPullRequestCount = 0;
  let commentCount = 0;
  let reviewCommentCount = 0;

  for (const item of githubActivityItems) {
    if (!isPullRequestActivity(item)) {
      continue;
    }

    pullRequestCount += 1;
    switch (item.subjectState) {
      case "open":
        openPullRequestCount += 1;
        break;
      case "draft":
        draftPullRequestCount += 1;
        break;
      case "merged":
        mergedPullRequestCount += 1;
        break;
      case "closed":
        closedPullRequestCount += 1;
        break;
    }
    if (item.reviewRequested === true) {
      reviewRequestedPullRequestCount += 1;
    }
    commentCount += item.commentCount ?? 0;
    reviewCommentCount += item.reviewCommentCount ?? 0;
  }

  return {
    pullRequestCount,
    openPullRequestCount,
    draftPullRequestCount,
    mergedPullRequestCount,
    closedPullRequestCount,
    reviewRequestedPullRequestCount,
    commentCount,
    reviewCommentCount,
  };
}

export function buildTicketRecipeContext(input: {
  ticket: ProjectTicket | undefined;
  ticketStatus: string;
  ticketRelationshipKeys: RelationshipKeyGroups;
  githubActivityItems: ReadonlyArray<GitHubWorkActivityItem>;
  currentUserAccountId?: string;
  currentUserDisplayName?: string;
}): T3workSidecarRecipeTicketContext {
  const originalEstimateHours = toHours(
    input.ticket?.aggregateTimeOriginalEstimateSeconds ?? input.ticket?.timeOriginalEstimateSeconds,
  );
  const remainingEstimateHours = toHours(
    input.ticket?.aggregateTimeRemainingEstimateSeconds ??
      input.ticket?.timeRemainingEstimateSeconds,
  );

  return {
    status: input.ticketStatus,
    ...(input.ticket?.assignee ? { assignee: input.ticket.assignee } : {}),
    assigneeRelation: resolveAssigneeRelation({
      ticket: input.ticket,
      ...(input.currentUserAccountId ? { currentUserAccountId: input.currentUserAccountId } : {}),
      ...(input.currentUserDisplayName
        ? { currentUserDisplayName: input.currentUserDisplayName }
        : {}),
    }),
    ...(typeof input.ticket?.estimateValue === "number"
      ? { estimateValue: input.ticket.estimateValue }
      : {}),
    ...(typeof originalEstimateHours === "number" ? { originalEstimateHours } : {}),
    ...(typeof remainingEstimateHours === "number" ? { remainingEstimateHours } : {}),
    relationships: {
      ...(input.ticketRelationshipKeys.parentKey
        ? { parentKey: input.ticketRelationshipKeys.parentKey }
        : {}),
      childKeys: input.ticketRelationshipKeys.childKeys,
      referenceKeys: input.ticketRelationshipKeys.referenceKeys,
      blockedByKeys: input.ticketRelationshipKeys.blockedByKeys,
      blockingKeys: input.ticketRelationshipKeys.blockingKeys,
    },
    github: buildTicketGitHubSummary(input.githubActivityItems),
  };
}
