// @effect-diagnostics nodeBuiltinImport:off - the fixture workspace is a real temp directory.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { AuthOrchestrationReadScope } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { HttpRouter } from "effect/http";
import { describe, expect, it } from "vite-plus/test";

import * as EnvironmentAuth from "./auth/EnvironmentAuth.ts";
import { ServerConfig } from "./config.ts";
import { t3teamAtlassianAssetContentRouteLayer } from "./t3team-atlassian-asset-content-route.ts";
import { t3teamRouteAuthLayer } from "./t3team-routeAuth.ts";
import { KnownWorkspaces, UnknownWorkspaceError } from "./workspace/KnownWorkspaces.ts";
import * as WorkspacePaths from "./workspace/WorkspacePaths.ts";

const ASSET_BYTES = "cached-attachment-bytes";

function makeFixture() {
  const base = NodeFS.realpathSync(NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "asset-")));
  const registered = NodePath.join(base, "project");
  const outside = NodePath.join(base, "outside");
  for (const root of [registered, outside]) {
    NodeFS.mkdirSync(NodePath.join(root, ".t3team"), { recursive: true });
    NodeFS.writeFileSync(NodePath.join(root, ".t3team", "a.png"), ASSET_BYTES);
  }
  return {
    base,
    registered,
    outside,
    [Symbol.dispose]: () => NodeFS.rmSync(base, { recursive: true, force: true }),
  };
}

function makeHandler(registeredRoot: string) {
  const knownWorkspaces = Layer.mock(KnownWorkspaces)({
    contains: (realPath) => Effect.succeed(realPath.startsWith(registeredRoot)),
    assertContains: (cwd) =>
      cwd.startsWith(registeredRoot)
        ? Effect.void
        : Effect.fail(new UnknownWorkspaceError({ cwd })),
  });
  const environmentAuth = Layer.mock(EnvironmentAuth.EnvironmentAuth)({
    authenticateHttpRequest: (request) =>
      request.headers.cookie === "t3_session=reader"
        ? Effect.succeed({
            sessionId: "session" as EnvironmentAuth.AuthenticatedSession["sessionId"],
            subject: "test",
            method: "browser-session-cookie" as EnvironmentAuth.AuthenticatedSession["method"],
            scopes: [AuthOrchestrationReadScope] as EnvironmentAuth.AuthenticatedSession["scopes"],
          })
        : Effect.fail(new EnvironmentAuth.ServerAuthMissingCredentialError()),
  });
  // The route-auth guard reads only `devUrl`.
  const serverConfig = Layer.succeed(ServerConfig, {
    devUrl: new URL("http://localhost:6275/"),
  } as ServerConfig["Service"]);
  // Mounted the way server.ts mounts it: inside the t3team route-auth group. The handler reads
  // its services per request, so they are merged into the handler's context, not just provided.
  const routes = t3teamAtlassianAssetContentRouteLayer.pipe(
    Layer.provide(t3teamRouteAuthLayer),
    Layer.provideMerge(Layer.mergeAll(environmentAuth, serverConfig, knownWorkspaces)),
    Layer.provideMerge(WorkspacePaths.layer),
    Layer.provideMerge(NodeServices.layer),
  );
  return HttpRouter.toWebHandler(routes, { disableLogger: true });
}

async function get(registeredRoot: string, workspaceRoot: string, cookie?: string) {
  const { handler, dispose } = makeHandler(registeredRoot);
  const params = new URLSearchParams({
    accountId: "acct-1",
    url: "https://example.atlassian.net/secure/attachment/1/a.png",
    workspaceRoot,
    relativePath: ".t3team/a.png",
  });
  try {
    const response = await handler(
      new Request(`http://localhost/api/t3team/atlassian/asset/content?${params}`, {
        headers: cookie === undefined ? {} : { cookie },
      }),
    );
    return { status: response.status, body: await response.text() };
  } finally {
    await dispose();
  }
}

describe("t3team Atlassian asset content route", () => {
  it("refuses a request without a session before reading anything", async () => {
    using fixture = makeFixture();
    const response = await get(fixture.registered, fixture.registered);
    expect(response.status).toBe(401);
    expect(response.body).not.toContain(ASSET_BYTES);
  });

  it("serves a cached attachment from a registered workspace to a signed-in client", async () => {
    using fixture = makeFixture();
    expect(await get(fixture.registered, fixture.registered, "t3_session=reader")).toEqual({
      status: 200,
      body: ASSET_BYTES,
    });
  });

  it("refuses to read from a workspace root that is not a registered workspace", async () => {
    using fixture = makeFixture();
    const response = await get(fixture.registered, fixture.outside, "t3_session=reader");
    expect(response.status).toBe(403);
    expect(response.body).not.toContain(ASSET_BYTES);
  });
});
