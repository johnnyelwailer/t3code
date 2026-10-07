import {
  asTruncatedWorkflowOutput,
  describeTruncatedWorkflowOutput,
  parseWorkflowOutputData,
} from "@t3tools/shared/t3team-workflowOutputData";
import {
  renderWorkflowRecordAsDisplayText,
  renderWorkflowValueAsDisplayText,
} from "@t3tools/shared/t3team-workflowOutputText";

/** Render stored data for people; the stored text remains framed for the launch agent. */
export function workflowCompletionDisplayText(messageId: string, text: string): string {
  if (!messageId.startsWith("t3team-wf-result:")) return text;
  const framed = parseWorkflowOutputData(text);
  if (framed !== undefined) {
    const output = framed.output;
    // A preview is incomplete data: say so, and keep the retained JSON text in a monospaced block
    // (backticks escaped again here, so a forged preview cannot close the fence).
    const truncated = asTruncatedWorkflowOutput(output);
    if (truncated !== undefined) {
      return `${describeTruncatedWorkflowOutput(truncated)}\n\n\`\`\`json\n${truncated.outputPreview.replaceAll("`", "\\u0060")}\n\`\`\``;
    }
    return renderWorkflowValueAsDisplayText(output, { emptyFallback: "Orchestration completed." });
  }
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
