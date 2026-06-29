import { queryableToReadonlyArray } from "@t3tools/project-context";
import type { ProjectRecipeRenderContext } from "@t3tools/project-recipes";

import type { T3workSidecarRecipeQuickStart } from "~/t3work/t3work-sidecarRecipeTypes";

function areArrayValuesEqual(
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

function areValueStructuresEqual(left: unknown, right: unknown): boolean {
  if (left === right) {
    return true;
  }

  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function normalizeRecipeRenderContext(context: ProjectRecipeRenderContext) {
  return {
    surface: context.surface,
    project: context.project,
    ...(context.workitem ? { workitem: context.workitem } : {}),
    linkedResources: queryableToReadonlyArray(context.linkedResources),
    artifacts: queryableToReadonlyArray(context.artifacts),
    profile: context.profile,
    enabledSkillPacks: context.enabledSkillPacks,
    schema: context.schema,
    availableContextKeys: queryableToReadonlyArray(context.availableContextKeys),
    ...(context.contextAttachments
      ? { contextAttachments: queryableToReadonlyArray(context.contextAttachments) }
      : {}),
    ...(context.surfaceState ? { surfaceState: context.surfaceState } : {}),
  };
}

function areRecipeRenderContextsEqual(
  left: ProjectRecipeRenderContext | undefined,
  right: ProjectRecipeRenderContext | undefined,
): boolean {
  if (left === right) {
    return true;
  }

  if (!left || !right) {
    return false;
  }

  return areValueStructuresEqual(
    normalizeRecipeRenderContext(left),
    normalizeRecipeRenderContext(right),
  );
}

function areComposerGuidanceEqual(
  left: T3workSidecarRecipeQuickStart["composerGuidance"],
  right: T3workSidecarRecipeQuickStart["composerGuidance"],
): boolean {
  if (left === right) {
    return true;
  }

  if (!left || !right) {
    return false;
  }

  return left.helperText === right.helperText && left.placeholder === right.placeholder;
}

function areQuickStartWorkflowsEqual(
  left: T3workSidecarRecipeQuickStart["workflow"],
  right: T3workSidecarRecipeQuickStart["workflow"] | undefined,
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
    areValueStructuresEqual(left.parameters, right.parameters) &&
    areValueStructuresEqual(left.kickoff, right.kickoff) &&
    left.title === right.title &&
    left.description === right.description &&
    left.source === right.source &&
    left.surface === right.surface &&
    left.reason === right.reason &&
    left.recipePath === right.recipePath &&
    left.promptPath === right.promptPath &&
    left.workflowPath === right.workflowPath &&
    areArrayValuesEqual(left.allowedToolGroups, right.allowedToolGroups) &&
    areValueStructuresEqual(left.launchContext, right.launchContext)
  );
}

function areQuickStartActionViewsEqual(
  left: T3workSidecarRecipeQuickStart["actionView"],
  right: T3workSidecarRecipeQuickStart["actionView"],
): boolean {
  if (left === right) {
    return true;
  }

  if (!left || !right) {
    return false;
  }

  return (
    left.source === right.source &&
    left.path === right.path &&
    areRecipeRenderContextsEqual(left.context, right.context)
  );
}

export function areQuickStartsEqual(
  left: ReadonlyArray<T3workSidecarRecipeQuickStart>,
  right: ReadonlyArray<T3workSidecarRecipeQuickStart>,
): boolean {
  if (left === right) {
    return true;
  }

  if (left.length !== right.length) {
    return false;
  }

  return left.every((quickStart, index) => {
    const other = right[index];
    return (
      quickStart.id === other?.id &&
      quickStart.title === other?.title &&
      quickStart.description === other?.description &&
      quickStart.prompt === other?.prompt &&
      quickStart.sourcePath === other?.sourcePath &&
      areComposerGuidanceEqual(quickStart.composerGuidance, other?.composerGuidance) &&
      areQuickStartWorkflowsEqual(quickStart.workflow, other?.workflow) &&
      areQuickStartActionViewsEqual(quickStart.actionView, other?.actionView)
    );
  });
}
