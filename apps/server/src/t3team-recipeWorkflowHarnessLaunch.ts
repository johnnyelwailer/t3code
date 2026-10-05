/**
 * The recipe E2E harness launch (Epic 25 §Host wiring).
 *
 * Wires the durable `workflow_runs` row + journal exactly as the server does, then calls the REAL
 * `launchWorkflowRecipe` through the real workflow host, wrapped so every host operation is also
 * recorded for the report.
 */
import type { ModelSelection, ProjectId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import { WorkflowRunRepository } from "./persistence/Services/WorkflowRuns.ts";
import { WorkflowJournalStore } from "./persistence/Services/WorkflowJournalStore.ts";
import type { T3TeamRecipeHarnessRecipe } from "./t3team-recipeWorkflowHarnessRecipe.ts";
import { T3TEAM_HARNESS_ISO as ISO } from "./t3team-recipeWorkflowHarnessSetup.ts";
import {
  recordingWorkflowHostPort,
  type T3TeamRecipeHarnessCapture,
} from "./t3team-recipeWorkflowHarnessStub.ts";
import {
  buildRunningWorkflowRunRow,
  makeWorkflowRunLifecycle,
} from "./t3team-workflowEngineDurability.ts";
import { launchWorkflowRecipe } from "./t3team-workflowEngineLaunch.ts";
import { T3TeamWorkflowEngineRegistry } from "./t3team-workflowEngineRegistry.ts";
import { T3TeamWorkflowHost, toWorkflowHostPort } from "./t3team-workflowHost.ts";

export function launchT3TeamRecipeHarnessRun(input: {
  readonly recipe: T3TeamRecipeHarnessRecipe;
  readonly args: unknown;
  readonly runId: string;
  readonly launchThreadId: string;
  readonly projectId: ProjectId;
  readonly modelSelection: ModelSelection;
  readonly runsRoot: string;
  /** Shared capture so a caller (the CLI runner) sees the same commands/prompts. */
  readonly capture: T3TeamRecipeHarnessCapture;
}) {
  return Effect.gen(function* () {
    const registry = yield* T3TeamWorkflowEngineRegistry;
    const runRepository = yield* WorkflowRunRepository;
    const journalStore = yield* WorkflowJournalStore;
    const host = recordingWorkflowHostPort(
      toWorkflowHostPort(yield* T3TeamWorkflowHost),
      input.capture,
    );

    const completed: unknown[] = [];
    let seq = 0;

    // Durable run record + journal, exactly as the server wires them, so the harness can assert
    // a real `workflow_runs` row rather than only in-memory registry state.
    const runRow = buildRunningWorkflowRunRow({
      runId: input.runId,
      workflowPath: input.recipe.workflowPath,
      args: input.args,
      launchThreadId: input.launchThreadId,
      projectId: input.projectId,
      modelSelection: input.modelSelection,
      runtimeMode: "full-access",
      interactionMode: "default",
      nowIso: ISO,
    });
    const lifecycle = makeWorkflowRunLifecycle({
      repo: runRepository,
      row: runRow,
      nowIso: () => ISO,
      host,
    });

    const launched = yield* Effect.promise(() =>
      launchWorkflowRecipe({
        runId: input.runId,
        workflowPath: input.recipe.workflowPath,
        args: input.args,
        scripts: input.recipe.scripts,
        store: journalStore,
        lifecycle,
        runsRoot: input.runsRoot,
        launchThreadId: input.launchThreadId,
        projectId: input.projectId,
        modelSelection: input.modelSelection,
        runtimeMode: "full-access",
        interactionMode: "default",
        registry,
        host,
        newId: () => `harness-id-${(seq += 1)}`,
        nowIso: () => ISO,
        onComplete: async (output) => {
          completed.push(output);
        },
      }),
    );

    // The durable run row exists while the run is live; completion removes it, so read it here.
    const liveRow = yield* runRepository.getById({ runId: input.runId });

    return { launched, liveRow, completed };
  });
}
