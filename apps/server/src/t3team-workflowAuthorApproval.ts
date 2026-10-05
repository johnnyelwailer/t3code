/**
 * Host-side guarantee for the hidden author thread.
 *
 * A `request.opened` for that thread is settled here and never becomes an activity
 * the user can answer. The thread is the author session registry, the same record
 * the broker uses to treat `t3team.orchestration.run` as a submission.
 *
 * The decision is the tool's identity, not the request type. Claude's `canUseTool`
 * (`ClaudeAdapter.ts`, method `canUseTool/request`) puts the SDK tool name on
 * `payload.args.toolName`. That name is `mcp__<server>__<tool>` and the server key
 * registered for this host is `t3-code` (`ClaudeAdapter.ts` `mcpServers`). Codex's
 * `item/tool/call` (`CodexAdapter.ts`) puts `DynamicToolCallParams.tool` on
 * `payload.args.tool`, with an optional `namespace`. Cursor's
 * `session/request_permission` (`CursorAdapter.ts`) stores the ACP request as
 * `payload.args`; the protocol's tool call has no id field, so the name is
 * `toolCall.title`. Each of those strings is accepted only when it is an exact key
 * of `T3TEAM_MCP_CANONICAL_TOOL_MAP` (or that key after the Claude server prefix,
 * or a deprecated alias of such a key) and the mapped broker id is one of
 * `WORKFLOW_AUTHOR_TOOL_IDS`. Shell, file, and every other tool are declined.
 */
import { ApprovalRequestId, type ProviderRuntimeEvent, type ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import {
  T3TEAM_MCP_CANONICAL_TOOL_MAP,
  T3TEAM_MCP_DEPRECATED_TOOL_ALIASES,
} from "./mcp/toolkits/t3team/tools.ts";
import type { ProviderServiceError } from "./provider/Errors.ts";
import { WORKFLOW_AUTHOR_TOOL_IDS } from "./t3team-workflowAuthorTurn.ts";
import { workflowAuthorSessionForThread } from "./t3team-workflowAuthorSession.ts";

/** MCP server key every in-repo driver registers for the host toolkit. */
const T3_MCP_SERVER_NAME = "t3-code";
/** Claude SDK tool name for that server: `mcp__` + server key + `__` + MCP tool name. */
const CLAUDE_T3_TOOL_PREFIX = `mcp__${T3_MCP_SERVER_NAME}__`;

const MCP_BROKER_ID: Readonly<Record<string, string>> = T3TEAM_MCP_CANONICAL_TOOL_MAP;
const MCP_ALIAS: Readonly<Record<string, string>> = T3TEAM_MCP_DEPRECATED_TOOL_ALIASES;
const AUTHOR_BROKER_IDS: ReadonlySet<string> = new Set(WORKFLOW_AUTHOR_TOOL_IDS);

const brokerIdForMcpName = (mcpName: string): string | undefined => {
  const canonicalName = MCP_ALIAS[mcpName] ?? mcpName;
  return MCP_BROKER_ID[canonicalName];
};

/** Exact map lookup. The Claude prefix is stripped once; the remainder must be a map key. */
const brokerIdForProviderToolName = (toolName: string): string | undefined => {
  const direct = brokerIdForMcpName(toolName);
  if (direct !== undefined) return direct;
  if (AUTHOR_BROKER_IDS.has(toolName)) return toolName;
  if (!toolName.startsWith(CLAUDE_T3_TOOL_PREFIX)) return undefined;
  return brokerIdForMcpName(toolName.slice(CLAUDE_T3_TOOL_PREFIX.length));
};

const isAuthorToolName = (toolName: string | undefined): boolean => {
  if (toolName === undefined) return false;
  const brokerId = brokerIdForProviderToolName(toolName);
  return brokerId !== undefined && AUTHOR_BROKER_IDS.has(brokerId);
};

const readString = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

const readRecord = (value: unknown): Readonly<Record<string, unknown>> | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : undefined;

const authorOwnsOpenedRequest = (
  event: Extract<ProviderRuntimeEvent, { readonly type: "request.opened" }>,
): boolean => {
  const method = event.raw?.method;
  const args = readRecord(event.payload.args);
  if (method === undefined || args === undefined) return false;
  if (method === "canUseTool/request") return isAuthorToolName(readString(args.toolName));
  if (method === "item/tool/call") {
    const namespace = args.namespace;
    if (namespace !== undefined && namespace !== null && namespace !== T3_MCP_SERVER_NAME) {
      return false;
    }
    return isAuthorToolName(readString(args.tool));
  }
  if (method === "session/request_permission") {
    return isAuthorToolName(readString(readRecord(args.toolCall)?.title));
  }
  return false;
};

export const settleAuthorThreadApproval = (input: {
  readonly threadId: ThreadId;
  readonly requestId: ApprovalRequestId | undefined;
  readonly event: Extract<ProviderRuntimeEvent, { readonly type: "request.opened" }>;
  readonly respondToRequest: (request: {
    readonly threadId: ThreadId;
    readonly requestId: ApprovalRequestId;
    readonly decision: "accept" | "decline";
  }) => Effect.Effect<void, ProviderServiceError>;
}): Effect.Effect<boolean, ProviderServiceError> => {
  if (workflowAuthorSessionForThread(String(input.threadId)) === undefined) {
    return Effect.succeed(false);
  }
  if (input.requestId === undefined) return Effect.succeed(true);
  return input
    .respondToRequest({
      threadId: input.threadId,
      requestId: input.requestId,
      decision: authorOwnsOpenedRequest(input.event) ? "accept" : "decline",
    })
    .pipe(Effect.as(true));
};
