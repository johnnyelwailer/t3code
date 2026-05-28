import type { T3workSidecarRecipeQuickStart } from "~/t3work/t3work-sidecarRecipeTypes";

function areStringRecordValuesEqual(
  left: Readonly<Record<string, unknown>> | undefined,
  right: Readonly<Record<string, unknown>> | undefined,
): boolean {
  if (left === right) {
    return true;
  }

  if (!left || !right) {
    return false;
  }

  const leftKeys = Object.keys(left);
  if (leftKeys.length !== Object.keys(right).length) {
    return false;
  }

  return leftKeys.every((key) => left[key] === right[key]);
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
      quickStart.workflow.recipeId === other?.workflow.recipeId &&
      quickStart.workflow.recipeVersion === other?.workflow.recipeVersion &&
      quickStart.workflow.source === other?.workflow.source &&
      quickStart.workflow.surface === other?.workflow.surface &&
      quickStart.workflow.reason === other?.workflow.reason &&
      areStringRecordValuesEqual(quickStart.workflow.parameters, other?.workflow.parameters) &&
      quickStart.actionView?.source === other?.actionView?.source &&
      quickStart.actionView?.context === other?.actionView?.context
    );
  });
}
