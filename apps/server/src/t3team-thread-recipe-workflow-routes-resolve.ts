import { CommandId, MessageId, ThreadId } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import { HttpRouter } from "effect/unstable/http";

import {
  errorResponse,
  okJson,
  readJsonBody,
  T3TeamAtlassianError,
} from "./t3team-atlassian-http.ts";
import { OrchestrationEngineService } from "./orchestration/Services/OrchestrationEngine.ts";
import { toT3TeamError } from "./t3team-project-repository-utils.ts";
import { t3teamRandomUUID } from "./t3team-random.ts";
import { T3TeamWorkflowEngineRegistry } from "./t3team-workflowEngineRegistry.ts";
import {
  rejectWorkflowResolveValue,
  workflowReplyDisplayText,
} from "./t3team-workflowResolveInput.ts";

export function nowIso(): string {
  return DateTime.formatIso(DateTime.nowUnsafe());
}

/**
 * Answer a workflow's pending `askUser`. Rather than resolving the parked run directly (which
 * would make the user's reply invisible and risk a second resolution racing the reactor), this
 * appends the reply as a normal user message on the thread. The workflow-engine reactor then
 * resolves the parked `user.input` from that `thread.message-sent` event — a single resolution
 * path, the reply renders like any other message, and no agent turn is started.
 *
 * A decision-card click posts a structured `value` (plus the display `text` and the card's
 * `correlationId`). The value is checked against the pending ask's affordance — a stale card or
 * an out-of-range value is rejected here — then rides the reply message as
 * `t3teamExt.workflowReply`, which the reactor prefers over the text when resolving.
 */
export const t3teamThreadWorkflowResolveInputRouteLayer = HttpRouter.add(
  "POST",
  "/api/t3team/thread/workflow/resolve-input",
  Effect.gen(function* () {
    const orchestration = yield* OrchestrationEngineService;
    const registry = yield* T3TeamWorkflowEngineRegistry;
    const input = yield* readJsonBody<{
      threadId?: string;
      text?: string;
      value?: unknown;
      correlationId?: string;
      messageId?: string;
    }>();
    const threadIdInput = input.threadId?.trim() ?? "";
    const text = typeof input.text === "string" ? input.text : "";
    const hasValue = typeof input === "object" && input !== null && Object.hasOwn(input, "value");
    const correlationIdInput = input.correlationId?.trim();
    // Reuse the client's optimistic message id so the upserted message reconciles with the
    // optimistic bubble the composer already rendered (otherwise the reply shows twice).
    const messageIdInput = input.messageId?.trim();
    if (threadIdInput.length === 0) {
      return yield* new T3TeamAtlassianError({ message: "threadId is required." });
    }
    if (text.length === 0 && !hasValue) {
      return yield* new T3TeamAtlassianError({ message: "text or value is required." });
    }

    const cardCorrelationId =
      correlationIdInput !== undefined && correlationIdInput.length > 0
        ? correlationIdInput
        : undefined;
    const rejection = rejectWorkflowResolveValue({
      pending: registry.peekPending(threadIdInput),
      correlationId: cardCorrelationId,
      hasValue,
      value: input.value,
    });
    if (rejection !== null) {
      return yield* new T3TeamAtlassianError({ message: rejection });
    }

    yield* orchestration.dispatch({
      type: "thread.message.upsert",
      commandId: CommandId.make(`t3team-wf-resolve:${t3teamRandomUUID()}`),
      threadId: ThreadId.make(threadIdInput),
      message: {
        messageId: MessageId.make(
          messageIdInput && messageIdInput.length > 0 ? messageIdInput : t3teamRandomUUID(),
        ),
        role: "user",
        text: hasValue ? workflowReplyDisplayText(input.value, text) : text,
        turnId: null,
        streaming: false,
        // The reply pins its ask: the reactor (the authoritative consume point) ignores a
        // structured reply whose correlationId no longer matches the pending ask.
        ...(hasValue
          ? {
              t3teamExt: {
                workflowReply: {
                  value: input.value,
                  ...(cardCorrelationId === undefined ? {} : { correlationId: cardCorrelationId }),
                },
              },
            }
          : {}),
      },
      createdAt: nowIso(),
    });

    return okJson({ ok: true });
  }).pipe(
    Effect.mapError((cause) => toT3TeamError(cause, "Failed to resolve workflow input.")),
    Effect.catch(errorResponse),
  ),
);
