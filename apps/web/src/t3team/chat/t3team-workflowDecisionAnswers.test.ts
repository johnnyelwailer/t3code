/**
 * Correlating an `askUser` decision message with the reply that answered it.
 *
 * Regression coverage for a review pass that found the previous adjacency heuristic ("the next
 * message-kind entry after the ask is its answer") wrong in two ways: an interleaved system
 * notification between the ask and the real reply got misclaimed as the answer (and then
 * suppressed from rendering as its own row), and two pending asks answered out of order matched
 * the wrong reply to the wrong card. The fix correlates by `decision.correlationId` against
 * `t3teamExt.workflowReply.correlationId`, which the server stamps on a structured reply.
 */
import { MessageId } from "@t3tools/contracts";
import { PROJECT_RECIPE_MESSAGE_VIEW_WORKFLOW_DECISION } from "@t3tools/project-recipes";
import { describe, expect, it } from "vite-plus/test";

import { findT3TeamWorkflowDecisionAnswers } from "~/t3team/chat/t3team-workflowDecisionAnswers";
import type { ChatMessage } from "~/types";

function askMessage(id: string, correlationId: string, question = "Proceed?"): ChatMessage {
  return {
    id: MessageId.make(id),
    role: "system",
    text: question,
    streaming: false,
    createdAt: "2026-06-09T00:00:00.000Z",
    updatedAt: "2026-06-09T00:00:00.000Z",
    turnId: null,
    t3teamExt: {
      visibleToUser: true,
      status: "waiting-for-input",
      attachments: [
        {
          kind: "view",
          miniappId: PROJECT_RECIPE_MESSAGE_VIEW_WORKFLOW_DECISION,
          props: {
            question,
            affordance: { kind: "boolean" },
            correlationId,
            workflowRunId: "run-1",
          },
        },
      ],
    },
  } as ChatMessage;
}

/** A structured reply posted through the decision card — carries the correlationId ext. */
function correlatedReply(id: string, correlationId: string, text = "Yes"): ChatMessage {
  return {
    id: MessageId.make(id),
    role: "user",
    text,
    streaming: false,
    createdAt: "2026-06-09T00:00:01.000Z",
    updatedAt: "2026-06-09T00:00:01.000Z",
    turnId: null,
    t3teamExt: { workflowReply: { value: true, correlationId } },
  } as ChatMessage;
}

/** A plain system notification with no decision attachment and no workflowReply ext. */
function systemNotification(id: string, text = "Step completed"): ChatMessage {
  return {
    id: MessageId.make(id),
    role: "system",
    text,
    streaming: false,
    createdAt: "2026-06-09T00:00:00.500Z",
    updatedAt: "2026-06-09T00:00:00.500Z",
    turnId: null,
  } as ChatMessage;
}

/** A legacy freeform reply with no workflowReply ext at all. */
function legacyUserReply(id: string, text: string): ChatMessage {
  return {
    id: MessageId.make(id),
    role: "user",
    text,
    streaming: false,
    createdAt: "2026-06-09T00:00:01.000Z",
    updatedAt: "2026-06-09T00:00:01.000Z",
    turnId: null,
  } as ChatMessage;
}

function entries(messages: ReadonlyArray<ChatMessage>) {
  return messages.map((message) => ({ kind: "message" as const, message }));
}

describe("findT3TeamWorkflowDecisionAnswers", () => {
  it("(a) matches by correlationId — an interleaved system notification is not claimed", () => {
    const ask = askMessage("ask-1", "run-1:1");
    const notification = systemNotification("notify-1");
    const reply = correlatedReply("reply-1", "run-1:1", "Yes");

    const answers = findT3TeamWorkflowDecisionAnswers(entries([ask, notification, reply]));

    expect(answers.get("ask-1")).toEqual({ answerMessageId: "reply-1", text: "Yes" });
    // The notification must not be swallowed as if it were the answer.
    expect([...answers.values()].some((answer) => answer.answerMessageId === "notify-1")).toBe(
      false,
    );
  });

  it("(b) two pending asks answered out of order — each card shows its own answer", () => {
    const askA = askMessage("ask-a", "run-1:1", "Ship A?");
    const askB = askMessage("ask-b", "run-1:2", "Ship B?");
    // B is answered before A.
    const replyB = correlatedReply("reply-b", "run-1:2", "Ship B");
    const replyA = correlatedReply("reply-a", "run-1:1", "Ship A");

    const answers = findT3TeamWorkflowDecisionAnswers(entries([askA, askB, replyB, replyA]));

    expect(answers.get("ask-a")).toEqual({ answerMessageId: "reply-a", text: "Ship A" });
    expect(answers.get("ask-b")).toEqual({ answerMessageId: "reply-b", text: "Ship B" });
  });

  it("(c) legacy fallback picks the first following user-role message only", () => {
    const ask = askMessage("ask-legacy", "run-2:1");
    const notification = systemNotification("notify-legacy");
    const reply = legacyUserReply("reply-legacy", "sure");
    const laterUnrelated = legacyUserReply("reply-later", "unrelated later message");

    const answers = findT3TeamWorkflowDecisionAnswers(
      entries([ask, notification, reply, laterUnrelated]),
    );

    expect(answers.get("ask-legacy")).toEqual({ answerMessageId: "reply-legacy", text: "sure" });
  });

  it("prefers a correlationId match over the legacy adjacency fallback when both exist", () => {
    const ask = askMessage("ask-1", "run-3:1");
    const adjacentButWrong = legacyUserReply("reply-adjacent", "typed early");
    const correlated = correlatedReply("reply-correlated", "run-3:1", "actual answer");

    const answers = findT3TeamWorkflowDecisionAnswers(entries([ask, adjacentButWrong, correlated]));

    expect(answers.get("ask-1")).toEqual({
      answerMessageId: "reply-correlated",
      text: "actual answer",
    });
  });

  it("leaves a still-pending ask (no correlated or fallback reply) unanswered", () => {
    const ask = askMessage("ask-pending", "run-4:1");

    const answers = findT3TeamWorkflowDecisionAnswers(entries([ask]));

    expect(answers.has("ask-pending")).toBe(false);
  });
});
