/**
 * Admitting an authoring run: everything the CALLER must be able to see before its tool call
 * returns, in the order durability demands — the run row (queued), ownership and the master stop,
 * the plan card (a placeholder named after the intent until the real shape replaces it in place),
 * the hidden author thread, and the "Authoring orchestration" step on the card. Split from
 * {@link ./t3team-workflowAuthorLaunch.ts}, which owns what happens once the author answers.
 */
import * as Effect from "effect/Effect";

import {
  createWorkflowAuthorThread,
  type WorkflowAuthorThreadDeps,
} from "./t3team-workflowAuthorTurn.ts";
import {
  createWorkflowStepActivityEmitter,
  workflowStepDetailSnippet,
} from "./t3team-workflowEngineStepActivities.ts";
import type {
  PreparedWorkflowLaunchDeps,
  PreparedWorkflowLaunchInput,
} from "./t3team-workflowEphemeralLaunchTypes.ts";
import { workflowAuthorStepDetail } from "./t3team-workflowAuthorModel.ts";
import { buildPreparedWorkflowLifecycle } from "./t3team-workflowEphemeralLifecycle.ts";
import { workflowAdmissionQueue } from "./t3team-workflowAdmissionQueue.ts";
import { buildWorkflowShapePreviewMessage } from "./t3team-workflowShapePreview.ts";

export const admitAuthoringRun = Effect.fn("admitAuthoringRun")(function* (input: {
  readonly launch: PreparedWorkflowLaunchDeps;
  readonly authorDeps: WorkflowAuthorThreadDeps;
  readonly prepared: PreparedWorkflowLaunchInput & {
    readonly intent: NonNullable<PreparedWorkflowLaunchInput["intent"]>;
    readonly launchThreadId: string;
  };
  readonly authorModelSelection: PreparedWorkflowLaunchInput["modelSelection"];
}) {
  const { launch, authorDeps, prepared } = input;
  const nowIso = authorDeps.nowIso;

  // Durable first, already `authoring`: one upsert, so a disconnect never leaves a `queued`
  // row that boot would try to launch before any source exists.
  const lifecycle = buildPreparedWorkflowLifecycle({
    deps: launch,
    run: prepared,
    nowIso,
    initialStatus: "authoring",
  });
  yield* Effect.promise(() => lifecycle.recordRunning());
  launch.registry.registerOwnership(prepared.runId, prepared.launchThreadId);
  let stopped = false;
  launch.registry.registerMasterStop(prepared.runId, async () => {
    stopped = true;
    workflowAdmissionQueue.cancel(prepared.runId);
    launch.registry.cancelRun(prepared.runId);
    await Effect.runPromise(
      launch.runRepository.clearPending({
        runId: prepared.runId,
        status: "cancelled",
        updatedAt: nowIso(),
      }),
    );
  });
  yield* Effect.promise(() =>
    launch.host.postMessage(
      buildWorkflowShapePreviewMessage({
        threadId: prepared.launchThreadId,
        workflowPath: prepared.workflowPath,
        sourceText: "",
        runId: prepared.runId,
        fallbackName: workflowStepDetailSnippet(prepared.intent.goal, 60),
      }),
    ),
  );
  const stepActivities = createWorkflowStepActivityEmitter({
    runId: prepared.runId,
    projectId: prepared.projectId,
    launchThreadId: prepared.launchThreadId,
    host: launch.host,
    nowIso,
  });
  const authorThreadId = yield* Effect.promise(() =>
    createWorkflowAuthorThread(authorDeps, {
      ...prepared,
      authorModelSelection: input.authorModelSelection,
    }),
  );
  const authorStepId = `${prepared.runId}:author`;
  // Deliberately NO threadId on this step: the card's status strip opens `step.threadId`, and the
  // author thread is hidden host machinery (review of fork #349) — nothing to open.
  yield* Effect.promise(() =>
    stepActivities.emitSent({
      correlationId: authorStepId,
      stepKind: "workflow.author",
      phase: "started",
      detail: workflowAuthorStepDetail({
        caller: prepared.modelSelection,
        author: input.authorModelSelection,
      }),
    }),
  );
  return { lifecycle, stepActivities, authorThreadId, authorStepId, isStopped: () => stopped };
});
