/**
 * ProviderServiceLive - Cross-provider orchestration layer.
 *
 * Routes validated transport/API calls to provider adapters through
 * `ProviderAdapterRegistry` and `ProviderSessionDirectory`, and exposes a
 * unified provider event stream for subscribers.
 *
 * It does not implement provider protocol details (adapter concern).
 *
 * @module ProviderServiceLive
 */
import {
  EventId,
  ModelSelection,
  NonNegativeInt,
  ThreadId,
  TurnId,
  ProviderInterruptTurnInput,
  ProviderRespondToRequestInput,
  ProviderRespondToUserInputInput,
  ProviderSendTurnInput,
  ProviderSessionStartInput,
  ProviderStopSessionInput,
  ProviderUploadFeedbackInput,
  type ProviderInstanceId,
  type ProviderDriverKind,
  type ProviderRuntimeEvent,
  type ProviderSession,
} from "@t3tools/contracts";
import { randomUUID as nodeRandomUUID } from "node:crypto";
import { causeErrorTag } from "@t3tools/shared/observability";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as PubSub from "effect/PubSub";
import * as Ref from "effect/Ref";
import * as Scope from "effect/Scope";
import * as Semaphore from "effect/Semaphore";
import * as Schema from "effect/Schema";
import * as SchemaIssue from "effect/SchemaIssue";
import * as Stream from "effect/Stream";

import { resolveAttachmentPath } from "../../attachmentStore.ts";
import * as ServerConfig from "../../config.ts";
import {
  increment,
  providerMetricAttributes,
  providerRuntimeEventsTotal,
  providerSessionsTotal,
  providerTurnDuration,
  providerTurnsTotal,
  providerTurnMetricAttributes,
  withMetrics,
} from "../../observability/Metrics.ts";
import { type ProviderAdapterError, ProviderValidationError } from "../Errors.ts";
import type { ProviderAdapterShape } from "../Services/ProviderAdapter.ts";
import * as ProviderAdapterRegistry from "../Services/ProviderAdapterRegistry.ts";
import * as ProviderService from "../Services/ProviderService.ts";
import * as ProviderSessionDirectory from "../Services/ProviderSessionDirectory.ts";
import { type EventNdjsonLogger } from "./EventNdjsonLogger.ts";
import * as ProviderEventLoggers from "./ProviderEventLoggers.ts";
import * as AnalyticsService from "../../telemetry/AnalyticsService.ts";
import * as McpProviderSession from "../../mcp/McpProviderSession.ts";
import * as McpSessionRegistry from "../../mcp/McpSessionRegistry.ts";
import * as McpCredentialContinuity from "../../t3team-mcp-credentialContinuity.ts";
import * as ServerSettings from "../../serverSettings.ts";
const isModelSelection = Schema.is(ModelSelection);

/**
 * Turn inactivity watchdog (GHE #113) — host-level, provider-agnostic
 * stuck-turn protection.
 *
 * The pack-level watchdog in the Nexplore distribution only covers Pi
 * sessions; a silently-dead stream from any other provider (OpenCode,
 * Codex, ...) would otherwise hang the turn forever. The host arms a
 * budget whenever a turn is sent, resets it on EVERY runtime event the
 * adapter's `streamEvents` emits for that thread (any event type proves
 * the provider is alive), and aborts the turn through the
 * provider-agnostic `interruptTurn` when the budget expires. The
 * per-instance budget comes from
 * `ProviderInstanceConfig.turnInactivityTimeoutSeconds`; the default
 * matches the pack-level watchdog default (600s).
 */
const DEFAULT_TURN_INACTIVITY_TIMEOUT_MS = 600_000;

/**
 * Announced-retry backoff budgeting (GHE #306 addendum).
 *
 * Drivers that retry transient gateway errors announce each backoff sleep
 * as a `runtime.warning` with `detail { code: "provider.retry", delayMs }`
 * (the Nexplore Pi driver does this for its ~9h 14-attempt exponential
 * episode). The host re-arms the PLAIN budget from that announcement today,
 * which fires mid-sleep once a backoff wait outgrows the budget (Pi's
 * attempt 11 waits 1024s > the 600s default) and kills a legitimately
 * running retry episode — the GHE #306 incident. Arm
 * `max(normal budget, announced delay + slack)` instead: the sleep plus the
 * next request's own runtime. Capped, so a buggy announcement cannot
 * disable the backstop indefinitely.
 */
const RETRY_ANNOUNCE_SLACK_MS = 120_000;
const MAX_RETRY_ANNOUNCE_BUDGET_MS = 24 * 60 * 60 * 1000;

/**
 * How long an operation may hold its thread's runtime permit while waiting on
 * the provider.
 *
 * These four all run inside the permit and reach the provider over a transport
 * that applies no deadline of its own. Neither client bounds them, and one of
 * them opts out explicitly:
 *
 * - Codex's `client.request` is `Deferred.await(deferred)` with an interrupt
 *   cleanup and nothing else (`effect-codex-app-server/src/protocol.ts:403`),
 *   so it waits for a JSON-RPC answer forever. The 3s/10s timeouts nearby in
 *   `CodexSessionRuntime` are call-site bounds on `turn/interrupt`, not on
 *   these.
 * - OpenCode's SDK installs a fetch that sets `req.timeout = false` when the
 *   caller supplies none, and we supply none — the absence of a bound there is
 *   deliberate on the SDK's part, not an oversight to inherit.
 *
 * While the permit is held, every later start, stop, interrupt, turn, response
 * and rollback on that thread queues behind it, and the inactivity watchdog can
 * only skip its one firing. A provider that stops answering would wedge the
 * thread for the life of the process. So the bound is applied host-side, here,
 * rather than by moving the call out of the permit — outside it the operation
 * would be routed against one runtime and delivered to another.
 *
 * Every number below is a judgement, not a measurement, and they differ because
 * the calls do. Guessing low costs a retryable failure; guessing high costs a
 * thread nobody can use.
 */
/** An approval reply: a user clicked a button. Local for three adapters, one HTTP round trip for OpenCode. */
const APPROVAL_REPLY_TIMEOUT_MS = 15_000;
/** A user-input reply: same shape and urgency as an approval. */
const USER_INPUT_REPLY_TIMEOUT_MS = 15_000;
/** A rollback: Codex one RPC, OpenCode a message list plus a revert, so heavier. */
const ROLLBACK_TIMEOUT_MS = 30_000;
/** A feedback upload: the least urgent thing the host does, and the only one that ships a payload. */
const FEEDBACK_UPLOAD_TIMEOUT_MS = 60_000;

/**
 * The effective watchdog budget when the event is an announced retry
 * backoff; undefined for every other event (plain re-arm).
 */
const announcedRetryBudgetMs = (event: ProviderRuntimeEvent): number | undefined => {
  if (event.type !== "runtime.warning") return undefined;
  const detail = (event.payload as { detail?: unknown } | null | undefined)?.detail;
  const announced = detail as { code?: unknown; delayMs?: unknown } | null | undefined;
  if (announced?.code !== "provider.retry") return undefined;
  const delayMs = announced.delayMs;
  if (typeof delayMs === "number" && Number.isFinite(delayMs) && delayMs > 0) {
    return Math.min(delayMs + RETRY_ANNOUNCE_SLACK_MS, MAX_RETRY_ANNOUNCE_BUDGET_MS);
  }
  return undefined;
};

interface TurnWatchdogEntry {
  readonly turnId: TurnId;
  readonly instanceId: ProviderInstanceId;
  readonly provider: ProviderDriverKind;
  readonly timeoutMs: number;
  readonly timerFiber: Fiber.Fiber<unknown, never>;
}

/**
 * Hook for tests that want to override the canonical event logger pulled
 * from `ProviderEventLoggers`. Production wiring leaves this undefined and
 * reads the logger off the tag.
 */
export interface ProviderServiceLiveOptions {
  readonly canonicalEventLogger?: EventNdjsonLogger;
  /**
   * Overrides MCP credential issuance. The real issuer reads a module-global
   * registry that only a running MCP server installs, which makes the
   * agent-browser-access gate unobservable from a unit test; this seam lets a
   * test see whether a credential was requested at all.
   */
  readonly issueMcpCredential?: typeof McpCredentialContinuity.claimThreadMcpCredential;
  /** Same seam as `issueMcpCredential`, for observing the deny path's revoke. */
  readonly revokeMcpCredential?: typeof McpSessionRegistry.revokeActiveMcpThread;
}

type ProviderServiceMethod<Name extends keyof ProviderService.ProviderService["Service"]> =
  ProviderService.ProviderService["Service"][Name];

const ProviderRollbackConversationInput = Schema.Struct({
  threadId: ThreadId,
  numTurns: NonNegativeInt,
});

/**
 * What the user is told when a thread's agent is gone and the operation they
 * asked for cannot be served by starting a new one.
 *
 * Written for the person who pressed the button, not for a log reader: no
 * binding, no resume cursor, no thread id. Each says what is true and what
 * they can do about it, and neither offers advice that does not follow from
 * what they were trying to do.
 */
const UNRESUMABLE_THREAD_REFUSAL =
  "This thread's agent is no longer running, and it cannot be picked up where it left off. Send a message to start it again.";

/**
 * The same state, for someone who was answering the agent rather than driving
 * it. Failing is deliberate: they believe they just replied to something, and
 * accepting an answer nobody is waiting for would be worse than saying so.
 */
const UNANSWERABLE_REQUEST_REFUSAL =
  "The agent that asked this is no longer running, so your answer could not be delivered and nothing is waiting on it. Send a message to start the agent again.";

function toValidationError(
  operation: string,
  issue: string,
  cause?: unknown,
): ProviderValidationError {
  return new ProviderValidationError({
    operation,
    issue,
    ...(cause !== undefined ? { cause } : {}),
  });
}

/**
 * Bound a provider call that runs while its thread's runtime permit is held.
 *
 * What the timeout actually does is interrupt the *local* wait. It does not
 * reach the provider, and it establishes nothing about whether the provider
 * received the request, acted on it, or is about to answer late. Saying "this
 * did not happen" would therefore be a guess, and for a mutating operation a
 * dangerous one: telling a user their rollback failed, when the provider went
 * on to complete it, invites a retry that rolls back twice.
 *
 * So the wording separates the two, and each caller supplies its own
 * consequence sentence — read-only operations can safely invite a retry,
 * mutating ones must not.
 */
const withProviderDeadline = <A, E, R>(
  call: Effect.Effect<A, E, R>,
  options: {
    readonly operation: string;
    readonly timeoutMs: number;
    /** What is now unknown, and what the user should do. Not "it did not happen". */
    readonly consequence: string;
  },
): Effect.Effect<A, E | ProviderValidationError, R> =>
  call.pipe(
    Effect.timeoutOrElse({
      duration: Duration.millis(options.timeoutMs),
      orElse: () =>
        toValidationError(
          options.operation,
          `The provider stopped answering, so this request was given up on. It may still have been carried out — ${options.consequence}`,
        ),
    }),
  );

const decodeInputOrValidationError = <S extends Schema.Top>(input: {
  readonly operation: string;
  readonly schema: S;
  readonly payload: unknown;
}) => {
  const decodeProviderRequestInput = Schema.decodeUnknownEffect(input.schema);
  return decodeProviderRequestInput(input.payload).pipe(
    Effect.mapError(
      (schemaError) =>
        new ProviderValidationError({
          operation: input.operation,
          issue: SchemaIssue.makeFormatterDefault()(schemaError.issue),
          cause: schemaError,
        }),
    ),
  );
};

function toRuntimeStatus(session: ProviderSession): "starting" | "running" | "stopped" | "error" {
  switch (session.status) {
    case "connecting":
      return "starting";
    case "error":
      return "error";
    case "closed":
      return "stopped";
    case "ready":
    case "running":
    default:
      return "running";
  }
}

function toRuntimePayloadFromSession(
  session: ProviderSession,
  extra?: {
    readonly modelSelection?: unknown;
    readonly lastRuntimeEvent?: string;
    readonly lastRuntimeEventAt?: string;
  },
): Record<string, unknown> {
  return {
    cwd: session.cwd ?? null,
    model: session.model ?? null,
    activeTurnId: session.activeTurnId ?? null,
    lastError: session.lastError ?? null,
    ...(extra?.modelSelection !== undefined ? { modelSelection: extra.modelSelection } : {}),
    ...(extra?.lastRuntimeEvent !== undefined ? { lastRuntimeEvent: extra.lastRuntimeEvent } : {}),
    ...(extra?.lastRuntimeEventAt !== undefined
      ? { lastRuntimeEventAt: extra.lastRuntimeEventAt }
      : {}),
  };
}

function readPersistedModelSelection(
  runtimePayload: ProviderSessionDirectory.ProviderRuntimeBinding["runtimePayload"],
): ModelSelection | undefined {
  if (!runtimePayload || typeof runtimePayload !== "object" || Array.isArray(runtimePayload)) {
    return undefined;
  }
  const raw = "modelSelection" in runtimePayload ? runtimePayload.modelSelection : undefined;
  return isModelSelection(raw) ? raw : undefined;
}

function readPersistedCwd(
  runtimePayload: ProviderSessionDirectory.ProviderRuntimeBinding["runtimePayload"],
): string | undefined {
  if (!runtimePayload || typeof runtimePayload !== "object" || Array.isArray(runtimePayload)) {
    return undefined;
  }
  const rawCwd = "cwd" in runtimePayload ? runtimePayload.cwd : undefined;
  if (typeof rawCwd !== "string") return undefined;
  const trimmed = rawCwd.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

const dieOnMissingBindingInstanceId = (
  operation: string,
  payload: {
    readonly providerInstanceId?: ProviderInstanceId | undefined;
    readonly provider?: ProviderDriverKind | undefined;
  },
): ProviderInstanceId => {
  if (payload.providerInstanceId !== undefined) {
    return payload.providerInstanceId;
  }
  throw new Error(
    payload.provider
      ? `${operation}: provider instance id is required for provider '${payload.provider}'.`
      : `${operation}: provider instance id is required.`,
  );
};

const correlateRuntimeEventWithInstance = (
  source: {
    readonly instanceId: ProviderInstanceId;
    readonly provider: ProviderDriverKind;
  },
  event: ProviderRuntimeEvent,
): ProviderRuntimeEvent => {
  if (event.provider !== source.provider) {
    throw new Error(
      `ProviderService.streamEvents: provider instance '${source.instanceId}' is backed by driver '${source.provider}' but emitted driver '${event.provider}'.`,
    );
  }
  if (event.providerInstanceId !== undefined && event.providerInstanceId !== source.instanceId) {
    throw new Error(
      `ProviderService.streamEvents: provider instance '${source.instanceId}' emitted event for instance '${event.providerInstanceId}'.`,
    );
  }
  return { ...event, providerInstanceId: source.instanceId };
};

const makeProviderService = Effect.fn("makeProviderService")(function* (
  options?: ProviderServiceLiveOptions,
) {
  const analytics = yield* Effect.service(AnalyticsService.AnalyticsService);
  const serverConfig = yield* ServerConfig.ServerConfig;
  const eventLoggers = yield* ProviderEventLoggers.ProviderEventLoggers;
  // Options-provided logger wins (test overrides); otherwise we take whatever
  // the `ProviderEventLoggers` tag exposes — `undefined` means "no canonical
  // log writer is attached", which downstream code already handles as a
  // no-op.
  const canonicalEventLogger = options?.canonicalEventLogger ?? eventLoggers.canonical;

  const registry = yield* ProviderAdapterRegistry.ProviderAdapterRegistry;
  const directory = yield* ProviderSessionDirectory.ProviderSessionDirectory;
  const serverSettings = yield* ServerSettings.ServerSettingsService;
  const issueMcpCredential =
    options?.issueMcpCredential ?? McpCredentialContinuity.claimThreadMcpCredential;
  const revokeMcpCredential =
    options?.revokeMcpCredential ?? McpSessionRegistry.revokeActiveMcpThread;
  const runtimeEventPubSub = yield* PubSub.unbounded<ProviderRuntimeEvent>();
  const nowIso = Effect.map(DateTime.now, DateTime.formatIso);
  /**
   * Attach the `t3-code` MCP server to the session that is about to start.
   *
   * This is the only place a session's credential is established, so
   * withholding one here is what disables agent browser access everywhere:
   * every adapter already treats a missing session as "no MCP server", and the
   * `/mcp` endpoint accepts nothing but tokens issued from this path. The
   * policy itself lives in `t3team-mcp-credentialContinuity.ts`.
   */
  /**
   * Deny on an unreadable settings file rather than letting the read failure
   * escape: adding `ServerSettingsError` to `ProviderServiceError` would widen
   * a union every caller handles, for a branch that only decides whether one
   * optional toolset is attached. Denying is the safe direction — an explicit
   * "off" silently becoming "on" would violate the user's stated choice,
   * whereas the reverse costs an agent one toolset and is visible immediately.
   */
  const agentBrowserAccessEnabled = serverSettings.getSettings.pipe(
    Effect.map((settings) => settings.enableAgentBrowserAccess),
    Effect.catch((cause) =>
      Effect.logWarning(
        "Could not read server settings; withholding agent browser access for this session.",
        { cause },
      ).pipe(Effect.as(false)),
    ),
  );

  const prepareMcpSession = (threadId: ThreadId, providerInstanceId: ProviderInstanceId) =>
    McpCredentialContinuity.prepareThreadMcpSession({
      threadId,
      providerInstanceId,
      browserAccessEnabled: agentBrowserAccessEnabled,
      claimMcpCredential: issueMcpCredential,
      revokeMcpCredential,
    });
  const clearMcpSession = (threadId: ThreadId) =>
    McpCredentialContinuity.withdrawThreadMcpSession(threadId);

  const publishRuntimeEvent = (event: ProviderRuntimeEvent): Effect.Effect<void> =>
    Effect.succeed(event).pipe(
      Effect.tap((canonicalEvent) =>
        canonicalEventLogger
          ? canonicalEventLogger.write(canonicalEvent, canonicalEvent.threadId)
          : Effect.void,
      ),
      Effect.flatMap((canonicalEvent) => PubSub.publish(runtimeEventPubSub, canonicalEvent)),
      Effect.asVoid,
    );

  // --- Turn inactivity watchdog (GHE #113) ---------------------------------
  // One armed entry per thread that has an in-flight turn. Timer fibers are
  // attached to the service scope (captured below): closing the service
  // interrupts pending timers, and `runStopAll` (the service finalizer)
  // clears the map.
  const serviceScope = yield* Scope.Scope;
  const turnWatchdogs = yield* Ref.make(new Map<ThreadId, TurnWatchdogEntry>());

  // --- What has happened to a thread since an operation looked at it -------
  //
  // `sendTurn` releases the permit for the dispatch, because on Cursor and
  // Grok the dispatch *is* the whole turn and holding it there would make a
  // running agent unstoppable. It retakes the permit afterwards to write the
  // bookkeeping that outlives the call. Those writes cannot be unconditional:
  // in the gap, an interrupt can abort the very turn being written about, and
  // a stop plus a start can replace the runtime the write describes.
  //
  // Both are the same question — "is what I decided against still true?" — so
  // one counter answers it. Bumped by every event that invalidates a decision
  // taken before it: a session started or recovered, a turn interrupted, a
  // session stopped. An operation records it while holding the permit and
  // re-checks it when it takes the permit back; a change means its conclusions
  // are about a thread that has moved on, and it writes nothing.
  //
  // A generation, which earlier rounds declined to add for the marker and for
  // the watchdog because neither had a demonstrated need. This one does: the
  // aborted-turn watchdog and the binding written over a replacement are both
  // reachable without it.
  const threadLifecycleEpochs = yield* Ref.make(new Map<ThreadId, number>());

  const readThreadLifecycleEpoch = (threadId: ThreadId): Effect.Effect<number> =>
    Ref.get(threadLifecycleEpochs).pipe(Effect.map((epochs) => epochs.get(threadId) ?? 0));

  const bumpThreadLifecycleEpoch = (threadId: ThreadId): Effect.Effect<void> =>
    Ref.update(threadLifecycleEpochs, (epochs) =>
      new Map(epochs).set(threadId, (epochs.get(threadId) ?? 0) + 1),
    );

  // --- Runtimes that outlived a shutdown -----------------------------------
  //
  // A stop withdraws the thread's MCP credential before it asks the adapter to
  // shut the runtime down, because the reverse order can leave a torn-down (or
  // half torn-down) runtime holding a bearer that still resolves. The price of
  // that order is this set: when the adapter's shutdown fails, the runtime can
  // still be alive, and it is now holding a credential the registry threw away.
  //
  // No ordering fixes both halves. Whichever way round they go, a failed stop
  // ends with either a live credential or a live runtime that has lost one, so
  // the second half has to be fixed here rather than by resequencing. Such a
  // runtime is not routable: its credential is minted once at spawn and cannot
  // be rotated into it (`sendTurn` can only `touch` a record that still
  // exists), and its recovery hook was retired by the same withdrawal. Sending
  // turns into it is exactly what turns one failed stop into a session that
  // 401s for the rest of its life. So it is replaced on next use, not reused.
  //
  // In memory on purpose: it describes runtimes belonging to *this* process,
  // and the credential registry it is paired with is in memory too.
  const orphanedRuntimes = yield* Ref.make(new Set<ThreadId>());

  const markRuntimeOrphaned = (threadIds: Iterable<ThreadId>): Effect.Effect<void> =>
    Ref.update(orphanedRuntimes, (previous) => new Set([...previous, ...threadIds]));

  const clearOrphanedRuntime = (threadId: ThreadId): Effect.Effect<void> =>
    Ref.update(orphanedRuntimes, (previous) => {
      if (!previous.has(threadId)) return previous;
      const next = new Set(previous);
      next.delete(threadId);
      return next;
    });

  const isRuntimeOrphaned = (threadId: ThreadId): Effect.Effect<boolean> =>
    Ref.get(orphanedRuntimes).pipe(Effect.map((previous) => previous.has(threadId)));

  /**
   * Mark a thread orphaned, but only if nothing is operating on it right now.
   *
   * For `stopAll`, whose snapshot of "which threads this adapter had" is taken
   * before the shutdown and used after it. A concurrent start can replace one
   * of those threads and clear its marker in between, and marking from the
   * stale snapshot afterwards would condemn the healthy replacement — the
   * old-generation-writes-after-new-generation shape, arriving on the one path
   * that does not hold the threads' permits.
   *
   * Waiting for the permits instead is not available here: this runs in the
   * service finalizer, and blocking shutdown behind an in-flight operation is
   * worse than skipping a defensive mark. `withPermitsIfAvailable` gives the
   * right rule for free — if someone holds the thread, their operation owns
   * its state and this stale snapshot has no business writing to it.
   */
  const markRuntimeOrphanedIfIdle = (threadIds: Iterable<ThreadId>): Effect.Effect<void> =>
    Effect.forEach(
      Array.from(new Set(threadIds)),
      (threadId) =>
        runtimeLockFor(threadId).pipe(
          Effect.flatMap((lock) =>
            lock.withPermitsIfAvailable(1)(markRuntimeOrphaned([threadId])),
          ),
        ),
      { discard: true },
    );

  // --- Per-thread serialization of runtime identity -------------------------
  //
  // Withdrawing a credential, shutting a runtime down, starting one, and
  // recording that a shutdown failed are four separate transactions. Making
  // each individually atomic — which they already were — does nothing, because
  // the hole is in the *sequence*: a stop that has withdrawn but not yet
  // called the adapter can be overtaken by a start that publishes a new
  // credential and a new runtime, and the stop then tears that runtime down
  // (the adapter is addressed by thread id, so it cannot tell them apart)
  // while the new credential stays valid. That is the authentication hole this
  // whole mechanism exists to close, reintroduced by concurrency. The same
  // sequence gap is why a `Set<ThreadId>` marker could be cleared by one
  // operation and then set by an older one that had already been superseded.
  //
  // So the unit of exclusion is the thread, and it has to span the adapter
  // call: a lock released before `adapter.stopSession` leaves exactly the
  // window above. One permit per thread, taken by every operation that changes
  // which runtime a thread has or which credential it holds — `startSession`,
  // `stopSession`, recovery. Operations that merely *use* the current runtime
  // (a turn, an interrupt, an answer) do not hold it, so a long-running turn
  // never blocks a stop.
  //
  // Liveness: a hung `adapter.startSession` now blocks a concurrent stop on
  // the same thread rather than letting it run. That removes no working escape
  // hatch — before this, such a stop read `hasSession` as false, because the
  // adapter has not registered the session yet, so it reported nothing to stop
  // and killed nothing — but it does turn a fast useless answer into a wait.
  // Waiting on a permit is interruptible, so a disconnecting client unwinds.
  // Reference-counted so the map does not grow by one entry per thread id for
  // the life of the process. The count is raised *before* the permit is
  // acquired and lowered after it is released, so a thread with anyone holding
  // OR waiting is never evicted — which is the only way eviction could go
  // wrong, by handing the next caller a different semaphore and excluding
  // nobody.
  interface RuntimeLockEntry {
    readonly lock: Semaphore.Semaphore;
    readonly users: number;
  }
  const runtimeLocks = yield* Ref.make(new Map<ThreadId, RuntimeLockEntry>());

  const acquireRuntimeLockEntry = (threadId: ThreadId): Effect.Effect<Semaphore.Semaphore> =>
    Ref.modify(runtimeLocks, (locks) => {
      const existing = locks.get(threadId);
      const next = new Map(locks);
      if (existing) {
        next.set(threadId, { ...existing, users: existing.users + 1 });
        return [existing.lock, next] as const;
      }
      // The same primitive `SynchronizedRef` uses for its own serialization.
      const created = Semaphore.makeUnsafe(1);
      next.set(threadId, { lock: created, users: 1 });
      return [created, next] as const;
    });

  const releaseRuntimeLockEntry = (threadId: ThreadId): Effect.Effect<void> =>
    Ref.update(runtimeLocks, (locks) => {
      const existing = locks.get(threadId);
      if (!existing) return locks;
      const next = new Map(locks);
      if (existing.users <= 1) next.delete(threadId);
      else next.set(threadId, { ...existing, users: existing.users - 1 });
      return next;
    });

  /** The lock for a thread, without registering a user. Callers must not wait on it. */
  const runtimeLockFor = (threadId: ThreadId): Effect.Effect<Semaphore.Semaphore> =>
    Ref.modify(runtimeLocks, (locks) => {
      const existing = locks.get(threadId);
      if (existing) return [existing.lock, locks] as const;
      const created = Semaphore.makeUnsafe(1);
      const next = new Map(locks);
      next.set(threadId, { lock: created, users: 0 });
      return [created, next] as const;
    });

  /**
   * Run `body` with exclusive control of this thread's runtime and credential.
   *
   * Not reentrant — Effect semaphores are not — so anything called inside must
   * be a `*Locked` helper that assumes the permit is held, never the public
   * wrapper that would take it again.
   */
  const withThreadRuntimeLock = <A, E, R>(
    threadId: ThreadId,
    body: Effect.Effect<A, E, R>,
  ): Effect.Effect<A, E, R> =>
    Effect.flatMap(acquireRuntimeLockEntry(threadId), (lock) =>
      lock.withPermit(body).pipe(Effect.ensuring(releaseRuntimeLockEntry(threadId))),
    );

  const resolveTurnInactivityTimeoutMs = (instanceId: ProviderInstanceId): Effect.Effect<number> =>
    registry.getInstanceInfo(instanceId).pipe(
      Effect.map((info) => info.turnInactivityTimeoutSeconds),
      Effect.catch(() => Effect.succeed(undefined as number | undefined)),
      Effect.map((seconds) =>
        typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0
          ? Math.round(seconds * 1000)
          : DEFAULT_TURN_INACTIVITY_TIMEOUT_MS,
      ),
    );

  const clearTurnWatchdog = (threadId: ThreadId): Effect.Effect<void> =>
    Ref.update(turnWatchdogs, (map) => {
      if (!map.has(threadId)) return map;
      const next = new Map(map);
      next.delete(threadId);
      return next;
    });

  const fireTurnWatchdogLocked = Effect.fn("ProviderService.turnWatchdog.fireLocked")(function* (
    threadId: ThreadId,
    turnId: TurnId,
    instanceId: ProviderInstanceId,
    provider: ProviderDriverKind,
    timeoutMs: number,
  ) {
    // Only fire if this exact entry is still armed — a newer turn, a
    // reset, or a settled turn replaced it in the meantime.
    const current = yield* Ref.get(turnWatchdogs);
    if (current.get(threadId)?.turnId !== turnId) return;
    yield* clearTurnWatchdog(threadId);
    const inactivitySeconds = Math.round(timeoutMs / 1000);
    yield* Effect.logWarning("provider.turn.inactivity-watchdog", {
      threadId: String(threadId),
      turnId: String(turnId),
      providerInstanceId: String(instanceId),
      inactivitySeconds,
    });
    // Same observable surface as the pack-level watchdog: a
    // runtime.warning carrying detail.code "turn.inactivity" and the live
    // turnId, so host consumers can tell a watchdog abort apart from a
    // user interrupt.
    yield* publishRuntimeEvent({
      eventId: EventId.make(nodeRandomUUID()),
      provider,
      providerInstanceId: instanceId,
      threadId,
      createdAt: yield* nowIso,
      turnId,
      type: "runtime.warning",
      payload: {
        message: `Turn stalled: no provider stream activity for ${inactivitySeconds} seconds`,
        detail: {
          code: "turn.inactivity",
          inactivitySeconds,
          turnId: String(turnId),
        },
      },
    });
    // Abort through the provider-agnostic interrupt path — whatever the
    // provider does on interrupt (turn.aborted event, session error, ...)
    // is its own concern; the host guarantee is that the turn cannot hang
    // past the budget.
    const adapter = yield* registry
      .getByInstance(instanceId)
      .pipe(Effect.orElseSucceed(() => undefined));
    if (adapter !== undefined) {
      yield* adapter.interruptTurn(threadId, turnId).pipe(
        Effect.catchCause((cause) =>
          Effect.logWarning("provider.turn.inactivity-interrupt-failed", {
            threadId: String(threadId),
            turnId: String(turnId),
            providerInstanceId: String(instanceId),
            cause,
          }),
        ),
      );
    }
  });

  /**
   * Fire the watchdog, but only while nobody else owns this thread.
   *
   * The watchdog picks a turn to abort and then aborts it by thread id, so it
   * has the same identity slip as every other operation: between deciding and
   * acting, the thread's runtime can be replaced, and the abort lands on the
   * replacement. On Claude that is not "aborts the wrong turn" but "closes the
   * wrong session" — `interruptTurn` there ignores the turn id and calls
   * `stopSessionInternal`.
   *
   * Non-blocking on purpose, and this is the one place in the file where that
   * is the *safer* shape rather than the weaker one. `armTurnWatchdog`
   * interrupts the previous timer fiber while holding this same permit (it is
   * called from `sendTurn`, inside the permit), so a watchdog that *waited*
   * for the permit would be a fiber being interrupted by the very fiber whose
   * permit it waits on. That resolves today only because semaphore waits are
   * interruptible — a real dependency on an implementation detail, for a timer
   * that has no business blocking anyone. Never waiting removes the question.
   *
   * What a skipped firing costs, precisely: nothing when the permit-holder is
   * a start or stop, because the turn being watched is going away with the
   * runtime; a lost abort only when an unrelated operation (a slow
   * `uploadFeedback`) happens to span the firing instant while the turn is
   * genuinely stuck. The timer is one-shot and a stuck turn emits no events to
   * re-arm it, so that turn keeps its stall until the user interrupts. A
   * degraded safety net rather than a wrong action — the direction to fail in.
   */
  const fireTurnWatchdog = Effect.fn("ProviderService.turnWatchdog.fire")(function* (
    threadId: ThreadId,
    turnId: TurnId,
    instanceId: ProviderInstanceId,
    provider: ProviderDriverKind,
    timeoutMs: number,
  ) {
    const lock = yield* runtimeLockFor(threadId);
    yield* lock.withPermitsIfAvailable(1)(
      fireTurnWatchdogLocked(threadId, turnId, instanceId, provider, timeoutMs),
    );
  });

  const armTurnWatchdog = Effect.fn("ProviderService.turnWatchdog.arm")(function* (
    threadId: ThreadId,
    turnId: TurnId,
    instanceId: ProviderInstanceId,
    provider: ProviderDriverKind,
    announcedBudgetMs?: number,
    /**
     * Only re-arm a turn that is still the armed one; never create an entry.
     *
     * Set by the stream-event path, which runs without the thread's permit. It
     * reads the current entry, and by the time it reaches the write a start
     * may have replaced the runtime and cleared that entry — so installing
     * unconditionally resurrects a watchdog for a turn that no longer exists
     * and fires it against the replacement. That is precisely the
     * wrong-runtime interruption `startSession`'s clear removes, arriving by
     * another route. The check therefore has to happen in the same
     * synchronous step as the write, not before it.
     *
     * It also closes a second case of the same shape: a stale event for turn
     * T1 arriving after T2 was armed used to install T1 over T2, moving the
     * backstop onto a turn that had already ended.
     */
    reArmOnly?: boolean,
  ) {
    const baseMs = yield* resolveTurnInactivityTimeoutMs(instanceId);
    const timeoutMs =
      announcedBudgetMs !== undefined ? Math.max(baseMs, announcedBudgetMs) : baseMs;
    const timerFiber = yield* Effect.sleep(Duration.millis(timeoutMs)).pipe(
      Effect.andThen(fireTurnWatchdog(threadId, turnId, instanceId, provider, timeoutMs)),
      Effect.forkScoped,
      // Detach the R requirement: the caller (sendTurn / recordTurnActivity)
      // runs without a Scope in its context, so attach the timer to the
      // captured service scope instead of the ambient one.
      Effect.provideService(Scope.Scope, serviceScope),
    );
    // Read, decide and write in one synchronous step. The previous entry is
    // handed back rather than interrupted up front, so no yield point sits
    // between observing it and replacing it.
    const outcome = yield* Ref.modify(
      turnWatchdogs,
      (
        map,
      ): readonly [
        { readonly installed: boolean; readonly previousEntry: TurnWatchdogEntry | undefined },
        Map<ThreadId, TurnWatchdogEntry>,
      ] => {
        const previousEntry = map.get(threadId);
        if (reArmOnly === true && previousEntry?.turnId !== turnId) {
          return [{ installed: false, previousEntry: undefined }, map] as const;
        }
        return [
          { installed: true, previousEntry },
          new Map(map).set(threadId, { turnId, instanceId, provider, timeoutMs, timerFiber }),
        ] as const;
      },
    );
    if (!outcome.installed) {
      yield* Fiber.interrupt(timerFiber).pipe(Effect.ignore);
      return;
    }
    if (outcome.previousEntry !== undefined) {
      yield* Fiber.interrupt(outcome.previousEntry.timerFiber).pipe(Effect.ignore);
    }
  });

  /**
   * Watchdog bookkeeping for every adapter stream event: any event proves
   * the thread is alive, so re-arm the full budget from it; terminal
   * events settle the entry. No entry means no in-flight turn — a no-op,
   * so healthy providers see zero behavior change.
   *
   * Turn-scoped terminal events (turn.completed / turn.aborted) only settle
   * the entry when they belong to the turn the entry is armed for. A
   * SUPERSeded turn's late `turn.aborted` must not clear the watchdog of the
   * turn that replaced it — otherwise a new user message that interrupts a
   * stuck turn would disarm the backstop for exactly the turn now in flight
   * (GHE #256: pack emits the old turn's `turn.aborted` "superseded by a
   * new message" alongside the new turn's `turn.started`). `session.exited`
   * is thread-scoped and always settles.
   */
  const recordTurnActivity = (event: ProviderRuntimeEvent): Effect.Effect<void> =>
    Ref.get(turnWatchdogs).pipe(
      Effect.flatMap((map) => {
        const entry = map.get(event.threadId);
        if (entry === undefined) return Effect.void;
        if (event.type === "session.exited") {
          return clearTurnWatchdog(event.threadId);
        }
        if (event.type === "turn.completed" || event.type === "turn.aborted") {
          // Only the armed turn's own terminal event settles it; a terminal
          // event for an older/superseded turn is ignored so it cannot clear
          // the watchdog of the turn that is now in flight.
          if (event.turnId !== undefined && event.turnId !== entry.turnId) {
            return Effect.void;
          }
          return clearTurnWatchdog(event.threadId);
        }
        // An announced retry backoff (driver detail "provider.retry")
        // extends the budget to cover the sleep; every other event
        // re-arms the plain budget.
        return armTurnWatchdog(
          event.threadId,
          entry.turnId,
          entry.instanceId,
          entry.provider,
          announcedRetryBudgetMs(event),
          // This path holds no permit, and the entry it just read can be
          // cleared by a start before the write lands.
          true,
        );
      }),
    );

  const requireBindingInstanceId = (
    operation: string,
    payload: {
      readonly providerInstanceId?: ProviderInstanceId | undefined;
      readonly provider?: ProviderDriverKind | undefined;
    },
  ): Effect.Effect<ProviderInstanceId, ProviderValidationError> =>
    payload.providerInstanceId !== undefined
      ? Effect.succeed(payload.providerInstanceId)
      : Effect.fail(
          toValidationError(
            operation,
            payload.provider
              ? `Provider instance id is required for provider '${payload.provider}'.`
              : "Provider instance id is required.",
          ),
        );

  const upsertSessionBinding = (
    session: ProviderSession,
    threadId: ThreadId,
    extra?: {
      readonly modelSelection?: unknown;
      readonly lastRuntimeEvent?: string;
      readonly lastRuntimeEventAt?: string;
    },
  ) =>
    Effect.gen(function* () {
      const providerInstanceId = yield* requireBindingInstanceId(
        "ProviderService.upsertSessionBinding",
        session,
      );
      yield* directory.upsert({
        threadId,
        provider: session.provider,
        providerInstanceId,
        runtimeMode: session.runtimeMode,
        status: toRuntimeStatus(session),
        ...(session.resumeCursor !== undefined ? { resumeCursor: session.resumeCursor } : {}),
        runtimePayload: toRuntimePayloadFromSession(session, extra),
      });
    });

  const processRuntimeEvent = (
    source: {
      readonly instanceId: ProviderInstanceId;
      readonly provider: ProviderDriverKind;
    },
    event: ProviderRuntimeEvent,
  ): Effect.Effect<void> =>
    Effect.sync(() => correlateRuntimeEventWithInstance(source, event)).pipe(
      Effect.flatMap((canonicalEvent) =>
        increment(providerRuntimeEventsTotal, {
          provider: canonicalEvent.provider,
          eventType: canonicalEvent.type,
        }).pipe(
          Effect.andThen(publishRuntimeEvent(canonicalEvent)),
          Effect.andThen(() => recordTurnActivity(canonicalEvent)),
        ),
      ),
    );

  // `subscribedAdapters` is our source-of-truth for "which instance adapters
  // are currently wired into the runtime event bus". It both tracks the set
  // of live subscriptions (so `reconcileInstanceSubscriptions` can diff and
  // fork only the *new* or *rebuilt* ones) and serves as the dynamic adapter
  // list consumed by `stopStaleSessionsForThread`, `listSessions`, and
  // `runStopAll` — replacing the pre-Slice-D startup snapshot so hot-added
  // instances become visible to those call sites as soon as settings edits
  // land.
  const subscribedAdapters = yield* Ref.make(
    new Map<ProviderInstanceId, ProviderAdapterShape<ProviderAdapterError>>(),
  );

  const getAdapterEntries = Ref.get(subscribedAdapters).pipe(
    Effect.map((map) => Array.from(map.entries())),
  );

  // Rebuild the map of id → adapter from the registry and fork a new event
  // subscription for every instance that is either brand new or whose adapter
  // identity changed (indicating the underlying `ProviderInstance` was torn
  // down and rebuilt by `ProviderInstanceRegistry.reconcile`). Orphaned
  // fibers for removed/replaced instances exit on their own because their
  // adapter's `streamEvents` source terminates when the old scope closes.
  const reconcileInstanceSubscriptions = Effect.gen(function* () {
    const previous = yield* Ref.get(subscribedAdapters);
    const currentIds = yield* registry.listInstances();
    const next = new Map<ProviderInstanceId, ProviderAdapterShape<ProviderAdapterError>>();
    for (const id of currentIds) {
      const adapterOption = yield* registry
        .getByInstance(id)
        .pipe(Effect.tapError(Effect.logWarning), Effect.option);
      if (Option.isNone(adapterOption)) continue;
      const adapter = adapterOption.value;
      next.set(id, adapter);
      if (previous.get(id) !== adapter) {
        yield* Stream.runForEach(adapter.streamEvents, (event) =>
          processRuntimeEvent(
            {
              instanceId: id,
              provider: adapter.provider,
            },
            event,
          ),
        ).pipe(Effect.forkScoped);
      }
    }
    yield* Ref.set(subscribedAdapters, next);
  });

  const instanceChanges = yield* registry.subscribeChanges;
  yield* reconcileInstanceSubscriptions;
  yield* Stream.runForEach(
    Stream.fromSubscription(instanceChanges),
    () => reconcileInstanceSubscriptions,
  ).pipe(Effect.forkScoped);

  const recoverSessionForThread = Effect.fn("recoverSessionForThread")(function* (input: {
    readonly binding: ProviderSessionDirectory.ProviderRuntimeBinding;
    readonly operation: string;
    /**
     * The adapter may still hold a session for this thread, and it must not be
     * adopted: it is a runtime that outlived a failed shutdown, so its MCP
     * credential was withdrawn and cannot be given back to it. Adopting it is
     * what leaves the thread routable and permanently unauthenticated.
     */
    readonly replaceExistingRuntime?: boolean;
    /**
     * Start a session with no provider-side history rather than refusing when
     * the thread has no resume cursor to continue from.
     *
     * A thread is unresumable more often than it sounds: one that dies — or
     * fails to stop — before its first turn completes has never produced a
     * cursor. Refusing there is a dead end the user cannot act on, and the
     * thread is not actually lost: the conversation lives in the message
     * store, and only the *provider's* continuation is gone. So operations
     * that mean "carry this thread forward" start fresh and say so, while the
     * ones that refer to provider-side state which no longer exists keep
     * refusing — a fresh runtime cannot serve those either.
     */
    readonly startFreshWhenUnresumable?: boolean;
    /**
     * What to tell the user when this operation cannot be served and will not
     * start fresh. Passed in rather than switched on `operation` inside here:
     * a string match on an operation name rots silently the day one is
     * renamed, and the caller is the only thing that knows what the user was
     * actually trying to do.
     */
    readonly unresumableRefusal?: string;
  }) {
    const bindingInstanceId = yield* requireBindingInstanceId(input.operation, input.binding);
    yield* Effect.annotateCurrentSpan({
      "provider.operation": "recover-session",
      "provider.kind": input.binding.provider,
      "provider.instance_id": bindingInstanceId,
      "provider.thread_id": input.binding.threadId,
    });
    return yield* Effect.gen(function* () {
      const adapter = yield* registry.getByInstance(bindingInstanceId);
      const hasResumeCursor =
        input.binding.resumeCursor !== null && input.binding.resumeCursor !== undefined;
      const hasActiveSession =
        input.replaceExistingRuntime === true
          ? false
          : yield* adapter.hasSession(input.binding.threadId);
      if (hasActiveSession) {
        const activeSessions = yield* adapter.listSessions();
        const existing = activeSessions.find(
          (session) => session.threadId === input.binding.threadId,
        );
        if (existing) {
          yield* upsertSessionBinding(
            { ...existing, providerInstanceId: bindingInstanceId },
            input.binding.threadId,
          );
          yield* analytics.record("provider.session.recovered", {
            provider: existing.provider,
            strategy: "adopt-existing",
            hasResumeCursor: existing.resumeCursor !== undefined,
          });
          return { adapter, session: existing } as const;
        }
      }

      if (input.replaceExistingRuntime === true) {
        // One more attempt at the shutdown that failed, so a runtime the
        // adapter is about to replace does not leak. Best effort by design:
        // the previous attempt already failed and this one may too, and the
        // replacement matters more than the confirmation. Same shape as
        // `stopStaleSessionsForThread`.
        yield* adapter.stopSession(input.binding.threadId).pipe(
          Effect.catchCause((cause) =>
            Effect.logWarning("provider.session.orphaned-runtime-stop-failed", {
              threadId: input.binding.threadId,
              provider: input.binding.provider,
              cause,
            }),
          ),
        );
      }

      if (!hasResumeCursor && input.startFreshWhenUnresumable !== true) {
        return yield* toValidationError(
          input.operation,
          input.unresumableRefusal ?? UNRESUMABLE_THREAD_REFUSAL,
        );
      }

      if (!hasResumeCursor) {
        // The heal, and it costs the user something real: the new runtime
        // starts with no provider-side history, so it will not remember what
        // was said before. That has to be visible, not swallowed — the same
        // `runtime.warning` surface the turn watchdog uses, which the work log
        // renders as its own row (see ProviderRuntimeIngestion).
        yield* Effect.logWarning("provider.session.recovered-without-resume-state", {
          threadId: String(input.binding.threadId),
          provider: String(input.binding.provider),
          providerInstanceId: String(bindingInstanceId),
        });
        yield* publishRuntimeEvent({
          eventId: EventId.make(nodeRandomUUID()),
          provider: input.binding.provider,
          providerInstanceId: bindingInstanceId,
          threadId: input.binding.threadId,
          createdAt: yield* nowIso,
          type: "runtime.warning",
          payload: {
            message:
              "The agent had to be restarted and is starting without its earlier context. Your messages in this thread are unaffected.",
            detail: { code: "session.context-reset" },
          },
        });
      }

      const persistedCwd = readPersistedCwd(input.binding.runtimePayload);
      const persistedModelSelection = readPersistedModelSelection(input.binding.runtimePayload);

      yield* prepareMcpSession(input.binding.threadId, bindingInstanceId);
      const resumed = yield* adapter
        .startSession({
          threadId: input.binding.threadId,
          provider: input.binding.provider,
          providerInstanceId: bindingInstanceId,
          ...(persistedCwd ? { cwd: persistedCwd } : {}),
          ...(persistedModelSelection ? { modelSelection: persistedModelSelection } : {}),
          ...(hasResumeCursor ? { resumeCursor: input.binding.resumeCursor } : {}),
          runtimeMode: input.binding.runtimeMode ?? "full-access",
        })
        .pipe(Effect.onError(() => clearMcpSession(input.binding.threadId)));
      if (resumed.provider !== adapter.provider) {
        yield* clearMcpSession(input.binding.threadId);
        return yield* toValidationError(
          input.operation,
          `Adapter/provider mismatch while recovering thread '${input.binding.threadId}'. Expected '${adapter.provider}', received '${resumed.provider}'.`,
        );
      }

      yield* upsertSessionBinding(
        { ...resumed, providerInstanceId: bindingInstanceId },
        input.binding.threadId,
      );
      yield* analytics.record("provider.session.recovered", {
        provider: resumed.provider,
        // Distinct from `resume-thread`: the user lost provider-side context
        // here, so how often this happens is worth being able to see.
        strategy: hasResumeCursor ? "resume-thread" : "fresh-start",
        hasResumeCursor: resumed.resumeCursor !== undefined,
      });
      return { adapter, session: resumed } as const;
    }).pipe(
      withMetrics({
        counter: providerSessionsTotal,
        attributes: providerMetricAttributes(input.binding.provider, {
          operation: "recover",
        }),
      }),
    );
  });

  /**
   * Route a thread, assuming this fiber already holds its runtime permit.
   *
   * Every read here — `hasSession`, the orphan marker, the binding — feeds a
   * decision that may then start or replace a runtime, so the read and the
   * decision have to be inside one critical section. Taking the lock *after*
   * the read would decide on a world that has already moved.
   */
  const resolveRoutableSessionLocked = Effect.fn("resolveRoutableSessionLocked")(function* (input: {
    readonly threadId: ThreadId;
    readonly operation: string;
    readonly allowRecovery: boolean;
    /**
     * Whether this operation still makes sense against a runtime that has no
     * provider-side history. See `recoverSessionForThread`; only the callers
     * that carry a thread forward set it.
     */
    readonly startFreshWhenUnresumable?: boolean;
    /** See `recoverSessionForThread`. Defaults to the general refusal. */
    readonly unresumableRefusal?: string;
  }) {
    const bindingOption = yield* directory.getBinding(input.threadId);
    const binding = Option.getOrUndefined(bindingOption);
    if (!binding) {
      return yield* toValidationError(
        input.operation,
        `Cannot route thread '${input.threadId}' because no persisted provider binding exists.`,
      );
    }
    const instanceId = yield* requireBindingInstanceId(input.operation, binding);
    const adapter = yield* registry.getByInstance(instanceId);

    const hasRequestedSession = yield* adapter.hasSession(input.threadId);
    // A runtime that outlived a failed shutdown still answers `hasSession`,
    // and routing a turn into it is precisely what wedges the thread: its MCP
    // credential was withdrawn by the stop, a turn can only refresh a record
    // that still exists, and its recovery hook was retired by the same
    // withdrawal. It has to be replaced by a session that gets a credential of
    // its own, so it is deliberately not reported as routable here.
    const mustReplaceRuntime = yield* isRuntimeOrphaned(input.threadId);
    if (hasRequestedSession && !mustReplaceRuntime) {
      return {
        adapter,
        instanceId,
        threadId: input.threadId,
        runtimeMode: binding.runtimeMode,
        isActive: true,
        runtimePresent: true,
        lifecycleEpoch: yield* readThreadLifecycleEpoch(input.threadId),
      } as const;
    }

    // Stale session recovery: the binding says "running" but the adapter no
    // longer holds the session (crash, OOM, unhandled rejection). Reset the
    // persisted status so the next upsert does not inherit a stale
    // activeTurnId that would block subsequent turns.
    if (binding.status === "running") {
      yield* directory
        .upsert({
          threadId: input.threadId,
          provider: binding.provider,
          providerInstanceId: instanceId,
          status: "stopped",
        })
        .pipe(
          Effect.catchCause((cause) =>
            Effect.logWarning("provider.session.stale-reset-failed", {
              threadId: input.threadId,
              cause,
            }),
          ),
        );
    }

    if (!input.allowRecovery) {
      // Two different questions, and conflating them was a hole. `isActive`
      // means "safe to send work to"; `runtimePresent` means "a process is
      // there". They differ for exactly one case — an orphaned runtime, which
      // is present but must never be used — and reporting that case as active
      // let `uploadFeedback` call straight into the runtime the orphan marker
      // exists to keep everyone away from.
      //
      // `stopSession` and `interruptTurn` want presence: they act *on* the
      // runtime, and an orphan is precisely what they should still shut down
      // or interrupt. Everything else wants `isActive`.
      return {
        adapter,
        instanceId,
        threadId: input.threadId,
        runtimeMode: binding.runtimeMode,
        isActive: hasRequestedSession && !mustReplaceRuntime,
        runtimePresent: hasRequestedSession,
        lifecycleEpoch: yield* readThreadLifecycleEpoch(input.threadId),
      } as const;
    }

    const recovered = yield* recoverSessionForThread({
      binding,
      operation: input.operation,
      ...(mustReplaceRuntime ? { replaceExistingRuntime: true } : {}),
      ...(input.startFreshWhenUnresumable === true
        ? { startFreshWhenUnresumable: true }
        : {}),
      ...(input.unresumableRefusal !== undefined
        ? { unresumableRefusal: input.unresumableRefusal }
        : {}),
    });
    // Only now: the thread has a session that was started through
    // `prepareMcpSession`, so it holds a credential of its own again.
    if (mustReplaceRuntime) {
      yield* clearOrphanedRuntime(input.threadId);
    }
    // A different runtime now occupies this thread than the one any earlier
    // decision was taken against.
    yield* bumpThreadLifecycleEpoch(input.threadId);
    return {
      adapter: recovered.adapter,
      instanceId,
      threadId: input.threadId,
      runtimeMode: recovered.session.runtimeMode,
      isActive: true,
      runtimePresent: true,
      lifecycleEpoch: yield* readThreadLifecycleEpoch(input.threadId),
    } as const;
  });

  // There is deliberately no `resolveRoutableSession` wrapper that takes the
  // permit and gives it back. Routing decides *which runtime* an operation is
  // for, and every caller then acts on that decision by thread id — so a
  // wrapper that released the permit on the way out would hand back an
  // identity that could be stale before it was used. Callers hold the permit
  // across both the routing and the adapter call, and there is only one
  // resolver so that the shorter, wrong shape is not available to reach for.

  const stopStaleSessionsForThread = Effect.fn("stopStaleSessionsForThread")(function* (input: {
    readonly threadId: ThreadId;
    readonly currentInstanceId: ProviderInstanceId;
  }) {
    const currentAdapters = yield* getAdapterEntries;
    yield* Effect.forEach(
      currentAdapters,
      ([instanceId, adapter]) =>
        instanceId === input.currentInstanceId
          ? Effect.void
          : Effect.gen(function* () {
              const hasSession = yield* adapter.hasSession(input.threadId);
              if (!hasSession) {
                return;
              }

              yield* adapter.stopSession(input.threadId).pipe(
                Effect.tap(() =>
                  analytics.record("provider.session.stopped", {
                    provider: adapter.provider,
                  }),
                ),
                Effect.catchCause((cause) =>
                  Effect.logWarning("provider.session.stop-stale-failed", {
                    threadId: input.threadId,
                    provider: adapter.provider,
                    cause,
                  }),
                ),
              );
            }),
      { discard: true },
    );
  });

  const startSession: ProviderServiceMethod<"startSession"> = Effect.fn("startSession")(
    function* (threadId, rawInput) {
      const parsed = yield* decodeInputOrValidationError({
        operation: "ProviderService.startSession",
        schema: ProviderSessionStartInput,
        payload: rawInput,
      });

      const resolvedInstanceId = yield* requireBindingInstanceId(
        "ProviderService.startSession",
        parsed,
      );
      let metricProvider = parsed.provider ?? String(resolvedInstanceId);
      yield* Effect.annotateCurrentSpan({
        "provider.operation": "start-session",
        "provider.instance_id": resolvedInstanceId,
        "provider.thread_id": threadId,
        "provider.runtime_mode": parsed.runtimeMode,
      });
      return yield* Effect.gen(function* () {
        const instanceInfo = yield* registry.getInstanceInfo(resolvedInstanceId);
        const resolvedProvider = instanceInfo.driverKind;
        metricProvider = resolvedProvider;
        if (parsed.provider !== undefined && parsed.provider !== resolvedProvider) {
          return yield* toValidationError(
            "ProviderService.startSession",
            `Provider instance '${resolvedInstanceId}' belongs to driver '${resolvedProvider}', not '${parsed.provider}'.`,
          );
        }
        const input = {
          ...parsed,
          threadId,
          provider: resolvedProvider,
        };
        if (!instanceInfo.enabled) {
          return yield* toValidationError(
            "ProviderService.startSession",
            `Provider instance '${resolvedInstanceId}' is disabled in T3 Code settings.`,
          );
        }
        const persistedBinding = Option.getOrUndefined(yield* directory.getBinding(threadId));
        const effectiveResumeCursor =
          input.resumeCursor ??
          (persistedBinding?.providerInstanceId === resolvedInstanceId
            ? persistedBinding.resumeCursor
            : undefined);
        const effectiveCwd =
          input.cwd ??
          (persistedBinding?.providerInstanceId === resolvedInstanceId
            ? readPersistedCwd(persistedBinding.runtimePayload)
            : undefined);
        yield* Effect.annotateCurrentSpan({
          "provider.kind": resolvedProvider,
          "provider.resume_cursor.source":
            input.resumeCursor !== undefined
              ? "request"
              : effectiveResumeCursor !== undefined &&
                  persistedBinding?.providerInstanceId === resolvedInstanceId
                ? "persisted"
                : "none",
          "provider.resume_cursor.present": effectiveResumeCursor !== undefined,
          "provider.cwd.source":
            input.cwd !== undefined
              ? "request"
              : effectiveCwd !== undefined &&
                  persistedBinding?.providerInstanceId === resolvedInstanceId
                ? "persisted"
                : "none",
          "provider.cwd.effective": effectiveCwd ?? "",
        });
        const adapter = yield* registry.getByInstance(resolvedInstanceId);
        yield* prepareMcpSession(threadId, resolvedInstanceId);
        const session = yield* adapter
          .startSession({
            ...input,
            providerInstanceId: resolvedInstanceId,
            ...(effectiveCwd !== undefined ? { cwd: effectiveCwd } : {}),
            ...(effectiveResumeCursor !== undefined ? { resumeCursor: effectiveResumeCursor } : {}),
          })
          .pipe(Effect.onError(() => clearMcpSession(threadId)));

        if (session.provider !== adapter.provider) {
          yield* clearMcpSession(threadId);
          return yield* toValidationError(
            "ProviderService.startSession",
            `Adapter/provider mismatch: requested '${adapter.provider}', received '${session.provider}'.`,
          );
        }
        const sessionWithInstance = {
          ...session,
          providerInstanceId: resolvedInstanceId,
        };

        yield* stopStaleSessionsForThread({
          threadId,
          currentInstanceId: resolvedInstanceId,
        });
        // This session was started through `prepareMcpSession`, so whatever
        // runtime outlived an earlier failed stop has been replaced by one
        // holding a credential of its own.
        yield* clearOrphanedRuntime(threadId);
        // The replaced runtime's in-flight turn went with it, so its watchdog
        // must go too. Left armed, it fires later against a thread that now
        // holds a different runtime and aborts a turn nobody asked it to —
        // and on Claude `interruptTurn` ignores the turn id and closes the
        // whole session, so a stale entry does not abort a turn there, it
        // kills the replacement session. `stopSession` already clears this;
        // a start replaces a runtime just as surely as a stop removes one.
        yield* clearTurnWatchdog(threadId);
        // Anything decided against the runtime this one replaced is stale.
        yield* bumpThreadLifecycleEpoch(threadId);
        yield* upsertSessionBinding(sessionWithInstance, threadId, {
          modelSelection: input.modelSelection,
        });
        yield* analytics.record("provider.session.started", {
          provider: sessionWithInstance.provider,
          runtimeMode: input.runtimeMode,
          hasResumeCursor: sessionWithInstance.resumeCursor !== undefined,
          hasCwd: typeof effectiveCwd === "string" && effectiveCwd.trim().length > 0,
          hasModel:
            typeof input.modelSelection?.model === "string" &&
            input.modelSelection.model.trim().length > 0,
        });

        // Changing runtime mode restarts the session, so the transition is only
        // observable here, by diffing against the mode the previous session for
        // this thread was bound to. Recording it separately is what makes the
        // "started supervised, switched to full access" funnel answerable.
        const previousRuntimeMode = persistedBinding?.runtimeMode;
        if (previousRuntimeMode !== undefined && previousRuntimeMode !== input.runtimeMode) {
          yield* analytics.record("provider.runtime_mode.changed", {
            provider: sessionWithInstance.provider,
            from: previousRuntimeMode,
            to: input.runtimeMode,
          });
        }

        return sessionWithInstance;
      }).pipe(
        // Exclusive for the whole start: preparing the credential, spawning
        // the runtime and clearing the orphan marker are one transition, and a
        // stop that interleaves with any part of it can tear down the runtime
        // this just published a credential for.
        (body) => withThreadRuntimeLock(threadId, body),
        withMetrics({
          counter: providerSessionsTotal,
          attributes: () =>
            providerMetricAttributes(metricProvider, {
              operation: "start",
            }),
        }),
      );
    },
  );

  const sendTurn: ProviderServiceMethod<"sendTurn"> = Effect.fn("sendTurn")(function* (rawInput) {
    const parsed = yield* decodeInputOrValidationError({
      operation: "ProviderService.sendTurn",
      schema: ProviderSendTurnInput,
      payload: rawInput,
    });

    const attachments = parsed.attachments ?? [];
    if (!parsed.input && attachments.length === 0) {
      return yield* toValidationError(
        "ProviderService.sendTurn",
        "Either input text or at least one attachment is required",
      );
    }

    // Adapters inline attachment pixels into the model prompt, but the model's
    // tools cannot dereference pixels. Appending the on-disk path is what lets
    // a turn like "include this screenshot in the PR" copy the actual file.
    // This runs after schema decode, so the appended lines are exempt from the
    // PROVIDER_SEND_TURN_MAX_INPUT_CHARS check; attachment count is capped, so
    // the overhead is bounded. Unresolvable ids are skipped here and surface
    // as adapter errors when the file is read for inlining.
    const attachmentPathLines = attachments.flatMap((attachment) => {
      const attachmentPath = resolveAttachmentPath({
        attachmentsDir: serverConfig.attachmentsDir,
        attachment,
      });
      return attachmentPath === null
        ? []
        : [`[Attached ${attachment.type} "${attachment.name}" is saved at: ${attachmentPath}]`];
    });
    const inputTextWithAttachmentPaths =
      attachmentPathLines.length === 0
        ? parsed.input
        : [parsed.input, attachmentPathLines.join("\n")]
            .filter((part): part is string => typeof part === "string" && part.length > 0)
            .join("\n\n");

    const input = {
      ...parsed,
      ...(inputTextWithAttachmentPaths !== undefined
        ? { input: inputTextWithAttachmentPaths }
        : {}),
      attachments,
    };
    yield* Effect.annotateCurrentSpan({
      "provider.operation": "send-turn",
      "provider.thread_id": input.threadId,
      "provider.interaction_mode": input.interactionMode,
      "provider.attachment_count": input.attachments.length,
    });
    let metricProvider = "unknown";
    let metricModel = input.modelSelection?.model;
    return yield* Effect.gen(function* () {
      // Routing under the permit; the dispatch deliberately outside it.
      //
      // `adapter.sendTurn` is not a dispatch on every provider. Claude queues
      // the prompt and returns, and OpenCode awaits only the submit call — but
      // Cursor (and every ACP provider sharing that adapter) awaits
      // `acp.prompt` to completion, reads `result.stopReason` and emits
      // `turn.completed` before returning. Holding the thread's permit across
      // that would hold it for the entire turn, so `stopSession` and
      // `interruptTurn` — the only ways a user can call off a running agent —
      // would queue behind the very turn they are trying to stop. A rare
      // misrouted prompt is not worth making a runaway agent unstoppable.
      //
      // What that costs, precisely: between this routing and the dispatch, a
      // stop plus a start could replace the runtime and the prompt would land
      // on the replacement. The bookkeeping below does not follow it there —
      // it is taken back under the permit *and* checked against the thread's
      // lifecycle epoch, so it writes nothing once its conclusions are stale.
      // The prompt itself can still land on the replacement; that residual is
      // real and is the reason `sendTurn` releases the permit at all.
      const routed = yield* withThreadRuntimeLock(
        input.threadId,
        resolveRoutableSessionLocked({
          threadId: input.threadId,
          operation: "ProviderService.sendTurn",
          allowRecovery: true,
          // Sending a message is the one operation that only needs the thread
          // to go *forward*, so it is the one that can heal a thread with
          // nothing to resume from: start a session without provider-side
          // history rather than refusing a message the user just typed.
          startFreshWhenUnresumable: true,
        }),
      );
      metricProvider = routed.adapter.provider;
      metricModel = input.modelSelection?.model;
      yield* Effect.annotateCurrentSpan({
        "provider.kind": routed.adapter.provider,
        ...(input.modelSelection?.model ? { "provider.model": input.modelSelection.model } : {}),
      });
      // A turn is the clearest sign a session is still alive. The MCP
      // credential is minted once at session start and cannot be rotated into
      // an already-spawned agent process, so we keep the existing token valid
      // rather than issuing a new one: sessions that go a long time between
      // browser tool calls used to lose the toolkit outright.
      yield* McpSessionRegistry.touchActiveMcpThread(input.threadId);
      const turn = yield* routed.adapter.sendTurn(input);
      // Back under the permit for the writes. These are the parts that
      // outlive the call and would otherwise describe a runtime that is no
      // longer there: the watchdog that can abort a turn, and the binding
      // that later routing reads.
      yield* withThreadRuntimeLock(
        input.threadId,
        Effect.gen(function* () {
          // Conditional, because the gap is long enough for the conclusions
          // above to stop being true. An interrupt in it aborts the very turn
          // this is about to arm a watchdog for — and nothing would ever clear
          // that watchdog, because the adapter emitted the turn's terminal
          // event before `sendTurn` returned, when this entry did not yet
          // exist; at its deadline it would abort whatever turn the thread has
          // by then, and on Claude-shaped adapters `interruptTurn` ignores the
          // turn id and closes the session outright. A stop plus a start in
          // the same gap is the other half: this upsert would write runtime
          // A's instance, cursor and active turn over runtime B's binding.
          //
          // So: only if the thread is still the one that was routed.
          const current = yield* readThreadLifecycleEpoch(input.threadId);
          if (current !== routed.lifecycleEpoch) {
            yield* Effect.logInfo("provider.turn.bookkeeping-skipped-stale", {
              threadId: String(input.threadId),
              turnId: String(turn.turnId),
              routedEpoch: routed.lifecycleEpoch,
              currentEpoch: current,
            });
            return;
          }
          // Arm the host-level inactivity watchdog for the in-flight turn
          // (GHE #113): the budget is per-provider-instance, and every stream
          // event from this adapter resets it (see recordTurnActivity).
          yield* armTurnWatchdog(
            input.threadId,
            turn.turnId,
            routed.instanceId,
            routed.adapter.provider,
          );
          yield* directory.upsert({
            threadId: input.threadId,
            provider: routed.adapter.provider,
            providerInstanceId: routed.instanceId,
            status: "running",
            ...(turn.resumeCursor !== undefined ? { resumeCursor: turn.resumeCursor } : {}),
            runtimePayload: {
              ...(input.modelSelection !== undefined
                ? { modelSelection: input.modelSelection }
                : {}),
              activeTurnId: turn.turnId,
              lastRuntimeEvent: "provider.sendTurn",
              lastRuntimeEventAt: yield* nowIso,
            },
          });
        }),
      );
      yield* analytics.record("provider.turn.sent", {
        provider: routed.adapter.provider,
        model: input.modelSelection?.model,
        interactionMode: input.interactionMode,
        // Session-start events alone skew runtime mode toward users who toggle
        // often, since every toggle restarts the session. Recording it per turn
        // gives a usage-weighted view and lets it cross with interactionMode.
        runtimeMode: routed.runtimeMode,
        attachmentCount: input.attachments.length,
        hasInput: typeof input.input === "string" && input.input.trim().length > 0,
      });
      return turn;
    }).pipe(
      withMetrics({
        counter: providerTurnsTotal,
        timer: providerTurnDuration,
        attributes: () =>
          providerTurnMetricAttributes({
            provider: metricProvider,
            model: metricModel,
            extra: {
              operation: "send",
            },
          }),
      }),
    );
  });

  const interruptTurn: ProviderServiceMethod<"interruptTurn"> = Effect.fn("interruptTurn")(
    function* (rawInput) {
      const input = yield* decodeInputOrValidationError({
        operation: "ProviderService.interruptTurn",
        schema: ProviderInterruptTurnInput,
        payload: rawInput,
      });
      let metricProvider = "unknown";
      return yield* Effect.gen(function* () {
        // No recovery. "Stop" is a request about a runtime, and the one way to
        // serve it by *starting* one is not to serve it at all — yet that is
        // what recovery did: an interrupt against a crashed session resumed
        // the thread into a brand-new agent process and interrupted that, so
        // pressing stop could start an agent.
        const routed = yield* resolveRoutableSessionLocked({
          threadId: input.threadId,
          operation: "ProviderService.interruptTurn",
          allowRecovery: false,
        });
        metricProvider = routed.adapter.provider;
        yield* Effect.annotateCurrentSpan({
          "provider.operation": "interrupt-turn",
          "provider.kind": routed.adapter.provider,
          "provider.thread_id": input.threadId,
          "provider.turn_id": input.turnId,
          "provider.interrupt.runtime_present": routed.runtimePresent,
        });
        // `runtimePresent`: a runtime orphaned by a failed stop is still a
        // running process, and "make it not be running" is exactly what an
        // interrupt should do to it.
        if (!routed.runtimePresent) {
          // Nothing is running, so the state the user asked for already holds.
          // Refusing would report a problem they cannot act on and did not
          // need to know about — the same shape as the error that started all
          // of this.
          //
          // Honestly vacuous: nothing started, no credential minted, and no
          // `provider.turn.interrupted` recorded, because no turn was. The
          // watchdog entry is still cleared: an armed timer for a runtime that
          // is gone would otherwise fire and chase it.
          yield* clearTurnWatchdog(input.threadId);
          return;
        }
        // A runtime is present, so anything that fails from here is a real
        // failure and surfaces. The no-op above is only for the case where
        // there is demonstrably nothing to interrupt.
        yield* routed.adapter.interruptTurn(routed.threadId, input.turnId);
        // The turn any in-flight operation was routed for may be the one just
        // aborted, so nothing decided before this may still write about it.
        yield* bumpThreadLifecycleEpoch(input.threadId);
        // The user asked for this interrupt — the watchdog must not also
        // fire for the same turn.
        yield* clearTurnWatchdog(input.threadId);
        yield* analytics.record("provider.turn.interrupted", {
          provider: routed.adapter.provider,
        });
      }).pipe(
        // Sharpest case for holding the permit across the adapter call. This
        // reads `runtimePresent` so it can deliberately reach an orphaned
        // runtime — and released after routing, it could instead reach a
        // healthy runtime a concurrent start had just installed and kill a
        // turn the user is watching. Worse than the refusal removed earlier.
        (body) => withThreadRuntimeLock(input.threadId, body),
        withMetrics({
          counter: providerTurnsTotal,
          outcomeAttributes: () =>
            providerMetricAttributes(metricProvider, {
              operation: "interrupt",
            }),
        }),
      );
    },
  );

  const respondToRequest: ProviderServiceMethod<"respondToRequest"> = Effect.fn("respondToRequest")(
    function* (rawInput) {
      const input = yield* decodeInputOrValidationError({
        operation: "ProviderService.respondToRequest",
        schema: ProviderRespondToRequestInput,
        payload: rawInput,
      });
      let metricProvider = "unknown";
      return yield* Effect.gen(function* () {
        const routed = yield* resolveRoutableSessionLocked({
          threadId: input.threadId,
          operation: "ProviderService.respondToRequest",
          allowRecovery: true,
          unresumableRefusal: UNANSWERABLE_REQUEST_REFUSAL,
        });
        metricProvider = routed.adapter.provider;
        yield* Effect.annotateCurrentSpan({
          "provider.operation": "respond-to-request",
          "provider.kind": routed.adapter.provider,
          "provider.thread_id": input.threadId,
          "provider.request_id": input.requestId,
        });
        yield* withProviderDeadline(
          routed.adapter.respondToRequest(routed.threadId, input.requestId, input.decision),
          {
            operation: "ProviderService.respondToRequest",
            timeoutMs: APPROVAL_REPLY_TIMEOUT_MS,
            consequence:
              "check whether the agent carried on before answering again, and start a new turn if it did not.",
          },
        );
        yield* analytics.record("provider.request.responded", {
          provider: routed.adapter.provider,
          decision: input.decision,
        });
      }).pipe(
        // An answer is addressed to the runtime that asked; delivering it to a
        // replacement that never asked is the same identity slip.
        (body) => withThreadRuntimeLock(input.threadId, body),
        withMetrics({
          counter: providerTurnsTotal,
          outcomeAttributes: () =>
            providerMetricAttributes(metricProvider, {
              operation: "approval-response",
            }),
        }),
      );
    },
  );

  const respondToUserInput: ProviderServiceMethod<"respondToUserInput"> = Effect.fn(
    "respondToUserInput",
  )(function* (rawInput) {
    const input = yield* decodeInputOrValidationError({
      operation: "ProviderService.respondToUserInput",
      schema: ProviderRespondToUserInputInput,
      payload: rawInput,
    });
    let metricProvider = "unknown";
    return yield* Effect.gen(function* () {
      const routed = yield* resolveRoutableSessionLocked({
        threadId: input.threadId,
        operation: "ProviderService.respondToUserInput",
        allowRecovery: true,
        unresumableRefusal: UNANSWERABLE_REQUEST_REFUSAL,
      });
      metricProvider = routed.adapter.provider;
      yield* Effect.annotateCurrentSpan({
        "provider.operation": "respond-to-user-input",
        "provider.kind": routed.adapter.provider,
        "provider.thread_id": input.threadId,
        "provider.request_id": input.requestId,
      });
      yield* withProviderDeadline(
        routed.adapter.respondToUserInput(routed.threadId, input.requestId, input.answers),
        {
          operation: "ProviderService.respondToUserInput",
          timeoutMs: USER_INPUT_REPLY_TIMEOUT_MS,
          consequence:
            "check whether the agent carried on before answering again, and start a new turn if it did not.",
        },
      );
    }).pipe(
      // Same as the approval answer above.
      (body) => withThreadRuntimeLock(input.threadId, body),
      withMetrics({
        counter: providerTurnsTotal,
        outcomeAttributes: () =>
          providerMetricAttributes(metricProvider, {
            operation: "user-input-response",
          }),
      }),
    );
  });

  const stopSession: ProviderServiceMethod<"stopSession"> = Effect.fn("stopSession")(
    function* (rawInput) {
      const input = yield* decodeInputOrValidationError({
        operation: "ProviderService.stopSession",
        schema: ProviderStopSessionInput,
        payload: rawInput,
      });
      let metricProvider = "unknown";
      return yield* Effect.gen(function* () {
        // Locked variant: this whole body already holds the thread's permit.
        const routed = yield* resolveRoutableSessionLocked({
          threadId: input.threadId,
          operation: "ProviderService.stopSession",
          allowRecovery: false,
        });
        metricProvider = routed.adapter.provider;
        yield* Effect.annotateCurrentSpan({
          "provider.operation": "stop-session",
          "provider.kind": routed.adapter.provider,
          "provider.thread_id": input.threadId,
        });
        // Withdraw before the shutdown that can fail, not after it. `Effect`
        // short-circuits on error, so an adapter that tears the runtime down —
        // or half down — and then fails used to skip this line entirely,
        // leaving the thread's bearer valid against `/mcp` and its withdrawal
        // epoch un-advanced, which keeps the driver's recovery hook alive too:
        // a runtime torn down with a live credential is an authentication hole
        // nothing later closes.
        //
        // Neither order is safe on its own, though. This one leaves the other
        // half — a runtime that survives its failed shutdown, now holding a
        // credential this host revoked — so the failure is recorded and that
        // runtime is replaced rather than reused. See `orphanedRuntimes`.
        //
        // Both halves rest on nothing else touching this thread in between,
        // which is what the permit around this body guarantees: without it, a
        // concurrent start publishes a credential after the withdrawal and the
        // shutdown below then kills *that* start's runtime instead.
        yield* clearMcpSession(input.threadId);
        // `runtimePresent`, not `isActive`: an orphaned runtime is exactly the
        // one a stop should still try to shut down.
        if (routed.runtimePresent) {
          yield* routed.adapter
            .stopSession(routed.threadId)
            .pipe(Effect.onError(() => markRuntimeOrphaned([input.threadId])));
        }
        // The runtime is gone, so nothing is left to replace — including when
        // this stop is the retry that finally succeeded.
        yield* clearOrphanedRuntime(input.threadId);
        // And nothing decided against it may still be written down.
        yield* bumpThreadLifecycleEpoch(input.threadId);
        yield* clearTurnWatchdog(input.threadId);
        yield* directory.upsert({
          threadId: input.threadId,
          provider: routed.adapter.provider,
          providerInstanceId: routed.instanceId,
          status: "stopped",
          runtimePayload: {
            activeTurnId: null,
          },
        });
        yield* analytics.record("provider.session.stopped", {
          provider: routed.adapter.provider,
        });
      }).pipe(
        // Belt to the permit's braces, and only that: withdraw once more
        // however this body ends. Under the permit nothing can have published
        // a credential since the withdrawal above, so this is a no-op in every
        // sequence I can construct — but the invariant it enforces ("a stop
        // never returns leaving this thread with a resolvable bearer") is the
        // one that has been broken twice, and it should not depend on every
        // future caller remembering to take the permit.
        Effect.ensuring(clearMcpSession(input.threadId)),
        (body) => withThreadRuntimeLock(input.threadId, body),
        withMetrics({
          counter: providerSessionsTotal,
          outcomeAttributes: () =>
            providerMetricAttributes(metricProvider, {
              operation: "stop",
            }),
        }),
      );
    },
  );

  const listSessions: ProviderServiceMethod<"listSessions"> = Effect.fn("listSessions")(
    function* () {
      const currentAdapters = yield* getAdapterEntries;
      const sessionsByProvider = yield* Effect.forEach(currentAdapters, ([instanceId, adapter]) =>
        adapter.listSessions().pipe(
          Effect.map((sessions) =>
            sessions.map((session) => ({
              ...session,
              providerInstanceId: instanceId,
            })),
          ),
        ),
      );
      const activeSessions = sessionsByProvider.flatMap((sessions) => sessions);
      const persistedBindings = yield* directory.listThreadIds().pipe(
        Effect.flatMap((threadIds) =>
          Effect.forEach(
            threadIds,
            (threadId) =>
              directory
                .getBinding(threadId)
                .pipe(
                  Effect.orElseSucceed(() =>
                    Option.none<ProviderSessionDirectory.ProviderRuntimeBinding>(),
                  ),
                ),
            { concurrency: "unbounded" },
          ),
        ),
        Effect.orElseSucceed(
          () => [] as Array<Option.Option<ProviderSessionDirectory.ProviderRuntimeBinding>>,
        ),
      );
      const bindingsByThreadId = new Map<
        ThreadId,
        ProviderSessionDirectory.ProviderRuntimeBinding
      >();
      for (const bindingOption of persistedBindings) {
        const binding = Option.getOrUndefined(bindingOption);
        if (binding) {
          bindingsByThreadId.set(binding.threadId, binding);
        }
      }

      const sessions: ProviderSession[] = [];
      for (const session of activeSessions) {
        const binding = bindingsByThreadId.get(session.threadId);
        if (!binding) {
          sessions.push(session);
          continue;
        }

        const overrides: {
          resumeCursor?: ProviderSession["resumeCursor"];
          runtimeMode?: ProviderSession["runtimeMode"];
          providerInstanceId?: ProviderSession["providerInstanceId"];
        } = {};
        overrides.providerInstanceId = dieOnMissingBindingInstanceId(
          "ProviderService.listSessions",
          binding,
        );
        if (binding.provider !== session.provider) {
          return yield* Effect.die(
            new Error(
              `ProviderService.listSessions: thread '${session.threadId}' is active on provider '${session.provider}' but persisted binding names provider '${binding.provider}'.`,
            ),
          );
        }
        if (overrides.providerInstanceId !== session.providerInstanceId) {
          return yield* Effect.die(
            new Error(
              `ProviderService.listSessions: thread '${session.threadId}' is active on provider instance '${session.providerInstanceId}' but persisted binding names '${overrides.providerInstanceId}'.`,
            ),
          );
        }
        if (session.resumeCursor === undefined && binding.resumeCursor !== undefined) {
          overrides.resumeCursor = binding.resumeCursor;
        }
        if (binding.runtimeMode !== undefined) {
          overrides.runtimeMode = binding.runtimeMode;
        }
        sessions.push(Object.assign({}, session, overrides));
      }
      return sessions;
    },
  );

  const getCapabilities: ProviderServiceMethod<"getCapabilities"> = (instanceId) =>
    registry.getByInstance(instanceId).pipe(Effect.map((adapter) => adapter.capabilities));

  const getInstanceInfo: ProviderServiceMethod<"getInstanceInfo"> = (instanceId) =>
    registry.getInstanceInfo(instanceId);

  const rollbackConversation: ProviderServiceMethod<"rollbackConversation"> = Effect.fn(
    "rollbackConversation",
  )(function* (rawInput) {
    const input = yield* decodeInputOrValidationError({
      operation: "ProviderService.rollbackConversation",
      schema: ProviderRollbackConversationInput,
      payload: rawInput,
    });
    if (input.numTurns === 0) {
      return;
    }
    let metricProvider = "unknown";
    return yield* Effect.gen(function* () {
      const routed = yield* resolveRoutableSessionLocked({
        threadId: input.threadId,
        operation: "ProviderService.rollbackConversation",
        allowRecovery: true,
      });
      metricProvider = routed.adapter.provider;
      yield* Effect.annotateCurrentSpan({
        "provider.operation": "rollback-conversation",
        "provider.kind": routed.adapter.provider,
        "provider.thread_id": input.threadId,
        "provider.rollback_turns": input.numTurns,
      });
      yield* withProviderDeadline(
        routed.adapter.rollbackThread(routed.threadId, input.numTurns),
        {
          operation: "ProviderService.rollbackConversation",
          timeoutMs: ROLLBACK_TIMEOUT_MS,
          // The mutating one. Do not invite a retry: if the provider finished
          // the rollback after we gave up, a second attempt rolls back twice.
          consequence:
            "check the conversation before rolling back again — repeating it would undo more than you asked for.",
        },
      );
      yield* analytics.record("provider.conversation.rolled_back", {
        provider: routed.adapter.provider,
        turns: input.numTurns,
      });
    }).pipe(
      // Rolling back N turns of a runtime that has since been replaced would
      // roll back the replacement's history instead.
      (body) => withThreadRuntimeLock(input.threadId, body),
      withMetrics({
        counter: providerTurnsTotal,
        outcomeAttributes: () =>
          providerMetricAttributes(metricProvider, {
            operation: "rollback",
          }),
      }),
    );
  });

  const uploadFeedback: ProviderServiceMethod<"uploadFeedback"> = Effect.fn("uploadFeedback")(
    function* (rawInput) {
      const input = yield* decodeInputOrValidationError({
        operation: "ProviderService.uploadFeedback",
        schema: ProviderUploadFeedbackInput,
        payload: rawInput,
      });
      // Both passes and the upload itself are one critical section: the probe
      // decides whether to recover, and recovering between the two would leave
      // the upload addressed to a runtime neither pass looked at.
      //
      // This is the one operation whose adapter call is a network upload, so
      // it holds the thread for as long as that takes. An earlier version of
      // this note said the provider client bounds it. It does not: Codex
      // issues `client.request("feedback/upload", …)` with no timeout, and the
      // explicit 3s/10s timeouts nearby in `CodexSessionRuntime` cover
      // interrupt handling, not this. The bound is applied here instead —
      // see `FEEDBACK_UPLOAD_TIMEOUT_MS`.
      return yield* Effect.gen(function* () {
        let routed = yield* resolveRoutableSessionLocked({
          threadId: input.threadId,
          operation: "ProviderService.uploadFeedback",
          allowRecovery: false,
        });
        if (routed.adapter.uploadFeedback === undefined) {
          return yield* toValidationError(
            "ProviderService.uploadFeedback",
            `Provider '${routed.adapter.provider}' does not support feedback uploads.`,
          );
        }
        if (!routed.isActive) {
          routed = yield* resolveRoutableSessionLocked({
            threadId: input.threadId,
            operation: "ProviderService.uploadFeedback",
            allowRecovery: true,
          });
        }
        const uploadFeedback = routed.adapter.uploadFeedback;
        if (uploadFeedback === undefined) {
          return yield* toValidationError(
            "ProviderService.uploadFeedback",
            `Provider '${routed.adapter.provider}' does not support feedback uploads.`,
          );
        }
        yield* Effect.annotateCurrentSpan({
          "provider.operation": "upload-feedback",
          "provider.kind": routed.adapter.provider,
          "provider.thread_id": input.threadId,
        });
        return yield* withProviderDeadline(uploadFeedback(input), {
          operation: "ProviderService.uploadFeedback",
          timeoutMs: FEEDBACK_UPLOAD_TIMEOUT_MS,
          consequence: "sending it again may leave a duplicate, which is harmless.",
        });
      }).pipe((body) => withThreadRuntimeLock(input.threadId, body));
    },
  );

  const runStopAll = Effect.fn("runStopAll")(function* () {
    yield* Ref.set(turnWatchdogs, new Map());
    const threadIds = yield* directory.listThreadIds();
    const currentAdapters = yield* getAdapterEntries;
    const activeSessions = yield* Effect.forEach(currentAdapters, ([instanceId, adapter]) =>
      adapter.listSessions().pipe(
        Effect.map((sessions) =>
          sessions.map((session) => ({
            ...session,
            providerInstanceId: instanceId,
          })),
        ),
      ),
    ).pipe(Effect.map((sessionsByAdapter) => sessionsByAdapter.flatMap((sessions) => sessions)));
    yield* Effect.forEach(activeSessions, (session) =>
      Effect.flatMap(nowIso, (lastRuntimeEventAt) =>
        upsertSessionBinding(session, session.threadId, {
          lastRuntimeEvent: "provider.stopAll",
          lastRuntimeEventAt,
        }),
      ),
    ).pipe(Effect.asVoid);
    // Immediately before the shutdown, for the reason `stopSession` withdraws
    // first — never after it, or a `stopAll()` that tears runtimes down and
    // then fails leaves their bearers resolving. Not at the top of this
    // function either: stranding it ahead of the directory reads and binding
    // upserts above would revoke every thread's credential on a failure that
    // never asked any runtime to stop.
    yield* McpSessionRegistry.revokeAllActiveMcpCredentials();
    McpProviderSession.clearAllMcpProviderSessions();
    // And the other half, per adapter: whatever that adapter still holds may
    // have outlived the shutdown, so those threads are replaced rather than
    // reused if this process carries on. `stopAll` is the service finalizer,
    // so usually it does not — but "usually" is not the guarantee, and a whole
    // instance wedged at once is the worst version of this failure.
    yield* Effect.forEach(currentAdapters, ([instanceId, adapter]) =>
      adapter.stopAll().pipe(
        Effect.onError(() =>
          // `IfIdle`: `activeSessions` was snapshotted before the shutdown, so
          // any thread a concurrent start has since replaced must not be
          // condemned from it.
          markRuntimeOrphanedIfIdle(
            activeSessions
              .filter((session) => session.providerInstanceId === instanceId)
              .map((session) => session.threadId),
          ),
        ),
      ),
    ).pipe(Effect.asVoid);
    const bindings = yield* directory.listBindings().pipe(Effect.orElseSucceed(() => []));
    yield* Effect.forEach(bindings, (binding) =>
      Effect.gen(function* () {
        const providerInstanceId = dieOnMissingBindingInstanceId(
          "ProviderService.stopAll",
          binding,
        );
        return yield* directory.upsert({
          threadId: binding.threadId,
          provider: binding.provider,
          providerInstanceId,
          status: "stopped",
          runtimePayload: {
            activeTurnId: null,
            lastRuntimeEvent: "provider.stopAll",
            lastRuntimeEventAt: yield* nowIso,
          },
        });
      }),
    ).pipe(Effect.asVoid);
    yield* analytics.record("provider.sessions.stopped_all", {
      sessionCount: threadIds.length,
    });
    yield* analytics.flush;
  });

  yield* Effect.addFinalizer(() =>
    runStopAll().pipe(
      Effect.catchCause((cause) =>
        Effect.logWarning("failed to stop provider service", {
          errorTag: causeErrorTag(cause),
        }),
      ),
    ),
  );

  return {
    startSession,
    sendTurn,
    interruptTurn,
    respondToRequest,
    respondToUserInput,
    stopSession,
    listSessions,
    getCapabilities,
    getInstanceInfo,
    rollbackConversation,
    uploadFeedback,
    // Each access creates a fresh PubSub subscription so that multiple
    // consumers (ProviderRuntimeIngestion, CheckpointReactor, etc.) each
    // independently receive all runtime events.
    get streamEvents(): ProviderServiceMethod<"streamEvents"> {
      return Stream.fromPubSub(runtimeEventPubSub);
    },
  } satisfies ProviderService.ProviderService["Service"];
});

export const ProviderServiceLive = Layer.effect(
  ProviderService.ProviderService,
  makeProviderService(),
);

export function makeProviderServiceLive(options?: ProviderServiceLiveOptions) {
  return Layer.effect(ProviderService.ProviderService, makeProviderService(options));
}
