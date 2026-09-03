/**
 * Broker-side wiring for `t3team.orchestration.resume`: resolves the durable-engine singletons
 * OPTIONALLY from the broker's environment and builds the per-thread handler factory.
 * Optional so broker test layers that never wire the engine still build — without the
 * services the tool simply reports "not enabled". Mirrors
 * ./t3team-toolBrokerWorkflowRunLive.ts / ./t3team-toolBrokerWorkflowStatusLive.ts.
 */
import { type OrchestrationCommand, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import type * as Path from "effect/Path";

import { OrchestrationEngineService } from "./orchestration/Services/OrchestrationEngine.ts";
import { ProjectionSnapshotQuery } from "./orchestration/Services/ProjectionSnapshotQuery.ts";
import { WorkflowJournalStore } from "./persistence/Services/WorkflowJournalStore.ts";
import { WorkflowRunRepository } from "./persistence/Services/WorkflowRuns.ts";
import type { WorkflowResumeToolDeps } from "./t3team-toolBrokerWorkflowResumeActions.ts";
import {
  makeWorkflowResumeToolHandlers,
  type T3TeamWorkflowResumeToolHandlers,
} from "./t3team-toolBrokerWorkflowResumeTool.ts";
import { T3TeamWorkflowEngineRegistry } from "./t3team-workflowEngineRegistry.ts";
import { T3TeamWorkflowScheduler } from "./t3team-workflowScheduler.ts";
import { makeWorkflowTurnRedriveLive } from "./t3team-workflowTurnRedriveLive.ts";

/** Build the per-thread `t3team.orchestration.resume` handler factory, or `undefined` when the
 * durable-engine services are absent from the broker's environment. */
export const makeWorkflowResumeToolsForThread = Effect.fn("makeWorkflowResumeToolsForThread")(
  function* (deps: {
    readonly fileSystem?: FileSystem.FileSystem | undefined;
    readonly path?: Path.Path | undefined;
    readonly dispatch: (command: OrchestrationCommand) => Promise<void>;
    readonly loadThreadProject: WorkflowResumeToolDeps<unknown>["loadThreadProject"];
  }) {
    const registry = Option.getOrUndefined(
      yield* Effect.serviceOption(T3TeamWorkflowEngineRegistry),
    );
    const runRepository = Option.getOrUndefined(yield* Effect.serviceOption(WorkflowRunRepository));
    const journalStore = Option.getOrUndefined(yield* Effect.serviceOption(WorkflowJournalStore));
    const scheduler = Option.getOrUndefined(yield* Effect.serviceOption(T3TeamWorkflowScheduler));
    if (!registry || !runRepository || !journalStore || !scheduler) {
      return undefined;
    }
    // Re-driving a failed run's retained agent step (GHE #403) re-issues the step's prompt turn
    // — the SAME re-drive the reactor uses for an interrupted step, built over the same engine
    // dispatch + thread query. Optional: without them the failed-step resume reports itself
    // unavailable instead of silently replaying into a dead `sent` entry.
    const orchestration = Option.getOrUndefined(
      yield* Effect.serviceOption(OrchestrationEngineService),
    );
    const threadQuery = Option.getOrUndefined(yield* Effect.serviceOption(ProjectionSnapshotQuery));
    const turnRedrive =
      orchestration === undefined || threadQuery === undefined
        ? undefined
        : makeWorkflowTurnRedriveLive({
            registry,
            runRepository,
            orchestration,
            threadQuery,
          });
    return makeWorkflowResumeToolHandlers({
      fileSystem: deps.fileSystem,
      path: deps.path,
      runRepository,
      registry,
      journalStore,
      rearmScheduler: () => scheduler.rearm(),
      dispatch: deps.dispatch,
      loadThreadProject: deps.loadThreadProject,
      ...(turnRedrive === undefined ? {} : { turnRedrive }),
    }) as (threadId: ThreadId) => T3TeamWorkflowResumeToolHandlers;
  },
);
