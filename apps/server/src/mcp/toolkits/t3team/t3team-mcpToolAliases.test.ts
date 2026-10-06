import { NodeHttpServer } from "@effect/platform-node";
import { expect, it } from "@effect/vitest";
import { EnvironmentId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { McpServer } from "effect/ai";
import { HttpBody, HttpClient, HttpRouter } from "effect/http";

import { T3TeamToolBroker, type T3TeamToolBinding } from "../../../t3team-toolBroker.ts";
import { T3_MCP_PROTOCOL, T3TeamToolkitRegistrationLive } from "../../McpHttpServer.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import { T3TEAM_DEPRECATED_MCP_TOOL_ALIASES } from "./t3team-mcpToolAliases.ts";
import { resolveToolNameAlias, withToolNameAliases } from "./t3team-mcpToolAliasProtocol.ts";
import { T3TEAM_MCP_CANONICAL_TOOL_MAP } from "./tools.ts";

const aliases = Object.entries(T3TEAM_DEPRECATED_MCP_TOOL_ALIASES);

it("maps each deprecated name to a current name, with the canonical tools keyed by current names", () => {
  expect(aliases).toHaveLength(14);
  for (const [oldName, newName] of aliases) {
    expect(oldName.startsWith("t3team_")).toBe(true);
    expect(newName.startsWith("t3_")).toBe(true);
    expect(Object.keys(T3TEAM_MCP_CANONICAL_TOOL_MAP)).not.toContain(oldName);
    if (newName !== "t3_ask_user") {
      expect(Object.keys(T3TEAM_MCP_CANONICAL_TOOL_MAP)).toContain(newName);
    }
  }
  expect(T3TEAM_MCP_CANONICAL_TOOL_MAP.t3_task_ops).toBe("t3team.thread.children");
});

it("resolveToolNameAlias only rewrites own alias keys", () => {
  expect(resolveToolNameAlias(T3TEAM_DEPRECATED_MCP_TOOL_ALIASES, "t3team_children")).toBe(
    "t3_task_ops",
  );
  expect(resolveToolNameAlias(T3TEAM_DEPRECATED_MCP_TOOL_ALIASES, "t3_task_ops")).toBe(
    "t3_task_ops",
  );
  expect(resolveToolNameAlias(T3TEAM_DEPRECATED_MCP_TOOL_ALIASES, "constructor")).toBe(
    "constructor",
  );
});

it.effect("the wrapper rewrites only tools/call names and leaves tools/list untouched", () =>
  Effect.gen(function* () {
    const seen: Array<string> = [];
    const listed: Array<string> = [];
    const core = {
      tools: {
        list: () => Effect.sync(() => (listed.push("list"), [])),
        call: (call: { readonly name: string }) => Effect.sync(() => (seen.push(call.name), call)),
      },
    };
    let installed: typeof core | undefined;
    const adapter = {
      installHandlers: (c: typeof core) => Effect.sync(() => void (installed = c)),
    } as never;
    yield* (
      withToolNameAliases(adapter, { old_name: "new_name" }).installHandlers as (
        ...args: ReadonlyArray<unknown>
      ) => Effect.Effect<void>
    )(core, undefined, undefined);
    yield* installed!.tools.call({ name: "old_name" });
    yield* installed!.tools.call({ name: "new_name" });
    yield* installed!.tools.call({ name: "unrelated" });
    yield* installed!.tools.list();
    expect(seen).toEqual(["new_name", "new_name", "unrelated"]);
    expect(listed).toEqual(["list"]);
  }),
);

const threadId = ThreadId.make("thread-t3team-alias-test");
const invocation: McpInvocationContext.McpInvocationScope = {
  environmentId: EnvironmentId.make("environment-t3team-alias-test"),
  requestNamespace: "provider-session-t3team-alias-test",
  thread: {
    threadId,
    providerSessionId: "provider-session-t3team-alias-test",
    providerInstanceId: ProviderInstanceId.make("pack-test"),
  },
  client: undefined,
  capabilities: new Set(["orchestration"]),
  issuedAt: 1,
};

// A minimal valid argument set per renamed tool (keyed by the NEW name).
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

const MCP_HEADERS = { accept: "application/json, text/event-stream" };
const jsonRpc = (id: number, method: string, params: unknown) =>
  HttpBody.text(JSON.stringify({ jsonrpc: "2.0", id, method, params }), "application/json");
/** The JSON-RPC result of a response that is plain JSON or a single SSE `data:` event. */
const resultOf = (text: string): any => {
  const payload = text.trimStart().startsWith("{")
    ? text
    : (text.split("\n").find((line) => line.startsWith("data:")) ?? "data:{}").slice(5);
  return JSON.parse(payload).result;
};

it.effect(
  "advertises only the new names over HTTP, yet each old name still dispatches to the same handler",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const calls: Array<{ readonly tool: string; readonly args: unknown }> = [];
        const binding: T3TeamToolBinding = {
          threadId,
          listServers: () => [],
          readResource: ({ uri }) => Effect.succeed({ contents: [{ uri, text: "{}" }] }),
          callTool: ({ tool, arguments: args }) => {
            calls.push({ tool, args });
            return Effect.succeed({
              content: [{ type: "text" as const, text: "ok" }],
              structuredContent: { ok: true, tool },
            });
          },
        };
        const broker = T3TeamToolBroker.of({
          bindSession: ({ threadId: bound }) =>
            Effect.succeed(bound === threadId ? binding : undefined),
          bindReadOnly: () => Effect.void.pipe(Effect.as(undefined)),
        });
        // The real transport authenticates a bearer token; here the credential is fixed.
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
          name: "alias test",
          version: "1.0.0",
          path: "/mcp",
          protocols: [T3_MCP_PROTOCOL],
        }).pipe(Layer.provide(AuthLive));
        const serverLayer = T3TeamToolkitRegistrationLive.pipe(
          Layer.provideMerge(transport),
          Layer.provideMerge(Layer.succeed(T3TeamToolBroker, broker)),
        );
        yield* HttpRouter.serve(serverLayer, { disableListenLog: true, disableLogger: true }).pipe(
          Layer.build,
        );
        const http = yield* HttpClient.HttpClient;

        const init = yield* http.post("/mcp", {
          headers: MCP_HEADERS,
          body: jsonRpc(1, "initialize", {
            protocolVersion: "2025-06-18",
            capabilities: {},
            clientInfo: { name: "alias-test", version: "1.0.0" },
          }),
        });
        const session = {
          ...MCP_HEADERS,
          "mcp-session-id": init.headers["mcp-session-id"]!,
          "mcp-protocol-version": "2025-06-18",
        };
        const rpc = (id: number, method: string, params: unknown) =>
          http.post("/mcp", { headers: session, body: jsonRpc(id, method, params) }).pipe(
            Effect.flatMap((response) => response.text),
            Effect.map(resultOf),
          );

        // (a) advertised list: new names only.
        const listed = (yield* rpc(2, "tools/list", {})).tools.map(
          (tool: { readonly name: string }) => tool.name,
        ) as ReadonlyArray<string>;
        for (const [oldName, newName] of aliases) {
          expect(listed, oldName).not.toContain(oldName);
          expect(listed, newName).toContain(newName);
        }
        expect(listed.filter((name) => name.startsWith("t3team_"))).toEqual([
          "t3team_thread_skill_metadata",
        ]);

        // (b) every old name reaches the same handler and returns the identical result.
        let id = 10;
        for (const [oldName, newName] of aliases) {
          if (newName === "t3_ask_user") continue; // records on the thread, not via the broker
          const args = sampleArguments[newName];
          calls.length = 0;
          const viaNew = yield* rpc(id++, "tools/call", { name: newName, arguments: args });
          const viaOld = yield* rpc(id++, "tools/call", { name: oldName, arguments: args });
          expect(viaOld.isError, oldName).not.toBe(true);
          expect(viaOld.structuredContent, oldName).toEqual(viaNew.structuredContent);
          expect(calls, oldName).toHaveLength(2);
          expect(calls[1], oldName).toEqual(calls[0]);
          expect(calls[0]?.tool).toBe(
            T3TEAM_MCP_CANONICAL_TOOL_MAP[newName as keyof typeof T3TEAM_MCP_CANONICAL_TOOL_MAP],
          );
        }

        // t3team_ask_user resolves to the same handler: its error (no active turn here) matches.
        const askNew = yield* rpc(id++, "tools/call", {
          name: "t3_ask_user",
          arguments: { question: "?" },
        });
        const askOld = yield* rpc(id++, "tools/call", {
          name: "t3team_ask_user",
          arguments: { question: "?" },
        });
        expect(askOld).toEqual(askNew);
      }),
    ).pipe(Effect.provide(NodeHttpServer.layerTest)),
);
