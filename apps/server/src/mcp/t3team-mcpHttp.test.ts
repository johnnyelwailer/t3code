/**
 * Integration coverage for the /mcp streamable-HTTP transport: a REAL listening node HTTP
 * server carrying the production bearer-auth middleware + legacy-name normalization
 * (t3team-legacyToolNames.ts) + the t3team toolkit, driven over raw fetch JSON-RPC — exactly
 * what a provider agent experiences:
 * - bearer auth: no/wrong token → 401; a real McpSessionRegistry-minted token opens the session
 * - canonical-only catalog: tools/list names contain no t3team_* or t3team_workflow_* spellings
 * - canonical + legacy routing: both spellings reach the SAME broker tool
 * - unknown names fail without reaching the broker; schema validation applies to both spellings
 */
import { expect, it } from "@effect/vitest";
import { EnvironmentId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import * as NodeHttpServer from "@effect/platform-node/NodeHttpServer";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { HttpRouter, HttpServer } from "effect/unstable/http";
import * as NodeHttp from "node:http";

import * as McpHttpServer from "./McpHttpServer.ts";
import * as McpSessionRegistry from "./McpSessionRegistry.ts";
import { T3TeamToolkitRegistrationLive } from "./McpHttpServer.ts";
import * as ServerEnvironment from "../environment/ServerEnvironment.ts";
import { T3TeamToolBroker, type T3TeamToolBinding, type T3TeamToolBrokerShape } from "../t3team-toolBroker.ts";

const threadId = ThreadId.make("thread-mcp-http-test");
const providerInstanceId = ProviderInstanceId.make("pack-mcp-http-test");
// After initialize the negotiated version must ride every request (the transport
// answers 400 when it is missing or disagrees with the session's version).
const PROTOCOL_VERSION = "2025-06-18";

type BrokerCall = { readonly tool: string; readonly arguments: unknown };

const makeBroker = (calls: Array<BrokerCall>) => {
  const callTool: T3TeamToolBinding["callTool"] = ({ tool, arguments: args }) => {
    calls.push({ tool, arguments: args });
    return Effect.succeed({
      content: [{ type: "text" as const, text: "ok" }],
      structuredContent: { ok: true },
    });
  };
  return T3TeamToolBroker.of({
    sendMessage: () => Effect.succeed(undefined),
    bindSession: ({ threadId: boundThreadId }) =>
      Effect.succeed(
        boundThreadId === threadId
          ? {
              threadId,
              listServers: () => [],
              readResource: ({ uri }) => Effect.succeed({ contents: [{ uri, text: "{}" }] }),
              callTool,
            }
          : undefined,
      ),
    bindReadOnly: () => Effect.void.pipe(Effect.as(undefined)),
  });
};

const environmentLayer = Layer.succeed(ServerEnvironment.ServerEnvironment, {
  getEnvironmentId: Effect.succeed(EnvironmentId.make("environment-mcp-http-test")),
  getDescriptor: Effect.die("not used in the MCP HTTP test"),
});

const serverLayer = NodeHttpServer.layer(
  () => NodeHttp.createServer(),
  { host: "127.0.0.1", port: 0, gracefulShutdownTimeout: "1 second" },
);

const buildLayer = (broker: T3TeamToolBrokerShape) =>
  HttpRouter.serve(
    Layer.mergeAll(T3TeamToolkitRegistrationLive, McpHttpServer.McpTransportLive).pipe(
      Layer.provideMerge(Layer.succeed(T3TeamToolBroker, broker)),
      Layer.provideMerge(McpSessionRegistry.layer),
      Layer.provideMerge(environmentLayer),
    ),
    { disableListenLog: true },
  ).pipe(Layer.provideMerge(serverLayer));

let nextRpcId = 0;

interface RpcResponse {
  readonly status: number;
  readonly sessionId: string | null;
  readonly body: unknown;
}

const postRpc = async (
  port: number,
  headers: Record<string, string>,
  method: string,
  params: unknown,
): Promise<RpcResponse> => {
  const res = await fetch(`http://127.0.0.1:${port}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...headers,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++nextRpcId, method, params }),
  });
  const text = await res.text();
  let body: unknown;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      const dataLine = text
        .split("\n")
        .find((line) => line.startsWith("data:")) ?? "";
      body = dataLine ? JSON.parse(dataLine.slice("data:".length).trim()) : text;
    }
  }
  return { status: res.status, sessionId: res.headers.get("mcp-session-id"), body };
};

type LiveServer = {
  readonly port: number;
  readonly registry: McpSessionRegistry.McpSessionRegistry["Service"];
};

/** Boots one real server around `fn` with a broker recorder writing into `calls`. */
const withLiveServer = (
  calls: Array<BrokerCall>,
  fn: (live: LiveServer) => Effect.Effect<unknown>,
) =>
  Effect.gen(function* () {
    const registry = yield* McpSessionRegistry.McpSessionRegistry;
    const httpServer = yield* HttpServer.HttpServer;
    const port = httpServer.address._tag === "TcpAddress" ? httpServer.address.port : 0;
    yield* fn({ port, registry });
  }).pipe(Effect.provide(buildLayer(makeBroker(calls))));

const openSession = (live: LiveServer, authHeader: string) =>
  Effect.gen(function* () {
    const initialized = yield* Effect.promise(() =>
      postRpc(live.port, { authorization: authHeader }, "initialize", {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: "t3team-mcp-http-test", version: "1.0.0" },
      }),
    );
    expect(initialized.status).toBe(200);
    expect(initialized.sessionId).toBeTypeOf("string");
    yield* Effect.promise(() =>
      postRpc(
        live.port,
        {
          authorization: authHeader,
          "mcp-protocol-version": PROTOCOL_VERSION,
          "mcp-session-id": initialized.sessionId!,
        },
        "notifications/initialized",
        {},
      ),
    );
    return { port: live.port, sessionId: initialized.sessionId!, auth: authHeader };
  });

// The bearer token rides EVERY request: /mcp is mounted outside the environment auth
// stack, so the token is the only credential on the wire — session id alone is 401.
const sessionHeaders = (session: { auth: string; sessionId: string }) => ({
  authorization: session.auth,
  "mcp-protocol-version": PROTOCOL_VERSION,
  "mcp-session-id": session.sessionId,
});

const callTool = (session: { auth: string; port: number; sessionId: string }, name: string, args: unknown) =>
  Effect.promise(() =>
    postRpc(
      session.port,
      sessionHeaders(session),
      "tools/call",
      { name, arguments: args },
    ),
  );

const isErrorResponse = (body: unknown): boolean => {
  if (typeof body !== "object" || body === null) return false;
  const b = body as Record<string, unknown>;
  return (
    "error" in b ||
    (typeof b.result === "object" &&
      b.result !== null &&
      (b.result as Record<string, unknown>).isError === true)
  );
};

const expectedCanonicalNames = new Set([
  "models",
  "provider_usage",
  "rename_thread",
  "search_thread",
  "search_source",
  "read_message",
  "start_child",
  "children",
  "send_message",
  "orchestration_run",
  "orchestration_status",
  "orchestration_resume",
  "orchestration_pause",
  "orchestration_stop",
  "show_widget",
  "help",
  "recipe_list",
  "recipe_validate",
]);

it.effect("rejects unauthenticated and unknown-credential requests with 401", () => {
  const calls: Array<BrokerCall> = [];
  return withLiveServer(calls, (live) =>
    Effect.gen(function* () {
      const missing = yield* Effect.promise(() =>
        postRpc(live.port, {}, "initialize", {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "t3team-mcp-http-test", version: "1.0.0" },
        }),
      );
      expect(missing.status).toBe(401);
      expect((missing.body as Record<string, unknown>).error).toBe("invalid_mcp_credential");

      const bogus = yield* Effect.promise(() =>
        postRpc(live.port, { authorization: "Bearer not-a-real-token" }, "initialize", {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "t3team-mcp-http-test", version: "1.0.0" },
        }),
      );
      expect(bogus.status).toBe(401);
      expect(calls).toEqual([]);
    }),
  );
});

it.effect("advertises only the canonical tool names in tools/list", () => {
  const calls: Array<BrokerCall> = [];
  return withLiveServer(calls, (live) =>
    Effect.gen(function* () {
      const credential = yield* live.registry.issue({ threadId, providerInstanceId });
      const session = yield* openSession(live, credential.config.authorizationHeader);
      const listed = yield* Effect.promise(() =>
        postRpc(
          session.port,
          sessionHeaders(session),
          "tools/list",
          {},
        ),
      );
      expect(listed.status).toBe(200);
      const tools = (listed.body as { result: { tools: Array<{ name: string }> } }).result.tools;
      expect(new Set(tools.map((tool) => tool.name))).toEqual(expectedCanonicalNames);
      expect(calls).toEqual([]);
    }),
  );
});

it.effect("routes canonical and legacy spellings to the same broker tool", () => {
  const calls: Array<BrokerCall> = [];
  return withLiveServer(calls, (live) =>
    Effect.gen(function* () {
      const credential = yield* live.registry.issue({ threadId, providerInstanceId });
      const session = yield* openSession(live, credential.config.authorizationHeader);

      const canonical = yield* callTool(session, "models", {});
      expect(canonical.status).toBe(200);
      expect(isErrorResponse(canonical.body)).toBe(false);

      const legacy = yield* callTool(session, "t3team_models", {});
      expect(legacy.status).toBe(200);
      expect(isErrorResponse(legacy.body)).toBe(false);

      const deprecatedRun = yield* callTool(session, "t3team_workflow_run", {
        source: "export const meta = { name: 'x' };",
        intent: { goal: "g", expectedOutcome: "o", guardrails: ["none"] },
      });
      expect(deprecatedRun.status).toBe(200);
      expect(isErrorResponse(deprecatedRun.body)).toBe(false);

      const deprecatedStatus = yield* callTool(session, "t3team_workflow_status", {});
      expect(deprecatedStatus.status).toBe(200);
      expect(isErrorResponse(deprecatedStatus.body)).toBe(false);

      // Every spelling reached the SAME canonical dotted broker tool.
      expect(calls.map(({ tool }) => tool)).toEqual([
        "t3team.runtime.models",
        "t3team.runtime.models",
        "t3team.orchestration.run",
        "t3team.orchestration.status",
      ]);
    }),
  );
});

it.effect("fails unknown tool names without reaching the broker", () => {
  const calls: Array<BrokerCall> = [];
  return withLiveServer(calls, (live) =>
    Effect.gen(function* () {
      const credential = yield* live.registry.issue({ threadId, providerInstanceId });
      const session = yield* openSession(live, credential.config.authorizationHeader);
      const unknown = yield* callTool(session, "definitely_not_a_tool", {});
      expect(unknown.status).toBe(200);
      expect(isErrorResponse(unknown.body)).toBe(true);
      expect(calls).toEqual([]);
    }),
  );
});

it.effect("validates arguments against the canonical schema for both spellings", () => {
  const calls: Array<BrokerCall> = [];
  return withLiveServer(calls, (live) =>
    Effect.gen(function* () {
      const credential = yield* live.registry.issue({ threadId, providerInstanceId });
      const session = yield* openSession(live, credential.config.authorizationHeader);

      const canonicalBad = yield* callTool(session, "rename_thread", {});
      expect(canonicalBad.status).toBe(200);
      expect(isErrorResponse(canonicalBad.body)).toBe(true);

      const legacyBad = yield* callTool(session, "t3team_rename_thread", {});
      expect(legacyBad.status).toBe(200);
      expect(isErrorResponse(legacyBad.body)).toBe(true);

      // Neither spelling reached the broker — schema rejection happened first.
      expect(calls).toEqual([]);
    }),
  );
});
