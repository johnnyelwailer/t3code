/**
 * Boot-rehydration gate (GHE #332 review): while the host is still rebuilding the watching-run
 * controllers at boot, a parked row with no registered controller is TRANSIENT — the delivery
 * port must leave the run parked (retry on the next event) instead of orphan-failing it. The
 * reconciler's layer edge makes rehydration complete before any source instance starts; this
 * flag is the defense-in-depth signal for the rare path where delivery happens mid-rehydrate.
 * The flag's single production instance is provided by the SAME `T3TeamWorkflowSignalRehydrateGateLive`
 * reference in both the rehydrate layer and `T3TeamWorkflowSignalDeliveryLive`, so both
 * subgraphs memoize to the one object the rehydration effect flips.
 */
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

export interface WorkflowSignalRehydrateGateShape {
  readonly isRehydrateInFlight: () => boolean;
  readonly markInFlight: () => void;
  readonly markComplete: () => void;
}

/** T3TeamWorkflowSignalRehydrateGate - service tag for the boot-rehydration gate. */
export class T3TeamWorkflowSignalRehydrateGate extends Context.Service<
  T3TeamWorkflowSignalRehydrateGate,
  WorkflowSignalRehydrateGateShape
>()("t3/t3team-workflowSignalRehydrateGate/T3TeamWorkflowSignalRehydrateGate") {}

export const T3TeamWorkflowSignalRehydrateGateLive = Layer.effect(
  T3TeamWorkflowSignalRehydrateGate,
  Effect.gen(function* () {
    let inFlight = false;
    return {
      isRehydrateInFlight: () => inFlight,
      markInFlight: () => {
        inFlight = true;
      },
      markComplete: () => {
        inFlight = false;
      },
    };
  }),
);
