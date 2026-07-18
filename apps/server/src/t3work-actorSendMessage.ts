/**
 * Broker helper: deliver a first-class inter-agent ("actor") message from one
 * thread into another. Recorded as an `actor`-role message attributed to the
 * sender (never role `user`/`system`) and raises a delivery intent that drives
 * the receiving thread's agent to react (see t3work-actorMessageReactor.ts).
 * Supersedes the earlier role:"system" stopgap, which surfaced in the target
 * thread but was ignored by its agent.
 *
 * Extracted from the tool broker (like {@link makeStartChildThread}) so the
 * broker live stays small and this logic is unit-addressable.
 *
 * @module t3work-actorSendMessage
 */
import { CommandId, MessageId, NonNegativeInt, ThreadId } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import type { OrchestrationEngineShape } from "./orchestration/Services/OrchestrationEngine.ts";
import type { ProjectionSnapshotQueryShape } from "./orchestration/Services/ProjectionSnapshotQuery.ts";
import { t3workRandomUUID } from "./t3work-random.ts";

const normalizeError = (error: unknown): string =>
  typeof error === "string" ? error : error instanceof Error ? error.message : String(error);

export function makeActorSendMessage(input: {
  readonly query: ProjectionSnapshotQueryShape;
  readonly orchestration: OrchestrationEngineShape;
}) {
  const { query, orchestration } = input;
  return ({
    toThreadId,
    fromThreadId,
    text,
  }: {
    readonly toThreadId: string;
    readonly fromThreadId: string;
    readonly text: string;
  }) =>
    Effect.gen(function* () {
      const body = typeof text === "string" ? text.trim() : "";
      if (body.length === 0) return yield* Effect.fail("A non-empty 'text' is required.");
      if (toThreadId === fromThreadId) {
        return yield* Effect.fail("A thread cannot send an actor message to itself.");
      }
      const target = Option.getOrUndefined(
        yield* query.getThreadDetailById(ThreadId.make(toThreadId)),
      );
      if (!target) return yield* Effect.fail(`Thread ${toThreadId} was not found.`);
      const source = Option.getOrUndefined(
        yield* query.getThreadDetailById(ThreadId.make(fromThreadId)),
      );

      // Loop guard: infer the hop count from the sender's most recent inbound
      // actor message. A fresh (human-initiated) send is hop 0; an agent that
      // reacts to an actor message and messages on carries hop + 1 along the
      // same chain, and inherits its root thread for observability.
      let inboundHop = -1;
      let inboundRoot: string | undefined;
      const senderMessages = source?.messages ?? [];
      for (let index = senderMessages.length - 1; index >= 0; index -= 1) {
        const candidate = senderMessages[index];
        const info = candidate?.t3workExt?.actor;
        if (candidate?.role === "actor" && info && typeof info.hopCount === "number") {
          inboundHop = info.hopCount;
          inboundRoot = info.rootThreadId;
          break;
        }
      }
      const hopCount = inboundHop + 1;
      const rootThreadId = inboundRoot ?? fromThreadId;

      const createdAt = DateTime.formatIso(yield* DateTime.now);
      yield* orchestration.dispatch({
        type: "thread.actor.message",
        commandId: CommandId.make(`server:t3work:actor-message:${t3workRandomUUID()}`),
        threadId: target.id,
        messageId: MessageId.make(t3workRandomUUID()),
        fromThreadId: ThreadId.make(fromThreadId),
        fromTitle: source?.title ?? ThreadId.make(fromThreadId),
        fromProjectId: source?.projectId ?? target.projectId,
        text: body,
        urgency: "normal",
        hopCount: NonNegativeInt.make(hopCount),
        rootThreadId: ThreadId.make(rootThreadId),
        createdAt,
      });
      return {
        ok: true,
        toThreadId: target.id,
        fromThreadId,
        delivered: true,
        urgency: "normal" as const,
        hopCount,
      };
    }).pipe(Effect.mapError(normalizeError));
}
