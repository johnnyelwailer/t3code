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
} from "./t3team-workflowEngineBrokerTypes.ts";

export async function dispatchWorkflowChild(
  deps: WorkflowEngineBrokerDeps,
  payload: ThreadCreatePayload,
  // Pre-resolved by the broker BEFORE this fire-and-forget path (see the `thread.create`
  // branch in t3team-workflowEngineBroker.ts) so validation failures reject the send.
  modelSelection: ModelSelection,
): Promise<void> {
  deps.registry.registerChildThread(deps.runId, payload.threadId);
  const childTitle = payload.name ?? "Workflow thread";
  const createdAt = deps.nowIso();
  await deps.dispatch({
    type: "thread.create",
    commandId: CommandId.make(`t3team-wf:create:${deps.newId()}`),
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
  await deps.dispatch(
    buildWorkflowChildPlacementCommand({
      parentThreadId: deps.launchThreadId,
      childThreadId: payload.threadId,
      childTitle,
      workflowRunId: deps.runId,
      commandId: deps.newId(),
      createdAt,
    }),
  );
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
    commandId: CommandId.make(`t3team-wf:placement:${input.commandId}`),
    threadId: ThreadId.make(input.childThreadId),
    activity: {
      id: EventId.make(`t3team-wf-placement:${input.workflowRunId}:${input.childThreadId}`),
      tone: "info",
      kind: "t3team.handoff.created",
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
