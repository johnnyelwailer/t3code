/**
 * Terminal settlement shared by `startWorkflow` and `resumeWorkflow` (engine.ts).
 *
 * When a run's body settles — completed, suspended, aborted, or thrown — the engine (a) writes
 * the terminal marker into the run metadata where the outcome is terminal, and (b) emits the
 * matching lifecycle event. Keeping this in one module means both entry points settle
 * identically, and the engine file stays focused on start/resume guards.
 */

import { WorkflowAborted, WorkflowError } from "./errors.ts";
import { emitSafe, type WorkflowEventSink } from "./events.ts";
import type { JournalStore } from "./journalStore.ts";
import type { RunOutcome } from "./runEngine.ts";
import type { WorkflowResult } from "./engineTypes.ts";

/** Map a settled outcome to the public result shape (suspended / aborted / completed). */
export function toRunResult<O>(runId: string, outcome: RunOutcome): WorkflowResult<O> {
  if (outcome.kind === "suspended") {
    return { runId, suspended: true, correlationId: outcome.correlationId };
  }
  if (outcome.kind === "aborted") return { runId, aborted: true };
  return { runId, result: outcome.output as O };
}

export interface SettleContext {
  readonly store: JournalStore;
  readonly runId: string;
  readonly nowIso: () => string;
  readonly events?: WorkflowEventSink;
}

export type TerminalKind = "completed" | "failed" | "aborted";

/**
 * Stamp the terminal marker onto the run metadata (read-modify-write). Both engine paths write
 * the run metadata before settling, so a missing record means the store was bypassed or
 * corrupted — refuse to fabricate one.
 */
export async function writeTerminalMeta(ctx: SettleContext, terminal: TerminalKind): Promise<void> {
  const meta = await ctx.store.readRunMeta(ctx.runId);
  if (meta === undefined) {
    throw new WorkflowError(`Cannot settle run '${ctx.runId}': no run metadata found.`);
  }
  await ctx.store.writeRunMeta(ctx.runId, {
    ...meta,
    terminal,
    terminalAt: ctx.nowIso(),
  });
}

/** Settle a returned outcome: terminal outcomes get a marker; suspension only emits. */
export async function settleRun(ctx: SettleContext, outcome: RunOutcome): Promise<void> {
  if (outcome.kind === "suspended") {
    emitSafe(ctx.events, {
      type: "run.suspended",
      runId: ctx.runId,
      correlationId: outcome.correlationId,
      at: ctx.nowIso(),
    });
    return;
  }
  const terminal: TerminalKind = outcome.kind === "completed" ? "completed" : "aborted";
  await writeTerminalMeta(ctx, terminal);
  emitSafe(ctx.events, {
    type: outcome.kind === "completed" ? "run.completed" : "run.aborted",
    runId: ctx.runId,
    at: ctx.nowIso(),
  });
}

/** Settle a thrown body error: mark the run failed, emit, and re-throw for the caller. */
export async function settleRunFailed(ctx: SettleContext, error: unknown): Promise<never> {
  if (error instanceof WorkflowAborted) {
    await settleRun(ctx, { kind: "aborted" });
    throw error;
  }
  await writeTerminalMeta(ctx, "failed");
  emitSafe(ctx.events, {
    type: "run.failed",
    runId: ctx.runId,
    error: error instanceof Error ? error.message : String(error),
    at: ctx.nowIso(),
  });
  throw error;
}
