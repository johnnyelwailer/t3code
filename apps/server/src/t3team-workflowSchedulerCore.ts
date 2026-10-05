/**
 * The wake sweep's own logic: find the sleeping runs whose `waitUntil` deadline has passed and
 * resume each one.
 *
 * The clock is not here. Upstream's `Scheduler` (one due-work tick for the whole server) calls
 * {@link WorkflowWakeSweep.runDue}; this module only decides what is due and drives it. Split
 * from `t3team-workflowScheduler.ts` so it holds no reference to the service tag — an earlier
 * attempt put the Layer here, which made the two modules cyclic and left the tag undefined at
 * layer construction. Depending only downward keeps that impossible.
 */

import * as DateTime from "effect/DateTime";

/** One sleeping run as the sweep indexes it: which run, its `waitUntil` correlation to resolve,
 * and its wake instant (epoch millis). */
export interface SchedulerSleepingRun {
  readonly runId: string;
  readonly correlationId: string;
  readonly wakeAtMs: number;
}

export interface WorkflowSchedulerDeps {
  /** All runs currently parked on a timer (status `sleeping`), with their wake instant. */
  readonly listSleeping: () => Promise<ReadonlyArray<SchedulerSleepingRun>>;
  /** Resume a due run by resolving its `waitUntil` correlation — the reactor's resume path,
   * clock-triggered. The live wiring orphans a run that has no registered closure. */
  readonly resume: (runId: string, correlationId: string) => Promise<void>;
  /** Wall clock in epoch millis; injectable so a test decides what is due. */
  readonly now?: () => number;
  readonly onWarn?: (message: string, fields?: Record<string, unknown>) => void;
}

export interface WorkflowScheduler {
  /**
   * Open the wake sweep. Boot rehydration calls it once every sleeping run's resume closure is
   * rebuilt — until then a due row would look orphaned. The first call also starts one catch-up
   * pass in the background, so a deadline that passed during downtime wakes at boot rather than
   * on the next tick. Later calls (a run parking or resuming) change nothing: the tick reads the
   * durable deadlines on every pass. Resolves at once; it never waits for a pass.
   */
  readonly rearm: () => Promise<void>;
}

export interface WorkflowWakeSweep extends WorkflowScheduler {
  /**
   * One due pass: resume every sleeping run whose deadline has passed. A no-op until `rearm`
   * opened the sweep. A call while a pass is running joins that pass instead of starting a
   * second one, so a slow resume can never stack passes.
   */
  readonly runDue: () => Promise<void>;
}

const describe = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** Build the sweep over its deps. Pure of any Effect context, so a test can drive passes with
 * an injected clock; {@link T3TeamWorkflowSchedulerLive} wires it to the live repo + registry
 * and registers `runDue` on the server's `Scheduler`. */
export function makeWorkflowScheduler(deps: WorkflowSchedulerDeps): WorkflowWakeSweep {
  const now = deps.now ?? (() => DateTime.nowUnsafe().epochMilliseconds);
  let open = false;
  let inFlight: Promise<void> | undefined;

  // Self-contained on errors: a failed read or resume is logged, never thrown, so the tick
  // keeps running and one bad run cannot stop the others from waking.
  const pass = async (): Promise<void> => {
    try {
      const rows = await deps.listSleeping();
      const nowMs = now();
      const due = rows.filter((run) => run.wakeAtMs <= nowMs);
      // Every due run claims its admission position before any settles: a slow first run must
      // not keep later due runs from even entering the admission queue.
      await Promise.all(
        due.map(async (run) => {
          try {
            await deps.resume(run.runId, run.correlationId);
          } catch (error) {
            deps.onWarn?.("workflow scheduler failed to resume a sleeping run", {
              runId: run.runId,
              error: describe(error),
            });
          }
        }),
      );
    } catch (error) {
      deps.onWarn?.("workflow scheduler wake pass failed", { error: describe(error) });
    }
  };

  const runDue = (): Promise<void> => {
    if (!open) return Promise.resolve();
    if (inFlight !== undefined) return inFlight;
    const current = pass().finally(() => {
      inFlight = undefined;
    });
    inFlight = current;
    return current;
  };

  const rearm = (): Promise<void> => {
    if (open) return Promise.resolve();
    open = true;
    void runDue();
    return Promise.resolve();
  };

  return { rearm, runDue };
}

/** Map a sleeping `workflow_runs` row to the sweep's index shape, or `undefined` if it is
 * missing the deadline / correlation a timer wake needs (skipped by the caller). */
export function toSchedulerSleepingRun(row: {
  readonly runId: string;
  readonly wakeAt: string | null;
  readonly pendingCorrelationId: string | null;
}): SchedulerSleepingRun | undefined {
  if (row.wakeAt === null || row.pendingCorrelationId === null) return undefined;
  return {
    runId: row.runId,
    correlationId: row.pendingCorrelationId,
    wakeAtMs: DateTime.makeUnsafe(row.wakeAt).epochMilliseconds,
  };
}
