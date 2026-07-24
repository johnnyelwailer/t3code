/**
 * Broker-side wiring for `t3work.orchestration.run` (ephemeral workflows, slice 1): resolves the
 * durable-engine singletons OPTIONALLY from the broker's environment and builds the per-thread
 * handler factory. Optional so broker test layers that never wire the engine still build —
 * without the services the tool simply reports "not enabled". Kept out of
 * {@link ./t3work-toolBrokerLive.ts} so the broker file stays within the additive size budget.
 */
import type { OrchestrationCommand, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import type * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import { WorkflowJournalStore } from "./persistence/Services/WorkflowJournalStore.ts";
import { WorkflowRunRepository } from "./persistence/Services/WorkflowRuns.ts";
import {
  makeWorkflowRunToolHandlers,
  type T3workWorkflowRunToolHandlers,
} from "./t3work-toolBrokerWorkflowRunTools.ts";
import { T3workWorkflowEngineRegistry } from "./t3work-workflowEngineRegistry.ts";
import { T3workWorkflowScheduler } from "./t3work-workflowScheduler.ts";
import { TextGeneration } from "./textGeneration/TextGeneration.ts";

const WorkflowRepairOutput = Schema.Union([
  Schema.Struct({
    safeToResume: Schema.Literal(true),
    correctedWorkflow: Schema.String,
    summary: Schema.String,
  }),
  Schema.Struct({ safeToResume: Schema.Literal(false), cancelReason: Schema.String }),
]);

type LoadThreadProjectLike = Parameters<typeof makeWorkflowRunToolHandlers>[0] extends {
  loadThreadProject: infer L;
}
  ? L
  : never;

/** Build the per-thread `t3work.orchestration.run` handler factory, or `undefined` when the
 * durable-engine services are absent from the broker's environment. */
export const makeWorkflowRunToolsForThread = Effect.fn("makeWorkflowRunToolsForThread")(
  function* (deps: {
    readonly fileSystem?: FileSystem.FileSystem | undefined;
    readonly path?: Path.Path | undefined;
    readonly dispatch: (command: OrchestrationCommand) => Promise<void>;
    readonly loadThreadProject: LoadThreadProjectLike;
  }) {
    const registry = Option.getOrUndefined(
      yield* Effect.serviceOption(T3workWorkflowEngineRegistry),
    );
    const runRepository = Option.getOrUndefined(yield* Effect.serviceOption(WorkflowRunRepository));
    const journalStore = Option.getOrUndefined(yield* Effect.serviceOption(WorkflowJournalStore));
    const scheduler = Option.getOrUndefined(yield* Effect.serviceOption(T3workWorkflowScheduler));
    const textGeneration = Option.getOrUndefined(yield* Effect.serviceOption(TextGeneration));
    if (!registry || !runRepository || !journalStore || !scheduler) {
      return undefined;
    }
    return makeWorkflowRunToolHandlers({
      fileSystem: deps.fileSystem,
      path: deps.path,
      loadThreadProject: deps.loadThreadProject,
      launch: {
        registry,
        runRepository,
        journalStore,
        rearmScheduler: () => scheduler.rearm(),
        dispatch: deps.dispatch,
        ...(textGeneration?.generateStructured === undefined
          ? {}
          : {
              generateRepairStructured: ({ prompt, modelSelection }) =>
                Effect.runPromise(
                  textGeneration.generateStructured!({
                    cwd: process.cwd(),
                    prompt,
                    outputSchema: WorkflowRepairOutput,
                    modelSelection,
                  }),
                ),
            }),
      },
    }) as (threadId: ThreadId) => T3workWorkflowRunToolHandlers;
  },
);
