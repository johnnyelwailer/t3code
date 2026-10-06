/**
 * Host-side guarantee for the hidden author thread, on orchestration V2's runtime-request path.
 *
 * A pending runtime request raised on that thread is settled here, inside the run's provider
 * event stream (`RunExecutionService`), BEFORE it is ingested — so it never becomes a pending
 * request a user or another agent (`t3_pending_request_respond`) could answer. The thread is
 * recognized by the author session registry, the same record the broker uses to treat
 * `t3team.orchestration.run` as a submission, or by its deterministic `<runId>:author` id (a
 * restart loses the registry, never the id).
 *
 * The decision fails closed. A request is accepted only when it is provably the author's own host
 * tool:
 *  - Codex asks for an MCP tool call through an elicitation; V2 keys a form elicitation as
 *    `mcp-elicitation:<server>`, so only the `t3-code` server's is accepted.
 *  - Any other approval is accepted only when the stream already carried the tool call as a
 *    `dynamic_tool` item with the request's native id, whose tool name is exactly an author tool
 *    (its MCP name, optionally behind the Claude `mcp__t3-code__` prefix, or the broker id). An ACP terminal call whose title names an author tool is a
 *    `command_execution` item, never `dynamic_tool`, so the title cannot spoof the gate.
 * Commands, file reads and changes, web fetches and every other tool are declined. Questions
 * (`user_input`) and auth refreshes are not approvals and are left to the normal path.
 *
 * Claude pre-approves the `t3-code` MCP tools (`claudeMcpQueryOverrides`), so its author never
 * asks for them; what those tools may DO for the author is bounded separately by
 * `t3team-workflowAuthorMcpScope.ts`.
 */
import type {
  OrchestrationV2RuntimeRequest,
  OrchestrationV2TurnItem,
  ProviderApprovalDecision,
} from "@t3tools/contracts";

import { isWorkflowAuthorThread } from "./t3team-workflowAuthorSession.ts";
import { WORKFLOW_AUTHOR_TOOL_IDS } from "./t3team-workflowAuthorTurn.ts";

/** MCP server key every in-repo driver registers for the host toolkit. */
const T3_MCP_SERVER_NAME = "t3-code";
/** SDK-side names for that server's tools; harnesses may normalize the dash. */
const T3_TOOL_PREFIXES = [`mcp__${T3_MCP_SERVER_NAME}__`, "mcp__t3_code__"] as const;
const T3_ELICITATION_NATIVE_ID = `mcp-elicitation:${T3_MCP_SERVER_NAME}`;

/**
 * MCP name → broker id for the author's tools, the same pairs as `T3TEAM_MCP_CANONICAL_TOOL_MAP`
 * (a test pins the parity). Local so the run's event stream does not import the MCP toolkit.
 */
export const WORKFLOW_AUTHOR_MCP_TOOL_NAMES: Readonly<Record<string, string>> = {
  t3_recipe_validate: "t3team.recipe.validate",
  t3_orchestration_run: "t3team.orchestration.run",
  // Deprecated aliases (t3team-mcpToolAliases.ts) still reach the same broker tools.
  t3team_recipe_validate: "t3team.recipe.validate",
  t3team_orchestration_run: "t3team.orchestration.run",
};
const AUTHOR_BROKER_IDS: ReadonlySet<string> = new Set(WORKFLOW_AUTHOR_TOOL_IDS);

/** Request kinds that are approvals. Anything else is not this gate's to answer. */
const APPROVAL_KINDS: ReadonlySet<OrchestrationV2RuntimeRequest["kind"]> = new Set([
  "command",
  "file-read",
  "file-change",
  "mcp-elicitation",
  "permission",
  "dynamic_tool_call",
]);

/** Exact lookup: one known prefix stripped at most once; the remainder must be a map key. */
export const isWorkflowAuthorToolName = (toolName: string | null | undefined): boolean => {
  if (toolName === null || toolName === undefined) return false;
  if (AUTHOR_BROKER_IDS.has(toolName)) return true;
  const prefix = T3_TOOL_PREFIXES.find((candidate) => toolName.startsWith(candidate));
  const mcpName = prefix === undefined ? toolName : toolName.slice(prefix.length);
  const brokerId = WORKFLOW_AUTHOR_MCP_TOOL_NAMES[mcpName];
  return brokerId !== undefined && AUTHOR_BROKER_IDS.has(brokerId);
};

/** The decision for one author-thread request; `undefined` = not an approval, leave it alone. */
export function decideWorkflowAuthorRequest(
  request: OrchestrationV2RuntimeRequest,
  toolItem: OrchestrationV2TurnItem | undefined,
): ProviderApprovalDecision | undefined {
  if (!APPROVAL_KINDS.has(request.kind)) return undefined;
  if (request.kind === "mcp-elicitation") {
    return request.nativeRequestRef?.nativeId === T3_ELICITATION_NATIVE_ID ? "accept" : "decline";
  }
  if (request.kind === "file-read" || request.kind === "file-change") return "decline";
  // ACP leaves `toolName` null and names the tool in the title; the item TYPE is what rules out
  // a command, so a title is trusted only on a `dynamic_tool` item.
  return toolItem?.type === "dynamic_tool" &&
    isWorkflowAuthorToolName(toolItem.toolName ?? toolItem.title)
    ? "accept"
    : "decline";
}

/** The slice of a V2 provider event this gate reads. */
export type WorkflowAuthorGateEvent =
  | { readonly type: "turn_item.updated"; readonly turnItem: OrchestrationV2TurnItem }
  | {
      readonly type: "runtime_request.updated";
      readonly threadId?: string | undefined;
      readonly runtimeRequest: OrchestrationV2RuntimeRequest;
    }
  | { readonly type: string };

export interface WorkflowAuthorApprovalGate {
  /**
   * Observe one provider event of a run on `runThreadId`. Returns the response to send when the
   * event is a pending author-thread approval (the caller answers it and does NOT ingest it).
   */
  readonly observe: (
    event: WorkflowAuthorGateEvent,
    runThreadId: string,
  ) =>
    | {
        readonly requestId: OrchestrationV2RuntimeRequest["id"];
        readonly decision: ProviderApprovalDecision;
      }
    | undefined;
}

/**
 * One gate per run stream: it remembers the author run's tool items by native id. Fail closed on
 * both identity and evidence: the run is gated when EITHER its thread or the event's thread is an
 * author thread, and a native id that ever carried a non-`dynamic_tool` item (a command, a file
 * change) can never be accepted, whatever later item reuses it.
 */
export function makeWorkflowAuthorApprovalGate(): WorkflowAuthorApprovalGate {
  const toolItems = new Map<string, OrchestrationV2TurnItem>();
  const tainted = new Set<string>();
  const isAuthor = (runThreadId: string, eventThreadId: string | undefined) =>
    isWorkflowAuthorThread(runThreadId) ||
    (eventThreadId !== undefined && isWorkflowAuthorThread(eventThreadId));
  return {
    observe: (event, runThreadId) => {
      if (event.type === "turn_item.updated" && "turnItem" in event) {
        const item = event.turnItem;
        const nativeId = item.nativeItemRef?.nativeId;
        if (nativeId === undefined || nativeId === null) return undefined;
        if (!isAuthor(runThreadId, item.threadId)) return undefined;
        if (item.type !== "dynamic_tool") tainted.add(nativeId);
        toolItems.set(nativeId, item);
        return undefined;
      }
      if (event.type !== "runtime_request.updated" || !("runtimeRequest" in event)) {
        return undefined;
      }
      const request = event.runtimeRequest;
      if (request.status !== "pending") return undefined;
      if (!isAuthor(runThreadId, event.threadId)) return undefined;
      const nativeId = request.nativeRequestRef?.nativeId;
      const toolItem =
        nativeId === undefined || nativeId === null || tainted.has(nativeId)
          ? undefined
          : toolItems.get(nativeId);
      const decision = decideWorkflowAuthorRequest(request, toolItem);
      return decision === undefined ? undefined : { requestId: request.id, decision };
    },
  };
}
