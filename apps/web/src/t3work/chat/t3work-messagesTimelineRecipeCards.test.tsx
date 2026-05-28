import { EnvironmentId } from "@t3tools/contracts";
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
  });
});
