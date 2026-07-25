/**
 * Recipe/orchestration E2E harness (Epic 25 §Host wiring).
 *
 * Launches a real recipe workflow against a fixture-backed project on the REAL engine +
 * resume reactor, with the model stubbed at the provider seam, and reports what actually
 * happened: phases, `scripts.*` calls, emitted widgets, asks answered, the durable
 * `workflow_runs` row and the run's return value. Browser-free, network-free, so it runs in CI.
 *
 * This module is the entry point only; the phases live in focused siblings:
 * `…HarnessSetup` (fixture + project), `…HarnessLaunch` (durable row + launch),
 * `…HarnessLoop` (ask/answer + completion polling), `…HarnessReport` (report shaping).
 */
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { WorkflowJournalStore } from "./persistence/Services/WorkflowJournalStore.ts";
import { WorkflowRunRepository } from "./persistence/Services/WorkflowRuns.ts";
import { launchT3workRecipeHarnessRun } from "./t3work-recipeWorkflowHarnessLaunch.ts";
import { driveT3workRecipeHarnessAsks } from "./t3work-recipeWorkflowHarnessLoop.ts";
import { assembleT3workRecipeHarnessReport } from "./t3work-recipeWorkflowHarnessReport.ts";
import { readT3workHarnessScriptLog } from "./t3work-recipeWorkflowHarnessScriptLog.ts";
import {
  cleanupT3workRecipeHarnessRoots,
  prepareT3workRecipeHarnessProject,
} from "./t3work-recipeWorkflowHarnessSetup.ts";
import {
  makeT3workRecipeHarnessStubProvider,
  type T3workRecipeHarnessCapture,
} from "./t3work-recipeWorkflowHarnessStub.ts";

export type T3workRecipeHarnessSpec = {
  /** Directory holding the recipe module (`recipe.ts`) and its `workflow.ts`. */
  readonly recipeDir: string;
  /** Fixture directory ingested into the harness workspace before the launch. */
  readonly fixtureRoot: string;
  /** Deterministic assistant replies, one per agent turn, in order. */
  readonly replies: ReadonlyArray<string>;
  /** Deterministic answers for each `askUser`, in order. */
  readonly answers?: ReadonlyArray<string>;
  readonly args?: unknown;
  readonly timeoutMs?: number;
  /** Shared capture so a caller (the CLI runner) sees the same commands/prompts. */
  readonly capture?: T3workRecipeHarnessCapture;
};

export function runT3workRecipeWorkflowHarness(spec: T3workRecipeHarnessSpec) {
  return Effect.gen(function* () {
    const timeoutMs = spec.timeoutMs ?? 20_000;
    const runRepository = yield* WorkflowRunRepository;
    const journalStore = yield* WorkflowJournalStore;

    const prepared = yield* prepareT3workRecipeHarnessProject({
      recipeDir: spec.recipeDir,
      fixtureRoot: spec.fixtureRoot,
    });
    const capture: T3workRecipeHarnessCapture = spec.capture ?? {
      commands: [],
      agentPrompts: [],
    };

    const { launched, liveRow, completed } = yield* launchT3workRecipeHarnessRun({
      recipe: prepared.recipe,
      args: spec.args ?? {},
      runId: prepared.runId,
      launchThreadId: prepared.launchThreadId,
      projectId: prepared.projectId,
      modelSelection: prepared.modelSelection,
      runsRoot: prepared.runsRoot,
      capture,
    });

    const asksAnswered = yield* driveT3workRecipeHarnessAsks({
      runId: prepared.runId,
      launchThreadId: prepared.launchThreadId,
      answers: spec.answers ?? [],
      completed,
      launchStatus: launched.status,
      timeoutMs,
    });

    const row = Option.isSome(liveRow)
      ? liveRow
      : yield* runRepository.getById({ runId: prepared.runId });
    // Recorded truth, read BEFORE the temp roots are dropped: the journal is what the run
    // actually dispatched, so `scriptCalls` is an invocation log rather than a declaration list.
    const scriptLog = yield* Effect.promise(() =>
      readT3workHarnessScriptLog({
        store: journalStore,
        runId: prepared.runId,
        declaredScripts: prepared.recipe.scriptNames,
      }),
    );
    cleanupT3workRecipeHarnessRoots(prepared);
    return assembleT3workRecipeHarnessReport({
      recipeId: prepared.recipe.id,
      scriptLog,
      commands: capture.commands,
      completed,
      launchStatus: launched.status,
      asksAnswered,
      workflowRun: Option.isSome(row)
        ? {
            runId: row.value.runId,
            status: row.value.status,
            workflowPath: row.value.workflowPath,
          }
        : null,
      seededWorkItemCount: prepared.seeded.workItemCount,
    });
  });
}

export { makeT3workRecipeHarnessStubProvider };
