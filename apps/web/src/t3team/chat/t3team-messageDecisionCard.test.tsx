/* oxlint-disable eslint/no-unused-vars -- Existing merged lint debt; keep green while preserving behavior. */
// @vitest-environment jsdom
/**
 * The `askUser` decision card (Epic 25 §askUser decision cards):
 *   • the `t3team.workflow.decision` view renders in the timeline as the bordered
 *     "needs your input" card — question, choice buttons, sibling resource attachment;
 *   • only the live (latest unanswered) card accepts clicks — a user reply after it disables;
 *   • a click hands the structured value to the handler (bare option, or `{ field: option }`);
 *   • a text affordance renders no buttons — the freeform composer stays the reply path.
 */

import {
  EnvironmentId,
  EventId,
  MessageId,
  ThreadId,
  type OrchestrationThreadActivity,
  type OrchestrationWorkflowRunStatus,
} from "@t3tools/contracts";
import {
  PROJECT_RECIPE_ACTIVITY_KIND_WORKFLOW_STEP,
  PROJECT_RECIPE_MESSAGE_VIEW_WORKFLOW_DECISION,
} from "@t3tools/project-recipes";
import { act, createRef, type ReactNode, type Ref } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { LegendListRef } from "@legendapp/list/react";

import { buildT3TeamMessagesTimelineTestProps } from "~/t3team/chat/t3team-messagesTimelineTestProps";

import {
  findActiveWorkflowInputMessageId,
  T3TeamWorkflowDecisionCard,
} from "~/t3team/chat/t3team-messageDecisionCard";
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

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

// jsdom has no matchMedia; the theme hook reads it at module load when MessagesTimeline's
// import graph is evaluated.
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
        {
          kind: "resource",
          resource: {
            provider: "jira",
            kind: "issue",
            id: "BUG-7",
            displayId: "BUG-7",
            title: "Checkout rounding error",
            url: "https://example.atlassian.net/browse/BUG-7",
            status: "Open",
          },
        },
      ],
    },
  };
}

function decisionMessageWithWidget(id: string): ChatMessage {
  const message = decisionMessage(id);
  const attachments = message.t3teamExt?.attachments ?? [];
  return {
    ...message,
    t3teamExt: {
      ...message.t3teamExt!,
      attachments: [
        ...attachments,
        {
          kind: "widget",
          widget: {
            widgetId: "decision-context",
            title: "Release context",
            format: "html",
            html: "<p>Widget context</p>",
          },
        },
      ],
    },
  };
}

function userReply(id: string, text: string): ChatMessage {
  return {
    id: MessageId.make(id),
    role: "user",
    text,
    streaming: false,
    createdAt: "2026-06-09T00:00:01.000Z",
    updatedAt: "2026-06-09T00:00:01.000Z",
    turnId: null,
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

const mountedRoots: Array<{ root: ReturnType<typeof createRoot>; container: HTMLElement }> = [];

async function renderNode(node: ReactNode) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mountedRoots.push({ root, container });
  await act(async () => {
    root.render(node);
  });
  return container;
}

async function clickButton(container: HTMLElement, label: string) {
  const button = [...container.querySelectorAll("button")].find(
    (candidate) => candidate.textContent === label,
  );
  expect(button).toBeDefined();
  await act(async () => {
    button!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

/** Set a controlled input/select value the way React's synthetic onChange expects. */
async function setControlValue(element: HTMLInputElement | HTMLSelectElement, value: string) {
  const proto =
    element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  await act(async () => {
    setter?.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function toggleCheckbox(element: HTMLInputElement) {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

afterEach(async () => {
  while (mountedRoots.length > 0) {
    const mounted = mountedRoots.pop();
    if (!mounted) {
      continue;
    }
    await act(async () => {
      mounted.root.unmount();
    });
    mounted.container.remove();
  }
  document.body.innerHTML = "";
});

describe("workflow decision card in the timeline", () => {
  it("renders the question, the choice buttons, and the attachment resource card", async () => {
    const markup = await renderTimeline([decisionMessage("message-decision-1")]);

    expect(markup).toContain("Needs your input");
    expect(markup).not.toContain(">System<");
    expect(markup).toContain(QUESTION);
    // The card owns the question; the message text must not duplicate it above the card.
    expect(markup.split(QUESTION)).toHaveLength(2);
    expect(markup).toContain("ship-now");
    expect(markup).toContain("hold");
    expect(markup).toContain("rollback");
    expect(markup).toContain("Checkout rounding error");
    expect(markup).toContain("https://example.atlassian.net/browse/BUG-7");
    expect(markup).toContain("…or reply in the composer below.");
    expect(markup).not.toContain('disabled=""');
  }, 30000);

  it("disables the choices once a user reply lands after the card", async () => {
    const markup = await renderTimeline([
      decisionMessage("message-decision-1"),
      userReply("message-reply-1", "hold"),
    ]);

    expect(markup).toContain('disabled=""');
    expect(markup).not.toContain("…or reply in the composer below.");
  }, 10000);

  it("withdraws decision actions when its workflow was stopped", async () => {
    const markup = await renderTimeline([decisionMessage("message-decision-1")], {
      runId: "run-1",
      status: "cancelled",
      pendingKind: null,
      wakeAt: null,
      updatedAt: "2026-06-09T00:01:00.000Z",
    });

    expect(markup).toContain('data-workflow-decision-status="unavailable"');
    expect(markup).toContain(
      "This question is no longer available because the orchestration was stopped.",
    );
    expect(markup).not.toContain("ship-now");
    expect(markup).not.toContain("…or reply in the composer below.");
    expect(markup).not.toContain(">System<");
  }, 10000);

  it("keeps an old stopped run's decision withdrawn after a newer run becomes current", async () => {
    const stoppedRunActivity: OrchestrationThreadActivity = {
      id: EventId.make("activity-run-1-stopped"),
      tone: "info",
      kind: PROJECT_RECIPE_ACTIVITY_KIND_WORKFLOW_STEP,
      summary: "Workflow stopped",
      payload: {
        workflowRunId: "run-1",
        stepId: "run:run-1",
        stepKind: "run",
        phase: "cancelled",
      },
      turnId: null,
      createdAt: "2026-06-09T00:01:00.000Z",
    };
    const markup = await renderTimeline(
      [decisionMessage("message-decision-1")],
      {
        runId: "run-2",
        status: "running",
        pendingKind: null,
        wakeAt: null,
        updatedAt: "2026-06-09T00:02:00.000Z",
      },
      [stoppedRunActivity],
    );

    expect(markup).toContain('data-workflow-decision-status="unavailable"');
    expect(markup).toContain(
      "This question is no longer available because the orchestration was stopped.",
    );
    expect(markup).not.toContain("ship-now");
  }, 10000);

  it("keeps widget context beside a decision card", async () => {
    const markup = await renderTimeline([decisionMessageWithWidget("message-decision-widget")]);

    expect(markup).toContain('data-widget-id="decision-context"');
    expect(markup).toContain("Release context");
    expect(markup).toContain("Needs your input");
  }, 10000);
});

// The settled-decision-card tests (GHE: regression on the Defect 2 fix — a decision's card must
// settle once answered, and the value must be stated exactly once) live in
// `t3team-messageDecisionCardSettled.test.tsx`, split out once this file outgrew the test-file
// LOC ceiling.

describe("findActiveWorkflowInputMessageId", () => {
  const entry = (message: ChatMessage) => ({ kind: "message" as const, message });

  it("returns the latest unanswered waiting-for-input message", () => {
    expect(findActiveWorkflowInputMessageId([entry(decisionMessage("message-decision-1"))])).toBe(
      "message-decision-1",
    );
  });

  it("returns null once a user reply lands after it", () => {
    expect(
      findActiveWorkflowInputMessageId([
        entry(decisionMessage("message-decision-1")),
        entry(userReply("message-reply-1", "hold")),
      ]),
    ).toBeNull();
  });
});

describe("T3TeamWorkflowDecisionCard clicks", () => {
  it("posts the chosen literal as the structured value", async () => {
    const onChoose = vi.fn(async () => {});
    const container = await renderNode(
      <T3TeamWorkflowDecisionCard
        decision={{
          question: QUESTION,
          affordance: { kind: "choice", options: ["ship-now", "hold", "rollback"] },
          correlationId: "run-1:1",
        }}
        active
        onChoose={onChoose}
      />,
    );

    await clickButton(container, "hold");
    expect(onChoose).toHaveBeenCalledExactlyOnceWith({
      choice: "hold",
      value: "hold",
      correlationId: "run-1:1",
    });
  });

  it("wraps a fielded choice as { field: option }", async () => {
    const onChoose = vi.fn(async () => {});
    const container = await renderNode(
      <T3TeamWorkflowDecisionCard
        decision={{
          question: "How severe?",
          affordance: { kind: "choice", field: "severity", options: ["low", "high"] },
          correlationId: "run-2:1",
        }}
        active
        onChoose={onChoose}
      />,
    );

    await clickButton(container, "high");
    expect(onChoose).toHaveBeenCalledExactlyOnceWith({
      choice: "high",
      value: { severity: "high" },
      correlationId: "run-2:1",
    });
  });

  it("ignores clicks on an inactive (stale) card", async () => {
    const onChoose = vi.fn(async () => {});
    const container = await renderNode(
      <T3TeamWorkflowDecisionCard
        decision={{
          question: QUESTION,
          affordance: { kind: "choice", options: ["ship-now", "hold"] },
          correlationId: "run-1:1",
        }}
        active={false}
        onChoose={onChoose}
      />,
    );

    await clickButton(container, "hold");
    expect(onChoose).not.toHaveBeenCalled();
  });

  it("renders a boolean affordance as two labelled buttons and posts the chosen boolean", async () => {
    const onChoose = vi.fn(async () => {});
    const container = await renderNode(
      <T3TeamWorkflowDecisionCard
        decision={{
          question: "Approve the release?",
          affordance: { kind: "boolean", labels: { true: "Ship it", false: "Hold" } },
          correlationId: "run-4:1",
        }}
        active
        onChoose={onChoose}
      />,
    );

    expect(container.textContent).toContain("Ship it");
    expect(container.textContent).toContain("Hold");

    await clickButton(container, "Ship it");
    expect(onChoose).toHaveBeenCalledExactlyOnceWith({
      choice: "Ship it",
      value: true,
      correlationId: "run-4:1",
    });
  });

  it("defaults boolean labels to Yes/No and posts false for the reject button", async () => {
    const onChoose = vi.fn(async () => {});
    const container = await renderNode(
      <T3TeamWorkflowDecisionCard
        decision={{
          question: "Proceed?",
          affordance: { kind: "boolean" },
          correlationId: "run-5:1",
        }}
        active
        onChoose={onChoose}
      />,
    );

    expect(container.textContent).toContain("Yes");
    expect(container.textContent).toContain("No");

    await clickButton(container, "No");
    expect(onChoose).toHaveBeenCalledExactlyOnceWith({
      choice: "No",
      value: false,
      correlationId: "run-5:1",
    });
  });

  it("renders a form and posts the collected structured value on submit", async () => {
    const onChoose = vi.fn(async () => {});
    const container = await renderNode(
      <T3TeamWorkflowDecisionCard
        decision={{
          question: "Triage the bug",
          affordance: {
            kind: "form",
            fields: [
              { name: "severity", type: "literals", options: ["low", "high"], optional: false },
              { name: "note", type: "string", optional: false },
              { name: "urgent", type: "boolean", optional: false },
              { name: "owner", type: "string", optional: true },
            ],
          },
          correlationId: "run-6:1",
        }}
        active
        onChoose={onChoose}
      />,
    );

    const select = container.querySelector("select");
    const textInputs = [...container.querySelectorAll('input[type="text"]')];
    const checkbox = container.querySelector('input[type="checkbox"]');
    expect(select).not.toBeNull();
    expect(textInputs).toHaveLength(2); // note + owner
    expect(checkbox).not.toBeNull();

    await setControlValue(select as HTMLSelectElement, "high");
    await setControlValue(textInputs[0] as HTMLInputElement, "rounding bug");
    await toggleCheckbox(checkbox as HTMLInputElement);
    // `owner` (optional) left blank → omitted from the submission.

    await clickButton(container, "Submit");
    expect(onChoose).toHaveBeenCalledExactlyOnceWith({
      choice: "severity: high, note: rounding bug, urgent: true",
      value: { severity: "high", note: "rounding bug", urgent: true },
      correlationId: "run-6:1",
    });
  });

  it("posts a fresh message id for the reply, never the ask's own id", async () => {
    // GHE (Defect 2): a decision-card click used to send `messageId: message.id` — the ASK's own
    // id — to the resolve-input route. The projector never changes an existing message's `role`
    // on a subsequent upsert (see `orchestration/projector.ts`), so upserting the reply IN PLACE
    // over the ask left the reply's text sitting on a message still `role: "system"`, and wiped
    // the ask's `t3teamExt.attachments` so it no longer rendered as a decision card either — it
    // fell through to the generic system-notice fallback (the `<p>System</p>` bubble). The fix is
    // to always mint a fresh id for the reply, since there is no optimistic bubble to reconcile
    // with here (unlike the composer path).
    const { T3TeamSystemTimelineDecisionRow } = await import(
      "~/t3team/chat/t3team-SystemTimelineDecisionRow"
    );
    const ask = decisionMessage("message-decision-1");
    const dispatchWorkflowDecision = vi.fn(async (_decision: { readonly messageId: string }) => {});
    const threadRef = {
      environmentId: EnvironmentId.make("environment-local"),
      threadId: ThreadId.make("thread-1"),
    };

    const container = await renderNode(
      <T3TeamSystemTimelineDecisionRow
        message={ask}
        threadRef={threadRef}
        workflowDecision={{
          question: QUESTION,
          affordance: { kind: "choice", options: ["ship-now", "hold", "rollback"] },
          correlationId: "run-1:1",
          workflowRunId: "run-1",
        }}
        activeWorkflowInputMessageId={ask.id}
        decisionUnavailableMessage={undefined}
        dispatchWorkflowDecision={dispatchWorkflowDecision}
      />,
    );

    await clickButton(container, "hold");

    expect(dispatchWorkflowDecision).toHaveBeenCalledTimes(1);
    const call = dispatchWorkflowDecision.mock.calls[0]?.[0];
    expect(call?.messageId).not.toBe(ask.id);
    expect(call?.messageId.length).toBeGreaterThan(0);
  });

  it("renders no buttons for a text affordance — the composer is the reply path", async () => {
    const container = await renderNode(
      <T3TeamWorkflowDecisionCard
        decision={{
          question: "Describe the repro steps.",
          affordance: { kind: "text" },
          correlationId: "run-3:1",
        }}
        active
        onChoose={async () => {}}
      />,
    );

    expect(container.querySelectorAll("button")).toHaveLength(0);
    expect(container.textContent).toContain("Describe the repro steps.");
    // A text ask has no controls of its own, so the pointer to the composer is the whole
    // affordance — it says the run is blocked, not merely that a reply is possible.
    expect(container.textContent).toContain("Type your answer in the composer below");
    expect(
      container.querySelector('[data-workflow-decision-status="awaiting-answer"]')?.className,
    ).toContain("text-primary");
  });
});
