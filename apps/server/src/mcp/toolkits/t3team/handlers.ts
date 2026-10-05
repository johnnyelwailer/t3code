import * as Effect from "effect/Effect";

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

export const T3TeamToolkitHandlersLive = T3TeamToolkit.toLayer({
  t3team_provider_usage: (input) =>
    callBroker(T3TEAM_MCP_CANONICAL_TOOL_MAP.t3team_provider_usage, input),
  t3team_search_thread: (input) =>
    callBroker(T3TEAM_MCP_CANONICAL_TOOL_MAP.t3team_search_thread, input),
  t3team_search_source: (input) =>
    callBroker(T3TEAM_MCP_CANONICAL_TOOL_MAP.t3team_search_source, input),
  t3team_read_message: (input) =>
    callBroker(T3TEAM_MCP_CANONICAL_TOOL_MAP.t3team_read_message, input),
  t3team_ask_user: (input) => askUser(input),
  t3team_children: (input) => callBroker(T3TEAM_MCP_CANONICAL_TOOL_MAP.t3team_children, input),
  t3team_orchestration_run: (input) =>
    callBroker(T3TEAM_MCP_CANONICAL_TOOL_MAP.t3team_orchestration_run, input),
  t3team_orchestration_status: (input) =>
    callBroker(T3TEAM_MCP_CANONICAL_TOOL_MAP.t3team_orchestration_status, input),
  t3team_orchestration_resume: (input) =>
    callBroker(T3TEAM_MCP_CANONICAL_TOOL_MAP.t3team_orchestration_resume, input),
  t3team_orchestration_pause: (input) =>
    callBroker(T3TEAM_MCP_CANONICAL_TOOL_MAP.t3team_orchestration_pause, input),
  t3team_orchestration_stop: (input) =>
    callBroker(T3TEAM_MCP_CANONICAL_TOOL_MAP.t3team_orchestration_stop, input),
  t3team_show_widget: (input) =>
    callBroker(T3TEAM_MCP_CANONICAL_TOOL_MAP.t3team_show_widget, input),
  t3team_recipe_list: (input) =>
    callBroker(T3TEAM_MCP_CANONICAL_TOOL_MAP.t3team_recipe_list, input),
  t3team_recipe_validate: (input) =>
    callBroker(T3TEAM_MCP_CANONICAL_TOOL_MAP.t3team_recipe_validate, input),
});
