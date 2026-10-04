import type { ThreadId, ProjectId } from "@t3tools/contracts";
import type * as Effect from "effect/Effect";

import type { OrchestrationEngineShape } from "./orchestration/Services/OrchestrationEngine.ts";
import type { ProjectionSnapshotQueryShape } from "./orchestration/Services/ProjectionSnapshotQuery.ts";
import type { ThreadBackgroundLiveness } from "./orchestration/ThreadBackgroundLiveness.ts";
import type { ThreadSilenceActivityState } from "./orchestration/ThreadSilenceWatchdog.ts";
import type { TerminalNotifyLedger } from "./t3team-terminalNotifyDedup.ts";
import type { TerminalNoticeGate } from "./t3team-terminalNoticeGate.ts";
import type { ThreadSilenceWatchRecord } from "./t3team-threadSilenceWatch.ts";
import type { ThreadSilenceWatchIndex } from "./t3team-threadSilenceWatchIndex.ts";

export interface ThreadShellLike {
  readonly id: ThreadId;
  readonly projectId: ProjectId;
  readonly title: string;
  readonly updatedAt: string;
  readonly session?: { readonly status?: string } | null;
}

/** Deps the silence emission leaf needs (dispatch on the watching thread). */
export interface ThreadSilenceWatchDetectedDeps {
  readonly engine: OrchestrationEngineShape;
  readonly query: ProjectionSnapshotQueryShape;
}

export interface ThreadSilenceWatchEmitterDeps {
  readonly engine: OrchestrationEngineShape;
  readonly query: ProjectionSnapshotQueryShape;
  readonly index: ThreadSilenceWatchIndex;
  readonly dedup: TerminalNotifyLedger;
  readonly getActivityState: (threadId: string) => ThreadSilenceActivityState | undefined;
  readonly seedActivity: (threadId: string, lastActivityAtMs: number) => void;
  readonly getLiveness?: (threadId: string) => ThreadBackgroundLiveness;
  /**
   * Canonical quiet-window coalescing gate for terminal notices. When omitted,
   * the emitter creates a wall-clock instance; tests inject a controllable one.
   */
  readonly noticeGate?: TerminalNoticeGate;
}

export interface ThreadSilenceWatchEmitter {
  readonly emitSilence: (record: ThreadSilenceWatchRecord, nowMs: number) => Effect.Effect<void>;
  readonly resolveStopped: (
    targetThreadId: string,
    stoppedStatus: string,
    triggerSeq: number,
  ) => Effect.Effect<void>;
  readonly onRegistered: (
    record: ThreadSilenceWatchRecord,
    triggerSeq: number,
  ) => Effect.Effect<void>;
}
