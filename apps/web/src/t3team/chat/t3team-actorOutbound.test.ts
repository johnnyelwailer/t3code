import { describe, expect, it } from "vite-plus/test";
import { ThreadId } from "@t3tools/contracts";

import type { WorkLogEntry } from "~/session-logic";
import { makeLiveThreadShell } from "~/t3team/hooks/t3team-threadBridge.testSupport";

import {
  describeActorOutboundSend,
  deriveActorOutboundRelations,
  extractActorOutboundTargetThreadId,
  isActorOutboundSendMessageEntry,
} from "./t3team-actorOutbound";

function shell(id: string, title: string, parent: string | null = null) {
  return makeLiveThreadShell({
    id: ThreadId.make(id),
    title,
    lineage: {
      rootThreadId: ThreadId.make(parent ?? id),
      parentThreadId: parent === null ? null : ThreadId.make(parent),
      relationshipToParent: parent === null ? null : "subagent",
    },
  });
}

const PARENT_ID = "parent-thread";
const CHILD_A_ID = "child-a-thread";
const CHILD_B_ID = "child-b-thread";

const sendEntry = (overrides: Partial<WorkLogEntry> = {}): WorkLogEntry => ({
  id: "work-send-1",
  createdAt: "2026-07-19T08:30:00.000Z",
  label: "MCP tool call",
  tone: "tool",
  itemType: "dynamic_tool",
  detail: `t3team_send_message: {"to_thread_id":"${PARENT_ID}","text":"done"}`,
  ...overrides,
});

describe("deriveActorOutboundRelations", () => {
  it("reads the parent from the thread's own subagent lineage", () => {
    const me = shell("me", "Me", PARENT_ID);
    const relations = deriveActorOutboundRelations({ thread: me, threads: [me] });
    expect(relations.parentThreadId).toBe(PARENT_ID);
    expect(relations.childTitles.size).toBe(0);
  });

  it("collects direct children with titles from the shells that name it as parent", () => {
    const me = shell("me", "Me");
    const relations = deriveActorOutboundRelations({
      thread: me,
      threads: [
        me,
        shell(CHILD_A_ID, "Child A", "me"),
        shell(CHILD_B_ID, "Child B", "me"),
        shell("grandchild", "Grandchild", CHILD_A_ID),
      ],
    });
    expect(relations.parentThreadId).toBeNull();
    expect([...relations.childTitles]).toEqual([
      [CHILD_A_ID, "Child A"],
      [CHILD_B_ID, "Child B"],
    ]);
  });

  it("returns empty relations without a thread", () => {
    const relations = deriveActorOutboundRelations({ thread: null, threads: [] });
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
  const me = shell("me", "Me", PARENT_ID);
  const parentRelations = deriveActorOutboundRelations({ thread: me, threads: [me] });
  const root = shell("me", "Me");
  const childRelations = deriveActorOutboundRelations({
    thread: root,
    threads: [shell(CHILD_A_ID, "Child A", "me"), shell(CHILD_B_ID, "Child B", "me")],
  });

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
