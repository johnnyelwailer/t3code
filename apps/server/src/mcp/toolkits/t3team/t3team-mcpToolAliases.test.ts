import { expect, it } from "@effect/vitest";
import { EnvironmentId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { McpSchema, McpServer } from "effect/unstable/ai";

import { T3TeamToolBroker, type T3TeamToolBinding } from "../../../t3team-toolBroker.ts";
import { T3TeamToolkitRegistrationLive } from "../../McpHttpServer.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import { T3TEAM_DEPRECATED_MCP_TOOL_ALIASES } from "./t3team-mcpToolAliases.ts";
import { T3TEAM_MCP_CANONICAL_TOOL_MAP, T3TeamToolkit } from "./tools.ts";

const threadId = ThreadId.make("thread-t3team-alias-test");
const invocation: McpInvocationContext.McpInvocationScope = {
  environmentId: EnvironmentId.make("environment-t3team-alias-test"),
  threadId,
  providerSessionId: "provider-session-t3team-alias-test",
  providerInstanceId: ProviderInstanceId.make("pack-test"),
  capabilities: new Set(["orchestration"]),
  issuedAt: 1,
};
const client = McpSchema.McpServerClient.of({
  clientId: 1,
  clientCapabilities: {},
  clientInfo: { name: "t3team-alias-test", version: "1.0.0" },
  protocolVersion: "2025-06-18",
  initializePayload: {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "t3team-alias-test", version: "1.0.0" },
  },
  getClient: Effect.die("unused"),
});

const aliases = Object.entries(T3TEAM_DEPRECATED_MCP_TOOL_ALIASES);
const tools = T3TeamToolkit.tools as Record<string, { readonly description?: string }>;

// A minimal valid argument set per renamed tool.
const sampleArguments: Record<string, unknown> = {
  t3_provider_usage: {},
  t3_search_thread: { query: "decision" },
  t3_search_source: { query: "decision" },
  t3_read_message: { message_id: "message-1" },
  t3_task_ops: { op: "environments" },
  t3_orchestration_run: {
    source: "export const meta = {}",
    intent: { goal: "g", expectedOutcome: "o", guardrails: [] },
  },
  t3_orchestration_status: { runId: "run-1" },
  t3_orchestration_resume: { runId: "run-1" },
  t3_orchestration_pause: { runId: "run-1" },
  t3_orchestration_stop: { runId: "run-1" },
  t3_show_widget: { title: "w", widget_code: "<b>x</b>" },
  t3_recipe_list: {},
  t3_recipe_validate: { source: "export const meta = {}" },
};

it("names every renamed tool: the new name is registered, the old name is its alias", () => {
  expect(aliases).toHaveLength(14);
  for (const [oldName, newName] of aliases) {
    expect(oldName.startsWith("t3team_")).toBe(true);
    expect(newName.startsWith("t3_")).toBe(true);
    expect(Object.keys(tools)).toContain(newName);
    expect(Object.keys(tools)).toContain(oldName);
  }
  // Nothing outside the table keeps the old prefix on the renamed surface.
  const stillPrefixed = Object.keys(tools).filter((name) => name.startsWith("t3team_"));
  expect(stillPrefixed.toSorted()).toEqual(
    [...Object.keys(T3TEAM_DEPRECATED_MCP_TOOL_ALIASES), "t3team_thread_skill_metadata"].toSorted(),
  );
});

it("every alias carries the deprecation notice naming its replacement", () => {
  for (const [oldName, newName] of aliases) {
    const description = tools[oldName]?.description ?? "";
    expect(description).toContain(`Deprecated — use ${newName};`);
    expect(description).toContain("kept for one release cycle and will be removed");
    // The replacement keeps its real description.
    expect(tools[newName]?.description).not.toContain("Deprecated");
  }
});

it("the canonical-tool map is keyed by the new names only", () => {
  for (const [oldName, newName] of aliases) {
    expect(Object.keys(T3TEAM_MCP_CANONICAL_TOOL_MAP)).not.toContain(oldName);
    if (newName !== "t3_ask_user") {
      expect(Object.keys(T3TEAM_MCP_CANONICAL_TOOL_MAP)).toContain(newName);
    }
  }
  expect(T3TEAM_MCP_CANONICAL_TOOL_MAP.t3_task_ops).toBe("t3team.thread.children");
});

it.effect(
  "each alias forwards to the same broker tool, with the same arguments, as its name",
  () => {
    const calls: Array<{ readonly tool: string; readonly args: unknown }> = [];
    const binding: T3TeamToolBinding = {
      threadId,
      listServers: () => [],
      readResource: ({ uri }) => Effect.succeed({ contents: [{ uri, text: "{}" }] }),
      callTool: ({ tool, arguments: args }) => {
        calls.push({ tool, args });
        return Effect.succeed({
          content: [{ type: "text" as const, text: "ok" }],
          structuredContent: { ok: true },
        });
      },
    };
    const broker = T3TeamToolBroker.of({
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
      for (const [oldName, newName] of aliases) {
        // `t3_ask_user` records on the thread instead of calling the broker (own tests).
        if (newName === "t3_ask_user") continue;
        const args = sampleArguments[newName];
        calls.length = 0;
        const viaNew = yield* server.callTool({ name: newName, arguments: args as never });
        const viaOld = yield* server.callTool({ name: oldName, arguments: args as never });
        expect(viaOld.isError, oldName).not.toBe(true);
        expect(viaOld.structuredContent, oldName).toEqual(viaNew.structuredContent);
        expect(calls, oldName).toHaveLength(2);
        expect(calls[1], oldName).toEqual(calls[0]);
        expect(calls[0]?.tool).toBe(
          T3TEAM_MCP_CANONICAL_TOOL_MAP[newName as keyof typeof T3TEAM_MCP_CANONICAL_TOOL_MAP],
        );
      }
    }).pipe(
      Effect.provideService(McpInvocationContext.McpInvocationContext, invocation),
      Effect.provideService(McpSchema.McpServerClient, client),
      Effect.provide(TestLayer),
    );
  },
);

it.effect("the deprecated t3team_ask_user alias is gated like t3_ask_user", () => {
  const broker = T3TeamToolBroker.of({
    bindSession: () => Effect.succeed(undefined),
    bindReadOnly: () => Effect.void.pipe(Effect.as(undefined)),
  });
  const TestLayer = T3TeamToolkitRegistrationLive.pipe(
    Layer.provideMerge(McpServer.McpServer.layer),
    Layer.provideMerge(Layer.succeed(T3TeamToolBroker, broker)),
  );
  return Effect.gen(function* () {
    const server = yield* McpServer.McpServer;
    const viaNew = yield* server.callTool({ name: "t3_ask_user", arguments: { question: "?" } });
    const viaOld = yield* server.callTool({
      name: "t3team_ask_user",
      arguments: { question: "?" },
    });
    expect(viaNew.isError).toBe(true);
    expect(viaOld.content).toEqual(viaNew.content);
  }).pipe(
    Effect.provideService(McpInvocationContext.McpInvocationContext, {
      ...invocation,
      capabilities: new Set<McpInvocationContext.McpCapability>(),
    }),
    Effect.provideService(McpSchema.McpServerClient, client),
    Effect.provide(TestLayer),
  );
});
