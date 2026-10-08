/**
 * `wait(ms)` as the durable clock park its contract promises (engineApi `wait`): a body that
 * declares the `"schedule"` capability journals its deadline once and parks on `waitUntil`, so the
 * run goes `sleeping` with a `wake_at`, is pausable, and survives a restart. Without the capability
 * there is no park to hand the deadline to, and `wait` stays the in-process timer it always was.
 */

// @effect-diagnostics nodeBuiltinImport:off -- Plain Promise-based SDK primitive, not Effect code; no Effect runtime is available at this boundary.
import * as NodeTimersPromises from "node:timers/promises";

import type { DurableWorkflowRuntime } from "./t3team-sdk.durableRuntime.ts";
import type { WorkflowPrimitives } from "./t3team-sdk.primitives.ts";
import type { SchedulePrimitives } from "./t3team-sdk.schedulePrimitive.ts";

/** What the `wait` primitive journals. `parked` marks a deadline handed to the clock park; an
 * entry without it (journaled before parking existed) replays as the in-process sleep it was, so
 * a run that was already past such a `wait` keeps its journal sequence. */
type WaitRecord = { readonly deadline: number; readonly parked?: true };

export interface DurableWaitDeps {
  readonly runtime: Pick<DurableWorkflowRuntime, "callPrimitive" | "hostNow" | "isBlackBoxed">;
  readonly park: SchedulePrimitives["waitUntil"];
  readonly sleep?: (durationMs: number) => Promise<void>;
}

/**
 * Journal `deadline = now + durationMs` under the same `wait` primitive the in-process timer
 * uses, then park on it. Which branch runs is read from the RECORDED entry, never from live state,
 * so a replay issues exactly the primitives the first execution did — including the `wait.until`
 * whose resolved reply the replay finds in the journal.
 */
export function createDurableWait(deps: DurableWaitDeps): (durationMs: number) => Promise<void> {
  const sleep =
    deps.sleep ?? ((ms: number) => NodeTimersPromises.setTimeout(ms).then(() => undefined));
  return async (durationMs) => {
    const recorded = await deps.runtime.callPrimitive<WaitRecord>({
      kind: "wait",
      refId: "wait",
      args: { durationMs },
      // Inside parallel()/pipeline() nothing is journaled, so a park there could never be resumed
      // (handlesDispatch arms an unresumable black-box suspension): sleep in process instead, as
      // `wait` always did. The branch is re-run live on resume, so this is still deterministic.
      exec: async () => {
        const deadline = deps.runtime.hostNow() + durationMs;
        return deps.runtime.isBlackBoxed() ? { deadline } : { deadline, parked: true };
      },
      decodeRecorded: (value) => value as WaitRecord,
    });
    if (recorded.parked === true) return deps.park(recorded.deadline);
    const remaining = recorded.deadline - deps.runtime.hostNow();
    if (remaining > 0) await sleep(remaining);
  };
}

export function withDurableWait(deps: {
  readonly primitives: WorkflowPrimitives;
  readonly runtime: DurableWaitDeps["runtime"];
  readonly schedule: SchedulePrimitives;
  readonly capabilities: ReadonlySet<string>;
}): WorkflowPrimitives {
  if (!deps.capabilities.has("schedule")) return deps.primitives;
  return {
    ...deps.primitives,
    wait: createDurableWait({ runtime: deps.runtime, park: deps.schedule.waitUntil }),
  };
}
