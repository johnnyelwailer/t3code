// @effect-diagnostics globalTimers:off -- the runner owns its reconcile/drain tick cadence:
// the poll timer is created on start() and cleared by stop() (same seam as makeSignalPollTimer).
/**
 * The recipe trigger runner (S5b) — the host-side service that turns recipe TRIGGERS into
 * headless runs: RECONCILE (every minute) maintains the durable `trigger:<recipe>:<id>`
 * registration set (t3team-recipeTriggerReconcile.ts), from which the EXISTING signal
 * reconciler starts/stops the source instances; DRAIN (every ten seconds) lists each enabled
 * trigger's undelivered inbox events and hands them to the policy engine
 * (t3team-recipeTriggerRunnerCore.ts), which applies debounce / interval / concurrency /
 * daily-cap and launches headless runs through t3team-recipeHeadlessLaunch.ts.
 */
import { ProjectId } from "@t3tools/contracts";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as EffectFileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as EffectPath from "effect/Path";

import { WorkflowJournalStore } from "./persistence/SqliteJournalStore.ts";
import { WorkflowRunRepository } from "./persistence/WorkflowRuns.ts";
import { WorkflowSignalStore } from "./persistence/WorkflowSignalStore.ts";
import { ProjectStoreV2 } from "./orchestration-v2/ProjectStore.ts";
import { launchHeadlessRecipeWorkflow } from "./t3team-recipeHeadlessLaunch.ts";
import { listProjectRecipesForAgent } from "./t3team-recipeAgentList.ts";
import { importRecipeModuleRef } from "./t3team-projectRecipeDiscoveryModule.ts";
import { T3TeamScriptHost } from "./t3team-scriptHostContext.ts";
import { readRecipeTriggerSettings } from "./t3team-recipeTriggerSettings.ts";
import { reconcileRecipeTriggerRegistrations } from "./t3team-recipeTriggerReconcile.ts";
import type {
  LiveTrigger,
  RecipeTriggerEngine,
  RecipeTriggerLaunchRequest,
} from "./t3team-recipeTriggerRunnerCore.ts";
import { makeRecipeTriggerEngine } from "./t3team-recipeTriggerRunnerCore.ts";
import { T3TeamWorkflowEngineRegistry } from "./t3team-workflowEngineRegistry.ts";
import { T3TeamWorkflowHost } from "./t3team-workflowHost.ts";
import { T3TeamWorkflowScheduler } from "./t3team-workflowScheduler.ts";
import { T3TeamWorkflowSignalReconciler } from "./t3team-workflowSignalReconciler.ts";
import { makeSignalPollTimer } from "./t3team-workflowSignalSweepTimer.ts";

/** DRAIN cadence; DRAIN_LIMIT bounds each read; RECONCILE re-reads recipes/settings each minute. */
const DRAIN_TICK_MS = 10_000;
const DRAIN_LIMIT = 50;
const RECONCILE_EVERY_MS = 60_000;

export interface RecipeTriggerRunnerShape {
  readonly start: () => Effect.Effect<void, never, never>;
  readonly stop: () => Effect.Effect<void, never, never>;
}

export class T3TeamRecipeTriggerRunner extends Context.Service<
  T3TeamRecipeTriggerRunner,
  RecipeTriggerRunnerShape
>()("t3/t3team-recipeTriggerRunner/T3TeamRecipeTriggerRunner") {}

export const T3TeamRecipeTriggerRunnerLive = Layer.effect(
  T3TeamRecipeTriggerRunner,
  Effect.gen(function* () {
    const projectsStore = yield* ProjectStoreV2;
    const store = yield* WorkflowSignalStore;
    const reconcilerService = Option.getOrUndefined(
      yield* Effect.serviceOption(T3TeamWorkflowSignalReconciler),
    );
    // The ambient app composition (the same narrowing the signal reconciler uses for its
    // source-side callbacks): each helper casts it to the services its effect needs.
    const ambient = yield* Effect.context<never>();
    type FsServices = EffectFileSystem.FileSystem | EffectPath.Path | Clock.Clock;
    type LaunchServices =
      | FsServices
      | T3TeamWorkflowHost
      | T3TeamWorkflowEngineRegistry
      | WorkflowRunRepository
      | WorkflowJournalStore
      | T3TeamWorkflowScheduler
      | T3TeamScriptHost;
    const runProjects = <A, E>(e: Effect.Effect<A, E, ProjectStoreV2>): Promise<A> =>
      Effect.runPromiseWith(ambient as Context.Context<ProjectStoreV2>)(e);
    const runStore = <A, E>(e: Effect.Effect<A, E, WorkflowSignalStore>): Promise<A> =>
      Effect.runPromiseWith(ambient as Context.Context<WorkflowSignalStore>)(e);
    const runFs = <A, E>(e: Effect.Effect<A, E, FsServices>): Promise<A> =>
      Effect.runPromiseWith(ambient as Context.Context<FsServices>)(e);
    const runLaunch = <A, E>(e: Effect.Effect<A, E, LaunchServices>): Promise<A> =>
      Effect.runPromiseWith(ambient as Context.Context<LaunchServices>)(e);

    const log = (message: string, fields?: unknown): void => {
      Effect.runSync(Effect.logWarning(message, fields as Record<string, unknown>));
    };

    let liveTriggers: readonly LiveTrigger[] = [];
    let lastReconcileAtMs = 0;

    const reconcile = async (): Promise<void> => {
      const projects = await runProjects(projectsStore.list()).then((rows) =>
        rows.map((row) => ({
          projectId: row.projectId,
          workspaceRoot: row.workspaceRoot,
          defaultModelSelection: row.defaultModelSelection,
        })),
      );
      liveTriggers = await reconcileRecipeTriggerRegistrations({
        projects,
        store: {
          upsertRegistration: (input) => runStore(store.upsertRegistration(input)),
          deleteRegistration: (input) => runStore(store.deleteRegistration(input)),
          listTriggerRegistrations: () => runStore(store.listTriggerRegistrations()),
        },
        readSettings: (workspaceRoot) => runFs(readRecipeTriggerSettings({ workspaceRoot })),
        listRecipes: (workspaceRoot) => runFs(listProjectRecipesForAgent({ workspaceRoot })),
        importRecipeRef: (modulePath) => runFs(importRecipeModuleRef(modulePath)),
        reconciler: reconcilerService === undefined ? undefined : reconcilerService,
        log,
      });
      lastReconcileAtMs = DateTime.toEpochMillis(DateTime.nowUnsafe());
    };

    const engine: RecipeTriggerEngine = makeRecipeTriggerEngine({
      nowMs: () => DateTime.toEpochMillis(DateTime.nowUnsafe()),
      log,
      claim: async (key, instance) => {
        let taken = 0;
        for (;;) {
          const entry = await runStore(
            store.takeOpenInboxEntry({
              sourceName: instance.sourceName,
              paramsHash: instance.paramsHash,
              signalName: instance.signalName,
              key,
              deliveredAt: DateTime.formatIso(DateTime.nowUnsafe()),
            }),
          );
          if (Option.isNone(entry)) break;
          taken += 1;
          if (taken >= DRAIN_LIMIT) break;
        }
        return taken > 0;
      },
      launch: async (request: RecipeTriggerLaunchRequest) => {
        const trigger = liveTriggers.find(
          (c) =>
            c.projectId === request.projectId &&
            c.recipeId === request.recipeId &&
            c.triggerId === request.triggerId,
        );
        if (trigger === undefined || trigger.modelSelection === null) {
          throw new Error("trigger no longer registered (settings or model selection changed)");
        }
        await runLaunch(
          launchHeadlessRecipeWorkflow({
            projectId: ProjectId.make(request.projectId),
            workspaceRoot: trigger.workspaceRoot,
            recipePath: trigger.recipePath,
            workflowPath: trigger.workflowPath,
            recipe: {
              id: trigger.recipeId,
              ...(trigger.action === "default" ? {} : { action: trigger.action }),
            },
            args: request.args,
            modelSelection: trigger.modelSelection,
            allowedToolGroups: trigger.allowedToolGroups,
            origin: "trigger",
          }),
        );
      },
    });

    const drain = async (): Promise<void> => {
      for (const trigger of [...liveTriggers]) {
        if (trigger.modelSelection === null) continue;
        const entries = await runStore(
          store.listUndeliveredInboxEntries({ ...trigger.instance, limit: DRAIN_LIMIT }),
        ).catch(() => [] as const);
        if (entries.length === 0) continue;
        await engine.processEvents({
          projectId: trigger.projectId,
          recipeId: trigger.recipeId,
          triggerId: trigger.triggerId,
          select: trigger.select,
          key: trigger.key,
          settings: trigger.settings,
          selectContext: { settings: trigger.storedSetting },
          instance: trigger.instance,
          events: entries.map((entry) => ({
            id: entry.id,
            payload: entry.payload,
            createdAtMs: Date.parse(entry.createdAt),
          })),
        });
      }
    };

    const timer = makeSignalPollTimer();
    const tick = (): void => {
      void (async () => {
        try {
          if (
            DateTime.toEpochMillis(DateTime.nowUnsafe()) - lastReconcileAtMs >=
            RECONCILE_EVERY_MS
          ) {
            await reconcile();
          }
          await drain();
        } catch (error) {
          log("tick failed", String(error));
        } finally {
          timer.schedule(tick, DRAIN_TICK_MS);
        }
      })();
    };

    return T3TeamRecipeTriggerRunner.of({
      start: () =>
        Effect.sync(() => {
          void reconcile().catch((error) => log("initial reconcile failed", String(error)));
          timer.schedule(tick, DRAIN_TICK_MS);
        }),
      stop: () => Effect.sync(() => timer.stop()),
    });
  }),
);
