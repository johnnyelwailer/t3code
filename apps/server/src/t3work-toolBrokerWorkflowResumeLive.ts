/**
 * Broker-side wiring for `t3work.orchestration.resume`: resolves the durable-engine singletons
 * OPTIONALLY from the broker's environment and builds the per-thread handler factory.
 * Optional so broker test layers that never wire the engine still build — without the
 * services the tool simply reports "not enabled". Mirrors
 * ./t3work-toolBrokerWorkflowRunLive.ts / ./t3work-toolBrokerWorkflowStatusLive.ts.
 */
import type { OrchestrationCommand, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import type * as Path from "effect/Path";

import { WorkflowJournalStore } from "./persistence/Services/WorkflowJournalStore.ts";
import { WorkflowRunRepository } from "./persistence/Services/WorkflowRuns.ts";
import type { WorkflowResumeToolDeps } from "./t3work-toolBrokerWorkflowResumeActions.ts";
import {
  makeWorkflowResumeToolHandlers,
  type T3workWorkflowResumeToolHandlers,
} from "./t3work-toolBrokerWorkflowResumeTool.ts";
import { T3workWorkflowEngineRegistry } from "./t3work-workflowEngineRegistry.ts";
import { T3workWorkflowScheduler } from "./t3work-workflowScheduler.ts";

/** Build the per-thread `t3work.orchestration.resume` handler factory, or `undefined` when the
 * durable-engine services are absent from the broker's environment. */
export const makeWorkflowResumeToolsForThread = Effect.fn("makeWorkflowResumeToolsForThread")(
  function* (deps: {
    readonly fileSystem?: FileSystem.FileSystem | undefined;
    readonly path?: Path.Path | undefined;
    readonly dispatch: (command: OrchestrationCommand) => Promise<void>;
    readonly loadThreadProject: WorkflowResumeToolDeps<unknown>["loadThreadProject"];
  }) {
    const registry = Option.getOrUndefined(
      yield* Effect.serviceOption(T3workWorkflowEngineRegistry),
    );
    const runRepository = Option.getOrUndefined(yield* Effect.serviceOption(WorkflowRunRepository));
    const journalStore = Option.getOrUndefined(yield* Effect.serviceOption(WorkflowJournalStore));
    const scheduler = Option.getOrUndefined(yield* Effect.serviceOption(T3workWorkflowScheduler));
    if (!registry || !runRepository || !journalStore || !scheduler) {
      return undefined;
    }
    return makeWorkflowResumeToolHandlers({
      fileSystem: deps.fileSystem,
      path: deps.path,
      runRepository,
      registry,
      journalStore,
      rearmScheduler: () => scheduler.rearm(),
      dispatch: deps.dispatch,
      loadThreadProject: deps.loadThreadProject,
    }) as (threadId: ThreadId) => T3workWorkflowResumeToolHandlers;
  },
);
