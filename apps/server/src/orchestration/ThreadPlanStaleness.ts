/**
 * ThreadPlanStalenessService - in-memory per-thread counter of how many
 * tool activity events have been appended since the thread's last plan
 * write (the `turn.plan.updated` activity the provider adapters emit when
 * the model rewrites its task list).
 *
 * The plan only refreshes when the model chooses to write it, so in long
 * threads it silently goes stale. The counter is that staleness signal:
 * written by runtime ingestion (tool starts bump it, plan writes reset it),
 * read at turn framing to decide whether to nudge the model, and kept
 * deliberately outside the context window so it costs the model nothing.
 *
 * Same pattern as ThreadPlanProgressService and ThreadSilenceWatchdog:
 * in-memory, no persistence, no migration. A server restart restarts the
 * count — the plan itself is durable (thread activities), so a nudge only
 * arrives later, never a wrong one.
 *
 * @module ThreadPlanStalenessService
 */
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

export class ThreadPlanStalenessService extends Context.Service<
  ThreadPlanStalenessService,
  {
    /** One tool activity was appended: the plan's age grows by one. */
    readonly recordToolActivity: (threadId: string) => void;

    /** The model wrote a new plan: the age resets to zero. */
    readonly recordPlanWrite: (threadId: string) => void;

    /** Tool activity events appended since the last plan write (0 if none). */
    readonly getPlanAge: (threadId: string) => number;
  }
>()("t3/orchestration/ThreadPlanStaleness/ThreadPlanStalenessService") {}

export function make(): ThreadPlanStalenessService["Service"] {
  const planAgeByThreadId = new Map<string, number>();

  return {
    recordToolActivity: (threadId) => {
      planAgeByThreadId.set(threadId, (planAgeByThreadId.get(threadId) ?? 0) + 1);
    },

    recordPlanWrite: (threadId) => {
      planAgeByThreadId.delete(threadId);
    },

    getPlanAge: (threadId) => planAgeByThreadId.get(threadId) ?? 0,
  };
}

export const layer = Layer.effect(ThreadPlanStalenessService, Effect.sync(make));
