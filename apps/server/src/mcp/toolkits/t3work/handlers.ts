import * as Effect from "effect/Effect";

import { T3WORK_MCP_SERVER_NAME, T3workToolBroker } from "../../../t3work-toolBroker.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import { T3workMcpToolError, T3workToolkit } from "./tools.ts";

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

export const T3workToolkitHandlersLive = T3workToolkit.toLayer({
  t3work_rename_thread: (input) => callBroker("t3work.thread.rename", input),
  t3work_start_child: (input) => callBroker("t3work.thread.start_child", input),
});
