/* oxlint-disable eslint/no-unused-vars -- Existing merged lint debt; keep green while preserving behavior. */
// @effect-diagnostics globalTimers:off -- the scheduler is the one component that bridges real
// wall-clock time to the engine: it owns a single host timer (injectable for tests) armed for
// the soonest deadline, not an Effect fiber sleep. Workflow bodies still read the journaled
// `now()`; only the scheduler touches the real clock.
/**
 * The workflow scheduler (Epic 27 §The scheduler service) — the clock-based peer to the event
 * reactor (`t3team-workflowEngineReactor.ts`). Where the reactor wakes a run parked on
 * `askUser` / `askAgent` when a domain event lands, the scheduler wakes a run parked on
 * `waitUntil` when the wall clock reaches its deadline.
 *
 * It owns the durable wake deadlines: `workflow_runs` rows in status `sleeping` carry a
 * `wake_at` instant and the `waitUntil` correlation they parked on. The scheduler indexes that
 * set into ONE process timer armed for the SOONEST `wake_at`; on fire it resumes every due run
 * by appending its `waitUntil` reply — the exact `registry.getRun(runId).resume(...)` path the
 * reactor uses, just clock-triggered — then re-arms for the next deadline.
 *
 * ── Durability ───────────────────────────────────────────────────────────────
 * The timer lives only in memory, but the deadlines live in the DB. On boot
 * (`rehydrateSuspendedWorkflowRuns`, after it rebuilds each sleeping run's resume closure)
 * {@link WorkflowScheduler.rearm} re-reads the sleeping set and re-arms. A deadline that PASSED
 * during downtime arms at the {@link MIN_DUE_DELAY_MS} floor and fires almost immediately
 * (catch-up); the floor exists so a due row whose resume is a no-op cannot hot-loop. As runs
 * park or wake at runtime, the lifecycle pokes `rearm` so the soonest-deadline timer stays
 * current.
 *
 * Single-instance only (Epic 27 §Open question 4): no lease/leader, so this assumes one server
 * owns the sleeping rows. A replicated deployment would wake a run once per instance.
 *
 * The scheduler is the only clock authority for waking runs: workflow bodies read the journaled
 * `now()` for timing decisions; the scheduler reads the real clock and pokes the engine, which
 * keeps replay deterministic while still being time-driven.
 */

import * as NodeTimers from "node:timers";

import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { OrchestrationEngineService } from "./orchestration/Services/OrchestrationEngine.ts";
import { WorkflowRunRepository } from "./persistence/Services/WorkflowRuns.ts";
import { t3teamRandomUUID } from "./t3team-random.ts";
import { deliverWorkflowFailure } from "./t3team-workflowCompletionMessage.ts";
import { T3TeamWorkflowEngineRegistry } from "./t3team-workflowEngineRegistry.ts";
import { makeSchedulerResume, orphanSleepingRun } from "./t3team-workflowSchedulerResume.ts";

/** Floor for a re-arm delay of an already-due row. A due row whose resume is a no-op (unregistered
 * run, or a reply resolved by a crashed process) would otherwise re-arm at delay 0 forever — a
 * setTimeout(0) hot loop that hammers `listSleeping`. Capping to 1s makes at most one wake attempt
 * per second while a legitimate in-flight resume settles; the orphan paths remove the dead row. */
const MIN_DUE_DELAY_MS = 1000;

/** One sleeping run as the scheduler indexes it: which run, its `waitUntil` correlation to
 * resolve, and its wake instant (epoch millis). */
export interface SchedulerSleepingRun {
  readonly runId: string;
  readonly correlationId: string;
  readonly wakeAtMs: number;
}

/** The wall clock + timer the scheduler drives. Injectable so a test can fire deadlines
 * deterministically instead of waiting on real time. */
export interface WorkflowSchedulerClock {
  readonly now: () => number;
  readonly setTimer: (callback: () => void, delayMs: number) => unknown;
  readonly clearTimer: (handle: unknown) => void;
}

export interface WorkflowSchedulerDeps {
  /** All runs currently parked on a timer (status `sleeping`), with their wake instant. */
  readonly listSleeping: () => Promise<ReadonlyArray<SchedulerSleepingRun>>;
  /** Resume a due run by resolving its `waitUntil` correlation — the reactor's resume path,
   * clock-triggered. A no-op if the run is not registered (it must be rehydrated first). */
  readonly resume: (runId: string, correlationId: string) => Promise<void>;
  readonly clock?: WorkflowSchedulerClock;
  readonly onWarn?: (message: string, fields?: Record<string, unknown>) => void;
}

export interface WorkflowScheduler {
  /** Recompute the soonest pending deadline and (re)arm the single process timer for it.
   * Called on boot (after rehydration) and whenever a run parks or wakes. */
  readonly rearm: () => Promise<void>;
  /** Clear the armed timer (shutdown). */
  readonly stop: () => void;
}

const defaultClock: WorkflowSchedulerClock = {
  now: () => DateTime.nowUnsafe().epochMilliseconds,
  setTimer: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/**
 * Build a scheduler over its deps. Pure of any Effect context, so a test can drive the real
 * arm/fire/re-arm loop with an injected clock; {@link T3TeamWorkflowSchedulerLive} wraps this
 * over the live repo + registry.
 */
export function makeWorkflowScheduler(deps: WorkflowSchedulerDeps): WorkflowScheduler {
  const clock = deps.clock ?? defaultClock;
  let timer: unknown;
  let stopped = false;
  let rearmTail: Promise<void> = Promise.resolve();

  const clear = (): void => {
    if (timer !== undefined) {
      clock.clearTimer(timer);
      timer = undefined;
    }
  };

  // The timer callback. Self-contained on errors (a real host timer ignores the returned
  // promise, so nothing else can catch a rejection) — listSleeping/resume/re-arm failures are
  // logged, never thrown. Returns a promise so a test clock can await the full fire→resume→arm.
  const tick = async (): Promise<void> => {
    timer = undefined;
    try {
      const rows = await deps.listSleeping();
      const nowMs = clock.now();
      // Fire only the genuinely-due deadlines. A timer that fired a hair early leaves the run for
      // the next arm (the re-arm below computes its small remaining delay) — self-correcting.
      const due = rows.filter((run) => run.wakeAtMs <= nowMs);
      // Let every due run claim its fair admission position before awaiting settlement. A slow
      // first run must not prevent later due runs from even entering the admission queue.
      await Promise.all(
        due.map(async (run) => {
          try {
            await deps.resume(run.runId, run.correlationId);
          } catch (error) {
            deps.onWarn?.("workflow scheduler failed to resume a sleeping run", {
              runId: run.runId,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }),
      );
      await rearm();
    } catch (error) {
      deps.onWarn?.("workflow scheduler tick failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const performRearm = async (): Promise<void> => {
    const rows = await deps.listSleeping();
    if (stopped) return;
    clear();
    if (rows.length === 0) return;
    const soonest = Math.min(...rows.map((run) => run.wakeAtMs));
    // An already-due deadline arms at the floor, never 0 — see MIN_DUE_DELAY_MS (loop guard). A
    // future deadline arms at its exact remaining delay.
    const remaining = soonest - clock.now();
    const delayMs = remaining <= 0 ? MIN_DUE_DELAY_MS : remaining;
    timer = clock.setTimer(tick, delayMs);
  };

  // Serialize DB reads + timer replacement. Without this lane, an older slow listSleeping()
  // result can arrive after a newer one and replace the correct timer with a stale deadline.
  const rearm = (): Promise<void> => {
    const next = rearmTail.then(performRearm, performRearm);
    rearmTail = next.catch(() => undefined);
    return next;
  };

  return {
    rearm,
    stop: () => {
      stopped = true;
      clear();
    },
  };
}

/** Map a sleeping `workflow_runs` row to the scheduler's index shape, or `undefined` if it is
 * missing the deadline / correlation a timer wake needs (logged + skipped by the caller). */
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

/** The scheduler as a host service — a peer to the registry/reactor singletons. Its value is
 * the Promise-based {@link WorkflowScheduler}, so both Effect callers (boot rehydration) and
 * Promise callers (the lifecycle's sleep poke) drive the same timer. */
export class T3TeamWorkflowScheduler extends Context.Service<
  T3TeamWorkflowScheduler,
  WorkflowScheduler
>()("t3/t3team-workflowScheduler/T3TeamWorkflowScheduler") {}

export const T3TeamWorkflowSchedulerLive = Layer.effect(
  T3TeamWorkflowScheduler,
  Effect.gen(function* () {
    const repo = yield* WorkflowRunRepository;
    const registry = yield* T3TeamWorkflowEngineRegistry;
    // Optional on purpose: harnesses without an orchestration engine still get a
    // working scheduler — orphaned runs then only log instead of messaging.
    const orchestration = Option.getOrUndefined(
      yield* Effect.serviceOption(OrchestrationEngineService),
    );

    const listSleeping = (): Promise<ReadonlyArray<SchedulerSleepingRun>> =>
      Effect.runPromise(repo.listByStatus({ status: "sleeping" })).then((rows) =>
        rows
          .map(toSchedulerSleepingRun)
          .filter((run): run is SchedulerSleepingRun => run !== undefined),
      );

    const resume = makeSchedulerResume({
      getRun: (runId) => registry.getRun(runId),
      orphan: (runId, correlationId) =>
        orphanSleepingRun(
          repo,
          runId,
          correlationId,
          orchestration === undefined
            ? undefined
            : (launchThreadId, errorText) =>
                deliverWorkflowFailure({
                  launchThreadId,
                  workflowRunId: runId,
                  errorText,
                  dispatch: (command) =>
                    Effect.runPromise(orchestration.dispatch(command)).then(() => undefined),
                  newId: () => t3teamRandomUUID(),
                  nowIso: () => DateTime.formatIso(DateTime.nowUnsafe()),
                }),
        ),
    });

    const scheduler = makeWorkflowScheduler({
      listSleeping,
      resume,
      onWarn: (message, fields) => {
        Effect.runFork(Effect.logWarning(message, fields));
      },
    });

    yield* Effect.addFinalizer(() => Effect.sync(() => scheduler.stop()));
    return scheduler;
  }),
);
