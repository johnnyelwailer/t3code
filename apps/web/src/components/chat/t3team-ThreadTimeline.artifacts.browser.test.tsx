/**
 * `ThreadTimeline` derives the streamed entries itself, so the fork artifacts must be joined
 * there: a plan card is a recorder note ("Plan: <name>") whose rich view lives in a `message-ext`
 * artifact. Real `ThreadTimeline`, `MessagesTimeline` and card components; only the two data
 * seams (the thread's turn items and its artifact stream) are replaced.
 */
import {
  EnvironmentId,
  MessageId,
  type OrchestrationV2ProjectedTurnItem,
  type T3TeamThreadArtifact,
  ThreadId,
  TurnItemId,
} from "@t3tools/contracts";
import type { LegendListRef } from "@legendapp/list/react";
import * as DateTime from "effect/DateTime";
import { createRef } from "react";
import { describe, expect, it, vi } from "vite-plus/test";

import "~/index.css";

import { act, render } from "../../../test/render";

const { seams } = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  return {
    seams: {
      turnItems: [] as unknown[],
      artifacts: [] as unknown[],
      listeners,
      subscribe(listener: () => void) {
        listeners.add(listener);
        return () => void listeners.delete(listener);
      },
    },
  };
});

vi.mock("~/state/entities", async (importOriginal) => {
  const { useSyncExternalStore } = await import("react");
  return {
    ...(await importOriginal<typeof import("~/state/entities")>()),
    useThreadVisibleTurnItems: () =>
      useSyncExternalStore(
        seams.subscribe,
        () => seams.turnItems,
        () => seams.turnItems,
      ),
  };
});
vi.mock("~/state/t3team-threadSideStreams", async (importOriginal) => {
  const { useSyncExternalStore } = await import("react");
  return {
    ...(await importOriginal<typeof import("~/state/t3team-threadSideStreams")>()),
    useT3TeamThreadArtifacts: () =>
      useSyncExternalStore(
        seams.subscribe,
        () => seams.artifacts,
        () => seams.artifacts,
      ),
  };
});

import { ThreadTimeline } from "./ThreadTimeline";

const environmentId = EnvironmentId.make("environment-local");
const threadId = ThreadId.make("thread-plan");
const messageId = "t3team-wf-shape:run-1";
const at = DateTime.makeUnsafe("2026-10-26T10:00:00Z");

function systemNote(id: string, text: string, ordinal: number): OrchestrationV2ProjectedTurnItem {
  const itemId = TurnItemId.make(`t3team:turn-item:${id}`);
  return {
    position: ordinal,
    visibility: "local",
    sourceThreadId: threadId,
    sourceItemId: itemId,
    item: {
      id: itemId,
      threadId,
      runId: null,
      nodeId: null,
      providerThreadId: null,
      providerTurnId: null,
      nativeItemRef: null,
      parentItemId: null,
      status: "completed",
      title: null,
      ordinal,
      startedAt: at,
      completedAt: at,
      updatedAt: at,
      type: "system_notice",
      message: text,
    },
  };
}

const shapeArtifact: T3TeamThreadArtifact = {
  id: `message-ext:${messageId}`,
  threadId,
  messageId: MessageId.make(messageId),
  kind: "message-ext",
  createdAt: "2026-10-26T10:00:00.000Z",
  updatedAt: "2026-10-26T10:00:00.000Z",
  payload: {
    author: { kind: "system", workflowRunId: "run-1" },
    visibleToUser: true,
    attachments: [
      {
        kind: "view",
        miniappId: "t3team.workflow.shape",
        props: {
          name: "qa-note",
          description: "Write a note for QA",
          phases: [{ title: "Draft" }],
          steps: [{ phase: "Draft", kind: "agent", label: "Compose the note" }],
          workflowRunId: "run-1",
        },
      },
    ],
  },
};

async function setSeams(next: { turnItems?: unknown[]; artifacts?: unknown[] }) {
  await act(() => {
    seams.turnItems = next.turnItems ?? seams.turnItems;
    seams.artifacts = next.artifacts ?? seams.artifacts;
    for (const listener of seams.listeners) listener();
  });
}

function timeline() {
  return (
    <ThreadTimeline
      threadDetailRef={null}
      entriesInput={{ optimisticMessages: [] }}
      draftEntries={null}
      t3teamArtifacts={{ environmentId, threadId, messages: [] }}
      activeThreadKey={`${environmentId}:${threadId}`}
      syncing={false}
      detailLoading
      isWorking={false}
      listRef={createRef<LegendListRef | null>()}
      latestRun={null}
      turnDiffSummaries={[]}
      runs={[]}
      routeThreadKey={`${environmentId}:${threadId}`}
      onOpenTurnDiff={() => {}}
      onOpenThread={() => {}}
      onForkFromRun={async () => {}}
      supportsConversationRollback={false}
      onRevertToTurnCount={() => {}}
      isRevertingCheckpoint={false}
      onImageExpand={() => {}}
      activeThreadEnvironmentId={environmentId}
      markdownCwd={undefined}
      resolvedTheme="light"
      timestampFormat="locale"
      workspaceRoot={undefined}
      anchorMessageId={null}
      onAnchorReady={() => {}}
      onAnchorSizeChanged={() => {}}
      contentInsetEndAdjustment={0}
      emptyPlaceholderInset={0}
      liveFollowEnabled
      onIsAtEndChange={() => {}}
      onManualNavigation={() => {}}
    />
  );
}

function container() {
  const element = document.createElement("div");
  element.style.cssText = "height: 1200px; width: 900px; display: flex; flex-direction: column;";
  return element;
}

describe("ThreadTimeline fork artifacts", () => {
  it("shows the plan card for a plan note whose artifact is already there", async () => {
    await setSeams({
      turnItems: [systemNote(messageId, "Plan: qa-note", 0)],
      artifacts: [shapeArtifact],
    });
    await using screen = await render(timeline(), { container: container() });
    await expect.element(screen.getByText("Write a note for QA")).toBeVisible();
    await expect.element(screen.getByText("Compose the note")).toBeVisible();
  });

  it("turns the bare plan text into the card when the artifact arrives after mount", async () => {
    await setSeams({ turnItems: [systemNote(messageId, "Plan: qa-note", 0)], artifacts: [] });
    await using screen = await render(timeline(), { container: container() });
    await expect.element(screen.getByText("Plan: qa-note")).toBeVisible();
    await expect.element(screen.getByText("Compose the note")).not.toBeInTheDocument();

    await setSeams({ artifacts: [shapeArtifact] });
    await expect.element(screen.getByText("Compose the note")).toBeVisible();
  });

  it("keeps the quiet text for a system note that has no artifact", async () => {
    await setSeams({
      turnItems: [systemNote("note-1", "Retrying (1/3)", 0)],
      artifacts: [shapeArtifact],
    });
    await using screen = await render(timeline(), { container: container() });
    await expect.element(screen.getByText("Retrying (1/3)")).toBeVisible();
    await expect.element(screen.getByText("Compose the note")).not.toBeInTheDocument();
  });
});
