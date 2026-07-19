import { MessageId } from "@t3tools/contracts";
import {
  PROJECT_RECIPE_MESSAGE_VIEW_WORKFLOW_CARD,
  PROJECT_RECIPE_MESSAGE_VIEW_WORKFLOW_DECISION,
} from "@t3tools/project-recipes";
import { type ReactNode, type Ref } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vite-plus/test";
import type { LegendListRef } from "@legendapp/list/react";

import { buildT3workMessagesTimelineTestProps } from "~/t3work/chat/t3work-messagesTimelineTestProps";

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

beforeAll(() => {
  vi.stubGlobal("window", {
    matchMedia: () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
    addEventListener: () => {},
    removeEventListener: () => {},
    getComputedStyle: () => ({
      colorScheme: "dark",
      length: 0,
      item: () => "",
      getPropertyValue: () => "",
    }),
    requestAnimationFrame: (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    },
    cancelAnimationFrame: () => {},
    desktopBridge: undefined,
  });
  vi.stubGlobal("document", {
    documentElement: {
      classList: {
        add: () => {},
        remove: () => {},
        toggle: () => {},
        contains: () => false,
      },
      offsetHeight: 0,
    },
  });
  vi.stubGlobal("localStorage", {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {},
  });
});

describe("MessagesTimeline recipe cards", () => {
  it("renders an empty timeline shell", async () => {
    const { MessagesTimeline } = await import("~/components/chat/MessagesTimeline");
    const markup = renderToStaticMarkup(
      <MessagesTimeline {...buildT3workMessagesTimelineTestProps()} timelineEntries={[]} />,
    );

    expect(markup).toBeTruthy();
  }, 10000);

  it("renders workflow-card system messages from t3workExt view attachments", async () => {
    const { MessagesTimeline } = await import("~/components/chat/MessagesTimeline");
    const markup = renderToStaticMarkup(
      <MessagesTimeline
        {...buildT3workMessagesTimelineTestProps()}
        timelineEntries={[
          {
            id: "timeline-system-1",
            kind: "message",
            createdAt: "2026-03-17T19:12:28.000Z",
            message: {
              id: MessageId.make("message-system-1"),
              role: "system",
              text: "",
              streaming: false,
              createdAt: "2026-03-17T19:12:28.000Z",
              updatedAt: "2026-03-17T19:12:28.000Z",
              turnId: null,
              t3workExt: {
                visibleToUser: true,
                visibleToAgent: false,
                status: "waiting-for-input",
                attachments: [
                  {
                    kind: "view",
                    miniappId: PROJECT_RECIPE_MESSAGE_VIEW_WORKFLOW_CARD,
                    props: {
                      workflowRunId: "run-1",
                      stepId: "present-card",
                      phase: "updated",
                      awaitingActionId: "approve",
                      card: {
                        kind: "approval",
                        id: "approval-card",
                        title: "Approve QA launch",
                        body: "Approve the recipe workflow.",
                        actions: [{ id: "approve", label: "Approve" }],
                      },
                    },
                  },
                ],
              },
            },
          },
        ]}
      />,
    );

    expect(markup).toContain("System");
    expect(markup).toContain("Approve QA launch");
    expect(markup).toContain("Approve the recipe workflow.");
    expect(markup).toContain("Approve");
  }, 10000);

  it("renders generic t3work system attachments for file, image, resource, artifact, and view kinds", async () => {
    const { MessagesTimeline } = await import("~/components/chat/MessagesTimeline");
    const markup = renderToStaticMarkup(
      <MessagesTimeline
        {...buildT3workMessagesTimelineTestProps()}
        timelineEntries={[
          {
            id: "timeline-system-2",
            kind: "message",
            createdAt: "2026-03-17T19:12:29.000Z",
            message: {
              id: MessageId.make("message-system-2"),
              role: "system",
              text: "Attachments ready",
              streaming: false,
              createdAt: "2026-03-17T19:12:29.000Z",
              updatedAt: "2026-03-17T19:12:29.000Z",
              turnId: null,
              t3workExt: {
                visibleToUser: true,
                attachments: [
                  {
                    kind: "file",
                    file: {
                      id: "file-1",
                      label: "runbook.md",
                      mimeType: "text/markdown",
                      sizeBytes: 2048,
                    },
                  },
                  {
                    kind: "image",
                    image: {
                      id: "image-1",
                      label: "wireframe.png",
                      mimeType: "image/png",
                    },
                    alt: "UI wireframe",
                  },
                  {
                    kind: "resource",
                    resource: {
                      provider: "atlassian",
                      kind: "ticket",
                      id: "resource-1",
                      displayId: "PROJ-123",
                      title: "Fix import crash",
                      status: "In Progress",
                    },
                  },
                  {
                    kind: "artifact",
                    artifact: {
                      kind: "implementation-plan",
                      label: "Implementation plan",
                      path: ".t3work/artifacts/plan.md",
                    },
                  },
                  {
                    kind: "view",
                    miniappId: "t3work.custom-view",
                    props: { section: "summary" },
                  },
                ],
              },
            },
          },
        ]}
      />,
    );

    expect(markup).toContain("Attachments ready");
    expect(markup).toContain("runbook.md");
    expect(markup).toContain("wireframe.png");
    expect(markup).toContain("UI wireframe");
    expect(markup).toContain("Fix import crash");
    expect(markup).toContain("PROJ-123");
    expect(markup).toContain("Implementation plan");
    expect(markup).toContain(".t3work/artifacts/plan.md");
    expect(markup).toContain("t3work.custom-view");
  }, 10000);

  it("renders a widget without generic System chrome or artifact transport text", async () => {
    const { MessagesTimeline } = await import("~/components/chat/MessagesTimeline");
    const markup = renderToStaticMarkup(
      <MessagesTimeline
        {...buildT3workMessagesTimelineTestProps()}
        timelineEntries={[
          {
            id: "timeline-widget",
            kind: "message",
            createdAt: "2026-03-17T19:12:30.000Z",
            message: {
              id: MessageId.make("message-widget"),
              role: "system",
              text: "",
              streaming: false,
              createdAt: "2026-03-17T19:12:30.000Z",
              updatedAt: "2026-03-17T19:12:30.000Z",
              turnId: null,
              t3workExt: {
                visibleToUser: true,
                visibleToAgent: false,
                attachments: [
                  {
                    kind: "widget",
                    widget: {
                      widgetId: "artifact-transport-id",
                      title: "Release approval",
                      format: "html",
                      html: "<button>Approve</button>",
                    },
                  },
                ],
              },
            },
          },
        ]}
      />,
    );

    expect(markup).toContain('data-widget-id="artifact-transport-id"');
    expect(markup).toContain("Approve");
    expect(markup).not.toContain(">System<");
    expect(markup).not.toContain(">Release approval<");
  }, 10000);

  it("renders plain workflow notifications without generic System chrome", async () => {
    const { MessagesTimeline } = await import("~/components/chat/MessagesTimeline");
    const markup = renderToStaticMarkup(
      <MessagesTimeline
        {...buildT3workMessagesTimelineTestProps()}
        timelineEntries={[
          {
            id: "timeline-workflow-notification",
            kind: "message",
            createdAt: "2026-03-17T19:12:31.000Z",
            message: {
              id: MessageId.make("message-workflow-notification"),
              role: "system",
              text: "Review finished.",
              streaming: false,
              createdAt: "2026-03-17T19:12:31.000Z",
              updatedAt: "2026-03-17T19:12:31.000Z",
              turnId: null,
              t3workExt: {
                author: { kind: "system", workflowRunId: "run-1" },
                visibleToUser: true,
                visibleToAgent: false,
              },
            },
          },
        ]}
      />,
    );

    expect(markup).toContain("Review finished.");
    expect(markup).not.toContain(">System<");
  }, 10000);

  it("sandbox-promotes historical workflow HTML instead of showing literal system text", async () => {
    const { MessagesTimeline } = await import("~/components/chat/MessagesTimeline");
    const markup = renderToStaticMarkup(
      <MessagesTimeline
        {...buildT3workMessagesTimelineTestProps()}
        timelineEntries={[
          {
            id: "timeline-historical-html",
            kind: "message",
            createdAt: "2026-03-17T19:12:32.000Z",
            message: {
              id: MessageId.make("message-historical-html"),
              role: "system",
              text: "<div><strong>Legacy workflow widget</strong></div>",
              streaming: false,
              createdAt: "2026-03-17T19:12:32.000Z",
              updatedAt: "2026-03-17T19:12:32.000Z",
              turnId: null,
              t3workExt: {
                author: { kind: "system", workflowRunId: "run-legacy" },
                visibleToUser: true,
                visibleToAgent: false,
              },
            },
          },
        ]}
      />,
    );

    expect(markup).toContain('data-widget-id="historical-workflow:message-historical-html"');
    expect(markup).toContain("Legacy workflow widget");
    expect(markup).not.toContain(">System<");
  }, 10000);

  it("renders sandboxed askUser HTML context before the decision actions", async () => {
    const { MessagesTimeline } = await import("~/components/chat/MessagesTimeline");
    const markup = renderToStaticMarkup(
      <MessagesTimeline
        {...buildT3workMessagesTimelineTestProps()}
        timelineEntries={[
          {
            id: "timeline-html-decision",
            kind: "message",
            createdAt: "2026-03-17T19:12:33.000Z",
            message: {
              id: MessageId.make("message-html-decision"),
              role: "system",
              text: "Release decision",
              streaming: false,
              createdAt: "2026-03-17T19:12:33.000Z",
              updatedAt: "2026-03-17T19:12:33.000Z",
              turnId: null,
              t3workExt: {
                author: { kind: "system", workflowRunId: "run-decision" },
                status: "waiting-for-input",
                visibleToUser: true,
                attachments: [
                  {
                    kind: "view",
                    miniappId: PROJECT_RECIPE_MESSAGE_VIEW_WORKFLOW_DECISION,
                    props: {
                      question: "Release decision",
                      affordance: { kind: "choice", options: ["approve", "reject"] },
                      correlationId: "run-decision:1",
                      workflowRunId: "run-decision",
                    },
                  },
                  {
                    kind: "widget",
                    widget: {
                      widgetId: "decision-context",
                      title: "release_decision",
                      format: "html",
                      html: "<section>Release evidence</section>",
                    },
                  },
                ],
              },
            },
          },
        ]}
      />,
    );

    expect(markup.indexOf('data-widget-id="decision-context"')).toBeLessThan(
      markup.indexOf("approve"),
    );
    expect(markup).not.toContain(">System<");
  }, 10000);
});
