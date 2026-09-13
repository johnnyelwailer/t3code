// @effect-diagnostics globalDate:off -- the marker stamps wall-clock time.
/**
 * Epoch-scoped durable dedup for "a watched target reached a terminal state,
 * report it ONCE." One mechanism, two call sites (GHE #157 family): the
 * abnormal-stop notification to a child's parent
 * (t3team-childAbnormalStopDedup.ts) and a silence watch reporting its target
 * terminal (t3team-threadSilenceWatchReactor.ts). Both share the defect: one
 * real stop can publish several terminal events, and a restart re-resolves the
 * same target, each of which used to fire a fresh notification. This module
 * owns the "already notified" decision + its durable marker (a per-key
 * `thread.activity.append`, payload `{ dedupKey, resumeThreadId, eventSequence,
 * ... }`), rehydrated into an in-memory map at boot.
 *
 * Epoch scoping (the critical correctness detail): the marker is valid only
 * until the OBSERVED thread resumes. A `running`/`starting` transition starts
 * a fresh epoch, so a LATER terminal stop on a new turn still notifies. The
 * observed thread is the child for the abnormal-stop call site, the watched
 * target for the silence-watch call site.
 *
 * @module t3team-terminalNotifyDedup
 */
import {
  CommandId,
  EventId,
  ThreadId,
  type OrchestrationEvent,
} from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";

import type { OrchestrationEngineShape } from "./orchestration/Services/OrchestrationEngine.ts";
import { t3teamRandomUUID } from "./t3team-random.ts";

/** One notified terminal state: its trigger sequence and the observed thread's last resume. */
export interface TerminalNotifyState {
  readonly notifiedSeq: number;
  readonly lastResumeSeq: number;
}

/**
 * Should the terminal state be reported? Yes when there is no prior report for
 * this key, or the observed thread resumed after the last report (a new epoch).
 * Two terminal events for the SAME stop share an epoch and dedup to one.
 */
export function terminalNotifyNeedsNotify(
  state: TerminalNotifyState | undefined,
  terminalSeq: number,
): boolean {
  if (state === undefined) return true;
  return state.lastResumeSeq > state.notifiedSeq;
}

export interface TerminalNotifyLedgerOptions {
  readonly engine: Pick<OrchestrationEngineShape, "dispatch">;
  /** The durable marker activity kind (distinct per call site). */
  readonly markerKind: string;
  /** Command-id prefix for the marker dispatch. */
  readonly markerCommandPrefix: string;
  /** Human-facing summary line for the marker activity. */
  readonly markerSummary: string;
}

export interface TerminalNotifyLedger {
  /**
   * Epoch boundary: a `running`/`starting` transition on `threadId` raises its
   * resume sequence so a later terminal stop for any key observing it re-fires.
   */
  readonly noteResume: (threadId: string, seq: number) => void;
  /** Rebuild the in-memory map from a persisted event replay at boot. */
  readonly rehydrate: (events: ReadonlyArray<OrchestrationEvent>) => void;
  /**
   * Run `doNotify` only when a notify is owed for `key` at `terminalSeq`; then
   * record it in memory and append the durable marker on `markerThreadId`.
   */
  readonly notify: (input: {
    readonly key: string;
    readonly markerThreadId: string;
    readonly resumeThreadId: string;
    readonly terminalSeq: number;
    readonly markerPayload: Readonly<Record<string, unknown>>;
    readonly doNotify: Effect.Effect<void>;
    /** Per-call marker summary; falls back to the ledger's `markerSummary`. */
    readonly markerSummary?: string;
  }) => Effect.Effect<void>;
}

export function makeTerminalNotifyLedger(options: TerminalNotifyLedgerOptions): TerminalNotifyLedger {
  // Resume is tracked per observed thread; a key's state remembers which thread
  // it observes so two keys sharing a target share its epoch.
  const resumeByThread = new Map<string, number>();
  const notifiedByKey = new Map<string, { readonly notifiedSeq: number; readonly resumeThreadId: string }>();

  const stateFor = (key: string): TerminalNotifyState | undefined => {
    const entry = notifiedByKey.get(key);
    if (entry === undefined) return undefined;
    return { notifiedSeq: entry.notifiedSeq, lastResumeSeq: resumeByThread.get(entry.resumeThreadId) ?? 0 };
  };

  const foldEvent = (event: OrchestrationEvent): void => {
    if (event.type === "thread.session-set") {
      const status = event.payload.session.status;
      if (status !== "running" && status !== "starting") return;
      const threadId = event.payload.threadId;
      resumeByThread.set(threadId, Math.max(resumeByThread.get(threadId) ?? 0, event.sequence));
      return;
    }
    if (event.type !== "thread.activity-appended") return;
    const activity = event.payload.activity;
    if (activity.kind !== options.markerKind) return;
    const payload = activity.payload as
      | { readonly dedupKey?: unknown; readonly resumeThreadId?: unknown; readonly eventSequence?: unknown }
      | null
      | undefined;
    if (!payload || typeof payload.dedupKey !== "string" || typeof payload.eventSequence !== "number")
      return;
    const resumeThreadId =
      typeof payload.resumeThreadId === "string" ? payload.resumeThreadId : event.payload.threadId;
    notifiedByKey.set(payload.dedupKey, {
      notifiedSeq: payload.eventSequence,
      resumeThreadId,
    });
  };

  return {
    noteResume: (threadId, seq) => {
      resumeByThread.set(threadId, Math.max(resumeByThread.get(threadId) ?? 0, seq));
    },
    rehydrate: (events) => {
      for (const event of events) foldEvent(event);
    },
    notify: ({ key, markerThreadId, resumeThreadId, terminalSeq, markerPayload, doNotify, markerSummary }) =>
      Effect.gen(function* () {
        if (!terminalNotifyNeedsNotify(stateFor(key), terminalSeq)) return;
        yield* doNotify;
        notifiedByKey.set(key, { notifiedSeq: terminalSeq, resumeThreadId });
        const nowIso = DateTime.formatIso(DateTime.nowUnsafe());
        yield* options.engine
          .dispatch({
            type: "thread.activity.append",
            commandId: CommandId.make(`${options.markerCommandPrefix}:${t3teamRandomUUID()}`),
            threadId: ThreadId.make(markerThreadId),
            activity: {
              id: EventId.make(t3teamRandomUUID()),
              tone: "info",
              kind: options.markerKind,
              summary: markerSummary ?? options.markerSummary,
              payload: { dedupKey: key, resumeThreadId, eventSequence: terminalSeq, ...markerPayload },
              turnId: null,
              createdAt: nowIso,
            },
            createdAt: nowIso,
          })
          .pipe(
            Effect.catchCause((cause) =>
              Effect.logWarning("terminal-notify dedup marker failed", { key, cause: Cause.pretty(cause) }),
            ),
          );
      }),
  };
}
