/**
 * Bounded repair policy for an agent-authored ephemeral workflow.
 *
 * This module intentionally has no provider or thread dependency. The launch
 * funnel owns those effects; keeping the policy pure makes it impossible for a
 * repair attempt to accidentally create a second conversation or widen access.
 */

export const T3TEAM_WORKFLOW_REPAIR_LIMIT = 3;
export const T3TEAM_WORKFLOW_REPAIR_HARD_LIMIT = 5;

export type WorkflowRepairIntent = {
  readonly goal: string;
  readonly expectedOutcome: string;
  readonly guardrails: readonly string[];
};

export type WorkflowRepairAudit = {
  readonly originalSource: string;
  readonly failure: string;
  readonly outcome: "recovered" | "failed";
  readonly replacementSource?: string;
  readonly summary?: string;
  readonly reason?: string;
};

export type WorkflowRepairChildResult =
  | { readonly outcome: "fixed"; readonly updatedSource: string; readonly summary: string }
  | { readonly outcome: "cannot-fix"; readonly reason: string };

/** Strict child protocol: only the discriminated fields cross from agent text into host writes. */
export const parseWorkflowRepairChildResult = (
  value: unknown,
): WorkflowRepairChildResult | null => {
  if (typeof value !== "string") return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    // Current protocol. `safeToResume` is an explicit host gate: a model must never cause a
    // same-run resume merely by returning source-shaped text. `correctedWorkflow` is the full
    // replacement (not a patch), so the atomic writer has one unambiguous target.
    if (record.safeToResume === true) {
      if (
        Object.keys(record).length !== 3 ||
        typeof record.correctedWorkflow !== "string" ||
        typeof record.summary !== "string" ||
        !record.correctedWorkflow.trim() ||
        !record.summary.trim()
      )
        return null;
      return { outcome: "fixed", updatedSource: record.correctedWorkflow, summary: record.summary };
    }
    if (record.safeToResume === false) {
      if (
        Object.keys(record).length !== 2 ||
        typeof record.cancelReason !== "string" ||
        !record.cancelReason.trim()
      )
        return null;
      return { outcome: "cannot-fix", reason: record.cancelReason };
    }
    // Compatibility for already-running repair children. New children receive the protocol above.
    if (record.outcome === "fixed") {
      if (
        Object.keys(record).length !== 3 ||
        typeof record.updatedSource !== "string" ||
        typeof record.summary !== "string"
      )
        return null;
      if (!record.updatedSource.trim() || !record.summary.trim()) return null;
      return { outcome: "fixed", updatedSource: record.updatedSource, summary: record.summary };
    }
    if (record.outcome === "cannot-fix") {
      if (
        Object.keys(record).length !== 2 ||
        typeof record.reason !== "string" ||
        !record.reason.trim()
      )
        return null;
      return { outcome: "cannot-fix", reason: record.reason };
    }
    return null;
  } catch {
    return null;
  }
};

const unsafeFailure =
  /\b(?:cancel(?:led|ed|ation)?|abort(?:ed|ing)?|auth(?:entication|orization)?|unauthori[sz]ed|forbidden|policy|capabilit(?:y|ies)|permission|approval|user[ _-]?input)\b/i;

/** Only compiler/runtime defects can be repaired. Human, auth, and policy failures must surface. */
export const isRepairableWorkflowFailure = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  return message.trim().length > 0 && !unsafeFailure.test(message);
};

/** Reject empty and script-like provider output before it can overwrite the durable source. */
export const validateRepairedWorkflowSource = (source: unknown): string | null => {
  if (typeof source !== "string") return null;
  const trimmed = source.trim();
  if (!trimmed || trimmed.length > 200_000) return null;
  // Workflow bodies must use the SDK workflow primitives. This is deliberately
  // conservative: a bad repair leaves the audited original source intact.
  if (!/\b(?:agent|thread|workflow)\s*\./.test(trimmed)) return null;
  return source;
};

export const canAttemptWorkflowRepair = (input: {
  readonly origin: "recipe" | "ephemeral";
  readonly repairAttempts: number;
  readonly maxAttempts?: number;
  readonly error: unknown;
}): boolean =>
  input.origin === "ephemeral" &&
  input.repairAttempts <
    Math.max(
      0,
      Math.min(
        T3TEAM_WORKFLOW_REPAIR_HARD_LIMIT,
        input.maxAttempts ?? T3TEAM_WORKFLOW_REPAIR_LIMIT,
      ),
    ) &&
  isRepairableWorkflowFailure(input.error);

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
