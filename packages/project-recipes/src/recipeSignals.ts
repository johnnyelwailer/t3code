import type { ProjectRecipeRenderContext } from "./discovery.ts";

export const RECIPE_SIGNAL_KEYS = [
  "workitem.type",
  "workitem.status",
  "workitem.priority",
  "workitem.assigneeRelation",
  "workitem.childCount",
  "workitem.hasChildren",
  "workitem.blockedByCount",
  "workitem.blockingCount",
  "workitem.openPullRequestCount",
  "workitem.mergedPullRequestCount",
  "surface.hasSelectedWork",
  "surface.dashboardMode",
  "dashboard.currentView.itemCount",
  "dashboard.currentView.bugCount",
] as const;

export type RecipeSignalKey = (typeof RECIPE_SIGNAL_KEYS)[number];
export type RecipeSignalValue = string | number | boolean;
export type RecipeMatchSignals = Partial<Record<RecipeSignalKey, RecipeSignalValue>>;

function assignWorkitemRelationshipSignals(
  signals: RecipeMatchSignals,
  relationships: NonNullable<ProjectRecipeRenderContext["workitem"]>["relationships"],
): void {
  if (!relationships) {
    return;
  }
  const childCount = relationships.childKeys.length;
  signals["workitem.childCount"] = childCount;
  signals["workitem.hasChildren"] = childCount > 0;
  signals["workitem.blockedByCount"] = relationships.blockedByKeys.length;
  signals["workitem.blockingCount"] = relationships.blockingKeys.length;
}

export function buildRecipeMatchSignalsFromRenderContext(
  context: ProjectRecipeRenderContext,
): RecipeMatchSignals {
  const signals: RecipeMatchSignals = {};
  const workitem = context.workitem;

  if (workitem?.type) {
    signals["workitem.type"] = workitem.type;
  }
  if (workitem?.status) {
    signals["workitem.status"] = workitem.status;
  }
  if (workitem?.priority) {
    signals["workitem.priority"] = workitem.priority;
  }
  if (workitem?.assigneeRelation) {
    signals["workitem.assigneeRelation"] = workitem.assigneeRelation;
  }
  if (workitem?.relationships) {
    assignWorkitemRelationshipSignals(signals, workitem.relationships);
  }
  if (workitem?.github) {
    if (typeof workitem.github.openPullRequestCount === "number") {
      signals["workitem.openPullRequestCount"] = workitem.github.openPullRequestCount;
    }
    if (typeof workitem.github.mergedPullRequestCount === "number") {
      signals["workitem.mergedPullRequestCount"] = workitem.github.mergedPullRequestCount;
    }
  }

  signals["surface.hasSelectedWork"] = Boolean(workitem);

  const dashboardMode = context.surfaceState?.dashboardMode;
  if (dashboardMode) {
    signals["surface.dashboardMode"] = dashboardMode;
  }

  const currentView = context.surfaceState?.currentView;
  if (currentView) {
    signals["dashboard.currentView.itemCount"] = currentView.itemCount;
    if (typeof currentView.bugCount === "number") {
      signals["dashboard.currentView.bugCount"] = currentView.bugCount;
    }
  }

  return signals;
}
