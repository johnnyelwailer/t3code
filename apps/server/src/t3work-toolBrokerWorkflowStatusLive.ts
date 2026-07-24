/**
 * Broker-side wiring for `t3work.orchestration.status`: resolves the run repository OPTIONALLY from
 * the broker's environment and builds the per-thread handler factory. Optional so broker test
 * layers that never wire the run repository still build — without it the tool simply reports
 * "not enabled". Mirrors ./t3work-toolBrokerWorkflowRunLive.ts, kept separate so that file (and
 * this one) stay within the additive size budget.
 */
import type { ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { WorkflowRunRepository } from "./persistence/Services/WorkflowRuns.ts";
import {
  makeWorkflowStatusToolHandlers,
  type T3workWorkflowStatusToolHandlers,
} from "./t3work-toolBrokerWorkflowStatusTool.ts";

/** Build the per-thread `t3work.orchestration.status` handler factory, or `undefined` when the run
 * repository is absent from the broker's environment. */
export const makeWorkflowStatusToolsForThread = Effect.fn("makeWorkflowStatusToolsForThread")(
  function* () {
    const runRepository = Option.getOrUndefined(yield* Effect.serviceOption(WorkflowRunRepository));
    if (!runRepository) {
      return undefined;
    }
    return makeWorkflowStatusToolHandlers({ runRepository }) as (
      threadId: ThreadId,
    ) => T3workWorkflowStatusToolHandlers;
  },
);
