/**
 * `ThreadTimeline` derives the streamed entries itself and hands them to `MessagesTimeline`, so
 * the fork artifacts must be joined there: a plan card is a recorder note ("Plan: <name>") whose
 * rich view lives in a `message-ext` artifact, and without the join the row shows bare text.
 */
import {
  EnvironmentId,
  MessageId,
  type OrchestrationV2ProjectedTurnItem,
  type T3TeamThreadArtifact,
  ThreadId,
  TurnItemId,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { TimelineEntry } from "~/session-logic";

const { mockVisibleTurnItems, mockArtifacts, mockTimeline } = vi.hoisted(() => ({
  mockVisibleTurnItems: vi.fn(),
  mockArtifacts: vi.fn(),
  mockTimeline: vi.fn(),
}));

vi.mock("~/state/entities", () => ({ useThreadVisibleTurnItems: mockVisibleTurnItems }));
vi.mock("~/state/t3team-threadSideStreams", () => ({ useT3TeamThreadArtifacts: mockArtifacts }));
vi.mock("./MessagesTimeline", () => ({
  MessagesTimeline: (props: { readonly timelineEntries: ReadonlyArray<TimelineEntry> }) => {
    mockTimeline(props.timelineEntries);
    return null;
  },
}));

import { ThreadTimeline } from "./ThreadTimeline";

const environmentId = EnvironmentId.make("env-1");
const threadId = ThreadId.make("thread-1");
const messageId = "t3team-wf-shape:run-1";
const at = DateTime.makeUnsafe("2026-10-26T10:00:00Z");

const planNote: OrchestrationV2ProjectedTurnItem = {
  position: 0,
  visibility: "local",
  sourceThreadId: threadId,
  sourceItemId: TurnItemId.make(`t3team:turn-item:${messageId}`),
  item: {
    id: TurnItemId.make(`t3team:turn-item:${messageId}`),
    threadId,
    runId: null,
    nodeId: null,
    providerThreadId: null,
    providerTurnId: null,
    nativeItemRef: null,
    parentItemId: null,
    status: "completed",
    title: null,
    ordinal: 0,
    startedAt: at,
    completedAt: at,
    updatedAt: at,
    type: "system_notice",
    message: "Plan: qa-note",
  },
};

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
        props: { name: "qa-note", phases: [], steps: [], workflowRunId: "run-1" },
      },
    ],
  },
};

function renderedEntries(): ReadonlyArray<TimelineEntry> {
  const timelineProps = {} as Parameters<typeof ThreadTimeline>[0];
  renderToStaticMarkup(
    <ThreadTimeline
      {...timelineProps}
      threadDetailRef={null}
      entriesInput={{ optimisticMessages: [] }}
      draftEntries={null}
      t3teamArtifacts={{ environmentId, threadId, messages: [] }}
      activeThreadKey="env-1:thread-1"
      syncing={false}
      detailLoading
      readyMarkdownCwd={null}
      readyWorkspaceRoot={null}
    />,
  );
  return mockTimeline.mock.calls.at(-1)?.[0] as ReadonlyArray<TimelineEntry>;
}

describe("ThreadTimeline fork artifacts", () => {
  beforeEach(() => {
    mockTimeline.mockReset();
    mockVisibleTurnItems.mockReturnValue([planNote]);
    mockArtifacts.mockReturnValue([shapeArtifact]);
  });

  it("gives the plan note's row the plan card view its artifact carries", () => {
    const [entry] = renderedEntries();
    const message = entry?.kind === "message" ? entry.message : null;
    expect(message?.text).toBe("Plan: qa-note");
    expect(message?.t3teamExt?.attachments).toEqual([
      expect.objectContaining({ kind: "view", miniappId: "t3team.workflow.shape" }),
    ]);
  });
});
