import { expect, it } from "@effect/vitest";
import { EnvironmentId, ProviderInstanceId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";
import { McpSchema, McpServer } from "effect/unstable/ai";

import type { OrchestrationEngineShape } from "./orchestration/Services/OrchestrationEngine.ts";
import * as McpInvocationContext from "./mcp/McpInvocationContext.ts";
import { T3workMcpToolkitRegistrationLive } from "./t3work-mcpToolkit.ts";
import { T3workToolBroker } from "./t3work-toolBroker.ts";
import { TOOL_SPECS } from "./t3work-toolBrokerHelpers.ts";
import {
  clearAllT3workToolBindings,
  setT3workToolBinding,
} from "./t3work-toolBrokerSessionRegistry.ts";
import {
  createDefaultThreadToolContext,
  makeBrokerLayerWithLiveContextRefresh,
  threadId,
} from "./t3work-toolBrokerTestUtils.ts";
import {
  makeContextRefreshTestWorkspace,
  registerContextRefreshTestCleanup,
} from "./t3work-contextRefreshTestFixtures.ts";

registerContextRefreshTestCleanup();

const environmentId = EnvironmentId.make("environment-mcp-t3work-test");
const invocation: McpInvocationContext.McpInvocationScope = {
  environmentId,
  threadId,
  providerSessionId: "provider-session-t3work-test",
  providerInstanceId: ProviderInstanceId.make("codex"),
  capabilities: new Set(["t3work"] as const),
  issuedAt: 1,
  expiresAt: Number.MAX_SAFE_INTEGER,
};
const client = McpSchema.McpServerClient.of({
  clientId: 1,
  initializePayload: {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "mcp-t3work-test", version: "1.0.0" },
  },
  getClient: Effect.die("unused"),
});

const orchestrationMock: OrchestrationEngineShape = {
  readEvents: () => Stream.empty,
  dispatch: () => Effect.succeed({ sequence: 1 }),
  streamDomainEvents: Stream.empty,
};

const makeTestLayer = (prefix: string) =>
  T3workMcpToolkitRegistrationLive.pipe(
    Layer.provideMerge(McpServer.McpServer.layer),
    Layer.provideMerge(
      makeBrokerLayerWithLiveContextRefresh(orchestrationMock, {
        contextRefreshLayerPrefix: prefix,
      }),
    ),
  );

it.effect("registers the full implemented t3work catalog on the MCP server", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const server = yield* McpServer.McpServer;
      const registeredNames = server.tools.map(({ tool }) => tool.name);
      for (const toolId of Object.keys(TOOL_SPECS)) {
        expect(registeredNames).toContain(toolId);
      }
    }),
  ).pipe(Effect.provide(makeTestLayer("t3work-mcp-toolkit-list-"))),
);

it.effect("routes default bound tools through MCP callTool", () =>
  Effect.scoped(
    Effect.gen(function* () {
      clearAllT3workToolBindings();
      const { root, project } = makeContextRefreshTestWorkspace();
      const broker = yield* T3workToolBroker;
      const binding = yield* broker.bindSession({
        threadId,
        toolContext: createDefaultThreadToolContext({
          allowedToolGroups: ["artifact.rw"],
          view: {
            projectId: project.id,
            workspaceRoot: root,
            ticketId: "AC-91",
          },
        }),
      });
      setT3workToolBinding(binding!);

      const server = yield* McpServer.McpServer;
      const boundTools = binding!.listServers().find((entry) => entry.name === "t3work")?.tools;
      expect(Object.keys(boundTools ?? {})).toEqual(["t3work.work_item.refresh_context_bundle"]);

      const blockedViewRead = yield* server
        .callTool({ name: "t3work.view.read", arguments: {} })
        .pipe(
          Effect.provideService(McpInvocationContext.McpInvocationContext, invocation),
          Effect.provideService(McpSchema.McpServerClient, client),
        );
      expect(blockedViewRead.isError).toBe(true);
      expect(blockedViewRead.content.find((entry) => entry.type === "text")?.text).toContain(
        "not enabled for this thread",
      );

      const refresh = yield* server
        .callTool({
          name: "t3work.work_item.refresh_context_bundle",
          arguments: { ticket_key: "AC-91" },
        })
        .pipe(
          Effect.provideService(McpInvocationContext.McpInvocationContext, invocation),
          Effect.provideService(McpSchema.McpServerClient, client),
        );
      expect(refresh.isError).toBeUndefined();
      expect(refresh.structuredContent).toMatchObject({
        ok: true,
        status: "synced",
        ticketKey: "AC-91",
      });

      for (const toolId of Object.keys(TOOL_SPECS)) {
        expect(server.tools.some(({ tool }) => tool.name === toolId)).toBe(true);
      }
    }),
  ).pipe(Effect.provide(makeTestLayer("t3work-mcp-toolkit-call-"))),
);

it.effect("rejects t3work MCP calls when the credential lacks the t3work capability", () =>
  Effect.scoped(
    Effect.gen(function* () {
      clearAllT3workToolBindings();
      const broker = yield* T3workToolBroker;
      const binding = yield* broker.bindSession({
        threadId,
        toolContext: createDefaultThreadToolContext(),
      });
      setT3workToolBinding(binding!);

      const server = yield* McpServer.McpServer;
      const result = yield* server.callTool({ name: "t3work.view.read", arguments: {} }).pipe(
        Effect.provideService(McpInvocationContext.McpInvocationContext, {
          ...invocation,
          capabilities: new Set(["preview"] as const),
        }),
        Effect.provideService(McpSchema.McpServerClient, client),
      );
      expect(result.isError).toBe(true);
      expect(result.content.find((entry) => entry.type === "text")?.text).toContain(
        "t3work capability",
      );
    }),
  ).pipe(Effect.provide(makeTestLayer("t3work-mcp-toolkit-capability-"))),
);
