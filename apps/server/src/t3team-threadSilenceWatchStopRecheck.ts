import { ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import type { ProjectionSnapshotQueryShape } from "./orchestration/Services/ProjectionSnapshotQuery.ts";
import type { ThreadBackgroundLiveness } from "./orchestration/ThreadBackgroundLiveness.ts";
import { shouldStopSilenceWatch } from "./t3team-silenceWatchStop.ts";
import type { ThreadSilenceWatchIndex } from "./t3team-threadSilenceWatchIndex.ts";

interface SessionObservation {
  readonly status: string;
  readonly sequence: number;
}

interface ThreadShellSessionLike {
  readonly session?: { readonly status?: string } | null;
}

export function makeThreadSilenceWatchStopRecheck(deps: {
  readonly query: ProjectionSnapshotQueryShape;
  readonly index: ThreadSilenceWatchIndex;
  readonly getLiveness: (threadId: string) => ThreadBackgroundLiveness;
  readonly resolveStopped: (
    threadId: string,
    status: string,
    sequence: number,
  ) => Effect.Effect<void>;
}) {
  const latestByThread = new Map<string, SessionObservation>();

  const noteSession = (threadId: string, status: string, sequence: number): void => {
    latestByThread.set(threadId, { status, sequence });
  };

  const forgetIfUnwatched = (threadId: string): void => {
    if (deps.index.forTarget(threadId).length === 0) latestByThread.delete(threadId);
  };

  const readStatus = (threadId: string): Effect.Effect<SessionObservation | undefined> => {
    const latest = latestByThread.get(threadId);
    if (latest !== undefined) return Effect.succeed(latest);
    return deps.query.getThreadShellById(ThreadId.make(threadId)).pipe(
      Effect.map((shell) => {
        const status = (Option.getOrUndefined(shell) as ThreadShellSessionLike | undefined)?.session
          ?.status;
        return status === undefined ? undefined : { status, sequence: 0 };
      }),
      Effect.orElseSucceed(() => undefined),
    );
  };

  const recheckPending = Effect.gen(function* () {
    const targetIds = new Set(deps.index.all().map((record) => record.targetThreadId));
    for (const threadId of latestByThread.keys()) {
      if (!targetIds.has(threadId)) latestByThread.delete(threadId);
    }
    for (const threadId of targetIds) {
      const liveness = deps.getLiveness(threadId);
      if (liveness !== null) continue;
      const observed = yield* readStatus(threadId);
      if (!shouldStopSilenceWatch(observed?.status, liveness)) continue;
      yield* deps.resolveStopped(threadId, observed!.status, observed!.sequence);
      latestByThread.delete(threadId);
    }
  });

  return { noteSession, forgetIfUnwatched, recheckPending };
}
