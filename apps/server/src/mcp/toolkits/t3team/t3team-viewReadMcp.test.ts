import { NodeHttpServer } from "@effect/platform-node";
import { afterEach, expect, it } from "@effect/vitest";
import { EnvironmentId, ProviderInstanceId, type T3TeamViewContext } from "@t3tools/contracts";
import { replaceFeatureFlagPresetValues } from "@t3tools/project-context/t3teamFeatureFlags";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { McpServer } from "effect/ai";
import { HttpBody, HttpClient, HttpRouter } from "effect/http";

import * as ThreadManagementService from "../../../orchestration-v2/ThreadManagementService.ts";
import { layerMemory as SqlitePersistenceMemory } from "../../../persistence/Sqlite.ts";
import {
  T3TeamThreadToolContextStore,
  T3TeamThreadToolContextStoreLive,
} from "../../../t3team-threadToolContextStore.ts";
import { makeBrokerLayer, threadId } from "../../../t3team-toolBrokerTestUtils.ts";
import { T3_MCP_PROTOCOL, T3TeamToolkitRegistrationLive } from "../../McpHttpServer.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import { T3TeamAskUserWriter } from "./t3team-askUserWriter.ts";

/**
 * `t3_view_read` through the real `/mcp` HTTP path and the real broker: listed and answered while
 * `AGENTS_VIEW_CONTEXT` is on, absent from `tools/list` and refused on a call while it is off.
 */
const viewContext: T3TeamViewContext = {
  version: 1,
  surface: "my-work",
  projectId: "project-1",
  selection: null,
  filters: { query: "login" },
  visibleItemIds: ["ACME-1"],
  visibleItemCount: 1,
};

const MCP_HEADERS = { accept: "application/json, text/event-stream" };
const jsonRpc = (id: number, method: string, params: unknown) =>
  HttpBody.text(JSON.stringify({ jsonrpc: "2.0", id, method, params }), "application/json");
const resultOf = (text: string): any => {
  const payload = text.trimStart().startsWith("{")
    ? text
    : (text.split("\n").find((line) => line.startsWith("data:")) ?? "data:{}").slice(5);
  return JSON.parse(payload).result;
};

const invocation: McpInvocationContext.McpInvocationScope = {
  environmentId: EnvironmentId.make("environment-view-read"),
  requestNamespace: "provider-session-view-read",
  thread: {
    threadId,
    providerSessionId: "provider-session-view-read",
    providerInstanceId: ProviderInstanceId.make("pack-test"),
  },
  client: undefined,
  capabilities: new Set(["orchestration"]),
  issuedAt: 1,
};

const session = (publish: boolean) =>
  Effect.scoped(
    Effect.gen(function* () {
      const AuthLive = HttpRouter.middleware<{
        provides: McpInvocationContext.McpInvocationContext;
      }>()(
        Effect.succeed((httpEffect) =>
          httpEffect.pipe(
            Effect.provideService(McpInvocationContext.McpInvocationContext, invocation),
          ),
        ),
      ).layer;
      const transport = McpServer.layerHttp({
        name: "view read test",
        version: "1.0.0",
        path: "/mcp",
        protocols: [T3_MCP_PROTOCOL],
      }).pipe(Layer.provide(AuthLive));
      const broker = makeBrokerLayer().pipe(Layer.provide(SqlitePersistenceMemory));
      const server = T3TeamToolkitRegistrationLive.pipe(
        Layer.provide(
          Layer.mergeAll(
            Layer.mock(ThreadManagementService.ThreadManagementService)({}),
            Layer.mock(T3TeamAskUserWriter)({}),
          ),
        ),
        Layer.provideMerge(transport),
        Layer.provideMerge(broker),
      );
      // One build: the broker's store and this one are the same layer reference, so they are one store.
      const context = yield* Layer.build(
        Layer.mergeAll(
          HttpRouter.serve(server, { disableListenLog: true, disableLogger: true }),
          T3TeamThreadToolContextStoreLive,
        ),
      );
      if (publish) {
        yield* Context.get(context, T3TeamThreadToolContextStore).putViewContext({
          threadId,
          viewContext,
          sequence: 1,
          nowMs: 1,
        });
      }
      const http = yield* HttpClient.HttpClient;
      const init = yield* http.post("/mcp", {
        headers: MCP_HEADERS,
        body: jsonRpc(1, "initialize", {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "view-read-test", version: "1.0.0" },
        }),
      });
      const headers = {
        ...MCP_HEADERS,
        "mcp-session-id": init.headers["mcp-session-id"]!,
        "mcp-protocol-version": "2025-06-18",
      };
      const post = (id: number, method: string, params: unknown) =>
        http.post("/mcp", { headers, body: jsonRpc(id, method, params) }).pipe(
          Effect.flatMap((response) => response.text),
          Effect.map(resultOf),
        );
      const listed = yield* post(2, "tools/list", {});
      const called = yield* post(3, "tools/call", { name: "t3_view_read", arguments: {} });
      return {
        names: listed.tools.map((tool: { readonly name: string }) => tool.name) as string[],
        called,
      };
    }),
  ).pipe(Effect.provide(NodeHttpServer.layerTest));

afterEach(() => replaceFeatureFlagPresetValues(new Map()));

it.effect("flag on: t3_view_read is listed and returns the published view", () =>
  Effect.gen(function* () {
    replaceFeatureFlagPresetValues(new Map([["AGENTS_VIEW_CONTEXT", true]]));
    const { names, called } = yield* session(true);
    expect(names).toContain("t3_view_read");
    expect(JSON.stringify(called)).toContain("ACME-1");
    expect(called.isError).not.toBe(true);
    expect(called.structuredContent.viewContext).toMatchObject({
      published: true,
      surface: "my-work",
      visibleItemIds: ["ACME-1"],
    });
  }),
);

it.effect("flag on, nothing published: the answer says so", () =>
  Effect.gen(function* () {
    replaceFeatureFlagPresetValues(new Map([["AGENTS_VIEW_CONTEXT", true]]));
    const { called } = yield* session(false);
    expect(called.structuredContent.viewContext.published).toBe(false);
  }),
);

it.effect("flag off: t3_view_read is not listed and a call is refused", () =>
  Effect.gen(function* () {
    const { names, called } = yield* session(true);
    expect(names).not.toContain("t3_view_read");
    expect(names).toContain("t3_show_widget");
    expect(called.isError).toBe(true);
    expect(JSON.stringify(called)).toContain("turned off");
    expect(JSON.stringify(called)).not.toContain("ACME-1");
  }),
);
