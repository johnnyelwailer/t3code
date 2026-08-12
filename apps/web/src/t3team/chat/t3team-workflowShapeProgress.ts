import type { ProjectRecipeWorkflowShapeStep } from "@t3tools/project-recipes";

import type { T3TeamWorkflowStepEntry } from "./t3team-threadWorkflowStepProgress";

export interface T3TeamWorkflowShapeProgressRow {
  /** The human-authored plan step, when this runtime event maps to one. */
  readonly planStep?: ProjectRecipeWorkflowShapeStep;
  /** The live execution event, when this is not merely a future plan row. */
  readonly runtimeStep?: T3TeamWorkflowStepEntry;
  /** Authored phase that gives an unmatched runtime step useful visual context. */
  readonly phase?: string | null;
}

function stepMatchesPlan(
  plan: ProjectRecipeWorkflowShapeStep,
  runtime: T3TeamWorkflowStepEntry,
): boolean {
  if (runtime.stepKind === "wait.until") {
    return /\b(wait|schedule|pause|delay)\b/i.test(plan.label);
  }
  // Agent/user calls from dynamic parallel work can repeat at runtime while their static source
  // has only one call site. Once a runtime label is available, require it to match the authored
  // label. Otherwise a second parallel turn could incorrectly light up a later phase.
  if (plan.kind === "agent" || plan.kind === "ask") {
    const expectedKind = plan.kind === "agent" ? "thread.turn" : "user.input";
    if (runtime.stepKind !== expectedKind) return false;
    if (runtime.detail === undefined) return true; // legacy activity payload
    const detail = runtime.detail.replaceAll(/\s+/g, " ").trim().toLowerCase();
    const label = plan.label.replaceAll(/\s+/g, " ").trim().toLowerCase();
    if (detail === label) return true;
    // Older runtimes appended prompt/output-contract instructions to the authored label.
    // Match only at a word boundary so a short label cannot consume unrelated future work.
    return detail.startsWith(`${label} `) || detail.startsWith(`${label}:`);
  }
  if (["thread.create", "thread.turn", "user.input"].includes(runtime.stepKind)) return false;
  if (plan.kind === runtime.stepKind) return true;

  const label = plan.label.toLowerCase();
  return (
    runtime.stepKind.toLowerCase().includes(label) ||
    (runtime.detail?.toLowerCase().includes(label) ?? false)
  );
}

export function reconcileT3TeamWorkflowShapeProgress(
  plan: ReadonlyArray<ProjectRecipeWorkflowShapeStep>,
  runtime: ReadonlyArray<T3TeamWorkflowStepEntry>,
): {
  readonly planSteps: ReadonlyArray<T3TeamWorkflowStepEntry | undefined>;
  /**
   * One display list. Runtime order is preserved, while unstarted plan rows stay at their
   * intended position around executed rows. Infrastructure setup is deliberately invisible.
   */
  readonly rows: ReadonlyArray<T3TeamWorkflowShapeProgressRow>;
} {
  const visibleRuntime = runtime.filter((step) => step.stepKind !== "thread.create");
  const used = new Set<number>();
  const planSteps = plan.map((planStep, planIndex) => {
    const index = visibleRuntime.findIndex(
      (runtimeStep, candidate) => !used.has(candidate) && stepMatchesPlan(planStep, runtimeStep),
    );
    if (index >= 0) {
      used.add(index);
      return visibleRuntime[index];
    }
    // The host deliberately keeps user-input detail generic ("Awaiting your input") so prompts
    // are not duplicated. If exactly one ask remains, its identity is still unambiguous.
    if (planStep.kind === "ask") {
      const candidates = visibleRuntime
        .map((runtimeStep, candidate) => ({ runtimeStep, candidate }))
        .filter(
          ({ runtimeStep, candidate }) =>
            !used.has(candidate) && runtimeStep.stepKind === "user.input",
        );
      const remainingAskPlans = plan
        .slice(planIndex)
        .filter((candidate) => candidate.kind === "ask").length;
      if (candidates.length === 1 && remainingAskPlans === 1) {
        used.add(candidates[0]!.candidate);
        return candidates[0]!.runtimeStep;
      }
    }
    return undefined;
  });

  const planIndexByRuntimeIndex = new Map<number, number>();
  for (const [planIndex, runtimeStep] of planSteps.entries()) {
    if (runtimeStep === undefined) continue;
    const runtimeIndex = visibleRuntime.indexOf(runtimeStep);
    if (runtimeIndex >= 0) planIndexByRuntimeIndex.set(runtimeIndex, planIndex);
  }

  // Authored order is the stable display order. Parallel replies may settle in any journal order;
  // using that order for the card made completed asks appear before still-rendered research rows.
  const rows: T3TeamWorkflowShapeProgressRow[] = plan.map((planStep, planIndex) => ({
    planStep,
    ...(planSteps[planIndex] ? { runtimeStep: planSteps[planIndex] } : {}),
  }));
  const insertedByAnchor = new Map<number, number>();
  for (const [runtimeIndex, runtimeStep] of visibleRuntime.entries()) {
    if (planIndexByRuntimeIndex.has(runtimeIndex)) continue;
    // The phase an unmatched (dynamic) runtime step is bucketed under is the AUTHORED phase of
    // the nearest prior matched plan step, not the workflow's actual current phase at the time
    // this step ran — `T3TeamWorkflowStepEntry.phase` is a lifecycle phase (started/completed/…),
    // there is no "current workflow phase" field on the runtime activity to bucket by instead.
    // A long dynamic run (many agent calls with no per-call plan row) can therefore anchor to
    // whichever plan step matched last, even if the run has since moved through later phases.
    // Left as-is per the no-invented-data rule; fixing this needs the server to stamp the
    // workflow's phase onto each step activity.
    const priorMatches = [...planIndexByRuntimeIndex.entries()].filter(
      ([matchedRuntimeIndex]) => matchedRuntimeIndex < runtimeIndex,
    );
    const anchorPlanIndex = priorMatches.toSorted(([left], [right]) => right - left)[0]?.[1] ?? -1;
    const priorInsertions = insertedByAnchor.get(anchorPlanIndex) ?? 0;
    const insertionIndex = anchorPlanIndex + 1 + priorInsertions;
    rows.splice(insertionIndex, 0, {
      runtimeStep,
      phase:
        anchorPlanIndex >= 0 ? (plan[anchorPlanIndex]?.phase ?? null) : (plan[0]?.phase ?? null),
    });
    insertedByAnchor.set(anchorPlanIndex, priorInsertions + 1);
  }

  return {
    planSteps,
    rows,
  };
}
