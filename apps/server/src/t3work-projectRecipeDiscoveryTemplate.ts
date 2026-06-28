import { queryableToReadonlyArray } from "@t3tools/project-context";
import type { ProjectRecipeRenderContext } from "@t3tools/project-recipes";

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

function buildRecipeExpressionContext(
  context: ProjectRecipeRenderContext,
): Readonly<Record<string, unknown>> {
  const selectedWorkLabel = context.workitem?.displayId ?? context.project.title;
  const contextAttachments = queryableToReadonlyArray(context.contextAttachments);
  const attachedWorkitems = contextAttachments.filter(
    (attachment) => attachment.kind === "jira-work-item",
  );
  const attachedBug = attachedWorkitems.find((attachment) => attachment.jiraIssueType === "Bug");
  const dashboardMode = context.surfaceState?.dashboardMode;
  const currentViewLabel =
    dashboardMode === "my-work"
      ? "my work"
      : dashboardMode === "backlog"
        ? "pending work"
        : "project work";
  const surfaceAuthoringLabel =
    context.surface === "workitem.detail.sidepanel"
      ? "this work item"
      : dashboardMode === "my-work"
        ? "my work view"
        : dashboardMode === "backlog"
          ? "backlog view"
          : "current dashboard view";
  const currentViewSummary = context.surfaceState?.currentView;
  const currentViewSummarySuffix = currentViewSummary
    ? (() => {
        const parts = [
          `${String(currentViewSummary.itemCount)} item${currentViewSummary.itemCount === 1 ? "" : "s"}`,
        ];
        if ((currentViewSummary.bugCount ?? 0) > 0) {
          if (currentViewSummary.bugCount === 1) {
            parts.push(
              currentViewSummary.primaryBugLabel
                ? `one bug (${currentViewSummary.primaryBugLabel})`
                : "one bug",
            );
          } else {
            parts.push(
              currentViewSummary.primaryBugLabel
                ? `${String(currentViewSummary.bugCount)} bugs including ${currentViewSummary.primaryBugLabel}`
                : `${String(currentViewSummary.bugCount)} bugs`,
            );
          }
        }
        return `: ${parts.join(", ")}`;
      })()
    : "";

  return {
    ...context,
    linkedResources: queryableToReadonlyArray(context.linkedResources),
    artifacts: queryableToReadonlyArray(context.artifacts),
    contextAttachments,
    availableContextKeys: queryableToReadonlyArray(context.availableContextKeys),
    projectTitle: context.project.title,
    selectedWorkLabel,
    selectedWorkTitle: context.workitem?.title ?? "",
    jiraIssueType: context.workitem?.type ?? "",
    ticketStatus: context.workitem?.status ?? "",
    ticketAssignee: context.workitem?.assignee ?? "",
    ticketAssigneeRelation: context.workitem?.assigneeRelation ?? "",
    ticketEstimatePoints: formatTemplateNumber(context.workitem?.estimateValue),
    ticketOriginalEstimateHours: formatTemplateHours(context.workitem?.originalEstimateHours),
    ticketRemainingEstimateHours: formatTemplateHours(context.workitem?.remainingEstimateHours),
    blockedByCount: String(context.workitem?.relationships?.blockedByKeys.length ?? 0),
    blockingCount: String(context.workitem?.relationships?.blockingKeys.length ?? 0),
    childCount: String(context.workitem?.relationships?.childKeys.length ?? 0),
    hasChildren: String((context.workitem?.relationships?.childKeys.length ?? 0) > 0),
    linkedPullRequestCount: String(context.workitem?.github?.pullRequestCount ?? 0),
    openPullRequestCount: String(context.workitem?.github?.openPullRequestCount ?? 0),
    draftPullRequestCount: String(context.workitem?.github?.draftPullRequestCount ?? 0),
    mergedPullRequestCount: String(context.workitem?.github?.mergedPullRequestCount ?? 0),
    reviewRequestedPullRequestCount: String(
      context.workitem?.github?.reviewRequestedPullRequestCount ?? 0,
    ),
    githubCommentCount: String(context.workitem?.github?.commentCount ?? 0),
    githubReviewCommentCount: String(context.workitem?.github?.reviewCommentCount ?? 0),
    currentViewLabel,
    surfaceAuthoringLabel,
    currentViewSummarySuffix,
    dashboardMode: dashboardMode ?? "",
    attachedItemCount: String(contextAttachments.length),
    attachedWorkitemCount: String(attachedWorkitems.length),
    attachedBugLabel: attachedBug?.label ?? "",
    currentViewItemCount: String(currentViewSummary?.itemCount ?? 0),
    currentViewBugCount: String(currentViewSummary?.bugCount ?? 0),
    currentViewPrimaryItemLabel: currentViewSummary?.primaryItemLabel ?? "",
    currentViewPrimaryBugLabel: currentViewSummary?.primaryBugLabel ?? "",
  };
}

export function evaluateExpression(
  expression: string,
  context: ProjectRecipeRenderContext,
): unknown {
  const expressionContext = buildRecipeExpressionContext(context);
  const evaluator = new Function(
    "ctx",
    `const { surface, project, workitem, linkedResources, artifacts, contextAttachments, surfaceState, profile, enabledSkillPacks, schema, availableContextKeys, projectTitle, selectedWorkLabel, selectedWorkTitle, jiraIssueType, ticketStatus, ticketAssignee, ticketAssigneeRelation, ticketEstimatePoints, ticketOriginalEstimateHours, ticketRemainingEstimateHours, blockedByCount, blockingCount, childCount, hasChildren, linkedPullRequestCount, openPullRequestCount, draftPullRequestCount, mergedPullRequestCount, reviewRequestedPullRequestCount, githubCommentCount, githubReviewCommentCount, currentViewLabel, surfaceAuthoringLabel, currentViewSummarySuffix, dashboardMode, attachedItemCount, attachedWorkitemCount, attachedBugLabel, currentViewItemCount, currentViewBugCount, currentViewPrimaryItemLabel, currentViewPrimaryBugLabel } = ctx; return (${expression});`,
  ) as (ctx: Readonly<Record<string, unknown>>) => unknown;
  return evaluator(expressionContext);
}

export function renderTemplateString(
  template: string,
  context: ProjectRecipeRenderContext,
): string {
  return template.replace(/{{([\s\S]+?)}}/g, (_match, expression: string) => {
    const result = evaluateExpression(expression.trim(), context);
    return String(result ?? "");
  });
}

export function renderMaybeExpression<TOutput extends string | number | undefined>(
  value: TOutput,
  context: ProjectRecipeRenderContext,
): TOutput {
  if (typeof value !== "string") {
    return value;
  }
  const entireExpression = /^\s*{{([\s\S]+)}}\s*$/.exec(value);
  if (entireExpression) {
    return evaluateExpression(entireExpression[1]!.trim(), context) as TOutput;
  }
  return renderTemplateString(value, context) as TOutput;
}
