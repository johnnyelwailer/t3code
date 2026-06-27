/**
 * ============================================================================
 *  t3work durable-execution engine (Epic 25.2)
 * ============================================================================
 *
 * Gives `.workflow.ts` files replay semantics. A workflow body is plain async TS that
 * calls typed primitives (`tools.*`, `scripts.*`). The engine journals every primitive
 * call and, on resume, re-runs the body from the top — returning recorded results for
 * calls it has already seen and only executing live past the recorded frontier.
 *
 * The journal format (`{ seq, callId, kind, refId, argsHash, result?, startedAt,
 * endedAt }`), the `callId = "<seq>:<kind>:<refId>"` strategy, and the replay rules
 * (hit/miss/gap-drift) are documented in detail in the engine module header that lived
 * here before the 25.2 fix-pass split this file into a slim entry point + the
 * `t3work-sdk.durableRuntime.ts` and `t3work-sdk.workflowRunner.ts` modules.
 *
 * ── Sandbox ─────────────────────────────────────────────────────────────────
 * Stage-1 has **no sandbox**. The body runs in a `node:vm` context with deterministic
 * `Date`/`Math.random`/`crypto.randomUUID` bound — each call is journaled, so replays
 * return the recorded value — but the host realm is reachable via prototype chains. Trust
 * model: "trusted project code." Stage-2 VM isolation (planned: SES or isolated-vm) is the
 * real sandbox if/when untrusted workflows are in scope (Epic 25 §Open question 1). See
 * t3work-sdk.loader.ts.
 * ============================================================================
 */

import { randomUUID } from "node:crypto";

import { hashArgs } from "./t3work-sdk.canonicalJson.ts";
import { WorkflowError, WorkflowRunNotFoundError } from "./t3work-sdk.errors.ts";
import { defaultRunsRoot, FsJournalStore, type JournalStore } from "./t3work-sdk.journalStore.ts";
import type * as T from "./t3work-sdk.types.ts";
import type { WorkflowRunOptions } from "./t3work-sdk.types.ts";
import {
  assertInputArgsMatch,
  executeRun,
  nowIso,
  type RunOutcome,
} from "./t3work-sdk.workflowRunner.ts";

/** Options shared by {@link startWorkflow} and {@link resumeWorkflow}. */
export type { WorkflowRunOptions } from "./t3work-sdk.types.ts";

/** Options for {@link startWorkflow} — `runId` may be supplied for deterministic tests. */
export interface StartWorkflowOptions extends WorkflowRunOptions {
  readonly runId?: string;
  /**
   * Truncate any pre-existing journal at this `runId` and start fresh. Without it,
   * `startWorkflow` refuses a `runId` that already has journaled entries (use
   * {@link resumeWorkflow} to continue one).
   */
  readonly overwrite?: boolean;
}

export interface WorkflowRunResult<O> {
  readonly runId: string;
  readonly result: O;
}

/**
 * Returned (instead of {@link WorkflowRunResult}) when a run durably suspends awaiting a
 * Handle reply (Epic 25.4). The host parks the run, and when the reply for `correlationId`
 * lands it appends a `resolved` journal entry (see `appendResolvedEntry`) and calls
 * {@link resumeWorkflow}, which replays to the same `await` and continues. Narrow the union
 * with `"suspended" in result`.
 */
export interface SuspendedResult {
  readonly runId: string;
  readonly suspended: true;
  readonly correlationId: string;
}

function toRunResult<O>(
  runId: string,
  outcome: RunOutcome<O>,
): WorkflowRunResult<O> | SuspendedResult {
  return outcome.kind === "suspended"
    ? { runId, suspended: true, correlationId: outcome.correlationId }
    : { runId, result: outcome.output };
}

// Resolve the journal storage for a run: the injected {@link JournalStore} if the host wired
// one (e.g. the server's SQLite-backed store), else the default fs store rooted at `runsRoot`.
function resolveStore(options: WorkflowRunOptions, runsRoot: string): JournalStore {
  return options.store ?? new FsJournalStore(runsRoot);
}

/**
 * Run a workflow from scratch: record the run inputs, then execute the body, journaling every
 * primitive call through the {@link JournalStore}. Refuses a `runId` that already has a
 * non-empty journal (pass `overwrite: true` to truncate and restart, or use
 * {@link resumeWorkflow} to continue). Returns the `runId` and the validated result.
 */
export async function startWorkflow<I, O>(
  ref: T.WorkflowRef<I, O>,
  args: I,
  options: StartWorkflowOptions = {},
): Promise<WorkflowRunResult<O> | SuspendedResult> {
  const runsRoot = options.runsRoot ?? defaultRunsRoot();
  const store = resolveStore(options, runsRoot);
  const runId = options.runId ?? randomUUID();

  const existing = await store.readEntries(runId);
  if (existing.bySeq.size > 0) {
    if (options.overwrite !== true) {
      throw new WorkflowError(
        `Cannot start workflow with runId '${runId}': a journal already exists at '${store.locator(runId)}' with ${existing.bySeq.size} entr${existing.bySeq.size === 1 ? "y" : "ies"}. Use resumeWorkflow to continue it, pass { overwrite: true } to truncate and restart, or pick a different runId.`,
      );
    }
    await store.clear(runId);
  }

  await store.writeRunMeta(runId, {
    workflowPath: ref.absolutePath,
    argsHash: hashArgs(args),
    createdAt: nowIso(),
  });

  const outcome = await executeRun<O>({ runId, ref, args, runsRoot, store, options });
  return toRunResult(runId, outcome);
}

/**
 * Resume an existing run: replay the body against the {@link JournalStore}'s recorded journal,
 * returning recorded results for journaled calls and executing fresh past the recorded
 * frontier. Throws {@link WorkflowRunNotFoundError} if no journal exists for `runId`, and
 * {@link ReplayDriftError} if the supplied args or the body diverge from the recorded run.
 */
export async function resumeWorkflow<I, O>(
  runId: string,
  ref: T.WorkflowRef<I, O>,
  args: I,
  options: WorkflowRunOptions = {},
): Promise<WorkflowRunResult<O> | SuspendedResult> {
  const runsRoot = options.runsRoot ?? defaultRunsRoot();
  const store = resolveStore(options, runsRoot);
  if (!(await store.hasRun(runId))) throw new WorkflowRunNotFoundError(store.locator(runId));
  const meta = await store.readRunMeta(runId);
  assertInputArgsMatch({ meta, args, absolutePath: ref.absolutePath });
  const outcome = await executeRun<O>({ runId, ref, args, runsRoot, store, options });
  return toRunResult(runId, outcome);
}

// Re-export `createDurableWorkflowRuntime` + the `DurableWorkflowRuntime` interface so
// existing public-API consumers don't need to know about the internal split.
export {
  createDurableWorkflowRuntime,
  type DurableWorkflowRuntime,
} from "./t3work-sdk.durableRuntime.ts";
