import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import { EnvironmentId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import { HttpServer } from "effect/unstable/http";

import * as ServerEnvironment from "./environment/ServerEnvironment.ts";
import * as McpSessionRegistry from "./mcp/McpSessionRegistry.ts";
import {
  clearAllT3workToolBindings,
  setT3workToolBinding,
} from "./t3work-toolBrokerSessionRegistry.ts";

const environmentId = EnvironmentId.make("environment-t3work-mcp-registry");
const fakeHttpServer = HttpServer.HttpServer.of({
  address: { _tag: "TcpAddress", hostname: "127.0.0.1", port: 43124 },
  serve: (() => Effect.void) as HttpServer.HttpServer["Service"]["serve"],
});
const fakeEnvironment = ServerEnvironment.ServerEnvironment.of({
  getEnvironmentId: Effect.succeed(environmentId),
  getDescriptor: Effect.die("unused"),
});

const makeRegistry = () =>
  McpSessionRegistry.__testing
    .make({ now: () => 1_000 })
    .pipe(
      Effect.provideService(HttpServer.HttpServer, fakeHttpServer),
      Effect.provideService(ServerEnvironment.ServerEnvironment, fakeEnvironment),
      Effect.provide(NodeServices.layer),
    );

it.effect("issues MCP credentials with the t3work capability when a broker binding exists", () =>
  Effect.gen(function* () {
    const registry = yield* makeRegistry();
    const threadId = ThreadId.make("thread-t3work-bound");
    clearAllT3workToolBindings();
    setT3workToolBinding({
      threadId,
      listServers: () => [
        {
          authStatus: "unsupported",
          name: "t3work",
          resourceTemplates: [],
          resources: [],
          tools: {
            "t3work.view.read": {
              name: "t3work.view.read",
              inputSchema: {},
            },
          },
        },
      ],
      callTool: () => Effect.succeed({ content: [{ type: "text", text: "ok" }] }),
      readResource: () => Effect.succeed({ contents: [] }),
    });

    const issued = yield* registry.issue({
      threadId,
      providerInstanceId: ProviderInstanceId.make("codex"),
    });
    const token = issued.config.authorizationHeader.replace(/^Bearer\s+/, "");
    const resolved = yield* registry.resolve(token);
    expect(resolved?.capabilities.has("preview")).toBe(true);
    expect(resolved?.capabilities.has("t3work")).toBe(true);
  }),
);
