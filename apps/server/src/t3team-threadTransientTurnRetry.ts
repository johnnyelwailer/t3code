// @effect-diagnostics globalTimers:off -- the retry backoff timer is owned
// by this reactor fiber (same host-timer pattern as t3team-childWaitScheduler).
/**
 * Session-level auto-retry for transient provider failures (GHE stop-reason
 * + retry work).
 *
 * Two failure shapes dead-end a thread today with no visible stop reason and
 * no recovery: the host-level turn-inactivity watchdog (the "600s no provider
 * stream activity" stall, which interrupts the turn and leaves the thread with
 * a bare Continue button) and a turn result the provider classifies transient
 * (gateway capacity/reservation 423, rate limits, 5xx outages) that exhausts
 * the provider's own in-turn retry budget. This reactor owns the host's
 * session-level policy for both:
 *
 *  - a transient stop is BOUNDED-RETRIED automatically: the thread's last
 *    user message is re-issued through the SAME `thread.turn.resume` path the
 *    Continue button uses, with backoff, up to `MAX_SESSION_TRANSIENT_RETRIES`
 *    attempts. While waiting the thread's session carries a
 *    "Retrying (n/N) — <reason>" stop reason, so the UI shows the reason
 *    instead of a dead end.
 *  - after exhaustion, the session carries the terminal stop reason plus the
 *    exhausted-attempt count — the Continue button then reads as a deliberate
 *    user choice, not a mystery.
 *  - NON-transient stops (auth errors, user stops, cascaded stops, provider
 *    aborts that are not transient) are NEVER retried. A user-initiated stop
 *    in particular must never resurrect its turn: the
 *    `thread.turn-interrupt-requested` event marks the thread user-stopped
 *    until its next `turn.started`.
 *
 * Pure decision logic lives in the exported `createTransientTurnRetryTracker`
 * (unit-tested without effects); the `...Live` layer wires it to the provider
 * runtime event stream, the orchestration engine, and the SQL-backed thread
 * detail query.
 *
 * @module t3team-threadTransientTurnRetry
 */
import {
  CommandId,
  MessageId,
  ThreadId,
  type OrchestrationSession,
  type OrchestrationThread,
  type ProviderRuntimeEvent,
} from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";

import { OrchestrationEngineService } from "./orchestration/Services/OrchestrationEngine.ts";
import { ProjectionSnapshotQuery } from "./orchestration/Services/ProjectionSnapshotQuery.ts";
import {
  isTransientGatewayErrorText,
  retryDirectiveSeconds,
} from "./provider/Layers/claude-gateway-retry.ts";
import { ProviderService } from "./provider/Services/ProviderService.ts";
import { t3teamRandomUUID } from "./t3team-random.ts";

/**
 * Session-level automatic retry budget for transient provider failures.
 * The provider's OWN in-turn retry budget (transport retries, the Claude
 * gateway 423/429/5xx re-drive) runs first; this is the host's second layer,
 * bounded so a permanently-dead provider cannot loop the turn forever.
 */
export const MAX_SESSION_TRANSIENT_RETRIES = 3;

/** Default backoff ladder (ms) between session-level retry attempts. */
const DEFAULT_RETRY_BACKOFF_MS = [15_000, 30_000, 60_000] as const;

/**
 * Wait before writing the "Retrying (n/N)" / exhausted reason: the terminal
 * provider events (turn.completed → ready, session.exited → stopped) are
 * applied to the thread session by the runtime ingestion in PARALLEL with
 * this reactor, and those application sets null/carry `lastError`. Writing
 * the reason before they settle loses the race and the thread dead-ends
 * with a bare button again. A short settle window plus a FRESH thread read
 * puts our set on top of the settled session.
 */
const IN_FLIGHT_SETTLE_MS = 300;

/** Hard cap for the env override — a "transient" wait longer than 2min is a hang. */
const MAX_RETRY_BACKOFF_OVERRIDE_MS = 120_000;

/** Session-level cap for a gateway retry directive (mirrors the in-turn policy). */
const MAX_DIRECTIVE_DELAY_SECONDS = 60;

/**
 * Backoff before session-retry attempt `attempt` (1-based). The env override
 * (`T3TEAM_TRANSIENT_TURN_RETRY_BACKOFF_MS`, positive finite ms, capped)
 * exists so e2e verification can shorten the wait without waiting real minutes.
 */
export function transientTurnRetryBackoffMs(attempt: number, overrideMs?: number): number {
  if (overrideMs !== undefined) {
    if (Number.isFinite(overrideMs) && overrideMs > 0) {
      return Math.min(Math.round(overrideMs), MAX_RETRY_BACKOFF_OVERRIDE_MS);
    }
  }
  const index = Math.max(0, Math.min(attempt - 1, DEFAULT_RETRY_BACKOFF_MS.length - 1));
  return DEFAULT_RETRY_BACKOFF_MS[index]!;
}

/**
 * When a reservation error carries the gateway's own `retry_after_seconds`
 * directive, the session-level retry is scheduled AT that expiry (+5–15%
 * cushion so we do not race the reservation) instead of the blind backoff
 * ladder. The directive is capped at 60s — the same cap the in-turn gateway
 * retry honors — so a bogus 1-hour directive cannot stall the thread for an
 * hour (the wait is then surfaced in the stop reason instead).
 */
export function transientTurnRetryDelayMs(
  attempt: number,
  directiveSeconds: number | null,
  overrideMs?: number,
  random: () => number = Math.random,
): number {
  const override = transientTurnRetryBackoffMs(attempt, overrideMs);
  if (overrideMs !== undefined && Number.isFinite(overrideMs) && overrideMs > 0) return override;
  if (directiveSeconds !== null) {
    const ms = Math.min(directiveSeconds, MAX_DIRECTIVE_DELAY_SECONDS) * 1000;
    return Math.round(ms * (1.05 + 0.1 * random()));
  }
  return override;
}

const STOP_REASON_MAX_CHARS = 300;

/** Trim a provider-supplied reason to something the UI can render on one row. */
export function truncateStopReason(reason: string): string {
  const flat = reason.replace(/\s+/g, " ").trim();
  if (flat.length <= STOP_REASON_MAX_CHARS) return flat;
  return `${flat.slice(0, STOP_REASON_MAX_CHARS - 1)}…`;
}

/** The stall reason text for a host watchdog fire (the transient trigger). */
export function watchdogStallReason(inactivitySeconds: number): string {
  return `Provider stream stalled (no activity for ${Math.round(inactivitySeconds)}s)`;
}

/** "Retrying (n/N) — reason" — the live stop reason while a retry is queued. */
export function transientRetryInFlightText(
  attempt: number,
  reason: string,
  delayMs?: number,
): string {
  const head = `Retrying (${attempt}/${MAX_SESSION_TRANSIENT_RETRIES}) — ${reason}`;
  if (delayMs === undefined) return head;
  return `${head}, next attempt in ~${Math.max(1, Math.round(delayMs / 1000))}s`;
}

/** The terminal stop reason once the session-level budget is spent. */
export function transientRetryExhaustedText(reason: string): string {
  return `${reason} — automatic retries exhausted (${MAX_SESSION_TRANSIENT_RETRIES} attempts)`;
}

// ---------------------------------------------------------------------------
// Pure event classification
// ---------------------------------------------------------------------------

type RuntimeWarningLike = {
  readonly detail?: unknown;
};

/**
 * Read the host-watchdog stall out of a `runtime.warning` event. Non-watchdog
 * warnings (and malformed details) return null — they never arm a retry.
 */
export function readWatchdogStallWarning(
  payload: RuntimeWarningLike,
): { readonly inactivitySeconds: number } | null {
  const detail = payload.detail;
  if (typeof detail !== "object" || detail === null) return null;
  const code = (detail as { code?: unknown }).code;
  if (code !== "turn.inactivity") return null;
  const seconds = (detail as { inactivitySeconds?: unknown }).inactivitySeconds;
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0) return null;
  return { inactivitySeconds: seconds };
}

type TurnCompletedLike = {
  readonly state: string;
  readonly stopReason?: unknown;
  readonly errorMessage?: unknown;
};

/**
 * A turn result is transient when it failed AND its error/stop text matches
 * the shared transient-gateway classifier (423 capacity/reservation, 429,
 * 5xx, retry directives). Any other failure is terminal-for-retry purposes
 * (auth, validation, permanent 4xx, max turns...).
 */
export function classifyTransientTurnFailure(
  payload: TurnCompletedLike,
): { readonly reason: string; readonly directiveSeconds: number | null } | null {
  if (payload.state !== "failed") return null;
  const text = [payload.errorMessage, payload.stopReason]
    .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
    .join(" ");
  if (text.trim().length === 0) return null;
  if (!isTransientGatewayErrorText(text)) return null;
  // The directive is read from the RAW text: the summarized reason drops it.
  return { reason: transientTurnReasonText(text), directiveSeconds: retryDirectiveSeconds(text) };
}

/** 423 / gpu-reservation class, per the shared classifier vocabulary. */
const RESERVATION_CLASS =
  /\b(gpu_reserved|reservation_error|reservation owner is)\b|(?<!\S)423(?=[:\s]|$)/i;

/**
 * The reservation-error class carries structured detail ("423: Reservation
 * owner is currently using the GPU; retry shortly", often with
 * `retry_after_seconds`). Surface it as a compact, deterministic reason
 * instead of the raw error body; every other transient keeps its raw text.
 */
export function transientTurnReasonText(reason: string): string {
  if (!RESERVATION_CLASS.test(reason)) return truncateStopReason(reason);
  return "423 — GPU reserved by current owner";
}

// ---------------------------------------------------------------------------
// Pure tracker (per-thread decision state)
// ---------------------------------------------------------------------------

export interface TransientTurnRetryState {
  /** Session-level retry attempts already made for this failure episode. */
  attempts: number;
  /** Pending host-watchdog stall marker awaiting the abort event. */
  stall: { readonly turnId: string; readonly reason: string } | null;
  /**
   * True from a `thread.turn-interrupt-requested` until the thread's next
   * `turn.started`: the turn died on a user/cascade stop and must never be
   * resurrected.
   */
  userStopped: boolean;
  /**
   * The class of the most recent terminal turn. A `session.exited` right
   * after a TRANSIENT death is part of the same death (Claude ends its
   * session when the interrupted turn ends) and must not erase the
   * scheduled-retry bookkeeping; every other outcome ends the episode.
   */
  lastTerminal: "transient" | "success" | "other" | null;
}

export type TransientTurnRetryDecision =
  | {
      readonly kind: "retry";
      readonly attempt: number;
      readonly reason: string;
      /** "Retrying (n/N) — reason" for the live session stop reason. */
      readonly inFlightText: string;
      /** How long to wait before re-issuing the turn. */
      readonly delayMs: number;
    }
  | {
      readonly kind: "exhausted";
      readonly reason: string;
      /** The terminal stop reason to persist on the session. */
      readonly exhaustedText: string;
    }
  | {
      readonly kind: "persist-reason";
      readonly reason: string;
    }
  | undefined;

export interface TransientTurnRetryTracker {
  readonly state: Map<string, TransientTurnRetryState>;
  /** A host-watchdog `runtime.warning` armed for a turn. */
  readonly onStallWarning: (
    threadId: string,
    turnId: string | undefined,
    payload: RuntimeWarningLike,
  ) => void;
  /** Any `turn.started` for the thread. */
  readonly onTurnStarted: (threadId: string) => void;
  /** `thread.turn-interrupt-requested` (user or cascade stop). */
  readonly onInterruptRequested: (threadId: string) => void;
  /** A new user message ends the current failure episode. */
  readonly onUserMessage: (threadId: string) => void;
  /** `turn.aborted` / `turn.completed` / `session.exited` for the thread. */
  readonly onTurnTerminal: (
    threadId: string,
    turnId: string | undefined,
    event: { readonly type: string; readonly payload: unknown },
  ) => TransientTurnRetryDecision;
}

export interface TransientTurnRetryTrackerOptions {
  /**
   * Delay resolver for a retry attempt. Defaults to the static backoff
   * ladder; the Live layer supplies the directive-aware
   * `transientTurnRetryDelayMs` so reservation `retry_after_seconds`
   * directives schedule the retry at their expiry.
   */
  readonly delayMs?: (attempt: number, reason: string, directiveSeconds: number | null) => number;
}

export function createTransientTurnRetryTracker(
  options: TransientTurnRetryTrackerOptions = {},
): TransientTurnRetryTracker {
  const state = new Map<string, TransientTurnRetryState>();
  const resolveDelay =
    options.delayMs ??
    ((attempt, _reason, _directiveSeconds) => transientTurnRetryBackoffMs(attempt));

  const entryFor = (threadId: string): TransientTurnRetryState => {
    let entry = state.get(threadId);
    if (entry === undefined) {
      entry = { attempts: 0, stall: null, userStopped: false, lastTerminal: null };
      state.set(threadId, entry);
    }
    return entry;
  };

  return {
    state,

    onStallWarning(threadId, turnId, payload) {
      const stall = readWatchdogStallWarning(payload);
      if (stall === null || turnId === undefined) return;
      // Only mark a stall for the thread's current in-flight turn — a late
      // warning for an already-settled turn must not arm a retry.
      const entry = entryFor(threadId);
      entry.stall = { turnId, reason: watchdogStallReason(stall.inactivitySeconds) };
    },

    onTurnStarted(threadId) {
      const entry = entryFor(threadId);
      // A new turn: the previous stop (user or otherwise) is consumed; the
      // attempt counter survives only for the auto-retry turns this reactor
      // itself issued (it re-arms on the SAME episode) — but a user-stopped
      // flag must clear so a later provider stall is retriable again.
      entry.userStopped = false;
      // The session/turn episode re-armed: a later session.exited is a
      // fresh death again, not a continuation of a prior one.
      entry.lastTerminal = null;
    },

    onInterruptRequested(threadId) {
      // User/cascade stop: this thread's in-flight turn is over on purpose.
      // Nothing may resurrect it until a genuinely new turn starts.
      const entry = entryFor(threadId);
      entry.userStopped = true;
      entry.stall = null;
    },

    onUserMessage(threadId) {
      // A fresh user message starts a new episode: drop the retry bookkeeping.
      state.delete(threadId);
    },

    onTurnTerminal(threadId, turnId, event) {
      const entry = entryFor(threadId);

      if (event.type === "session.exited") {
        // The provider session process is gone. For a TRANSIENT death the
        // scheduled re-issue must survive (the resume path starts a FRESH
        // session); any other outcome ends the episode.
        const entry = state.get(threadId);
        if (entry === undefined || entry.lastTerminal !== "transient") {
          state.delete(threadId);
        }
        return undefined;
      }

      if (event.type === "turn.aborted") {
        const payload = event.payload as { readonly reason?: unknown } | null | undefined;
        const abortReason =
          typeof payload?.reason === "string" && payload.reason.trim().length > 0
            ? payload.reason
            : null;
        const stalled = stallDecisionFor(entry, turnId, resolveDelay);
        if (stalled !== null && !entry.userStopped) {
          // The host watchdog stalled this turn: transient by definition.
          entry.lastTerminal = "transient";
          return stalled;
        }
        entry.lastTerminal = "other";
        if (entry.userStopped) {
          // User/cascade stop: clear the flag for the next turn; no retry.
          entry.userStopped = false;
          return undefined;
        }
        // Provider-side abort without a user stop: not retried, but the
        // reason must not dead-end into a bare button.
        if (abortReason !== null) {
          return { kind: "persist-reason", reason: truncateStopReason(abortReason) };
        }
        return undefined;
      }

      if (event.type !== "turn.completed") return undefined;
      const payload = event.payload as TurnCompletedLike | null | undefined;
      if (payload === undefined || payload === null) return undefined;
      if (payload.state === "completed") {
        // Success: the episode (and any retry budget spent) is over.
        state.delete(threadId);
        return undefined;
      }
      const failure = classifyTransientTurnFailure(payload);
      if (failure !== null) {
        entry.lastTerminal = "transient";
        return decisionForTransient(entry, failure.reason, resolveDelay, failure.directiveSeconds);
      }
      if (payload.state === "interrupted" || payload.state === "cancelled") {
        // NOTE: some providers (Claude) end a WATCHDOG-stalled turn with a
        // `turn.completed` state "interrupted" rather than `turn.aborted` —
        // the stall marker check therefore applies here too.
        const stalled = stallDecisionFor(entry, turnId, resolveDelay);
        if (stalled !== null && !entry.userStopped) {
          entry.lastTerminal = "transient";
          return stalled;
        }
        entry.lastTerminal = "other";
        if (entry.userStopped) {
          entry.userStopped = false;
          return undefined;
        }
        // The turn ended incomplete on the provider side (not a user stop —
        // those arrive as interrupt-requested before the terminal event). Do
        // not retry, but surface WHY instead of a bare Continue button.
        const stopReason =
          typeof payload.stopReason === "string" && payload.stopReason.trim().length > 0
            ? payload.stopReason
            : typeof payload.errorMessage === "string" && payload.errorMessage.trim().length > 0
              ? payload.errorMessage
              : "Turn ended without completing";
        return { kind: "persist-reason", reason: truncateStopReason(stopReason) };
      }
      // Terminal, non-transient failure: ingestion already persists the
      // provider's error text on the session; the retry episode is over.
      entry.stall = null;
      entry.attempts = 0;
      entry.lastTerminal = "other";
      return undefined;
    },
  };
}

function decisionForTransient(
  entry: TransientTurnRetryState,
  reason: string,
  resolveDelay: (attempt: number, reason: string, directiveSeconds: number | null) => number,
  directiveSeconds?: number | null,
): TransientTurnRetryDecision {
  if (entry.attempts >= MAX_SESSION_TRANSIENT_RETRIES) {
    return {
      kind: "exhausted",
      reason,
      exhaustedText: transientRetryExhaustedText(reason),
    };
  }
  entry.attempts += 1;
  // Directive-scheduled retries advertise the wait in the live stop reason
  // ("… next attempt in ~Ns"); blind-backoff retries keep the plain shape.
  const directive = directiveSeconds ?? null;
  const delayMs = resolveDelay(entry.attempts, reason, directive);
  const directiveMs = directive === null ? undefined : delayMs;
  return {
    kind: "retry",
    attempt: entry.attempts,
    reason,
    delayMs,
    inFlightText: transientRetryInFlightText(entry.attempts, reason, directiveMs),
  };
}

/**
 * Consume the pending stall marker if it matches this terminal turn (the
 * watchdog only fires for the armed turn, so a marker present at terminal
 * time means THIS turn was the one that stalled). Returns the transient
 * decision, or null when no marker applies. A stale marker for a different
 * turn is cleared, not matched.
 */
function stallDecisionFor(
  entry: TransientTurnRetryState,
  turnId: string | undefined,
  resolveDelay: (attempt: number, reason: string, directiveSeconds: number | null) => number,
): TransientTurnRetryDecision | null {
  if (entry.stall === null) return null;
  const matches = turnId === undefined || entry.stall.turnId === turnId;
  const reason = entry.stall.reason;
  entry.stall = null;
  if (!matches) return null;
  return decisionForTransient(entry, reason, resolveDelay);
}

// ---------------------------------------------------------------------------
// Live wiring
// ---------------------------------------------------------------------------

/**
 * The Live layer: subscribes the tracker to the provider runtime event
 * stream and the orchestration domain event stream, then executes the
 * tracker's decisions — persisting the stop reason on the thread session and
 * dispatching `thread.turn.resume` (the Continue path) after a bounded
 * backoff. All dispatches fail-open: a retry that cannot land leaves the
 * thread exactly where the Continue button would have found it.
 */
export const T3TeamThreadTransientTurnRetryLive = Layer.effectDiscard(
  Effect.gen(function* () {
    const engine = yield* OrchestrationEngineService;
    const query = yield* ProjectionSnapshotQuery;
    const providerService = yield* ProviderService;
    const tracker = createTransientTurnRetryTracker({
      // Directive-aware scheduling: a reservation error carrying
      // retry_after_seconds waits until that expiry; anything else takes
      // the backoff ladder (env-overridable for e2e).
      delayMs: (attempt, _reason, directiveSeconds) =>
        transientTurnRetryDelayMs(attempt, directiveSeconds, backoffOverride),
    });

    const backoffOverrideRaw = process.env.T3TEAM_TRANSIENT_TURN_RETRY_BACKOFF_MS;
    const backoffOverride =
      backoffOverrideRaw === undefined
        ? undefined
        : (() => {
            const parsed = Number.parseInt(backoffOverrideRaw, 10);
            return Number.isFinite(parsed) ? parsed : undefined;
          })();

    const loadThread = (threadId: string): Effect.Effect<Option.Option<OrchestrationThread>> =>
      query
        .getThreadDetailById(ThreadId.make(threadId))
        .pipe(Effect.orElseSucceed(() => Option.none()));

    const lastUserMessageId = (thread: OrchestrationThread): string | null => {
      for (let i = thread.messages.length - 1; i >= 0; i -= 1) {
        const message = thread.messages[i];
        if (message !== undefined && message.role === "user") return message.id;
      }
      return null;
    };

    const resumableShape = (thread: OrchestrationThread, messageId: string): boolean => {
      const lastMessage = thread.messages.at(-1);
      const lastTurnIncomplete =
        thread.latestTurn !== null &&
        (thread.latestTurn.state === "interrupted" || thread.latestTurn.state === "error");
      return (lastMessage?.id === messageId || lastTurnIncomplete) && thread.messages.length > 0;
    };

    const sessionFrom = (
      thread: OrchestrationThread,
      lastError: string,
    ): OrchestrationSession | null => {
      if (thread.session === null) return null;
      return {
        ...thread.session,
        lastError,
        updatedAt: DateTime.formatIso(DateTime.nowUnsafe()),
      };
    };

    const dispatchSessionSet = (threadId: string, session: OrchestrationSession) =>
      engine.dispatch({
        type: "thread.session.set",
        commandId: CommandId.make(`server:t3team:transient-retry:${t3teamRandomUUID()}`),
        threadId: ThreadId.make(threadId),
        session,
        createdAt: DateTime.formatIso(DateTime.nowUnsafe()),
      });

    const dispatchResume = (threadId: string, messageId: string) =>
      engine.dispatch({
        type: "thread.turn.resume",
        commandId: CommandId.make(`server:t3team:transient-retry:${t3teamRandomUUID()}`),
        threadId: ThreadId.make(threadId),
        messageId: MessageId.make(messageId),
        createdAt: DateTime.formatIso(DateTime.nowUnsafe()),
      });

    const executeDecision = (
      threadId: string,
      decision: TransientTurnRetryDecision,
    ): Effect.Effect<void> =>
      Effect.gen(function* () {
        const d = decision;
        if (d === undefined) return;
        if (d.kind === "persist-reason") {
          const thread = Option.getOrUndefined(yield* loadThread(threadId));
          if (thread === undefined) return;
          // Only fill an EMPTY stop reason — ingestion's provider error text
          // (when it set one) is more specific and wins.
          if (thread.session?.lastError !== null && thread.session?.lastError !== undefined) return;
          const session = sessionFrom(thread, d.reason);
          if (session === null) return;
          yield* dispatchSessionSet(threadId, session).pipe(
            Effect.catchCause((cause) =>
              Effect.logWarning("transient-retry: persist stop reason failed", {
                threadId,
                cause: Cause.pretty(cause),
              }),
            ),
          );
          return;
        }
        if (d.kind === "exhausted") {
          // Same settle as the retry path: the terminal ingestion's own
          // session sets (turn.completed → ready, session.exited → stopped)
          // null/carry lastError and race this reactor; write the final
          // reason on top of the FRESH settled session so it survives.
          yield* Effect.sleep(Duration.millis(IN_FLIGHT_SETTLE_MS));
          const exhaustedThread = Option.getOrUndefined(yield* loadThread(threadId));
          if (exhaustedThread === undefined) return;
          const session = sessionFrom(exhaustedThread, d.exhaustedText);
          if (session === null) return;
          yield* dispatchSessionSet(threadId, session).pipe(
            Effect.catchCause((cause) =>
              Effect.logWarning("transient-retry: persist exhausted reason failed", {
                threadId,
                cause: Cause.pretty(cause),
              }),
            ),
          );
          return;
        }

        // "retry": let the terminal ingestion's own session sets settle
        // first (IN_FLIGHT_SETTLE_MS), then surface the live reason on top
        // of the FRESH settled session — the stop reason must be visible
        // even if the re-issue later bails — and re-issue the turn after the
        // decision's delay, re-validated against fresh thread state so a
        // user Continue, a user stop, or a new message between the stop and
        // the retry always wins.
        yield* Effect.sleep(Duration.millis(IN_FLIGHT_SETTLE_MS));
        const settled = Option.getOrUndefined(yield* loadThread(threadId));
        if (settled === undefined) return;
        const session = sessionFrom(settled, d.inFlightText);
        if (session === null) return;
        yield* dispatchSessionSet(threadId, session).pipe(
          Effect.catchCause((cause) =>
            Effect.logWarning("transient-retry: persist in-flight reason failed", {
              threadId,
              cause: Cause.pretty(cause),
            }),
          ),
        );
        // Episode anchor: the user message we intend to re-run. A newer user
        // message (or a settled reply to this one) invalidates the episode.
        const episodeMessageId = lastUserMessageId(settled);
        if (episodeMessageId === null) return;

        yield* Effect.sleep(Duration.millis(d.delayMs));
        const fresh = Option.getOrUndefined(yield* loadThread(threadId));
        if (fresh === undefined) return;
        const status = fresh.session?.status;
        // Only abort when a live session is BUSY: a user Continue or a newer
        // turn is in flight. "stopped" is exactly the post-watchdog state we
        // recover from (the resume path starts a fresh provider session);
        // "ready"/"idle"/"interrupted"/"error" all resume cleanly.
        if (status === "running" || status === "starting") {
          yield* Effect.logInfo("transient-retry: re-validate bail", {
            threadId,
            why: "busy",
            status,
          });
          return;
        }
        // The episode must be unbroken: same pending user message, and the
        // tracker still carries this exact attempt (a newer user message or a
        // settled turn reset/erased it).
        if (lastUserMessageId(fresh) !== episodeMessageId) {
          yield* Effect.logInfo("transient-retry: re-validate bail", {
            threadId,
            why: "new-user-message",
            episodeMessageId,
            now: lastUserMessageId(fresh),
          });
          return;
        }
        if (tracker.state.get(threadId)?.attempts !== d.attempt) {
          yield* Effect.logInfo("transient-retry: re-validate bail", {
            threadId,
            why: "attempts-mismatch",
            attempt: d.attempt,
            tracker: tracker.state.get(threadId)?.attempts,
          });
          return;
        }
        if (!resumableShape(fresh, episodeMessageId)) {
          yield* Effect.logInfo("transient-retry: re-validate bail", {
            threadId,
            why: "not-resumable",
            lastMessageId: fresh.messages.at(-1)?.id,
            latestTurn: fresh.latestTurn,
          });
          return;
        }
        yield* Effect.logInfo("transient-retry: re-issuing turn after transient provider failure", {
          threadId,
          attempt: d.attempt,
          reason: d.reason,
        });
        yield* dispatchResume(threadId, episodeMessageId).pipe(
          Effect.catchCause((cause) =>
            Effect.logWarning(
              "transient-retry: resume dispatch failed; leaving thread for manual Continue",
              {
                threadId,
                attempt: d.attempt,
                cause: Cause.pretty(cause),
              },
            ),
          ),
        );
      });

    const onRuntimeEvent = (event: ProviderRuntimeEvent): Effect.Effect<void> =>
      Effect.gen(function* () {
        const threadId = event.threadId;
        switch (event.type) {
          case "runtime.warning":
            tracker.onStallWarning(threadId, event.turnId, event.payload);
            return;
          case "turn.started":
            tracker.onTurnStarted(threadId);
            return;
          case "turn.aborted":
          case "turn.completed":
          case "session.exited": {
            const decision = tracker.onTurnTerminal(threadId, event.turnId, {
              type: event.type,
              payload: event.payload,
            });
            if (decision === undefined) return;
            yield* executeDecision(threadId, decision).pipe(
              Effect.catchCause((cause) =>
                Effect.logWarning("transient-retry: decision execution failed", {
                  threadId,
                  eventType: event.type,
                  cause: Cause.pretty(cause),
                }),
              ),
            );
            return;
          }
          default:
            return;
        }
      });

    const onDomainEvent = (event: {
      readonly type: string;
      readonly payload: unknown;
    }): Effect.Effect<void> =>
      Effect.gen(function* () {
        const payload = event.payload as { readonly threadId?: unknown } | null | undefined;
        if (typeof payload?.threadId !== "string") return;
        const threadId = payload.threadId;
        if (event.type === "thread.turn-interrupt-requested") {
          tracker.onInterruptRequested(threadId);
        } else if (event.type === "thread.message-sent") {
          const role = (payload as { role?: unknown }).role;
          if (role === "user") tracker.onUserMessage(threadId);
        }
      });

    yield* Effect.forkScoped(
      Stream.runForEach(providerService.streamEvents, onRuntimeEvent).pipe(
        Effect.catchCause((cause) =>
          Cause.hasInterruptsOnly(cause)
            ? Effect.failCause(cause)
            : Effect.logWarning("transient-retry: runtime event stream failed", { cause }),
        ),
      ),
    );
    yield* Effect.forkScoped(
      Stream.runForEach(engine.streamDomainEvents, onDomainEvent).pipe(
        Effect.catchCause((cause) =>
          Cause.hasInterruptsOnly(cause)
            ? Effect.failCause(cause)
            : Effect.logWarning("transient-retry: domain event stream failed", { cause }),
        ),
      ),
    );
  }),
);
