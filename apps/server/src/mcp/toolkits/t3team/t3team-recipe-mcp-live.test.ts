/**
 * Live-path integration for the recipe MCP tools: proves that a provider agent reaching the
 * server over `/mcp` can (a) authenticate with a real `McpSessionRegistry`-minted bearer, (b) see
 * `t3team_recipe_list`/`t3team_recipe_validate` in the registered toolkit, and (c) get a REAL
 * static-validation result back — the full registration → handler → broker dispatch → recipe
 * validation chain, driven through the same `McpServer` object the HTTP transport uses. The broker
 * binding runs the real `callT3TeamRecipeTool` + `makeRecipeToolHandlers` (no mock result), so the
 * inline-`source` path executes `validateInlineWorkflowSourceForAgent` for real.
 */
import { expect, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { EnvironmentId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { HttpServer } from "effect/unstable/http";
import { McpSchema, McpServer } from "effect/unstable/ai";

import * as ServerEnvironment from "../../../environment/ServerEnvironment.ts";
import {
  T3TeamToolBroker,
  type T3TeamToolBinding,
  type T3TeamToolCallResult,
} from "../../../t3team-toolBroker.ts";
import {
  callT3TeamRecipeTool,
  isT3TeamRecipeTool,
  type T3TeamRecipeToolId,
} from "../../../t3team-toolBrokerBindingRecipes.ts";
import { makeRecipeToolHandlers } from "../../../t3team-toolBrokerRecipeTools.ts";
import { T3TeamToolkitRegistrationLive } from "../../McpHttpServer.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import * as McpSessionRegistry from "../../McpSessionRegistry.ts";

const environmentId = EnvironmentId.make("environment-recipe-mcp-live");
const threadId = ThreadId.make("thread-recipe-mcp-live");
const providerInstanceId = ProviderInstanceId.make("nexplore-global");

const VALID_WORKFLOW = [
  "export const meta = {",
  '  name: "agent-live.valid",',
  '  description: "Summarize a PR title.",',
  '  phases: [{ title: "Review" }],',
  "};",
  'const summary = await agent("Summarize the PR", { label: "Summarize" });',
  "return { summary };",
].join("\n");

const INVALID_WORKFLOW = 'export const meta = { description: "no name field" };';

const client = McpSchema.McpServerClient.of({
  clientId: 1,
  initializePayload: {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "recipe-mcp-live-test", version: "1.0.0" },
  },
  getClient: Effect.die("unused"),
});

// A real McpSessionRegistry backed by a fake HttpServer/ServerEnvironment (same shape the unit
// test uses), so we mint + resolve a provider bearer through the exact production code path.
const fakeHttpServer = HttpServer.HttpServer.of({
  address: { _tag: "TcpAddress", hostname: "127.0.0.1", port: 43199 },
  serve: (() => Effect.void) as HttpServer.HttpServer["Service"]["serve"],
});
const fakeEnvironment = ServerEnvironment.ServerEnvironment.of({
  getEnvironmentId: Effect.succeed(environmentId),
  getDescriptor: Effect.die("unused"),
});
const makeRegistry = McpSessionRegistry.__testing
  .make({})
  .pipe(
    Effect.provideService(HttpServer.HttpServer, fakeHttpServer),
    Effect.provideService(ServerEnvironment.ServerEnvironment, fakeEnvironment),
    Effect.provide(NodeServices.layer),
  );

// Broker binding whose callTool runs the REAL recipe dispatch (not a canned result). Inline
// `source` validation short-circuits before any filesystem/thread lookup, so no fs is required.
const recipeTools = makeRecipeToolHandlers({
  loadThreadProject: () => Effect.succeed({ project: { workspaceRoot: "/nonexistent-workspace" } }),
})(threadId);

const realBinding: T3TeamToolBinding = {
  threadId,
  listServers: () => [],
  readResource: ({ uri }) => Effect.succeed({ contents: [{ uri, text: "{}" }] }),
  callTool: ({ tool, arguments: args }): Effect.Effect<T3TeamToolCallResult, never> =>
    isT3TeamRecipeTool(tool)
      ? callT3TeamRecipeTool({
          tool: tool as T3TeamRecipeToolId,
          scopeLabel: "over /mcp",
          toolArgs: args,
          recipeTools,
        })
      : Effect.succeed({ content: [{ type: "text", text: "unsupported" }], isError: true }),
};

const broker = T3TeamToolBroker.of({
  sendMessage: () => Effect.succeed(undefined),
  bindSession: ({ threadId: boundThreadId }) =>
    Effect.succeed(boundThreadId === threadId ? realBinding : undefined),
  bindReadOnly: () => Effect.void.pipe(Effect.as(undefined)),
});

const TestLayer = T3TeamToolkitRegistrationLive.pipe(
  Layer.provideMerge(McpServer.McpServer.layer),
  Layer.provideMerge(Layer.succeed(T3TeamToolBroker, broker)),
);

it.effect(
  "mints a provider bearer and resolves it to an invocation scope (the /mcp auth path)",
  () =>
    Effect.gen(function* () {
      const registry = yield* makeRegistry;
      const issued = yield* registry.issue({ threadId, providerInstanceId });
      expect(issued.config.endpoint).toBe("http://127.0.0.1:43199/mcp");
      const token = issued.config.authorizationHeader.replace(/^Bearer\s+/, "");
      expect(token.length).toBeGreaterThan(0);

      // This is exactly what McpHttpServer's auth middleware does: registry.resolve(bearer).
      const scope = yield* registry.resolve(token);
      expect(scope?.threadId).toBe(threadId);
      expect(scope?.providerInstanceId).toBe(providerInstanceId);

      const rejected = yield* registry.resolve("not-a-real-token");
      expect(rejected).toBeUndefined();
    }),
);

it.effect("registers t3team_recipe_list and t3team_recipe_validate in the live toolkit", () =>
  Effect.gen(function* () {
    const server = yield* McpServer.McpServer;
    const names = server.tools.map(({ tool }) => tool.name);
    expect(names).toContain("t3team_recipe_list");
    expect(names).toContain("t3team_recipe_validate");
  }).pipe(Effect.provide(TestLayer)),
);

it.effect(
  "validates well-formed inline source over the live tool chain (ok:true + meta + shape)",
  () =>
    Effect.gen(function* () {
      const server = yield* McpServer.McpServer;
      const result = yield* server
        .callTool({ name: "t3team_recipe_validate", arguments: { source: VALID_WORKFLOW } })
        .pipe(
          Effect.provideService(McpInvocationContext.McpInvocationContext, {
            environmentId,
            threadId,
            providerSessionId: "provider-session-recipe-mcp-live",
            providerInstanceId,
            capabilities: new Set<McpInvocationContext.McpCapability>(),
            issuedAt: 1,
            expiresAt: Number.MAX_SAFE_INTEGER,
          }),
          Effect.provideService(McpSchema.McpServerClient, client),
        );

      const structured = result.structuredContent as {
        readonly ok: boolean;
        readonly workflowPath?: string;
        readonly meta?: { readonly name: string };
        readonly shape?: { readonly name: string };
      };
      expect(result.isError ?? false).toBe(false);
      expect(structured.ok).toBe(true);
      expect(structured.workflowPath).toBe("<inline>");
      expect(structured.meta?.name).toBe("agent-live.valid");
      expect(structured.shape?.name).toBe("agent-live.valid");
    }).pipe(Effect.provide(TestLayer)),
);

it.effect(
  "reports a structured meta error for malformed inline source over the live tool chain",
  () =>
    Effect.gen(function* () {
      const server = yield* McpServer.McpServer;
      const result = yield* server
        .callTool({ name: "t3team_recipe_validate", arguments: { source: INVALID_WORKFLOW } })
        .pipe(
          Effect.provideService(McpInvocationContext.McpInvocationContext, {
            environmentId,
            threadId,
            providerSessionId: "provider-session-recipe-mcp-live",
            providerInstanceId,
            capabilities: new Set<McpInvocationContext.McpCapability>(),
            issuedAt: 1,
            expiresAt: Number.MAX_SAFE_INTEGER,
          }),
          Effect.provideService(McpSchema.McpServerClient, client),
        );

      const structured = result.structuredContent as {
        readonly ok: boolean;
        readonly errors: ReadonlyArray<{ readonly phase: string; readonly message: string }>;
      };
      expect(structured.ok).toBe(false);
      expect(structured.errors.some((error) => error.phase === "meta")).toBe(true);
    }).pipe(Effect.provide(TestLayer)),
);
