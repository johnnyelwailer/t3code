/**
 * Broker helper: deliver a first-class inter-agent ("actor") message from one
 * thread into another. Recorded as an `actor`-role message attributed to the
 * sender (never role `user`/`system`) and raises a delivery intent that drives
 * the receiving thread's agent to react (see t3team-actorMessageReactor.ts).
 * Supersedes the earlier role:"system" stopgap, which surfaced in the target
 * thread but was ignored by its agent.
 *
 * Extracted from the tool broker (like {@link makeStartChildThread}) so the
 * broker live stays small and this logic is unit-addressable.
 *
 * @module t3team-actorSendMessage
 */
import { CommandId, MessageId, NonNegativeInt, ThreadId } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import type { OrchestrationEngineShape } from "./orchestration/Services/OrchestrationEngine.ts";
import type { ProjectionSnapshotQueryShape } from "./orchestration/Services/ProjectionSnapshotQuery.ts";
import { deriveActorReplyContext } from "./t3team-actorReactionContext.ts";
import { t3teamRandomUUID } from "./t3team-random.ts";

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
      if (!source) return yield* Effect.fail(`Sender thread ${fromThreadId} was not found.`);
      // Authorization boundary: a caller holding a per-thread MCP credential must
      // not be able to inject a message — and auto-trigger an agent turn — into an
      // unrelated thread in another project. Delivery is scoped to the sender's
      // own project. All designed flows (parent↔child, same-project peers) stay
      // within one project because start_child creates children in the parent's
      // project; genuine cross-project routing would need its own explicit path.
      if (source.projectId !== target.projectId) {
        return yield* Effect.fail(
          "Actor messages can only be delivered to threads in the same project.",
        );
      }

      // The latest user message is the active turn input. Actor reactions stamp
      // their ancestry there; later inbound actor cards cannot reset this chain.
      const { hopCount, rootThreadId } = deriveActorReplyContext(
        source.messages ?? [],
        fromThreadId,
      );

      const createdAt = DateTime.formatIso(yield* DateTime.now);
      yield* orchestration.dispatch({
        type: "thread.actor.message",
        commandId: CommandId.make(`server:t3team:actor-message:${t3teamRandomUUID()}`),
        threadId: target.id,
        messageId: MessageId.make(t3teamRandomUUID()),
        fromThreadId: ThreadId.make(fromThreadId),
        fromTitle: source.title ?? ThreadId.make(fromThreadId),
        fromProjectId: source.projectId,
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
