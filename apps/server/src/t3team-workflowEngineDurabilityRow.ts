/**
 * The initial `running` row a workflow launch records (Epic 25 §Open question 2). Split out of
 * `t3team-workflowEngineDurability.ts` — which owns the Promise↔Effect lifecycle adapter — to keep
 * that module under the prefixed-file LOC ceiling; re-exported from there so existing importers
 * (launch, rehydration, the ephemeral tool, tests) keep their import path.
 */

import {
  type ModelSelection,
  type ProjectId,
  type ProviderInteractionMode,
  type RuntimeMode,
} from "@t3tools/contracts";
import { hashArgs } from "@t3team/sdk";

import type { WorkflowRun } from "./persistence/Services/WorkflowRuns.ts";

export interface BuildRunningRowInput {
  readonly runId: string;
  readonly workflowPath: string;
  readonly args: unknown;
  readonly launchThreadId: string | undefined;
  readonly projectId: ProjectId;
  readonly modelSelection: ModelSelection;
  readonly runtimeMode: RuntimeMode;
  readonly interactionMode: ProviderInteractionMode;
  /** Launch origin; defaults to `recipe` (the ephemeral tool path passes `ephemeral`). */
  readonly origin?: WorkflowRun["origin"];
  /** The launching recipe's directory (recipe launches with scripts); rehydration re-resolves
   * the recipe's private `scripts.*` tree from it. Absent → NULL. */
  readonly recipePath?: string | undefined;
  /** The host-tool bridge this launch grants (migration 047). Absent → NULL, and rehydration
   * will NOT hand the restored run one. */
  readonly hostToolGrant?: WorkflowRun["hostToolGrant"];
  readonly nowIso: string;
}

/** The initial `running` row recorded when a workflow launches. */
export function buildRunningWorkflowRunRow(input: BuildRunningRowInput): WorkflowRun {
  return {
    runId: input.runId,
    workflowPath: input.workflowPath,
    args: input.args,
    argsHash: hashArgs(input.args),
    launchThreadId: input.launchThreadId ?? null,
    projectId: input.projectId,
    modelSelection: input.modelSelection,
    runtimeMode: input.runtimeMode,
    interactionMode: input.interactionMode,
    status: "running",
    origin: input.origin ?? "recipe",
    recipePath: input.recipePath ?? null,
    hostToolGrant: input.hostToolGrant ?? null,
    pendingThreadId: null,
    pendingCorrelationId: null,
    pendingKind: null,
    wakeAt: null,
    createdAt: input.nowIso,
    updatedAt: input.nowIso,
  };
}
