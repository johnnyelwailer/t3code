/**
 * Delivery-time render of a delegated-completion wake whose task set changed
 * after the continuation worker rendered it.
 *
 * The worker renders the wake (`DelegatedCompletionWakeRenderer`) before it
 * dispatches, outside the thread lock. When a sibling task later joins the
 * still-queued wake, or one leaves it, the orchestrator rewrites the message
 * under the lock with upstream's default text for the new set: the renderer
 * may be slow and must not run there. `ProviderTurnStartService` calls this
 * once the queued wake has become the starting run — the set can no longer
 * change — so the renderer sees the final cohort and its text is both stored
 * and sent to the provider. A wake that still carries a rendered text, or no
 * renderer override, writes nothing.
 */
import type {
  OrchestrationV2ConversationMessage,
  OrchestrationV2DomainEvent,
  OrchestrationV2Run,
  OrchestrationV2TurnItem,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";

import type { EventSinkV2Shape } from "../orchestration-v2/EventSink.ts";
import type { IdAllocatorV2Shape } from "../orchestration-v2/IdAllocator.ts";
import { delegatedCompletionWakeDetail } from "../orchestration-v2/Orchestrator.ts";
import {
  type DelegatedCompletionWakeRendererShape,
  renderDelegatedCompletionWake,
} from "./t3team-delegatedCompletionWakeRenderer.ts";

export interface DelegatedCompletionWakeRefreshInput {
  readonly renderer: DelegatedCompletionWakeRendererShape;
  readonly eventSink: Pick<EventSinkV2Shape, "writeIfRunCurrent">;
  readonly ids: Pick<IdAllocatorV2Shape["allocate"], "event">;
  /** The starting run's own turn items (`getTurnStartContext`). */
  readonly turnItems: ReadonlyArray<OrchestrationV2TurnItem>;
  readonly run: OrchestrationV2Run;
  readonly message: OrchestrationV2ConversationMessage | undefined;
}

/** Returns the message to deliver: re-rendered when it still carried the default text. */
export const refreshStartingDelegatedCompletionWake = (
  input: DelegatedCompletionWakeRefreshInput,
): Effect.Effect<OrchestrationV2ConversationMessage | undefined> =>
  Effect.gen(function* () {
    const { message, run } = input;
    const completion = message?.delegatedCompletion;
    if (message === undefined || completion === undefined || run.activeAttemptId === null) {
      return message;
    }
    const defaultText = delegatedCompletionWakeDetail(completion.taskIds);
    if (message.text !== defaultText) return message;
    const text = yield* renderDelegatedCompletionWake(input.renderer, {
      threadId: message.threadId,
      parentRunId: completion.parentRunId,
      taskIds: completion.taskIds,
      defaultText,
    });
    if (text === message.text) return message;

    const now = yield* DateTime.now;
    const refreshed: OrchestrationV2ConversationMessage = { ...message, text, updatedAt: now };
    const turnItem = input.turnItems.find(
      (item) => item.type === "user_message" && item.messageId === message.id,
    );
    const base = {
      threadId: message.threadId,
      runId: run.id,
      ...(run.rootNodeId === null ? {} : { nodeId: run.rootNodeId }),
      providerInstanceId: run.providerInstanceId,
      occurredAt: now,
    };
    const events: Array<OrchestrationV2DomainEvent> = [
      {
        ...base,
        id: yield* input.ids.event({ threadId: message.threadId }),
        type: "message.updated",
        payload: refreshed,
      },
    ];
    if (turnItem?.type === "user_message") {
      events.push({
        ...base,
        id: yield* input.ids.event({ threadId: message.threadId }),
        type: "turn-item.updated",
        payload: { ...turnItem, text, updatedAt: now },
      });
    }
    const written = yield* input.eventSink.writeIfRunCurrent({
      threadId: message.threadId,
      runId: run.id,
      activeAttemptId: run.activeAttemptId,
      expectedStatus: "starting",
      events,
    });
    // A run that moved on is settled by the turn start's own status checks.
    return written.committed ? refreshed : message;
  }).pipe(
    // The default text is still a correct wake: never block delivery on the refresh.
    Effect.catchCause((cause) =>
      Effect.logWarning("t3team.delegated-completion-wake.refresh-failed", {
        threadId: input.run.threadId,
        runId: input.run.id,
        cause,
      }).pipe(Effect.as(input.message)),
    ),
  );
