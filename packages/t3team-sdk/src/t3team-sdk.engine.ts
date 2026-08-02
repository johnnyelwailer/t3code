/**
 * T3Code's lifecycle adapter for the reusable Runbook engine.
 *
 * The generic engine owns run identity, metadata, overwrite/resume guards, and input drift.
 * This adapter supplies T3Code's default store, clock, id generator, and workflow body executor.
 */

import * as NodeCrypto from "node:crypto";

import {
  createWorkflowEngine,
  type StartWorkflowOptions as CoreStartWorkflowOptions,
  type SuspendedResult,
  type WorkflowRunResult,
} from "@runbook/core/engine";

import { defaultRunsRoot, FsJournalStore } from "./t3team-sdk.journalStore.ts";
import type * as T from "./t3team-sdk.types.ts";
import { executeWorkflowBody, nowIso } from "./t3team-sdk.workflowRunner.ts";

/** Options shared by {@link startWorkflow} and {@link resumeWorkflow}. */
export type { WorkflowRunOptions } from "./t3team-sdk.types.ts";

/** Options for {@link startWorkflow} — `runId` may be supplied for deterministic tests. */
export type StartWorkflowOptions = CoreStartWorkflowOptions<T.WorkflowRunOptions>;
export type { SuspendedResult, WorkflowRunResult };

const engine = createWorkflowEngine<T.WorkflowRef, T.WorkflowRunOptions>({
  defaultRunsRoot,
  createStore: (runsRoot) => new FsJournalStore(runsRoot),
  newRunId: NodeCrypto.randomUUID,
  nowIso,
  executeBody: executeWorkflowBody,
});

export const startWorkflow = engine.startWorkflow;
export const resumeWorkflow = engine.resumeWorkflow;

// Re-export `createDurableWorkflowRuntime` + the `DurableWorkflowRuntime` interface so
// existing public-API consumers don't need to know about the internal split.
export {
  createDurableWorkflowRuntime,
  type DurableWorkflowRuntime,
} from "./t3team-sdk.durableRuntime.ts";
