/**
 * A provider session RESTART for a live thread (model tier / cwd / access
 * change → `ProviderService.startSession` on a thread whose agent process is
 * still running) mints a new MCP credential. The old token must stay valid:
 * a driver that reuses its live session never sees the new bearer, and the
 * agent was left on `invalid_mcp_credential` until the app restarted.
 *
 * Every clock here is injected — no real sleeps.
 */
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import { EnvironmentId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { HttpServer } from "effect/unstable/http";

import * as ServerEnvironment from "../environment/ServerEnvironment.ts";
import * as McpSessionRegistry from "./McpSessionRegistry.ts";

const environmentId = EnvironmentId.make("environment-restart");
const fakeHttpServer = HttpServer.HttpServer.of({
  address: { _tag: "TcpAddress", hostname: "127.0.0.1", port: 43124 },
  serve: (() => Effect.void) as HttpServer.HttpServer["Service"]["serve"],
});
const fakeEnvironment = ServerEnvironment.ServerEnvironment.of({
  getEnvironmentId: Effect.succeed(environmentId),
  getDescriptor: Effect.die("unused"),
});
const infrastructure = Layer.mergeAll(
  Layer.succeed(HttpServer.HttpServer, fakeHttpServer),
  Layer.succeed(ServerEnvironment.ServerEnvironment, fakeEnvironment),
  NodeServices.layer,
);

const LIVENESS_WINDOW_MS = 100;

const makeRegistry = (now: () => number) =>
  McpSessionRegistry.__testing
    .make({ now, livenessWindowMs: LIVENESS_WINDOW_MS })
    .pipe(Effect.provide(infrastructure));

const bearer = (issued: McpSessionRegistry.McpIssuedCredential) =>
  issued.config.authorizationHeader.replace(/^Bearer\s+/, "");

const nexplore = ProviderInstanceId.make("nexplore");

it.effect("a session restart keeps the token the running agent still holds valid", () =>
  Effect.gen(function* () {
    let timestamp = 1_000;
    const registry = yield* makeRegistry(() => timestamp);
    const threadId = ThreadId.make("thread-restart");

    // Cold start: the agent process receives token A.
    const first = yield* registry.issue({
      threadId,
      providerInstanceId: nexplore,
      capabilities: new Set(),
    });
    timestamp += 50;
    yield* registry.touch(threadId);

    // Model-tier change → the host restarts the session and mints token B. The
    // driver reuses its live session, so the agent keeps using A.
    timestamp += 30;
    const second = yield* registry.issue({
      threadId,
      providerInstanceId: nexplore,
      capabilities: new Set(),
    });
    expect(bearer(second)).not.toBe(bearer(first));

    const viaOld = yield* registry.resolve(bearer(first));
    const viaNew = yield* registry.resolve(bearer(second));
    expect(viaOld?.threadId).toBe(threadId);
    expect(viaNew?.threadId).toBe(threadId);
    // Both tokens describe the SAME (latest) provider session.
    expect(viaOld?.providerSessionId).toBe(second.config.providerSessionId);
    expect(viaOld?.issuedAt).toBe(viaNew?.issuedAt);
  }),
);

it.effect("the restarted session's scope wins for the old token", () =>
  Effect.gen(function* () {
    const registry = yield* makeRegistry(() => 1_000);
    const threadId = ThreadId.make("thread-rescope");
    const first = yield* registry.issue({
      threadId,
      providerInstanceId: nexplore,
      capabilities: new Set(["preview", "device"]),
    });
    // Access setting narrowed between the two starts.
    yield* registry.issue({
      threadId,
      providerInstanceId: ProviderInstanceId.make("nexplore-2"),
      capabilities: new Set(),
    });
    const scope = yield* registry.resolve(bearer(first));
    expect([...(scope?.capabilities ?? [])].sort()).toEqual(["pull-requests"]);
    expect(scope?.providerInstanceId).toBe("nexplore-2");
  }),
);

it.effect("liveness is shared: the restart refreshes the old token, a stop revokes both", () =>
  Effect.gen(function* () {
    let timestamp = 1_000;
    const registry = yield* makeRegistry(() => timestamp);
    const threadId = ThreadId.make("thread-shared-liveness");
    const first = yield* registry.issue({
      threadId,
      providerInstanceId: nexplore,
      capabilities: new Set(),
    });

    timestamp += LIVENESS_WINDOW_MS - 1;
    const second = yield* registry.issue({
      threadId,
      providerInstanceId: nexplore,
      capabilities: new Set(),
    });
    // Without the restart refreshing it, A would have lapsed here.
    timestamp += LIVENESS_WINDOW_MS - 1;
    expect((yield* registry.resolve(bearer(first)))?.threadId).toBe(threadId);

    yield* registry.revokeThread(threadId);
    expect(yield* registry.resolve(bearer(first))).toBeUndefined();
    expect(yield* registry.resolve(bearer(second))).toBeUndefined();
  }),
);

it.effect("revoking the latest provider session takes the carried tokens with it", () =>
  Effect.gen(function* () {
    const registry = yield* makeRegistry(() => 1_000);
    const threadId = ThreadId.make("thread-revoke-session");
    const first = yield* registry.issue({
      threadId,
      providerInstanceId: nexplore,
      capabilities: new Set(),
    });
    const second = yield* registry.issue({
      threadId,
      providerInstanceId: nexplore,
      capabilities: new Set(),
    });
    yield* registry.revokeProviderSession(second.config.providerSessionId);
    expect(yield* registry.resolve(bearer(first))).toBeUndefined();
    expect(yield* registry.resolve(bearer(second))).toBeUndefined();
  }),
);

it.effect("a token that lapsed before the restart stays dead", () =>
  Effect.gen(function* () {
    let timestamp = 1_000;
    const registry = yield* makeRegistry(() => timestamp);
    const threadId = ThreadId.make("thread-lapsed");
    const first = yield* registry.issue({
      threadId,
      providerInstanceId: nexplore,
      capabilities: new Set(),
    });
    timestamp += LIVENESS_WINDOW_MS + 1;
    const second = yield* registry.issue({
      threadId,
      providerInstanceId: nexplore,
      capabilities: new Set(),
    });
    expect(yield* registry.resolve(bearer(first))).toBeUndefined();
    expect((yield* registry.resolve(bearer(second)))?.threadId).toBe(threadId);
  }),
);

it.effect("other threads' tokens are not touched by a restart", () =>
  Effect.gen(function* () {
    const registry = yield* makeRegistry(() => 1_000);
    const other = yield* registry.issue({
      threadId: ThreadId.make("thread-other"),
      providerInstanceId: nexplore,
      capabilities: new Set(["preview"]),
    });
    yield* registry.issue({
      threadId: ThreadId.make("thread-restarting"),
      providerInstanceId: nexplore,
      capabilities: new Set(),
    });
    const scope = yield* registry.resolve(bearer(other));
    expect(scope?.providerSessionId).toBe(other.config.providerSessionId);
    expect([...(scope?.capabilities ?? [])].sort()).toEqual(["preview", "pull-requests"]);
  }),
);

// `ProviderService.prepareMcpSession` goes through this module-level seam on
// every startSession; the restart path must not pre-revoke the thread.
it.effect("issueActiveMcpCredential twice for one thread leaves the first token resolvable", () =>
  Effect.gen(function* () {
    const registry = yield* McpSessionRegistry.McpSessionRegistry;
    const threadId = ThreadId.make("thread-active-seam");
    const first = yield* McpSessionRegistry.issueActiveMcpCredential({
      threadId,
      providerInstanceId: nexplore,
      capabilities: new Set(),
    });
    const second = yield* McpSessionRegistry.issueActiveMcpCredential({
      threadId,
      providerInstanceId: nexplore,
      capabilities: new Set(),
    });
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    const scope = yield* registry.resolve(bearer(first!));
    expect(scope?.threadId).toBe(threadId);
    expect(scope?.providerSessionId).toBe(second!.config.providerSessionId);
  }).pipe(Effect.provide(McpSessionRegistry.layer.pipe(Layer.provide(infrastructure)))),
);
