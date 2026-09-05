import * as Effect from "effect/Effect";

import { t3teamHelp } from "../../../t3team-help.ts";
import { T3TEAM_MCP_SERVER_NAME, T3TeamToolBroker } from "../../../t3team-toolBroker.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import { T3TEAM_MCP_CANONICAL_TOOL_MAP, T3TeamMcpToolError, T3TeamToolkit } from "./tools.ts";

const callBroker = Effect.fn("T3TeamMcpToolkit.callBroker")(function* (
  tool: string,
  arguments_: unknown,
) {
  const invocation = yield* McpInvocationContext.McpInvocationContext;
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

// Cross-thread delivery uses the dedicated broker.sendMessage API rather than
// the bound-thread callTool dispatch: the sender is the calling thread and the
// recipient is an arbitrary target thread, which the bound-tool surface does
// not model. broker.sendMessage fails with a plain string, mapped here to the
// toolkit error.
const sendMessage = Effect.fn("T3TeamMcpToolkit.sendMessage")(function* (input: {
  readonly to_thread_id: string;
  readonly text: string;
  readonly summary?: string | undefined;
}) {
  const invocation = yield* McpInvocationContext.McpInvocationContext;
  const broker = yield* T3TeamToolBroker;
  return yield* broker
    .sendMessage({
      toThreadId: input.to_thread_id,
      fromThreadId: invocation.threadId,
      text: input.text,
      ...(input.summary !== undefined ? { summary: input.summary } : {}),
    })
    .pipe(Effect.mapError((message) => new T3TeamMcpToolError({ message })));
});

export const T3TeamToolkitHandlersLive = T3TeamToolkit.toLayer({
  models: (input) => callBroker(T3TEAM_MCP_CANONICAL_TOOL_MAP.models, input),
  provider_usage: (input) =>
    callBroker(T3TEAM_MCP_CANONICAL_TOOL_MAP.provider_usage, input),
  rename_thread: (input) =>
    callBroker(T3TEAM_MCP_CANONICAL_TOOL_MAP.rename_thread, input),
  search_thread: (input) =>
    callBroker(T3TEAM_MCP_CANONICAL_TOOL_MAP.search_thread, input),
  search_source: (input) =>
    callBroker(T3TEAM_MCP_CANONICAL_TOOL_MAP.search_source, input),
  read_message: (input) =>
    callBroker(T3TEAM_MCP_CANONICAL_TOOL_MAP.read_message, input),
  start_child: (input) =>
    callBroker(T3TEAM_MCP_CANONICAL_TOOL_MAP.start_child, input),
  children: (input) => callBroker(T3TEAM_MCP_CANONICAL_TOOL_MAP.children, input),
  send_message: (input) => sendMessage(input),
  orchestration_run: (input) =>
    callBroker(T3TEAM_MCP_CANONICAL_TOOL_MAP.orchestration_run, input),
  orchestration_status: (input) =>
    callBroker(T3TEAM_MCP_CANONICAL_TOOL_MAP.orchestration_status, input),
  orchestration_resume: (input) =>
    callBroker(T3TEAM_MCP_CANONICAL_TOOL_MAP.orchestration_resume, input),
  orchestration_pause: (input) =>
    callBroker(T3TEAM_MCP_CANONICAL_TOOL_MAP.orchestration_pause, input),
  orchestration_stop: (input) =>
    callBroker(T3TEAM_MCP_CANONICAL_TOOL_MAP.orchestration_stop, input),
  show_widget: (input) =>
    callBroker(T3TEAM_MCP_CANONICAL_TOOL_MAP.show_widget, input),
  help: (input) => Effect.succeed(t3teamHelp(input.topic)),
  recipe_list: (input) =>
    callBroker(T3TEAM_MCP_CANONICAL_TOOL_MAP.recipe_list, input),
  recipe_validate: (input) =>
    callBroker(T3TEAM_MCP_CANONICAL_TOOL_MAP.recipe_validate, input),
});
