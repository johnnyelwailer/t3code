import { CommandId, MessageId, type OrchestrationCommand, ThreadId } from "@t3tools/contracts";

export function formatWorkflowOutput(output: unknown): string {
  if (typeof output === "string") return output;
  if (output === undefined) return "Workflow completed.";
  if (output !== null && typeof output === "object" && !Array.isArray(output)) {
    const record = output as Record<string, unknown>;
    for (const key of ["summary", "message", "text", "result"] as const) {
      const value = record[key];
      if (typeof value === "string" && value.trim().length > 0) return value.trim();
    }
    const readable = Object.entries(record)
      .filter(
        ([, value]) =>
          ["string", "number", "boolean"].includes(typeof value) ||
          (Array.isArray(value) &&
            value.every((item) => ["string", "number", "boolean"].includes(typeof item))),
      )
      .map(([key, value]) => {
        const label = key.replaceAll(/([a-z])([A-Z])/g, "$1 $2");
        return `**${label.charAt(0).toUpperCase()}${label.slice(1)}:** ${Array.isArray(value) ? value.join(", ") : String(value)}`;
      });
    if (readable.length > 0) return readable.join("\n");
    return "Workflow completed.";
  }
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
