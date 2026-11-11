/**
 * GET /api/auth/clients: the client list the cloud session's idle check polls
 * (hive session.yml "Hold the session until the handoff window"). It needs the
 * access:read scope and answers a bare array whose entries carry `connected`,
 * `current` and `lastConnectedAt`, the fields that check reads.
 */
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Scope from "effect/Scope";
import * as Etag from "effect/http/Etag";
import * as HttpPlatform from "effect/http/HttpPlatform";
import * as HttpRouter from "effect/http/HttpRouter";

import * as ServerConfig from "../config.ts";
import * as ServerEnvironment from "../environment/ServerEnvironment.ts";
import * as SqlitePersistence from "../persistence/Sqlite.ts";
import * as EnvironmentAuth from "./EnvironmentAuth.ts";
import * as ServerSecretStore from "./ServerSecretStore.ts";
import * as SessionStore from "./SessionStore.ts";
import { authClientsRouteLayer } from "./t3team-authClientsRoute.ts";
import * as ManagedPolicy from "../policy/ManagedPolicy.ts";

const layerConfig = ServerConfig.layerTest(process.cwd(), { prefix: "t3-auth-clients-test-" });
const layerEnvironmentAuth = EnvironmentAuth.layer.pipe(
  Layer.provide(ManagedPolicy.layerTest()),
  Layer.provide(SqlitePersistence.layerMemory),
  Layer.provide(ServerSecretStore.layer),
  Layer.provide(ServerEnvironment.layerIdentity),
  Layer.provide(layerConfig),
);
const layerRoutes = authClientsRouteLayer.pipe(
  Layer.provideMerge(layerEnvironmentAuth),
  Layer.provideMerge(
    HttpPlatform.layer.pipe(
      Layer.provideMerge(NodeServices.layer),
      Layer.provideMerge(Etag.layerWeak),
    ),
  ),
  Layer.provide(NodeServices.layer),
);

const getClients = (token: string) =>
  new Request("http://127.0.0.1/api/auth/clients", {
    headers: { authorization: `Bearer ${token}` },
  });

/** The idle check's own reading of the answer (session.yml idle-probe.cjs). */
function probeLine(clients: unknown): string {
  const all = Array.isArray(clients) ? clients : [];
  const active = all.filter((c) => c.connected === true && c.current !== true);
  return active.length > 0 ? `ACTIVE ${active.length}` : `NO_ACTIVE_CLIENTS ${all.length}`;
}

it.live("lists client sessions with their live connected flag, behind access:read", () =>
  Effect.gen(function* () {
    const crypto = yield* Crypto.Crypto;
    const unusedSecretStore = ServerSecretStore.ServerSecretStore.of({
      get: () => Effect.succeedNone,
      set: () => Effect.void,
      create: () => Effect.void,
      getOrCreateRandom: () => Effect.die("Not used by these routes."),
      remove: () => Effect.void,
    });
    const requestContext = Context.make(Crypto.Crypto, crypto).pipe(
      Context.add(ServerSecretStore.ServerSecretStore, unusedSecretStore),
    );
    // One memo map: the routes and this test share the same auth and session store.
    const memoMap = Layer.makeMemoMapUnsafe();
    const scope = yield* Scope.Scope;
    const authContext = yield* Layer.buildWithMemoMap(
      layerEnvironmentAuth.pipe(Layer.provide(NodeServices.layer)),
      memoMap,
      scope,
    );
    const web = yield* Effect.acquireRelease(
      Effect.sync(() => HttpRouter.toWebHandler(layerRoutes, { disableLogger: true, memoMap })),
      (handler) => Effect.promise(() => handler.dispose()),
    );
    const call = (token: string) =>
      Effect.promise(async () => {
        const response = await web.handler(getClients(token), requestContext);
        return { status: response.status, body: (await response.json()) as unknown };
      });
    const auth = Context.get(authContext, EnvironmentAuth.EnvironmentAuth);
    const store = Context.get(authContext, SessionStore.SessionStore);

    const probe = yield* auth.issueSession({ scopes: ["access:read"], label: "idle probe" });
    const desktop = yield* auth.issueSession({ scopes: ["orchestration:read"], label: "desktop" });

    // Not signed in: refused before anything is listed.
    const anonymous = yield* call("not-a-session-token");
    expect(anonymous.status).toBe(401);

    // Without access:read: refused.
    const refused = yield* call(desktop.token);
    expect(refused.status).toBe(403);
    expect(refused.body).toMatchObject({ _tag: "EnvironmentScopeRequiredError" });

    // Nobody connected: the probe sees only itself and finds no active client.
    const idle = yield* call(probe.token);
    expect(idle.status).toBe(200);
    expect(Array.isArray(idle.body)).toBe(true);
    const idleClients = idle.body as ReadonlyArray<Record<string, unknown>>;
    expect(idleClients).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sessionId: probe.sessionId, current: true }),
        expect.objectContaining({
          sessionId: desktop.sessionId,
          current: false,
          connected: false,
          lastConnectedAt: null,
        }),
      ]),
    );
    expect(probeLine(idleClients)).toBe(`NO_ACTIVE_CLIENTS ${idleClients.length}`);

    // The desktop connects: it is listed as connected, and the probe sees activity.
    yield* store.markConnected(desktop.sessionId);
    const active = yield* call(probe.token);
    const activeClients = active.body as ReadonlyArray<Record<string, unknown>>;
    const desktopEntry = activeClients.find((c) => c.sessionId === desktop.sessionId);
    expect(desktopEntry).toMatchObject({ connected: true, current: false });
    expect(Number.isFinite(Date.parse(String(desktopEntry?.lastConnectedAt)))).toBe(true);
    expect(probeLine(activeClients)).toBe("ACTIVE 1");

    // And disconnects again: idle once more.
    yield* store.markDisconnected(desktop.sessionId);
    const after = yield* call(probe.token);
    expect(probeLine(after.body)).toMatch(/^NO_ACTIVE_CLIENTS /);
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);
