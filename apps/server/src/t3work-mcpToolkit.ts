import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { McpSchema, McpServer } from "effect/unstable/ai";

import * as McpInvocationContext from "./mcp/McpInvocationContext.ts";
import { T3WORK_MCP_SERVER_NAME } from "./t3work-toolBroker.ts";
import { TOOL_SPECS } from "./t3work-toolBrokerHelpers.ts";
import { readT3workToolBinding } from "./t3work-toolBrokerSessionRegistry.ts";

const toCallToolResult = (result: {
  readonly content: ReadonlyArray<{ readonly type: "text"; readonly text: string }>;
  readonly structuredContent?: unknown;
  readonly isError?: boolean;
}) =>
  new McpSchema.CallToolResult({
    isError: result.isError === true,
    ...(result.structuredContent !== undefined
      ? { structuredContent: result.structuredContent }
      : {}),
    content: result.content.map((entry) => ({ type: "text" as const, text: entry.text })),
  });

const registerT3workTool = Effect.fn("T3workMcpToolkit.registerTool")(function* (toolId: string) {
  const spec = TOOL_SPECS[toolId as keyof typeof TOOL_SPECS];
  if (!spec) {
    return;
  }

  const server = yield* McpServer.McpServer;
  yield* server.addTool({
    tool: new McpSchema.Tool({
      name: spec.name,
      description: spec.description,
      inputSchema: spec.inputSchema,
      ...(spec.title ? { annotations: { title: spec.title } } : {}),
    }),
    annotations: Context.empty(),
    handle: (payload) =>
      Effect.withFiber((fiber) => {
        const invocation = Context.getUnsafe(
          fiber.context,
          McpInvocationContext.McpInvocationContext,
        );
        return Effect.gen(function* () {
          if (!invocation.capabilities.has("t3work")) {
            return toCallToolResult({
              content: [
                { type: "text", text: "MCP credential does not grant the t3work capability." },
              ],
              isError: true,
            });
          }
          const binding = readT3workToolBinding(invocation.threadId);
          if (!binding) {
            return toCallToolResult({
              content: [{ type: "text", text: "t3work tools are not bound for this thread." }],
              isError: true,
            });
          }

          const allowedTools = binding
            .listServers()
            .find((entry) => entry.name === T3WORK_MCP_SERVER_NAME)?.tools;
          if (!allowedTools || !(toolId in allowedTools)) {
            return toCallToolResult({
              content: [{ type: "text", text: `Tool '${toolId}' is not enabled for this thread.` }],
              isError: true,
            });
          }

          const result = yield* binding.callTool({
            server: T3WORK_MCP_SERVER_NAME,
            tool: toolId,
            arguments: payload,
            threadId: invocation.threadId,
          });
          return toCallToolResult(result);
        }).pipe(
          Effect.provideService(McpInvocationContext.McpInvocationContext, invocation),
          Effect.catch((cause: unknown) =>
            Effect.succeed(
              toCallToolResult({
                content: [
                  {
                    type: "text",
                    text: cause instanceof Error ? cause.message : "t3work tool execution failed.",
                  },
                ],
                isError: true,
              }),
            ),
          ),
        );
      }),
  });
});

const registerT3workTools = Effect.fn("T3workMcpToolkit.registerTools")(function* () {
  for (const toolId of Object.keys(TOOL_SPECS)) {
    yield* registerT3workTool(toolId);
  }
});

export const T3workMcpToolkitRegistrationLive = Layer.effectDiscard(registerT3workTools());
