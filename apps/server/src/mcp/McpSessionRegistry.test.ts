import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import { EnvironmentId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import { HttpServer } from "effect/unstable/http";

import * as ServerEnvironment from "../environment/ServerEnvironment.ts";
import * as McpSessionRegistry from "./McpSessionRegistry.ts";

const environmentId = EnvironmentId.make("environment-1");
const makeFakeHttpServer = (hostname: string, port = 43123) =>
  HttpServer.HttpServer.of({
    address: { _tag: "TcpAddress", hostname, port },
    serve: (() => Effect.void) as HttpServer.HttpServer["Service"]["serve"],
  });
const fakeHttpServer = makeFakeHttpServer("127.0.0.1");
const fakeEnvironment = ServerEnvironment.ServerEnvironment.of({
  getEnvironmentId: Effect.succeed(environmentId),
  getDescriptor: Effect.die("unused"),
});

const makeRegistry = (now: () => number, httpServer = fakeHttpServer) =>
  McpSessionRegistry.__testing
    .make({
      now,
      livenessWindowMs: 100,
    })
    .pipe(
      Effect.provideService(HttpServer.HttpServer, httpServer),
      Effect.provideService(ServerEnvironment.ServerEnvironment, fakeEnvironment),
      Effect.provide(NodeServices.layer),
    );

it.effect("stores only a token hash, resolves the bearer token, and revokes by thread", () =>
  Effect.gen(function* () {
    let timestamp = 1_000;
    const registry = yield* makeRegistry(() => timestamp);
    const threadId = ThreadId.make("thread-1");
    const issued = yield* registry.issue({
      threadId,
      providerInstanceId: ProviderInstanceId.make("codex"),
    });
    expect(issued.config.endpoint).toBe("http://127.0.0.1:43123/mcp");
    const token = issued.config.authorizationHeader.replace(/^Bearer\s+/, "");
    expect(token.length).toBeGreaterThan(20);

    const resolved = yield* registry.resolve(token);
    expect(resolved?.threadId).toBe(threadId);

    yield* registry.revokeThread(threadId);
    expect(yield* registry.resolve(token)).toBeUndefined();

    timestamp += 2_000;
  }),
);

it.effect("builds MCP endpoints from the bound server host", () =>
  Effect.gen(function* () {
    const cases = [
      ["100.64.0.40", "http://100.64.0.40:43123/mcp"],
      ["0.0.0.0", "http://127.0.0.1:43123/mcp"],
      ["localhost", "http://localhost:43123/mcp"],
      ["127.0.0.1", "http://127.0.0.1:43123/mcp"],
    ] as const;

    for (const [hostname, expectedEndpoint] of cases) {
      const registry = yield* makeRegistry(() => 1_000, makeFakeHttpServer(hostname));
      const issued = yield* registry.issue({
        threadId: ThreadId.make(`thread-${hostname}`),
        providerInstanceId: ProviderInstanceId.make("codex"),
      });
      expect(issued.config.endpoint).toBe(expectedEndpoint);
    }
  }),
);

it.effect("expires credentials once their session stops showing signs of life", () =>
  Effect.gen(function* () {
    let timestamp = 1_000;
    const registry = yield* makeRegistry(() => timestamp);
    const issued = yield* registry.issue({
      threadId: ThreadId.make("thread-2"),
      providerInstanceId: ProviderInstanceId.make("claude"),
    });
    const token = issued.config.authorizationHeader.replace(/^Bearer\s+/, "");
    timestamp += 101;
    expect(yield* registry.resolve(token)).toBeUndefined();
  }),
);

it.effect("keeps a credential alive across turns that never touch an MCP tool", () =>
  Effect.gen(function* () {
    let timestamp = 1_000;
    const registry = yield* makeRegistry(() => timestamp);
    const threadId = ThreadId.make("thread-3");
    const issued = yield* registry.issue({
      threadId,
      providerInstanceId: ProviderInstanceId.make("claude"),
    });
    const token = issued.config.authorizationHeader.replace(/^Bearer\s+/, "");

    // Well past the liveness window in total, but each turn reports in before
    // it lapses — this is the long-session case that used to lose the toolkit.
    for (let turn = 0; turn < 10; turn += 1) {
      timestamp += 99;
      yield* registry.touch(threadId);
    }

    expect((yield* registry.resolve(token))?.threadId).toBe(threadId);
  }),
);

const bareToken = (header: string) => header.replace(/^Bearer\s+/, "");
const hostClaim = (threadId: ThreadId, providerInstanceId: ProviderInstanceId, held?: string) =>
  ({
    threadId,
    providerInstanceId,
    heldAuthorizationHeader: held,
    authority: { _tag: "Host" },
  }) as const;

it.effect("reuses the exact bearer a thread holds, and only in the scope it holds it", () =>
  Effect.gen(function* () {
    let timestamp = 1_000;
    const registry = yield* makeRegistry(() => timestamp);
    const threadId = ThreadId.make("thread-live");
    const providerInstanceId = ProviderInstanceId.make("nexplore");

    const first = yield* registry.issue({ threadId, providerInstanceId });
    const held = first.config.authorizationHeader;

    expect(
      (yield* registry.reuseOrReissue(hostClaim(threadId, providerInstanceId, held)))._tag,
    ).toBe("Reused");
    // Another provider instance is another scope: reuse must not cross it.
    expect(
      (yield* registry.reuseOrReissue(hostClaim(threadId, ProviderInstanceId.make("codex"), held)))
        ._tag,
    ).toBe("Issued");

    // A bearer this registry no longer honours is never reusable, whatever
    // else the thread has. `hasLiveCredential`-style matching on thread and
    // instance would still have said "live" here.
    const replacement = yield* registry.reuseOrReissue(hostClaim(threadId, providerInstanceId));
    expect(replacement._tag).toBe("Issued");
    expect(yield* registry.resolve(bareToken(held))).toBeUndefined();
    expect(
      (yield* registry.reuseOrReissue(hostClaim(threadId, providerInstanceId, held)))._tag,
    ).toBe("Issued");

    // Expiry counts as gone, so a re-prepare mints instead of reusing.
    const live = yield* registry.reuseOrReissue(hostClaim(threadId, providerInstanceId));
    const liveToken = live._tag === "Issued" ? live.config.authorizationHeader : "";
    timestamp += 101;
    expect(
      (yield* registry.reuseOrReissue(hostClaim(threadId, providerInstanceId, liveToken)))._tag,
    ).toBe("Issued");
  }),
);

// The invariant is one credential per thread. Split into a revoke followed by
// an issue it does not hold: with a single yield point between the two halves,
// eight concurrent callers on the pre-transaction registry left all eight
// bearers resolving. One `SynchronizedRef.modify` has no such point.
it.effect("leaves exactly one live credential however concurrent claims interleave", () =>
  Effect.gen(function* () {
    const registry = yield* makeRegistry(() => 1_000);
    const threadId = ThreadId.make("thread-concurrent");
    const providerInstanceId = ProviderInstanceId.make("nexplore");

    const claims = yield* Effect.all(
      Array.from({ length: 8 }, () =>
        registry.reuseOrReissue(hostClaim(threadId, providerInstanceId)),
      ),
      { concurrency: "unbounded" },
    );

    let live = 0;
    for (const claim of claims) {
      expect(claim._tag).toBe("Issued");
      if (claim._tag !== "Issued") continue;
      if (yield* registry.resolve(bareToken(claim.config.authorizationHeader))) live += 1;
    }
    expect(live).toBe(1);
  }),
);

// Withdrawal is not "delete the records". A caller that read the world before
// a stop must not be able to mint after it — the records it would replace are
// gone, so nothing about the state it sees says no.
it.effect("refuses a claim whose authority predates a withdrawal, and mints nothing", () =>
  Effect.gen(function* () {
    const registry = yield* makeRegistry(() => 1_000);
    const threadId = ThreadId.make("thread-withdrawn");
    const providerInstanceId = ProviderInstanceId.make("nexplore");

    const issued = yield* registry.issue({ threadId, providerInstanceId });
    const held = issued.config.authorizationHeader;
    const epoch = yield* registry.withdrawalCount(threadId);

    yield* registry.revokeThread(threadId);
    expect(yield* registry.withdrawalCount(threadId)).toBe(epoch + 1n);

    const claim = yield* registry.reuseOrReissue({
      threadId,
      providerInstanceId,
      heldAuthorizationHeader: held,
      authority: { _tag: "Bearer", presentedAuthorizationHeader: held, withdrawalCount: epoch },
    });
    expect(claim._tag).toBe("Withdrawn");
    expect(yield* registry.resolve(bareToken(held))).toBeUndefined();

    // The counter advances even when the stop finds nothing left to delete,
    // which is the case a stop after an expiry would otherwise miss.
    yield* registry.revokeThread(threadId);
    expect(yield* registry.withdrawalCount(threadId)).toBe(epoch + 2n);
  }),
);

// The epoch check is a strict inequality on a counter, so the whole mechanism
// rests on "an increment always changes the value". That is a property of the
// domain, not of the code around it: as a `number` it stops holding at the top
// of the safe-integer range, where the increment is a no-op and every authority
// the counter had retired starts matching again. Not reachable at human
// lifecycle rates — but "never reused" was stated as absolute, so the counter
// has to be a domain where it is.
it.effect("counts withdrawals in a domain where an increment is always a change", () =>
  Effect.gen(function* () {
    const registry = yield* makeRegistry(() => 1_000);
    const threadId = ThreadId.make("thread-epoch-precision");
    const providerInstanceId = ProviderInstanceId.make("nexplore");
    const issued = yield* registry.issue({ threadId, providerInstanceId });
    const held = issued.config.authorizationHeader;

    expect(typeof (yield* registry.withdrawalCount(threadId))).toBe("bigint");
    // Past the safe range a `number` increment stops moving the value: the
    // withdrawal after this one would read exactly the same as the one before
    // it, and every authority the counter had retired would match again.
    const saturating = Number.MAX_SAFE_INTEGER + 1;
    expect(saturating + 1).toBe(saturating);
    expect(BigInt(saturating) + 1n).not.toBe(BigInt(saturating));

    // An authority stamped anywhere in that range is compared, not truncated
    // into accidental equality with the counter's real value.
    const claim = yield* registry.reuseOrReissue({
      threadId,
      providerInstanceId,
      heldAuthorizationHeader: held,
      authority: {
        _tag: "Bearer",
        presentedAuthorizationHeader: held,
        withdrawalCount: BigInt(saturating),
      },
    });
    expect(claim._tag).toBe("Withdrawn");
    expect((yield* registry.resolve(bareToken(held)))?.threadId).toBe(threadId);
  }),
);

// Possession of the thread's bearer is what buys a mint. Presenting anything
// else buys nothing, however live the thread's own credential is.
it.effect("mints nothing for a bearer this host did not hand the thread", () =>
  Effect.gen(function* () {
    const registry = yield* makeRegistry(() => 1_000);
    const threadId = ThreadId.make("thread-guessed");
    const providerInstanceId = ProviderInstanceId.make("nexplore");
    const issued = yield* registry.issue({ threadId, providerInstanceId });
    const held = issued.config.authorizationHeader;

    const claim = yield* registry.reuseOrReissue({
      threadId,
      providerInstanceId,
      // The host has moved on; the caller presents something else entirely.
      heldAuthorizationHeader: "Bearer host-moved-on",
      authority: {
        _tag: "Bearer",
        presentedAuthorizationHeader: "Bearer guessed",
        withdrawalCount: yield* registry.withdrawalCount(threadId),
      },
    });
    expect(claim._tag).toBe("Unrecognized");
    // And the thread's real credential is untouched by the refusal.
    expect((yield* registry.resolve(bareToken(held)))?.threadId).toBe(threadId);
  }),
);

it.effect("retires every thread's outstanding authority when all credentials are revoked", () =>
  Effect.gen(function* () {
    const registry = yield* makeRegistry(() => 1_000);
    const threadId = ThreadId.make("thread-revoke-all");
    const providerInstanceId = ProviderInstanceId.make("nexplore");
    const issued = yield* registry.issue({ threadId, providerInstanceId });
    const epoch = yield* registry.withdrawalCount(threadId);

    yield* registry.revokeAll;

    const claim = yield* registry.reuseOrReissue({
      threadId,
      providerInstanceId,
      heldAuthorizationHeader: issued.config.authorizationHeader,
      authority: {
        _tag: "Bearer",
        presentedAuthorizationHeader: issued.config.authorizationHeader,
        withdrawalCount: epoch,
      },
    });
    expect(claim._tag).toBe("Withdrawn");
  }),
);

// The same invariant as the revoke above, at the one call site that has no
// thread to name. Bumping only the threads `revokeAll` can still see — a live
// record, or a counter from an earlier withdrawal — misses the thread whose
// record expired while its session lived on, which is precisely the holder who
// is about to ask for a replacement.
it.effect("retires the authority of a thread whose record had already expired", () =>
  Effect.gen(function* () {
    let timestamp = 1_000;
    const registry = yield* makeRegistry(() => timestamp);
    const threadId = ThreadId.make("thread-revoke-all-after-expiry");
    const providerInstanceId = ProviderInstanceId.make("nexplore");

    const issued = yield* registry.issue({ threadId, providerInstanceId });
    const held = issued.config.authorizationHeader;
    const epoch = yield* registry.withdrawalCount(threadId);

    // Nothing left for `revokeAll` to enumerate: no record, and no counter,
    // because this thread has never been withdrawn before.
    timestamp += 101;
    expect(yield* registry.resolve(bareToken(held))).toBeUndefined();

    yield* registry.revokeAll;
    expect(yield* registry.withdrawalCount(threadId)).toBe(epoch + 1n);

    const claim = yield* registry.reuseOrReissue({
      threadId,
      providerInstanceId,
      heldAuthorizationHeader: held,
      authority: { _tag: "Bearer", presentedAuthorizationHeader: held, withdrawalCount: epoch },
    });
    expect(claim._tag).toBe("Withdrawn");
  }),
);

it.effect("does not keep credentials of other threads alive", () =>
  Effect.gen(function* () {
    let timestamp = 1_000;
    const registry = yield* makeRegistry(() => timestamp);
    const issued = yield* registry.issue({
      threadId: ThreadId.make("thread-4"),
      providerInstanceId: ProviderInstanceId.make("codex"),
    });
    const token = issued.config.authorizationHeader.replace(/^Bearer\s+/, "");

    timestamp += 99;
    yield* registry.touch(ThreadId.make("thread-unrelated"));
    timestamp += 2;

    expect(yield* registry.resolve(token)).toBeUndefined();
  }),
);
