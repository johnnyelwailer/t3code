import type { T3WorkContextAttachment } from "~/t3work/t3work-contextAttachment";
import type { T3workSidecarRecipeInput } from "~/t3work/t3work-sidecarRecipeTypes";

type BundledRecipeTemplateValues = Readonly<Record<string, string>>;

export function renderPromptTemplate(
  template: string,
  values: Readonly<Record<string, string>>,
): string {
  return template.replace(
    /{{\s*([a-zA-Z0-9]+)\s*}}/g,
    (_match, key: string) => values[key] ?? "selected work",
  );
}

function formatTemplateNumber(value: number | undefined): string {
  if (value === undefined) {
    return "";
  }
  if (Number.isInteger(value)) {
    return String(value);
  }
  return value
    .toFixed(2)
    .replace(/\.0+$/, "")
    .replace(/(\.\d*[1-9])0+$/, "$1");
}

function formatTemplateHours(value: number | undefined): string {
  return value === undefined ? "" : `${formatTemplateNumber(value)}h`;
}

export function buildBundledRecipeTemplateValues(
  input: T3workSidecarRecipeInput,
): BundledRecipeTemplateValues {
  const attachedWorkitems = (input.contextAttachments ?? []).filter(
    (attachment): attachment is T3WorkContextAttachment => attachment.kind === "jira-work-item",
  );
  const attachedBug = attachedWorkitems.find((attachment) => attachment.jiraIssueType === "Bug");
  const currentViewLabel =
    input.dashboardMode === "my-work"
      ? "my work"
      : input.dashboardMode === "backlog"
        ? "pending work"
        : "project work";
  const surfaceAuthoringLabel =
    input.surface === "workitem.detail.sidepanel"
      ? "this work item"
      : input.dashboardMode === "my-work"
        ? "my work view"
        : input.dashboardMode === "backlog"
          ? "backlog view"
          : "current dashboard view";
  const currentViewSummarySuffix = input.currentViewSummary
    ? (() => {
        const parts = [
          `${String(input.currentViewSummary.itemCount)} item${input.currentViewSummary.itemCount === 1 ? "" : "s"}`,
        ];
        if ((input.currentViewSummary.bugCount ?? 0) > 0) {
          if (input.currentViewSummary.bugCount === 1) {
            parts.push(
              input.currentViewSummary.primaryBugLabel
                ? `one bug (${input.currentViewSummary.primaryBugLabel})`
                : "one bug",
            );
          } else {
            parts.push(
              input.currentViewSummary.primaryBugLabel
                ? `${String(input.currentViewSummary.bugCount)} bugs including ${input.currentViewSummary.primaryBugLabel}`
                : `${String(input.currentViewSummary.bugCount)} bugs`,
            );
          }
        }
        return `: ${parts.join(", ")}`;
      })()
    : "";

  return {
    projectTitle: input.project.title,
    selectedWorkLabel: input.selectedWorkLabel,
    selectedWorkTitle: input.selectedWorkTitle ?? "",
    jiraIssueType: input.jiraIssueType ?? "",
    ticketStatus: input.ticketContext?.status ?? "",
    ticketAssignee: input.ticketContext?.assignee ?? "",
    ticketAssigneeRelation: input.ticketContext?.assigneeRelation ?? "",
    ticketEstimatePoints: formatTemplateNumber(input.ticketContext?.estimateValue),
    ticketOriginalEstimateHours: formatTemplateHours(input.ticketContext?.originalEstimateHours),
    ticketRemainingEstimateHours: formatTemplateHours(input.ticketContext?.remainingEstimateHours),
    blockedByCount: String(input.ticketContext?.relationships?.blockedByKeys.length ?? 0),
    blockingCount: String(input.ticketContext?.relationships?.blockingKeys.length ?? 0),
    linkedPullRequestCount: String(input.ticketContext?.github?.pullRequestCount ?? 0),
    openPullRequestCount: String(input.ticketContext?.github?.openPullRequestCount ?? 0),
    draftPullRequestCount: String(input.ticketContext?.github?.draftPullRequestCount ?? 0),
    mergedPullRequestCount: String(input.ticketContext?.github?.mergedPullRequestCount ?? 0),
    reviewRequestedPullRequestCount: String(
      input.ticketContext?.github?.reviewRequestedPullRequestCount ?? 0,
    ),
    githubCommentCount: String(input.ticketContext?.github?.commentCount ?? 0),
    githubReviewCommentCount: String(input.ticketContext?.github?.reviewCommentCount ?? 0),
    currentViewLabel,
    surfaceAuthoringLabel,
    currentViewSummarySuffix,
    dashboardMode: input.dashboardMode ?? "",
    attachedItemCount: String(input.contextAttachments?.length ?? 0),
    attachedWorkitemCount: String(attachedWorkitems.length),
    attachedBugLabel: attachedBug?.label ?? "",
    currentViewItemCount: String(input.currentViewSummary?.itemCount ?? 0),
    currentViewBugCount: String(input.currentViewSummary?.bugCount ?? 0),
    currentViewPrimaryItemLabel: input.currentViewSummary?.primaryItemLabel ?? "",
    currentViewPrimaryBugLabel: input.currentViewSummary?.primaryBugLabel ?? "",
  };
}
