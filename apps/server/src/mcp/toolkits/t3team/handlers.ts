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
  t3team_models: (input) => callBroker(T3TEAM_MCP_CANONICAL_TOOL_MAP.t3team_models, input),
  t3team_rename_thread: (input) =>
    callBroker(T3TEAM_MCP_CANONICAL_TOOL_MAP.t3team_rename_thread, input),
  t3team_search_thread: (input) =>
    callBroker(T3TEAM_MCP_CANONICAL_TOOL_MAP.t3team_search_thread, input),
  t3team_search_source: (input) =>
    callBroker(T3TEAM_MCP_CANONICAL_TOOL_MAP.t3team_search_source, input),
  t3team_read_message: (input) =>
    callBroker(T3TEAM_MCP_CANONICAL_TOOL_MAP.t3team_read_message, input),
  t3team_start_child: (input) =>
    callBroker(T3TEAM_MCP_CANONICAL_TOOL_MAP.t3team_start_child, input),
  t3team_children: (input) => callBroker(T3TEAM_MCP_CANONICAL_TOOL_MAP.t3team_children, input),
  t3team_send_message: (input) => sendMessage(input),
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
  // Deprecated aliases — routed to the SAME canonical targets as the
  // t3team_orchestration_* handlers above, so agents already calling the
  // workflow-era ids keep working.
  t3team_workflow_run: (input) =>
    callBroker(T3TEAM_MCP_CANONICAL_TOOL_MAP.t3team_orchestration_run, input),
  t3team_workflow_status: (input) =>
    callBroker(T3TEAM_MCP_CANONICAL_TOOL_MAP.t3team_orchestration_status, input),
  t3team_workflow_resume: (input) =>
    callBroker(T3TEAM_MCP_CANONICAL_TOOL_MAP.t3team_orchestration_resume, input),
  t3team_show_widget: (input) =>
    callBroker(T3TEAM_MCP_CANONICAL_TOOL_MAP.t3team_show_widget, input),
  t3team_help: (input) => Effect.succeed(t3teamHelp(input.topic)),
  t3team_recipe_list: (input) =>
    callBroker(T3TEAM_MCP_CANONICAL_TOOL_MAP.t3team_recipe_list, input),
  t3team_recipe_validate: (input) =>
    callBroker(T3TEAM_MCP_CANONICAL_TOOL_MAP.t3team_recipe_validate, input),
});
