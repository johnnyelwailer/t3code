/**
 * Ambient-context helpers for the recipe trigger runner (S5b): the runner's Layer is composed
 * into the ambient app context, and these narrow that context to the service sets the runner's
 * inner effects need, then run an effect with just that set (the same narrowing the signal
 * reconciler uses for its source-side callbacks).
 */
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as EffectFileSystem from "effect/FileSystem";
import * as EffectPath from "effect/Path";

import { WorkflowJournalStore } from "./persistence/SqliteJournalStore.ts";
import { WorkflowRunRepository } from "./persistence/WorkflowRuns.ts";
import { WorkflowSignalStore } from "./persistence/WorkflowSignalStore.ts";
import { ProjectStoreV2 } from "./orchestration-v2/ProjectStore.ts";
import { T3TeamScriptHost } from "./t3team-scriptHostContext.ts";
import { T3TeamWorkflowEngineRegistry } from "./t3team-workflowEngineRegistry.ts";
import { T3TeamWorkflowHost } from "./t3team-workflowHost.ts";
import { T3TeamWorkflowScheduler } from "./t3team-workflowScheduler.ts";

/** The services a recipe/settings read runs against. */
export type TriggerRunnerFsServices = EffectFileSystem.FileSystem | EffectPath.Path | Clock.Clock;

/** The services a headless recipe launch runs against. */
export type TriggerRunnerLaunchServices =
  | TriggerRunnerFsServices
  | T3TeamWorkflowHost
  | T3TeamWorkflowEngineRegistry
  | WorkflowRunRepository
  | WorkflowJournalStore
  | T3TeamWorkflowScheduler
  | T3TeamScriptHost;

/** Run one of the runner's effects with only its needed services, against the ambient context. */
export interface TriggerRunnerAmbient {
  readonly runProjects: <A, E>(effect: Effect.Effect<A, E, ProjectStoreV2>) => Promise<A>;
  readonly runStore: <A, E>(effect: Effect.Effect<A, E, WorkflowSignalStore>) => Promise<A>;
  readonly runFs: <A, E>(effect: Effect.Effect<A, E, TriggerRunnerFsServices>) => Promise<A>;
  readonly runLaunch: <A, E>(
    effect: Effect.Effect<A, E, TriggerRunnerLaunchServices>,
  ) => Promise<A>;
  readonly log: (message: string, fields?: unknown) => void;
}

export function makeTriggerRunnerAmbient(ambient: Context.Context<never>): TriggerRunnerAmbient {
  return {
    runProjects: <A, E>(effect: Effect.Effect<A, E, ProjectStoreV2>): Promise<A> =>
      Effect.runPromiseWith(ambient as Context.Context<ProjectStoreV2>)(effect),
    runStore: <A, E>(effect: Effect.Effect<A, E, WorkflowSignalStore>): Promise<A> =>
      Effect.runPromiseWith(ambient as Context.Context<WorkflowSignalStore>)(effect),
    runFs: <A, E>(effect: Effect.Effect<A, E, TriggerRunnerFsServices>): Promise<A> =>
      Effect.runPromiseWith(ambient as Context.Context<TriggerRunnerFsServices>)(effect),
    runLaunch: <A, E>(effect: Effect.Effect<A, E, TriggerRunnerLaunchServices>): Promise<A> =>
      Effect.runPromiseWith(ambient as Context.Context<TriggerRunnerLaunchServices>)(effect),
    log: (message: string, fields?: unknown): void => {
      Effect.runSync(Effect.logWarning(message, fields as Record<string, unknown>));
    },
  };
}
