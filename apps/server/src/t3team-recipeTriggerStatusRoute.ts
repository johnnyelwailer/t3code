/**
 * `GET /api/t3team/recipe-triggers/status[?projectId=…]` — the recipe-trigger diagnostics reading
 * (t3team-recipeTriggerStatus.ts) over HTTP, for the settings surface and for agents. Read-only:
 * triggers are switched on and scoped through the existing settings primitives — Settings →
 * Features for the flags, and the project's `.t3team/recipe-triggers.json` (`enabled`,
 * `overrides`, `scope.query`).
 */
import { readFeatureFlag } from "@t3tools/project-context/t3teamFeatureFlags";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { HttpRouter, HttpServerRequest } from "effect/http";

import { ProjectStoreV2 } from "./orchestration-v2/ProjectStore.ts";
import { WorkflowSignalStore, WorkflowSignalStoreLive } from "./persistence/WorkflowSignalStore.ts";
import {
  WorkflowTriggerLaunchStore,
  WorkflowTriggerLaunchStoreLive,
} from "./persistence/t3team-WorkflowTriggerLaunchStore.ts";
import { errorResponse, okJson } from "./t3team-atlassian-http.ts";
import { importRecipeModuleRef } from "./t3team-projectRecipeDiscoveryModule.ts";
import { toT3TeamError } from "./t3team-project-repository-utils.ts";
import { listProjectRecipesForAgent } from "./t3team-recipeAgentList.ts";
import { makeTriggerRunnerAmbient } from "./t3team-recipeTriggerRunnerAmbient.ts";
import { readRecipeTriggerSettings } from "./t3team-recipeTriggerSettings.ts";
import { readRecipeTriggerStatus } from "./t3team-recipeTriggerStatus.ts";
import { T3TeamWorkflowSignalReconciler } from "./t3team-workflowSignalReconciler.ts";
import { isWorkflowSignalSourcesEnabled } from "./t3team-workflowSignalSourcesFlag.ts";

const readStatus = Effect.fn("t3team.recipeTriggers.status")(function* (projectId: string) {
  const ambient = makeTriggerRunnerAmbient(yield* Effect.context<never>());
  const signals = yield* WorkflowSignalStore;
  const ledger = yield* WorkflowTriggerLaunchStore;
  const reconciler = Option.getOrUndefined(
    yield* Effect.serviceOption(T3TeamWorkflowSignalReconciler),
  );
  const projects = (yield* (yield* ProjectStoreV2).list())
    .filter((row) => projectId === "" || row.projectId === projectId)
    .map((row) => ({
      projectId: row.projectId,
      workspaceRoot: row.workspaceRoot,
      defaultModelSelection: row.defaultModelSelection,
    }));
  const triggers = yield* Effect.promise(() =>
    readRecipeTriggerStatus({
      projects,
      readSettings: (workspaceRoot) => ambient.runFs(readRecipeTriggerSettings({ workspaceRoot })),
      listRecipes: (workspaceRoot) => ambient.runFs(listProjectRecipesForAgent({ workspaceRoot })),
      importRecipeRef: (modulePath) => ambient.runFs(importRecipeModuleRef(modulePath)),
      cursorUpdatedAt: async (instanceKey) =>
        Option.match(await ambient.runLedger(signals.getCursor(instanceKey)), {
          onNone: () => null,
          onSome: (cursor) => cursor.updatedAt,
        }),
      inboxSummary: (instance) => ambient.runLedger(ledger.inboxSummary(instance)),
      lastLaunch: async (trigger) =>
        (await ambient.runLedger(ledger.listRecent({ ...trigger, limit: 1 })))[0],
      instances: () => reconciler?.status() ?? [],
    }),
  );
  return {
    triggersEnabled: readFeatureFlag("ORCHESTRATION_RECIPE_TRIGGERS"),
    signalSourcesEnabled: isWorkflowSignalSourcesEnabled(),
    triggers,
  };
});

export const t3teamRecipeTriggerStatusRouteLayer = HttpRouter.add(
  "GET",
  "/api/t3team/recipe-triggers/status",
  Effect.gen(function* () {
    const url = HttpServerRequest.toURL(yield* HttpServerRequest.HttpServerRequest);
    const projectId = Option.isSome(url)
      ? (url.value.searchParams.get("projectId")?.trim() ?? "")
      : "";
    return okJson(yield* readStatus(projectId));
  }).pipe(
    Effect.provide(Layer.mergeAll(WorkflowSignalStoreLive, WorkflowTriggerLaunchStoreLive)),
    Effect.mapError((cause) => toT3TeamError(cause, "Failed to read the recipe triggers.")),
    Effect.catch(errorResponse),
  ),
);
