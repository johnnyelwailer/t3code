import type { AgentContextToolDefinition } from "~/t3team/t3team-agentContext";
import { buildContextAttachment, type AddToChatRequest } from "~/t3team/t3team-addToChatUtils";
import type { T3TeamContextAttachment } from "~/t3team/t3team-contextAttachment";
import {
  ADDED_CONTEXT_HEADING,
  inferContextAttachmentKindFromType,
  normalizeContextAttachmentKind,
} from "~/t3team/t3team-contextAttachmentPrimitives";

/**
 * Context for an item the agent can fetch itself: kind, stable id and label, plus the tool call
 * that returns the current record. Unlike `buildPendingContextAttachment` it carries no payload,
 * so nothing is synced or frozen at drop time; the chip keeps the request's display metadata.
 */
export function buildReferenceContextAttachment(input: {
  request: AddToChatRequest;
  tool: AgentContextToolDefinition;
}): T3TeamContextAttachment {
  const { request, tool } = input;
  const kind =
    normalizeContextAttachmentKind(request.kind) ??
    inferContextAttachmentKindFromType(request.targetType);
  const toolArguments = JSON.stringify(tool.arguments ?? {});
  const chip = buildContextAttachment({ request });
  return {
    ...chip,
    contextText: [
      `${ADDED_CONTEXT_HEADING} ${request.targetLabel}`,
      "",
      `- Kind: ${kind}`,
      `- Type: ${request.targetType}`,
      `- Project: ${request.projectTitle}`,
      `- Reference: ${toolArguments}`,
      "",
      `This is a reference, not a snapshot. Fetch the current record with the \`${tool.id}\` tool (${toolArguments}) before relying on its contents.`,
    ].join("\n"),
  };
}
