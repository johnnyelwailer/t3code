/* oxlint-disable eslint/no-unused-vars -- Existing merged lint debt; keep green while preserving behavior. */
// @vitest-environment jsdom
/**
 * A workflow's plain-text `thread.notifyUser(...)` report (see `t3team-workflowEngineBrokerNotify.ts`)
 * renders through the `workflowNotification` branch of `T3TeamSystemTimelineRow` — a bare-text
 * system message with no workflow card, no widget, no generic attachment. A long report used to
 * render in full, unbroken, with no way to skim it; it now collapses like a long user message
 * (`CollapsibleUserMessageBody` in `MessagesTimeline.tsx`), reusing the same thresholds and fade
 * mask from `t3team-collapsibleMessage.ts`.
 *
 * This must stay scoped to that one bare-text branch: a decision (`askUser`) card, a workflow shape
 * card, and a short notification all have their own compact rendering and must never gain the
 * collapse chrome.
 */

import { MessageId } from "@t3tools/contracts";
import {
  PROJECT_RECIPE_MESSAGE_VIEW_WORKFLOW_DECISION,
  PROJECT_RECIPE_MESSAGE_VIEW_WORKFLOW_SHAPE,
} from "@t3tools/project-recipes";
import { act, type ReactNode, type Ref } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
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

// jsdom has no ResizeObserver either; only the mounted (createRoot) tests exercise the effect
// that needs it — the renderToStaticMarkup tests never run effects at all.
globalThis.ResizeObserver ??= class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const VERDICT_LINE = "QA did NOT pass — nothing was pushed to main.";
const TAIL_MARKER = "deep report detail only meaningfully visible after expanding";

function buildLongWorkflowReportText(): string {
  const detailLines = Array.from(
    { length: 12 },
    (_, index) => `Detail ${index + 1}: ${"evidence ".repeat(10).trim()}`,
  );
  return [VERDICT_LINE, ...detailLines, TAIL_MARKER].join("\n");
}

function workflowNotificationMessage(
  id: string,
  text: string,
  workflowRunId = "run-1",
): ChatMessage {
  return {
    id: MessageId.make(id),
    role: "system",
    text,
    streaming: false,
    createdAt: "2026-06-20T00:00:00.000Z",
    updatedAt: "2026-06-20T00:00:00.000Z",
    turnId: null,
    t3teamExt: {
      author: { kind: "system", workflowRunId },
      visibleToUser: true,
      visibleToAgent: false,
    },
  };
}

const DECISION_QUESTION = "Release decision for BUG-7?";

function decisionMessage(id: string): ChatMessage {
  return {
    id: MessageId.make(id),
    role: "system",
    text: DECISION_QUESTION,
    streaming: false,
    createdAt: "2026-06-20T00:00:00.000Z",
    updatedAt: "2026-06-20T00:00:00.000Z",
    turnId: null,
    t3teamExt: {
      visibleToUser: true,
      status: "waiting-for-input",
      attachments: [
        {
          kind: "view",
          miniappId: PROJECT_RECIPE_MESSAGE_VIEW_WORKFLOW_DECISION,
          props: {
            question: DECISION_QUESTION,
            affordance: { kind: "choice", options: ["ship-now", "hold", "rollback"] },
            correlationId: "run-1:1",
            workflowRunId: "run-1",
          },
        },
      ],
    },
  };
}

function shapeMessage(id: string): ChatMessage {
  return {
    id: MessageId.make(id),
    role: "system",
    text: "Plan: shape.pr-review",
    streaming: false,
    createdAt: "2026-06-20T00:00:00.000Z",
    updatedAt: "2026-06-20T00:00:00.000Z",
    turnId: null,
    t3teamExt: {
      visibleToUser: true,
      attachments: [
        {
          kind: "view",
          miniappId: PROJECT_RECIPE_MESSAGE_VIEW_WORKFLOW_SHAPE,
          props: {
            name: "shape.pr-review",
            description: "Summarize a PR, then ask the user whether to merge it.",
            phases: [{ title: "Review" }, { title: "Decide" }],
            steps: [
              { phase: "Review", kind: "read", label: "github.pullRequest.get" },
              { phase: "Decide", kind: "ask", label: "Merge it?" },
            ],
            workflowRunId: "run-1",
          },
        },
      ],
    },
  };
}

async function renderTimeline(messages: ReadonlyArray<ChatMessage>) {
  const { MessagesTimeline } = await import("~/components/chat/MessagesTimeline");
  return renderToStaticMarkup(
    <MessagesTimeline
      {...buildT3TeamMessagesTimelineTestProps()}
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

async function mountTimeline(messages: ReadonlyArray<ChatMessage>) {
  const { MessagesTimeline } = await import("~/components/chat/MessagesTimeline");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mountedRoots.push({ root, container });
  await act(async () => {
    root.render(
      <MessagesTimeline
        {...buildT3TeamMessagesTimelineTestProps()}
        timelineEntries={messages.map((message, index) => ({
          id: `timeline-${index}`,
          kind: "message" as const,
          createdAt: message.createdAt,
          message,
        }))}
      />,
    );
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

describe("workflow notification collapse in the timeline", () => {
  it("collapses a long workflow report and keeps its first line (the verdict) visible", async () => {
    const markup = await renderTimeline([
      workflowNotificationMessage("message-report-1", buildLongWorkflowReportText()),
    ]);

    expect(markup).toContain(VERDICT_LINE);
    expect(markup).toContain('data-workflow-notification-collapsed="true"');
    expect(markup).toContain('data-workflow-notification-collapsible="true"');
    expect(markup).toContain("Show full message");
    // Collapsing is a CSS clip over the full markdown output, never a truncated string — the
    // report's tail is already in the DOM, so expanding never re-fetches or re-derives content.
    expect(markup).toContain(TAIL_MARKER);
  }, 10000);

  it("does not collapse a short workflow notification", async () => {
    const markup = await renderTimeline([
      workflowNotificationMessage("message-report-short", "The review window is due."),
    ]);

    expect(markup).toContain("The review window is due.");
    expect(markup).not.toContain("Show full message");
    expect(markup).toContain('data-workflow-notification-collapsed="false"');
    expect(markup).toContain('data-workflow-notification-collapsible="false"');
  }, 10000);

  it("leaves a decision (askUser) card uncollapsed", async () => {
    const markup = await renderTimeline([decisionMessage("message-decision-1")]);

    expect(markup).toContain(DECISION_QUESTION);
    expect(markup).not.toContain("data-workflow-notification-collapsed");
    expect(markup).not.toContain("Show full message");
  }, 10000);

  it("leaves a workflow shape card uncollapsed", async () => {
    const markup = await renderTimeline([shapeMessage("message-shape-1")]);

    expect(markup).toContain("shape.pr-review");
    expect(markup).not.toContain("data-workflow-notification-collapsed");
  }, 10000);

  it("expands to reveal the full report and flips back on demand", async () => {
    const container = await mountTimeline([
      workflowNotificationMessage("message-report-2", buildLongWorkflowReportText()),
    ]);

    const collapsedBody = container.querySelector("[data-workflow-notification-collapsed]");
    expect(collapsedBody?.getAttribute("data-workflow-notification-collapsed")).toBe("true");

    await clickButton(container, "Show full message");

    const expandedBody = container.querySelector("[data-workflow-notification-collapsed]");
    expect(expandedBody?.getAttribute("data-workflow-notification-collapsed")).toBe("false");
    expect(container.textContent).toContain(TAIL_MARKER);

    await clickButton(container, "Show less");

    const recollapsedBody = container.querySelector("[data-workflow-notification-collapsed]");
    expect(recollapsedBody?.getAttribute("data-workflow-notification-collapsed")).toBe("true");
  }, 10000);
});
