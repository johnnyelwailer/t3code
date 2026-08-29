/* oxlint-disable eslint/no-unused-vars -- Existing merged lint debt; keep green while preserving behavior. */
// @vitest-environment jsdom
/**
 * Split out of `t3team-messageDecisionCard.test.tsx` (which outgrew the test-file LOC ceiling)
 * once it needed a whole extra describe block: the settled-decision-card fix.
 *
 * GHE (regression on the Defect 2 id-reuse fix, spotted live by PJ): once a decision is
 * answered, the card must SETTLE (header stops saying "Needs your input", controls stop being
 * interactive) and the value must be stated exactly once. Design (A): the card settles and stops
 * restating the value; the reply's own message carries it, exactly as it would for a typed
 * answer — no suppression. (Design (B) — the card keeps the value and the reply is suppressed —
 * was rejected: it makes the click path and the typed path render differently, and re-hides the
 * human attribution Defect 2 exists to fix.)
 */

import {
  MessageId,
  type OrchestrationThreadActivity,
  type OrchestrationWorkflowRunStatus,
} from "@t3tools/contracts";
import { PROJECT_RECIPE_MESSAGE_VIEW_WORKFLOW_DECISION } from "@t3tools/project-recipes";
import { type ReactNode, type Ref } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";
import type { LegendListRef } from "@legendapp/list/react";

import { buildT3TeamMessagesTimelineTestProps } from "~/t3team/chat/t3team-messagesTimelineTestProps";
import type { ChatMessage } from "~/types";

vi.mock("@legendapp/list/react", async () => {
  const LegendList = (props: {
    data: Array<{ id: string }>;
    keyExtractor: (item: { id: string }) => string;
    renderItem: (args: { item: { id: string } }) => ReactNode;
    ListHeaderComponent?: ReactNode;
    ListFooterComponent?: ReactNode;
    ref?: Ref<LegendListRef>;
  }) => (
    <div>
      {props.ListHeaderComponent}
      {props.data.map((item) => (
        <div key={props.keyExtractor(item)}>{props.renderItem({ item })}</div>
      ))}
      {props.ListFooterComponent}
    </div>
  );

  return { LegendList };
});

window.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia;

const QUESTION = "Release decision for BUG-7?";

function decisionMessage(id: string): ChatMessage {
  return {
    id: MessageId.make(id),
    role: "system",
    text: QUESTION,
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
            question: QUESTION,
            affordance: { kind: "choice", options: ["ship-now", "hold", "rollback"] },
            correlationId: "run-1:1",
            workflowRunId: "run-1",
          },
        },
      ],
    },
  };
}

async function renderTimeline(
  messages: ReadonlyArray<ChatMessage>,
  workflowRunStatus?: OrchestrationWorkflowRunStatus,
  threadActivities?: ReadonlyArray<OrchestrationThreadActivity>,
) {
  const { MessagesTimeline } = await import("~/components/chat/MessagesTimeline");
  return renderToStaticMarkup(
    <MessagesTimeline
      {...buildT3TeamMessagesTimelineTestProps()}
      dispatchWorkflowDecision={async () => {}}
      {...(workflowRunStatus ? { workflowRunStatus } : {})}
      {...(threadActivities ? { threadActivities } : {})}
      timelineEntries={messages.map((message, index) => ({
        id: `timeline-${index}`,
        kind: "message" as const,
        createdAt: message.createdAt,
        message,
      }))}
    />,
  );
}

const countOccurrences = (markup: string, needle: string): number =>
  markup.split(needle).length - 1;

describe("answered decision reply — the card settles, the value is stated once", () => {
  function boolReply(text: string, value: boolean, correlationId = "run-1:1"): ChatMessage {
    return {
      id: MessageId.make(`message-reply-${text}`),
      role: "user",
      text,
      streaming: false,
      createdAt: "2026-06-09T00:00:01.000Z",
      updatedAt: "2026-06-09T00:00:01.000Z",
      turnId: null,
      t3teamExt: { workflowReply: { value, correlationId } },
    };
  }

  it("settles a button-affordance card: header switches, buttons disable, the reply renders once", async () => {
    const ask = decisionMessage("message-decision-1");
    const reply = boolReply("hold", "hold" as unknown as boolean);

    const markup = await renderTimeline([ask, reply]);

    // the card no longer claims to need input
    expect(markup).toContain('data-workflow-decision-status="answered"');
    expect(markup).not.toContain("Needs your input");
    expect(markup).toContain("Answered");
    // the reply renders as an ordinary user bubble — the same element a typed answer would use —
    // never suppressed.
    expect(markup).toContain("bg-message");
    // the value is not ALSO restated inside the card as a second, separate element (the old
    // "chosen chip" used a native `title` matching the answer text; that element is gone).
    expect(markup).not.toContain('title="hold"');
    // the controls are non-interactive once settled.
    expect(markup).toContain('disabled=""');
    expect(markup).not.toContain("…or reply in the composer below.");
  }, 10000);

  it("does not swallow an interleaved system notification as the answer", async () => {
    const ask = decisionMessage("message-decision-1");
    const notification: ChatMessage = {
      id: MessageId.make("message-notify-1"),
      role: "system",
      text: "Preparing release notes",
      streaming: false,
      createdAt: "2026-06-09T00:00:00.500Z",
      updatedAt: "2026-06-09T00:00:00.500Z",
      turnId: null,
    };
    const reply = boolReply("hold", "hold" as unknown as boolean);

    const markup = await renderTimeline([ask, notification, reply]);

    expect(markup).toContain("Preparing release notes");
    expect(markup).toContain('data-workflow-decision-status="answered"');
    expect(markup).toContain("bg-message");
  }, 10000);

  it("settles the struct-form variant the same way: header switches, fields disable, no restated value", async () => {
    const ask: ChatMessage = {
      id: MessageId.make("message-decision-form-1"),
      role: "system",
      text: "Triage the bug",
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
              question: "Triage the bug",
              affordance: {
                kind: "form",
                fields: [
                  { name: "severity", type: "literals", options: ["low", "high"], optional: false },
                  { name: "note", type: "string", optional: false },
                ],
              },
              correlationId: "run-form-1:1",
              workflowRunId: "run-form-1",
            },
          },
        ],
      },
    };
    const reply: ChatMessage = {
      id: MessageId.make("message-reply-form-1"),
      role: "user",
      text: "severity: high, note: rounding bug",
      streaming: false,
      createdAt: "2026-06-09T00:00:01.000Z",
      updatedAt: "2026-06-09T00:00:01.000Z",
      turnId: null,
      t3teamExt: {
        workflowReply: {
          value: { severity: "high", note: "rounding bug" },
          correlationId: "run-form-1:1",
        },
      },
    };

    const markup = await renderTimeline([ask, reply]);

    expect(markup).toContain('data-workflow-decision-status="answered"');
    expect(markup).not.toContain("Needs your input");
    expect(markup).toContain("bg-message");
    expect(markup).toContain("severity: high, note: rounding bug");
    // the form's own controls (select + text input + submit) are disabled, not just hidden.
    expect(markup).toContain('disabled=""');
    expect(markup).not.toContain("Type your answer in the composer");
  }, 10000);

  it("leaves a still-pending card completely untouched", async () => {
    const markup = await renderTimeline([decisionMessage("message-decision-1")]);

    expect(markup).toContain("Needs your input");
    expect(markup).not.toContain('data-workflow-decision-status="answered"');
    expect(markup).not.toContain('disabled=""');
    expect(markup).toContain("…or reply in the composer below.");
    expect(markup).not.toContain("bg-message");
  }, 10000);

  it("handles a multi-ask run: settled and pending cards coexist without bleeding into each other", async () => {
    const firstAsk: ChatMessage = {
      id: MessageId.make("message-decision-multi-1"),
      role: "system",
      text: "Continue?",
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
              question: "Continue?",
              affordance: { kind: "boolean" },
              correlationId: "run-multi:1",
              workflowRunId: "run-multi",
            },
          },
        ],
      },
    };
    const firstReply: ChatMessage = {
      id: MessageId.make("message-reply-multi-1"),
      role: "user",
      text: "Yes",
      streaming: false,
      createdAt: "2026-06-09T00:00:01.000Z",
      updatedAt: "2026-06-09T00:00:01.000Z",
      turnId: null,
      t3teamExt: { workflowReply: { value: true, correlationId: "run-multi:1" } },
    };
    const secondAsk: ChatMessage = {
      id: MessageId.make("message-decision-multi-2"),
      role: "system",
      text: "Assign to whom?",
      streaming: false,
      createdAt: "2026-06-09T00:00:02.000Z",
      updatedAt: "2026-06-09T00:00:02.000Z",
      turnId: null,
      t3teamExt: {
        visibleToUser: true,
        status: "waiting-for-input",
        attachments: [
          {
            kind: "view",
            miniappId: PROJECT_RECIPE_MESSAGE_VIEW_WORKFLOW_DECISION,
            props: {
              question: "Assign to whom?",
              affordance: { kind: "choice", options: ["alice", "bob"] },
              correlationId: "run-multi:2",
              workflowRunId: "run-multi",
            },
          },
        ],
      },
    };

    const markup = await renderTimeline([firstAsk, firstReply, secondAsk]);

    // exactly one card settled, one still pending.
    expect(countOccurrences(markup, "Answered")).toBe(1);
    expect(countOccurrences(markup, "Needs your input")).toBe(1);
    expect(markup).toContain("Continue?");
    expect(markup).toContain("Assign to whom?");
    expect(markup).toContain("bg-message");
    expect(markup).toContain("…or reply in the composer below.");
  }, 10000);
});
