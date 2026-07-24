import { expect, it } from "@effect/vitest";
import { EnvironmentId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import { listImplementedT3workToolCatalogEntries } from "@t3tools/project-context/t3workToolCatalog";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { McpSchema, McpServer } from "effect/unstable/ai";

import { T3workToolBroker, type T3workToolBinding } from "../../../t3work-toolBroker.ts";
import { T3workToolkitRegistrationLive } from "../../McpHttpServer.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import {
  T3WORK_MCP_CANONICAL_TOOL_MAP,
  T3WORK_MCP_DEPRECATED_TOOL_ALIASES,
  T3WORK_MCP_POLICY_EXCLUDED_CANONICAL_TOOLS,
} from "./tools.ts";

it("maps or explicitly policy-excludes every canonical implemented tool", () => {
  const exposed: ReadonlySet<string> = new Set(Object.values(T3WORK_MCP_CANONICAL_TOOL_MAP));
  const missing = listImplementedT3workToolCatalogEntries()
    .map((tool) => tool.id)
    .filter((id) => !exposed.has(id) && !T3WORK_MCP_POLICY_EXCLUDED_CANONICAL_TOOLS.has(id));
  expect(missing).toEqual([]);
});

const threadId = ThreadId.make("thread-t3work-mcp-test");
const invocation: McpInvocationContext.McpInvocationScope = {
  environmentId: EnvironmentId.make("environment-t3work-mcp-test"),
  threadId,
  providerSessionId: "provider-session-t3work-mcp-test",
  providerInstanceId: ProviderInstanceId.make("pack-test"),
  capabilities: new Set(),
  issuedAt: 1,
  expiresAt: Number.MAX_SAFE_INTEGER,
};
const client = McpSchema.McpServerClient.of({
  clientId: 1,
  initializePayload: {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "t3work-mcp-test", version: "1.0.0" },
  },
  getClient: Effect.die("unused"),
});

it.effect("routes MCP wrappers through the bound broker callTool dispatch", () => {
  const calls: Array<{
    readonly threadId: ThreadId;
    readonly tool: string;
    readonly args: unknown;
  }> = [];
  const binding: T3workToolBinding = {
    threadId,
    listServers: () => [],
    readResource: ({ uri }) => Effect.succeed({ contents: [{ uri, text: "{}" }] }),
    callTool: ({ tool, arguments: args }) => {
      calls.push({ threadId, tool, args });
      return Effect.succeed({
        content: [{ type: "text" as const, text: "ok" }],
        structuredContent: { ok: true },
      });
    },
  };
  const broker = T3workToolBroker.of({
    sendMessage: () => Effect.succeed(undefined),
    bindSession: ({ threadId: boundThreadId }) =>
      Effect.succeed(boundThreadId === threadId ? binding : undefined),
    bindReadOnly: () => Effect.void.pipe(Effect.as(undefined)),
  });
  const TestLayer = T3workToolkitRegistrationLive.pipe(
    Layer.provideMerge(McpServer.McpServer.layer),
    Layer.provideMerge(Layer.succeed(T3workToolBroker, broker)),
  );

  return Effect.gen(function* () {
    const server = yield* McpServer.McpServer;
    const result = yield* server.callTool({
      name: "t3work_show_widget",
      arguments: {
        title: "MCP widget",
        widget_code: "<button>Continue</button>",
        format: "html",
        capabilities: { tools: ["t3work.thread.rename"] },
      },
    });

    expect(result.structuredContent).toEqual({ ok: true });
    expect(calls).toEqual([
      {
        threadId,
        tool: "t3work.widget.show",
        args: {
          title: "MCP widget",
          widget_code: "<button>Continue</button>",
          format: "html",
          capabilities: { tools: ["t3work.thread.rename"] },
        },
      },
    ]);
  }).pipe(
    Effect.provideService(McpInvocationContext.McpInvocationContext, invocation),
    Effect.provideService(McpSchema.McpServerClient, client),
    Effect.provide(TestLayer),
  );
});

// The agent-orchestration rename kept the old MCP names as deprecated aliases:
// pack configs, agent prompts, and live transcripts still say t3work_workflow_*,
// and a hard break would silently strip the capability from running agents.
const orchestrationAliasCases = [
  {
    deprecated: "t3work_workflow_run",
    current: "t3work_orchestration_run",
    args: {
      source: "export const meta = { name: 'x' };",
      intent: { goal: "g", expectedOutcome: "o", guardrails: ["none"] },
    },
  },
  { deprecated: "t3work_workflow_status", current: "t3work_orchestration_status", args: {} },
  {
    deprecated: "t3work_workflow_resume",
    current: "t3work_orchestration_resume",
    args: { runId: "run-1" },
  },
] as const;

it("declares every deprecated orchestration alias with a mapped replacement", () => {
  expect(orchestrationAliasCases.map(({ deprecated, current }) => [deprecated, current])).toEqual(
    Object.entries(T3WORK_MCP_DEPRECATED_TOOL_ALIASES),
  );
});

for (const { deprecated, current, args } of orchestrationAliasCases) {
  it.effect(`dispatches ${deprecated} and ${current} to the same broker tool`, () => {
    const calls: Array<string> = [];
    const binding: T3workToolBinding = {
      threadId,
      listServers: () => [],
      readResource: ({ uri }) => Effect.succeed({ contents: [{ uri, text: "{}" }] }),
      callTool: ({ tool }) => {
        calls.push(tool);
        return Effect.succeed({
          content: [{ type: "text" as const, text: "ok" }],
          structuredContent: { ok: true },
        });
      },
    };
    const broker = T3workToolBroker.of({
      sendMessage: () => Effect.succeed(undefined),
      bindSession: ({ threadId: boundThreadId }) =>
        Effect.succeed(boundThreadId === threadId ? binding : undefined),
      bindReadOnly: () => Effect.void.pipe(Effect.as(undefined)),
    });
    const TestLayer = T3workToolkitRegistrationLive.pipe(
      Layer.provideMerge(McpServer.McpServer.layer),
      Layer.provideMerge(Layer.succeed(T3workToolBroker, broker)),
    );

    return Effect.gen(function* () {
      const server = yield* McpServer.McpServer;
      yield* server.callTool({ name: current, arguments: args });
      yield* server.callTool({ name: deprecated, arguments: args });

      expect(calls).toHaveLength(2);
      expect(calls[0]).toBe(T3WORK_MCP_CANONICAL_TOOL_MAP[current]);
      expect(calls[1]).toBe(calls[0]);
    }).pipe(
      Effect.provideService(McpInvocationContext.McpInvocationContext, invocation),
      Effect.provideService(McpSchema.McpServerClient, client),
      Effect.provide(TestLayer),
    );
  });
}

it.effect("routes t3work_recipe_list through the bound broker callTool dispatch", () => {
  const calls: Array<{
    readonly threadId: ThreadId;
    readonly tool: string;
    readonly args: unknown;
  }> = [];
  const binding: T3workToolBinding = {
    threadId,
    listServers: () => [],
    readResource: ({ uri }) => Effect.succeed({ contents: [{ uri, text: "{}" }] }),
    callTool: ({ tool, arguments: args }) => {
      calls.push({ threadId, tool, args });
      return Effect.succeed({
        content: [{ type: "text" as const, text: "ok" }],
        structuredContent: { ok: true, workspaceRoot: "/workspace", recipes: [], errors: [] },
      });
    },
  };
  const broker = T3workToolBroker.of({
    sendMessage: () => Effect.succeed(undefined),
    bindSession: ({ threadId: boundThreadId }) =>
      Effect.succeed(boundThreadId === threadId ? binding : undefined),
    bindReadOnly: () => Effect.void.pipe(Effect.as(undefined)),
  });
  const TestLayer = T3workToolkitRegistrationLive.pipe(
    Layer.provideMerge(McpServer.McpServer.layer),
    Layer.provideMerge(Layer.succeed(T3workToolBroker, broker)),
  );

  return Effect.gen(function* () {
    const server = yield* McpServer.McpServer;
    const result = yield* server.callTool({
      name: "t3work_recipe_list",
      arguments: {},
    });

    expect(result.structuredContent).toEqual({
      ok: true,
      workspaceRoot: "/workspace",
      recipes: [],
      errors: [],
    });
    expect(calls).toEqual([{ threadId, tool: "t3work.recipe.list", args: {} }]);
  }).pipe(
    Effect.provideService(McpInvocationContext.McpInvocationContext, invocation),
    Effect.provideService(McpSchema.McpServerClient, client),
    Effect.provide(TestLayer),
  );
});

it.effect("routes t3work_recipe_validate through the bound broker callTool dispatch", () => {
  const calls: Array<{
    readonly threadId: ThreadId;
    readonly tool: string;
    readonly args: unknown;
  }> = [];
  const binding: T3workToolBinding = {
    threadId,
    listServers: () => [],
    readResource: ({ uri }) => Effect.succeed({ contents: [{ uri, text: "{}" }] }),
    callTool: ({ tool, arguments: args }) => {
      calls.push({ threadId, tool, args });
      return Effect.succeed({
        content: [{ type: "text" as const, text: "ok" }],
        structuredContent: { ok: true, workflowPath: "<inline>", errors: [] },
      });
    },
  };
  const broker = T3workToolBroker.of({
    sendMessage: () => Effect.succeed(undefined),
    bindSession: ({ threadId: boundThreadId }) =>
      Effect.succeed(boundThreadId === threadId ? binding : undefined),
    bindReadOnly: () => Effect.void.pipe(Effect.as(undefined)),
  });
  const TestLayer = T3workToolkitRegistrationLive.pipe(
    Layer.provideMerge(McpServer.McpServer.layer),
    Layer.provideMerge(Layer.succeed(T3workToolBroker, broker)),
  );

  return Effect.gen(function* () {
    const server = yield* McpServer.McpServer;
    const result = yield* server.callTool({
      name: "t3work_recipe_validate",
      arguments: { source: "export const meta = { name: 'x' };" },
    });

    expect(result.structuredContent).toEqual({ ok: true, workflowPath: "<inline>", errors: [] });
    expect(calls).toEqual([
      {
        threadId,
        tool: "t3work.recipe.validate",
        args: { source: "export const meta = { name: 'x' };" },
      },
    ]);
  }).pipe(
    Effect.provideService(McpInvocationContext.McpInvocationContext, invocation),
    Effect.provideService(McpSchema.McpServerClient, client),
    Effect.provide(TestLayer),
  );
});
