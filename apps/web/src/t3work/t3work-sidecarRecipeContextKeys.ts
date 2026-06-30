import { matchesProjectTicketStatusCategory } from "~/t3work/t3work-projectTicketStatus";
import type { T3workSidecarRecipeInput } from "~/t3work/t3work-sidecarRecipeTypes";

function normalizeContextKeySegment(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function deriveTicketStatusCategory(status: string): "active" | "review" | "done" {
  if (matchesProjectTicketStatusCategory(status, "done")) {
    return "done";
  }

  if (matchesProjectTicketStatusCategory(status, "review")) {
    return "review";
  }

  return "active";
}

export function buildAvailableContextKeys(input: T3workSidecarRecipeInput): ReadonlyArray<string> {
  const keys = new Set(input.availableContextKeys ?? []);

  if (
    input.surface === "project.dashboard" ||
    input.surface === "project.dashboard.backlog" ||
    input.surface === "project.dashboard.myWork"
  ) {
    if (input.dashboardMode) {
      keys.add(`dashboard.mode.${input.dashboardMode}`);
    }

    if (input.currentViewSummary) {
      const itemCount = input.currentViewSummary.itemCount;
      const bugCount = input.currentViewSummary.bugCount ?? 0;
      const needsMyActionCount = input.currentViewSummary.needsMyActionCount ?? 0;

      keys.add("dashboard.view.summary");
      if (itemCount > 0 && itemCount <= 20) {
        keys.add("dashboard.view.focused");
      }
      if (itemCount > 0 && itemCount <= 8) {
        keys.add("dashboard.view.tight-slice");
      }
      if (itemCount > 40) {
        keys.add("dashboard.view.too-broad");
      }
      if (bugCount > 0) {
        keys.add("dashboard.view.has-bugs");
      }
      if (input.currentViewSummary.needsMyActionPreset && needsMyActionCount > 0) {
        keys.add("dashboard.view.needs-my-action");
        keys.add(`dashboard.view.needs-my-action.${input.currentViewSummary.needsMyActionPreset}`);
      }
      if (input.currentViewSummary.viewFiltersActive) {
        keys.add("dashboard.view.filtered");
      }
      if (itemCount > 0 && itemCount <= 20 && bugCount >= 3 && bugCount / itemCount >= 0.25) {
        keys.add("dashboard.view.risk-hotspot");
      }
    }
  }

  if (input.resourceKind === "ticket" || input.ticketContext) {
    if (input.jiraIssueType) {
      const normalizedIssueType = normalizeContextKeySegment(input.jiraIssueType);
      if (normalizedIssueType) {
        keys.add(`ticket.type.${normalizedIssueType}`);
        if (["bug", "incident", "defect"].includes(normalizedIssueType)) {
          keys.add("ticket.context.customer-risk");
        }
      }
    }

    if (input.workitemPriority) {
      const normalizedPriority = normalizeContextKeySegment(input.workitemPriority);
      if (normalizedPriority) {
        keys.add(`ticket.priority.${normalizedPriority}`);
        if (["critical", "highest", "high", "blocker", "urgent"].includes(normalizedPriority)) {
          keys.add("ticket.context.customer-risk");
        }
      }
    }

    if (input.ticketContext?.status) {
      const normalizedStatus = normalizeContextKeySegment(input.ticketContext.status);
      if (normalizedStatus) {
        keys.add(`ticket.status.${normalizedStatus}`);
        if (normalizedStatus.includes("blocked")) {
          keys.add("ticket.context.blocked");
        }
      }
      keys.add(`ticket.status.${deriveTicketStatusCategory(input.ticketContext.status)}`);
    }

    if (input.ticketContext?.assigneeRelation) {
      keys.add(`ticket.assignment.${input.ticketContext.assigneeRelation}`);
    }
    if (typeof input.ticketContext?.estimateValue === "number") {
      keys.add("ticket.estimate.story-points");
    }
    if (typeof input.ticketContext?.originalEstimateHours === "number") {
      keys.add("ticket.estimate.original");
    }
    if (typeof input.ticketContext?.remainingEstimateHours === "number") {
      keys.add("ticket.estimate.remaining");
      if (input.ticketContext.remainingEstimateHours > 0) {
        keys.add("ticket.estimate.remaining-positive");
      }
    }
    if (
      typeof input.ticketContext?.originalEstimateHours === "number" &&
      typeof input.ticketContext.remainingEstimateHours === "number" &&
      input.ticketContext.remainingEstimateHours > input.ticketContext.originalEstimateHours
    ) {
      keys.add("ticket.context.overrun");
    }

    if (input.ticketContext?.relationships?.parentKey) {
      keys.add("ticket.relationship.parent");
    }
    if ((input.ticketContext?.relationships?.childKeys.length ?? 0) > 0) {
      keys.add("ticket.relationship.children");
    }
    if ((input.ticketContext?.relationships?.referenceKeys.length ?? 0) > 0) {
      keys.add("ticket.relationship.linked");
    }
    if ((input.ticketContext?.relationships?.blockedByKeys.length ?? 0) > 0) {
      keys.add("ticket.relationship.blocked-by");
      keys.add("ticket.context.blocked");
    }
    if ((input.ticketContext?.relationships?.blockingKeys.length ?? 0) > 0) {
      keys.add("ticket.relationship.blocks");
    }

    if ((input.ticketContext?.github?.pullRequestCount ?? 0) > 0) {
      keys.add("ticket.github.pull-request");
    }
    if ((input.ticketContext?.github?.openPullRequestCount ?? 0) > 0) {
      keys.add("ticket.github.pull-request.open");
    }
    if ((input.ticketContext?.github?.draftPullRequestCount ?? 0) > 0) {
      keys.add("ticket.github.pull-request.draft");
    }
    if ((input.ticketContext?.github?.mergedPullRequestCount ?? 0) > 0) {
      keys.add("ticket.github.pull-request.merged");
    }
    if ((input.ticketContext?.github?.reviewRequestedPullRequestCount ?? 0) > 0) {
      keys.add("ticket.github.pull-request.review-requested");
    }
    if ((input.ticketContext?.github?.commentCount ?? 0) > 0) {
      keys.add("ticket.github.pull-request.comments");
    }
    if ((input.ticketContext?.github?.reviewCommentCount ?? 0) > 0) {
      keys.add("ticket.github.pull-request.review-comments");
    }
    if (
      (input.ticketContext?.github?.pullRequestCount ?? 0) > 0 &&
      ((input.ticketContext?.github?.reviewRequestedPullRequestCount ?? 0) > 0 ||
        (input.ticketContext?.github?.commentCount ?? 0) > 0 ||
        (input.ticketContext?.github?.reviewCommentCount ?? 0) > 0)
    ) {
      keys.add("ticket.context.review-needs-response");
    }
    if (
      input.ticketContext?.status &&
      deriveTicketStatusCategory(input.ticketContext.status) !== "done" &&
      (input.ticketContext?.github?.mergedPullRequestCount ?? 0) > 0
    ) {
      keys.add("ticket.context.closeout-ready");
    }
    if (
      input.ticketContext?.status &&
      deriveTicketStatusCategory(input.ticketContext.status) === "active" &&
      (input.ticketContext?.github?.pullRequestCount ?? 0) === 0 &&
      !keys.has("ticket.context.blocked")
    ) {
      keys.add("ticket.context.pre-implementation");
    }
  }

  return [...keys];
}
