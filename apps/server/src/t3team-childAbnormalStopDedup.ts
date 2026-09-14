/**
 * Abnormal-stop call site of the shared terminal-notify dedup ledger
 * (t3team-terminalNotifyDedup.ts). A child that stops abnormally tells its
 * parent EXACTLY ONCE, re-arming only when the child resumes (running/starting)
 * after the last report — see the ledger's docs for the full reasoning.
 * The same guard also carries the silent-completion notice (the `completed`
 * outcome): one ledger, one marker, both terminal outcomes.
 *
 * The durable marker lands on the CHILD (kind `t3team.child_abnormal_stop_notified`,
 * payload `{ dedupKey, resumeThreadId, eventSequence, outcome }`); the observed
 * thread for the epoch is the child itself.
 *
 * @module t3team-childAbnormalStopDedup
 */
import type { OrchestrationEvent } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import type { OrchestrationEngineShape } from "./orchestration/Services/OrchestrationEngine.ts";
import type { ProjectionSnapshotQueryShape } from "./orchestration/Services/ProjectionSnapshotQuery.ts";
import {
  makeChildAbnormalStopNotifier,
  type ChildTerminalOutcome,
} from "./t3team-childAbnormalStopNotify.ts";
import { makeTerminalNotifyLedger } from "./t3team-terminalNotifyDedup.ts";

/** Durable "already notified" marker kind, appended on the child thread. */
export const CHILD_ABNORMAL_STOP_NOTIFIED_KIND = "t3team.child_abnormal_stop_notified";

/**
 * The marker's human line, outcome-aware: a clean finish must never read like
 * an incident (the marker is visible on the child's timeline).
 */
const markerSummaryFor = (outcome: ChildTerminalOutcome): string =>
  outcome === "completed" ? "Child completion reported to parent" : "Abnormal stop reported to parent";

export interface AbnormalStopGuards {
  /** Epoch boundary: a running/starting transition resets the marker. */
  readonly noteResume: (childThreadId: string, seq: number) => void;
  /** The guarded notifier: reports once per epoch and writes the durable marker. */
  readonly notifyAbnormalStop: (input: {
    readonly childThreadId: string;
    readonly outcome: ChildTerminalOutcome;
    readonly lastError: string | null | undefined;
    readonly eventSequence: number;
  }) => Effect.Effect<void>;
  /** Rebuild the in-memory map from a persisted event replay at boot. */
  readonly rehydrate: (events: ReadonlyArray<OrchestrationEvent>) => void;
}

/**
 * Build the guarded abnormal-stop notifier: a thin call site over the shared
 * ledger, keyed and marker-threaded by the child, observing the child for
 * resumes. Wraps t3team-childAbnormalStopNotify.ts.
 */
export function makeAbnormalStopGuards(deps: {
  readonly engine: OrchestrationEngineShape;
  readonly query: ProjectionSnapshotQueryShape;
}): AbnormalStopGuards {
  const notify = makeChildAbnormalStopNotifier(deps);
  const ledger = makeTerminalNotifyLedger({
    engine: deps.engine,
    markerKind: CHILD_ABNORMAL_STOP_NOTIFIED_KIND,
    markerCommandPrefix: "server:t3team:child-abnormal-stop-marker",
    markerSummary: "Abnormal stop reported to parent",
  });
  return {
    noteResume: (childThreadId, seq) => ledger.noteResume(childThreadId, seq),
    rehydrate: (events) => ledger.rehydrate(events),
    notifyAbnormalStop: ({ childThreadId, outcome, lastError, eventSequence }) =>
      ledger.notify({
        key: childThreadId,
        markerThreadId: childThreadId,
        resumeThreadId: childThreadId,
        terminalSeq: eventSequence,
        markerPayload: { outcome },
        markerSummary: markerSummaryFor(outcome),
        doNotify: notify({ childThreadId, outcome, lastError }),
      }),
  };
}
