/** T3Team's scheduler-envelope and capability-policy adapter. */

import {
  createSchedulePrimitives as createGenericSchedulePrimitives,
  type SchedulePrimitives,
} from "@runbook/core/scheduling";
import { PermissionDeniedError } from "./t3team-sdk.errors.ts";
import type { MessageBroker } from "./t3team-sdk.broker.ts";
import type { HandleDispatch, ReplyResolver } from "./t3team-sdk.handles.ts";

export type { SchedulePrimitives };

export function createSchedulePrimitives(deps: {
  readonly dispatch: HandleDispatch;
  readonly broker: MessageBroker;
  readonly capabilities: ReadonlySet<string>;
}): SchedulePrimitives {
  return createGenericSchedulePrimitives({
    dispatch: deps.dispatch,
    delivery: {
      schedule: (request, resolver: ReplyResolver) =>
        deps.broker.send(
          {
            correlationId: request.correlationId,
            kind: "wait.until",
            payload: { deadline: request.deadline },
          },
          resolver,
        ),
    },
    isAllowed: () => deps.capabilities.has("schedule"),
    denied: () =>
      new PermissionDeniedError(
        "'waitUntil' requires the 'schedule' capability. Add 'schedule' to this workflow's meta.capabilities.",
      ),
  });
}
