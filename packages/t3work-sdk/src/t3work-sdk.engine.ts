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
import { createRequire } from "node:module";
import { cwd } from "node:process";

import { hashArgs } from "./t3work-sdk.canonicalJson.ts";
import {
  WorkflowError,
  WorkflowRunNotFoundError,
} from "./t3work-sdk.errors.ts";
import {
  ensureRunDir,
  journalExists,
  journalFilePath,
  truncateRun,
  writeRunMeta,
  runMetaFilePath,
} from "./t3work-sdk.journal.ts";
import { readJournal } from "./t3work-sdk.journalReader.ts";
import type * as T from "./t3work-sdk.types.ts";
import type { WorkflowRunOptions } from "./t3work-sdk.types.ts";
import { assertInputArgsMatch, executeRun, nowIso } from "./t3work-sdk.workflowRunner.ts";

const nodeRequire = createRequire(import.meta.url);
const path = nodeRequire("node:path") as {
  readonly join: (...parts: ReadonlyArray<string>) => string;
};

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

// Dotted so per-run state stays out of project tree listings (and is easy to .gitignore).
// Spec doc 25 §Open question 2 leaves the long-term home open (SQL-backed local cache);
// `.t3work-runs/<run-id>/journal.jsonl` is the MVP on-disk shape the spec documents.
function defaultRunsRoot(): string {
  return path.join(cwd(), ".t3work-runs");
}

/**
 * Run a workflow from scratch: create `.t3work-runs/<run-id>/` + an empty journal, then
 * execute the body, journaling every primitive call. Refuses a `runId` that already has
 * a non-empty journal (pass `overwrite: true` to truncate and restart, or use
 * {@link resumeWorkflow} to continue). Returns the `runId` and the validated result.
 */
export async function startWorkflow<I, O>(
  ref: T.WorkflowRef<I, O>,
  args: I,
  options: StartWorkflowOptions = {},
): Promise<WorkflowRunResult<O>> {
  const runsRoot = options.runsRoot ?? defaultRunsRoot();
  const runId = options.runId ?? randomUUID();
  ensureRunDir(runsRoot, runId);

  const journalPath = journalFilePath(runsRoot, runId);
  const existing = readJournal(journalPath);
  if (existing.size > 0) {
    if (options.overwrite !== true) {
      throw new WorkflowError(
        `Cannot start workflow with runId '${runId}': a journal already exists at '${journalPath}' with ${existing.size} entr${existing.size === 1 ? "y" : "ies"}. Use resumeWorkflow to continue it, pass { overwrite: true } to truncate and restart, or pick a different runId.`,
      );
    }
    truncateRun(runsRoot, runId);
  }

  writeRunMeta(runMetaFilePath(runsRoot, runId), {
    workflowPath: ref.absolutePath,
    argsHash: hashArgs(args),
    createdAt: nowIso(),
  });

  const result = await executeRun<O>({ runId, ref, args, runsRoot, options });
  return { runId, result };
}

/**
 * Resume an existing run: replay the body against `.t3work-runs/<runId>/journal.jsonl`,
 * returning recorded results for journaled calls and executing fresh past the recorded
 * frontier. Throws {@link WorkflowRunNotFoundError} if no journal exists for `runId`, and
 * {@link ReplayDriftError} if the supplied args or the body diverge from the recorded run.
 */
export async function resumeWorkflow<I, O>(
  runId: string,
  ref: T.WorkflowRef<I, O>,
  args: I,
  options: WorkflowRunOptions = {},
): Promise<WorkflowRunResult<O>> {
  const runsRoot = options.runsRoot ?? defaultRunsRoot();
  const journalPath = journalFilePath(runsRoot, runId);
  if (!journalExists(journalPath)) throw new WorkflowRunNotFoundError(journalPath);
  assertInputArgsMatch({ runsRoot, runId, args, absolutePath: ref.absolutePath });
  const result = await executeRun<O>({ runId, ref, args, runsRoot, options });
  return { runId, result };
}

// Re-export `createDurableWorkflowRuntime` + the `DurableWorkflowRuntime` interface so
// existing public-API consumers don't need to know about the internal split.
export {
  createDurableWorkflowRuntime,
  type DurableWorkflowRuntime,
} from "./t3work-sdk.durableRuntime.ts";
