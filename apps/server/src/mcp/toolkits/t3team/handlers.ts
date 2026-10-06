import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { T3TeamChildThreadMetadata } from "../../../t3team-childThreadMetadata.ts";
import { T3TEAM_MCP_SERVER_NAME, T3TeamToolBroker } from "../../../t3team-toolBroker.ts";
import { mayCallT3TeamBrokerTool } from "../../../t3team-workflowAuthorMcpScope.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import { t3TeamAskUser, type T3TeamAskUserOption } from "./t3team-askUser.ts";
import { T3TEAM_MCP_CANONICAL_TOOL_MAP, T3TeamMcpToolError, T3TeamToolkit } from "./tools.ts";

/**
 * The calling credential's scope, gated on the same `orchestration` capability
 * upstream's orchestration tools require: these tools read and act on threads.
 */
const requireOrchestrationScope = McpInvocationContext.McpInvocationContext.pipe(
  Effect.filterOrFail(
    (invocation) => invocation.capabilities.has("orchestration"),
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
      (scope) => mayCallT3TeamBrokerTool(scope, tool),
      () =>
        new T3TeamMcpToolError({
          message: "This MCP credential does not grant orchestration capabilities.",
        }),
    ),
  );
  const broker = yield* T3TeamToolBroker;
  const binding = yield* broker.bindSession({ threadId: invocation.threadId });
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
  return yield* t3TeamAskUser(input, invocation.threadId);
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
      : invocation.threadId;
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

/** The handler of a tool that routes straight to its broker tool; the alias reuses it. */
const brokerHandler = (name: keyof typeof T3TEAM_MCP_CANONICAL_TOOL_MAP) => (input: unknown) =>
  callBroker(T3TEAM_MCP_CANONICAL_TOOL_MAP[name], input);

// Each deprecated `t3team_*` alias forwards to the replacement's handler (see
// t3team-mcpToolAliases.ts); the pairs are pinned by t3team-toolkit.test.ts.
export const T3TeamToolkitHandlersLive = T3TeamToolkit.toLayer({
  t3_provider_usage: brokerHandler("t3_provider_usage"),
  t3_search_thread: brokerHandler("t3_search_thread"),
  t3_search_source: brokerHandler("t3_search_source"),
  t3_read_message: brokerHandler("t3_read_message"),
  t3_task_ops: brokerHandler("t3_task_ops"),
  t3_orchestration_run: brokerHandler("t3_orchestration_run"),
  t3_orchestration_status: brokerHandler("t3_orchestration_status"),
  t3_orchestration_resume: brokerHandler("t3_orchestration_resume"),
  t3_orchestration_pause: brokerHandler("t3_orchestration_pause"),
  t3_orchestration_stop: brokerHandler("t3_orchestration_stop"),
  t3_show_widget: brokerHandler("t3_show_widget"),
  t3_recipe_list: brokerHandler("t3_recipe_list"),
  t3_recipe_validate: brokerHandler("t3_recipe_validate"),
  t3_ask_user: (input) => askUser(input),
  t3team_thread_skill_metadata: (input) => threadSkillMetadata(input),
  t3team_provider_usage: brokerHandler("t3_provider_usage"),
  t3team_search_thread: brokerHandler("t3_search_thread"),
  t3team_search_source: brokerHandler("t3_search_source"),
  t3team_read_message: brokerHandler("t3_read_message"),
  t3team_children: brokerHandler("t3_task_ops"),
  t3team_orchestration_run: brokerHandler("t3_orchestration_run"),
  t3team_orchestration_status: brokerHandler("t3_orchestration_status"),
  t3team_orchestration_resume: brokerHandler("t3_orchestration_resume"),
  t3team_orchestration_pause: brokerHandler("t3_orchestration_pause"),
  t3team_orchestration_stop: brokerHandler("t3_orchestration_stop"),
  t3team_show_widget: brokerHandler("t3_show_widget"),
  t3team_recipe_list: brokerHandler("t3_recipe_list"),
  t3team_recipe_validate: brokerHandler("t3_recipe_validate"),
  t3team_ask_user: (input) => askUser(input),
});
