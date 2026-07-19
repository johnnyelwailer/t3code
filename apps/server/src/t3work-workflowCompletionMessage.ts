import {
  CommandId,
  MessageId,
  type OrchestrationCommand,
  ThreadId,
} from "@t3tools/contracts";

function formatWorkflowOutput(output: unknown): string {
  if (typeof output === "string") return output;
  if (output === undefined) return "Workflow completed.";
  try {
    return JSON.stringify(output, null, 2) ?? String(output);
  } catch {
    return String(output);
  }
}

export async function deliverWorkflowCompletion(input: {
  readonly launchThreadId: string | undefined;
  readonly workflowRunId: string;
  readonly output: unknown;
  readonly dispatch: (command: OrchestrationCommand) => Promise<void>;
  readonly newId: () => string;
  readonly nowIso: () => string;
}): Promise<void> {
  if (input.launchThreadId === undefined) return;
  const createdAt = input.nowIso();
  await input
    .dispatch({
      type: "thread.message.upsert",
      commandId: CommandId.make(`t3work-wf:complete:${input.newId()}`),
      threadId: ThreadId.make(input.launchThreadId),
      message: {
        messageId: MessageId.make(`t3work-wf-result:${input.workflowRunId}`),
        role: "assistant",
        text: formatWorkflowOutput(input.output),
        turnId: null,
        streaming: false,
      },
      createdAt,
    })
    .catch(() => {});
}
