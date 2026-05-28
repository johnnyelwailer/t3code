import { EnvironmentId, MessageId } from "@t3tools/contracts";
import { PROJECT_RECIPE_MESSAGE_VIEW_WORKFLOW_CARD } from "@t3tools/project-recipes";
import { createRef, type ReactNode, type Ref } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { LegendListRef } from "@legendapp/list/react";

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
  it("renders persisted recipe launch cards from the t3work activity-card prop", async () => {
    const { MessagesTimeline } = await import("~/components/chat/MessagesTimeline");
    const markup = renderToStaticMarkup(
      <MessagesTimeline
        isWorking={false}
        activeTurnInProgress={false}
        activeTurnId={null}
        activeTurnStartedAt={null}
        listRef={createRef<LegendListRef | null>()}
        timelineEntries={[]}
        completionDividerBeforeEntryId={null}
        completionSummary={null}
        turnDiffSummaryByAssistantMessageId={new Map()}
        routeThreadKey="environment-local:thread-1"
        onOpenTurnDiff={() => {}}
        revertTurnCountByUserMessageId={new Map()}
        onRevertUserMessage={() => {}}
        isRevertingCheckpoint={false}
        onImageExpand={() => {}}
        activeThreadEnvironmentId={EnvironmentId.make("environment-local")}
        markdownCwd={undefined}
        resolvedTheme="light"
        timestampFormat="locale"
        workspaceRoot={undefined}
        onIsAtEndChange={() => {}}
        activityCards={[
          {
            id: "recipe-launch-1",
            kind: "recipe-launch",
            createdAt: "2026-03-17T19:12:28.000Z",
            tone: "info",
            launch: {
              recipeId: "qa-test-plan",
              recipeVersion: "0.1.0",
              workflowRunId: "run-1",
              title: "Create QA plan",
              description: "Build a focused QA plan.",
              source: "project-local",
              surface: "workitem.detail.sidepanel",
              phase: "running",
              reason: "QA planning applies to bugs",
            },
          },
        ]}
      />,
    );

    expect(markup).toContain("Create QA plan");
    expect(markup).toContain("Project recipe");
    expect(markup).toContain("Running");
    expect(markup).toContain("qa-test-plan");
  }, 10000);

  it("renders workflow-card system messages from t3workExt view attachments", async () => {
    const { MessagesTimeline } = await import("~/components/chat/MessagesTimeline");
    const markup = renderToStaticMarkup(
      <MessagesTimeline
        isWorking={false}
        activeTurnInProgress={false}
        activeTurnId={null}
        activeTurnStartedAt={null}
        listRef={createRef<LegendListRef | null>()}
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
              completedAt: "2026-03-17T19:12:28.000Z",
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
        completionDividerBeforeEntryId={null}
        completionSummary={null}
        turnDiffSummaryByAssistantMessageId={new Map()}
        routeThreadKey="environment-local:thread-1"
        onOpenTurnDiff={() => {}}
        revertTurnCountByUserMessageId={new Map()}
        onRevertUserMessage={() => {}}
        isRevertingCheckpoint={false}
        onImageExpand={() => {}}
        activeThreadEnvironmentId={EnvironmentId.make("environment-local")}
        markdownCwd={undefined}
        resolvedTheme="light"
        timestampFormat="locale"
        workspaceRoot={undefined}
        onIsAtEndChange={() => {}}
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
        isWorking={false}
        activeTurnInProgress={false}
        activeTurnId={null}
        activeTurnStartedAt={null}
        listRef={createRef<LegendListRef | null>()}
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
              completedAt: "2026-03-17T19:12:29.000Z",
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
        completionDividerBeforeEntryId={null}
        completionSummary={null}
        turnDiffSummaryByAssistantMessageId={new Map()}
        routeThreadKey="environment-local:thread-1"
        onOpenTurnDiff={() => {}}
        revertTurnCountByUserMessageId={new Map()}
        onRevertUserMessage={() => {}}
        isRevertingCheckpoint={false}
        onImageExpand={() => {}}
        activeThreadEnvironmentId={EnvironmentId.make("environment-local")}
        markdownCwd={undefined}
        resolvedTheme="light"
        timestampFormat="locale"
        workspaceRoot={undefined}
        onIsAtEndChange={() => {}}
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
});
