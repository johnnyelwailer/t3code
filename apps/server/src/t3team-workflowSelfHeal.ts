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
  validateRepairedWorkflowArgs,
  validateRepairedWorkflowSource,
  canAttemptWorkflowRepair,
  workflowRepairTargetFor,
  type WorkflowArgsRepairValidation,
  type WorkflowRepairIntent,
  type WorkflowRepairAudit,
  type WorkflowRepairTarget,
} from "./t3team-workflowRepairGuardrails.ts";

export type WorkflowRepairPhase = "analysing" | "repairing" | "resuming" | "recovered" | "failed";

export type GenerateWorkflowRepair = (input: {
  readonly source: string;
  readonly failure: string;
  readonly intent: WorkflowRepairIntent;
  readonly args: unknown;
  readonly workspaceRoot: string;
  /** Which artifact this attempt must correct — decided by the coordinator from the failure's
   * type, never guessed by the generator. */
  readonly target: WorkflowRepairTarget;
}) => Promise<
  | { readonly kind: "sourceReplacement"; readonly source: string; readonly summary?: string }
  | { readonly kind: "argsReplacement"; readonly args: unknown; readonly summary?: string }
  | { readonly kind: "cannotRepair"; readonly reason?: string }
>;

/**
 * Effect boundary owned by the launch host. `replaceSource` must overwrite the
 * SAME ephemeral workflow.ts; `replaceArgs` must correct the SAME run's persisted launch args
 * (and the journal's args baseline — see the launch host); `retrySameRun` must reuse the same
 * run/card.
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
  readonly validateArgs?: (args: unknown, originalSource: string) => WorkflowArgsRepairValidation;
  readonly replaceArgs: (args: unknown) => Promise<void>;
  /** Resume the same run from its stable journal checkpoint; never starts a new card/run. */
  readonly resumeWorkflowAfterRepair: () => Promise<boolean>;
  readonly recordAudit: (audit: WorkflowRepairAudit) => Promise<void>;
  readonly activity: (phase: WorkflowRepairPhase, detail?: string) => Promise<void>;
};

export type WorkflowRepairCoordinatorResult =
  | { readonly kind: "not-attempted" }
  | { readonly kind: "recovered"; readonly repairAttempts: 1 }
  | {
      readonly kind: "failed";
      readonly repairAttempts: 1;
      readonly reason: string;
      /** `false` when the provider explicitly refused (cannotRepair) — further attempts would
       * see the same source/args and the same reasoning, so the loop should stop instead of
       * spending the rest of its attempt budget for no expected benefit. */
      readonly retryable: boolean;
    };

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
  // Typed, not a message heuristic: decides whether this attempt corrects ARGS or SOURCE.
  const target = workflowRepairTargetFor(input.failure);
  await input.activity("analysing");
  const generated = await input.generateRepair({
    source: input.source,
    failure,
    intent: input.intent,
    args: input.args,
    workspaceRoot: input.workspaceRoot,
    target,
  });
  if (generated.kind === "cannotRepair") {
    const reason = generated.reason ?? "Provider cannot repair this workflow.";
    await input.recordAudit({ originalSource: input.source, failure, outcome: "failed", reason });
    await input.activity("failed", reason);
    // Not retryable: the provider explicitly refused this same source/args/reasoning, so
    // spending the rest of the attempt budget on identical input cannot change the answer.
    return { kind: "failed", repairAttempts: 1, reason, retryable: false };
  }
  await input.activity("repairing");

  // Shared tail: swap in the corrected artifact, resume the SAME run, and audit the outcome.
  // `replacementSource` is included in the audit only for a source correction (mirrors the
  // pre-existing behavior — corrected args are already the observable outcome in the run row).
  const finish = async (
    summary: string | undefined,
    replacementSource?: string,
  ): Promise<WorkflowRepairCoordinatorResult> => {
    await input.activity("resuming");
    if (await input.resumeWorkflowAfterRepair()) {
      await input.recordAudit({
        originalSource: input.source,
        failure,
        outcome: "recovered",
        ...(replacementSource === undefined ? {} : { replacementSource }),
        ...(summary === undefined ? {} : { summary }),
      });
      await input.activity("recovered");
      return { kind: "recovered", repairAttempts: 1 };
    }
    const reason = "Repaired workflow could not resume from its stable checkpoint.";
    await input.recordAudit({
      originalSource: input.source,
      failure,
      outcome: "failed",
      reason,
      ...(replacementSource === undefined ? {} : { replacementSource }),
      ...(summary === undefined ? {} : { summary }),
    });
    await input.activity("failed", reason);
    // Retryable: a different generated replacement, or a transient resume failure, could
    // still succeed on the next attempt.
    return { kind: "failed", repairAttempts: 1, reason, retryable: true };
  };

  if (generated.kind === "argsReplacement") {
    const validated = (input.validateArgs ?? ((value) => validateRepairedWorkflowArgs(value)))(
      generated.args,
      input.source,
    );
    if (!validated.ok) {
      const reason = "Provider returned invalid workflow args.";
      await input.recordAudit({ originalSource: input.source, failure, outcome: "failed", reason });
      await input.activity("failed", reason);
      return { kind: "failed", repairAttempts: 1, reason, retryable: true };
    }
    await input.replaceArgs(validated.args);
    return finish(generated.summary);
  }

  const source = (input.validateSource ?? ((value) => validateRepairedWorkflowSource(value)))(
    generated.source,
    input.source,
  );
  if (source === null) {
    const reason = "Provider returned invalid workflow source.";
    await input.recordAudit({ originalSource: input.source, failure, outcome: "failed", reason });
    await input.activity("failed", reason);
    return { kind: "failed", repairAttempts: 1, reason, retryable: true };
  }
  await input.replaceSource(source);
  return finish(generated.summary, source);
};
