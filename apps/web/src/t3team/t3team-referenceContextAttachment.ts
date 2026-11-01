import type { AgentContextToolDefinition } from "~/t3team/t3team-agentContext";
import { buildContextAttachment, type AddToChatRequest } from "~/t3team/t3team-addToChatUtils";
import type { T3TeamContextAttachment } from "~/t3team/t3team-contextAttachment";
import {
  ADDED_CONTEXT_HEADING,
  inferContextAttachmentKindFromType,
  normalizeContextAttachmentKind,
} from "~/t3team/t3team-contextAttachmentPrimitives";

export type ContextPointerState =
  | { readonly status: "pending" }
  | { readonly status: "ready"; readonly cachedPath: string }
  | { readonly status: "error"; readonly reason: string };

const SYNC_STATUS = { pending: "syncing", ready: "synced", error: "error" } as const;

function cachedCopyLine(state: ContextPointerState, hasLiveSource: boolean): string {
  if (state.status === "ready") return `- Cached copy: ${state.cachedPath}`;
  const fallback = hasLiveSource ? "use the live source below" : "ask the user to re-add it";
  return state.status === "pending"
    ? `- Cached copy: not written yet; ${fallback} until it lands`
    : `- Cached copy: unavailable (${state.reason}); ${fallback}`;
}

/**
 * The compact pointer an agent gets for a dropped item: kind, id, label, capture time, where the
 * cached copy lives in the thread's own environment, and the tool call that reads the live record.
 * The body never rides the message; the agent opens the file or calls the tool when it needs it.
 */
export function buildContextPointerAttachment(input: {
  id: string;
  request: AddToChatRequest;
  tool: AgentContextToolDefinition | undefined;
  addedAt: string;
  state: ContextPointerState;
}): T3TeamContextAttachment {
  const { request, tool, addedAt, state } = input;
  const kind =
    normalizeContextAttachmentKind(request.kind) ??
    inferContextAttachmentKindFromType(request.targetType);
  const toolArguments = JSON.stringify(tool?.arguments ?? {});
  const chip = buildContextAttachment({
    id: input.id,
    request,
    syncStatus: SYNC_STATUS[state.status],
    syncedAt: addedAt,
    ...(state.status === "pending" ? { syncPhase: "Caching a copy for this thread" } : {}),
    ...(state.status === "error" ? { syncError: state.reason } : {}),
  });
  return {
    ...chip,
    contextText: [
      `${ADDED_CONTEXT_HEADING} ${request.targetLabel}`,
      "",
      `- Kind: ${kind}`,
      `- Type: ${request.targetType}`,
      `- Project: ${request.projectTitle}`,
      `- Added at: ${addedAt}`,
      ...(tool ? [`- Reference: ${toolArguments}`] : []),
      cachedCopyLine(state, tool !== undefined),
      ...(tool
        ? [
            `- Live source: the \`${tool.id}\` tool (${toolArguments}), when your environment can resolve it. It is fresher than the cached copy; fall back to the copy when it cannot.`,
          ]
        : []),
    ].join("\n"),
  };
}
