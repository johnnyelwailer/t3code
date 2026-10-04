/** T3Team's capability-policy adapter for the host-neutral `retry` / `backoff` primitive. */

import {
  createRetryPrimitives as createGenericRetryPrimitives,
  type RetryPrimitives,
} from "@runbook/core/retryBackoff";
import type { DurableWorkflowRuntime } from "./t3team-sdk.durableRuntime.ts";
import { PermissionDeniedError } from "./t3team-sdk.errors.ts";
import type { SchedulePrimitives } from "./t3team-sdk.schedulePrimitive.ts";

export type { RetryPrimitives };

export function createRetryPrimitives(deps: {
  readonly runtime: DurableWorkflowRuntime;
  readonly schedule: SchedulePrimitives;
  readonly capabilities: ReadonlySet<string>;
}): RetryPrimitives {
  return createGenericRetryPrimitives({
    callPrimitive: deps.runtime.callPrimitive,
    currentSeq: deps.runtime.currentSeq,
    runBlackBoxed: deps.runtime.runBlackBoxed,
    hostNow: deps.runtime.hostNow,
    // The backoff delay IS `waitUntil`, so retry is gated by the same `"schedule"` capability —
    // up front, not at the first failure, so the static scan and the runtime agree.
    waitUntil: deps.schedule.waitUntil,
    isAllowed: () => deps.capabilities.has("schedule"),
    denied: () =>
      new PermissionDeniedError(
        "'retry' requires the 'schedule' capability (its backoff is a durable waitUntil). Add 'schedule' to this workflow's meta.capabilities.",
      ),
  });
}
