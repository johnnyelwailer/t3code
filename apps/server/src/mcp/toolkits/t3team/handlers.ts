import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { T3TeamChildThreadMetadata } from "../../../t3team-childThreadMetadata.ts";
import { T3TEAM_MCP_SERVER_NAME, T3TeamToolBroker } from "../../../t3team-toolBroker.ts";
import { mayCallT3TeamBrokerTool } from "../../../t3team-workflowAuthorMcpScope.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import * as McpToolAccess from "../../McpToolAccess.ts";
import { t3TeamAskUser, type T3TeamAskUserOption } from "./t3team-askUser.ts";
import { T3TEAM_MCP_CANONICAL_TOOL_MAP, T3TeamMcpToolError, T3TeamToolkit } from "./tools.ts";

/**
 * The calling credential's scope, gated on the same `orchestration` capability
 * upstream's orchestration tools require: these tools read and act on threads.
 */
const requireOrchestrationScope = McpInvocationContext.McpInvocationContext.pipe(
  Effect.filterOrFail(
    (invocation): invocation is McpInvocationContext.McpThreadInvocationScope =>
      invocation.capabilities.has("orchestration") && invocation.thread !== undefined,
    () =>
      new T3TeamMcpToolError({
        message: "This MCP credential does not grant orchestration capabilities.",
      }),
  ),
);

const callBroker = Effect.fn("T3TeamMcpToolkit.callBroker")(function* (
  tool: string,
  arguments_: unknown,
) {
  // The hidden orchestration author holds no capabilities and reaches only its own tools.
  const invocation = yield* McpInvocationContext.McpInvocationContext.pipe(
    Effect.filterOrFail(
      (scope): scope is McpInvocationContext.McpThreadInvocationScope =>
        scope.thread !== undefined && mayCallT3TeamBrokerTool(scope, tool),
      () =>
        new T3TeamMcpToolError({
          message: "This MCP credential does not grant orchestration capabilities.",
        }),
    ),
  );
  const broker = yield* T3TeamToolBroker;
  const binding = yield* broker.bindSession({ threadId: invocation.thread.threadId });
  if (!binding) {
    return yield* new T3TeamMcpToolError({
      message: "T3Team tools are unavailable for this thread.",
    });
  }

  const result = yield* binding.callTool({
    server: T3TEAM_MCP_SERVER_NAME,
    tool,
    arguments: arguments_,
  });
  if (result.isError) {
    return yield* new T3TeamMcpToolError({
      message: result.content[0]?.text ?? "T3Team tool call failed.",
    });
  }
  return result.structuredContent ?? result.content;
});

const askUser = Effect.fn("T3TeamMcpToolkit.askUser")(function* (input: {
  readonly question: string;
  readonly context?: string | undefined;
  readonly header?: string | undefined;
  readonly options?: readonly (string | T3TeamAskUserOption)[] | undefined;
  readonly multiSelect?: boolean | undefined;
  readonly allowFreeText?: boolean | undefined;
}) {
  const invocation = yield* requireOrchestrationScope;
  return yield* t3TeamAskUser(input, invocation.thread.threadId);
});

// Skills-as-subagents Phase 1 read path: the child's driver asks its OWN thread for the
// skill names the delegate_task requested, then resolves them from the pack's skill
// registry. The host stores requested names only; it never resolves them (no second
// catalog). Unknown threads and threads without skill delegation yield a clean
// { skills: [] }, never an error — the driver's soft-fail then yields today's behavior.
const threadSkillMetadata = Effect.fn("T3TeamMcpToolkit.threadSkillMetadata")(function* (input: {
  readonly threadId?: string | undefined;
}) {
  const invocation = yield* requireOrchestrationScope;
  const threadId =
    typeof input.threadId === "string" && input.threadId.length > 0
      ? input.threadId
      : invocation.thread.threadId;
  const store = Option.getOrUndefined(yield* Effect.serviceOption(T3TeamChildThreadMetadata));
  if (store === undefined) return { skills: [] };
  const rows = yield* store.listByChildThreadIds([threadId]).pipe(
    Effect.mapError(
      (error) =>
        new T3TeamMcpToolError({
          message: `Could not read the thread's skill metadata (${error.operation}).`,
        }),
    ),
  );
  return { skills: [...(rows[0]?.skills ?? [])] };
});

/**
 * Every t3team tool declares `readsAsCaller`: the t3_ surface is closed to MCP
 * clients that signed in from outside a thread, which is exactly what that
 * declaration checks. The capability gate above (`requireOrchestrationScope`,
 * `mayCallT3TeamBrokerTool`) then runs inside the handler, because the hidden
 * workflow-author thread is deliberately admitted with NO capabilities for its
 * own tools only — a rule none of upstream's declarations expresses.
 *
 * The mutating tools (t3_ask_user, t3_task_ops, t3_orchestration_*,
 * t3_show_widget, t3_mywork_arrange) would read as `actsAsCaller` upstream
 * (its delegate_task does). That additionally demands a live caller run and
 * `ThreadManagementService` in each tool's `dependencies`; adopting it is a
 * behaviour change, tracked separately rather than made during the upstream
 * merge.
 */
export const T3TeamToolkitHandlersLive = McpToolAccess.toLayer(T3TeamToolkit, {
  t3_provider_usage: McpToolAccess.readsAsCaller((input) =>
    callBroker(T3TEAM_MCP_CANONICAL_TOOL_MAP.t3_provider_usage, input),
  ),
  t3_search_thread: McpToolAccess.readsAsCaller((input) =>
    callBroker(T3TEAM_MCP_CANONICAL_TOOL_MAP.t3_search_thread, input),
  ),
  t3_search_source: McpToolAccess.readsAsCaller((input) =>
    callBroker(T3TEAM_MCP_CANONICAL_TOOL_MAP.t3_search_source, input),
  ),
  t3_read_message: McpToolAccess.readsAsCaller((input) =>
    callBroker(T3TEAM_MCP_CANONICAL_TOOL_MAP.t3_read_message, input),
  ),
  t3_ask_user: McpToolAccess.readsAsCaller((input) => askUser(input)),
  t3_task_ops: McpToolAccess.readsAsCaller((input) =>
    callBroker(T3TEAM_MCP_CANONICAL_TOOL_MAP.t3_task_ops, input),
  ),
  t3_orchestration_run: McpToolAccess.readsAsCaller((input) =>
    callBroker(T3TEAM_MCP_CANONICAL_TOOL_MAP.t3_orchestration_run, input),
  ),
  t3_orchestration_status: McpToolAccess.readsAsCaller((input) =>
    callBroker(T3TEAM_MCP_CANONICAL_TOOL_MAP.t3_orchestration_status, input),
  ),
  t3_orchestration_resume: McpToolAccess.readsAsCaller((input) =>
    callBroker(T3TEAM_MCP_CANONICAL_TOOL_MAP.t3_orchestration_resume, input),
  ),
  t3_orchestration_pause: McpToolAccess.readsAsCaller((input) =>
    callBroker(T3TEAM_MCP_CANONICAL_TOOL_MAP.t3_orchestration_pause, input),
  ),
  t3_orchestration_stop: McpToolAccess.readsAsCaller((input) =>
    callBroker(T3TEAM_MCP_CANONICAL_TOOL_MAP.t3_orchestration_stop, input),
  ),
  t3_show_widget: McpToolAccess.readsAsCaller((input) =>
    callBroker(T3TEAM_MCP_CANONICAL_TOOL_MAP.t3_show_widget, input),
  ),
  t3_recipe_list: McpToolAccess.readsAsCaller((input) =>
    callBroker(T3TEAM_MCP_CANONICAL_TOOL_MAP.t3_recipe_list, input),
  ),
  t3_recipe_validate: McpToolAccess.readsAsCaller((input) =>
    callBroker(T3TEAM_MCP_CANONICAL_TOOL_MAP.t3_recipe_validate, input),
  ),
  t3_mywork_digest: McpToolAccess.readsAsCaller((input) =>
    callBroker(T3TEAM_MCP_CANONICAL_TOOL_MAP.t3_mywork_digest, input),
  ),
  t3_mywork_arrange: McpToolAccess.readsAsCaller((input) =>
    callBroker(T3TEAM_MCP_CANONICAL_TOOL_MAP.t3_mywork_arrange, input),
  ),
  t3team_thread_skill_metadata: McpToolAccess.readsAsCaller((input) => threadSkillMetadata(input)),
} satisfies McpToolAccess.Handlers<typeof T3TeamToolkit.tools>);
