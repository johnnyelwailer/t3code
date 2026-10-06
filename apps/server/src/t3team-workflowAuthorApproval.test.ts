/**
 * The author-thread decision table on V2's runtime-request shape, one case per provider shape the
 * V1 gate covered (Claude `canUseTool`, Codex app-server, Cursor ACP). The stream-level proof —
 * settled before ingestion on the real run path — is `orchestration-v2/t3team-workflowAuthorGate.test.ts`.
 */
import { assert, it } from "@effect/vitest";
import {
  NodeId,
  type OrchestrationV2RuntimeRequest,
  type OrchestrationV2TurnItem,
  ProviderDriverKind,
  RuntimeRequestId,
  ThreadId,
  TurnItemId,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";

import {
  decideWorkflowAuthorRequest,
  isWorkflowAuthorToolName,
} from "./t3team-workflowAuthorApproval.ts";
import {
  isWorkflowAuthorThread,
  registerWorkflowAuthorSession,
  resetWorkflowAuthorSessions,
} from "./t3team-workflowAuthorSession.ts";

const driver = ProviderDriverKind.make("codex");
const now = DateTime.makeUnsafe(0);

const req = (
  kind: OrchestrationV2RuntimeRequest["kind"],
  nativeId: string | null = "call-1",
): OrchestrationV2RuntimeRequest => ({
  id: RuntimeRequestId.make(`req:${kind}`),
  nodeId: NodeId.make("node:approval"),
  providerTurnId: null,
  nativeRequestRef: nativeId === null ? null : { driver, nativeId, strength: "strong" },
  kind,
  status: "pending",
  responseCapability: { type: "message" },
  createdAt: now,
  resolvedAt: null,
});

const item = (
  type: "dynamic_tool" | "command_execution" | "file_change",
  name: { readonly toolName?: string | null; readonly title?: string | null },
): OrchestrationV2TurnItem =>
  ({
    id: TurnItemId.make("item"),
    threadId: ThreadId.make("run:author"),
    runId: null,
    nodeId: null,
    providerThreadId: null,
    providerTurnId: null,
    nativeItemRef: { driver, nativeId: "call-1", strength: "strong" },
    parentItemId: null,
    ordinal: 1,
    status: "running",
    title: name.title ?? null,
    startedAt: now,
    completedAt: null,
    updatedAt: now,
    type,
    ...(type === "dynamic_tool" ? { toolName: name.toolName ?? null, input: {} } : {}),
  }) as unknown as OrchestrationV2TurnItem;

const cases: ReadonlyArray<{
  readonly name: string;
  readonly request: OrchestrationV2RuntimeRequest;
  readonly toolItem?: OrchestrationV2TurnItem;
  readonly decision: string | undefined;
}> = [
  // Claude canUseTool
  {
    name: "claude validate",
    request: req("dynamic_tool_call"),
    toolItem: item("dynamic_tool", { toolName: "mcp__t3-code__t3team_recipe_validate" }),
    decision: "accept",
  },
  {
    name: "claude bash",
    request: req("command"),
    toolItem: item("command_execution", { title: "rm -rf /" }),
    decision: "decline",
  },
  {
    name: "claude edit",
    request: req("file-change"),
    toolItem: item("file_change", { title: "secret.ts" }),
    decision: "decline",
  },
  {
    name: "claude status (a t3team tool that is not the author's)",
    request: req("dynamic_tool_call"),
    toolItem: item("dynamic_tool", { toolName: "mcp__t3-code__t3team_orchestration_status" }),
    decision: "decline",
  },
  {
    name: "claude other server",
    request: req("dynamic_tool_call"),
    toolItem: item("dynamic_tool", { toolName: "mcp__other__t3team_recipe_validate" }),
    decision: "decline",
  },
  // Codex app-server
  {
    name: "codex t3-code MCP elicitation",
    request: req("mcp-elicitation", "mcp-elicitation:t3-code"),
    decision: "accept",
  },
  { name: "codex command", request: req("command"), decision: "decline" },
  { name: "codex file", request: req("file-change"), decision: "decline" },
  { name: "codex file read", request: req("file-read"), decision: "decline" },
  {
    name: "codex foreign MCP elicitation",
    request: req("mcp-elicitation", "mcp-elicitation:other"),
    decision: "decline",
  },
  // Cursor ACP
  {
    name: "cursor validate (title only)",
    request: req("command"),
    toolItem: item("dynamic_tool", { toolName: null, title: "t3team_recipe_validate" }),
    decision: "accept",
  },
  {
    name: "cursor shell",
    request: req("command"),
    toolItem: item("command_execution", { title: "rm -rf /" }),
    decision: "decline",
  },
  { name: "cursor edit", request: req("file-change"), decision: "decline" },
  {
    name: "cursor exec with a spoofed author title",
    request: req("command"),
    toolItem: item("command_execution", { title: "t3team_recipe_validate" }),
    decision: "decline",
  },
  { name: "permission with no tool item", request: req("permission"), decision: "decline" },
  // Not approvals: left to the normal path.
  { name: "question", request: req("user_input"), decision: undefined },
  { name: "auth refresh", request: req("auth_refresh"), decision: undefined },
];

it("accepts only the author's own tool and declines shell, file and every other request", () => {
  for (const testCase of cases) {
    assert.strictEqual(
      decideWorkflowAuthorRequest(testCase.request, testCase.toolItem),
      testCase.decision,
      testCase.name,
    );
  }
});

it("names a tool exactly: one known prefix, then an author MCP name or broker id", () => {
  assert.isTrue(isWorkflowAuthorToolName("t3team_orchestration_run"));
  assert.isTrue(isWorkflowAuthorToolName("mcp__t3_code__t3team_orchestration_run"));
  assert.isTrue(isWorkflowAuthorToolName("t3team.recipe.validate"));
  assert.isFalse(isWorkflowAuthorToolName("mcp__t3-code__mcp__t3-code__t3team_orchestration_run"));
  assert.isFalse(isWorkflowAuthorToolName("t3team_orchestration_run "));
  assert.isFalse(isWorkflowAuthorToolName("delegate_task"));
  assert.isFalse(isWorkflowAuthorToolName(null));
});

it("recognizes the author thread by session or by its deterministic id", () => {
  resetWorkflowAuthorSessions();
  assert.isFalse(isWorkflowAuthorThread("thread-user"));
  assert.isTrue(isWorkflowAuthorThread("run-from-before-restart:author"));
  registerWorkflowAuthorSession({
    runId: "run-live",
    launchThreadId: "launch-1",
    authorThreadId: "custom-author-thread",
    authorModelSelection: { instanceId: "codex", model: "gpt" } as never,
    intent: { goal: "g", expectedOutcome: "o", guardrails: ["x"] },
    submit: undefined,
    declined: false,
  });
  assert.isTrue(isWorkflowAuthorThread("custom-author-thread"));
  resetWorkflowAuthorSessions();
});
