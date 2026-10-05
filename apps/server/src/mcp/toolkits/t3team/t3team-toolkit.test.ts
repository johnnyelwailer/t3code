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
  mcpDescriptionOf,
  T3TeamToolkit,
} from "./tools.ts";
import { TOOL_SPECS } from "../../../t3team-toolBrokerHelpers.ts";

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
  clientCapabilities: {},
  clientInfo: { name: "t3team-test", version: "1.0.0" },
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
      name: "t3team_show_widget",
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

// The agent-orchestration rename kept the old MCP names as deprecated aliases:
// pack configs, agent prompts, and live transcripts still say t3team_workflow_*,
// and a hard break would silently strip the capability from running agents.
const orchestrationAliasCases = [
  {
    deprecated: "t3team_workflow_run",
    current: "t3team_orchestration_run",
    args: {
      source: "export const meta = { name: 'x' };",
      intent: { goal: "g", expectedOutcome: "o", guardrails: ["none"] },
    },
  },
  { deprecated: "t3team_workflow_status", current: "t3team_orchestration_status", args: {} },
  {
    deprecated: "t3team_workflow_resume",
    current: "t3team_orchestration_resume",
    args: { runId: "run-1" },
  },
] as const;

it("declares every deprecated orchestration alias with a mapped replacement", () => {
  expect(orchestrationAliasCases.map(({ deprecated, current }) => [deprecated, current])).toEqual(
    Object.entries(T3TEAM_MCP_DEPRECATED_TOOL_ALIASES),
  );
});

for (const { deprecated, current, args } of orchestrationAliasCases) {
  it.effect(`dispatches ${deprecated} and ${current} to the same broker tool`, () => {
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
      yield* server.callTool({ name: current, arguments: args });
      yield* server.callTool({ name: deprecated, arguments: args });

      expect(calls).toHaveLength(2);
      expect(calls[0]).toBe(T3TEAM_MCP_CANONICAL_TOOL_MAP[current]);
      expect(calls[1]).toBe(calls[0]);
    }).pipe(
      Effect.provideService(McpInvocationContext.McpInvocationContext, invocation),
      Effect.provideService(McpSchema.McpServerClient, client),
      Effect.provide(TestLayer),
    );
  });
}

it.effect("routes t3team_recipe_list through the bound broker callTool dispatch", () => {
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
      name: "t3team_recipe_list",
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

it.effect("routes t3team_recipe_validate through the bound broker callTool dispatch", () => {
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
      name: "t3team_recipe_validate",
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

// Hand-written help drifted from the runtime (it taught an unbound name) and flooded the parent's
// context. The topics now live where they are needed: tool descriptions and the author agent's
// generated reference. A `t3team_help` tool must never come back.
it("no longer registers t3team_help: tool descriptions alone must be enough", () => {
  expect(Object.keys(T3TeamToolkit.tools)).not.toContain("t3team_help");
  expect(Object.keys(T3TEAM_MCP_CANONICAL_TOOL_MAP)).not.toContain("t3team_help");
});

// In-app agents read the BROKER catalog (TOOL_SPECS copies its descriptions); MCP agents read the
// toolkit. One description source, rendered with each surface's tool names (fork #350 review).
it("MCP and broker surfaces expose the SAME description text for run, resume and models", () => {
  const cases = [
    ["t3team_orchestration_run", "t3team.orchestration.run"],
    ["t3team_orchestration_resume", "t3team.orchestration.resume"],
    ["t3team_models", "t3team.runtime.models"],
  ] as const;
  for (const [mcpName, canonicalId] of cases) {
    const mcp = (T3TeamToolkit.tools as Record<string, { readonly description?: string }>)[mcpName];
    const broker = TOOL_SPECS[canonicalId].description;
    expect(mcp?.description).toBe(mcpDescriptionOf(canonicalId));
    // Same text modulo tool naming: undo the MCP rename and the broker text must come back.
    let unmapped = mcp?.description ?? "";
    for (const [name, id] of Object.entries(T3TEAM_MCP_CANONICAL_TOOL_MAP)) {
      unmapped = unmapped.replaceAll(name, id);
    }
    expect(unmapped).toBe(broker);
    expect(broker).toContain(
      canonicalId === "t3team.orchestration.resume"
        ? "corrected 'args'"
        : canonicalId === "t3team.runtime.models"
          ? "declared default"
          : "'intent'",
    );
  }
});
