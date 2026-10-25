// @effect-diagnostics globalTimers:off -- the runner owns its reconcile/drain tick cadence:
// the poll timer is created on start() and cleared by stop() (same seam as makeSignalPollTimer).
/**
 * The recipe trigger runner (S5b) — the host-side service that turns recipe TRIGGERS into
 * headless runs: RECONCILE (every minute) maintains the durable `trigger:<recipe>:<id>`
 * registration set (t3team-recipeTriggerReconcile.ts), from which the EXISTING signal
 * reconciler starts/stops the source instances; DRAIN (every ten seconds) lists each enabled
 * trigger's undelivered inbox events and hands them to the policy engine
 * (t3team-recipeTriggerRunnerCore.ts), which applies debounce / interval / concurrency /
 * daily-cap and claims each launch durably; the launcher (t3team-recipeTriggerLauncher.ts) turns a
 * claimed ledger row into a headless run and re-drives pending rows on every drain.
 */
import { readFeatureFlag } from "@t3tools/project-context/t3teamFeatureFlags";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { WorkflowRunRepository } from "./persistence/WorkflowRuns.ts";
import { WorkflowSignalStore } from "./persistence/WorkflowSignalStore.ts";
import { WorkflowTriggerLaunchStore } from "./persistence/t3team-WorkflowTriggerLaunchStore.ts";
import { ProjectStoreV2 } from "./orchestration-v2/ProjectStore.ts";
import { t3teamRandomUUID } from "./t3team-random.ts";
import { listProjectRecipesForAgent } from "./t3team-recipeAgentList.ts";
import { importRecipeModuleRef } from "./t3team-projectRecipeDiscoveryModule.ts";
import { readRecipeTriggerSettings } from "./t3team-recipeTriggerSettings.ts";
import { reconcileRecipeTriggerRegistrations } from "./t3team-recipeTriggerReconcile.ts";
import { makeTriggerRunnerAmbient } from "./t3team-recipeTriggerRunnerAmbient.ts";
import { makeRecipeTriggerLauncher } from "./t3team-recipeTriggerLauncher.ts";
import type { LiveTrigger } from "./t3team-recipeTriggerRunnerCore.ts";
import { makeRecipeTriggerEngine } from "./t3team-recipeTriggerRunnerCore.ts";
import {
  makeTriggerEnginePorts,
  makeTriggerLauncherPorts,
} from "./t3team-recipeTriggerRunnerPorts.ts";
import { T3TeamWorkflowSignalReconciler } from "./t3team-workflowSignalReconciler.ts";
import { makeSignalPollTimer } from "./t3team-workflowSignalSweepTimer.ts";

/** DRAIN cadence; DRAIN_LIMIT bounds each read; RECONCILE re-reads recipes/settings each minute. */
const DRAIN_TICK_MS = 10_000;
const DRAIN_LIMIT = 50;
const RECONCILE_EVERY_MS = 60_000;
/** Settled ledger rows outlive the daily-cap window and the signal inbox TTL, then go. */
const LEDGER_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

/** Read on every tick, so Settings → Features stops and resumes triggers without a restart. While
 * off, a tick neither reconciles nor launches; events wait in the inbox for the next enabled tick. */
const recipeTriggersEnabled = (): boolean => readFeatureFlag("ORCHESTRATION_RECIPE_TRIGGERS");

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
    const ledger = yield* WorkflowTriggerLaunchStore;
    const runs = yield* WorkflowRunRepository;
    const reconcilerService = Option.getOrUndefined(
      yield* Effect.serviceOption(T3TeamWorkflowSignalReconciler),
    );
    // The ambient app composition narrowed to each effect's service set (the helpers run
    // effects against that context; see t3team-recipeTriggerRunnerAmbient.ts).
    const ambient = makeTriggerRunnerAmbient(yield* Effect.context<never>());
    const { runProjects, runStore, runFs, log } = ambient;

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
      await ambient.runLedger(
        ledger.purgeSettledBefore(
          DateTime.formatIso(
            DateTime.subtract(DateTime.nowUnsafe(), { milliseconds: LEDGER_RETENTION_MS }),
          ),
        ),
      );
    };

    const launcher = makeRecipeTriggerLauncher(
      makeTriggerLauncherPorts({ ledger, runs, ambient, liveTriggers: () => liveTriggers }),
    );
    const engine = makeRecipeTriggerEngine(
      makeTriggerEnginePorts({
        ledger,
        ambient,
        newLaunchId: t3teamRandomUUID,
        launch: (request) => void launcher.launch(request),
      }),
    );

    const drain = async (): Promise<void> => {
      // Retries need the live trigger set, so none run before the first reconcile filled it. They
      // are not awaited: a slow launch must not hold up the drain (`launching` dedupes overlap).
      if (lastReconcileAtMs > 0) {
        void launcher.retryDue().catch((error) => log("launch retry failed", String(error)));
      }
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
          if (!recipeTriggersEnabled()) return;
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
          if (recipeTriggersEnabled()) {
            void reconcile().catch((error) => log("initial reconcile failed", String(error)));
          }
          timer.schedule(tick, DRAIN_TICK_MS);
        }),
      stop: () => Effect.sync(() => timer.stop()),
    });
  }),
);
