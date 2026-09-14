import { renderWorkflowRecordAsDisplayText } from "@t3tools/shared/t3team-workflowOutputText";

/**
 * Re-renders a `t3team-wf-result:<runId>` message whose stored text is still raw JSON — a legacy
 * shape (older clients, or a message written before `formatWorkflowOutput` humanized the result
 * server-side; see `t3team-workflowCompletionMessage.ts`). The rich rendering itself
 * (never dropping a nested field, truncating visibly) lives in the shared
 * `renderWorkflowRecordAsDisplayText`, used by both this client re-render and the server's own
 * pre-storage formatting.
 */
export function workflowCompletionDisplayText(messageId: string, text: string): string {
  if (!messageId.startsWith("t3team-wf-result:")) return text;
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return text;

  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return text;
    return renderWorkflowRecordAsDisplayText(parsed as Record<string, unknown>, {
      emptyFallback: "Orchestration completed.",
    });
  } catch {
    return text;
  }
}
