/* oxlint-disable eslint/no-unused-vars -- Existing merged lint debt; keep green while preserving behavior. */
// @vitest-environment jsdom
/**
 * Split out of `t3team-messageDecisionCard.test.tsx` (which outgrew the test-file LOC ceiling)
 * once it needed a whole extra describe block: the settled-decision-card fix.
 *
 * GHE (regression on the Defect 2 id-reuse fix, spotted live by PJ): once a decision is
 * answered, the card must SETTLE (header stops saying "Needs your input", controls stop being
 * interactive) and the value must be stated exactly once.
 *
 * Design UPDATED 2026-08-29: the original design here (the card settles and stops restating the
 * value; the reply's own message carries it, exactly as it would for a typed answer — no
 * suppression) shipped, then PJ hit it live and complained about a duplicate ("why is there a
 * duplicated Yes message below it?") — the settled card already shows the chosen value via its
 * own affordance, so also rendering the reply bubble said it twice. The fix flips to the design
 * this file used to reject: the card keeps the value, and a reply that came FROM THE CARD (its
 * message carries `t3teamExt.workflowReply.correlationId`) is now suppressed from rendering as
 * its own bubble — see `isVisibleMessagesTimelineRow` in `MessagesTimeline.logic.ts`. A reply the
 * user TYPED in the composer (no `workflowReply` ext) is ordinary conversation, not an echo of a
 * chip, and still renders — that distinction is what the coverage below has to preserve.
 */

import {
  MessageId,
  type OrchestrationThreadActivity,
  type OrchestrationWorkflowRunStatus,
} from "@t3tools/contracts";
import { PROJECT_RECIPE_MESSAGE_VIEW_WORKFLOW_DECISION } from "@t3tools/project-recipes";
import { type ReactNode, type Ref } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vite-plus/test";
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
  // The first render pays for importing the whole MessagesTimeline module graph (~8 s on a
  // loaded machine) — warm it here so no single test's 10 s budget absorbs module init.
  beforeAll(async () => {
    await import("~/components/chat/MessagesTimeline");
  }, 60_000);

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
    // the reply came FROM THE CARD (`workflowReply.correlationId`), so it must NOT ALSO render
    // as its own bubble — the settled card above already states the chosen value ("hold"'s
    // button stays highlighted, unmuted). Rendering both said it twice; PJ hit that live.
    expect(markup).not.toContain('data-message-id="message-reply-hold"');
    expect(markup).not.toContain('data-message-role="user"');
    // the value is not ALSO restated inside the card as a second, separate element (the old
    // "chosen chip" used a native `title` matching the answer text; that element is gone).
    expect(markup).not.toContain('title="hold"');
    // the controls are non-interactive once settled.
    expect(markup).toContain('disabled=""');
    expect(markup).not.toContain("…or reply in the composer below.");
  }, 10000);

  it("still renders a TYPED composer reply as its own bubble — no suppression", async () => {
    // No `t3teamExt.workflowReply` at all: this is what a message typed directly into the
    // composer looks like, even once `findT3TeamWorkflowDecisionAnswers`'s legacy fallback names
    // it as the ask's answer (nothing else correlates by correlationId). Unlike a card-sourced
    // reply, this is real conversation the user wrote themselves — it must keep rendering. This
    // is the case most at risk of a future regression: it is easy to widen the suppression to
    // "any message that settled some card" instead of "only a message stamped
    // `workflowReply.correlationId`".
    const ask = decisionMessage("message-decision-1");
    const typedReply: ChatMessage = {
      id: MessageId.make("message-typed-reply-1"),
      role: "user",
      text: "Hold it for now, thanks",
      streaming: false,
      createdAt: "2026-06-09T00:00:01.000Z",
      updatedAt: "2026-06-09T00:00:01.000Z",
      turnId: null,
    };

    const markup = await renderTimeline([ask, typedReply]);

    // the legacy fallback still settles the card (the next user message answers it)…
    expect(markup).toContain('data-workflow-decision-status="answered"');
    expect(markup).not.toContain("Needs your input");
    // …but the typed reply is NOT a card-sourced answer, so it renders as an ordinary user
    // bubble, same as it would if this ask didn't exist at all.
    expect(markup).toContain('data-message-id="message-typed-reply-1"');
    expect(markup).toContain('data-message-role="user"');
    expect(markup).toContain("Hold it for now, thanks");
    expect(markup).toContain("bg-message");
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

    // the interleaved system notification is unrelated to the ask/reply pair — it must keep
    // rendering normally, and correlation must not confuse it with the answer.
    expect(markup).toContain("Preparing release notes");
    expect(markup).toContain('data-message-id="message-notify-1"');
    // the ask still resolves its answer correctly by `correlationId` — the notification sitting
    // between the ask and its real reply must not break that match.
    expect(markup).toContain('data-workflow-decision-status="answered"');
    expect(markup).not.toContain("Needs your input");
    // the real reply is the one suppressed (card-sourced, same as the button case above) —
    // never the notification, and never left dangling as an unmatched extra bubble.
    expect(markup).not.toContain('data-message-id="message-reply-hold"');
  }, 10000);

  it("settles the struct-form variant: header switches, the raw reply renders as a summary line since it isn't JSON", async () => {
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
    // the reply is card-sourced (`workflowReply.correlationId`), so it must NOT ALSO render as
    // its own bubble — the value below comes from the settled card's own summary line, not from
    // a duplicated reply message.
    expect(markup).not.toContain('data-message-id="message-reply-form-1"');
    expect(markup).toContain("severity: high, note: rounding bug");
    // This is the human-readable "key: value" summary a card's own form-submit produces (see
    // `summarizeT3TeamDecisionFormValue`), not JSON — there's no struct to repopulate the fields
    // from, so the affordance falls back to a single read-only summary line rather than a
    // disabled-but-silently-empty form (see `t3team-messageDecisionAffordance.tsx`'s
    // `parseT3TeamDecisionFormAnswer` guard).
    expect(markup).toContain('data-workflow-decision-status="answered-form-summary"');
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
    // the settled card's own correlated reply does not bleed into a bubble — settled and
    // pending cards coexist without a stray extra row for the answered one.
    expect(markup).not.toContain('data-message-id="message-reply-multi-1"');
    expect(markup).toContain("…or reply in the composer below.");
  }, 10000);
});
