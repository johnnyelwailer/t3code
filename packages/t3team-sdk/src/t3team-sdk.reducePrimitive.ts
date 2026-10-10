/** T3Team's `accumulate` adapter: the run's reducer set, plus its sub-workflow refusal. */

import {
  createReducePrimitives as createGenericReducePrimitives,
  type ReducePrimitives,
  type ReducePrimitivesDeps,
  type RunReducePrimitives,
} from "@runbook/core/reduce";
import { SubWorkflowCheckpointError } from "./t3team-sdk.errors.ts";

export type { ReducePrimitives };

/**
 * The top-level body's reducers: every fold commits through the run's `checkpoint`, and the
 * returned reducer-aware `checkpoint` is what the body binds as its own.
 */
export function createReducePrimitives(deps: ReducePrimitivesDeps): RunReducePrimitives {
  return createGenericReducePrimitives(deps);
}

/**
 * The stand-in a SUB-workflow body gets. `accumulate` commits a checkpoint boundary, so it is
 * refused for the same reason `checkpoint()` is (see `t3team-sdk.subWorkflows.ts`): a boundary
 * committed inside a child would move the run's SHARED replay window. It throws before folding or
 * journaling anything; a child never folds, so it never has reducer state to read.
 */
export const subWorkflowReducePrimitives: ReducePrimitives = {
  accumulate: async () => {
    throw new SubWorkflowCheckpointError("accumulate()");
  },
  reducerState: () => undefined,
};
