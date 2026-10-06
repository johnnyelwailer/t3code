/**
 * The hidden author's MCP credential under V2: resolved with NO capabilities (so every upstream
 * toolkit — delegate_task, create_threads, t3_project_*, t3_pending_request_respond, worktree,
 * preview, devices — refuses it), and admitted by the t3team toolkit only for its own tools.
 */
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import { EnvironmentId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import { McpSchema, McpServer } from "effect/unstable/ai";
import { HttpServer } from "effect/unstable/http";
import * as NetAddress from "effect/unstable/net/NetAddress";

import * as ServerEnvironment from "./environment/ServerEnvironment.ts";
import { T3TeamToolkitRegistrationLive } from "./mcp/McpHttpServer.ts";
import * as McpInvocationContext from "./mcp/McpInvocationContext.ts";
import * as McpSessionRegistry from "./mcp/McpSessionRegistry.ts";
import { readCaller } from "./mcp/threadAccess.ts";
import { ThreadManagementService } from "./orchestration-v2/ThreadManagementService.ts";
import { T3TEAM_DEPRECATED_MCP_TOOL_ALIASES } from "./mcp/toolkits/t3team/t3team-mcpToolAliases.ts";
import { T3TEAM_MCP_CANONICAL_TOOL_MAP } from "./mcp/toolkits/t3team/tools.ts";
import { T3TeamToolBroker, type T3TeamToolBinding } from "./t3team-toolBroker.ts";
import { WORKFLOW_AUTHOR_MCP_TOOL_NAMES } from "./t3team-workflowAuthorApproval.ts";
import {
  mayCallT3TeamBrokerTool,
  workflowAuthorMcpScope,
} from "./t3team-workflowAuthorMcpScope.ts";
import { WORKFLOW_AUTHOR_TOOL_IDS } from "./t3team-workflowAuthorTurn.ts";

const AUTHOR = ThreadId.make("run-mcp:author");
const scopeFor = (threadId: ThreadId): McpInvocationContext.McpInvocationScope => ({
  environmentId: EnvironmentId.make("environment-author"),
  threadId,
  providerSessionId: "provider-session-author",
  providerInstanceId: ProviderInstanceId.make("codex"),
  capabilities: new Set(["orchestration", "preview", "worktree", "device", "pull-requests"]),
  issuedAt: 1,
});

const registry = McpSessionRegistry.__testing
  .make({ now: () => 1_000, livenessWindowMs: 100 })
  .pipe(
    Effect.provideService(
      HttpServer.HttpServer,
      HttpServer.HttpServer.of({
        address: NetAddress.inetAddressFromIpStringUnsafe("127.0.0.1", 43124),
        serve: (() => Effect.void) as HttpServer.HttpServer["Service"]["serve"],
      }),
    ),
    Effect.provideService(
      ServerEnvironment.ServerEnvironment,
      ServerEnvironment.ServerEnvironment.of({
        getEnvironmentId: Effect.succeed(EnvironmentId.make("environment-author")),
        getDescriptor: Effect.die("unused"),
      }),
    ),
    Effect.provide(NodeServices.layer),
  );

it("pins the approval gate's author MCP names to the toolkit map and the author tool ids", () => {
  for (const [mcpName, brokerId] of Object.entries(WORKFLOW_AUTHOR_MCP_TOOL_NAMES)) {
    const current =
      (T3TEAM_DEPRECATED_MCP_TOOL_ALIASES as Record<string, string>)[mcpName] ?? mcpName;
    expect((T3TEAM_MCP_CANONICAL_TOOL_MAP as Record<string, string>)[current]).toBe(brokerId);
  }
  expect([...new Set(Object.values(WORKFLOW_AUTHOR_MCP_TOOL_NAMES))].toSorted()).toEqual(
    [...WORKFLOW_AUTHOR_TOOL_IDS].toSorted(),
  );
});

it.effect("resolves an author thread's credential with no capabilities", () =>
  Effect.gen(function* () {
    const sessions = yield* registry;
    const issue = (threadId: ThreadId) =>
      sessions
        .issue({
          threadId,
          providerInstanceId: ProviderInstanceId.make("codex"),
          capabilities: new Set(["preview"]),
        })
        .pipe(Effect.map((issued) => issued.config.authorizationHeader.replace(/^Bearer\s+/, "")));
    const author = yield* sessions.resolve(yield* issue(AUTHOR));
    expect(author?.threadId).toBe(AUTHOR);
    expect(author?.capabilities.size).toBe(0);
    const ordinary = yield* sessions.resolve(yield* issue(ThreadId.make("thread-ordinary")));
    expect(ordinary?.capabilities.has("orchestration")).toBe(true);
  }),
);

it.effect("upstream thread tools refuse the author's resolved scope", () =>
  Effect.gen(function* () {
    // Refused on the capability alone, before any thread lookup is attempted.
    const exit = yield* readCaller().pipe(
      Effect.provideService(
        McpInvocationContext.McpInvocationContext,
        workflowAuthorMcpScope(scopeFor(AUTHOR)),
      ),
      Effect.provideService(ThreadManagementService, {} as never),
      Effect.exit,
    );
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) expect(Cause.pretty(exit.cause)).toContain("cannot control threads");
  }),
);

it("admits the author only for its own broker tools", () => {
  const author = workflowAuthorMcpScope(scopeFor(AUTHOR));
  expect(mayCallT3TeamBrokerTool(author, "t3team.orchestration.run")).toBe(true);
  expect(mayCallT3TeamBrokerTool(author, "t3team.recipe.validate")).toBe(true);
  for (const denied of [
    "t3team.thread.children",
    "t3team.orchestration.resume",
    "t3team.widget.show",
    "t3team.thread.search",
  ]) {
    expect(mayCallT3TeamBrokerTool(author, denied)).toBe(false);
  }
  const ordinary = scopeFor(ThreadId.make("thread-ordinary"));
  expect(mayCallT3TeamBrokerTool(ordinary, "t3team.thread.children")).toBe(true);
  expect(
    mayCallT3TeamBrokerTool({ ...ordinary, capabilities: new Set() }, "t3team.orchestration.run"),
  ).toBe(false);
});

it.effect(
  "the t3team MCP toolkit routes the author's submission and refuses everything else",
  () => {
    const routed: string[] = [];
    const binding: T3TeamToolBinding = {
      threadId: AUTHOR,
      listServers: () => [],
      readResource: ({ uri }) => Effect.succeed({ contents: [{ uri, text: "{}" }] }),
      callTool: ({ tool }) => {
        routed.push(tool);
        return Effect.succeed({ content: [{ type: "text" as const, text: "ok" }] });
      },
    };
    const TestLayer = T3TeamToolkitRegistrationLive.pipe(
      Layer.provideMerge(McpServer.McpServer.layer),
      Layer.provideMerge(
        Layer.succeed(
          T3TeamToolBroker,
          T3TeamToolBroker.of({
            bindSession: () => Effect.succeed(binding),
            bindReadOnly: () => Effect.void.pipe(Effect.as(undefined)),
          }),
        ),
      ),
    );
    return Effect.gen(function* () {
      const server = yield* McpServer.McpServer;
      const submitted = yield* server.callTool({
        name: "t3_orchestration_run",
        arguments: {
          source: "export const meta = {}",
          intent: { goal: "g", expectedOutcome: "o", guardrails: ["x"] },
        },
      });
      expect(submitted.isError).not.toBe(true);
      const refusals = [
        { name: "t3_task_ops", arguments: { op: "environments" } },
        { name: "t3_orchestration_stop", arguments: { runId: "run-other" } },
        { name: "t3_ask_user", arguments: { question: "Approve?" } },
        { name: "t3team_thread_skill_metadata", arguments: {} },
      ];
      for (const refusal of refusals) {
        const refused = yield* server.callTool(refusal);
        expect(refused.isError).toBe(true);
        expect(refused.content).toEqual([
          expect.objectContaining({
            text: expect.stringContaining("does not grant orchestration capabilities"),
          }),
        ]);
      }
      expect(routed).toEqual(["t3team.orchestration.run"]);
    }).pipe(
      Effect.provideService(
        McpInvocationContext.McpInvocationContext,
        workflowAuthorMcpScope(scopeFor(AUTHOR)),
      ),
      Effect.provideService(
        McpSchema.McpServerClient,
        McpSchema.McpServerClient.of({
          clientId: 1,
          clientCapabilities: {},
          clientInfo: { name: "author-test", version: "1.0.0" },
          protocolVersion: "2025-06-18",
          initializePayload: {
            protocolVersion: "2025-03-26",
            capabilities: {},
            clientInfo: { name: "author-test", version: "1.0.0" },
          },
          getClient: Effect.die("unused"),
        }),
      ),
      Effect.provide(TestLayer),
    );
  },
);
