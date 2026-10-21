import {
  CheckpointScopeId,
  CommandId,
  type OrchestrationV2DomainEvent,
  type OrchestrationV2ExecutionNode,
  type OrchestrationV2ProviderThread,
  type OrchestrationV2Run,
  type OrchestrationV2TurnItem,
  RunId,
  ThreadId,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";

import type * as EventSink from "./EventSink.ts";
import type * as IdAllocator from "@t3tools/provider-core/server/IdAllocator";
import type * as ProjectionStore from "./ProjectionStore.ts";

export const RESTORE_POINT_UNAVAILABLE_NOTICE = "Restore point unavailable for this turn.";

/**
 * Completes a run still waiting on a checkpoint capture that failed for good, so the
 * thread's queue can start. The turn's work stands; a notice in the checkpoint's place
 * tells the user it has no restore point.
 */
export const makeCompleteWithoutCheckpoint = (deps: {
  readonly eventSink: EventSink.EventSinkV2["Service"];
  readonly ids: IdAllocator.IdAllocatorV2["Service"];
  readonly projections: ProjectionStore.ProjectionStoreV2["Service"];
}) =>
  Effect.fn("orchestrationV2.checkpointCapture.completeWithoutCheckpoint")(function* (input: {
    readonly threadId: ThreadId;
    readonly runId: RunId;
    readonly scopeId: CheckpointScopeId;
  }) {
    const { run, rootNode, providerThread } = yield* deps.projections.getCheckpointCaptureContext(
      input.threadId,
      input,
    );
    if (run?.status !== "waiting") return;
    const completedAt = yield* DateTime.now;
    const commandId = CommandId.make(`command:effect:checkpoint.capture-failed:${run.id}`);
    const allocateEventId = () => deps.ids.allocate.event({ threadId: input.threadId, commandId });
    const base = {
      threadId: input.threadId,
      runId: run.id,
      providerInstanceId: run.providerInstanceId,
      occurredAt: completedAt,
    };
    const { delegatedCompletion: _delegatedCompletion, ...runWithoutDelegatedCompletion } = run;
    const events: Array<OrchestrationV2DomainEvent> = [];
    if (rootNode !== undefined && providerThread !== undefined) {
      events.push({
        ...base,
        id: yield* allocateEventId(),
        type: "turn-item.updated",
        nodeId: rootNode.id,
        payload: restorePointUnavailableItem({
          ids: deps.ids,
          run,
          rootNode,
          providerThread,
          completedAt,
        }),
      });
    }
    events.push({
      ...base,
      id: yield* allocateEventId(),
      type: "run.updated",
      ...(rootNode === undefined ? {} : { nodeId: rootNode.id }),
      payload: { ...runWithoutDelegatedCompletion, status: "completed", completedAt },
    });
    if (rootNode !== undefined) {
      events.push({
        ...base,
        id: yield* allocateEventId(),
        type: "node.updated",
        nodeId: rootNode.id,
        payload: { ...rootNode, status: "completed", completedAt },
      });
    }
    yield* deps.eventSink.commitCommand({
      commandId,
      threadId: input.threadId,
      commandType: "checkpoint.capture",
      acceptedAt: completedAt,
      effects: [],
      events,
    });
  });

/** Sits where the run's checkpoint item would, at the end of its turn. */
function restorePointUnavailableItem(input: {
  readonly ids: IdAllocator.IdAllocatorV2["Service"];
  readonly run: OrchestrationV2Run;
  readonly rootNode: OrchestrationV2ExecutionNode;
  readonly providerThread: OrchestrationV2ProviderThread;
  readonly completedAt: DateTime.Utc;
}): OrchestrationV2TurnItem {
  return {
    id: input.ids.derive.turnItemFromProviderItem({
      driver: input.providerThread.driver,
      nativeItemId: `checkpoint-unavailable:${input.run.id}`,
    }),
    threadId: input.run.threadId,
    runId: input.run.id,
    nodeId: input.rootNode.id,
    providerThreadId: input.providerThread.id,
    providerTurnId: input.rootNode.providerTurnId,
    nativeItemRef: null,
    parentItemId: null,
    ordinal: input.run.ordinal * 100 + 99,
    status: "completed",
    title: RESTORE_POINT_UNAVAILABLE_NOTICE,
    startedAt: input.completedAt,
    completedAt: input.completedAt,
    updatedAt: input.completedAt,
    type: "system_notice",
    message: RESTORE_POINT_UNAVAILABLE_NOTICE,
  };
}
