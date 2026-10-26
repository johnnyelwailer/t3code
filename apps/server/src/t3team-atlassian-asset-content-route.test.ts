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
import {
  isWithinRoot,
  KnownWorkspaces,
  UnknownWorkspaceError,
} from "./workspace/KnownWorkspaces.ts";
import * as WorkspacePaths from "./workspace/WorkspacePaths.ts";

const ASSET_BYTES = "cached-attachment-bytes";
// The shape `buildJiraTicketAttachmentAssetPath` writes.
const CACHED = ".nexi/context/jira/p1/items/k-1/attachments/files/1-a.png";
const LINKED = ".nexi/context/jira/p1/items/k-1/attachments/files/2-b.png";

function makeFixture() {
  const base = NodeFS.realpathSync(NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "asset-")));
  const project = NodePath.join(base, "project");
  // Registered too, so a symlink into it is still not inside the workspace the request named.
  const other = NodePath.join(base, "other");
  const outside = NodePath.join(base, "outside");
  for (const root of [project, other, outside]) {
    NodeFS.mkdirSync(NodePath.dirname(NodePath.join(root, CACHED)), { recursive: true });
    NodeFS.writeFileSync(NodePath.join(root, CACHED), ASSET_BYTES);
    NodeFS.writeFileSync(NodePath.join(root, ".env"), "workspace-secret");
  }
  NodeFS.symlinkSync(NodePath.join(other, ".env"), NodePath.join(project, LINKED));
  return {
    project,
    other,
    outside,
    [Symbol.dispose]: () => NodeFS.rmSync(base, { recursive: true, force: true }),
  };
}

function makeHandler(registered: ReadonlyArray<string>) {
  const inRegistered = (candidate: string) =>
    registered.some((root) => {
      const relative = NodePath.relative(root, NodePath.resolve(candidate));
      return relative === "" || (!relative.startsWith("..") && !NodePath.isAbsolute(relative));
    });
  const knownWorkspaces = Layer.mock(KnownWorkspaces)({
    contains: (realPath) => Effect.succeed(inRegistered(realPath)),
    assertContains: (cwd) =>
      inRegistered(cwd) ? Effect.void : Effect.fail(new UnknownWorkspaceError({ cwd })),
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

async function get(input: {
  readonly registered: ReadonlyArray<string>;
  readonly workspaceRoot: string;
  readonly relativePath?: string;
  readonly cookie?: string;
}) {
  const { handler, dispose } = makeHandler(input.registered);
  const params = new URLSearchParams({
    accountId: "acct-1",
    url: "https://example.atlassian.net/secure/attachment/1/a.png",
    workspaceRoot: input.workspaceRoot,
    relativePath: input.relativePath ?? CACHED,
  });
  try {
    const response = await handler(
      new Request(`http://localhost/api/t3team/atlassian/asset/content?${params}`, {
        headers: input.cookie === undefined ? {} : { cookie: input.cookie },
      }),
    );
    return { status: response.status, body: await response.text() };
  } finally {
    await dispose();
  }
}

const SIGNED_IN = "t3_session=reader";

describe("t3team Atlassian asset content route", () => {
  it("refuses a request without a session before reading anything", async () => {
    using fixture = makeFixture();
    const response = await get({ registered: [fixture.project], workspaceRoot: fixture.project });
    expect(response.status).toBe(401);
    expect(response.body).not.toContain(ASSET_BYTES);
  });

  it("serves a cached attachment from a registered workspace to a signed-in client", async () => {
    using fixture = makeFixture();
    const response = await get({
      registered: [fixture.project],
      workspaceRoot: fixture.project,
      cookie: SIGNED_IN,
    });
    expect(response).toEqual({ status: 200, body: ASSET_BYTES });
  });

  it.each([
    ["an unregistered sibling", (f: ReturnType<typeof makeFixture>) => f.outside],
    ["a lexical escape", (f: ReturnType<typeof makeFixture>) => `${f.project}/../outside`],
    ["a name that only shares a prefix", (f: ReturnType<typeof makeFixture>) => `${f.project}-x`],
  ])("refuses a workspace root that is %s", async (_label, root) => {
    using fixture = makeFixture();
    NodeFS.mkdirSync(`${fixture.project}-x`);
    const response = await get({
      registered: [fixture.project],
      workspaceRoot: root(fixture),
      cookie: SIGNED_IN,
    });
    expect(response.status).toBe(403);
    expect(response.body).not.toContain(ASSET_BYTES);
  });

  it("refuses a file in a registered workspace that is not a cached attachment", async () => {
    using fixture = makeFixture();
    const response = await get({
      registered: [fixture.project],
      workspaceRoot: fixture.project,
      relativePath: ".env",
      cookie: SIGNED_IN,
    });
    expect(response.status).toBe(403);
    expect(response.body).not.toContain("workspace-secret");
  });

  it("refuses a cached-attachment symlink that leads into another workspace", async () => {
    using fixture = makeFixture();
    const response = await get({
      registered: [fixture.project, fixture.other],
      workspaceRoot: fixture.project,
      relativePath: LINKED,
      cookie: SIGNED_IN,
    });
    expect(response.status).toBe(403);
    expect(response.body).not.toContain("workspace-secret");
  });
});
