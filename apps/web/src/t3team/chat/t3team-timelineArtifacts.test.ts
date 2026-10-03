import {
  MessageId,
  type OrchestrationV2ProjectedTurnItem,
  type OrchestrationV2TurnItem,
  type T3TeamThreadArtifact,
  ThreadId,
  TurnItemId,
  withT3TeamMessageExtContext,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import { describe, expect, it } from "vite-plus/test";

import { deriveTimelineEntriesFromVisibleTurnItems, type TimelineEntry } from "~/session-logic";
import {
  decorateT3TeamTimelineEntries,
  t3teamThreadActivitiesOf,
} from "~/t3team/chat/t3team-timelineArtifacts";

const threadId = ThreadId.make("thread-1");
const at = (iso: string) => DateTime.makeUnsafe(iso);
const base = {
  threadId,
  runId: null,
  nodeId: null,
  providerThreadId: null,
  providerTurnId: null,
  nativeItemRef: null,
  parentItemId: null,
  status: "completed" as const,
  title: null,
};

const visible = (item: OrchestrationV2TurnItem): OrchestrationV2ProjectedTurnItem => ({
  position: item.ordinal,
  visibility: "local",
  sourceThreadId: item.threadId,
  sourceItemId: item.id,
  item,
});

function recorderNote(messageId: string, text: string, iso: string, ordinal: number) {
  return visible({
    ...base,
    id: TurnItemId.make(`t3team:turn-item:${messageId}`),
    ordinal,
    startedAt: at(iso),
    completedAt: at(iso),
    updatedAt: at(iso),
    type: "system_notice",
    message: text,
  });
}

function assistant(messageId: string, text: string, iso: string, ordinal: number) {
  return visible({
    ...base,
    id: TurnItemId.make(`item:${messageId}`),
    ordinal,
    startedAt: at(iso),
    completedAt: at(iso),
    updatedAt: at(iso),
    type: "assistant_message",
    messageId: MessageId.make(messageId),
    text,
    streaming: false,
  });
}

function entriesOf(rows: ReadonlyArray<OrchestrationV2ProjectedTurnItem>): TimelineEntry[] {
  return deriveTimelineEntriesFromVisibleTurnItems({
    visibleTurnItems: rows,
    optimisticMessages: [],
  });
}

function artifact(
  fields: Pick<T3TeamThreadArtifact, "id" | "kind" | "messageId" | "payload"> & {
    readonly createdAt?: string;
  },
): T3TeamThreadArtifact {
  const createdAt = fields.createdAt ?? "2026-10-01T10:00:00.000Z";
  return { threadId, createdAt, updatedAt: createdAt, ...fields };
}

const widgetPayload = {
  kind: "widget",
  widget: { widgetId: "w-1", title: "chart", format: "html", html: "<p>chart</p>" },
};

describe("fork recorder notes", () => {
  it("become system message entries keyed by their message id, not runtime warnings", () => {
    const [entry] = entriesOf([
      recorderNote("note-1", "Retrying (1/3)", "2026-10-01T10:00:00Z", 0),
    ]);
    expect(entry).toMatchObject({ id: "note-1", kind: "message" });
    expect(entry?.kind === "message" ? entry.message : null).toMatchObject({
      id: "note-1",
      role: "system",
      text: "Retrying (1/3)",
    });
  });
});

describe("decorateT3TeamTimelineEntries", () => {
  it("passes the entries through untouched when there is nothing fork-owned", () => {
    const entries = entriesOf([assistant("a-1", "hello", "2026-10-01T10:00:00Z", 0)]);
    const decorated = decorateT3TeamTimelineEntries({
      entries,
      artifacts: [],
      contextByMessageId: new Map(),
    });
    expect(decorated).toBe(entries);
  });

  it("merges a note's context ext with its message-ext artifact", () => {
    const entries = entriesOf([recorderNote("ask-1", "Ship it?", "2026-10-01T10:00:00Z", 0)]);
    const context = withT3TeamMessageExtContext({ status: "waiting-for-input" })!;
    const decorated = decorateT3TeamTimelineEntries({
      entries,
      artifacts: [
        artifact({
          id: "message-ext:ask-1",
          kind: "message-ext",
          messageId: MessageId.make("ask-1"),
          payload: { attachments: [widgetPayload] },
        }),
      ],
      contextByMessageId: new Map([["ask-1", context]]),
    });
    const message = decorated[0]?.kind === "message" ? decorated[0].message : null;
    expect(message?.t3teamExt?.status).toBe("waiting-for-input");
    expect(message?.t3teamExt?.attachments).toHaveLength(1);
  });

  it("anchors a widget to its message and keeps decorated messages stable across calls", () => {
    const entries = entriesOf([assistant("a-1", "Here:", "2026-10-01T10:00:00Z", 0)]);
    const artifacts = [
      artifact({
        id: "widget:w-1",
        kind: "widget",
        messageId: MessageId.make("a-1"),
        payload: widgetPayload,
      }),
    ];
    const input = { entries, artifacts, contextByMessageId: new Map() };
    const first = decorateT3TeamTimelineEntries(input);
    const second = decorateT3TeamTimelineEntries(input);
    const message = first[0]?.kind === "message" ? first[0].message : null;
    expect(message?.t3teamExt?.attachments?.[0]).toMatchObject({ kind: "widget" });
    expect(second[0]).toBe(first[0]);
  });

  it("inserts a message-less widget as its own system row at its createdAt", () => {
    const entries = entriesOf([
      assistant("a-1", "before", "2026-10-01T10:00:00.000Z", 0),
      assistant("a-2", "after", "2026-10-01T12:00:00.000Z", 1),
    ]);
    const decorated = decorateT3TeamTimelineEntries({
      entries,
      artifacts: [
        artifact({
          id: "widget:w-1",
          kind: "widget",
          messageId: null,
          payload: widgetPayload,
          createdAt: "2026-10-01T11:00:00.000Z",
        }),
      ],
      contextByMessageId: new Map(),
    });
    expect(decorated.map((entry) => entry.id)).toEqual(["a-1", "widget:w-1", "a-2"]);
    const widgetRow = decorated[1];
    expect(widgetRow?.kind === "message" ? widgetRow.message.role : null).toBe("system");
  });

  it("ignores payloads that do not decode and kinds it does not render", () => {
    const entries = entriesOf([assistant("a-1", "hello", "2026-10-01T10:00:00Z", 0)]);
    const decorated = decorateT3TeamTimelineEntries({
      entries,
      artifacts: [
        artifact({ id: "widget:bad", kind: "widget", messageId: null, payload: { kind: "nope" } }),
        artifact({ id: "jira-draft:1", kind: "draft-mutation", messageId: null, payload: {} }),
      ],
      contextByMessageId: new Map(),
    });
    expect(decorated).toBe(entries);
  });
});

describe("t3teamThreadActivitiesOf", () => {
  it("reads workflow activity artifacts at their latest update", () => {
    const step = {
      ...artifact({
        id: "t3team-wf-step:run-1:1",
        kind: "t3team.recipe.workflow.step",
        messageId: null,
        payload: { tone: "info", summary: "Step 1", payload: { stepId: "run-1:1" } },
      }),
      updatedAt: "2026-10-01T10:05:00.000Z",
    };
    const activities = t3teamThreadActivitiesOf([step, artifact(widgetPayloadArtifact())]);
    expect(activities).toEqual([
      {
        id: "t3team-wf-step:run-1:1",
        kind: "t3team.recipe.workflow.step",
        tone: "info",
        summary: "Step 1",
        payload: { stepId: "run-1:1" },
        createdAt: "2026-10-01T10:05:00.000Z",
      },
    ]);
  });
});

function widgetPayloadArtifact() {
  return { id: "widget:w-1", kind: "widget", messageId: null, payload: widgetPayload } as const;
}
