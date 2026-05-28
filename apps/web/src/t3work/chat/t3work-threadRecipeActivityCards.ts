import { type OrchestrationThreadActivity } from "@t3tools/contracts";
import {
  isProjectRecipeLaunchActivityPayload,
  isProjectRecipeWorkflowCardActivityPayload,
  PROJECT_RECIPE_ACTIVITY_KIND_LAUNCH,
  PROJECT_RECIPE_ACTIVITY_KIND_WORKFLOW_CARD,
  PROJECT_RECIPE_ACTIVITY_KIND_WORKFLOW_CARD_ACTION,
  type ProjectRecipeLaunchActivityPayload,
  type ProjectRecipeWorkflowCardActivityPayload,
} from "@t3tools/project-recipes";

export type T3workRecipeActivityCardEntry =
  | {
      id: string;
      kind: "recipe-launch";
      createdAt: string;
      tone: "info" | "error";
      launch: ProjectRecipeLaunchActivityPayload;
    }
  | {
      id: string;
      kind: "workflow-card";
      createdAt: string;
      tone: "info" | "error";
      card: ProjectRecipeWorkflowCardActivityPayload;
    };

export function isT3workRecipeActivity(activity: OrchestrationThreadActivity): boolean {
  return (
    activity.kind === PROJECT_RECIPE_ACTIVITY_KIND_LAUNCH ||
    activity.kind === PROJECT_RECIPE_ACTIVITY_KIND_WORKFLOW_CARD ||
    activity.kind === PROJECT_RECIPE_ACTIVITY_KIND_WORKFLOW_CARD_ACTION
  );
}

export function deriveT3workRecipeActivityCardEntries(
  activities: ReadonlyArray<OrchestrationThreadActivity>,
): T3workRecipeActivityCardEntry[] {
  const entries: T3workRecipeActivityCardEntry[] = [];

  for (const activity of [...activities].toSorted(compareActivitiesByOrder)) {
    if (
      activity.kind === PROJECT_RECIPE_ACTIVITY_KIND_LAUNCH &&
      isProjectRecipeLaunchActivityPayload(activity.payload)
    ) {
      entries.push({
        id: activity.id,
        kind: "recipe-launch",
        createdAt: activity.createdAt,
        tone: activity.tone === "error" ? "error" : "info",
        launch: activity.payload,
      });
      continue;
    }

    if (
      activity.kind === PROJECT_RECIPE_ACTIVITY_KIND_WORKFLOW_CARD &&
      isProjectRecipeWorkflowCardActivityPayload(activity.payload)
    ) {
      entries.push({
        id: activity.id,
        kind: "workflow-card",
        createdAt: activity.createdAt,
        tone: activity.tone === "error" ? "error" : "info",
        card: activity.payload,
      });
    }
  }

  return entries;
}

function compareActivitiesByOrder(
  left: OrchestrationThreadActivity,
  right: OrchestrationThreadActivity,
): number {
  if (left.sequence !== undefined && right.sequence !== undefined) {
    if (left.sequence !== right.sequence) {
      return left.sequence - right.sequence;
    }
  } else if (left.sequence !== undefined) {
    return 1;
  } else if (right.sequence !== undefined) {
    return -1;
  }

  const createdAtComparison = left.createdAt.localeCompare(right.createdAt);
  if (createdAtComparison !== 0) {
    return createdAtComparison;
  }

  const lifecycleRankComparison =
    compareActivityLifecycleRank(left.kind) - compareActivityLifecycleRank(right.kind);
  if (lifecycleRankComparison !== 0) {
    return lifecycleRankComparison;
  }

  return left.id.localeCompare(right.id);
}

function compareActivityLifecycleRank(kind: string): number {
  if (kind.endsWith(".started") || kind === "tool.started") {
    return 0;
  }
  if (kind.endsWith(".progress") || kind.endsWith(".updated")) {
    return 1;
  }
  if (kind.endsWith(".completed") || kind.endsWith(".resolved")) {
    return 2;
  }
  return 1;
}
