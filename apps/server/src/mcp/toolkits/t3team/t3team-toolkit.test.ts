import { expect, it } from "@effect/vitest";
import { EnvironmentId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import { listImplementedT3TeamToolCatalogEntries } from "@t3tools/project-context/t3teamToolCatalog";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { McpSchema, McpServer } from "effect/unstable/ai";

import { T3TeamToolBroker, type T3TeamToolBinding } from "../../../t3team-toolBroker.ts";
import { T3TeamToolkitRegistrationLive } from "../../McpHttpServer.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import {
  T3TEAM_MCP_CANONICAL_TOOL_MAP,
  T3TEAM_MCP_DEPRECATED_TOOL_ALIASES,
  T3TEAM_MCP_POLICY_EXCLUDED_CANONICAL_TOOLS,
} from "./tools.ts";

it("maps or explicitly policy-excludes every canonical implemented tool", () => {
  const exposed: ReadonlySet<string> = new Set(Object.values(T3TEAM_MCP_CANONICAL_TOOL_MAP));
  const missing = listImplementedT3TeamToolCatalogEntries()
    .map((tool) => tool.id)
    .filter((id) => !exposed.has(id) && !T3TEAM_MCP_POLICY_EXCLUDED_CANONICAL_TOOLS.has(id));
  expect(missing).toEqual([]);
});

const threadId = ThreadId.make("thread-t3team-mcp-test");
const invocation: McpInvocationContext.McpInvocationScope = {
  environmentId: EnvironmentId.make("environment-t3team-mcp-test"),
  threadId,
  providerSessionId: "provider-session-t3team-mcp-test",
  providerInstanceId: ProviderInstanceId.make("pack-test"),
  capabilities: new Set(),
  issuedAt: 1,
};
const client = McpSchema.McpServerClient.of({
  clientId: 1,
  protocolVersion: "2025-06-18",
  initializePayload: {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "t3team-mcp-test", version: "1.0.0" },
  },
  getClient: Effect.die("unused"),
});

it.effect("routes MCP wrappers through the bound broker callTool dispatch", () => {
  const calls: Array<{
    readonly threadId: ThreadId;
    readonly tool: string;
    readonly args: unknown;
  }> = [];
  const binding: T3TeamToolBinding = {
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
  const broker = T3TeamToolBroker.of({
    sendMessage: () => Effect.succeed(undefined),
    bindSession: ({ threadId: boundThreadId }) =>
      Effect.succeed(boundThreadId === threadId ? binding : undefined),
    bindReadOnly: () => Effect.void.pipe(Effect.as(undefined)),
  });
  const TestLayer = T3TeamToolkitRegistrationLive.pipe(
    Layer.provideMerge(McpServer.McpServer.layer),
    Layer.provideMerge(Layer.succeed(T3TeamToolBroker, broker)),
  );

  return Effect.gen(function* () {
    const server = yield* McpServer.McpServer;
    const result = yield* server.callTool({
      name: "show_widget",
      arguments: {
        title: "MCP widget",
        widget_code: "<button>Continue</button>",
        format: "html",
        capabilities: { tools: ["t3team.thread.rename"] },
      },
    });

    expect(result.structuredContent).toEqual({ ok: true });
    expect(calls).toEqual([
      {
        threadId,
        tool: "t3team.widget.show",
        args: {
          title: "MCP widget",
          widget_code: "<button>Continue</button>",
          format: "html",
          capabilities: { tools: ["t3team.thread.rename"] },
        },
      },
    ]);
  }).pipe(
    Effect.provideService(McpInvocationContext.McpInvocationContext, invocation),
    Effect.provideService(McpSchema.McpServerClient, client),
    Effect.provide(TestLayer),
  );
});

// Legacy agent-facing names (t3team_* prefix, t3team_workflow_* aliases) are NOT registered
// tools anymore: they stay callable only through the HTTP transport's legacy-name
// normalization (apps/server/src/mcp/t3team-legacyToolNames.ts), which rewrites the request
// name BEFORE the MCP dispatcher sees it. Pack configs, agent prompts, and live transcripts
// still say the old names, and a hard break would silently strip the capability from running
// agents — so the alias registry is the single removable seam, covered end-to-end by
// t3team-mcpHttp.test.ts.
const orchestrationAliasCases = [
  {
    deprecated: "t3team_workflow_run",
    current: "orchestration_run",
    args: {
      source: "export const meta = { name: 'x' };",
      intent: { goal: "g", expectedOutcome: "o", guardrails: ["none"] },
    },
  },
  { deprecated: "t3team_workflow_status", current: "orchestration_status", args: {} },
  {
    deprecated: "t3team_workflow_resume",
    current: "orchestration_resume",
    args: { runId: "run-1" },
  },
] as const;

it("declares every deprecated orchestration alias with a mapped replacement", () => {
  expect(orchestrationAliasCases.map(({ deprecated, current }) => [deprecated, current])).toEqual(
    Object.entries(T3TEAM_MCP_DEPRECATED_TOOL_ALIASES),
  );
});

it.effect("keeps every legacy name out of the advertised toolkit", () => {
  const calls: Array<string> = [];
  const binding: T3TeamToolBinding = {
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
  const broker = T3TeamToolBroker.of({
    sendMessage: () => Effect.succeed(undefined),
    bindSession: ({ threadId: boundThreadId }) =>
      Effect.succeed(boundThreadId === threadId ? binding : undefined),
    bindReadOnly: () => Effect.void.pipe(Effect.as(undefined)),
  });
  const TestLayer = T3TeamToolkitRegistrationLive.pipe(
    Layer.provideMerge(McpServer.McpServer.layer),
    Layer.provideMerge(Layer.succeed(T3TeamToolBroker, broker)),
  );

  return Effect.gen(function* () {
    const server = yield* McpServer.McpServer;
    const names = server.tools.map(({ tool }) => tool.name);
    expect(names).not.toContain("t3team_workflow_run");
    expect(names.some((name) => name.startsWith("t3team_"))).toBe(false);
    yield* server.callTool({ name: "orchestration_status", arguments: {} });
    expect(calls).toEqual([T3TEAM_MCP_CANONICAL_TOOL_MAP.orchestration_status]);
  }).pipe(
    Effect.provideService(McpInvocationContext.McpInvocationContext, invocation),
    Effect.provideService(McpSchema.McpServerClient, client),
    Effect.provide(TestLayer),
  );
});

it.effect("routes recipe_list through the bound broker callTool dispatch", () => {
  const calls: Array<{
    readonly threadId: ThreadId;
    readonly tool: string;
    readonly args: unknown;
  }> = [];
  const binding: T3TeamToolBinding = {
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
  const broker = T3TeamToolBroker.of({
    sendMessage: () => Effect.succeed(undefined),
    bindSession: ({ threadId: boundThreadId }) =>
      Effect.succeed(boundThreadId === threadId ? binding : undefined),
    bindReadOnly: () => Effect.void.pipe(Effect.as(undefined)),
  });
  const TestLayer = T3TeamToolkitRegistrationLive.pipe(
    Layer.provideMerge(McpServer.McpServer.layer),
    Layer.provideMerge(Layer.succeed(T3TeamToolBroker, broker)),
  );

  return Effect.gen(function* () {
    const server = yield* McpServer.McpServer;
    const result = yield* server.callTool({
      name: "recipe_list",
      arguments: {},
    });

    expect(result.structuredContent).toEqual({
      ok: true,
      workspaceRoot: "/workspace",
      recipes: [],
      errors: [],
    });
    expect(calls).toEqual([{ threadId, tool: "t3team.recipe.list", args: {} }]);
  }).pipe(
    Effect.provideService(McpInvocationContext.McpInvocationContext, invocation),
    Effect.provideService(McpSchema.McpServerClient, client),
    Effect.provide(TestLayer),
  );
});

it.effect("routes recipe_validate through the bound broker callTool dispatch", () => {
  const calls: Array<{
    readonly threadId: ThreadId;
    readonly tool: string;
    readonly args: unknown;
  }> = [];
  const binding: T3TeamToolBinding = {
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
  const broker = T3TeamToolBroker.of({
    sendMessage: () => Effect.succeed(undefined),
    bindSession: ({ threadId: boundThreadId }) =>
      Effect.succeed(boundThreadId === threadId ? binding : undefined),
    bindReadOnly: () => Effect.void.pipe(Effect.as(undefined)),
  });
  const TestLayer = T3TeamToolkitRegistrationLive.pipe(
    Layer.provideMerge(McpServer.McpServer.layer),
    Layer.provideMerge(Layer.succeed(T3TeamToolBroker, broker)),
  );

  return Effect.gen(function* () {
    const server = yield* McpServer.McpServer;
    const result = yield* server.callTool({
      name: "recipe_validate",
      arguments: { source: "export const meta = { name: 'x' };" },
    });

    expect(result.structuredContent).toEqual({ ok: true, workflowPath: "<inline>", errors: [] });
    expect(calls).toEqual([
      {
        threadId,
        tool: "t3team.recipe.validate",
        args: { source: "export const meta = { name: 'x' };" },
      },
    ]);
  }).pipe(
    Effect.provideService(McpInvocationContext.McpInvocationContext, invocation),
    Effect.provideService(McpSchema.McpServerClient, client),
    Effect.provide(TestLayer),
  );
});
