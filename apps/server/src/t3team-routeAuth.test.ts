// @effect-diagnostics nodeBuiltinImport:off - the wiring check reads server.ts.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

import { AuthOrchestrationOperateScope, AuthOrchestrationReadScope } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { HttpRouter, HttpServerResponse } from "effect/unstable/http";
import { describe, expect, it } from "vite-plus/test";

import * as EnvironmentAuth from "./auth/EnvironmentAuth.ts";
import { t3teamRouteAuthLayer } from "./t3team-routeAuth.ts";

const SESSIONS: Record<string, ReadonlyArray<string>> = {
  "Bearer reader": [AuthOrchestrationReadScope],
  "Bearer operator": [AuthOrchestrationReadScope, AuthOrchestrationOperateScope],
};

const environmentAuth = Layer.mock(EnvironmentAuth.EnvironmentAuth)({
  authenticateHttpRequest: (request) => {
    const scopes = SESSIONS[request.headers.authorization ?? ""];
    return scopes === undefined
      ? Effect.fail(new EnvironmentAuth.ServerAuthMissingCredentialError())
      : Effect.succeed({
          sessionId: "session" as EnvironmentAuth.AuthenticatedSession["sessionId"],
          subject: "test",
          method: "bearer-access-token" as EnvironmentAuth.AuthenticatedSession["method"],
          scopes: scopes as EnvironmentAuth.AuthenticatedSession["scopes"],
        });
  },
});

const routes = Layer.mergeAll(
  HttpRouter.add("GET", "/api/t3team/thread/read", HttpServerResponse.text("read")),
  HttpRouter.add("POST", "/api/t3team/thread/write", HttpServerResponse.text("wrote")),
).pipe(Layer.provide(t3teamRouteAuthLayer), Layer.provide(environmentAuth));

const call = async (method: "GET" | "POST", path: string, authorization?: string) => {
  const { handler, dispose } = HttpRouter.toWebHandler(routes, { disableLogger: true });
  try {
    const response = await handler(
      new Request(`http://localhost${path}`, {
        method,
        headers: authorization === undefined ? {} : { authorization },
      }),
    );
    return { status: response.status, body: await response.text() };
  } finally {
    await dispose();
  }
};

describe("t3team route auth", () => {
  it("refuses a request without a session before the route runs", async () => {
    expect((await call("GET", "/api/t3team/thread/read")).status).toBe(401);
    const write = await call("POST", "/api/t3team/thread/write");
    expect(write.status).toBe(401);
    expect(write.body).not.toBe("wrote");
  });

  it("lets a read session read but not write, like upstream's raw routes", async () => {
    expect(await call("GET", "/api/t3team/thread/read", "Bearer reader")).toEqual({
      status: 200,
      body: "read",
    });
    expect((await call("POST", "/api/t3team/thread/write", "Bearer reader")).status).toBe(403);
    expect(await call("POST", "/api/t3team/thread/write", "Bearer operator")).toEqual({
      status: 200,
      body: "wrote",
    });
  });
});

/** t3team route layers `makeRoutesLayer` merges OUTSIDE a group that provides the auth layer. */
function unauthenticatedRouteLayers(): ReadonlyArray<string> {
  const here = NodePath.dirname(NodeURL.fileURLToPath(import.meta.url));
  const source = NodeFS.readFileSync(NodePath.join(here, "server.ts"), "utf8");
  const start = source.indexOf("const makeRoutesLayer =");
  const lines = source.slice(start, source.indexOf("\n).pipe(", start)).split("\n");
  return lines.flatMap((line, index) => {
    const route = /^\s*(t3team[A-Za-z]*RouteLayer),$/.exec(line)?.[1];
    if (route === undefined) return [];
    const close = lines.slice(index).find((next) => /^ {2}\)/.test(next)) ?? "";
    return close.includes("Layer.provide(t3teamRouteAuthLayer)") ? [] : [route];
  });
}

describe("t3team route registry", () => {
  it("authenticates every t3team route except the ones that carry their own capability", () => {
    expect([...unauthenticatedRouteLayers()].toSorted()).toEqual([
      "t3teamAtlassianAssetContentRouteLayer",
      "t3teamAtlassianOAuthCallbackRouteLayer",
      "t3teamCloudBrokerRouteLayer",
    ]);
  });
});
