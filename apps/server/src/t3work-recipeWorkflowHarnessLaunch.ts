/**
 * The recipe E2E harness launch (Epic 25 §Host wiring).
 *
 * Wires the durable `workflow_runs` row + journal exactly as the server does, then calls the REAL
 * `launchWorkflowRecipe` through a dispatch that both records commands for the report and reaches
 * the same engine instance the stub provider subscribed to.
 */
import type { ModelSelection, OrchestrationCommand, ProjectId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import { OrchestrationEngineService } from "./orchestration/Services/OrchestrationEngine.ts";
import { WorkflowRunRepository } from "./persistence/Services/WorkflowRuns.ts";
import { WorkflowJournalStore } from "./persistence/Services/WorkflowJournalStore.ts";
import type { T3workRecipeHarnessRecipe } from "./t3work-recipeWorkflowHarnessRecipe.ts";
import { T3WORK_HARNESS_ISO as ISO } from "./t3work-recipeWorkflowHarnessSetup.ts";
import type { T3workRecipeHarnessCapture } from "./t3work-recipeWorkflowHarnessStub.ts";
import {
  buildRunningWorkflowRunRow,
  makeWorkflowRunLifecycle,
} from "./t3work-workflowEngineDurability.ts";
import { launchWorkflowRecipe } from "./t3work-workflowEngineLaunch.ts";
import { T3workWorkflowEngineRegistry } from "./t3work-workflowEngineRegistry.ts";

export function launchT3workRecipeHarnessRun(input: {
  readonly recipe: T3workRecipeHarnessRecipe;
  readonly args: unknown;
  readonly runId: string;
  readonly launchThreadId: string;
  readonly projectId: ProjectId;
  readonly modelSelection: ModelSelection;
  readonly runsRoot: string;
  /** Shared capture so a caller (the CLI runner) sees the same commands/prompts. */
  readonly capture: T3workRecipeHarnessCapture;
}) {
  return Effect.gen(function* () {
    const orchestration = yield* OrchestrationEngineService;
    const registry = yield* T3workWorkflowEngineRegistry;
    const runRepository = yield* WorkflowRunRepository;
    const journalStore = yield* WorkflowJournalStore;

    const completed: unknown[] = [];
    let seq = 0;
    // runPromiseWith(context), not runPromise: a bare runPromise starts a SEPARATE services
    // invocation, so dispatched commands never reached the engine instance the stub provider
    // subscribed to and the body hung forever on its first agent() ask.
    const context = yield* Effect.context<never>();
    const runDetached = Effect.runPromiseWith(context);
    const dispatch = (command: OrchestrationCommand): Promise<void> => {
      input.capture.commands.push(command);
      return runDetached(orchestration.dispatch(command)).then(() => undefined);
    };

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
        dispatch,
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
