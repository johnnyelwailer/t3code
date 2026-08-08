/**
 * Bounded repair policy for an agent-authored ephemeral workflow.
 *
 * This module intentionally has no provider or thread dependency. The launch
 * funnel owns those effects; keeping the policy pure makes it impossible for a
 * repair attempt to accidentally create a second conversation or widen access.
 */

// Moved to the guardrails module; re-exported so existing importers keep resolving.
export * from "./t3team-workflowRepairGuardrails.ts";
import {
  T3TEAM_WORKFLOW_REPAIR_LIMIT,
  T3TEAM_WORKFLOW_REPAIR_HARD_LIMIT,
  parseWorkflowRepairChildResult,
  isRepairableWorkflowFailure,
  validateRepairedWorkflowSource,
  canAttemptWorkflowRepair,
  type WorkflowRepairIntent,
  type WorkflowRepairAudit,
  type WorkflowRepairChildResult,
} from "./t3team-workflowRepairGuardrails.ts";

export type WorkflowRepairPhase = "analysing" | "repairing" | "resuming" | "recovered" | "failed";

export type GenerateWorkflowRepair = (input: {
  readonly source: string;
  readonly failure: string;
  readonly intent: WorkflowRepairIntent;
  readonly args: unknown;
  readonly workspaceRoot: string;
}) => Promise<
  | { readonly kind: "replacement"; readonly source: string; readonly summary?: string }
  | { readonly kind: "cannotRepair"; readonly reason?: string }
>;

/**
 * Effect boundary owned by the launch host. `replaceSource` must overwrite the
 * SAME ephemeral workflow.ts; `retrySameRun` must reuse the same run/card.
 */
export type WorkflowRepairCoordinatorInput = {
  readonly origin: "recipe" | "ephemeral";
  readonly repairAttempts: number;
  readonly maxAttempts?: number;
  readonly source: string;
  readonly failure: unknown;
  readonly intent: WorkflowRepairIntent | undefined;
  readonly args: unknown;
  readonly workspaceRoot: string;
  readonly generateRepair: GenerateWorkflowRepair;
  readonly validateSource?: (source: unknown, originalSource: string) => string | null;
  readonly replaceSource: (source: string) => Promise<void>;
  /** Resume the same run from its stable journal checkpoint; never starts a new card/run. */
  readonly resumeWorkflowAfterRepair: () => Promise<boolean>;
  readonly recordAudit: (audit: WorkflowRepairAudit) => Promise<void>;
  readonly activity: (phase: WorkflowRepairPhase, detail?: string) => Promise<void>;
};

export type WorkflowRepairCoordinatorResult =
  | { readonly kind: "not-attempted" }
  | { readonly kind: "recovered"; readonly repairAttempts: 1 }
  | { readonly kind: "failed"; readonly repairAttempts: 1; readonly reason: string };

/** Run one hidden repair. It has no thread/run id input, so it cannot create a card or sidebar item. */
export const coordinateWorkflowRepair = async (
  input: WorkflowRepairCoordinatorInput,
): Promise<WorkflowRepairCoordinatorResult> => {
  if (
    input.intent === undefined ||
    !canAttemptWorkflowRepair({
      origin: input.origin,
      repairAttempts: input.repairAttempts,
      ...(input.maxAttempts === undefined ? {} : { maxAttempts: input.maxAttempts }),
      error: input.failure,
    })
  )
    return { kind: "not-attempted" };
  const failure = input.failure instanceof Error ? input.failure.message : String(input.failure);
  await input.activity("analysing");
  const generated = await input.generateRepair({
    source: input.source,
    failure,
    intent: input.intent,
    args: input.args,
    workspaceRoot: input.workspaceRoot,
  });
  if (generated.kind === "cannotRepair") {
    const reason = generated.reason ?? "Provider cannot repair this workflow.";
    await input.recordAudit({ originalSource: input.source, failure, outcome: "failed", reason });
    await input.activity("failed", reason);
    return { kind: "failed", repairAttempts: 1, reason };
  }
  await input.activity("repairing");
  const source = (input.validateSource ?? ((value) => validateRepairedWorkflowSource(value)))(
    generated.source,
    input.source,
  );
  if (source === null) {
    const reason = "Provider returned invalid workflow source.";
    await input.recordAudit({ originalSource: input.source, failure, outcome: "failed", reason });
    await input.activity("failed", reason);
    return { kind: "failed", repairAttempts: 1, reason };
  }
  await input.replaceSource(source);
  await input.activity("resuming");
  if (await input.resumeWorkflowAfterRepair()) {
    await input.recordAudit({
      originalSource: input.source,
      failure,
      replacementSource: source,
      outcome: "recovered",
      ...(generated.summary === undefined ? {} : { summary: generated.summary }),
    });
    await input.activity("recovered");
    return { kind: "recovered", repairAttempts: 1 };
  }
  const reason = "Repaired workflow could not resume from its stable checkpoint.";
  await input.recordAudit({
    originalSource: input.source,
    failure,
    replacementSource: source,
    outcome: "failed",
    reason,
    ...(generated.summary === undefined ? {} : { summary: generated.summary }),
  });
  await input.activity("failed", reason);
  return { kind: "failed", repairAttempts: 1, reason };
};
