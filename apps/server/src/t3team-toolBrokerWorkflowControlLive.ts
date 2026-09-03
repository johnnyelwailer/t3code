/**
 * Broker-side wiring for `t3team.orchestration.pause` / `t3team.orchestration.stop`: resolves the
 * durable-engine singletons OPTIONALLY from the broker's environment and builds the per-thread
 * handler factory. Optional so broker test layers that never wire the engine still build —
 * without the services the tools simply report "not enabled". Mirrors
 * ./t3team-toolBrokerWorkflowResumeLive.ts.
 */
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { OrchestrationEngineService } from "./orchestration/Services/OrchestrationEngine.ts";
import { ProjectionSnapshotQuery } from "./orchestration/Services/ProjectionSnapshotQuery.ts";
import { WorkflowRunRepository } from "./persistence/Services/WorkflowRuns.ts";
import { makeWorkflowControlToolHandlers } from "./t3team-toolBrokerWorkflowControlTool.ts";
import { T3TeamWorkflowEngineRegistry } from "./t3team-workflowEngineRegistry.ts";
import { T3TeamWorkflowScheduler } from "./t3team-workflowScheduler.ts";
import { makeWorkflowTurnRedriveLive } from "./t3team-workflowTurnRedriveLive.ts";

/** Build the per-thread pause/stop handler factory, or `undefined` when the durable-engine
 * services are absent from the broker's environment. */
export const makeWorkflowControlToolsForThread = Effect.fn("makeWorkflowControlToolsForThread")(
  function* () {
    const registry = Option.getOrUndefined(
      yield* Effect.serviceOption(T3TeamWorkflowEngineRegistry),
    );
    const repo = Option.getOrUndefined(yield* Effect.serviceOption(WorkflowRunRepository));
    const scheduler = Option.getOrUndefined(yield* Effect.serviceOption(T3TeamWorkflowScheduler));
    const orchestration = Option.getOrUndefined(
      yield* Effect.serviceOption(OrchestrationEngineService),
    );
    const threadQuery = Option.getOrUndefined(yield* Effect.serviceOption(ProjectionSnapshotQuery));
    if (!registry || !repo || !scheduler || !orchestration || !threadQuery) {
      return undefined;
    }
    return makeWorkflowControlToolHandlers({
      repo,
      registry,
      rearmScheduler: () => scheduler.rearm(),
      dispatch: (command) => orchestration.dispatch(command),
      turnRedrive: makeWorkflowTurnRedriveLive({
        registry,
        runRepository: repo,
        orchestration,
        threadQuery,
      }),
    });
  },
);
