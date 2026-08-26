import { describe, expect, it } from "vite-plus/test";
import type { OrchestrationThreadActivity } from "@t3tools/contracts";

import type { WorkLogEntry } from "~/session-logic";

import {
  describeActorOutboundSend,
  deriveActorOutboundRelations,
  extractActorOutboundTargetThreadId,
  isActorOutboundSendMessageEntry,
} from "./t3team-actorOutbound";

function activity(
  kind: OrchestrationThreadActivity["kind"],
  payload: Record<string, unknown>,
): OrchestrationThreadActivity {
  return {
    id: `act-${kind}-${Math.random().toString(36).slice(2)}`,
    createdAt: "2026-07-19T08:00:00.000Z",
    tone: "info",
    kind,
    summary: "summary",
    payload,
  } as OrchestrationThreadActivity;
}

const PARENT_ID = "parent-thread";
const CHILD_A_ID = "child-a-thread";
const CHILD_B_ID = "child-b-thread";

const sendEntry = (overrides: Partial<WorkLogEntry> = {}): WorkLogEntry => ({
  id: "work-send-1",
  createdAt: "2026-07-19T08:30:00.000Z",
  label: "MCP tool call",
  tone: "tool",
  itemType: "mcp_tool_call",
  detail: `t3team_send_message: {"to_thread_id":"${PARENT_ID}","text":"done"}`,
  ...overrides,
});

describe("deriveActorOutboundRelations", () => {
  it("reads the parent id from the thread's own handoff.created activity", () => {
    const relations = deriveActorOutboundRelations([
      activity("t3team.handoff.created", {
        parentThreadId: PARENT_ID,
        parentTitle: "Parent",
        childThreadId: "me",
        childTitle: "Me",
      }),
    ]);
    expect(relations.parentThreadId).toBe(PARENT_ID);
    expect(relations.childTitles.size).toBe(0);
  });

  it("collects direct children with titles from handoff.started activities", () => {
    const relations = deriveActorOutboundRelations([
      activity("t3team.handoff.started", {
        parentThreadId: "me",
        childThreadId: CHILD_A_ID,
        childTitle: "Child A",
      }),
      activity("t3team.handoff.started", {
        parentThreadId: "me",
        childThreadId: CHILD_B_ID,
        childTitle: "Child B",
      }),
    ]);
    expect(relations.parentThreadId).toBeNull();
    expect(relations.childTitles.get(CHILD_A_ID)).toBe("Child A");
    expect(relations.childTitles.get(CHILD_B_ID)).toBe("Child B");
  });

  it("ignores workflow-owned handoffs for the parent relation (server parity)", () => {
    const relations = deriveActorOutboundRelations([
      activity("t3team.handoff.created", {
        workflowRunId: "wf-1",
        parentThreadId: PARENT_ID,
        childThreadId: "me",
        childTitle: "Me",
      }),
    ]);
    expect(relations.parentThreadId).toBeNull();
  });

  it("returns empty relations without activities", () => {
    const relations = deriveActorOutboundRelations(undefined);
    expect(relations.parentThreadId).toBeNull();
    expect(relations.childTitles.size).toBe(0);
  });
});

describe("isActorOutboundSendMessageEntry", () => {
  it("detects the persisted detail prefix with the bare tool name", () => {
    expect(isActorOutboundSendMessageEntry(sendEntry())).toBe(true);
  });

  it("detects the provider-prefixed MCP tool name in the detail", () => {
    expect(
      isActorOutboundSendMessageEntry(
        sendEntry({ detail: `mcp__t3team__t3team_send_message: {"to_thread_id":"${PARENT_ID}"}` }),
      ),
    ).toBe(true);
  });

  it("detects the structured item name on toolData", () => {
    expect(
      isActorOutboundSendMessageEntry({
        label: "MCP tool call",
        toolData: { name: "t3team_send_message" },
      }),
    ).toBe(true);
  });

  it("does not match unrelated tool calls", () => {
    expect(
      isActorOutboundSendMessageEntry(
        sendEntry({ detail: 'mcp__t3team__t3team_search_thread: {"query":"x"}' }),
      ),
    ).toBe(false);
    expect(isActorOutboundSendMessageEntry(sendEntry({ detail: "Read File: /src/x.ts" }))).toBe(
      false,
    );
  });
});

describe("extractActorOutboundTargetThreadId", () => {
  it("prefers the structured input on the item", () => {
    expect(
      extractActorOutboundTargetThreadId(
        sendEntry({
          toolData: { name: "t3team_send_message", input: { to_thread_id: CHILD_A_ID } },
        }),
      ),
    ).toBe(CHILD_A_ID);
  });

  it("falls back to the to_thread_id argument in the persisted detail JSON", () => {
    expect(extractActorOutboundTargetThreadId(sendEntry())).toBe(PARENT_ID);
  });

  it("returns null when the target is not persisted", () => {
    expect(
      extractActorOutboundTargetThreadId(sendEntry({ detail: "t3team_send_message: [truncated]" })),
    ).toBe(null);
  });
});

describe("describeActorOutboundSend", () => {
  const parentRelations = deriveActorOutboundRelations([
    activity("t3team.handoff.created", {
      parentThreadId: PARENT_ID,
      childThreadId: "me",
      childTitle: "Me",
    }),
  ]);

  const childRelations = deriveActorOutboundRelations([
    activity("t3team.handoff.started", {
      childThreadId: CHILD_A_ID,
      childTitle: "Child A",
    }),
    activity("t3team.handoff.started", {
      childThreadId: CHILD_B_ID,
      childTitle: "Child B",
    }),
  ]);

  it("names the parent when the target is this thread's parent", () => {
    expect(describeActorOutboundSend(sendEntry(), parentRelations)).toBe("Sent message to parent");
  });

  it("names the child by title when the target is a direct child", () => {
    const entry = sendEntry({
      detail: `t3team_send_message: {"to_thread_id":"${CHILD_B_ID}","text":"hi"}`,
    });
    expect(describeActorOutboundSend(entry, childRelations)).toBe("Sent message to «Child B»");
  });

  it("falls back to a factual, unguessed label for unknown targets", () => {
    expect(describeActorOutboundSend(sendEntry(), childRelations)).toBe(
      "Sent message to another thread",
    );
    // Unknown target id (detail truncated) is never guessed:
    expect(
      describeActorOutboundSend(
        sendEntry({ detail: "t3team_send_message: [truncated]" }),
        parentRelations,
      ),
    ).toBe("Sent message to another thread");
  });

  it("returns null for entries that are not outbound sends", () => {
    expect(
      describeActorOutboundSend(sendEntry({ detail: "Read File: /src/x.ts" }), parentRelations),
    ).toBeNull();
  });
});
