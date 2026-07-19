import type { ProjectRecipeWorkflowShapeStep } from "@t3tools/project-recipes";

import type { T3workWorkflowStepEntry } from "./t3work-threadWorkflowStepProgress";

export interface T3workWorkflowShapeProgressRow {
  /** The human-authored plan step, when this runtime event maps to one. */
  readonly planStep?: ProjectRecipeWorkflowShapeStep;
  /** The live execution event, when this is not merely a future plan row. */
  readonly runtimeStep?: T3workWorkflowStepEntry;
}

function stepMatchesPlan(
  plan: ProjectRecipeWorkflowShapeStep,
  runtime: T3workWorkflowStepEntry,
): boolean {
  if (plan.kind === "agent") return runtime.stepKind === "thread.turn";
  if (plan.kind === "ask") return runtime.stepKind === "user.input";
  if (["thread.create", "thread.turn", "user.input"].includes(runtime.stepKind)) return false;
  if (plan.kind === runtime.stepKind) return true;

  const label = plan.label.toLowerCase();
  return (
    runtime.stepKind.toLowerCase().includes(label) ||
    (runtime.detail?.toLowerCase().includes(label) ?? false)
  );
}

export function reconcileT3workWorkflowShapeProgress(
  plan: ReadonlyArray<ProjectRecipeWorkflowShapeStep>,
  runtime: ReadonlyArray<T3workWorkflowStepEntry>,
): {
  readonly planSteps: ReadonlyArray<T3workWorkflowStepEntry | undefined>;
  /**
   * One display list. Runtime order is preserved, while unstarted plan rows stay at their
   * intended position around executed rows. Infrastructure setup is deliberately invisible.
   */
  readonly rows: ReadonlyArray<T3workWorkflowShapeProgressRow>;
} {
  const visibleRuntime = runtime.filter((step) => step.stepKind !== "thread.create");
  const used = new Set<number>();
  let cursor = 0;
  const planSteps = plan.map((planStep) => {
    const index = visibleRuntime.findIndex(
      (runtimeStep, candidate) =>
        candidate >= cursor && !used.has(candidate) && stepMatchesPlan(planStep, runtimeStep),
    );
    if (index < 0) return undefined;
    used.add(index);
    cursor = index + 1;
    return visibleRuntime[index];
  });

  const planIndexByRuntimeIndex = new Map<number, number>();
  for (const [planIndex, runtimeStep] of planSteps.entries()) {
    if (runtimeStep === undefined) continue;
    const runtimeIndex = visibleRuntime.indexOf(runtimeStep);
    if (runtimeIndex >= 0) planIndexByRuntimeIndex.set(runtimeIndex, planIndex);
  }

  const rows: T3workWorkflowShapeProgressRow[] = [];
  let nextPlanIndex = 0;
  for (const [runtimeIndex, runtimeStep] of visibleRuntime.entries()) {
    const planIndex = planIndexByRuntimeIndex.get(runtimeIndex);
    if (planIndex === undefined) {
      rows.push({ runtimeStep });
      continue;
    }
    while (nextPlanIndex < planIndex) {
      rows.push({ planStep: plan[nextPlanIndex]! });
      nextPlanIndex += 1;
    }
    rows.push({ planStep: plan[planIndex]!, runtimeStep });
    nextPlanIndex = planIndex + 1;
  }
  while (nextPlanIndex < plan.length) {
    rows.push({ planStep: plan[nextPlanIndex]! });
    nextPlanIndex += 1;
  }

  return {
    planSteps,
    rows,
  };
}
