/**
 * Terminal settlement shared by `startWorkflow` and `resumeWorkflow` (engine.ts).
 *
 * When a run's body settles — completed, suspended, aborted, or thrown — the engine (a) writes
 * the terminal marker into the run metadata where the outcome is terminal, and (b) emits the
 * matching lifecycle event. Keeping this in one module means both entry points settle
 * identically, and the engine file stays focused on start/resume guards.
 */

import { WorkflowAborted } from "./errors.ts";
import type { RunMeta } from "./journal.ts";
import type { JournalStore } from "./journalStore.ts";
import type { RunOutcome } from "./runEngine.ts";
import type { WorkflowEventSink } from "./events.ts";

export interface SettleContext {
  readonly store: JournalStore;
  readonly runId: string;
  readonly nowIso: () => string;
  readonly events?: WorkflowEventSink;
}

export type TerminalKind = "completed" | "failed" | "aborted";

/** Stamp the terminal marker onto the run metadata (read-modify-write; absent meta is created). */
export async function writeTerminalMeta(ctx: SettleContext, terminal: TerminalKind): Promise<void> {
  const meta: RunMeta = (await ctx.store.readRunMeta(ctx.runId)) ?? {
    workflowPath: "",
    argsHash: "",
    createdAt: ctx.nowIso(),
  };
  await ctx.store.writeRunMeta(ctx.runId, {
    ...meta,
    terminal,
    terminalAt: ctx.nowIso(),
  });
}

/** Settle a returned outcome: terminal outcomes get a marker; suspension only emits. */
export async function settleRun(ctx: SettleContext, outcome: RunOutcome): Promise<void> {
  if (outcome.kind === "suspended") {
    ctx.events?.on({
      type: "run.suspended",
      runId: ctx.runId,
      correlationId: outcome.correlationId,
      at: ctx.nowIso(),
    });
    return;
  }
  const terminal: TerminalKind = outcome.kind === "completed" ? "completed" : "aborted";
  await writeTerminalMeta(ctx, terminal);
  ctx.events?.on({
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
  ctx.events?.on({
    type: "run.failed",
    runId: ctx.runId,
    error: error instanceof Error ? error.message : String(error),
    at: ctx.nowIso(),
  });
  throw error;
}
