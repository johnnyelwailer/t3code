/**
 * What the hidden author thread's MCP credential may do. Under orchestration V2 every provider
 * session's `t3-code` server carries upstream's toolkits too — `delegate_task`, `create_threads`,
 * `t3_project_delete`, `t3_pending_request_respond`, worktree, preview (a browser), devices — and
 * Claude pre-approves that whole server. Each of those is gated on a credential capability, so the
 * author's scope is resolved with NO capabilities: every upstream tool refuses it. The t3team
 * toolkit then admits the author only for its own tools (`WORKFLOW_AUTHOR_TOOL_IDS`), on top of the
 * restricted broker tool context installed when the thread is created.
 */
import type { McpInvocationScope } from "./mcp/McpInvocationContext.ts";
import { isWorkflowAuthorThread } from "./t3team-workflowAuthorSession.ts";
import { WORKFLOW_AUTHOR_TOOL_IDS } from "./t3team-workflowAuthorTurn.ts";

const AUTHOR_BROKER_IDS: ReadonlySet<string> = new Set(WORKFLOW_AUTHOR_TOOL_IDS);
const NO_CAPABILITIES: McpInvocationScope["capabilities"] = new Set();

/** The scope a resolved credential runs with: an author thread's loses every capability. */
export const workflowAuthorMcpScope = (scope: McpInvocationScope): McpInvocationScope =>
  isWorkflowAuthorThread(String(scope.threadId))
    ? { ...scope, capabilities: NO_CAPABILITIES }
    : scope;

/**
 * Whether a credential may call the broker tool `brokerToolId`: an author thread exactly for its
 * own tools, anyone else on the `orchestration` capability upstream's tools require.
 */
export const mayCallT3TeamBrokerTool = (
  scope: McpInvocationScope,
  brokerToolId: string,
): boolean =>
  isWorkflowAuthorThread(String(scope.threadId))
    ? AUTHOR_BROKER_IDS.has(brokerToolId)
    : scope.capabilities.has("orchestration");
