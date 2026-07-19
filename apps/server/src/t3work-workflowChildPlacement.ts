import {
  CommandId,
  EventId,
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
): Promise<void> {
  const childTitle = payload.name ?? "Workflow thread";
  const createdAt = deps.nowIso();
  await deps.dispatch({
    type: "thread.create",
    commandId: CommandId.make(`t3work-wf:create:${deps.newId()}`),
    threadId: ThreadId.make(payload.threadId),
    projectId: deps.projectId,
    title: childTitle,
    modelSelection: deps.modelSelection,
    runtimeMode: deps.runtimeMode,
    interactionMode: deps.interactionMode,
    branch: null,
    worktreePath: null,
    createdAt,
  });
  if (deps.launchThreadId === undefined) return;
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
    commandId: CommandId.make(`t3work-wf:placement:${input.commandId}`),
    threadId: ThreadId.make(input.childThreadId),
    activity: {
      id: EventId.make(`t3work-wf-placement:${input.workflowRunId}:${input.childThreadId}`),
      tone: "info",
      kind: "t3work.handoff.created",
      summary: `Created from workflow thread ${input.parentThreadId}`,
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
