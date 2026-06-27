/**
 * The durable runtime — a {@link T.WorkflowRuntime} backed by a per-run journal.
 *
 * Every primitive call lands on a monotonically-increasing `seq`, matched against the
 * journal on replay. Three seats share that counter and journal: the async `callPrimitive`
 * (tools/scripts/agent/wait/composition), the synchronous `callDeterministic`
 * (now/random/uuid), and the Handle-pattern `handles` dispatch (25.4 sent/resolved). The
 * first two decide between: hit+match → return the recorded result; hit+mismatch →
 * {@link ReplayDriftError}; gap (seq ≤ frontier, no entry) → drift; miss (past the
 * frontier) → execute live + journal. A matched `script-never` marker always re-executes.
 *
 * Two black-box mechanisms skip the journal: a tool/script *handler* runs under the
 * `blackBox` runtime, and `parallel`/`pipeline`/`workflow` run their thunks inside
 * {@link runBlackBoxed}, which lifts a depth counter so nested calls execute live without
 * consuming a `seq` (the composition primitive is the journal boundary — a Stage-1 tradeoff).
 */

import { createHandleDispatch, type HandleDispatch } from "./t3work-sdk.handles.ts";
import type { JournalSink } from "./t3work-sdk.journalStore.ts";
import type { JournalEntry, ResolvedEntry } from "./t3work-sdk.journalReader.ts";
import {
  createDurableCallDeterministic,
  createDurableCallPrimitive,
} from "./t3work-sdk.durableRuntimePrimitive.ts";
import { createToolScriptCalls } from "./t3work-sdk.toolScriptCalls.ts";
import type * as T from "./t3work-sdk.types.ts";
import { hostSource } from "./t3work-sdk.workflowGlobals.ts";

/** Options for the durable runtime config. */
export interface DurableRuntimeConfig {
  readonly journal: ReadonlyMap<number, JournalEntry>;
  readonly writer: JournalSink;
  readonly toolCtx: T.ToolHandlerCtx;
  readonly scriptCtx: T.ScriptHandlerCtx;
  readonly scriptNames: ReadonlyMap<T.AnyScriptRef, string>;
  /** Absolute path of the `.workflow.ts`, threaded into drift errors. */
  readonly filePath?: string;
  /** Host clock for journal timestamps (injected so workflowRunner can share it). */
  readonly nowIso: () => string;
  /** Run id — the `correlationId` prefix for Handle primitives (`"<runId>:<seq>"`). */
  readonly runId?: string;
  /** Resolved Handle replies read from the journal, keyed by correlationId (25.4). */
  readonly resolved?: ReadonlyMap<string, ResolvedEntry>;
}

/** A {@link T.WorkflowRuntime} backed by a per-run journal with replay + drift detection. */
export interface DurableWorkflowRuntime extends T.WorkflowRuntime {
  /** The last `seq` assigned (i.e. the count of primitive calls dispatched so far). */
  readonly currentSeq: () => number;
  /** Run `fn` with the black-box depth lifted — its primitive calls execute live and are
   * not journaled. Backs `parallel`/`pipeline`/`workflow`. */
  readonly runBlackBoxed: <R>(fn: () => Promise<R>) => Promise<R>;
  /** Tokens spent so far — backs `budget.spent()`. Thread-turn token rollup is deferred
   * (Epic 25 §Out of scope), so this is currently always 0. */
  readonly spentAgentTokens: () => number;
  /** Real host wall-clock (unjournaled) — backs `wait`'s deadline math. */
  readonly hostNow: () => number;
  /** Handle-pattern dispatch (sent/resolved/suspend) sharing this runtime's `seq` seat. */
  readonly handles: HandleDispatch;
}

/**
 * Construct a durable runtime over an already-loaded journal. Public so a host can drive
 * replay directly; {@link startWorkflow} / {@link resumeWorkflow} are the usual entry points.
 */
export function createDurableWorkflowRuntime(config: DurableRuntimeConfig): DurableWorkflowRuntime {
  let seq = 0;
  let blackBoxDepth = 0;
  // The recorded frontier. A call at `seq <= maxRecordedSeq` with no journal entry is a
  // *gap* — drift, not a live execution. Calls past it run live.
  const maxRecordedSeq =
    config.journal.size === 0 ? 0 : Math.max(...Array.from(config.journal.keys()));

  // Resolved Handle replies (25.4), keyed by correlationId. Mutable so a broker that settles
  // synchronously during this run is visible to a later `await handle.response`.
  const resolved = new Map<string, ResolvedEntry>(config.resolved ?? []);

  // Real host wall-clock/entropy — journaled by the live path, returned raw by the black box.
  const host = hostSource();

  // Token rollup across thread turns is deferred (Epic 25 §Out of scope): agent verbs now run
  // as `thread.turn` Handle primitives whose resolved reply carries no token count, so the
  // `budget` accumulator reads 0 for this phase.
  const spentAgentTokens = 0;

  // Handlers are black boxes — a tool/script that calls another tool must NOT journal.
  const blackBox: T.WorkflowRuntime = {
    callTool: (ref, args) => toolScript.callTool(ref, args),
    callScript: (ref, args) => toolScript.callScript(ref, args),
    callPrimitive: (call) => call.exec(),
    now: host.now,
    random: host.random,
    uuid: host.uuid,
  };

  const runBlackBoxed = async <R>(fn: () => Promise<R>): Promise<R> => {
    blackBoxDepth += 1;
    try {
      return await fn();
    } finally {
      blackBoxDepth -= 1;
    }
  };

  const primitiveSeat = {
    journal: config.journal,
    writer: config.writer,
    filePath: config.filePath,
    nowIso: config.nowIso,
    maxRecordedSeq,
    isBlackBoxed: () => blackBoxDepth > 0,
    takeSeq: () => (seq += 1),
  };
  const callPrimitive = createDurableCallPrimitive(primitiveSeat);
  const callDeterministic = createDurableCallDeterministic(primitiveSeat);

  const now = (): number => callDeterministic("now", host.now);
  const random = (): number => callDeterministic("random", host.random);
  const uuid = (): string => callDeterministic("uuid", host.uuid);

  const toolScript = createToolScriptCalls({
    callPrimitive,
    blackBox,
    toolCtx: config.toolCtx,
    scriptCtx: config.scriptCtx,
    scriptNames: config.scriptNames,
  });

  // Handle-pattern dispatch shares this runtime's `seq` seat, so a sent entry's seq — and
  // thus its correlationId — interleaves deterministically with the other primitive calls.
  const handles = createHandleDispatch({
    runId: config.runId ?? "run",
    filePath: config.filePath,
    nowIso: config.nowIso,
    isBlackBoxed: () => blackBoxDepth > 0,
    takeSeq: () => (seq += 1),
    maxRecordedSeq,
    recordedAt: (atSeq) => config.journal.get(atSeq),
    resolvedFor: (cid) => resolved.get(cid),
    writer: config.writer,
    setResolved: (entry) => resolved.set(entry.correlationId, entry),
  });

  return {
    callTool: toolScript.callTool,
    callScript: toolScript.callScript,
    callPrimitive,
    now,
    random,
    uuid,
    currentSeq: () => seq,
    runBlackBoxed,
    spentAgentTokens: () => spentAgentTokens,
    hostNow: host.now,
    handles,
  };
}
