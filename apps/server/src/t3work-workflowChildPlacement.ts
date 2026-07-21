import {
  CommandId,
  EventId,
  type ModelSelection,
  type OrchestrationCommand,
  ThreadId,
} from "@t3tools/contracts";

import type {
  ThreadCreatePayload,
  WorkflowEngineBrokerDeps,
} from "./t3work-workflowEngineBrokerTypes.ts";

export async function dispatchWorkflowChild(
  deps: WorkflowEngineBrokerDeps,
  payload: ThreadCreatePayload,
  // Pre-resolved by the broker BEFORE this fire-and-forget path (see the `thread.create`
  // branch in t3work-workflowEngineBroker.ts) so validation failures reject the send.
  modelSelection: ModelSelection,
): Promise<void> {
  deps.registry.registerChildThread(deps.runId, payload.threadId);
  const childTitle = payload.name ?? "Workflow thread";
  const createdAt = deps.nowIso();
  await deps.dispatch({
    type: "thread.create",
    commandId: CommandId.make(`t3work-wf:create:${deps.newId()}`),
    threadId: ThreadId.make(payload.threadId),
    projectId: deps.projectId,
    title: childTitle,
    modelSelection,
    runtimeMode: deps.runtimeMode,
    interactionMode: deps.interactionMode,
    branch: null,
    worktreePath: null,
    retention: payload.retention ?? "ephemeral",
    createdAt,
  });
  // The child thread must exist for its turn and the inline Work log's Open
  // thread action, but one-shot workflow children do not become navigation.
  if (deps.launchThreadId === undefined || payload.retention !== "retained") return;
  for (const command of buildWorkflowChildPlacementCommands({
    parentThreadId: deps.launchThreadId,
    childThreadId: payload.threadId,
    childTitle,
    workflowRunId: deps.runId,
    newId: deps.newId,
    createdAt,
  })) {
    await deps.dispatch(command);
  }
}

/**
 * Both sides of the placement handshake, mirroring `start_child`'s
 * `appendStartChildHandoffActivities`: `t3work.handoff.created` on the CHILD (what the
 * sidebar reads when the child's own activities are loaded / via the placements route) AND
 * `t3work.handoff.started` on the PARENT (what `indexT3workChildParentThreads` reads so the
 * child nests immediately, before its thread detail is ever opened). Without the parent-side
 * half a freshly spawned retained child rendered flat until a placement refetch.
 */
export function buildWorkflowChildPlacementCommands(input: {
  readonly parentThreadId: string;
  readonly childThreadId: string;
  readonly childTitle: string;
  readonly workflowRunId: string;
  readonly newId: () => string;
  readonly createdAt: string;
}): ReadonlyArray<OrchestrationCommand> {
  const payload = {
    parentThreadId: input.parentThreadId,
    childThreadId: input.childThreadId,
    childTitle: input.childTitle,
    workflowRunId: input.workflowRunId,
  };
  return [
    buildWorkflowChildPlacementCommand({ ...input, commandId: input.newId() }),
    {
      type: "thread.activity.append",
      commandId: CommandId.make(`t3work-wf:placement-started:${input.newId()}`),
      threadId: ThreadId.make(input.parentThreadId),
      activity: {
        id: EventId.make(
          `t3work-wf-placement-started:${input.workflowRunId}:${input.childThreadId}`,
        ),
        tone: "info",
        kind: "t3work.handoff.started",
        summary: `Started child session ${input.childTitle}`,
        payload,
        turnId: null,
        createdAt: input.createdAt,
      },
      createdAt: input.createdAt,
    },
  ];
}

export function buildWorkflowChildPlacementCommand(input: {
  readonly parentThreadId: string;
  readonly childThreadId: string;
  readonly childTitle: string;
  readonly workflowRunId: string;
  readonly commandId: string;
  readonly createdAt: string;
}): OrchestrationCommand {
  return {
    type: "thread.activity.append",
    commandId: CommandId.make(`t3work-wf:placement:${input.commandId}`),
    threadId: ThreadId.make(input.childThreadId),
    activity: {
      id: EventId.make(`t3work-wf-placement:${input.workflowRunId}:${input.childThreadId}`),
      tone: "info",
      kind: "t3work.handoff.created",
      summary: "Created by workflow",
      payload: {
        parentThreadId: input.parentThreadId,
        childThreadId: input.childThreadId,
        childTitle: input.childTitle,
        workflowRunId: input.workflowRunId,
      },
      turnId: null,
      createdAt: input.createdAt,
    },
    createdAt: input.createdAt,
  };
}
