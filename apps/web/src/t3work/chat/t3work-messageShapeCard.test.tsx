/* oxlint-disable eslint/no-unused-vars -- Existing merged lint debt; keep green while preserving behavior. */
// @vitest-environment jsdom
/**
 * The play-as-shape "plan" card (recipe-UX design pass): the `t3work.workflow.shape` view
 * renders in the timeline as a distinct bordered card — phase headers plus the ordered,
 * kind-marked step list (read / agent / ask / act). The launch message's short text echo is
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

function shapeMessage(id: string, capabilities?: ReadonlyArray<unknown>): ChatMessage {
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
            ...(capabilities === undefined ? {} : { capabilities }),
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
  it("keeps authored steps in order when a phase appears again later", async () => {
    const { groupT3workShapeSteps } = await import("~/t3work/chat/t3work-messageShapeCard");
    const groups = groupT3workShapeSteps({
      name: "ordered",
      description: undefined,
      phases: [{ title: "Review" }, { title: "Decide" }],
      steps: [
        { phase: "Review", kind: "read", label: "Read first" },
        { phase: "Decide", kind: "ask", label: "Ask second" },
        { phase: "Review", kind: "act", label: "Act third" },
      ],
      workflowRunId: "run-ordered",
    });

    expect(groups.map((group) => group.title)).toEqual(["Review", "Decide", "Review"]);
    expect(groups.flatMap((group) => group.steps.map((step) => step.label))).toEqual([
      "Read first",
      "Ask second",
      "Act third",
    ]);
  });

  it("renders the workflow title, ordered phase headers, and compact step kinds", async () => {
    const markup = await renderTimeline([shapeMessage("message-shape-1")]);

    expect(markup).toContain("shape.pr-review");
    expect(markup).toContain("Summarize a PR, then ask the user whether to merge it.");
    expect(markup).not.toContain("The plan");
    // phase headers sit immediately before their ordered steps
    expect(markup.indexOf("Review")).toBeLessThan(markup.indexOf("github.pullRequest.get"));
    expect(markup.indexOf("Decide")).toBeLessThan(markup.indexOf("Merge it?"));
    // Agent uses its labelled robot icon only; ask remains explicitly tagged for user action.
    expect(markup).toContain("github.pullRequest.get");
    expect(markup).toContain("github.pullRequest.merge");
    expect(markup).toContain("Read");
    expect(markup).toContain('title="Agent step"');
    expect(markup).not.toContain(">Agent<");
    expect(markup).toContain("Ask");
    expect(markup).toContain("Act");
    // the card owns the header — the message text echo must not double up above it
    expect(markup).not.toContain("Plan: shape.pr-review");
    // visually quiet default: no capability disclosure row for a capability-less run
    expect(markup).not.toContain("This workflow declared these capabilities");
  }, 30000);

  it("discloses declared capabilities as plain-language chips before execution", async () => {
    const message = shapeMessage("message-shape-caps", [
      { kind: "feature", id: "user" },
      { kind: "feature", id: "schedule" },
      { kind: "feature", id: "future-unknown" },
      {
        kind: "tool-group",
        id: "github.write",
        label: "Modify GitHub",
        description: "Merge pull requests, push branches, edit issues.",
      },
    ]);
    const markup = await renderTimeline([message]);

    // engine feature strings render via the engine's own label table (spec 25 §Capability gating)
    expect(markup).toContain("Ask &amp; notify you");
    expect(markup).toContain("Run on a timer");
    // an unknown feature id still shows honestly, by its raw id
    expect(markup).toContain("future-unknown");
    // tool-group refs carry their own author-declared label + description
    expect(markup).toContain("Modify GitHub");
    expect(markup).toContain("Merge pull requests, push branches, edit issues.");
    // the disclosure row is present and sits above the step list
    expect(markup).toContain("This workflow declared these capabilities");
    expect(markup.indexOf("Modify GitHub")).toBeLessThan(markup.indexOf("github.pullRequest.get"));
  }, 30000);
});
