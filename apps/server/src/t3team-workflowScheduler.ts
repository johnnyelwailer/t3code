/**
 * The workflow scheduler (Epic 27 §The scheduler service) — the clock-based peer to the event
 * reactor (`t3team-workflowEngineReactor.ts`). Where the reactor wakes a run parked on
 * `askUser` / `askAgent` when a domain event lands, the scheduler wakes a run parked on
 * `waitUntil` when the wall clock reaches its deadline.
 *
 * The deadlines are durable: `workflow_runs` rows in status `sleeping` carry a `wake_at` instant
 * and the `waitUntil` correlation they parked on. The clock is upstream's `Scheduler` — the one
 * due-work tick the server runs its sweeps on (usage-limit recovery, scheduled tasks, the fork's
 * settle and mailbox sweeps). Each tick reads the sleeping set and resumes every due run by
 * appending its `waitUntil` reply — the exact `registry.getRun(runId).resume(...)` path the
 * reactor uses, just clock-triggered. A run therefore wakes at most one tick after its deadline.
 *
 * ── Durability ───────────────────────────────────────────────────────────────
 * Nothing is armed in memory: every tick re-reads the DB. The service published here is the
 * GATE: the sweep stays shut until boot rehydration (`rehydrateSuspendedWorkflowRuns`) has
 * rebuilt each sleeping run's resume closure and calls {@link WorkflowScheduler.rearm}. Opening
 * also runs one catch-up pass, so a deadline that passed during downtime wakes at boot. A due row
 * with no registered closure (recipe gone, rehydration failed) is orphaned — failed, and its
 * launch thread told — instead of re-tried on every tick.
 *
 * The gate and the sweep are two layers because they live at different points of the server's
 * layer graph: the gate sits with the run registry and repository (the broker tools and routes
 * poke it), while the sweep needs the workflow host to tell a launch thread about an orphaned
 * run, so it is mounted with the workflow reactor (t3team-workflowSchedulerSweepLive.ts).
 *
 * Single-instance only (Epic 27 §Open question 4): no lease/leader, so this assumes one server
 * owns the sleeping rows. A replicated deployment would wake a run once per instance.
 *
 * Workflow bodies read the journaled `now()` for timing decisions; only the sweep reads the real
 * clock, which keeps replay deterministic while still being time-driven.
 *
 * Distinct from upstream scheduled tasks (`scheduledTasks/ScheduledTaskService.ts`): those send a
 * fixed prompt on a recurrence. A routine here is a workflow body with its own control flow
 * (branches, asks, child agents) that sleeps between iterations.
 */

import * as Context from "effect/Context";
import * as Layer from "effect/Layer";

// The sweep logic itself; re-exported so existing importers of this module keep resolving.
export * from "./t3team-workflowSchedulerCore.ts";
import type { WorkflowScheduler } from "./t3team-workflowSchedulerCore.ts";

/** The wake gate the run lifecycles, workflow tools and boot rehydration poke. */
export interface WorkflowWakeGate extends WorkflowScheduler {
  /** Settles on the first `rearm`; the sweep wakes nothing before it. */
  readonly opened: Promise<void>;
}

function makeWorkflowWakeGate(): WorkflowWakeGate {
  let open: () => void = () => undefined;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return {
    opened,
    rearm: () => {
      open();
      return Promise.resolve();
    },
  };
}

/** The scheduler as a host service — a peer to the registry/reactor singletons. Its value is the
 * Promise-based {@link WorkflowWakeGate}, so both Effect callers (boot rehydration) and Promise
 * callers (the lifecycle's sleep poke) reach the same gate. */
export class T3TeamWorkflowScheduler extends Context.Service<
  T3TeamWorkflowScheduler,
  WorkflowWakeGate
>()("t3/t3team-workflowScheduler/T3TeamWorkflowScheduler") {}

export const T3TeamWorkflowSchedulerLive = Layer.sync(
  T3TeamWorkflowScheduler,
  makeWorkflowWakeGate,
);
