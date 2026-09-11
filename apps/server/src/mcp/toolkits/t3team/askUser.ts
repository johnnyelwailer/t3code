/**
 * t3team_ask_user — structured user questions for any t3team agent thread.
 *
 * Mirrors the provider adapters' AskUserQuestion pattern (emit
 * user-input.requested, suspend the turn, resume with the answer) at the
 * t3team MCP toolkit level, so harnesses whose model ships no native
 * question tool (e.g. the input-only Pi harness) can still pause a turn for
 * a structured user answer and receive it as the tool result.
 *
 * The question is surfaced on the thread by appending a
 * `user-input.requested` activity — the exact activity shape the provider
 * runtime ingestion projects from an adapter's `user-input.requested`
 * runtime event — which is what the client's pending user-input panel is
 * derived from. The handler suspends on the durable
 * `thread.user-input-response-requested` orchestration event that the
 * composer's `thread.user-input.respond` command produces for this
 * requestId, then appends a `user-input.resolved` activity and returns the
 * submitted answers as the tool result. If the turn is interrupted before
 * an answer arrives, a finalizer appends `user-input.resolved` for the same
 * requestId with empty answers so the pending state clears instead of
 * lingering.
 *
 * Known side channel: the ProviderCommandReactor routes the same
 * `thread.user-input-response-requested` event to
 * `ProviderService.respondToUserInput` as well. This tool's requestId has
 * no provider-side pending request to match, so that path records a
 * "stale pending user-input request" failure activity. The client already
 * treats that detail as a pending-state-clearing signal, so it does not
 * change visible state.
 *
 * @module mcp/toolkits/t3team/askUser
 */
import { randomUUID } from "node:crypto";

import {
  ApprovalRequestId,
  CommandId,
  EventId,
  ThreadId,
  UserInputQuestion,
  type OrchestrationEvent,
  type ProviderUserInputAnswers,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";

import { OrchestrationEngineService } from "../../../orchestration/Services/OrchestrationEngine.ts";
import { T3TeamMcpToolError } from "./tools.ts";

export interface T3TeamAskUserInput {
  readonly question: string;
  readonly options?: ReadonlyArray<string> | undefined;
  readonly multiSelect?: boolean | undefined;
  readonly allowFreeText?: boolean | undefined;
}

export interface T3TeamAskUserResult {
  readonly question: string;
  readonly requestId: ApprovalRequestId;
  readonly answers: ProviderUserInputAnswers;
}

type AskUserActivityKind = "user-input.requested" | "user-input.resolved";

const toToolError = (message: string) => new T3TeamMcpToolError({ message });

export const t3TeamAskUser = Effect.fn("T3TeamMcpToolkit.askUser")(function* (
  input: T3TeamAskUserInput,
  threadId: ThreadId,
) {
  const questionText = input.question.trim();
  if (questionText.length === 0) {
    return yield* toToolError("t3team_ask_user requires a non-empty 'question'.");
  }

  const engine = yield* OrchestrationEngineService;

  // `id` equals the full question text: the client keys draft answers by the
  // question id, and the answer map is submitted under that key.
  const userQuestion: UserInputQuestion = {
    id: questionText,
    header: "Question",
    question: questionText,
    options: (input.options ?? [])
      .map((option) => option.trim())
      .filter((option) => option.length > 0)
      .map((label) => ({ label, description: label })),
    multiSelect: input.multiSelect === true,
  };

  const requestId = ApprovalRequestId.make(randomUUID());

  const appendActivity = Effect.fn("T3TeamMcpToolkit.askUser.appendActivity")(function* (
    kind: AskUserActivityKind,
    summary: string,
    payload: Record<string, unknown>,
  ) {
    const eventId = EventId.make(randomUUID());
    const createdAtIso = yield* DateTime.now.pipe(Effect.map(DateTime.formatIso));
    yield* engine
      .dispatch({
        type: "thread.activity.append",
        commandId: CommandId.make(`mcp:t3team-ask-user:${requestId}:${eventId}`),
        threadId,
        activity: {
          id: eventId,
          createdAt: createdAtIso,
          tone: "info",
          kind,
          summary,
          payload,
          turnId: null,
        },
        createdAt: createdAtIso,
      })
      .pipe(
        Effect.mapError((error) =>
          toToolError(`Failed to record user-input ${kind} activity: ${String(error)}`),
        ),
      );
  });

  // Subscribe before publishing the question so a very fast answer cannot
  // land between the append and the subscription.
  const subscription = yield* engine.subscribeDomainEvents;

  yield* appendActivity("user-input.requested", "User input requested", {
    requestId,
    questions: [userQuestion],
    ...(input.allowFreeText === false ? { allowFreeText: false } : {}),
  });

  // Cancellation: when the answer never arrives — the subscription ends
  // (provider session gone) or the turn is interrupted — close the question
  // on the thread under the same requestId instead of leaving a pending
  // panel. `closeCancelled` runs at most once; the finalizer is a
  // best-effort safety net for hard interrupts (in some runtimes a fiber
  // suspended on a stream does not finalize on interrupt, which is why the
  // stream-ended path below does the closing explicitly).
  const settled = { current: false };
  const closeCancelled = () => {
    if (settled.current) return Effect.void;
    settled.current = true;
    return appendActivity("user-input.resolved", "User input cancelled", {
      requestId,
      answers: {},
    }).pipe(Effect.ignore);
  };
  yield* Effect.addFinalizer(() => closeCancelled());

  const isAnswerForThisRequest = (
    event: OrchestrationEvent,
  ): event is Extract<
    OrchestrationEvent,
    { readonly type: "thread.user-input-response-requested" }
  > =>
    event.type === "thread.user-input-response-requested" &&
    event.payload.threadId === threadId &&
    event.payload.requestId === requestId;

  const answered = yield* Stream.runHead(
    Stream.filter(subscription, isAnswerForThisRequest).pipe(
      Stream.map((event) => event.payload.answers),
      Stream.take(1),
    ),
  );

  if (Option.isNone(answered)) {
    // The subscription ended without an answer for this requestId (e.g. the
    // provider session closed while the user was still deciding). Close the
    // question as cancelled rather than hang the turn forever.
    yield* closeCancelled();
    return { question: questionText, requestId, answers: {} };
  }

  settled.current = true;
  const answers: ProviderUserInputAnswers = answered.value;
  yield* appendActivity("user-input.resolved", "User input submitted", {
    requestId,
    answers,
  });
  return { question: questionText, requestId, answers };
});
