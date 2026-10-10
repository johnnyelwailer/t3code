/**
 * Broker-side wiring for `t3team.orchestration.run` (ephemeral workflows, slice 1): resolves the
 * durable-engine singletons OPTIONALLY from the broker's environment and builds the per-thread
 * handler factory. Optional so broker test layers that never wire the engine still build —
 * without the services the tool simply reports "not enabled". Kept out of
 * {@link ./t3team-toolBrokerLive.ts} so the broker file stays within the additive size budget.
 */
import type { ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import type * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import { WorkflowJournalStore } from "./persistence/SqliteJournalStore.ts";
import { WorkflowRunRepository } from "./persistence/WorkflowRuns.ts";
import { WorkflowSignalStore } from "./persistence/WorkflowSignalStore.ts";
import { ProviderRegistry } from "./provider/ProviderRegistry.ts";
import { recordRecipeLaunchFact } from "./t3team-recipeLaunchFact.ts";
import { T3TeamScriptHost } from "./t3team-scriptHostContext.ts";
import { T3TeamThreadToolContextStore } from "./t3team-threadToolContextStore.ts";
import type { T3TeamToolBrokerShape } from "./t3team-toolBroker.ts";
import { T3TeamThreadFactsStore } from "./t3team-v2/t3team-threadFactsStore.ts";
import {
  makeWorkflowRunToolHandlers,
  type T3TeamWorkflowRunToolHandlers,
} from "./t3team-toolBrokerWorkflowRunTools.ts";
import { T3TeamWorkflowEngineRegistry } from "./t3team-workflowEngineRegistry.ts";
import { T3TeamWorkflowHost, toWorkflowHostPort } from "./t3team-workflowHost.ts";
import { T3TeamWorkflowScheduler } from "./t3team-workflowScheduler.ts";
import { T3TeamWorkflowSignalReconciler } from "./t3team-workflowSignalReconciler.ts";
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

/** Build the per-thread `t3team.orchestration.run` handler factory, or `undefined` when the
 * durable-engine services are absent from the broker's environment. */
export const makeWorkflowRunToolsForThread = Effect.fn("makeWorkflowRunToolsForThread")(
  function* (deps: {
    readonly fileSystem?: FileSystem.FileSystem | undefined;
    readonly path?: Path.Path | undefined;
    readonly loadThreadProject: LoadThreadProjectLike;
    readonly stopRun?:
      | ((threadId: ThreadId, runId: string) => Effect.Effect<void, string>)
      | undefined;
    /** The broker itself, for the host tools of a recipe run by id; read at launch time. */
    readonly hostToolBroker?: (() => Pick<T3TeamToolBrokerShape, "bindSession">) | undefined;
  }) {
    const registry = Option.getOrUndefined(
      yield* Effect.serviceOption(T3TeamWorkflowEngineRegistry),
    );
    const runRepository = Option.getOrUndefined(yield* Effect.serviceOption(WorkflowRunRepository));
    const journalStore = Option.getOrUndefined(yield* Effect.serviceOption(WorkflowJournalStore));
    const scheduler = Option.getOrUndefined(yield* Effect.serviceOption(T3TeamWorkflowScheduler));
    const host = Option.getOrUndefined(yield* Effect.serviceOption(T3TeamWorkflowHost));
    const textGeneration = Option.getOrUndefined(yield* Effect.serviceOption(TextGeneration));
    // The author agent's model choice and the launch check's live model gate both read the same
    // provider snapshots `start_child` resolves against; the context store scopes the author's
    // tools. Both optional: a harness without them authors on the caller's model, unscoped.
    const providerRegistry = Option.getOrUndefined(yield* Effect.serviceOption(ProviderRegistry));
    const contextStore = Option.getOrUndefined(
      yield* Effect.serviceOption(T3TeamThreadToolContextStore),
    );
    // Durable signal-source state (GHE #332) — optional, like the other engine services above:
    // absent, a launched run simply has no signal verbs.
    const signalStore = Option.getOrUndefined(yield* Effect.serviceOption(WorkflowSignalStore));
    const signalReconciler = Option.getOrUndefined(
      yield* Effect.serviceOption(T3TeamWorkflowSignalReconciler),
    );
    if (!registry || !runRepository || !journalStore || !scheduler || !host) {
      return undefined;
    }
    // `recipe` by id needs the recipe's script host and the facts store for its launch fact.
    const scriptHosts = Option.getOrUndefined(yield* Effect.serviceOption(T3TeamScriptHost));
    const facts = Option.getOrUndefined(yield* Effect.serviceOption(T3TeamThreadFactsStore));
    const recipeRun =
      scriptHosts === undefined || facts === undefined || deps.hostToolBroker === undefined
        ? undefined
        : {
            toolBroker: deps.hostToolBroker,
            scriptHosts,
            recordLaunchFact: (input: Parameters<typeof recordRecipeLaunchFact>[0]) =>
              recordRecipeLaunchFact(input).pipe(
                Effect.provideService(T3TeamThreadFactsStore, facts),
                Effect.mapError((error) => error.message),
              ),
          };
    return makeWorkflowRunToolHandlers({
      fileSystem: deps.fileSystem,
      path: deps.path,
      loadThreadProject: deps.loadThreadProject,
      ...(deps.stopRun === undefined ? {} : { stopRun: deps.stopRun }),
      ...(providerRegistry === undefined
        ? {}
        : { listProviders: () => providerRegistry.getProviders }),
      ...(contextStore === undefined ? {} : { contextStore }),
      ...(recipeRun === undefined ? {} : { recipeRun }),
      launch: {
        registry,
        runRepository,
        journalStore,
        rearmScheduler: () => scheduler.rearm(),
        host: toWorkflowHostPort(host),
        ...(signalStore === undefined
          ? {}
          : {
              signalStore,
              ...(signalReconciler === undefined
                ? {}
                : {
                    pokeSignalReconcile: () => void signalReconciler.reconcile().catch(() => {}),
                  }),
            }),
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
    }) as (threadId: ThreadId) => T3TeamWorkflowRunToolHandlers;
  },
);
