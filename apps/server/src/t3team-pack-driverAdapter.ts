/**
 * Pack driver adapter bridge.
 *
 * Wraps a pack `PackProviderInstance` (Promise / AsyncIterable surface) as a
 * host `ProviderAdapterShape`. Promise methods become Effects; rejections map
 * to `ProviderAdapterRequestError`. Session/turn payloads are decoded against
 * the contracts schemas and re-stamped with the bridged driver kind + instance
 * id so downstream correlation stays consistent. `resumeCursor` is opaque and
 * flows through untouched.
 *
 * The event stream is materialized lazily per subscription (a synchronous
 * throw from `events()` becomes a logged termination, not a defect) and is
 * tied to `interruptSignal` so it ends when the instance scope closes — the
 * termination `ProviderService.reconcileInstanceSubscriptions` relies on.
 *
 * @module t3team-pack-driverAdapter
 */
import {
  ProviderSession,
  ProviderTurnStartResult,
  ThreadId,
  type ProviderDriverKind,
  type ProviderInstanceId,
  type ProviderRuntimeEvent,
  type ProviderSessionStartInput,
} from "@t3tools/contracts";
import type { PackProviderInstance } from "@t3team/packs";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";

import { ProviderAdapterRequestError, type ProviderAdapterError } from "./provider/Errors.ts";
import type {
  ProviderAdapterShape,
  ProviderThreadSnapshot,
} from "./provider/Services/ProviderAdapter.ts";
import { packEventsToStream } from "./t3team-pack-driverEvents.ts";
import { readPackMcpSession } from "./t3team-pack-driverMcp.ts";

const decodeSession = Schema.decodeUnknownEffect(ProviderSession);
const decodeTurn = Schema.decodeUnknownEffect(ProviderTurnStartResult);

const defined = <K extends string, V>(key: K, value: V | undefined): Partial<Record<K, V>> =>
  value === undefined ? {} : ({ [key]: value } as Record<K, V>);

export const makePackProviderAdapter = (input: {
  readonly packInstance: PackProviderInstance;
  readonly driverKind: ProviderDriverKind;
  readonly instanceId: ProviderInstanceId;
  /** Completes when the instance scope closes; ends the event stream. */
  readonly interruptSignal: Effect.Effect<void>;
}): ProviderAdapterShape<ProviderAdapterError> => {
  const { packInstance, driverKind, instanceId } = input;

  const requestError = (method: string) => (cause: unknown) =>
    new ProviderAdapterRequestError({
      provider: driverKind,
      method,
      detail: cause instanceof Error ? cause.message : String(cause),
      cause,
    });

  const attempt = <A>(method: string, run: () => Promise<A>) =>
    Effect.tryPromise({ try: run, catch: requestError(method) });

  const stampSession = (raw: unknown) =>
    DateTime.now.pipe(
      Effect.map(DateTime.formatIso),
      Effect.flatMap((now) =>
        decodeSession({
          createdAt: now,
          updatedAt: now,
          ...(raw as Record<string, unknown>),
          provider: driverKind,
          providerInstanceId: instanceId,
        }),
      ),
    );

  const events = Stream.unwrap(
    // `Effect.sync` so a synchronous throw from `events()` becomes a defect we
    // catch into a logged, empty stream rather than escaping as an unhandled
    // defect. `events()` is thus materialized lazily per subscription.
    Effect.sync(() =>
      packEventsToStream({ events: packInstance.events(), driverKind, instanceId }),
    ).pipe(
      Effect.catchCause((cause) =>
        Effect.logError("Pack provider events() threw before streaming", {
          driverKind,
          instanceId,
          cause,
        }).pipe(Effect.as(Stream.empty as Stream.Stream<ProviderRuntimeEvent>)),
      ),
    ),
  ).pipe(Stream.interruptWhen(input.interruptSignal));

  return {
    provider: driverKind,
    capabilities: {
      sessionModelSwitch: "unsupported",
      // Pack drivers that own turn-stall recovery opt out of the host's
      // watchdog re-issue (GHE #175/#176): they chain the watchdog abort into
      // their own bounded recovery and visualize it themselves. Without the
      // flag, the host re-issues stalled turns on its own budget.
      ...(packInstance.ownsTurnStallRecovery ? { turnStallRecoveryOwned: true } : {}),
    },
    startSession: (startInput: ProviderSessionStartInput) =>
      attempt("startSession", () =>
        packInstance.startSession({
          threadId: startInput.threadId,
          runtimeMode: startInput.runtimeMode,
          ...readPackMcpSession(startInput.threadId),
          ...defined("cwd", startInput.cwd),
          ...defined("resumeCursor", startInput.resumeCursor),
          ...defined("modelSelection", startInput.modelSelection),
          ...defined("approvalPolicy", startInput.approvalPolicy),
          ...defined("sandboxMode", startInput.sandboxMode),
        }),
      ).pipe(
        Effect.flatMap((session) =>
          stampSession(session).pipe(Effect.mapError(requestError("startSession"))),
        ),
      ),
    sendTurn: (turnInput) =>
      attempt("sendTurn", () =>
        packInstance.sendTurn({
          threadId: turnInput.threadId,
          ...defined("input", turnInput.input),
          ...defined("attachments", turnInput.attachments),
          ...defined("modelSelection", turnInput.modelSelection),
          ...defined("interactionMode", turnInput.interactionMode),
          ...defined("turnOrigin", turnInput.turnOrigin),
        }),
      ).pipe(
        Effect.flatMap((result) =>
          decodeTurn({ ...(result as Record<string, unknown>), threadId: turnInput.threadId }).pipe(
            Effect.mapError(requestError("sendTurn")),
          ),
        ),
      ),
    interruptTurn: (threadId, turnId, interruptReason) =>
      attempt("interruptTurn", () => packInstance.interruptTurn(threadId, turnId, interruptReason)),
    respondToRequest: (threadId, requestId, decision) =>
      attempt("respondToRequest", () =>
        packInstance.respondToRequest(threadId, requestId, decision),
      ),
    respondToUserInput: (threadId, requestId, answers) =>
      attempt("respondToUserInput", () =>
        packInstance.respondToUserInput(threadId, requestId, answers),
      ),
    stopSession: (threadId) => attempt("stopSession", () => packInstance.stopSession(threadId)),
    listSessions: () =>
      attempt("listSessions", () => packInstance.listSessions()).pipe(
        Effect.flatMap((sessions) => Effect.forEach(sessions, (session) => stampSession(session))),
        Effect.catchCause((cause) =>
          Effect.logWarning("Pack provider listSessions failed", { driverKind, cause }).pipe(
            Effect.as([]),
          ),
        ),
      ),
    hasSession: (threadId) =>
      attempt("hasSession", () => packInstance.hasSession(threadId)).pipe(
        Effect.catchCause((cause) =>
          Effect.logWarning("Pack provider hasSession failed", { driverKind, cause }).pipe(
            Effect.as(false),
          ),
        ),
      ),
    readThread: (threadId) =>
      attempt("readThread", () => packInstance.readThread(threadId)).pipe(
        Effect.flatMap((snapshot) =>
          Effect.try({
            try: () => shapeThreadSnapshot(threadId, snapshot),
            catch: requestError("readThread"),
          }),
        ),
      ),
    rollbackThread: (threadId, numTurns) =>
      attempt("rollbackThread", () => packInstance.rollbackThread(threadId, numTurns)).pipe(
        Effect.flatMap((snapshot) =>
          Effect.try({
            try: () => shapeThreadSnapshot(threadId, snapshot),
            catch: requestError("rollbackThread"),
          }),
        ),
      ),
    stopAll: () =>
      attempt("stopAll", () => packInstance.stopAll()).pipe(
        Effect.catchCause((cause) =>
          Effect.logWarning("Pack provider stopAll failed", { driverKind, cause }).pipe(
            Effect.asVoid,
          ),
        ),
      ),
    streamEvents: events,
  };
};

/** Defensive: tolerates malformed (non-array / non-object) pack thread data. */
const shapeThreadSnapshot = (threadId: ThreadId, snapshot: unknown): ProviderThreadSnapshot => {
  const rawTurns = (snapshot as { readonly turns?: unknown })?.turns;
  const turns = Array.isArray(rawTurns) ? rawTurns : [];
  return {
    threadId,
    turns: turns.map((turn) => {
      const record = (turn ?? {}) as { readonly id?: unknown; readonly items?: unknown };
      return {
        id: (typeof record.id === "string"
          ? record.id
          : "") as ProviderThreadSnapshot["turns"][number]["id"],
        items: Array.isArray(record.items) ? [...record.items] : [],
      };
    }),
  };
};
