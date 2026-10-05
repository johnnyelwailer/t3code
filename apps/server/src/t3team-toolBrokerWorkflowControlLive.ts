/**
 * Broker-side wiring for `t3team.orchestration.pause` / `t3team.orchestration.stop`: resolves the
 * durable-engine singletons OPTIONALLY from the broker's environment and builds the per-thread
 * handler factory. Optional so broker test layers that never wire the engine still build —
 * without the services the tools simply report "not enabled". Mirrors
 * ./t3team-toolBrokerWorkflowResumeLive.ts.
 */
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { ThreadManagementService } from "./orchestration-v2/ThreadManagementService.ts";
import { WorkflowRunRepository } from "./persistence/Services/WorkflowRuns.ts";
import { WorkflowSignalStore } from "./persistence/Services/WorkflowSignalStore.ts";
import { makeWorkflowControlToolHandlers } from "./t3team-toolBrokerWorkflowControlTool.ts";
import { T3TeamWorkflowEngineRegistry } from "./t3team-workflowEngineRegistry.ts";
import { T3TeamWorkflowHost } from "./t3team-workflowHost.ts";
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
    const host = Option.getOrUndefined(yield* Effect.serviceOption(T3TeamWorkflowHost));
    const threads = Option.getOrUndefined(yield* Effect.serviceOption(ThreadManagementService));
    const signalStore = Option.getOrUndefined(yield* Effect.serviceOption(WorkflowSignalStore));
    if (!registry || !repo || !scheduler || !host || !threads) {
      return undefined;
    }
    return makeWorkflowControlToolHandlers({
      repo,
      registry,
      rearmScheduler: () => scheduler.rearm(),
      host,
      turnRedrive: makeWorkflowTurnRedriveLive({
        registry,
        threads,
        host,
        runRepository: repo,
      }),
      // GHE #332: a `watching` run's pause/resume round-trip drains its bridged inbox events.
      ...(signalStore === undefined ? {} : { signalStore }),
    });
  },
);
