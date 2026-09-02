import { ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SynchronizedRef from "effect/SynchronizedRef";
import { HttpServer } from "effect/unstable/http";

import * as ServerEnvironment from "../environment/ServerEnvironment.ts";
import * as McpInvocationContext from "./McpInvocationContext.ts";
import * as McpProviderSession from "./McpProviderSession.ts";

export interface McpCredentialRequest {
  readonly threadId: ThreadId;
  readonly providerInstanceId: ProviderInstanceId;
}

export interface McpIssuedCredential {
  readonly config: McpProviderSession.McpProviderSessionConfig;
}

/**
 * Who is asking for a thread's credential, and on what basis.
 *
 * Possession of a bearer is an authority, not an identity: it says only "I am
 * whoever this host last handed this thread's credential to". `withdrawalCount`
 * is what pins it to a point in time — see {@link McpCredentialClaimRequest}.
 */
export type McpCredentialAuthority =
  /** The host preparing a session it owns; no proof of possession is needed. */
  | { readonly _tag: "Host" }
  /**
   * A running driver, presenting the `Authorization` header value it is
   * actually sending. The claim is honoured only if that header is
   * byte-identical to the one the host currently records for the thread, and
   * only while the thread's withdrawal counter still reads `withdrawalCount`.
   */
  | {
      readonly _tag: "Bearer";
      readonly presentedAuthorizationHeader: string;
      readonly withdrawalCount: bigint;
    };

export interface McpCredentialClaimRequest extends McpCredentialRequest {
  /**
   * The `Authorization` header the host records as this thread's current one
   * (`Bearer <token>`, exactly as it was handed over). Offered, never trusted:
   * the transaction reuses it only when the token inside it still hashes to a
   * live record for this exact thread *and* provider instance.
   */
  readonly heldAuthorizationHeader: string | undefined;
  readonly authority: McpCredentialAuthority;
  /**
   * Write the decision into whatever the rest of the host reads — the stored
   * session config, the recorded epoch — from *inside* the transaction that
   * made it.
   *
   * Publishing afterwards is not equivalent, and the difference is not a lost
   * update. Two claims that commit in one order can publish in the other, so a
   * claim that committed before a withdrawal can install its config after the
   * withdrawal and after the next claim, leaving every reader pointed at a
   * credential the registry has already destroyed. Called only for the two
   * outcomes that grant access (`Reused`, `Issued`), exactly once, while no
   * other fiber can run — so it must be synchronous and must not throw.
   */
  readonly publish?: (claim: McpGrantedCredentialClaim) => void;
}

export type McpCredentialClaim =
  /** The held header is still honoured for this scope. Nothing was minted. */
  | { readonly _tag: "Reused"; readonly withdrawalCount: bigint }
  /** A fresh credential replaced every credential the thread had. */
  | {
      readonly _tag: "Issued";
      readonly config: McpProviderSession.McpProviderSessionConfig;
      readonly withdrawalCount: bigint;
    }
  /** The thread's access was withdrawn after the caller's authority began. */
  | { readonly _tag: "Withdrawn" }
  /** The caller presented something this host did not hand this thread. */
  | { readonly _tag: "Unrecognized" };

/** The outcomes that leave the caller holding a usable credential. */
export type McpGrantedCredentialClaim = Extract<
  McpCredentialClaim,
  { readonly _tag: "Reused" | "Issued" }
>;

export interface McpSessionRegistryShape {
  readonly issue: (request: McpCredentialRequest) => Effect.Effect<McpIssuedCredential>;
  /**
   * The whole credential decision for one thread, as one indivisible step.
   *
   * "Is the thread's credential still good, and if not may this caller have a
   * new one?" cannot be answered in pieces. Asking the registry and then acting
   * on the answer leaves a gap a stop, a toggle-off or a second prepare can
   * slip through, and the act that follows the stale answer is the minting of a
   * *valid bearer* — so the gap is an authentication hole, not a lost update.
   * Everything a caller needs therefore comes out of this one transaction:
   *
   * - the exact presented bearer is checked, never "some credential for this
   *   thread", so a duplicate record can never make a revoked bearer look live;
   * - the scope is checked, so a driver on one provider instance is never
   *   answered with a credential minted for another;
   * - the thread's withdrawal counter is checked, so an authority granted
   *   before a stop cannot mint after it;
   * - revoke-and-issue happen together, so no interleaving leaves a thread with
   *   two live credentials or returns one that a racing call already revoked;
   * - the decision is published (`publish`) in the same step it is made, so a
   *   claim that lost the race cannot overwrite the winner's config afterwards.
   *
   * A running agent is handed its bearer once, when its session starts, and
   * there is no channel to push a replacement into it afterwards — which is why
   * reuse exists at all: minting over a live agent orphans the token it keeps
   * sending, and every later `/mcp` call 401s for the rest of the session.
   */
  readonly reuseOrReissue: (
    request: McpCredentialClaimRequest,
  ) => Effect.Effect<McpCredentialClaim>;
  readonly resolve: (
    rawToken: string,
  ) => Effect.Effect<McpInvocationContext.McpInvocationScope | undefined>;
  /**
   * Records a sign of life for every credential bound to `threadId`. Provider
   * turns call this so that a session which is plainly alive keeps its
   * credential even when it goes a long time without touching an MCP tool.
   */
  readonly touch: (threadId: ThreadId) => Effect.Effect<void>;
  /** How many times this thread's access has been withdrawn. */
  readonly withdrawalCount: (threadId: ThreadId) => Effect.Effect<bigint>;
  /**
   * Drop one provider session's credential and withdraw `threadId`'s access.
   *
   * The thread is named rather than derived from the record because the record
   * is exactly what may be missing: once it has expired, the registry no longer
   * knows which thread that session belonged to, and a revoke that bumps
   * nothing leaves the thread's old authority still matching — which is enough
   * for its holder to mint a fresh credential *after* the revoke.
   */
  readonly revokeProviderSession: (
    providerSessionId: string,
    threadId: ThreadId,
  ) => Effect.Effect<void>;
  /**
   * Withdraw a thread's access. `onWithdrawn` runs inside the same transaction,
   * on the same terms as {@link McpCredentialClaimRequest.publish}: it is how
   * the host's own stores are cleared without a window in which a claim that
   * committed earlier can publish into them afterwards.
   */
  readonly revokeThread: (
    threadId: ThreadId,
    onWithdrawn?: () => void,
  ) => Effect.Effect<void>;
  readonly revokeAll: Effect.Effect<void>;
}

export class McpSessionRegistry extends Context.Service<
  McpSessionRegistry,
  McpSessionRegistryShape
>()("t3/mcp/McpSessionRegistry") {}

interface CredentialRecord {
  readonly tokenHash: string;
  readonly scope: McpInvocationContext.McpInvocationScope;
  readonly lastAliveAt: number;
}

interface RegistryState {
  readonly records: ReadonlyMap<string, CredentialRecord>;
  /**
   * How many times each thread's access has been withdrawn — by a stop, by
   * agent browser access being turned off, or by `revokeAll`.
   *
   * It deliberately outlives the records it invalidates. Deleting the records
   * is enough to stop a bearer resolving, but not enough to stop a recovery
   * that read the world *before* the withdrawal from minting a replacement
   * afterwards. This counter is the tombstone that decision is checked
   * against, so it must survive exactly what it is meant to outlast.
   *
   * A `bigint` rather than a `number` because the property it carries is
   * absolute: an authority is retired iff the counter moved. At
   * `Number.MAX_SAFE_INTEGER` an increment stops moving it, and every retired
   * authority silently starts matching again. Unreachable at human lifecycle
   * rates, but "unreachable" is not the guarantee this is here to make.
   */
  readonly withdrawals: ReadonlyMap<ThreadId, bigint>;
  /**
   * Withdrawals that applied to every thread at once — `revokeAll`.
   *
   * Counted separately because `revokeAll` has no thread list to bump. Bumping
   * only the threads it can still see (a live record, or a counter from an
   * earlier withdrawal) would miss exactly the thread whose record expired
   * while its session lived on — the one whose holder is about to ask for a
   * replacement. Added to every thread's own count, it retires authorities the
   * registry has forgotten the existence of.
   */
  readonly globalWithdrawals: bigint;
}

/** How many times this thread's access has been withdrawn, by any route. */
const epochOf = (state: RegistryState, threadId: ThreadId): bigint =>
  state.globalWithdrawals + (state.withdrawals.get(threadId) ?? 0n);

export interface McpSessionRegistryOptions {
  readonly livenessWindowMs?: number;
  readonly now?: () => number;
}

/**
 * How long a credential outlives the last sign of life from its provider
 * session.
 *
 * Liveness is refreshed both by MCP traffic and by `touch` on every provider
 * turn, so a session that is still doing work never expires no matter how long
 * it goes between browser tool calls. This window therefore only bounds
 * credentials whose session died without a clean stop — the normal paths
 * (`stopSession`, `stopAll`) revoke eagerly and do not wait for it.
 *
 * The bound matters because `/mcp` is mounted outside the environment auth
 * stack and is reachable on whatever host the server binds to, so this token is
 * the only thing guarding the preview toolkit on a remote-reachable server.
 */
const DEFAULT_LIVENESS_WINDOW_MS = 24 * 60 * 60 * 1_000;

const bytesToHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

const tokenFromBytes = (bytes: Uint8Array): string => Buffer.from(bytes).toString("base64url");

/**
 * The raw token inside an `Authorization` header, extracted exactly as the
 * `/mcp` middleware extracts it — so "would this header resolve?" and "does
 * this header resolve?" can never disagree.
 */
const rawTokenFromAuthorizationHeader = (header: string): string =>
  header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";

const getHttpMcpEndpointHost = (hostname: string): string => {
  const normalized = hostname.toLowerCase();
  const endpointHostname =
    normalized === "0.0.0.0" || normalized === "::" || normalized === "[::]"
      ? "127.0.0.1"
      : hostname;
  return endpointHostname.includes(":") && !endpointHostname.startsWith("[")
    ? `[${endpointHostname}]`
    : endpointHostname;
};

const makeWithOptions = Effect.fn("McpSessionRegistry.make")(function* (
  options: McpSessionRegistryOptions = {},
) {
  const crypto = yield* Crypto.Crypto;
  const environment = yield* ServerEnvironment.ServerEnvironment;
  const environmentId = yield* environment.getEnvironmentId;
  const httpServer = yield* HttpServer.HttpServer;
  const state = yield* SynchronizedRef.make<RegistryState>({
    records: new Map(),
    withdrawals: new Map(),
    globalWithdrawals: 0n,
  });
  const currentTimeMillis = options.now ? Effect.sync(options.now) : Clock.currentTimeMillis;
  const livenessWindowMs = options.livenessWindowMs ?? DEFAULT_LIVENESS_WINDOW_MS;
  const endpoint =
    httpServer.address._tag === "TcpAddress"
      ? `http://${getHttpMcpEndpointHost(httpServer.address.hostname)}:${httpServer.address.port}/mcp`
      : "http://127.0.0.1/mcp";

  const hashToken = (token: string) =>
    crypto
      .digest("SHA-256", new TextEncoder().encode(token))
      .pipe(Effect.map(bytesToHex), Effect.orDie);

  const pruneDead = (records: ReadonlyMap<string, CredentialRecord>, timestamp: number) => {
    const next = new Map(
      Array.from(records).filter(
        ([, record]) => timestamp - record.lastAliveAt <= livenessWindowMs,
      ),
    );
    return next.size === records.size ? records : next;
  };

  /**
   * A credential the transaction below may or may not decide to install.
   *
   * Minting is effectful (random bytes, a UUID, a digest) and the transaction
   * must not be, so the material is always prepared up front and discarded
   * unused when the thread turns out to have a credential worth keeping. The
   * cost is one wasted digest per reuse; the gain is that the decision itself
   * contains no yield point at which the state it just read could move.
   */
  const mintCandidate = Effect.fn("McpSessionRegistry.mintCandidate")(function* (
    request: McpCredentialRequest,
    issuedAt: number,
  ) {
    const providerSessionId = yield* crypto.randomUUIDv4.pipe(Effect.orDie);
    const rawToken = yield* crypto.randomBytes(32).pipe(Effect.map(tokenFromBytes), Effect.orDie);
    const tokenHash = yield* hashToken(rawToken);
    const scope: McpInvocationContext.McpInvocationScope = {
      environmentId,
      threadId: ThreadId.make(request.threadId),
      providerSessionId,
      providerInstanceId: ProviderInstanceId.make(request.providerInstanceId),
      capabilities: new Set(["preview"]),
      issuedAt,
    };
    return {
      record: { tokenHash, scope, lastAliveAt: issuedAt } satisfies CredentialRecord,
      config: {
        environmentId,
        threadId: scope.threadId,
        providerSessionId,
        providerInstanceId: scope.providerInstanceId,
        endpoint,
        authorizationHeader: `Bearer ${rawToken}`,
      } satisfies McpProviderSession.McpProviderSessionConfig,
    };
  });

  const reuseOrReissue: McpSessionRegistryShape["reuseOrReissue"] = Effect.fn(
    "McpSessionRegistry.reuseOrReissue",
  )(function* (request) {
    const timestamp = yield* currentTimeMillis;
    const heldRawToken =
      request.heldAuthorizationHeader === undefined
        ? undefined
        : rawTokenFromAuthorizationHeader(request.heldAuthorizationHeader);
    const heldHash =
      heldRawToken === undefined || heldRawToken.length === 0
        ? undefined
        : yield* hashToken(heldRawToken);
    const minted = yield* mintCandidate(request, timestamp);
    // Everything effectful is now done. What follows is a single synchronous
    // read-modify-write under the ref's permit: there is no instant between
    // reading the state and writing it at which another fiber can run, so no
    // outcome below is based on state that has already moved on.
    return yield* SynchronizedRef.modify(
      state,
      (previous): readonly [McpCredentialClaim, RegistryState] => {
        const { records, withdrawals } = previous;
        const current = pruneDead(records, timestamp);
        const withdrawalCount = epochOf(previous, request.threadId);
        const unchanged = { ...previous, records: current } as const;
        /**
         * A grant is not committed until the rest of the host can see it, so
         * the write happens here rather than in the caller's next step. Both
         * halves are then one indivisible act: there is no instant at which
         * this decision has been made but an older one is still on display.
         */
        const granted = (claim: McpGrantedCredentialClaim): McpCredentialClaim => {
          request.publish?.(claim);
          return claim;
        };

        // The caller's authority was granted before a stop / toggle-off. It has
        // been retired, and nothing it says brings the thread's access back.
        if (
          request.authority._tag === "Bearer" &&
          request.authority.withdrawalCount !== withdrawalCount
        ) {
          return [{ _tag: "Withdrawn" }, unchanged];
        }

        // Possession, before any outcome that could depend on it. A driver's
        // only claim is "I am whoever this host last handed this thread's
        // credential to", and the one way to make that claim is to present that
        // exact header. Every branch below is therefore reachable to a driver
        // only for the credential it actually holds — a credential this host
        // issued for a *different* provider instance included, which is why
        // possession of one scope's credential is never convertible into
        // another's.
        if (
          request.authority._tag === "Bearer" &&
          (request.heldAuthorizationHeader === undefined ||
            request.authority.presentedAuthorizationHeader !== request.heldAuthorizationHeader)
        ) {
          return [{ _tag: "Unrecognized" }, unchanged];
        }

        // Reuse is by exact bearer, not by "the thread has something". A record
        // that merely matches thread and instance proves nothing about the
        // token the agent is actually sending.
        const held = heldHash === undefined ? undefined : current.get(heldHash);
        if (
          held !== undefined &&
          heldHash !== undefined &&
          held.scope.threadId === request.threadId &&
          held.scope.providerInstanceId === request.providerInstanceId
        ) {
          const refreshed = new Map(current);
          refreshed.set(heldHash, { ...held, lastAliveAt: timestamp });
          return [
            granted({ _tag: "Reused", withdrawalCount }),
            { ...previous, records: refreshed },
          ];
        }

        // The held credential is dead, so this is a mint. The host may always
        // mint for a thread it owns. A driver may not mint over a credential
        // the thread already has: that orphaning is the exact harm this
        // mechanism exists to prevent, and it is what lets two concurrent
        // recoveries both come back "ok" with one of the two bearers already
        // dead. The same thread-and-instance match that is far too weak as a
        // reason to *grant* reuse is exactly right as a reason to refuse.
        if (
          request.authority._tag === "Bearer" &&
          Array.from(current.values()).some(
            (record) =>
              record.scope.threadId === request.threadId &&
              record.scope.providerInstanceId === request.providerInstanceId,
          )
        ) {
          return [{ _tag: "Unrecognized" }, unchanged];
        }

        // Revoke and issue as one step. Split in two, two concurrent callers
        // interleave into "both revoked, both issued" (two live credentials for
        // one thread) or "issued, then revoked by the other" (an answer
        // carrying an already-dead bearer).
        const next = new Map(
          Array.from(current).filter(([, record]) => record.scope.threadId !== request.threadId),
        );
        next.set(minted.record.tokenHash, minted.record);
        return [
          granted({ _tag: "Issued", config: minted.config, withdrawalCount }),
          { ...previous, records: next },
        ];
      },
    );
  });

  const issue: McpSessionRegistryShape["issue"] = Effect.fn("McpSessionRegistry.issue")(
    function* (request) {
      // No held token and host authority: the transaction has exactly one
      // reachable outcome, an unconditional replacing mint.
      const claim = yield* reuseOrReissue({
        ...request,
        heldAuthorizationHeader: undefined,
        authority: { _tag: "Host" },
      });
      if (claim._tag !== "Issued") {
        return yield* Effect.die(`McpSessionRegistry.issue did not mint: ${claim._tag}`);
      }
      return { config: claim.config };
    },
  );

  const resolve: McpSessionRegistryShape["resolve"] = Effect.fn("McpSessionRegistry.resolve")(
    function* (rawToken) {
      if (rawToken.length === 0) return undefined;
      const tokenHash = yield* hashToken(rawToken);
      const timestamp = yield* currentTimeMillis;
      return yield* SynchronizedRef.modify(state, (previous) => {
        const current = pruneDead(previous.records, timestamp);
        const record = current.get(tokenHash);
        if (!record) return [undefined, { ...previous, records: current }] as const;
        const next = new Map(current);
        next.set(tokenHash, { ...record, lastAliveAt: timestamp });
        return [record.scope, { ...previous, records: next }] as const;
      });
    },
  );

  const touch: McpSessionRegistryShape["touch"] = Effect.fn("McpSessionRegistry.touch")(
    function* (threadId) {
      const timestamp = yield* currentTimeMillis;
      yield* SynchronizedRef.update(state, (previous) => {
        const current = pruneDead(previous.records, timestamp);
        const next = new Map(current);
        for (const [tokenHash, record] of current) {
          if (record.scope.threadId === threadId) {
            next.set(tokenHash, { ...record, lastAliveAt: timestamp });
          }
        }
        return { ...previous, records: next };
      });
    },
  );

  const withdrawalCount: McpSessionRegistryShape["withdrawalCount"] = (threadId) =>
    SynchronizedRef.modify(state, (previous) => [epochOf(previous, threadId), previous] as const);

  const bumpWithdrawals = (
    withdrawals: ReadonlyMap<ThreadId, bigint>,
    threadIds: Iterable<ThreadId>,
  ): ReadonlyMap<ThreadId, bigint> => {
    const next = new Map(withdrawals);
    for (const threadId of new Set(threadIds)) {
      next.set(threadId, (next.get(threadId) ?? 0n) + 1n);
    }
    return next;
  };

  /**
   * Drop matching records and retire every authority the affected threads had
   * handed out.
   *
   * `alsoWithdraw` names the threads whose counter must move whether or not a
   * record matched, and every caller has to name its thread there. Bumping only
   * the threads *discovered from records* is the same bug in a different place:
   * a withdrawal arriving after the record expired would delete nothing, bump
   * nothing, and leave the old authority still matching — so the holder of a
   * bearer the host has just revoked can mint a working replacement.
   *
   * `onWithdrawn` runs inside the same transaction, for the same reason
   * `publish` does: the host's stores and the registry's must not be able to
   * disagree in between.
   */
  const withdrawWhere = (
    predicate: (record: CredentialRecord) => boolean,
    alsoWithdraw: readonly ThreadId[],
    onWithdrawn?: () => void,
  ) =>
    SynchronizedRef.update(state, (previous) => {
      const { records, withdrawals } = previous;
      const next = {
        ...previous,
        records: new Map(Array.from(records).filter(([, record]) => !predicate(record))),
        withdrawals: bumpWithdrawals(withdrawals, [
          ...alsoWithdraw,
          ...Array.from(records.values())
            .filter(predicate)
            .map((record) => record.scope.threadId),
        ]),
      };
      onWithdrawn?.();
      return next;
    });

  return McpSessionRegistry.of({
    issue,
    reuseOrReissue,
    resolve,
    touch,
    withdrawalCount,
    revokeProviderSession: Effect.fn("McpSessionRegistry.revokeProviderSession")(
      function* (providerSessionId, threadId) {
        yield* withdrawWhere(
          (record) => record.scope.providerSessionId === providerSessionId,
          [threadId],
        );
      },
    ),
    revokeThread: Effect.fn("McpSessionRegistry.revokeThread")(function* (threadId, onWithdrawn) {
      yield* withdrawWhere((record) => record.scope.threadId === threadId, [threadId], onWithdrawn);
    }),
    // One counter for all of them, rather than one bump per thread the
    // registry happens to still know about. Enumerating live records and
    // existing counters misses the thread whose record expired while its
    // session lived on, and that is the thread whose holder is about to ask
    // for a replacement.
    revokeAll: SynchronizedRef.update(state, (previous) => ({
      ...previous,
      records: new Map(),
      globalWithdrawals: previous.globalWithdrawals + 1n,
    })),
  });
});

let activeMcpSessionRegistry: McpSessionRegistryShape | undefined;

const make = Effect.acquireRelease(
  makeWithOptions().pipe(
    Effect.tap((registry) =>
      Effect.sync(() => {
        activeMcpSessionRegistry = registry;
      }),
    ),
  ),
  (registry) =>
    Effect.sync(() => {
      if (activeMcpSessionRegistry === registry) {
        activeMcpSessionRegistry = undefined;
      }
    }),
);

export const layer = Layer.effect(McpSessionRegistry, make);

/**
 * Settle a thread's credential against the running registry in one step.
 *
 * `undefined` when no registry is mounted, which is the only honest answer:
 * nothing can be issued and nothing anyone holds can be resolved.
 */
export const claimActiveMcpCredential = (
  request: McpCredentialClaimRequest,
): Effect.Effect<McpCredentialClaim | undefined> =>
  activeMcpSessionRegistry
    ? activeMcpSessionRegistry.reuseOrReissue(request)
    : Effect.sync((): McpCredentialClaim | undefined => undefined);

/**
 * Refreshes the liveness of a thread's MCP credential. Called on every provider
 * turn so an active session is never mistaken for an abandoned one.
 */
export const touchActiveMcpThread = (threadId: ThreadId): Effect.Effect<void> =>
  activeMcpSessionRegistry ? activeMcpSessionRegistry.touch(threadId) : Effect.void;

/**
 * Withdraw a thread's access against the running registry.
 *
 * With no registry mounted there is nothing to revoke, but `onWithdrawn` still
 * runs: the host's own stores have to be cleared either way, and a caller that
 * relied on the transaction to do it would otherwise silently skip it.
 */
export const revokeActiveMcpThread = (
  threadId: ThreadId,
  onWithdrawn?: () => void,
): Effect.Effect<void> =>
  activeMcpSessionRegistry
    ? activeMcpSessionRegistry.revokeThread(threadId, onWithdrawn)
    : Effect.sync(() => onWithdrawn?.());

export const revokeAllActiveMcpCredentials = (): Effect.Effect<void> =>
  activeMcpSessionRegistry ? activeMcpSessionRegistry.revokeAll : Effect.void;

/** Exposed for tests. */
export const __testing = {
  make: makeWithOptions,
};
