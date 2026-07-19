import * as Effect from "effect/Effect";

import { t3workHelp } from "../../../t3work-help.ts";
import { T3WORK_MCP_SERVER_NAME, T3workToolBroker } from "../../../t3work-toolBroker.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import { T3WORK_MCP_CANONICAL_TOOL_MAP, T3workMcpToolError, T3workToolkit } from "./tools.ts";

const callBroker = Effect.fn("T3workMcpToolkit.callBroker")(function* (
  tool: string,
  arguments_: unknown,
) {
  const invocation = yield* McpInvocationContext.McpInvocationContext;
  const broker = yield* T3workToolBroker;
  const binding = yield* broker.bindSession({ threadId: invocation.threadId });
  if (!binding) {
    return yield* new T3workMcpToolError({
      message: "T3work tools are unavailable for this thread.",
    });
  }

  const result = yield* binding.callTool({
    server: T3WORK_MCP_SERVER_NAME,
    tool,
    arguments: arguments_,
  });
  if (result.isError) {
    return yield* new T3workMcpToolError({
      message: result.content[0]?.text ?? "T3work tool call failed.",
    });
  }
  return result.structuredContent ?? result.content;
});

// Cross-thread delivery uses the dedicated broker.sendMessage API rather than
// the bound-thread callTool dispatch: the sender is the calling thread and the
// recipient is an arbitrary target thread, which the bound-tool surface does
// not model. broker.sendMessage fails with a plain string, mapped here to the
// toolkit error.
const sendMessage = Effect.fn("T3workMcpToolkit.sendMessage")(function* (input: {
  readonly to_thread_id: string;
  readonly text: string;
}) {
  const invocation = yield* McpInvocationContext.McpInvocationContext;
  const broker = yield* T3workToolBroker;
  return yield* broker
    .sendMessage({
      toThreadId: input.to_thread_id,
      fromThreadId: invocation.threadId,
      text: input.text,
    })
    .pipe(Effect.mapError((message) => new T3workMcpToolError({ message })));
});

export const T3workToolkitHandlersLive = T3workToolkit.toLayer({
  t3work_rename_thread: (input) =>
    callBroker(T3WORK_MCP_CANONICAL_TOOL_MAP.t3work_rename_thread, input),
  t3work_start_child: (input) =>
    callBroker(T3WORK_MCP_CANONICAL_TOOL_MAP.t3work_start_child, input),
  t3work_send_message: (input) => sendMessage(input),
  t3work_workflow_run: (input) =>
    callBroker(T3WORK_MCP_CANONICAL_TOOL_MAP.t3work_workflow_run, input),
  t3work_show_widget: (input) =>
    callBroker(T3WORK_MCP_CANONICAL_TOOL_MAP.t3work_show_widget, input),
  t3work_help: (input) => Effect.succeed(t3workHelp(input.topic)),
});
