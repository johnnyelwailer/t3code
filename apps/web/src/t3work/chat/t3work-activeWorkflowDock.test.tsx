// @vitest-environment jsdom
import { MessageId } from "@t3tools/contracts";
import { PROJECT_RECIPE_MESSAGE_VIEW_WORKFLOW_SHAPE } from "@t3tools/project-recipes";
import type { LegendListRef } from "@legendapp/list/react";
import { act, type ReactNode, type Ref } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { ChatMessage } from "~/types";
import {
  deriveT3workActiveWorkflowDockItems,
  T3workActiveWorkflowDock,
  type T3workActiveWorkflowDockItem,
} from "~/t3work/chat/t3work-activeWorkflowDock";
import type { T3workWorkflowRunProgress } from "~/t3work/chat/t3work-threadWorkflowStepProgress";
import { buildT3workMessagesTimelineTestProps } from "~/t3work/chat/t3work-messagesTimelineTestProps";

vi.mock("@legendapp/list/react", async () => ({
  LegendList: (props: {
    data: Array<{ id: string }>;
    keyExtractor: (item: { id: string }) => string;
    renderItem: (args: { item: { id: string } }) => ReactNode;
    ref?: Ref<LegendListRef>;
  }) => (
    <div>
      {props.data.map((item) => (
        <div key={props.keyExtractor(item)}>{props.renderItem({ item })}</div>
      ))}
    </div>
  ),
}));

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

globalThis.ResizeObserver ??= class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

function shapeMessage(runId: string, name: string): ChatMessage {
  return {
    id: MessageId.make(`message-${runId}`),
    role: "system",
    text: name,
    streaming: false,
    createdAt: "2026-07-19T10:00:00.000Z",
    updatedAt: "2026-07-19T10:00:00.000Z",
    turnId: null,
    t3workExt: {
      visibleToUser: true,
      attachments: [
        {
          kind: "view",
          miniappId: PROJECT_RECIPE_MESSAGE_VIEW_WORKFLOW_SHAPE,
          props: { name, phases: [], steps: [], workflowRunId: runId },
        },
      ],
    },
  };
}

function progress(
  runId: string,
  phase?: "completed" | "failed" | "cancelled" | "paused",
): T3workWorkflowRunProgress {
  return {
    runId,
    steps: [
      {
        stepId: `${runId}:1`,
        seq: 1,
        stepKind: "thread.turn",
        phase: phase === undefined ? "started" : phase,
        detail: `Review ${runId}`,
      },
      ...(phase === undefined
        ? [
            {
              stepId: `${runId}:2`,
              seq: 2,
              stepKind: "user.input",
              phase: "waiting" as const,
              detail: "approval",
            },
          ]
        : []),
    ],
    run: phase === undefined ? null : { phase },
  };
}

const mounted: Array<{ root: ReturnType<typeof createRoot>; container: HTMLElement }> = [];

async function render(node: ReactNode): Promise<HTMLElement> {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  await act(async () => root.render(node));
  return container;
}

afterEach(async () => {
  while (mounted.length > 0) {
    const current = mounted.pop()!;
    await act(async () => current.root.unmount());
    current.container.remove();
  }
});

describe("active workflow dock", () => {
  it("keeps active and paused runs, but undocks terminal history", () => {
    const messages = [
      shapeMessage("run-active", "Active review"),
      shapeMessage("run-paused", "Paused review"),
      shapeMessage("run-complete", "Old review"),
      shapeMessage("run-failed", "Failed review"),
      shapeMessage("run-stopped", "Stopped review"),
    ];
    const runs = new Map<string, T3workWorkflowRunProgress>([
      ["run-active", progress("run-active")],
      ["run-paused", progress("run-paused", "paused")],
      ["run-complete", progress("run-complete", "completed")],
      ["run-failed", progress("run-failed", "failed")],
      ["run-stopped", progress("run-stopped", "cancelled")],
    ]);

    const items = deriveT3workActiveWorkflowDockItems(
      messages.map((message) => ({ kind: "message", message })),
      runs,
    );

    expect(items.map((item) => item.name)).toEqual(["Active review", "Paused review"]);
    expect(items[0]?.summaries).toEqual(["Active: Review run-active", "Waiting: approval"]);
    expect(items[1]?.summaries).toEqual(["Paused: Review run-paused"]);
  });

  it("shows a queued run before its first journal step", () => {
    const message = shapeMessage("run-queued", "Queued review");
    const items = deriveT3workActiveWorkflowDockItems([{ kind: "message", message }], new Map(), {
      runId: "run-queued",
      status: "queued",
      pendingKind: null,
      wakeAt: null,
      updatedAt: "2026-07-19T10:00:00.000Z",
    });

    expect(items[0]?.summaries).toEqual(["Waiting to start"]);
  });

  it("switches compactly and opens the selected workflow card", async () => {
    const onOpen = vi.fn();
    const items: T3workActiveWorkflowDockItem[] = [
      {
        runId: "run-one",
        messageId: MessageId.make("message-one"),
        name: "First workflow",
        summaries: ["Active: first step"],
      },
      {
        runId: "run-two",
        messageId: MessageId.make("message-two"),
        name: "Second workflow",
        summaries: ["Waiting: second step"],
      },
    ];
    const container = await render(<T3workActiveWorkflowDock items={items} onOpen={onOpen} />);

    expect(container.textContent).toContain("First workflow");
    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[aria-label="Next active orchestration"]')!
        .click();
    });
    expect(container.textContent).toContain("Second workflow");
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[title^="Show Second workflow"]')!.click();
    });
    expect(onOpen).toHaveBeenCalledWith(items[1]);
  });

  it("navigates the virtualized timeline to the full workflow card", async () => {
    const { MessagesTimeline } = await import("~/components/chat/MessagesTimeline");
    const message = shapeMessage("run-scroll", "Scroll target");
    const props = buildT3workMessagesTimelineTestProps();
    const scrollToIndex = vi.fn();
    props.listRef.current = { scrollToIndex } as unknown as LegendListRef;

    await render(
      <MessagesTimeline
        {...props}
        timelineEntries={[
          { id: "timeline-shape", kind: "message", createdAt: message.createdAt, message },
        ]}
        workflowCardNavigationRequest={{ messageId: message.id, requestId: 1 }}
      />,
    );

    expect(scrollToIndex).toHaveBeenCalledWith({
      index: 0,
      animated: true,
      viewPosition: 0,
      viewOffset: 24,
    });
  });
});
