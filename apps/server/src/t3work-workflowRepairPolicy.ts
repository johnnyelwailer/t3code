import type { ModelSelection } from "@t3tools/contracts";

/** Core-safe repair defaults. Distributions may override through pack activation. */
export type WorkflowRepairPolicy = {
  readonly maxAttempts: number;
  readonly modelSelection: "inherit" | ModelSelection;
  /** Shared wall-clock budget for every repair attempt in one run. */
  readonly totalTimeBudgetMs: number;
};

export const DEFAULT_WORKFLOW_REPAIR_POLICY: WorkflowRepairPolicy = {
  maxAttempts: 3,
  modelSelection: "inherit",
  totalTimeBudgetMs: 900_000,
};

let policy = DEFAULT_WORKFLOW_REPAIR_POLICY;

export const setWorkflowRepairPolicy = (next: Partial<WorkflowRepairPolicy>): void => {
  policy = {
    maxAttempts: next.maxAttempts ?? DEFAULT_WORKFLOW_REPAIR_POLICY.maxAttempts,
    modelSelection: next.modelSelection ?? DEFAULT_WORKFLOW_REPAIR_POLICY.modelSelection,
    totalTimeBudgetMs: next.totalTimeBudgetMs ?? DEFAULT_WORKFLOW_REPAIR_POLICY.totalTimeBudgetMs,
  };
};

export const getWorkflowRepairPolicy = (): WorkflowRepairPolicy => policy;
