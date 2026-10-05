/**
 * Re-issuing an MCP credential for a thread that still holds one (a provider
 * session restart) keeps the old token valid under the new scope: a driver that
 * reuses its live session never sees the new bearer, and the agent was left on
 * `invalid_mcp_credential` until the app restarted. Upstream V2's session
 * manager reuses a still-valid credential and revokes the thread itself before
 * a deliberate rotation, so this carry-over only matters for direct `issue`
 * callers. Every session also gets upstream's baseline capabilities.
 *
 * Every clock here is injected — no real sleeps.
 */
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import { EnvironmentId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { HttpServer } from "effect/unstable/http";
import * as NetAddress from "effect/unstable/net/NetAddress";

import * as ServerEnvironment from "../environment/ServerEnvironment.ts";
import * as McpSessionRegistry from "./McpSessionRegistry.ts";

const environmentId = EnvironmentId.make("environment-restart");
const fakeHttpServer = HttpServer.HttpServer.of({
  address: NetAddress.inetAddressFromIpStringUnsafe("127.0.0.1", 43124),
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

const packProvider = ProviderInstanceId.make("pack-provider");
/** Upstream grants every MCP session these, whatever the request asks for. */
const BASELINE = ["orchestration", "pull-requests", "worktree"] as const;

it.effect("a session restart keeps the token the running agent still holds valid", () =>
  Effect.gen(function* () {
    let timestamp = 1_000;
    const registry = yield* makeRegistry(() => timestamp);
    const threadId = ThreadId.make("thread-restart");

    // Cold start: the agent process receives token A.
    const first = yield* registry.issue({
      threadId,
      providerInstanceId: packProvider,
      capabilities: new Set(),
    });
    timestamp += 50;
    yield* registry.touch(threadId);

    // Model-tier change → the host restarts the session and mints token B. The
    // driver reuses its live session, so the agent keeps using A.
    timestamp += 30;
    const second = yield* registry.issue({
      threadId,
      providerInstanceId: packProvider,
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
      providerInstanceId: packProvider,
      capabilities: new Set(["preview", "device"]),
    });
    // Access setting narrowed between the two starts.
    yield* registry.issue({
      threadId,
      providerInstanceId: ProviderInstanceId.make("pack-provider-2"),
      capabilities: new Set(),
    });
    const scope = yield* registry.resolve(bearer(first));
    // The narrowed request dropped preview and device; only upstream's baseline remains.
    expect([...(scope?.capabilities ?? [])].sort()).toEqual([...BASELINE]);
    expect(scope?.providerInstanceId).toBe("pack-provider-2");
  }),
);

it.effect("liveness is shared: the restart refreshes the old token, a stop revokes both", () =>
  Effect.gen(function* () {
    let timestamp = 1_000;
    const registry = yield* makeRegistry(() => timestamp);
    const threadId = ThreadId.make("thread-shared-liveness");
    const first = yield* registry.issue({
      threadId,
      providerInstanceId: packProvider,
      capabilities: new Set(),
    });

    timestamp += LIVENESS_WINDOW_MS - 1;
    const second = yield* registry.issue({
      threadId,
      providerInstanceId: packProvider,
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
      providerInstanceId: packProvider,
      capabilities: new Set(),
    });
    const second = yield* registry.issue({
      threadId,
      providerInstanceId: packProvider,
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
      providerInstanceId: packProvider,
      capabilities: new Set(),
    });
    timestamp += LIVENESS_WINDOW_MS + 1;
    const second = yield* registry.issue({
      threadId,
      providerInstanceId: packProvider,
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
      providerInstanceId: packProvider,
      capabilities: new Set(["preview"]),
    });
    yield* registry.issue({
      threadId: ThreadId.make("thread-restarting"),
      providerInstanceId: packProvider,
      capabilities: new Set(),
    });
    const scope = yield* registry.resolve(bearer(other));
    // No cross-thread carry-over: the other thread keeps its own session, thread and scope.
    expect(scope?.threadId).toBe("thread-other");
    expect(scope?.providerSessionId).toBe(other.config.providerSessionId);
    expect([...(scope?.capabilities ?? [])].sort()).toEqual([...BASELINE, "preview"].sort());
  }),
);

// The module-level seam (`issueActiveMcpCredential`) must not pre-revoke the thread either.
it.effect("issueActiveMcpCredential twice for one thread leaves the first token resolvable", () =>
  Effect.gen(function* () {
    const registry = yield* McpSessionRegistry.McpSessionRegistry;
    const threadId = ThreadId.make("thread-active-seam");
    const first = yield* McpSessionRegistry.issueActiveMcpCredential({
      threadId,
      providerInstanceId: packProvider,
      capabilities: new Set(),
    });
    const second = yield* McpSessionRegistry.issueActiveMcpCredential({
      threadId,
      providerInstanceId: packProvider,
      capabilities: new Set(),
    });
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    const scope = yield* registry.resolve(bearer(first!));
    expect(scope?.threadId).toBe(threadId);
    expect(scope?.providerSessionId).toBe(second!.config.providerSessionId);
  }).pipe(Effect.provide(McpSessionRegistry.layer.pipe(Layer.provide(infrastructure)))),
);
