import {
  asTruncatedWorkflowOutput,
  describeTruncatedWorkflowOutput,
  parseWorkflowOutputData,
} from "@t3tools/shared/t3team-workflowOutputData";
import {
  renderWorkflowRecordAsDisplayText,
  renderWorkflowValueAsDisplayText,
} from "@t3tools/shared/t3team-workflowOutputText";

/**
 * Render stored data for people; the stored text remains framed for the launch agent.
 *
 * A workflow step's reply is the structured answer its prompt asked for, so a bare JSON object
 * there renders the same way as a legacy run result. Any other message passes through unchanged.
 */
export function workflowCompletionDisplayText(
  messageId: string,
  text: string,
  options?: { readonly workflowStepReply?: boolean },
): string {
  if (messageId.startsWith("t3team-wf-result:")) {
    const framed = framedResultDisplayText(text);
    if (framed !== undefined) return framed;
  } else if (options?.workflowStepReply !== true) {
    return text;
  }
  return jsonRecordDisplayText(text);
}

function framedResultDisplayText(text: string): string | undefined {
  const framed = parseWorkflowOutputData(text);
  if (framed === undefined) return undefined;
  const output = framed.output;
  // A preview is incomplete data: say so, and keep the retained JSON text in a monospaced block
  // (backticks escaped again here, so a forged preview cannot close the fence).
  const truncated = asTruncatedWorkflowOutput(output);
  if (truncated !== undefined) {
    return `${describeTruncatedWorkflowOutput(truncated)}\n\n\`\`\`json\n${truncated.outputPreview.replaceAll("`", "\\u0060")}\n\`\`\``;
  }
  return renderWorkflowValueAsDisplayText(output, { emptyFallback: "Orchestration completed." });
}

function jsonRecordDisplayText(text: string): string {
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
