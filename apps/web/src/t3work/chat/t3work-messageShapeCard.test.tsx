// @vitest-environment jsdom
/**
 * The play-as-shape "plan" card (recipe-UX design pass): the `t3work.workflow.shape` view
 * renders in the timeline as a distinct bordered card — the phase strip plus the ordered,
 * kind-tagged step list (read / agent / ask / act). The launch message's short text echo is
 * suppressed; the card owns the header.
 */

import { EnvironmentId, MessageId } from "@t3tools/contracts";
import { PROJECT_RECIPE_MESSAGE_VIEW_WORKFLOW_SHAPE } from "@t3tools/project-recipes";
import { createRef, type ReactNode, type Ref } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";
import type { LegendListRef } from "@legendapp/list/react";

import { buildT3workMessagesTimelineTestProps } from "~/t3work/chat/t3work-messagesTimelineTestProps";

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

function shapeMessage(id: string): ChatMessage {
  return {
    id: MessageId.make(id),
    role: "system",
    text: "Plan: shape.pr-review",
    streaming: false,
    createdAt: "2026-06-14T00:00:00.000Z",
    updatedAt: "2026-06-14T00:00:00.000Z",
    turnId: null,
    t3workExt: {
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
              { phase: "Review", kind: "agent", label: "Summarize the risk" },
              { phase: "Decide", kind: "ask", label: "Merge it?" },
              { phase: "Decide", kind: "act", label: "github.pullRequest.merge" },
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
      {...buildT3workMessagesTimelineTestProps()}
      timelineEntries={messages.map((message, index) => ({
        id: `timeline-${index}`,
        kind: "message" as const,
        createdAt: message.createdAt,
        message,
      }))}
    />,
  );
}

describe("workflow shape card in the timeline", () => {
  it("renders the plan header, phase strip, and kind-tagged steps", async () => {
    const markup = await renderTimeline([shapeMessage("message-shape-1")]);

    expect(markup).toContain("The plan");
    expect(markup).toContain("shape.pr-review");
    expect(markup).toContain("Summarize a PR, then ask the user whether to merge it.");
    // phase strip
    expect(markup).toContain("1. Review");
    expect(markup).toContain("2. Decide");
    // kind-tagged steps
    expect(markup).toContain("github.pullRequest.get");
    expect(markup).toContain("github.pullRequest.merge");
    expect(markup).toContain("Read");
    expect(markup).toContain("Agent");
    expect(markup).toContain("Ask");
    expect(markup).toContain("Act");
    // the card owns the header — the message text echo must not double up above it
    expect(markup).not.toContain("Plan: shape.pr-review");
  }, 10000);
});
