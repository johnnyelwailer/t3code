import type {
  EnvironmentId,
  OrchestrationV2ThreadProjection,
  OrchestrationV2UserInputQuestion,
  RuntimeRequestId,
  ThreadId,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";

export interface AnsweredUserInput {
  readonly requestId: RuntimeRequestId;
  readonly resolvedAtMs: number | null;
  readonly questions: ReadonlyArray<OrchestrationV2UserInputQuestion>;
  readonly answers: Record<string, unknown>;
}

export interface ThreadAnswersResolved {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  /** Pending when this stream last saw the thread live, answered since: by anyone, on any device. */
  readonly live: ReadonlyArray<AnsweredUserInput>;
  /** Already resolved when first seen (a replay: another device, or while this client was away). */
  readonly missed: ReadonlyArray<AnsweredUserInput>;
}

const listeners = new Set<(event: ThreadAnswersResolved) => void>();

/** Hosts hear every answered user-input request of a synchronized thread, each exactly once per stream. */
export function onThreadAnswersResolved(listener: (event: ThreadAnswersResolved) => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function makeThreadAnswersAnnouncer(environmentId: EnvironmentId, threadId: ThreadId) {
  let pending: ReadonlySet<RuntimeRequestId> | null = null;
  const handled = new Set<RuntimeRequestId>();
  return (projection: Pick<OrchestrationV2ThreadProjection, "runtimeRequests" | "turnItems">) => {
    const live: AnsweredUserInput[] = [];
    const missed: AnsweredUserInput[] = [];
    for (const request of projection.runtimeRequests) {
      if (request.kind !== "user_input" || request.status !== "resolved") continue;
      if (request.answers === undefined || handled.has(request.id)) continue;
      const item = projection.turnItems.findLast(
        (candidate) =>
          candidate.type === "user_input_request" && candidate.requestId === request.id,
      );
      if (item === undefined || item.type !== "user_input_request") continue;
      handled.add(request.id);
      (pending?.has(request.id) === true ? live : missed).push({
        requestId: request.id,
        resolvedAtMs:
          request.resolvedAt === null ? null : DateTime.toEpochMillis(request.resolvedAt),
        questions: item.questions,
        answers: request.answers,
      });
    }
    pending = new Set(
      projection.runtimeRequests.flatMap((r) => (r.status === "pending" ? [r.id] : [])),
    );
    if (live.length === 0 && missed.length === 0) return;
    for (const listener of listeners) {
      try {
        listener({ environmentId, threadId, live, missed });
      } catch (error) {
        queueMicrotask(() => {
          throw error;
        });
      }
    }
  };
}
