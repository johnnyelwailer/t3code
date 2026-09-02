/**
 * Shared launch-prep for durable workflow runs (ephemeral workflows, slice 1 — spec D10).
 *
 * Both launch surfaces call this ONE funnel so a recipe launch and an agent-authored ephemeral
 * launch drive through identical durability wiring:
 *   • the HTTP recipe-launch route (`t3team-thread-recipe-workflow-routes.ts`), which stamps the
 *     recipe-launch activity BEFORE calling in (composer-override disarm — recipe-only concern);
 *   • the `t3team.orchestration.run` tool handler (`t3team-toolBrokerWorkflowRunTools.ts`), which
 *     skips the stamp (no composer override to disarm) and passes origin `ephemeral`.
 * It builds the SQLite-backed lifecycle row (with `origin`), emits the best-effort play-as-shape
 * preview into the launch thread (observability — an unreadable source skips it), then launches
 * through `launchWorkflowRecipe`.
 */
import { hashArgs } from "@t3team/sdk";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { t3teamRandomUUID } from "./t3team-random.ts";
import {
  launchWorkflowRecipe,
  type LaunchWorkflowRecipeResult,
} from "./t3team-workflowEngineLaunch.ts";
import {
  replaceEphemeralWorkflowSourceAtomically,
  writeEphemeralWorkflowRepairAudit,
} from "./t3team-workflowEphemeralSource.ts";
import { getWorkflowRepairPolicy } from "./t3team-workflowRepairPolicy.ts";
import { resolveWorkflowAgentModel } from "./t3team-workflowAgentModelPolicy.ts";
import { workflowAdmissionQueue } from "./t3team-workflowAdmissionQueue.ts";
import { emitWorkflowShapePreview } from "./t3team-workflowShapePreviewEmit.ts";
import { buildPreparedWorkflowLifecycle } from "./t3team-workflowEphemeralLifecycle.ts";

function nowIso(): string {
  return DateTime.formatIso(DateTime.nowUnsafe());
}

// Contract types live in the types module (LOC cap); re-exported so importers stay valid.
export type {
  PreparedWorkflowLaunchDeps,
  PreparedWorkflowLaunchInput,
} from "./t3team-workflowEphemeralLaunchTypes.ts";
import type {
  PreparedWorkflowLaunchDeps,
  PreparedWorkflowLaunchInput,
} from "./t3team-workflowEphemeralLaunchTypes.ts";

/** Launch a prepared workflow through the durable engine; never fails (a run failure settles
 * as `status: "failed"` inside `launchWorkflowRecipe`). */
export const launchPreparedWorkflow = Effect.fn("launchPreparedWorkflow")(function* (
  deps: PreparedWorkflowLaunchDeps,
  input: PreparedWorkflowLaunchInput,
) {
  const repairPolicy = getWorkflowRepairPolicy();
  const pathService = deps.path;
  const ephemeralWorkflowPath =
    pathService === undefined
      ? undefined
      : pathService.join(input.workspaceRoot, ".t3team-runs", input.runId, "workflow.ts");
  const canReplaceEphemeralSource = input.workflowPath === ephemeralWorkflowPath;
  const lifecycle = buildPreparedWorkflowLifecycle({ deps, run: input, nowIso });
  // Admission is durable before any detached execution starts. A request disconnect after this
  // point leaves a recoverable run row, never an invisible source-only orphan.
  yield* Effect.promise(() => lifecycle.recordRunning());
  deps.registry.registerOwnership(input.runId, input.launchThreadId);
  deps.registry.registerMasterStop(input.runId, async () => {
    workflowAdmissionQueue.cancel(input.runId);
    await Effect.runPromise(
      deps.runRepository.clearPending({
        runId: input.runId,
        status: "cancelled",
        updatedAt: nowIso(),
      }),
    );
  });

  // Best-effort play-as-shape "plan" so the user sees WHAT THE WORKFLOW WILL DO while it spins up.
  yield* emitWorkflowShapePreview({
    fileSystem: deps.fileSystem,
    launchThreadId: input.launchThreadId,
    workflowPath: input.workflowPath,
    runId: input.runId,
    nowIso,
    dispatch: deps.dispatch,
  });
  if (input.onAdmitted !== undefined) {
    yield* Effect.promise(input.onAdmitted);
  }

  if (!(yield* Effect.promise(() => lifecycle.recordActive()))) {
    return { runId: input.runId, status: "suspended" as const };
  }
  if (input.origin === "ephemeral" && workflowAdmissionQueue.isCancelled(input.runId)) {
    lifecycle.releaseActive();
    return { runId: input.runId, status: "suspended" as const };
  }

  const result: LaunchWorkflowRecipeResult = yield* Effect.promise(() =>
    launchWorkflowRecipe({
      runId: input.runId,
      workflowPath: input.workflowPath,
      args: input.args,
      ...(input.scripts === undefined ? {} : { scripts: input.scripts }),
      ...(input.hostToolClient === undefined ? {} : { hostToolClient: input.hostToolClient }),
      runsRoot: `${input.workspaceRoot}/.t3team-runs`,
      launchThreadId: input.launchThreadId,
      projectId: input.projectId,
      modelSelection: input.modelSelection,
      defaultAgentModelSelection: resolveWorkflowAgentModel(input.modelSelection),
      runtimeMode: input.runtimeMode,
      interactionMode: input.interactionMode,
      registry: deps.registry,
      dispatch: deps.dispatch,
      newId: () => t3teamRandomUUID(),
      nowIso,
      store: deps.journalStore,
      lifecycle,
      lifecycleAlreadyRunning: true,
      ...(input.onComplete === undefined ? {} : { onComplete: input.onComplete }),
      ...(input.onError === undefined ? {} : { onError: input.onError }),
      ...(input.intent === undefined || !canReplaceEphemeralSource
        ? {}
        : { repairIntent: input.intent }),
      repairMaxAttempts:
        input.repairMaxAttempts ?? deps.repairMaxAttempts ?? repairPolicy.maxAttempts,
      repairModelSelection: deps.repairModelSelection ?? repairPolicy.modelSelection,
      repairTotalTimeBudgetMs: deps.repairTotalTimeBudgetMs ?? repairPolicy.totalTimeBudgetMs,
      ...(deps.generateRepairStructured === undefined
        ? {}
        : { generateRepairStructured: deps.generateRepairStructured }),
      allowRepairThreadFallback: false,
      // Unlike source replacement, correcting args needs no filesystem access — it writes the
      // durable run row (and the journal's args baseline; see below) through services this
      // funnel always has, so it is unconditional rather than folded into the fs-gated block.
      replaceWorkflowArgs: async (nextArgs: unknown) => {
        const argsHash = hashArgs(nextArgs);
        await Effect.runPromise(
          deps.runRepository.updateArgs({
            runId: input.runId,
            args: nextArgs,
            argsHash,
            updatedAt: nowIso(),
          }),
        );
        // resumeWorkflow's assertInputArgsMatch has no bypass policy (unlike
        // workflowVersionPolicy for source): it hard-fails replay at seq 0 unless the journal's
        // runMeta.argsHash already matches the args the resume is about to supply. Establish
        // that new baseline here, before the coordinator resumes.
        const meta = await deps.journalStore.readRunMeta(input.runId);
        if (meta !== undefined) {
          await deps.journalStore.writeRunMeta(input.runId, { ...meta, argsHash });
        }
      },
      ...(deps.fileSystem === undefined || pathService === undefined
        ? {}
        : {
            readWorkflowSource: () =>
              Effect.runPromise(deps.fileSystem!.readFileString(input.workflowPath)),
            replaceWorkflowSource: (source: string) =>
              Effect.runPromise(
                replaceEphemeralWorkflowSourceAtomically({
                  runsRoot: `${input.workspaceRoot}/.t3team-runs`,
                  runId: input.runId,
                  source,
                }).pipe(
                  Effect.provideService(FileSystem.FileSystem, deps.fileSystem!),
                  Effect.provideService(Path.Path, pathService!),
                ),
              ).then(() => undefined),
            recordRepairAudit: (audit) =>
              Effect.runPromise(
                writeEphemeralWorkflowRepairAudit({
                  runsRoot: `${input.workspaceRoot}/.t3team-runs`,
                  runId: input.runId,
                  timestamp: nowIso(),
                  ...audit,
                }).pipe(
                  Effect.provideService(FileSystem.FileSystem, deps.fileSystem!),
                  Effect.provideService(Path.Path, pathService!),
                ),
              ).then(() => undefined),
          }),
    }),
  );
  return result;
});
