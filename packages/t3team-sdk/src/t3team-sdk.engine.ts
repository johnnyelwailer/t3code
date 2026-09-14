// @effect-diagnostics nodeBuiltinImport:off - workflowSourceVersion hashes the source artifact
// synchronously so a resumed run cannot silently execute changed code; making it effectful would
// push Effect into every caller of a pure version stamp.
/**
 * T3Code's lifecycle adapter for the reusable Runbook engine.
 *
 * The generic engine owns run identity, metadata, overwrite/resume guards, and input drift.
 * This adapter supplies T3Code's default store, clock, id generator, and workflow body executor.
 */

import * as NodeCrypto from "node:crypto";
import * as NodeFS from "node:fs";

import { createWorkflowEngine } from "@runbook/core/engine";
import type {
  AbortedResult,
  StartWorkflowOptions as CoreStartWorkflowOptions,
  SuspendedResult,
  WorkflowRunResult,
  WorkflowVersionPolicy,
} from "@runbook/core/engineTypes";

import { defaultRunsRoot, FsJournalStore } from "./t3team-sdk.journalStore.ts";
import type * as T from "./t3team-sdk.types.ts";
import { executeWorkflowBody, nowIso } from "./t3team-sdk.workflowRunner.ts";

/** Options shared by {@link startWorkflow} and {@link resumeWorkflow}. */
export type { WorkflowRunOptions } from "./t3team-sdk.types.ts";
export type { WorkflowVersionPolicy };

/** Options for {@link startWorkflow} — `runId` may be supplied for deterministic tests. */
export type StartWorkflowOptions = CoreStartWorkflowOptions<T.WorkflowRunOptions>;
export type { AbortedResult, SuspendedResult, WorkflowRunResult };

/** Hash the exact source artifact so a resumed run cannot silently use changed workflow code. */
export function workflowSourceVersion(ref: T.WorkflowRef): string {
  return NodeCrypto.createHash("sha256")
    .update(NodeFS.readFileSync(ref.absolutePath))
    .digest("hex");
}

const engine = createWorkflowEngine<T.WorkflowRef, T.WorkflowRunOptions>({
  workflowPath: (ref) => ref.absolutePath,
  defaultRunsRoot,
  createStore: (runsRoot) => new FsJournalStore(runsRoot),
  newRunId: NodeCrypto.randomUUID,
  nowIso,
  workflowVersion: workflowSourceVersion,
  executeBody: executeWorkflowBody,
});

/** Preserve the SDK's ref-linked input/output inference over the generic engine function. */
export async function startWorkflow<I, O>(
  ref: T.WorkflowRef<I, O>,
  args: I,
  options: StartWorkflowOptions = {},
): Promise<WorkflowRunResult<O> | SuspendedResult | AbortedResult> {
  return await engine.startWorkflow<I, O>(ref, args, options);
}

export async function resumeWorkflow<I, O>(
  runId: string,
  ref: T.WorkflowRef<I, O>,
  args: I,
  options: T.WorkflowRunOptions = {},
): Promise<WorkflowRunResult<O> | SuspendedResult | AbortedResult> {
  // T3Team's pre-extraction API resumed the current source at the workflow path. Keep that
  // adapter behavior by default; hosts that want content identity to be a hard gate can opt into
  // the reusable engine's strict policy explicitly.
  return await engine.resumeWorkflow<I, O>(runId, ref, args, {
    ...options,
    workflowVersionPolicy: options.workflowVersionPolicy ?? "allow-change",
  });
}

// Re-export `createDurableWorkflowRuntime` + the `DurableWorkflowRuntime` interface so
// existing public-API consumers don't need to know about the internal split.
export {
  createDurableWorkflowRuntime,
  type DurableWorkflowRuntime,
} from "./t3team-sdk.durableRuntime.ts";
