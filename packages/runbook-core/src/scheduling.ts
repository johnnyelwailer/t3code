/** Host-neutral durable scheduling primitive. */

import { WorkflowError } from "./errors.ts";
import type { HandleDispatch, ReplyResolver } from "./handles.ts";

export interface ScheduleRequest {
  readonly correlationId: string;
  readonly deadline: number;
}

/** Host delivery port for a durable wake request. The host settles the resolver at the deadline. */
export interface ScheduleDelivery {
  readonly schedule: (request: ScheduleRequest, resolver: ReplyResolver) => Promise<void>;
}

export interface SchedulePrimitives {
  readonly waitUntil: (when: number) => Promise<void>;
}

export interface SchedulePrimitivesDeps {
  readonly dispatch: HandleDispatch;
  readonly delivery: ScheduleDelivery;
  readonly isAllowed?: () => boolean;
  readonly denied?: () => Error;
}

export function createSchedulePrimitives(deps: SchedulePrimitivesDeps): SchedulePrimitives {
  const waitUntilImpl = async (when: number): Promise<void> => {
    const payload = { deadline: when };
    const correlationId = await deps.dispatch.send({
      kind: "wait.until",
      refId: "wait.until",
      args: payload,
      fire: (cid: string, resolver: ReplyResolver) =>
        deps.delivery.schedule({ correlationId: cid, deadline: when }, resolver),
    });
    await deps.dispatch.awaitResolution<unknown>(correlationId, undefined);
  };

  if (deps.isAllowed?.() === false) {
    return {
      waitUntil: () => {
        throw (
          deps.denied?.() ??
          new WorkflowError("waitUntil is unavailable because scheduling is not enabled.")
        );
      },
    };
  }
  return { waitUntil: waitUntilImpl };
}
